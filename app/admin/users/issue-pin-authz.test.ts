// Besluit G36 gemeten aan de ÉCHTE server-action (`issuePinAction`), niet aan een kopie van
// de regels en niet aan het scherm. Dat is het punt van dit bestand: elke test hieronder is
// een kale aanroep zonder formulier, zoals een aanvaller of een verkeerd gebouwde client
// hem doet. Slaagt zo'n aanroep, dan helpt geen enkele UI-beperking meer.
//
// Zelfde harnas als app/settings/settings-actions.test.ts: db/client.ts praat met Neon en
// gooit al bij import zonder DATABASE_URL, dus de PGlite-testdatabase komt ervoor in de
// plaats; de sessie is gemockt omdat Better Auth hier geen request-scope heeft. Wat NIET
// gemockt is: de autorisatielaag (lib/repo/authz.ts) en de uitgifte (lib/repo/activation.ts)
// — precies de twee lagen die dit besluit dragen.
import { expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import {
  activationPins,
  events,
  memberships,
  organizations,
  type MembershipRole,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { addMembership, createOrganization } from "@/lib/repo/orgs";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "intern@brinklicht.nl",
}));

vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        return typeof waarde === "function" ? waarde.bind(echt) : waarde;
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

const { issuePinAction } = await import("./actions");
// De TWEEDE deur naar dezelfde beslissing (besluit G39). Hij deelt in dit bestand dezelfde
// gemockte db en sessie, dus de escalatieketen hieronder is de échte keten: twee echte
// server-actions achter elkaar, zonder formulier.
const orgActions = await import("@/app/settings/organization/actions");

// De tekst die élke bevoegdheidsweigering geeft (lib/repo/authz.ts). Staat hier voluit en
// niet als import: een test die de constante meeleest, keurt ook een gewijzigde constante
// goed — en de eis is juist dat dit precies één, betekenisloze zin blijft.
const GEWEIGERD =
  "You can't issue a PIN here. Ask Brink if you think you should be able to.";

async function opzet() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  const [intern] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  const orgA = await createOrganization(db, { name: "Installatiebedrijf A" });
  const orgB = await createOrganization(db, { name: "Installatiebedrijf B" });
  // De interne actor: lid van de org met type 'intern' (G31/G36 regel 1). Bewust ZONDER
  // org_admin-rol, zodat de test bewijst dat 'intern' aan de organisatie hangt en niet aan
  // een rol — precies wat G31 zegt.
  await addMembership(db, {
    orgId: intern.id,
    email: "intern@brinklicht.nl",
    roles: [],
  });
  await addMembership(db, {
    orgId: orgA.id,
    email: "beheerder-a@extern.nl",
    roles: ["org_admin"],
  });
  await addMembership(db, {
    orgId: orgB.id,
    email: "beheerder-b@extern.nl",
    roles: ["org_admin"],
  });
  await addMembership(db, {
    orgId: orgA.id,
    email: "calculator-a@extern.nl",
    roles: ["calculator"],
  });
  return { db, internOrgId: intern.id, orgA: orgA.id, orgB: orgB.id };
}

function alsActor(email: string) {
  harnas.email = email;
}

async function bestaatGebruiker(db: TestDb, email: string) {
  const rijen = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email));
  return rijen.length > 0;
}

async function ledenVan(db: TestDb, email: string) {
  return db.select().from(memberships).where(eq(memberships.email, email));
}

async function pinRijen(db: TestDb, email: string) {
  return db.select().from(activationPins).where(eq(activationPins.email, email));
}

/** Niets aangemaakt: geen account, geen membership, geen PIN. */
async function nietsAangemaakt(db: TestDb, email: string) {
  expect(await bestaatGebruiker(db, email)).toBe(false);
  expect(await ledenVan(db, email)).toHaveLength(0);
  expect(await pinRijen(db, email)).toHaveLength(0);
}

// ── Regel 3: wie geen uitgever is, mag niets ────────────────────────────────────

test("een gewone gebruiker (membership zonder org_admin) mag geen PIN uitgeven", async () => {
  const { db, orgA } = await opzet();
  alsActor("calculator-a@extern.nl");

  const uitslag = await issuePinAction({
    email: "nieuw@extern.nl",
    orgId: orgA,
    roles: ["calculator"],
  });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "nieuw@extern.nl");
});

