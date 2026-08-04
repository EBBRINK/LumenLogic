// Sprint 3.2c gemeten aan de ÉCHTE server-actions op /admin/users, niet aan een kopie van
// de regels en niet aan het scherm. Zelfde vorm en zelfde harnas als
// `issue-pin-authz.test.ts` hiernaast: elke aanroep hieronder is een kale aanroep zónder
// formulier, zoals een aanvaller of een verkeerd gebouwde client hem doet.
//
// Wat hier bewezen wordt, besluit voor besluit (Timo, 4 aug):
//   2. Alleen intern maakt organisaties aan — een externe org_admin komt sinds 3.2a wél op
//      deze route, maar niet aan deze twee actions.
//   3. Via het scherm ontstaat uitsluitend een EXTERNE organisatie; er is geen invoerveld
//      waarmee je er 'intern' van maakt, ook niet als je het meestuurt.
//   4. Beide werkwijzen: los aanmaken (a) en in één klik aanmaken + PIN uitgeven (b).
//   5. Die één-klik-variant is alles-of-niets, óók als de PIN halverwege stukloopt.
//   6. De zetellimiet houdt werkelijk iemand tegen, met een melding die zegt wat je moet doen.
//   7. En is daarna in Admin te verhogen, waarna dezelfde uitgifte wél lukt.
//   9. G42: geen enkele weg om het type van een bestaande organisatie te veranderen.
import { expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import {
  activationPins,
  events,
  memberships,
  organizations,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { addMembership, createOrganization } from "@/lib/repo/orgs";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "intern@brinklicht.nl",
  /**
   * Foutinjectie voor besluit 5. Staat deze op de PIN-tabel, dan gooit de insert die
   * `issueActivationPin()` als láátste doet — precies de mislukking waarvoor de
   * compensatie in `createOrgAndIssuePinAsActor()` bestaat. Zonder zo'n injectie is die
   * tak onbereikbaar voor een interne actor (hij mág alles), en dan zou "alles-of-niets"
   * alleen getest zijn op de gevallen die de droogloop al vóór de database afvangt.
   */
  breekTabel: null as unknown,
}));

vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        if (typeof waarde !== "function") return waarde;
        const gebonden = (waarde as (...args: unknown[]) => unknown).bind(echt);
        if (prop !== "insert" || harnas.breekTabel === null) return gebonden;
        return (...args: unknown[]) => {
          if (args[0] === harnas.breekTabel) {
            throw new Error("gesimuleerde storing bij het schrijven van de PIN");
          }
          return gebonden(...args);
        };
      },
    },
  ),
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { email: harnas.email } }),
  requireSession: async () => ({ user: { email: harnas.email } }),
  getActor: async () => harnas.email,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { createOrgAction, issuePinAction, setSeatLimitAction } = await import(
  "./actions"
);

async function opzet() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  harnas.breekTabel = null;
  const [intern] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  const klant = await createOrganization(db, { name: "Installatiebedrijf A" });
  // De interne actor: lid van de org met type 'intern' (G31/G36 regel 1), bewust zónder rol.
  await addMembership(db, {
    orgId: intern.id,
    email: "intern@brinklicht.nl",
    roles: [],
  });
  await addMembership(db, {
    orgId: klant.id,
    email: "beheerder-a@extern.nl",
    roles: ["org_admin"],
  });
  return { db, internOrgId: intern.id, klant: klant.id };
}

function alsActor(email: string) {
  harnas.email = email;
}

async function orgNamen(db: TestDb): Promise<string[]> {
  return (await db.select({ name: organizations.name }).from(organizations)).map(
    (o) => o.name,
  );
}

async function orgOpNaam(db: TestDb, name: string) {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, name));
  return row ?? null;
}

/**
 * De route-poort weigert met `notFound()` — wie er niet bij mag, hoort niet te weten dát de
 * route bestaat. Zelfde helper als in issue-pin-authz.test.ts; hij staat hier opnieuw omdat
 * dat bestand hem niet exporteert en een gedeelde helper tussen twee testbestanden een
 * afhankelijkheid maakt van iets dat geen contract is.
 */
async function weigertBijDeDeur(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(digest)) return;
    throw e;
  }
  throw new Error(
    "de action liep door zonder 404 — de poort op niveau `intern` staat open",
  );
}

// ── Besluit 2: alleen intern maakt organisaties aan ────────────────────────────

