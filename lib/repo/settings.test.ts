// Instellingen-repository: allowlist (add/remove/isAllowed + normalisatie + dedup),
// app-instellingen (round-trip van scalar + object) en de LLM-verbruiksteller (alleen de
// huidige maand telt). Draait op de PGlite-testdatabase met exact dezelfde migraties als Neon.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/test-db";
import { session, user } from "@/db/auth-schema";
import { events, llmUsage } from "@/db/schema";
import {
  addAllowedEmail,
  getLlmSpend,
  getLlmSpendByPurpose,
  getSetting,
  isAllowed,
  listAllowedEmails,
  removeAllowedEmail,
  setSetting,
} from "@/lib/repo/settings";

// Migratie 0004 seedt twee adressen; daar bouwen de tests op voort.
const SEEDED = ["hello@noplasticfloralfoam.com", "timo@jouwainstein.com"];

test("allowlist: toevoegen, controleren en verwijderen", async () => {
  const db = await createTestDb();

  // Seed-adressen staan er al in en zijn toegestaan.
  expect(await isAllowed(db, "hello@noplasticfloralfoam.com")).toBe(true);
  const seeded = await listAllowedEmails(db);
  expect(seeded.map((r) => r.email).sort()).toEqual([...SEEDED].sort());

  // Onbekend adres is niet toegestaan (fail-closed).
  expect(await isAllowed(db, "vreemde@extern.nl")).toBe(false);

  // Toevoegen → toegestaan, en zichtbaar in de lijst.
  const added = await addAllowedEmail(db, "eduard@brink.nl", "timo");
  expect(added?.email).toBe("eduard@brink.nl");
  expect(added?.addedBy).toBe("timo");
  expect(await isAllowed(db, "eduard@brink.nl")).toBe(true);
  expect(await listAllowedEmails(db)).toHaveLength(3);

  // Verwijderen → niet meer toegestaan.
  await removeAllowedEmail(db, "eduard@brink.nl");
  expect(await isAllowed(db, "eduard@brink.nl")).toBe(false);
  expect(await listAllowedEmails(db)).toHaveLength(2);
});

test("allowlist: normalisatie (trim + lowercase) en dedup", async () => {
  const db = await createTestDb();

  await addAllowedEmail(db, "  Nieuw@Brink.NL  ");
  // Genormaliseerd opgeslagen…
  expect(await isAllowed(db, "nieuw@brink.nl")).toBe(true);
  // …en herkenbaar ongeacht hoofdletters/spaties bij het checken.
  expect(await isAllowed(db, "  NIEUW@brink.nl ")).toBe(true);

  // Dezelfde entiteit opnieuw toevoegen maakt geen duplicaat.
  const dup = await addAllowedEmail(db, "NIEUW@BRINK.NL");
  expect(dup).toBeNull();
  expect(
    (await listAllowedEmails(db)).filter((r) => r.email === "nieuw@brink.nl"),
  ).toHaveLength(1);

  // Leeg adres wordt genegeerd.
  expect(await addAllowedEmail(db, "   ")).toBeNull();
  expect(await isAllowed(db, "")).toBe(false);
});

