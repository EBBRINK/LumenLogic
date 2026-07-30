// Activatie-PIN's (C10/G34): de harde lat uit §3a van de sprint-3.1-briefing, punt voor punt.
// Draait op de PGlite-testdatabase met exact dezelfde migraties als Neon — inclusief 0019,
// die activation_pins aanlegt.
//
// Wat hier NIET getest wordt is het wachtwoord en de sessie: die twee wonen in Better Auth
// en staan in lib/auth-activation.test.ts.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { activationPins, memberships, organizations } from "@/db/schema";
import * as authSchema from "@/db/auth-schema";
import {
  PIN_LENGTH,
  PIN_MAX_ATTEMPTS,
  PIN_TTL_DAYS,
  checkActivationPin,
  claimActivationPin,
  generatePin,
  getActivationPinStatus,
  issueActivationPin,
} from "@/lib/repo/activation";

const DAG = 24 * 60 * 60 * 1000;

async function brinkOrgId(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  return org.id;
}

test("PIN is 8 cijfers (G34) en elke keer een andere", async () => {
  const pins = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const pin = generatePin();
    expect(pin).toMatch(/^[0-9]{8}$/);
    expect(pin).toHaveLength(PIN_LENGTH);
    pins.add(pin);
  }
  // 200 trekkingen uit 10^8 mogelijkheden: een botsing is praktisch uitgesloten. Twee
  // dezelfde PIN's hier betekent dat de generator niet uit een CSPRNG put.
  expect(pins.size).toBe(200);
  // Alle tien cijfers moeten voorkomen over 1600 posities — vangt een generator die stil
  // op een deelbereik blijft hangen.
  const gezien = new Set([...pins].join("").split(""));
  expect(gezien.size).toBe(10);
});

// Opdracht B (critic, ronde 2): dit is de énige test die de GETALLEN zelf vastlegt. Alle
// andere tests in dit bestand rekenen met de constanten en blijven dus groen als iemand er
// 5 of 1000 van maakt — de mutant PIN_MAX_ATTEMPTS 10 → 11 overleefde alle 18. Deze drie
// getallen zijn besluiten van Timo (G34, bijgesteld door G38), geen implementatiedetail:
// wie ze wil wijzigen, wijzigt een besluit, en dan hoort deze test rood te worden.
test("de getallen van G34/G38 liggen vast: 8 cijfers, 7 dagen, 10 pogingen", () => {
  expect(PIN_LENGTH).toBe(8);
  expect(PIN_TTL_DAYS).toBe(7);
  expect(PIN_MAX_ATTEMPTS).toBe(10);
});

test("PIN staat gehasht in de database en is nergens leesbaar terug te halen", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, {
    email: "Installateur@Extern.NL",
    actor: "eduard",
  });

  const [row] = await db
    .select()
    .from(activationPins)
    .where(eq(activationPins.email, email));

  // Niet de PIN zelf, en ook niet ergens in de hash terug te vinden.
  expect(row.pinHash).not.toBe(pin);
  expect(row.pinHash).not.toContain(pin);
  // Better Auth' scrypt-vorm is `<salt>:<derived key>` — gezouten, dus twee gelijke PIN's
  // geven een andere hash.
  expect(row.pinHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  // Geen enkele kolom draagt de klaartekst.
  expect(JSON.stringify(row)).not.toContain(pin);

  // Het beheeroppervlak geeft de hash niet eens terug: "één keer zichtbaar" is een
  // eigenschap van de API, niet van de discipline van de aanroeper.
  const status = await getActivationPinStatus(db, email);
  expect(status.state).toBe("actief");
  expect(JSON.stringify(status)).not.toContain(pin);
  expect(Object.keys(status)).not.toContain("pinHash");
});

test("e-mail wordt genormaliseerd; de PIN werkt ongeacht hoofdletters of spaties", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, {
    email: "  Installateur@Extern.NL  ",
  });
  expect(email).toBe("installateur@extern.nl");
  expect(await checkActivationPin(db, " INSTALLATEUR@extern.nl ", pin)).toEqual({
    ok: true,
    email: "installateur@extern.nl",
  });
});

test("PIN verloopt na 7 dagen (G34)", async () => {
  const db = await createTestDb();
  const now = new Date("2026-07-30T10:00:00Z");
  const { pin, email, expiresAt } = await issueActivationPin(db, {
    email: "laat@extern.nl",
    now,
  });
  expect(expiresAt.getTime() - now.getTime()).toBe(PIN_TTL_DAYS * DAG);

  // Eén minuut vóór de vervaltijd: nog geldig.
  const netOpTijd = new Date(expiresAt.getTime() - 60_000);
  expect(await checkActivationPin(db, email, pin, netOpTijd)).toEqual({
    ok: true,
    email,
  });
  // Eén minuut ná de vervaltijd: dood, en dat is niet meer te claimen.
  const teLaat = new Date(expiresAt.getTime() + 60_000);
  expect(await checkActivationPin(db, email, pin, teLaat)).toEqual({ ok: false });
  expect(await claimActivationPin(db, email, teLaat)).toBe(false);
  expect((await getActivationPinStatus(db, email, teLaat)).state).toBe("verlopen");
});