test("besluit 2: een externe org_admin komt wél op dit scherm, maar maakt geen organisatie aan", async () => {
  const { db, klant } = await opzet();
  const voor = await orgNamen(db);
  alsActor("beheerder-a@extern.nl");

  // Hij mag hier wél PIN's uitgeven (G36 geeft hem dat recht, en dát is waarom de route op
  // niveau `org_admin` staat) — maar niet dit.
  await weigertBijDeDeur(() => createOrgAction({ name: "Eigen BV" }));
  await weigertBijDeDeur(() =>
    setSeatLimitAction({ orgId: klant, seatLimit: 999 }),
  );
  // En ook niet via de één-klik-variant, die langs een andere action loopt.
  const eenKlik = await issuePinAction({
    email: "nieuw@extern.nl",
    newOrg: { name: "Sluiproute BV" },
  });
  expect(eenKlik.ok).toBe(false);

  expect(await orgNamen(db)).toEqual(voor);
  // Zijn eigen zetellimiet is niet omhoog gegaan: een beheerder die zichzelf plekken kan
  // bijkopen, heeft geen limiet.
  const [eigen] = await db
    .select({ seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, klant));
  expect(eigen.seatLimit).toBe(5);
});

// ── Besluit 3 + 4a: los aanmaken, altijd extern ────────────────────────────────

test("besluit 4a: intern maakt een organisatie los aan — extern, met de gekozen zetellimiet", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  const uitslag = await createOrgAction({
    name: "De Vries Installaties",
    plan: "abonnement",
    seatLimit: 8,
  });
  expect(uitslag.ok).toBe(true);

  const org = await orgOpNaam(db, "De Vries Installaties");
  expect(org).not.toBeNull();
  expect(org!.type).toBe("extern");
  expect(org!.plan).toBe("abonnement");
  expect(org!.seatLimit).toBe(8);
  // Los aanmaken betekent: nog geen lid, nog geen PIN. Dat is de hele bedoeling van 4a —
  // alvast klaarzetten.
  expect(
    await db.select().from(memberships).where(eq(memberships.orgId, org!.id)),
  ).toHaveLength(0);
});

test("besluit 3: er is geen invoer waarmee je er een INTERNE organisatie van maakt", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  // De action typeert deze velden niet, dus ze horen er per definitie niet in — precies
  // zoals iemand ze wél zou meesturen als hij de kolom kende. `type = 'intern'` betekent
  // volgens G36-regel 1 almachtig én volledig prijszicht.
  const verzoek = {
    name: "Trojaans Paard",
    type: "intern",
    orgType: "intern",
    organizations: { type: "intern" },
  };
  const uitslag = await createOrgAction(
    verzoek as unknown as Parameters<typeof createOrgAction>[0],
  );
  expect(uitslag.ok).toBe(true);

  expect((await orgOpNaam(db, "Trojaans Paard"))!.type).toBe("extern");
  // En er is nog steeds precies één interne organisatie: die uit migratie 0019.
  const intern = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.type, "intern"));
  expect(intern.map((o) => o.slug)).toEqual(["brink-licht"]);
});

test("een organisatie zonder naam wordt niet aangemaakt", async () => {
  const { db } = await opzet();
  const voor = await orgNamen(db);
  alsActor("intern@brinklicht.nl");

  const leeg = await createOrgAction({ name: "   " });
  expect(leeg.ok).toBe(false);
  if (!leeg.ok) expect(leeg.error).toBe("Enter a name for the new organization.");

  const nul = await createOrgAction({ name: "Nul Zetels", seatLimit: 0 });
  expect(nul.ok).toBe(false);
  if (!nul.ok) expect(nul.error).toBe("Enter a seat limit of 1 or more.");

  expect(await orgNamen(db)).toEqual(voor);
});

// ── Besluit 4b + 5: één klik, alles-of-niets ───────────────────────────────────

