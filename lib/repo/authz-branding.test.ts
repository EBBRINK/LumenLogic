// De derde deur: branding — sprint 3.2a.
//
// Dit was de BEKENDE SCHULD uit `lib/repo/authz-deuren.test.ts`. `saveBrandingAction` stond
// achter alleen `requireSession()`, deed rechtstreeks `db.update(organizations)` en las de
// `orgId` uit het formulier: een gewone gebruiker uit org A overschreef daarmee de branding
// van org B, zonder spoor in de events-tabel.
//
// Elke test hieronder bewijst twee dingen tegelijk — de weigering én een ONGEWIJZIGDE
// database. Alleen het eerste zou ook waar zijn voor een functie die zijn werk deed en
// daarna toevallig `{ok:false}` teruggaf. En overal staat de contra-test ernaast: zonder
// die zou een test die per ongeluk niets meet ook groen zijn.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { events, memberships, organizations } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import {
  decideBrandingChange,
  setBrandingAsActor,
  type OrgAuthority,
} from "./authz";

const BRINK = "11111111-1111-4111-8111-111111111111";
const KLANT_A = "22222222-2222-4222-8222-222222222222";
const KLANT_B = "33333333-3333-4333-8333-333333333333";

async function drieOrganisaties(db: TestDb) {
  await db.insert(organizations).values([
    { id: BRINK, name: "Brink Licht (test)", slug: "brink-test", type: "intern" },
    { id: KLANT_A, name: "Installateur A", slug: "a", type: "extern" },
    { id: KLANT_B, name: "Installateur B", slug: "b", type: "extern" },
  ]);
  await db.insert(memberships).values([
    { orgId: BRINK, email: "timo@brinklicht.nl", roles: ["org_admin"] },
    { orgId: KLANT_A, email: "baas@a.nl", roles: ["org_admin"] },
    { orgId: KLANT_A, email: "jan@a.nl", roles: ["calculator"] },
  ]);
}

const brandingVan = async (db: TestDb, orgId: string) =>
  (
    await db
      .select({ branding: organizations.branding })
      .from(organizations)
      .where(eq(organizations.id, orgId))
  )[0]?.branding ?? null;

// ── De pure regel ────────────────────────────────────────────────────────────

test("de regel, uitputtend: intern alles, org_admin zijn eigen org, de rest niets", () => {
  const intern: OrgAuthority = { kind: "intern", email: "timo@brinklicht.nl" };
  const admin: OrgAuthority = {
    kind: "org_admin",
    email: "baas@a.nl",
    orgIds: [KLANT_A],
  };
  const geen: OrgAuthority = { kind: "geen", email: "jan@a.nl" };

  expect(decideBrandingChange(intern, KLANT_B).allowed).toBe(true);
  expect(decideBrandingChange(admin, KLANT_A).allowed).toBe(true);
  expect(decideBrandingChange(admin, KLANT_B).allowed).toBe(false);
  expect(decideBrandingChange(geen, KLANT_A).allowed).toBe(false);
  // Een gewone gebruiker mag ook zijn éígen organisatie niet brandmerken: hij is 'geen'
  // in G36-termen, en die tak is default-deny.
  expect(decideBrandingChange(geen, KLANT_B).allowed).toBe(false);
});

test("een weigering verraadt niets over wat er bestaat", () => {
  const admin: OrgAuthority = {
    kind: "org_admin",
    email: "baas@a.nl",
    orgIds: [KLANT_A],
  };
  // Een bestaande vreemde org en een verzonnen org geven exact dezelfde tekst — anders is
  // de foutmelding zelf een manier om organisaties te ontdekken.
  const bestaand = decideBrandingChange(admin, KLANT_B);
  const verzonnen = decideBrandingChange(admin, "44444444-4444-4444-4444-444444444444");
  expect(bestaand.allowed).toBe(false);
  expect(verzonnen.allowed).toBe(false);
  if (!bestaand.allowed && !verzonnen.allowed) {
    expect(bestaand.message).toBe(verzonnen.message);
  }
});

// ── De echte deur ────────────────────────────────────────────────────────────