test("verkeerde PIN faalt en telt één poging", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "typo@extern.nl" });
  const fout = pin === "00000000" ? "11111111" : "00000000";

  expect(await checkActivationPin(db, email, fout)).toEqual({ ok: false });
  const na = await getActivationPinStatus(db, email);
  expect(na.attempts).toBe(1);
  expect(na.attemptsLeft).toBe(PIN_MAX_ATTEMPTS - 1);
  // De goede PIN werkt daarna gewoon nog, en geeft het tegoed terug: de teller straft
  // alleen fouten.
  expect(await checkActivationPin(db, email, pin)).toEqual({ ok: true, email });
  expect((await getActivationPinStatus(db, email)).attempts).toBe(0);
});

test("een PIN met een verkeerde vorm wordt geweigerd zonder de teller aan te raken", async () => {
  const db = await createTestDb();
  const { email } = await issueActivationPin(db, { email: "vorm@extern.nl" });

  for (const onzin of ["", "1234567", "123456789", "abcdefgh", "1234 567"]) {
    expect(await checkActivationPin(db, email, onzin)).toEqual({ ok: false });
  }
  // Onzin-invoer kost geen poging: de vormcontrole gaat over wat de béller stuurt, niet
  // over wat er in de database staat, en er wordt geen scrypt voor gedraaid.
  expect((await getActivationPinStatus(db, email)).attempts).toBe(0);
});

test("PARALLEL gokken: hoogstens PIN_MAX_ATTEMPTS pogingen worden beoordeeld (het slot is atomair)", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "parallel@extern.nl" });
  const fout = pin === "00000000" ? "11111111" : "00000000";

  // Dit is de test die sequentieel aftellen per constructie niet kan geven. De vorige
  // versie las de rij, deed ~46 ms scrypt en toetste de teller pas daarná: elke van deze
  // 60 aanroepen las dezelfde stale `attempts` en passeerde de poort. Gemeten op die
  // versie: alle 60 beoordeeld, teller op 60.
  const uitslagen = await Promise.all(
    Array.from({ length: 60 }, () => checkActivationPin(db, email, fout)),
  );
  expect(uitslagen.every((u) => !u.ok)).toBe(true);

  // Precies PIN_MAX_ATTEMPTS slots afgeschreven, geen enkele meer — de rest kwam niet eens tot
  // een verificatie.
  const status = await getActivationPinStatus(db, email);
  expect(status.attempts).toBe(PIN_MAX_ATTEMPTS);
  expect(status.state).toBe("geblokkeerd");

  // En de PIN is daarna dood, ook met de juiste code.
  expect(await checkActivationPin(db, email, pin)).toEqual({ ok: false });
}, 60_000);

test("PARALLEL gokken met de juiste code ertussen: hoogstens één slaagt", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "parallel2@extern.nl" });
  const fout = pin === "00000000" ? "11111111" : "00000000";

  // 40 pogingen, waarvan 4 met de juiste code. Ook als die alle vier een slot krijgen mag
  // de PIN daarna maar één keer verzilverd worden — dat bewaakt claimActivationPin.
  const invoer = Array.from({ length: 40 }, (_, i) => (i % 10 === 0 ? pin : fout));
  const uitslagen = await Promise.all(
    invoer.map((p) => checkActivationPin(db, email, p)),
  );
  const geslaagd = uitslagen.filter((u) => u.ok);
  // Er zijn maar PIN_MAX_ATTEMPTS slots; de juiste code kan er hoogstens dat aantal van pakken.
  expect(geslaagd.length).toBeLessThanOrEqual(PIN_MAX_ATTEMPTS);

  const claims = await Promise.all(
    Array.from({ length: 10 }, () => claimActivationPin(db, email)),
  );
  expect(claims.filter(Boolean).length).toBeLessThanOrEqual(1);
}, 60_000);

test("max PIN_MAX_ATTEMPTS foute pogingen: daarna is de PIN dood, ook mét de juiste code", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "brute@extern.nl" });
  const fout = pin === "00000000" ? "11111111" : "00000000";

  for (let i = 1; i <= PIN_MAX_ATTEMPTS; i++) {
    expect(await checkActivationPin(db, email, fout)).toEqual({ ok: false });
    expect((await getActivationPinStatus(db, email)).attempts).toBe(i);
  }

  // De poging dáárna — met de JUISTE PIN — faalt. Alleen een nieuwe PIN van Brink helpt nog.
  expect(await checkActivationPin(db, email, pin)).toEqual({ ok: false });
  expect(await claimActivationPin(db, email)).toBe(false);
  const status = await getActivationPinStatus(db, email);
  expect(status.state).toBe("geblokkeerd");
  expect(status.attemptsLeft).toBe(0);
  // De teller loopt niet door boven het maximum: een dode PIN neemt geen pogingen meer aan.
  expect(status.attempts).toBe(PIN_MAX_ATTEMPTS);
});

