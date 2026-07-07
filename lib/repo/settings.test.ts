// Instellingen-repository: allowlist (add/remove/isAllowed + normalisatie + dedup),
// app-instellingen (round-trip van scalar + object) en de LLM-verbruiksteller (alleen de
// huidige maand telt). Draait op de PGlite-testdatabase met exact dezelfde migraties als Neon.
import { expect, test } from "vitest";
import { createTestDb } from "@/db/test-db";
import { llmUsage } from "@/db/schema";
import {
  addAllowedEmail,
  getLlmSpend,
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