test("HET GAT: org A kan de branding van org B niet meer overschrijven", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);
  await setBrandingAsActor(db, {
    actorEmail: "timo@brinklicht.nl",
    orgId: KLANT_B,
    logoUrl: "https://b.nl/logo.svg",
  });

  const uitkomst = await setBrandingAsActor(db, {
    actorEmail: "baas@a.nl", // org_admin van A
    orgId: KLANT_B,
    logoUrl: "https://kwaadaardig.nl/logo.svg",
    accentColor: "#ff0000",
  });

  expect(uitkomst.ok).toBe(false);
  if (!uitkomst.ok) expect(uitkomst.reason).toBe("vreemde_org");
  // En de database is écht niet geraakt — dat scheidt "de poort weigerde" van "hij schreef
  // en meldde daarna een fout".
  expect(await brandingVan(db, KLANT_B)).toEqual({
    logoUrl: "https://b.nl/logo.svg",
  });
});

test("dezelfde beheerder mag zijn eigen organisatie wél brandmerken", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);

  const uitkomst = await setBrandingAsActor(db, {
    actorEmail: "baas@a.nl",
    orgId: KLANT_A,
    logoUrl: "https://a.nl/logo.svg",
    accentColor: "#0055ff",
  });

  expect(uitkomst.ok).toBe(true);
  expect(await brandingVan(db, KLANT_A)).toEqual({
    logoUrl: "https://a.nl/logo.svg",
    accentColor: "#0055ff",
  });
});

test("een gewone gebruiker mag ook binnen zijn eigen organisatie niets", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);

  const uitkomst = await setBrandingAsActor(db, {
    actorEmail: "jan@a.nl", // calculator, geen org_admin
    orgId: KLANT_A,
    logoUrl: "https://jan.nl/logo.svg",
  });

  expect(uitkomst.ok).toBe(false);
  expect(await brandingVan(db, KLANT_A)).toBeNull();
});

test("intern mag elke organisatie", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);

  for (const orgId of [BRINK, KLANT_A, KLANT_B]) {
    const uitkomst = await setBrandingAsActor(db, {
      actorEmail: "timo@brinklicht.nl",
      orgId,
      accentColor: "#123456",
    });
    expect(uitkomst.ok, orgId).toBe(true);
  }
});

test("een onbekende of vormloze orgId is een nette weigering, geen databasefout", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);

  for (const orgId of ["niet-eens-een-uuid", "44444444-4444-4444-4444-444444444444"]) {
    // Vorm eerst, dan de database: `::uuid` op de eerste waarde zou gooien, en dan gaf een
    // onbevoegde aanvraag een hárde fout waar dezelfde aanvraag met een bestaande org een
    // nette weigering geeft. Dat verschil is zelf informatie.
    const uitkomst = await setBrandingAsActor(db, {
      actorEmail: "timo@brinklicht.nl",
      orgId,
      logoUrl: "https://x.nl/logo.svg",
    });
    expect(uitkomst.ok, orgId).toBe(false);
  }
});

test("lege velden blijven eerlijk leeg, en een wijziging laat een spoor na (regel 5)", async () => {
  const db = (await createTestDb()) as TestDb;
  await drieOrganisaties(db);

  await setBrandingAsActor(db, {
    actorEmail: "timo@brinklicht.nl",
    orgId: KLANT_A,
    logoUrl: "  ",
    accentColor: "#abcdef",
  });
  // Ongewijzigd gedrag t.o.v. de oude action: een leeg veld wordt weggelaten, niet als
  // lege string opgeslagen.
  expect(await brandingVan(db, KLANT_A)).toEqual({ accentColor: "#abcdef" });

  const spoor = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_branding_changed"));
  expect(spoor).toHaveLength(1);
  expect(spoor[0].actor).toBe("timo@brinklicht.nl");

  // En een geweigerde poging staat er óók in — juist die wil je achteraf terugvinden.
  await setBrandingAsActor(db, {
    actorEmail: "jan@a.nl",
    orgId: KLANT_A,
    accentColor: "#000000",
  });
  const geweigerd = await db
    .select()
    .from(events)
    .where(eq(events.action, "org_branding_denied"));
  expect(geweigerd).toHaveLength(1);
});