test("PIN is eenmalig: claimen lukt precies één keer", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "eenmalig@extern.nl" });

  expect(await checkActivationPin(db, email, pin)).toEqual({ ok: true, email });
  expect(await claimActivationPin(db, email)).toBe(true);

  // Tweede keer: zowel de claim als de controle weigert.
  expect(await claimActivationPin(db, email)).toBe(false);
  expect(await checkActivationPin(db, email, pin)).toEqual({ ok: false });
  expect((await getActivationPinStatus(db, email)).state).toBe("gebruikt");
});

test("gelijktijdig claimen: precies één van de twee wint", async () => {
  const db = await createTestDb();
  const { email } = await issueActivationPin(db, { email: "race@extern.nl" });
  const uitslagen = await Promise.all([
    claimActivationPin(db, email),
    claimActivationPin(db, email),
  ]);
  expect(uitslagen.filter(Boolean)).toHaveLength(1);
});

test("één actieve PIN per gebruiker: een nieuwe overschrijft de oude, geldig of verlopen", async () => {
  const db = await createTestDb();
  const eerste = await issueActivationPin(db, { email: "nieuw@extern.nl" });

  // Nog geldig, en toch overschreven (C10: vergeten wachtwoord = nieuwe PIN).
  const tweede = await issueActivationPin(db, { email: "nieuw@extern.nl" });
  expect(tweede.pin).not.toBe(eerste.pin);
  expect(await checkActivationPin(db, "nieuw@extern.nl", eerste.pin)).toEqual({
    ok: false,
  });
  expect(await checkActivationPin(db, "nieuw@extern.nl", tweede.pin)).toEqual({
    ok: true,
    email: "nieuw@extern.nl",
  });
  // Precies één rij — geen tweede PIN die er stilletjes naast blijft leven.
  expect(await db.select().from(activationPins)).toHaveLength(1);

  // Een verlopen én half opgebruikte PIN wordt net zo goed overschreven, mét een schone teller.
  const oud = new Date(Date.now() - 30 * DAG);
  const derde = await issueActivationPin(db, { email: "nieuw@extern.nl", now: oud });
  await checkActivationPin(db, "nieuw@extern.nl", "99999999", oud);
  expect((await getActivationPinStatus(db, "nieuw@extern.nl")).state).toBe("verlopen");
  const vierde = await issueActivationPin(db, { email: "nieuw@extern.nl" });
  expect(vierde.pin).not.toBe(derde.pin);
  const status = await getActivationPinStatus(db, "nieuw@extern.nl");
  expect(status.state).toBe("actief");
  expect(status.attempts).toBe(0);
});

test("issueActivationPin maakt de user-rij aan en koppelt hem aan een organisatie", async () => {
  const db = await createTestDb();
  const orgId = await brinkOrgId(db);

  const eerste = await issueActivationPin(db, {
    email: "Stefan@Brinklicht.nl",
    orgId,
    roles: ["werkvoorbereider"],
    actor: "eduard",
  });
  expect(eerste.userCreated).toBe(true);

  const users = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, "stefan@brinklicht.nl"));
  expect(users).toHaveLength(1);
  expect(users[0].name).toBe("stefan");
  // Nog niet geverifieerd: dat gebeurt pas bij het verzilveren van de PIN.
  expect(users[0].emailVerified).toBe(false);

  const leden = await db
    .select()
    .from(memberships)
    .where(eq(memberships.email, "stefan@brinklicht.nl"));
  expect(leden).toHaveLength(1);
  expect(leden[0].orgId).toBe(orgId);
  expect(leden[0].roles).toEqual(["werkvoorbereider"]);

  // Tweede PIN voor hetzelfde adres maakt géén tweede user-rij en géén tweede membership.
  const tweede = await issueActivationPin(db, { email: "stefan@brinklicht.nl", orgId });
  expect(tweede.userCreated).toBe(false);
  expect(
    await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, "stefan@brinklicht.nl")),
  ).toHaveLength(1);
  expect(
    await db.select().from(memberships).where(eq(memberships.email, "stefan@brinklicht.nl")),
  ).toHaveLength(1);
});