test("iemand zonder enig membership mag geen PIN uitgeven", async () => {
  const { db, orgA } = await opzet();
  alsActor("passant@extern.nl");

  const uitslag = await issuePinAction({ email: "nieuw@extern.nl", orgId: orgA });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "nieuw@extern.nl");
});

// ── Regel 2: een org_admin blijft binnen zijn eigen organisatie ─────────────────

test("een org_admin van org A mag geen PIN uitgeven in org B", async () => {
  const { db, orgB } = await opzet();
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({
    email: "nieuw@extern.nl",
    orgId: orgB,
    roles: ["calculator"],
  });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "nieuw@extern.nl");
  expect(await db.select().from(memberships).where(eq(memberships.orgId, orgB))).toHaveLength(1);
});

test("een org_admin kan niemand org_admin maken, ook niet in zijn eigen org — en er wordt niets aangemaakt", async () => {
  const { db, orgA } = await opzet();
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({
    email: "opvolger@extern.nl",
    orgId: orgA,
    roles: ["projectleider", "org_admin"],
  });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  // Bewuste keuze: de héle uitgifte sneuvelt — niet "wel aangemaakt, rol stilletjes
  // weggelaten". Stil weglaten laat de beheerder in de veronderstelling dat hij een tweede
  // beheerder heeft, en dat is precies het misverstand dat later iemand doet aannemen dat
  // er een vervanger is. Hij kan het opnieuw doen zonder het vinkje.
  await nietsAangemaakt(db, "opvolger@extern.nl");
});

test("een org_admin mag geen PIN uitgeven voor een collega-beheerder of voor zichzelf", async () => {
  const { db, orgA } = await opzet();
  await addMembership(db, {
    orgId: orgA,
    email: "tweede-beheerder@extern.nl",
    roles: ["org_admin"],
  });
  alsActor("beheerder-a@extern.nl");

  const collega = await issuePinAction({ email: "tweede-beheerder@extern.nl" });
  expect(collega.ok).toBe(false);
  if (!collega.ok) expect(collega.error).toBe(GEWEIGERD);

  const zichzelf = await issuePinAction({ email: "beheerder-a@extern.nl" });
  expect(zichzelf.ok).toBe(false);
  if (!zichzelf.ok) expect(zichzelf.error).toBe(GEWEIGERD);

  // Een PIN is een wachtwoordreset: had dit gemogen, dan neemt de ene beheerder het account
  // van de andere over. Er staat dan ook geen enkele PIN-rij.
  expect(await pinRijen(db, "tweede-beheerder@extern.nl")).toHaveLength(0);
  expect(await pinRijen(db, "beheerder-a@extern.nl")).toHaveLength(0);
});

test("een org_admin mag geen PIN uitgeven voor iemand van Brink zelf", async () => {
  const { db } = await opzet();
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({ email: "intern@brinklicht.nl" });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  expect(await pinRijen(db, "intern@brinklicht.nl")).toHaveLength(0);
});

test("een org_admin mag geen PIN uitgeven voor een bestaand account zonder membership", async () => {
  const { db, orgA } = await opzet();
  await db.insert(authSchema.user).values({
    id: crypto.randomUUID(),
    name: "Los account",
    email: "los@brinklicht.nl",
    emailVerified: true,
  });
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({ email: "los@brinklicht.nl", orgId: orgA });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  // Een bestaand account zonder membership is niet "zijn" account: het kan een Brink-account
  // zijn waarvan het lidmaatschap is ingetrokken. Hij zou het anders naar zijn eigen org
  // trekken én er het wachtwoord van kunnen zetten.
  expect(await ledenVan(db, "los@brinklicht.nl")).toHaveLength(0);
  expect(await pinRijen(db, "los@brinklicht.nl")).toHaveLength(0);
});