test("besluit 4b: één handeling maakt de organisatie én geeft de PIN uit", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  const uitslag = await issuePinAction({
    email: "Eigenaar@DeVries.NL",
    name: "Jan de Vries",
    roles: ["projectleider"],
    newOrg: { name: "De Vries Installaties", plan: "trial", seatLimit: 4 },
  });

  expect(uitslag.ok).toBe(true);
  if (!uitslag.ok) return;
  expect(uitslag.pin).toMatch(/^[0-9]{8}$/);
  expect(uitslag.email).toBe("eigenaar@devries.nl");
  // Het antwoord noemt de organisatie: één klik deed twee dingen, dus het scherm hoort ze
  // allebei te kunnen tonen.
  expect(uitslag.orgCreated).toBe("De Vries Installaties");
  // G36, eerste zin: de eerste persoon in een verse organisatie wordt haar beheerder.
  expect([...uitslag.roles].sort()).toEqual(["org_admin", "projectleider"]);

  const org = await orgOpNaam(db, "De Vries Installaties");
  expect(org!.type).toBe("extern");
  expect(org!.seatLimit).toBe(4);
  const leden = await db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, org!.id));
  expect(leden.map((l) => l.email)).toEqual(["eigenaar@devries.nl"]);
  expect(
    await db
      .select()
      .from(activationPins)
      .where(eq(activationPins.email, "eigenaar@devries.nl")),
  ).toHaveLength(1);
});

test("besluit 5: een vormloos adres levert géén organisatie op — de droogloop stopt vóór de database", async () => {
  const { db } = await opzet();
  const voor = await orgNamen(db);
  alsActor("intern@brinklicht.nl");

  const uitslag = await issuePinAction({
    email: "geen-adres",
    newOrg: { name: "Mislukte Poging", seatLimit: 5 },
  });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe("Enter a valid email address.");
  // Geen lege organisatie die later in de dropdown opduikt zonder dat iemand weet waarom.
  expect(await orgNamen(db)).toEqual(voor);
});

test("besluit 5: loopt de PIN halverwege stuk, dan wordt de organisatie teruggedraaid", async () => {
  const { db } = await opzet();
  const voor = await orgNamen(db);
  alsActor("intern@brinklicht.nl");

  // Foutinjectie: de PIN-insert is de laatste schrijfactie van issueActivationPin(), dus de
  // organisatie en het lidmaatschap staan er op dat moment al. Precies het geval waarvoor
  // besluit 5 bestaat, en dat een interne actor anders nooit kan uitlokken.
  harnas.breekTabel = activationPins;
  const uitslag = await issuePinAction({
    email: "eigenaar@devries.nl",
    newOrg: { name: "Halverwege Gestrand", seatLimit: 5 },
  });
  harnas.breekTabel = null;

  expect(uitslag.ok).toBe(false);

  // De compensatie: organisatie weg, en via ON DELETE CASCADE ook het lidmaatschap dat er
  // al stond. Er blijft geen spookorganisatie achter.
  expect(await orgNamen(db)).toEqual(voor);
  expect(await orgOpNaam(db, "Halverwege Gestrand")).toBeNull();
  expect(
    await db
      .select()
      .from(memberships)
      .where(eq(memberships.email, "eigenaar@devries.nl")),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(activationPins)
      .where(eq(activationPins.email, "eigenaar@devries.nl")),
  ).toHaveLength(0);

  // En het is terug te vinden: aanmaken én terugdraaien staan allebei in de events-tabel
  // (ijzeren regel 5). Een stille rollback zou net zo verwarrend zijn als een spookorg.
  const gewist = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_deleted"));
  expect(gewist).toHaveLength(1);
  expect(gewist[0].payload).toEqual({ name: "Halverwege Gestrand" });

  // ⚠️ Wat er WÉL achterblijft: de user-rij die issueActivationPin vóór de PIN aanmaakt.
  // Dat is bewust geen fout — het account bestaat, hoort bij niemand, en de volgende poging
  // pikt hem gewoon op (de insert is conflict-tolerant). Besluit 5 gaat over de lege
  // ORGANISATIE die in de dropdown zou opduiken; een adres zonder membership doet dat niet.
  const users = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, "eigenaar@devries.nl"));
  expect(users).toHaveLength(1);
});

test("besluit 5: na een teruggedraaide poging lukt dezelfde handeling gewoon", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  harnas.breekTabel = activationPins;
  await issuePinAction({
    email: "eigenaar@devries.nl",
    newOrg: { name: "Tweede Kans", seatLimit: 5 },
  });
  harnas.breekTabel = null;

  const opnieuw = await issuePinAction({
    email: "eigenaar@devries.nl",
    newOrg: { name: "Tweede Kans", seatLimit: 5 },
  });

  expect(opnieuw.ok).toBe(true);
  const org = await orgOpNaam(db, "Tweede Kans");
  expect(org).not.toBeNull();
  expect(
    (
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.orgId, org!.id))
    ).map((l) => l.email),
  ).toEqual(["eigenaar@devries.nl"]);
});