test("geen account-enumeratie: onbekend adres geeft hetzelfde antwoord en kost dezelfde tijd", async () => {
  const db = await createTestDb();
  const { pin, email } = await issueActivationPin(db, { email: "bestaat@extern.nl" });
  const fout = pin === "00000000" ? "11111111" : "00000000";

  // Zelfde antwoordvorm bij: onbekend adres, verkeerde PIN, verlopen PIN, gebruikte PIN.
  expect(await checkActivationPin(db, "bestaatniet@extern.nl", fout)).toEqual({ ok: false });
  expect(await checkActivationPin(db, "bestaatniet@extern.nl", pin)).toEqual({ ok: false });
  expect(await checkActivationPin(db, email, fout)).toEqual({ ok: false });
  expect(await checkActivationPin(db, "", fout)).toEqual({ ok: false });

  // Een onbekend adres mag geen snelkoppeling zijn. Warmdraaien (de dummy-hash wordt lui
  // berekend), dan drie metingen per pad en de mediaan vergelijken.
  await checkActivationPin(db, "warm@extern.nl", fout);
  const meet = async (adres: string) => {
    const tijden: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await checkActivationPin(db, adres, fout);
      tijden.push(performance.now() - t0);
    }
    return tijden.sort((a, b) => a - b)[1];
  };
  const onbekend = await meet("bestaatniet@extern.nl");
  const bekend = await meet(email);
  // Tweezijdig. Een eenzijdige ondergrens ("onbekend > bekend * 0,3") kán bijna niet falen:
  // het bekende pad doet een UPDATE méér en is per constructie de tragere, dus die
  // assertie bewijst niets. Hier moet het verschil in BEIDE richtingen klein blijven — een
  // vroege return op het onbekende pad (~1 ms tegen ~46 ms) valt daar hard doorheen.
  const verschil = Math.abs(onbekend - bekend);
  expect(verschil).toBeLessThan(Math.max(onbekend, bekend) * 0.5);
});

test("issueActivationPin weigert een leeg of vormloos adres", async () => {
  const db = await createTestDb();
  await expect(issueActivationPin(db, { email: "   " })).rejects.toThrow(
    /ongeldig e-mailadres/,
  );
  await expect(issueActivationPin(db, { email: "geenapenstaartje" })).rejects.toThrow(
    /ongeldig e-mailadres/,
  );
});

test("issueActivationPin: onbekende organisatie faalt met een leesbare fout en laat geen spookgebruiker achter", async () => {
  const db = await createTestDb();
  await expect(
    issueActivationPin(db, {
      email: "spook@extern.nl",
      orgId: "00000000-0000-4000-8000-000000000000",
    }),
  ).rejects.toThrow(/onbekende organisatie/);

  // Er is niets geschreven: geen user-rij, geen membership, geen PIN. De volgende poging
  // met een geldige org herkent het adres dus nog steeds als nieuw.
  expect(
    await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, "spook@extern.nl")),
  ).toHaveLength(0);
  expect((await getActivationPinStatus(db, "spook@extern.nl")).state).toBe("geen");

  const goed = await issueActivationPin(db, {
    email: "spook@extern.nl",
    orgId: await brinkOrgId(db),
  });
  expect(goed.userCreated).toBe(true);
});

test("issueActivationPin: twee gelijktijdige uitgiftes voor hetzelfde nieuwe adres botsen niet", async () => {
  const db = await createTestDb();
  const orgId = await brinkOrgId(db);

  // Zonder onConflictDoNothing lekt hier een rauwe unique-violation op user.email naar
  // buiten, die een server action als 500 doorgeeft.
  const [a, b] = await Promise.all([
    issueActivationPin(db, { email: "gelijk@extern.nl", orgId }),
    issueActivationPin(db, { email: "gelijk@extern.nl", orgId }),
  ]);
  expect(a.email).toBe("gelijk@extern.nl");
  expect(b.email).toBe("gelijk@extern.nl");
  // Precies één van de twee heeft de user-rij daadwerkelijk gemaakt.
  expect([a.userCreated, b.userCreated].filter(Boolean)).toHaveLength(1);
  expect(
    await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, "gelijk@extern.nl")),
  ).toHaveLength(1);
  // Eén PIN-rij, en één van de twee uitgegeven PIN's is de geldige.
  expect(await db.select().from(activationPins)).toHaveLength(1);
  const werkend = await Promise.all([
    checkActivationPin(db, "gelijk@extern.nl", a.pin),
    checkActivationPin(db, "gelijk@extern.nl", b.pin),
  ]);
  expect(werkend.filter((u) => u.ok)).toHaveLength(1);
});

test("status van een adres zonder PIN is 'geen'", async () => {
  const db = await createTestDb();
  const status = await getActivationPinStatus(db, "niemand@extern.nl");
  expect(status.state).toBe("geen");
  expect(status.expiresAt).toBeNull();
  expect(status.attemptsLeft).toBe(PIN_MAX_ATTEMPTS);
});
