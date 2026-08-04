// B7 (reviewzwerm 2.5a): `removeMembership` was de destructieve tegenhanger van
// `addMembership` zonder event en zonder actor — iemand kon uit een organisatie
// verdwijnen zonder spoor van wie het deed of welke rollen hij droeg. Deze test pint
// de spiegeling: loggen VÓÓR het deleten, mét de rollen van het lid.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { events, memberships, organizations } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  addMembership,
  countMembers,
  createOrganization,
  deleteOrganization,
  removeMembership,
  setOrgSeatLimit,
  STANDAARD_ZETELS,
} from "@/lib/repo/orgs";

const ACTOR = "timo@brink.nl";

test("removeMembership: event mét actor, adres en de rollen die het lid had", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Aannemer Zuid" });
  await addMembership(db, {
    orgId: org.id,
    email: "Eduard@AannemerZuid.NL",
    roles: ["calculator", "projectleider"],
    actor: ACTOR,
  });

  await removeMembership(db, org.id, " EDUARD@aannemerzuid.nl ", ACTOR);

  // Het lid is weg…
  expect(
    await db.select().from(memberships).where(eq(memberships.orgId, org.id)),
  ).toHaveLength(0);

  // …en er staat precies één spoor van, met alles wat er verloren ging.
  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_removed"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].entity).toBe("organization");
  expect(gelogd[0].entityId).toBe(org.id);
  expect(gelogd[0].actor).toBe(ACTOR);
  expect(gelogd[0].payload).toEqual({
    email: "eduard@aannemerzuid.nl", // genormaliseerd, zoals de rij zelf
    roles: ["calculator", "projectleider"],
  });
});

test("removeMembership: een lid dat er niet is levert geen event op", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Bouw Noord" });
  await removeMembership(db, org.id, "niemand@bouwnoord.nl", ACTOR);
  expect(
    await db.select().from(events).where(eq(events.action, "membership_removed")),
  ).toHaveLength(0);
});

// ── Sprint 3.2c: het type en de zetellimiet ────────────────────────────────────

test("besluit 3 + G42: createOrganization maakt ALTIJD een externe organisatie", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "De Vries Installaties" });

  // Niet "meestal extern via de kolomdefault" maar altijd, want het is geen parameter.
  // Aan dit veld hangt of iemand inkoopprijzen ziet (lib/repo/prijszicht.ts); een
  // organisatie die per ongeluk 'intern' is, is een prijslek.
  expect(org.type).toBe("extern");

  // De enige interne organisatie is en blijft die uit migratie 0019.
  const intern = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.type, "intern"));
  expect(intern.map((o) => o.slug)).toEqual(["brink-licht"]);

  // En het type staat in het spoor — anders is achteraf niet te zien wát er is gemaakt.
  const [gelogd] = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_created"));
  expect(gelogd.payload).toMatchObject({ type: "extern" });
});

test("besluit 6: zonder opgave krijgt een nieuwe organisatie de standaard-zetellimiet, niet 'onbeperkt'", async () => {
  const db = await createTestDb();

  const standaard = await createOrganization(db, { name: "Zonder Opgave" });
  expect(standaard.seatLimit).toBe(STANDAARD_ZETELS);

  // Expliciet gekozen wint.
  const gekozen = await createOrganization(db, {
    name: "Met Opgave",
    seatLimit: 12,
  });
  expect(gekozen.seatLimit).toBe(12);

  // Onbeperkt bestaat nog wél, maar je moet het hardop zeggen (Brink Licht staat zo op
  // productie). Vergeten valt dus de veilige kant op — ijzeren regel 4.
  const onbeperkt = await createOrganization(db, {
    name: "Onbeperkt",
    seatLimit: null,
  });
  expect(onbeperkt.seatLimit).toBeNull();
});

