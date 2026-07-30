// Besluiten G36/G39 op het niveau van de laag zelf. De ÉCHTE server-actions staan in
// app/admin/users/issue-pin-authz.test.ts — daar staat het bewijs dat de weigering in het
// pad zit dat de app gebruikt. Hier staan de eigenschappen die je aan een action niet kunt
// zien: dat de beslissing puur en uitputtend is, dat beide deuren dezelfde regels gebruiken,
// dat de bevoegdheid vers uit de database komt, dat elke weigering wordt gelogd, en dat het
// scherm precies de keuzes krijgt die de server ook toestaat.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import { events, memberships, organizations } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import {
  changeMembershipAsActor,
  decideMembershipAuthority,
  decideMembershipChange,
  decidePinIssue,
  describeIssueScope,
  issuePinAsActor,
  mayViewPinStatus,
  resolveOrgAuthority,
  type OrgAuthority,
  type TargetFacts,
} from "@/lib/repo/authz";
import { addMembership, createOrganization } from "@/lib/repo/orgs";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const intern: OrgAuthority = { kind: "intern", email: "intern@brinklicht.nl" };
const beheerderA: OrgAuthority = {
  kind: "org_admin",
  email: "beheerder-a@extern.nl",
  orgIds: [ORG_A],
};
const niemand: OrgAuthority = { kind: "geen", email: "passant@extern.nl" };

const onbekendDoel: TargetFacts = {
  email: "nieuw@extern.nl",
  hasAccount: false,
  memberships: [],
};