test("een org_admin maakt een gewone gebruiker aan in zijn eigen org: dat lukt", async () => {
  const { db, orgA } = await opzet();
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({
    email: "Nieuwe.Collega@Extern.NL",
    name: "Nieuwe Collega",
    orgId: orgA,
    roles: ["werkvoorbereider", "projectleider"],
  });

  expect(uitslag.ok).toBe(true);
  if (!uitslag.ok) return;
  expect(uitslag.email).toBe("nieuwe.collega@extern.nl");
  expect(uitslag.pin).toMatch(/^[0-9]{8}$/);
  expect(uitslag.userCreated).toBe(true);
  // Precies de gevraagde rollen — géén org_admin erbij (G36, tweede zin): de
  // bootstrap-regel uit de eerste zin geldt alleen op het interne pad.
  expect(uitslag.roles.sort()).toEqual(["projectleider", "werkvoorbereider"]);

  const leden = await ledenVan(db, "nieuwe.collega@extern.nl");
  expect(leden).toHaveLength(1);
  expect(leden[0].orgId).toBe(orgA);
  expect([...leden[0].roles].sort()).toEqual(["projectleider", "werkvoorbereider"]);
  // En de uitgever staat als actor in de PIN-rij — uit de sessie, niet uit de invoer.
  const [pin] = await pinRijen(db, "nieuwe.collega@extern.nl");
  expect(pin.createdBy).toBe("beheerder-a@extern.nl");

  // Vervolgens mag hij voor diezelfde persoon een nieuwe PIN uitgeven (C10: vergeten
  // wachtwoord = nieuwe PIN) — zonder org, want het membership bestaat al.
  const opnieuw = await issuePinAction({ email: "nieuwe.collega@extern.nl" });
  expect(opnieuw.ok).toBe(true);
  expect(await ledenVan(db, "nieuwe.collega@extern.nl")).toHaveLength(1);
});

test("een org_admin mag geen los account aanmaken zonder organisatie", async () => {
  const { db } = await opzet();
  alsActor("beheerder-a@extern.nl");

  const uitslag = await issuePinAction({ email: "zwever@extern.nl" });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "zwever@extern.nl");
});

// ── Regel 1: intern mag alles ──────────────────────────────────────────────────

test("intern mag alles: een andere organisatie kiezen én de org_admin-rol toekennen", async () => {
  const { db, orgA, orgB } = await opzet();
  alsActor("intern@brinklicht.nl");

  // Een organisatie die niet van hem is (hij zit in de interne org), mét de rol die een
  // org_admin nooit mag uitdelen.
  const uitslag = await issuePinAction({
    email: "klant@extern.nl",
    orgId: orgB,
    roles: ["org_admin", "calculator"],
  });
  expect(uitslag.ok).toBe(true);
  if (!uitslag.ok) return;
  expect(uitslag.roles.sort()).toEqual(["calculator", "org_admin"]);
  const leden = await ledenVan(db, "klant@extern.nl");
  expect(leden[0].orgId).toBe(orgB);
  expect([...leden[0].roles].sort()).toEqual(["calculator", "org_admin"]);

  // Ook de dingen die een org_admin hierboven allemaal geweigerd zag: een bestaande
  // beheerder van een vreemde org een nieuwe PIN geven.
  const overnemen = await issuePinAction({ email: "beheerder-a@extern.nl" });
  expect(overnemen.ok).toBe(true);

  // En een gewone gebruiker in weer een andere org.
  const derde = await issuePinAction({
    email: "hulp@extern.nl",
    orgId: orgA,
    roles: ["calculator"],
  });
  expect(derde.ok).toBe(true);
  if (!derde.ok) return;
  expect(derde.roles).toEqual(["calculator"]);
});

test("G36 eerste zin: wie van Brink als eerste in een organisatie komt, wordt org_admin — ook zonder vinkje", async () => {
  const { db } = await opzet();
  const verse = await createOrganization(db, { name: "Verse Klant" });
  alsActor("intern@brinklicht.nl");

  const uitslag = await issuePinAction({
    email: "eigenaar@versklant.nl",
    orgId: verse.id,
    roles: ["projectleider"],
  });

  expect(uitslag.ok).toBe(true);
  if (!uitslag.ok) return;
  // De rol die niemand aanvinkte staat er wél bij — en het antwoord vertelt het, zodat de
  // uitgever het op het scherm ziet in plaats van het te moeten raden.
  expect(uitslag.roles.sort()).toEqual(["org_admin", "projectleider"]);
  const leden = await ledenVan(db, "eigenaar@versklant.nl");
  expect([...leden[0].roles].sort()).toEqual(["org_admin", "projectleider"]);

  // De tweede persoon in diezelfde org krijgt hem NIET automatisch.
  const tweede = await issuePinAction({
    email: "medewerker@versklant.nl",
    orgId: verse.id,
    roles: ["calculator"],
  });
  expect(tweede.ok).toBe(true);
  if (!tweede.ok) return;
  expect(tweede.roles).toEqual(["calculator"]);
});