test("besluit 6: een volle organisatie neemt er niemand meer bij — en zegt dat met false", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Twee Plekken", seatLimit: 2 });

  expect(
    await addMembership(db, { orgId: org.id, email: "een@x.nl", roles: [] }),
  ).toBe(true);
  expect(
    await addMembership(db, { orgId: org.id, email: "twee@x.nl", roles: [] }),
  ).toBe(true);
  // Vol.
  expect(
    await addMembership(db, { orgId: org.id, email: "drie@x.nl", roles: [] }),
  ).toBe(false);
  expect(await countMembers(db, org.id)).toBe(2);

  // Geen rij, dus ook geen event: er is niets gebeurd, en dat hoort het spoor te zeggen.
  const toegevoegd = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_added"));
  expect(toegevoegd).toHaveLength(2);

  // ⚠️ Een BESTAAND lid mag wél bijgewerkt worden in een volle organisatie. Zonder deze
  // uitzondering zou "vergeten wachtwoord = nieuwe PIN" (C10) juist stuklopen op het
  // moment dat iemand er al in zit — de uitgifte schrijft dan een membership-upsert.
  expect(
    await addMembership(db, {
      orgId: org.id,
      email: "een@x.nl",
      roles: ["calculator"],
    }),
  ).toBe(true);
  const [lid] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.email, "een@x.nl"));
  expect(lid.roles).toEqual(["calculator"]);

  // En zodra er een plek vrijkomt, kan de volgende er wél bij.
  await removeMembership(db, org.id, "twee@x.nl", ACTOR);
  expect(
    await addMembership(db, { orgId: org.id, email: "drie@x.nl", roles: [] }),
  ).toBe(true);
});

test("besluit 6: een organisatie zonder limiet houdt niemand tegen", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Onbeperkt", seatLimit: null });
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    expect(
      await addMembership(db, { orgId: org.id, email: `n${n}@x.nl`, roles: [] }),
    ).toBe(true);
  }
  expect(await countMembers(db, org.id)).toBe(7);
});

/**
 * ⚠️ DE TELLING MOET VERS ZIJN OP HET MOMENT VAN SCHRIJVEN. Deze codebase heeft die fout
 * al eens gemaakt (de pogingenteller in `checkActivationPin`, waar 200 parallelle gokken
 * alle 200 werden beoordeeld omdat elke aanroep dezelfde stale teller las). Sequentieel
 * aftellen kan dat per constructie niet vangen — daarom hier parallel.
 *
 * De lat: bij een limiet van 3 en tien gelijktijdige uitnodigingen staan er ná afloop
 * hooguit 3 leden, en het aantal `true`-antwoorden is gelijk aan het aantal rijen. Dat
 * tweede is het echte punt: een `true` die geen rij oplevert (of andersom) is precies het
 * misverstand waarmee de aanroeper denkt dat iemand toegang heeft terwijl dat niet zo is.
 */
test("besluit 6: tien gelijktijdige uitnodigingen op drie plekken — de telling telt", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Drie Plekken", seatLimit: 3 });

  const uitslagen = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      addMembership(db, { orgId: org.id, email: `p${i}@x.nl`, roles: [] }),
    ),
  );

  const geslaagd = uitslagen.filter(Boolean).length;
  const leden = await countMembers(db, org.id);
  expect(geslaagd).toBe(leden);
  expect(leden).toBeLessThanOrEqual(3);
  // En het moet er wél echt drie zijn geworden: een limiet die per ongeluk álles weigert
  // zou de assertie hierboven óók halen.
  expect(leden).toBe(3);
});

test("besluit 7: setOrgSeatLimit raakt alleen de limiet — het type blijft staan (G42)", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Groeier", seatLimit: 1 });

  await setOrgSeatLimit(db, { orgId: org.id, seatLimit: 9, actor: ACTOR });

  const [na] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.id));
  expect(na.seatLimit).toBe(9);
  expect(na.type).toBe("extern");
  expect(na.name).toBe("Groeier");
  expect(na.plan).toBe(org.plan);

  const [gelogd] = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_seat_limit_changed"));
  expect(gelogd.actor).toBe(ACTOR);
  expect(gelogd.payload).toEqual({ seatLimit: 9 });
});

test("besluit 5: deleteOrganization logt vóór het wissen en neemt de leden mee", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Mislukte Poging" });
  await addMembership(db, { orgId: org.id, email: "lid@x.nl", roles: [] });

  await deleteOrganization(db, org.id, ACTOR);

  expect(
    await db.select().from(organizations).where(eq(organizations.id, org.id)),
  ).toHaveLength(0);
  // ON DELETE CASCADE: een half aangemaakt lidmaatschap blijft niet achter.
  expect(await countMembers(db, org.id)).toBe(0);

  const [gelogd] = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_deleted"));
  expect(gelogd.actor).toBe(ACTOR);
  // De naam staat in het spoor: ná de delete is niet meer te zien wát er weg is.
  expect(gelogd.payload).toEqual({ name: "Mislukte Poging" });
});