async function opzet() {
  const db = (await createTestDb()) as TestDb;
  const [internOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  const orgA = await createOrganization(db, { name: "Installatiebedrijf A" });
  const orgB = await createOrganization(db, { name: "Installatiebedrijf B" });
  await addMembership(db, {
    orgId: internOrg.id,
    email: "intern@brinklicht.nl",
    roles: [],
  });
  await addMembership(db, {
    orgId: orgA.id,
    email: "beheerder-a@extern.nl",
    roles: ["org_admin"],
  });
  await addMembership(db, {
    orgId: orgA.id,
    email: "calculator-a@extern.nl",
    roles: ["calculator"],
  });
  return { db, internOrgId: internOrg.id, orgA: orgA.id, orgB: orgB.id };
}

// ── De beslissing zelf: puur, dus uitputtend te tonen ───────────────────────────

test("G36 als tabel: dezelfde vraag, drie soorten actoren, drie uitkomsten", async () => {
  const vraag = {
    target: onbekendDoel,
    orgId: ORG_A,
    org: { id: ORG_A, hasOrgAdmin: true },
  };

  const alsIntern = decidePinIssue({
    authority: intern,
    ...vraag,
    roles: ["calculator"],
  });
  const alsBeheerder = decidePinIssue({
    authority: beheerderA,
    ...vraag,
    roles: ["calculator"],
  });
  const alsNiemand = decidePinIssue({
    authority: niemand,
    ...vraag,
    roles: ["calculator"],
  });

  expect(alsIntern.allowed).toBe(true);
  expect(alsBeheerder.allowed).toBe(true); // eigen org, gewone rol
  expect(alsNiemand.allowed).toBe(false);
  if (!alsNiemand.allowed) expect(alsNiemand.reason).toBe("geen_uitgever");

  // Dezelfde vraag, maar nu in een andere organisatie: alleen intern komt er nog door.
  const elders = { ...vraag, orgId: ORG_B, org: { id: ORG_B, hasOrgAdmin: true } };
  expect(
    decidePinIssue({ authority: intern, ...elders, roles: ["calculator"] }).allowed,
  ).toBe(true);
  const geweigerd = decidePinIssue({
    authority: beheerderA,
    ...elders,
    roles: ["calculator"],
  });
  expect(geweigerd.allowed).toBe(false);
  if (!geweigerd.allowed) expect(geweigerd.reason).toBe("vreemde_org");

  // En dezelfde vraag mét de org_admin-rol: dat is precies het verschil tussen regel 1 en 2.
  expect(
    decidePinIssue({ authority: intern, ...vraag, roles: ["org_admin"] }).allowed,
  ).toBe(true);
  const rolGeweigerd = decidePinIssue({
    authority: beheerderA,
    ...vraag,
    roles: ["org_admin"],
  });
  expect(rolGeweigerd.allowed).toBe(false);
  if (!rolGeweigerd.allowed) expect(rolGeweigerd.reason).toBe("org_admin_rol");
});

test("beide deuren delen dezelfde kern: PIN-uitgifte en het organisatiescherm beslissen identiek", async () => {
  // Dit is de reden dat decideMembershipAuthority bestaat. De critic brak ronde 1 open via
  // addMemberAction, dat toen zijn eigen (afwezige) regels had. Voor elke actor en elke
  // vraag hieronder moet het antwoord van beide deuren gelijk zijn — inclusief de reden.
  const doelen: TargetFacts[] = [
    onbekendDoel,
    {
      email: "elders@extern.nl",
      hasAccount: true,
      memberships: [{ orgId: ORG_B, roles: [] }],
    },
    {
      email: "beheerder@extern.nl",
      hasAccount: true,
      memberships: [{ orgId: ORG_A, roles: ["org_admin"] }],
    },
    { email: "los@extern.nl", hasAccount: true, memberships: [] },
  ];
  const rolsets: ("calculator" | "org_admin")[][] = [
    [],
    ["calculator"],
    ["org_admin"],
  ];

  for (const authority of [intern, beheerderA, niemand]) {
    for (const target of doelen) {
      for (const roles of rolsets) {
        for (const orgId of [ORG_A, ORG_B]) {
          const org = { id: orgId, hasOrgAdmin: true };
          const pin = decidePinIssue({ authority, target, orgId, org, roles });
          const lid = decideMembershipChange({
            authority,
            target,
            orgId,
            org,
            roles,
            operation: "set",
          });
          const beschrijving = `${authority.kind} / ${target.email} / ${
            roles.join("+") || "geen rol"
          } / ${orgId === ORG_A ? "eigen org" : "vreemde org"}`;
          expect(
            `${pin.allowed}:${pin.allowed ? "" : pin.reason}`,
            beschrijving,
          ).toBe(`${lid.allowed}:${lid.allowed ? "" : lid.reason}`);
        }
      }
    }
  }
});

test("het besluit draagt de UITKOMST, niet het verzoek: de bootstrap-rol zit erin, dubbele rollen niet", async () => {
  const zonderBeheerder = { id: ORG_A, hasOrgAdmin: false };
  const besluit = decidePinIssue({
    authority: intern,
    target: onbekendDoel,
    orgId: ORG_A,
    org: zonderBeheerder,
    roles: [],
  });
  expect(besluit.allowed).toBe(true);
  if (!besluit.allowed) return;
  expect(besluit.roles).toEqual(["org_admin"]);
  expect(besluit.email).toBe("nieuw@extern.nl");

  // Een org_admin krijgt die bootstrap NOOIT, ook niet in een org zonder beheerder — die
  // situatie kan bij hem niet bestaan, maar regel 2 mag daar niet op steunen.
  const zijnBesluit = decidePinIssue({
    authority: beheerderA,
    target: onbekendDoel,
    orgId: ORG_A,
    org: zonderBeheerder,
    roles: ["calculator", "calculator"],
  });
  expect(zijnBesluit.allowed).toBe(true);
  if (!zijnBesluit.allowed) return;
  expect(zijnBesluit.roles).toEqual(["calculator"]);

  // En het organisatiescherm bootstrapt sowieso niet: daar wijs je een beheerder expliciet
  // aan (en dat mag alleen intern).
  const viaScherm = decideMembershipChange({
    authority: intern,
    target: onbekendDoel,
    orgId: ORG_A,
    org: zonderBeheerder,
    roles: [],
    operation: "set",
  });
  expect(viaScherm.allowed).toBe(true);
  if (!viaScherm.allowed) return;
  expect(viaScherm.roles).toEqual([]);
});

test("een org_admin komt niet bij een doeladres dat elders lid is, zelf beheerder is, of los rondloopt", async () => {
  const elders: TargetFacts = {
    email: "collega@extern.nl",
    hasAccount: true,
    memberships: [{ orgId: ORG_B, roles: ["calculator"] }],
  };
  const beheerder: TargetFacts = {
    email: "collega@extern.nl",
    hasAccount: true,
    memberships: [{ orgId: ORG_A, roles: ["org_admin"] }],
  };
  const losAccount: TargetFacts = {
    email: "los@brinklicht.nl",
    hasAccount: true,
    memberships: [],
  };

  for (const [doel, reden] of [
    [elders, "vreemd_doeladres"],
    [beheerder, "doel_is_org_admin"],
    [losAccount, "vreemd_doeladres"],
  ] as const) {
    const besluit = decideMembershipAuthority({
      authority: beheerderA,
      target: doel,
      orgId: ORG_A,
      org: { id: ORG_A, hasOrgAdmin: true },
      roles: [],
    });
    expect(besluit.allowed).toBe(false);
    if (!besluit.allowed) expect(besluit.reason).toBe(reden);
    // Intern mag alle drie wél.
    expect(
      decideMembershipAuthority({
        authority: intern,
        target: doel,
        orgId: ORG_A,
        org: { id: ORG_A, hasOrgAdmin: true },
        roles: [],
      }).allowed,
    ).toBe(true);
  }
});

test("een vormloos adres wordt geweigerd, maar pas nadat de actor zelf is beoordeeld", async () => {
  const vormloos: TargetFacts = {
    email: "  geenapenstaartje ",
    hasAccount: false,
    memberships: [],
  };
  const vanIntern = decidePinIssue({
    authority: intern,
    target: vormloos,
    orgId: null,
    org: null,
  });
  expect(vanIntern.allowed).toBe(false);
  if (!vanIntern.allowed) expect(vanIntern.reason).toBe("ongeldig_adres");

  // Wie niets mag, hoort ook niet te leren dát zijn adres vormloos was — dan zou het
  // antwoord van de server afhangen van zijn invoer in plaats van van zijn bevoegdheid.
  const vanNiemand = decidePinIssue({
    authority: niemand,
    target: vormloos,
    orgId: null,
    org: null,
  });
  expect(vanNiemand.allowed).toBe(false);
  if (!vanNiemand.allowed) expect(vanNiemand.reason).toBe("geen_uitgever");
  if (!vanIntern.allowed && !vanNiemand.allowed) {
    expect(vanNiemand.message).not.toBe(vanIntern.message);
  }
});

// ── De feiten uit de database, vers op het moment van uitvoeren ─────────────────

test("resolveOrgAuthority: intern wint van rol, org_admin telt alleen zijn eigen orgs, de rest is 'geen'", async () => {
  const { db, orgA, orgB } = await opzet();

  // Lid van de interne org zónder rol → intern (G31: het type hangt aan de organisatie).
  expect(await resolveOrgAuthority(db, "intern@brinklicht.nl")).toEqual({
    kind: "intern",
    email: "intern@brinklicht.nl",
  });
  // Hoofdletters en spaties zijn hetzelfde adres.
  expect((await resolveOrgAuthority(db, " Intern@Brinklicht.NL ")).kind).toBe("intern");

  expect(await resolveOrgAuthority(db, "beheerder-a@extern.nl")).toEqual({
    kind: "org_admin",
    email: "beheerder-a@extern.nl",
    orgIds: [orgA],
  });
  expect((await resolveOrgAuthority(db, "calculator-a@extern.nl")).kind).toBe("geen");
  expect((await resolveOrgAuthority(db, "onbekend@extern.nl")).kind).toBe("geen");
  expect((await resolveOrgAuthority(db, null)).kind).toBe("geen");
  expect((await resolveOrgAuthority(db, "")).kind).toBe("geen");

  // Iemand die in twee orgs beheerder is, is dat in allebei — en nergens anders.
  await addMembership(db, {
    orgId: orgB,
    email: "beheerder-a@extern.nl",
    roles: ["org_admin"],
  });
  const twee = await resolveOrgAuthority(db, "beheerder-a@extern.nl");
  expect(twee.kind).toBe("org_admin");
  if (twee.kind !== "org_admin") return;
  expect([...twee.orgIds].sort()).toEqual([orgA, orgB].sort());
});

test("een membership-rij met hoofdletters breekt de org-grens niet", async () => {
  const { db, orgA, orgB } = await opzet();
  // memberships.email heeft géén CHECK die normalisatie afdwingt (activation_pins wél).
  // Vóór deze ronde zocht de laag met een exacte match: zo'n rij was dan onzichtbaar en een
  // org_admin van A mocht ineens iemand van B aanraken (gemeten door de critic). Hier gezet
  // met een rauwe insert, precies zoals een import of handmatige SQL het zou doen.
  await db.insert(memberships).values({
    orgId: orgB,
    email: "Gemengd@Extern.NL",
    roles: ["calculator"],
  });

  const uitslag = await issuePinAsActor(db, {
    actorEmail: "beheerder-a@extern.nl",
    email: "gemengd@extern.nl",
    orgId: orgA,
  });
  expect(uitslag.ok).toBe(false);
  if (!uitslag.ok) expect(uitslag.reason).toBe("vreemd_doeladres");

  // En andersom: de actor zelf blijft herkenbaar als zijn eigen rij hoofdletters heeft.
  await db.insert(memberships).values({
    orgId: orgB,
    email: "Beheerder-B@Extern.NL",
    roles: ["org_admin"],
  });
  expect((await resolveOrgAuthority(db, "beheerder-b@extern.nl")).kind).toBe("org_admin");
});

test("elke weigering wordt gelogd met de reden erbij (regel 5), terwijl het scherm die reden nooit ziet", async () => {
  const { db, orgB } = await opzet();

  const uitslag = await issuePinAsActor(db, {
    actorEmail: "beheerder-a@extern.nl",
    email: "iemand@extern.nl",
    orgId: orgB,
  });
  expect(uitslag.ok).toBe(false);
  if (uitslag.ok) return;
  expect(uitslag.reason).toBe("vreemde_org");

  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "activation_pin_denied"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].actor).toBe("beheerder-a@extern.nl");
  expect(gelogd[0].payload).toMatchObject({
    reason: "vreemde_org",
    authorityKind: "org_admin",
    email: "iemand@extern.nl",
    orgId: orgB,
  });
  // De reden staat in de events-tabel, niet in de tekst die de gebruiker krijgt.
  expect(uitslag.message).not.toContain("vreemde_org");
  expect(uitslag.message).not.toContain("org");

  // Ook de tweede deur logt, met een eigen actie-naam zodat je ze uit elkaar houdt.
  const lid = await changeMembershipAsActor(db, {
    actorEmail: "calculator-a@extern.nl",
    email: "iemand@extern.nl",
    orgId: orgB,
    roles: ["org_admin"],
    operation: "set",
  });
  expect(lid.ok).toBe(false);
  const gelogd2 = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_change_denied"));
  expect(gelogd2).toHaveLength(1);
  expect(gelogd2[0].payload).toMatchObject({
    reason: "geen_uitgever",
    operation: "set",
  });
});