// ── De tweede deur: het organisatiescherm (besluit G39) ────────────────────────

test("de escalatieketen strandt bij stap 1: een gewone gebruiker kan zichzelf niet in de interne org zetten", async () => {
  const { db, internOrgId, orgB } = await opzet();
  alsActor("calculator-a@extern.nl");

  // Stap 1 — precies de aanval van de critic: via addMemberAction zichzelf lid maken van de
  // org met type 'intern'. Was dat gelukt, dan is hij volgens G36-regel 1 almachtig en is
  // elke poort op het PIN-scherm zinloos.
  const fd = new FormData();
  fd.append("orgId", internOrgId);
  fd.append("email", "calculator-a@extern.nl");
  await orgActions.addMemberAction(fd);

  // De keten breekt hier: er is geen membership in de interne org bijgekomen.
  const internLeden = await db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, internOrgId));
  expect(internLeden).toHaveLength(1);
  expect(internLeden[0].email).toBe("intern@brinklicht.nl");

  // En stap 2 faalt dus nog steeds, net als vóór stap 1.
  const uitslag = await issuePinAction({
    email: "marionet@extern.nl",
    orgId: orgB,
    roles: ["org_admin"],
  });
  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "marionet@extern.nl");
});

test("een org_admin kan via het organisatiescherm geen tweede beheerder maken en niemand van een vreemde org wissen", async () => {
  const { db, orgA, orgB } = await opzet();
  alsActor("beheerder-a@extern.nl");

  // Rol die hij niet mag toekennen — ook niet in zijn eigen org.
  const rol = new FormData();
  rol.append("orgId", orgA);
  rol.append("email", "opvolger@extern.nl");
  rol.append("roles", "org_admin");
  await orgActions.addMemberAction(rol);
  expect(await ledenVan(db, "opvolger@extern.nl")).toHaveLength(0);

  // Vreemde org — helemaal niets.
  const vreemd = new FormData();
  vreemd.append("orgId", orgB);
  vreemd.append("email", "indringer@extern.nl");
  vreemd.append("roles", "calculator");
  await orgActions.addMemberAction(vreemd);
  expect(await ledenVan(db, "indringer@extern.nl")).toHaveLength(0);

  // De beheerder van een vreemde org verwijderen: nee.
  const wis = new FormData();
  wis.append("orgId", orgB);
  wis.append("email", "beheerder-b@extern.nl");
  await orgActions.removeMemberAction(wis);
  expect(await ledenVan(db, "beheerder-b@extern.nl")).toHaveLength(1);

  // Wat hij wél mag: een gewone collega in zijn eigen org, en die er weer uit.
  const eigen = new FormData();
  eigen.append("orgId", orgA);
  eigen.append("email", "Collega@Extern.NL");
  eigen.append("roles", "werkvoorbereider");
  await orgActions.addMemberAction(eigen);
  const leden = await ledenVan(db, "collega@extern.nl");
  expect(leden).toHaveLength(1);
  expect(leden[0].roles).toEqual(["werkvoorbereider"]);

  const wisEigen = new FormData();
  wisEigen.append("orgId", orgA);
  wisEigen.append("email", "collega@extern.nl");
  await orgActions.removeMemberAction(wisEigen);
  expect(await ledenVan(db, "collega@extern.nl")).toHaveLength(0);
});