// ── B2 (reviewzwerm 2.5a): verwijderen = toegang intrekken ───────────────────
// `isAllowed` wordt alleen bij het AANVRAGEN van een magic link getoetst; daarna
// kijkt `requireSession()` de lijst nooit meer na. Better Auth's sessie loopt 7
// dagen en vernieuwt rollend, dus wie verwijderd werd hield tot een week toegang —
// en wie wekelijks inlogt onbeperkt. `removeAllowedEmail` ruimt daarom nu ook de
// sessierijen van dat adres op.
async function seedUserMetSessie(db: TestDb, email: string, id: string) {
  await db.insert(user).values({ id, name: id, email });
  await db.insert(session).values({
    id: `sess-${id}`,
    userId: id,
    token: `tok-${id}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
}

test("B2: adres verwijderen wist de lopende sessie van dát adres — en laat andere sessies staan", async () => {
  const db = await createTestDb();
  await addAllowedEmail(db, "extern@partner.nl");
  await addAllowedEmail(db, "blijft@brink.nl");
  await seedUserMetSessie(db, "extern@partner.nl", "u-extern");
  await seedUserMetSessie(db, "blijft@brink.nl", "u-blijft");
  expect(await db.select().from(session)).toHaveLength(2);

  const { sessionsRevoked } = await removeAllowedEmail(
    db,
    "extern@partner.nl",
    "timo@brink.nl",
  );

  // De sessie van het verwijderde adres is weg…
  expect(sessionsRevoked).toBe(1);
  const over = await db.select().from(session);
  expect(over).toHaveLength(1);
  // …en die van een ánder adres staat er nog (niemand anders wordt uitgelogd).
  expect(over[0].userId).toBe("u-blijft");
  expect(await isAllowed(db, "extern@partner.nl")).toBe(false);
  expect(await isAllowed(db, "blijft@brink.nl")).toBe(true);
});

test("B2: hoofdletters/spaties in het adres blokkeren het intrekken niet", async () => {
  const db = await createTestDb();
  await addAllowedEmail(db, "extern@partner.nl");
  // Better Auth schrijft `user.email` zelf; ons schema belooft geen lowercase,
  // dus de vergelijking gaat via lower() aan beide kanten.
  await seedUserMetSessie(db, "Extern@Partner.NL", "u-extern");

  const { sessionsRevoked } = await removeAllowedEmail(db, "  EXTERN@partner.nl ");
  expect(sessionsRevoked).toBe(1);
  expect(await db.select().from(session)).toHaveLength(0);
});

// ── B7: de schrijfactie draagt de actor en laat een spoor na ─────────────────
test("B7: adres verwijderen logt een event mét actor en het aantal ingetrokken sessies", async () => {
  const db = await createTestDb();
  await addAllowedEmail(db, "extern@partner.nl");
  await seedUserMetSessie(db, "extern@partner.nl", "u-extern");

  await removeAllowedEmail(db, "Extern@Partner.nl ", "timo@brink.nl");

  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "allowed_email_removed"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].actor).toBe("timo@brink.nl");
  expect(gelogd[0].payload).toEqual({
    email: "extern@partner.nl", // genormaliseerd, zoals de rij zelf
    sessionsRevoked: 1,
  });
});

// B7-herstel (reviewzwerm 2.5a): een event beschrijft een handeling die gebeurde.
// `removeAllowedEmail` controleerde alleen op een lege string, nooit of de rij
// bestond — een POST met een willekeurig adres schreef daardoor een
// `allowed_email_removed` over een verwijdering die niet plaatsvond. De twee andere
// destructieve schrijfacties (deleteSpecLine, removeMembership) keerden hier al
// vroeg terug; deze niet.
test("B7: een adres dat niet op de lijst staat verwijderen logt NIETS en trekt niets in", async () => {
  const db = await createTestDb();
  // Een oud-gebruiker met een lopende sessie wiens adres al van de lijst af is:
  // de tweede verwijderpoging mag geen tweede spoor achterlaten.
  await seedUserMetSessie(db, "bestaat-niet@nergens.nl", "u-weg");

  const uitkomst = await removeAllowedEmail(
    db,
    "bestaat-niet@nergens.nl",
    "timo@brink.nl",
  );

  // Retourcontract blijft { sessionsRevoked } — aanroepers rekenen daarop.
  expect(uitkomst).toEqual({ sessionsRevoked: 0 });
  expect(
    await db.select().from(events).where(eq(events.action, "allowed_email_removed")),
  ).toHaveLength(0);
  // De seed-adressen staan er nog, en er is niemand uitgelogd op verdenking.
  expect(await listAllowedEmails(db)).toHaveLength(2);
  expect(await db.select().from(session)).toHaveLength(1);
});

test("B7: normalisatie blijft gelden — 'Timo@X ' vindt de rij 'timo@x' wél en logt wél", async () => {
  const db = await createTestDb();
  await addAllowedEmail(db, "extern@partner.nl");

  // Hoofdletters/spaties mogen de bestaanscontrole niet laten falen: dan zou de
  // fix van hierboven een échte verwijdering stilzwijgend overslaan.
  const uitkomst = await removeAllowedEmail(db, "  EXTERN@Partner.NL ", "timo");
  expect(uitkomst).toEqual({ sessionsRevoked: 0 });
  expect(await isAllowed(db, "extern@partner.nl")).toBe(false);
  expect(
    await db.select().from(events).where(eq(events.action, "allowed_email_removed")),
  ).toHaveLength(1);
});

test("app-instellingen: round-trip van scalar en object, met upsert", async () => {
  const db = await createTestDb();

  // Onbekende sleutel → null.
  expect(await getSetting(db, "llm_budget_eur")).toBeNull();

  // Getal (maandcap) round-trip.
  await setSetting(db, "llm_budget_eur", 50);
  expect(await getSetting<number>(db, "llm_budget_eur")).toBe(50);

  // Overschrijven (upsert op key) → nieuwe waarde, geen tweede rij.
  await setSetting(db, "llm_budget_eur", 75);
  expect(await getSetting<number>(db, "llm_budget_eur")).toBe(75);

  // Tekst (XIS-omgeving) round-trip.
  await setSetting(db, "xis_environment", "sandbox");
  expect(await getSetting<string>(db, "xis_environment")).toBe("sandbox");

  // Object round-trip.
  await setSetting(db, "xis", { environment: "productie", keySet: true });
  expect(await getSetting(db, "xis")).toEqual({
    environment: "productie",
    keySet: true,
  });
});

test("LLM-verbruik: telt alleen de huidige kalendermaand", async () => {
  const db = await createTestDb();

  // Leeg → 0.
  expect(await getLlmSpend(db)).toBe(0);

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);

  await db.insert(llmUsage).values([
    { purpose: "import", costEur: "1.2500", createdAt: thisMonth },
    { purpose: "zoek-fallback", costEur: "0.7500", createdAt: thisMonth },
    { purpose: "verrijking", costEur: "9.9900", createdAt: lastMonth },
  ]);

  // 1.25 + 0.75 = 2.00 (de rij van vorige maand telt niet mee).
  expect(await getLlmSpend(db, now)).toBeCloseTo(2.0, 4);
});

// UX-audit 30 jul (bug #10): het scherm vroeg twee vaste doelen op ('vangnet', 'ocr') en
// liet de rest stil in het totaal zitten — "€ 2,40 besteed" met € 0,33 verklaard. Deze
// test pint de invariant die dat onmogelijk maakt: de uitsplitsing sómmeert tot de teller.
test("LLM-verbruik: de uitsplitsing per doel telt op tot het maandtotaal", async () => {
  const db = await createTestDb();

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);

  await db.insert(llmUsage).values([
    { purpose: "vangnet", costEur: "0.2300", createdAt: thisMonth },
    { purpose: "ocr", costEur: "0.1000", createdAt: thisMonth },
    // Het doel dat eerder onzichtbaar bleef.
    { purpose: "leesroute", costEur: "2.0700", createdAt: thisMonth },
    { purpose: "leesroute", costEur: "5.0000", createdAt: lastMonth },
  ]);

  const rows = await getLlmSpendByPurpose(db, now);
  expect(rows.map((r) => r.purpose)).toEqual(["leesroute", "vangnet", "ocr"]);
  const listed = rows.reduce((sum, r) => sum + r.eur, 0);
  expect(listed).toBeCloseTo(await getLlmSpend(db, now), 4);
  expect(listed).toBeCloseTo(2.4, 4);
});

test("LLM-verbruik: zonder rijen is de uitsplitsing leeg, niet undefined", async () => {
  const db = await createTestDb();
  expect(await getLlmSpendByPurpose(db)).toEqual([]);
});