test("een vormloze orgId is 'bestaat niet', geen databasefout", async () => {
  const { db } = await opzet();
  for (const rommel of ["geen-uuid", "   ", "1; drop table users"]) {
    const uitslag = await issuePinAsActor(db, {
      actorEmail: "intern@brinklicht.nl",
      email: "iemand@extern.nl",
      orgId: rommel,
    });
    expect(uitslag.ok).toBe(false);
    if (!uitslag.ok) expect(uitslag.reason).toBe("onbekende_org");
  }
  // Niets geschreven en niets gegooid: dezelfde nette weigering als bij een organisatie die
  // net verwijderd is. Zonder de vormcontrole gooit Postgres hier "invalid input syntax for
  // type uuid" en krijgt de aanroeper een harde fout in plaats van een weigering.
  expect(
    await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, "iemand@extern.nl")),
  ).toHaveLength(0);
});

test("de tweede deur schrijft alleen na een 'ja', en verwijdert alleen wat van hem is", async () => {
  const { db, orgA, orgB } = await opzet();

  // Intern voegt toe in een vreemde org: mag.
  const toegevoegd = await changeMembershipAsActor(db, {
    actorEmail: "intern@brinklicht.nl",
    email: "Nieuw@Extern.NL",
    orgId: orgB,
    roles: ["projectleider"],
    operation: "set",
  });
  expect(toegevoegd.ok).toBe(true);
  const leden = await db
    .select()
    .from(memberships)
    .where(eq(memberships.email, "nieuw@extern.nl"));
  expect(leden).toHaveLength(1);
  expect(leden[0].roles).toEqual(["projectleider"]);

  // De org_admin van A mag dat lid van B niet weghalen…
  const vreemd = await changeMembershipAsActor(db, {
    actorEmail: "beheerder-a@extern.nl",
    email: "nieuw@extern.nl",
    orgId: orgB,
    operation: "remove",
  });
  expect(vreemd.ok).toBe(false);
  expect(
    await db.select().from(memberships).where(eq(memberships.email, "nieuw@extern.nl")),
  ).toHaveLength(1);

  // …en ook zichzelf niet (dat zou zijn organisatie zonder beheerder achterlaten).
  const zichzelf = await changeMembershipAsActor(db, {
    actorEmail: "beheerder-a@extern.nl",
    email: "beheerder-a@extern.nl",
    orgId: orgA,
    operation: "remove",
  });
  expect(zichzelf.ok).toBe(false);

  // Zijn eigen calculator wél.
  const eigen = await changeMembershipAsActor(db, {
    actorEmail: "beheerder-a@extern.nl",
    email: "calculator-a@extern.nl",
    orgId: orgA,
    operation: "remove",
  });
  expect(eigen.ok).toBe(true);
  expect(
    await db
      .select()
      .from(memberships)
      .where(eq(memberships.email, "calculator-a@extern.nl")),
  ).toHaveLength(0);
  // En dat staat in de events-tabel (regel 5), met de actor uit de sessie.
  const verwijderd = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_removed"));
  expect(verwijderd).toHaveLength(1);
  expect(verwijderd[0].actor).toBe("beheerder-a@extern.nl");
});