test("intern mag via het organisatiescherm wél een beheerder aanwijzen in elke org", async () => {
  const { db, orgB } = await opzet();
  alsActor("intern@brinklicht.nl");

  const fd = new FormData();
  fd.append("orgId", orgB);
  fd.append("email", "eigenaar-b@extern.nl");
  fd.append("roles", "org_admin");
  fd.append("roles", "projectleider");
  await orgActions.addMemberAction(fd);

  const leden = await ledenVan(db, "eigenaar-b@extern.nl");
  expect(leden).toHaveLength(1);
  expect([...leden[0].roles].sort()).toEqual(["org_admin", "projectleider"]);
});

test("het antwoord noemt precies de rollen die in de database staan — of er wordt niets uitgegeven", async () => {
  const { db, orgA } = await opzet();
  alsActor("intern@brinklicht.nl");

  // Mét organisatie: antwoord en database zijn hetzelfde.
  const met = await issuePinAction({
    email: "met-org@extern.nl",
    orgId: orgA,
    roles: ["org_admin", "calculator"],
  });
  expect(met.ok).toBe(true);
  if (!met.ok) return;
  const leden = await ledenVan(db, "met-org@extern.nl");
  expect([...met.roles].sort()).toEqual([...leden[0].roles].sort());

  // Zónder organisatie schrijft issueActivationPin géén membership. Het antwoord mag dan
  // ook geen rollen noemen — dus wordt de hele uitgifte geweigerd in plaats van de rollen
  // stil te laten vallen. (De critic mat hier eerder: ANTWOORD ["projectleider"],
  // MEMBERSHIPS 0.)
  const zonder = await issuePinAction({
    email: "zonder-org@extern.nl",
    roles: ["projectleider"],
  });
  expect(zonder.ok).toBe(false);
  if (zonder.ok) return;
  expect(zonder.error).toBe("Pick an organization for those roles.");
  await nietsAangemaakt(db, "zonder-org@extern.nl");

  // En de reissue zonder rollen (C10: vergeten wachtwoord) blijft gewoon werken.
  const opnieuw = await issuePinAction({ email: "met-org@extern.nl" });
  expect(opnieuw.ok).toBe(true);
  if (!opnieuw.ok) return;
  expect(opnieuw.roles).toEqual([]);
  // Het bestaande membership is niet aangeraakt.
  expect([...(await ledenVan(db, "met-org@extern.nl"))[0].roles].sort()).toEqual([
    "calculator",
    "org_admin",
  ]);
});

// ── De dragende zin van G39: identiteit komt UITSLUITEND uit de sessie ─────────
// De critic mutantte hier één regel — `actorEmail: session.user?.email` werd
// `actorEmail: String(formData.get("actorEmail") ?? session.user?.email)` — en 31 tests
// bleven groen terwijl een gewone gebruiker zich als intern kon voordoen. Dat is precies de
// zin waar G39 uit bestaat: niets van wat de aanroeper meestuurt mag meewegen in "mag hij
// dit". Deze twee tests zijn er om die mutant te doden, voor beide deuren.
//
// Ze werken met een positieve controle erbij: dezelfde aanroep, alleen een andere sessie,
// moet wél slagen. Zonder die controle zou de test ook groen blijven als de handeling om
// een heel andere reden mislukte.

test("G39, tweede deur: een vervalst actor-veld in de FormData wordt genegeerd — de sessie beslist", async () => {
  const { db, internOrgId } = await opzet();

  function post(): FormData {
    const fd = new FormData();
    fd.append("orgId", internOrgId);
    fd.append("email", "calculator-a@extern.nl");
    // Elk veld waarmee een aanvaller zou proberen zich voor te doen als iemand anders.
    // Geen daarvan hoort de action te bereiken; ze staan hier allemaal omdat de mutant net
    // zo goed `actor` of `session` had kunnen heten.
    fd.append("actorEmail", "intern@brinklicht.nl");
    fd.append("actor", "intern@brinklicht.nl");
    fd.append("session", "intern@brinklicht.nl");
    fd.append("user", "intern@brinklicht.nl");
    return fd;
  }

  // Sessie = gewone gebruiker (mag per G36 niets), invoer = "ik ben intern".
  alsActor("calculator-a@extern.nl");
  await orgActions.addMemberAction(post());

  const internLeden = await db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, internOrgId));
  expect(internLeden.map((l) => l.email)).toEqual(["intern@brinklicht.nl"]);

  // De weigering staat op naam van de sessie, niet van het vervalste adres.
  const geweigerd = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_change_denied"));
  expect(geweigerd).toHaveLength(1);
  expect(geweigerd[0].actor).toBe("calculator-a@extern.nl");

  // Positieve controle: exact dezelfde FormData, maar nu mét een interne sessie. Slaagt hij
  // hier niet, dan bewees de weigering hierboven niets.
  alsActor("intern@brinklicht.nl");
  await orgActions.addMemberAction(post());
  const naIntern = await db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, internOrgId));
  expect(naIntern.map((l) => l.email).sort()).toEqual([
    "calculator-a@extern.nl",
    "intern@brinklicht.nl",
  ]);
});