// ── Besluit 6 + 7: de zetellimiet houdt tegen, en is te verhogen ───────────────

test("besluit 6 en 7: een volle organisatie weigert de PIN met een bruikbare melding, en gaat open na verhoging", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  // Precies de stand die op productie voor een verrassing zorgde: TEST 123 met
  // seat_limit = 1 en één lid erin.
  const vol = await createOrganization(db, { name: "TEST 123", seatLimit: 1 });
  await addMembership(db, {
    orgId: vol.id,
    email: "eerste@test123.nl",
    roles: ["org_admin"],
  });

  const geweigerd = await issuePinAction({
    email: "tweede@test123.nl",
    orgId: vol.id,
    roles: ["calculator"],
  });
  expect(geweigerd.ok).toBe(false);
  if (geweigerd.ok) return;
  // De melding zegt wát er aan de hand is en wat je eraan doet — "kon geen PIN uitgeven"
  // laat Brink zoeken.
  expect(geweigerd.error).toBe(
    "This organization has used all its seats (1 of 1). Raise the seat limit to add someone.",
  );
  // En er is niets half aangemaakt.
  expect(
    await db
      .select()
      .from(memberships)
      .where(eq(memberships.email, "tweede@test123.nl")),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(activationPins)
      .where(eq(activationPins.email, "tweede@test123.nl")),
  ).toHaveLength(0);

  // Besluit 7: de limiet is in Admin te verhogen…
  const verhoogd = await setSeatLimitAction({ orgId: vol.id, seatLimit: 3 });
  expect(verhoogd.ok).toBe(true);

  // …en dan lukt exact dezelfde uitgifte wél.
  const nu = await issuePinAction({
    email: "tweede@test123.nl",
    orgId: vol.id,
    roles: ["calculator"],
  });
  expect(nu.ok).toBe(true);

  // G42: het type is door dit alles heen niet veranderd.
  const [na] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, vol.id));
  expect(na.type).toBe("extern");
  expect(na.seatLimit).toBe(3);
});

test("besluit 6: een volle organisatie blokkeert géén nieuwe PIN voor iemand die er al in zit", async () => {
  const { db } = await opzet();
  alsActor("intern@brinklicht.nl");

  const vol = await createOrganization(db, { name: "Vol", seatLimit: 1 });
  await addMembership(db, {
    orgId: vol.id,
    email: "eerste@vol.nl",
    roles: ["org_admin"],
  });

  // C10: vergeten wachtwoord = nieuwe PIN. Dat mag niet stuklopen op een volle organisatie
  // — juist op het moment dat iemand er al in zit.
  const opnieuw = await issuePinAction({ email: "eerste@vol.nl" });
  expect(opnieuw.ok).toBe(true);
  expect(
    await db.select().from(memberships).where(eq(memberships.orgId, vol.id)),
  ).toHaveLength(1);
});

test("besluit 7: een onmogelijke zetellimiet wordt geweigerd, niet stil afgerond", async () => {
  const { db, klant } = await opzet();
  alsActor("intern@brinklicht.nl");

  for (const seatLimit of [0, -3, 2.5]) {
    const uitslag = await setSeatLimitAction({ orgId: klant, seatLimit });
    expect(uitslag.ok, `limiet ${seatLimit}`).toBe(false);
    if (!uitslag.ok) {
      expect(uitslag.error).toBe("Enter a seat limit of 1 or more.");
    }
  }

  // Onveranderd — stil terugvallen op een default zou een andere limiet opleveren dan de
  // uitgever intikte, en dat merkt niemand.
  const [na] = await db
    .select({ seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, klant));
  expect(na.seatLimit).toBe(5);
});

test("een organisatie die niet bestaat levert geen zetellimiet op", async () => {
  await opzet();
  alsActor("intern@brinklicht.nl");

  for (const orgId of ["geen-uuid", "00000000-0000-4000-8000-000000000000"]) {
    const uitslag = await setSeatLimitAction({ orgId, seatLimit: 5 });
    expect(uitslag.ok, orgId).toBe(false);
    if (!uitslag.ok) {
      expect(uitslag.error).toBe(
        "That organization no longer exists — refresh the page and try again.",
      );
    }
  }
});