test("de actor in de events-tabel komt uit de vastgestelde bevoegdheid, niet uit de invoer", async () => {
  const { db, orgA } = await opzet();
  const uitslag = await issuePinAsActor(db, {
    actorEmail: " Beheerder-A@Extern.NL ",
    email: "verse@extern.nl",
    orgId: orgA,
    roles: ["calculator"],
  });
  expect(uitslag.ok).toBe(true);
  const [rij] = await db
    .select()
    .from(events)
    .where(eq(events.action, "activation_pin_issued"));
  expect(rij.actor).toBe("beheerder-a@extern.nl");
});

// ── Wat het scherm mag tonen ───────────────────────────────────────────────────

test("describeIssueScope: het scherm biedt exact aan wat de server toestaat", async () => {
  const { db, internOrgId, orgA, orgB } = await opzet();

  const alsIntern = await describeIssueScope(db, "intern@brinklicht.nl");
  expect(alsIntern.canGrantOrgAdmin).toBe(true);
  expect(alsIntern.orgs.map((o) => o.id).sort()).toEqual(
    [internOrgId, orgA, orgB].sort(),
  );
  // Org B heeft nog geen beheerder: de eerste die daar een PIN krijgt wordt het (G36 zin 1),
  // en het scherm kan dat dus vooraf zeggen.
  expect(alsIntern.orgs.find((o) => o.id === orgB)?.needsOrgAdmin).toBe(true);
  expect(alsIntern.orgs.find((o) => o.id === orgA)?.needsOrgAdmin).toBe(false);

  const alsBeheerder = await describeIssueScope(db, "beheerder-a@extern.nl");
  expect(alsBeheerder.canGrantOrgAdmin).toBe(false);
  expect(alsBeheerder.orgs.map((o) => o.id)).toEqual([orgA]);

  for (const adres of ["calculator-a@extern.nl", "onbekend@extern.nl", null]) {
    const leeg = await describeIssueScope(db, adres);
    expect(leeg.orgs).toEqual([]);
    expect(leeg.canGrantOrgAdmin).toBe(false);
    expect(leeg.authority.kind).toBe("geen");
  }
});

test("mayViewPinStatus: een org_admin ziet alleen zijn eigen mensen", async () => {
  const eigen: TargetFacts = {
    email: "lid@extern.nl",
    hasAccount: true,
    memberships: [{ orgId: ORG_A, roles: ["calculator"] }],
  };
  const vreemd: TargetFacts = {
    email: "vreemd@extern.nl",
    hasAccount: true,
    memberships: [{ orgId: ORG_B, roles: ["calculator"] }],
  };
  expect(mayViewPinStatus(beheerderA, eigen)).toBe(true);
  expect(mayViewPinStatus(beheerderA, vreemd)).toBe(false);
  expect(mayViewPinStatus(intern, vreemd)).toBe(true);
  expect(mayViewPinStatus(niemand, eigen)).toBe(false);
});