test("G39, PIN-deur: een vervalst actor-veld in de invoer wordt genegeerd — de sessie beslist", async () => {
  const { db, orgB } = await opzet();

  // De action typeert deze velden niet, dus ze horen er per definitie niet in — precies
  // zoals een aanvaller ze wél zou meesturen. De cast is de enige manier om dat na te doen.
  const verzoek = {
    email: "marionet@extern.nl",
    orgId: orgB,
    roles: ["org_admin"] as MembershipRole[],
    actorEmail: "intern@brinklicht.nl",
    actor: "intern@brinklicht.nl",
    session: { user: { email: "intern@brinklicht.nl" } },
  };

  alsActor("calculator-a@extern.nl");
  const uitslag = await issuePinAction(
    verzoek as unknown as Parameters<typeof issuePinAction>[0],
  );
  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "marionet@extern.nl");

  // Positieve controle: hetzelfde verzoek met een interne sessie slaagt wél.
  alsActor("intern@brinklicht.nl");
  const alsIntern = await issuePinAction(
    verzoek as unknown as Parameters<typeof issuePinAction>[0],
  );
  expect(alsIntern.ok).toBe(true);
  if (!alsIntern.ok) return;
  // En de PIN staat op naam van de sessie, niet van het meegestuurde adres — dat zou hier
  // toevallig hetzelfde zijn, dus we toetsen het bij de geweigerde poging hierboven.
  const [pin] = await pinRijen(db, "marionet@extern.nl");
  expect(pin.createdBy).toBe("intern@brinklicht.nl");
});

// ── Geen weg omheen, en geen lek in de melding ──────────────────────────────────

test("de weigering zit in de action, niet in het scherm: een kale aanroep die het formulier omzeilt wordt net zo goed geweigerd", async () => {
  const { db, orgB } = await opzet();
  alsActor("beheerder-a@extern.nl");

  // Het scherm biedt een org_admin nóch org B nóch het org_admin-vinkje aan (zie
  // components/admin/pin-block.tsx). Deze aanroep doet allebei toch — er is geen formulier
  // aan te pas gekomen, dit is de action zelf.
  const uitslag = await issuePinAction({
    email: "achterdeur@extern.nl",
    orgId: orgB,
    roles: ["org_admin"],
  });

  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.error).toBe(GEWEIGERD);
  await nietsAangemaakt(db, "achterdeur@extern.nl");
});

test("de foutmelding verraadt niet of een adres of organisatie bestaat", async () => {
  const { db, orgB } = await opzet();
  alsActor("calculator-a@extern.nl");

  const meldingen = await Promise.all([
    // bestaand adres in een andere org
    issuePinAction({ email: "beheerder-b@extern.nl" }),
    // adres dat nergens voorkomt
    issuePinAction({ email: "bestaatniet@extern.nl" }),
    // bestaande organisatie
    issuePinAction({ email: "iemand@extern.nl", orgId: orgB }),
    // organisatie die niet bestaat
    issuePinAction({
      email: "iemand@extern.nl",
      orgId: "00000000-0000-4000-8000-000000000000",
    }),
  ]);

  const teksten = new Set(
    meldingen.map((m) => (m.ok ? "GESLAAGD" : m.error)),
  );
  expect(teksten).toEqual(new Set([GEWEIGERD]));
  expect(await pinRijen(db, "beheerder-b@extern.nl")).toHaveLength(0);
});
