// Wie ziet wat — sprint 3.2a, acceptatie-eis 2.
//
// Twee lagen in één bestand, want ze horen bij elkaar:
//   • de PURE regels (`decideToegang`, `toegangScope`) — uitputtend, zonder database;
//   • de ECHTE query's tegen PGlite, met twee organisaties naast elkaar. Dat tweede deel
//     is de directe-URL-test die de acceptatie-eis vraagt: niet "de knop is weg", maar
//     "de rij komt er niet uit, ook niet als je precies om die ene uuid vraagt".
//
// De briefing waarschuwde dat een scoping-test die "0 rijen" teruggeeft niets bewijst zolang
// de database leeg is. Elke test hieronder toont daarom béide kanten: wat er wél uitkomt en
// wat er niet uitkomt, uit dezelfde seed.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { memberships, organizations, projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { getDossier, listDossiers } from "./dossiers";
import { listDossiersFiltered, setStatus, setXisPhase } from "./project-status";
import {
  ALLE_DOSSIERS,
  decideToegang,
  dossierScopeSql,
  GEEN_DOSSIERS,
  resolveToegang,
  toegangScope,
} from "./toegang";

// ── De pure regel ────────────────────────────────────────────────────────────

test("geen adres → anoniem, en anoniem heeft geen organisaties", () => {
  for (const leeg of [null, undefined, "", "   ", "geen-apenstaartje"]) {
    const t = decideToegang(leeg, []);
    expect(t.soort, String(leeg)).toBe("anoniem");
    expect(t.orgIds).toEqual([]);
    expect(t.primaireOrgId).toBeNull();
  }
});

test("een adres zonder enig lidmaatschap is EXTERN, niet anoniem", () => {
  // Het verschil telt: anoniem gaat naar /login, extern krijgt een 404. Een ingelogde
  // gebruiker naar /login sturen zou een oneindige lus zijn.
  const t = decideToegang("zwever@nergens.nl", []);
  expect(t.soort).toBe("extern");
  expect(t.email).toBe("zwever@nergens.nl");
  expect(toegangScope(t)).toEqual({ kind: "orgs", orgIds: [] });
});

test("één lidmaatschap in een interne org is genoeg — ook zonder rol", () => {
  // G36-regel 1, hier op de leeskant: élke rol binnen 'intern' telt, ook géén rol.
  const t = decideToegang("stagiair@brinklicht.nl", [
    { orgId: "org-brink", orgType: "intern", roles: [] },
  ]);
  expect(t.soort).toBe("intern");
  expect(toegangScope(t)).toEqual({ kind: "alles" });
});

test("intern én extern lid is intern, niet andersom", () => {
  // Een Brink-medewerker die meekijkt in een klantorganisatie is een Brink-medewerker.
  // Zelfde lezing als decidePrijszicht() in prijszicht.ts.
  const t = decideToegang("timo@brinklicht.nl", [
    { orgId: "org-klant", orgType: "extern", roles: ["calculator"] },
    { orgId: "org-brink", orgType: "intern", roles: ["org_admin"] },
  ]);
  expect(t.soort).toBe("intern");
  // …en zijn nieuwe projecten vallen onder Brink, niet onder de klant.
  expect(t.primaireOrgId).toBe("org-brink");
});

test("een org_admin van een EXTERNE org is extern", () => {
  const t = decideToegang("baas@installateur.nl", [
    { orgId: "org-klant", orgType: "extern", roles: ["org_admin"] },
  ]);
  expect(t.soort).toBe("extern");
  expect(t.adminOrgIds).toEqual(["org-klant"]);
  expect(toegangScope(t)).toEqual({ kind: "orgs", orgIds: ["org-klant"] });
});

test("een onbekend org-type valt de veilige kant op", () => {
  // De regel is "intern? alles", niet "extern? filter". Een vierde type dat morgen bijkomt
  // (of een ontbrekende join) levert dus extern en niet per ongeluk alles.
  for (const raar of [null, undefined, "brand" as const]) {
    const t = decideToegang("iemand@ergens.nl", [
      { orgId: "org-x", orgType: raar, roles: [] },
    ]);
    expect(t.soort, String(raar)).toBe("extern");
  }
});

test("primaireOrgId: extern met twee organisaties krijgt geen gok", () => {
  const een = decideToegang("jan@installateur.nl", [
    { orgId: "org-a", orgType: "extern", roles: [] },
  ]);
  expect(een.primaireOrgId).toBe("org-a");
  const twee = decideToegang("jan@installateur.nl", [
    { orgId: "org-a", orgType: "extern", roles: [] },
    { orgId: "org-b", orgType: "extern", roles: [] },
  ]);
  // Liever geen project dan een project in de verkeerde organisatie.
  expect(twee.primaireOrgId).toBeNull();
  // …maar hij ziet ze wél allebei.
  expect(toegangScope(twee)).toEqual({ kind: "orgs", orgIds: ["org-a", "org-b"] });
});

test("dubbele membership-rijen leveren geen dubbele orgId", () => {
  const t = decideToegang("jan@installateur.nl", [
    { orgId: "org-a", orgType: "extern", roles: ["calculator"] },
    { orgId: "org-a", orgType: "extern", roles: ["org_admin"] },
  ]);
  expect(t.orgIds).toEqual(["org-a"]);
  expect(t.adminOrgIds).toEqual(["org-a"]);
});

test("een lege orgs-scope is nul rijen, niet 'geen filter'", async () => {
  // De faalstand die dit uitsluit: een weggelaten WHERE-tak, of een `IN ()` die ongeldige
  // SQL oplevert. Het eerste zou "niets" in "alles" veranderen, het tweede zou de pagina
  // laten klappen. Bewust op het GEDRAG getoetst en niet op de vorm van het SQL-object:
  // een assertie over `queryChunks` bewijst niets over wat Postgres ermee doet.
  const db = (await createTestDb()) as TestDb;
  await tweeOrganisaties(db);
  const tel = async (scope: Parameters<typeof dossierScopeSql>[0]) =>
    (
      await db
        .select()
        .from(projectDossiers)
        .where(dossierScopeSql(scope, projectDossiers.orgId))
    ).length;

  expect(await tel(GEEN_DOSSIERS)).toBe(0);
  expect(await tel(ALLE_DOSSIERS)).toBe(3);
  expect(await tel({ kind: "orgs", orgIds: [UUID_KLANT] })).toBe(1);
});

// ── De echte query's, met twee organisaties naast elkaar ─────────────────────

const UUID_BRINK = "11111111-1111-4111-8111-111111111111";
const UUID_KLANT = "22222222-2222-4222-8222-222222222222";

/**
 * Twee organisaties, elk met één lid en één project — plus een project zónder organisatie.
 * Dat laatste is het geval dat de briefing als achterhaald aanmerkte (migratie 0019 heeft
 * de 13 bestaande dossiers gekoppeld), maar dat wél kan ontstaan zolang oude rijen bestaan.
 * De regel: zo'n project is van Brink en dus alleen voor intern zichtbaar.
 */
async function tweeOrganisaties(db: TestDb) {
  await db.insert(organizations).values([
    { id: UUID_BRINK, name: "Brink Licht (test)", slug: "brink-test", type: "intern" },
    { id: UUID_KLANT, name: "Installateur Zuid", slug: "zuid", type: "extern" },
  ]);
  await db.insert(memberships).values([
    { orgId: UUID_BRINK, email: "timo@brinklicht.nl", roles: ["org_admin"] },
    { orgId: UUID_KLANT, email: "jan@installateur.nl", roles: ["calculator"] },
  ]);
  const [vanBrink] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", orgId: UUID_BRINK })
    .returning();
  const [vanKlant] = await db
    .insert(projectDossiers)
    .values({ name: "Kantoor Zuid", orgId: UUID_KLANT })
    .returning();
  const [zonderOrg] = await db
    .insert(projectDossiers)
    .values({ name: "Oud project zonder org", orgId: null })
    .returning();
  return { vanBrink, vanKlant, zonderOrg };
}

test("resolveToegang leest het org-type uit de database, hoofdletterongevoelig", async () => {
  const db = (await createTestDb()) as TestDb;
  await tweeOrganisaties(db);
  await db
    .insert(memberships)
    .values({ orgId: UUID_KLANT, email: "Piet@Installateur.NL", roles: [] });

  expect((await resolveToegang(db, "timo@brinklicht.nl")).soort).toBe("intern");
  expect((await resolveToegang(db, "jan@installateur.nl")).soort).toBe("extern");
  // memberships.email heeft geen CHECK die normalisatie afdwingt; een rij met hoofdletters
  // mag niet onzichtbaar zijn — dan zou dit account stilzwijgend nul projecten zien.
  const piet = await resolveToegang(db, "  PIET@installateur.nl ");
  expect(piet.soort).toBe("extern");
  expect(piet.orgIds).toEqual([UUID_KLANT]);
  // En een onbekend adres is niets.
  expect((await resolveToegang(db, "vreemde@elders.nl")).orgIds).toEqual([]);
});

test("DIRECTE URL: een extern account krijgt het project van een ander niet, ook niet op uuid", async () => {
  const db = (await createTestDb()) as TestDb;
  const { vanBrink, vanKlant, zonderOrg } = await tweeOrganisaties(db);
  const extern = toegangScope(await resolveToegang(db, "jan@installateur.nl"));

  // Dít is de eis: niet "de knop is weg" maar "de rij komt er niet uit".
  expect(await getDossier(db, extern, vanBrink.id)).toBeNull();
  expect(await getDossier(db, extern, zonderOrg.id)).toBeNull();
  // …en het is geen kapotte query: zijn eigen project komt er wél gewoon uit.
  expect((await getDossier(db, extern, vanKlant.id))?.name).toBe("Kantoor Zuid");
});

test("DIRECTE URL: intern ziet alles, inclusief het project zonder organisatie", async () => {
  const db = (await createTestDb()) as TestDb;
  const { vanBrink, vanKlant, zonderOrg } = await tweeOrganisaties(db);
  const intern = toegangScope(await resolveToegang(db, "timo@brinklicht.nl"));

  for (const d of [vanBrink, vanKlant, zonderOrg]) {
    expect((await getDossier(db, intern, d.id))?.id, d.name).toBe(d.id);
  }
});

test("de lijst is gescoped, en de lege scope levert écht nul", async () => {
  const db = (await createTestDb()) as TestDb;
  await tweeOrganisaties(db);

  const intern = toegangScope(await resolveToegang(db, "timo@brinklicht.nl"));
  const extern = toegangScope(await resolveToegang(db, "jan@installateur.nl"));
  const zwever = toegangScope(await resolveToegang(db, "zwever@nergens.nl"));

  expect((await listDossiers(db, intern)).map((d) => d.name).sort()).toEqual([
    "Kantoor Zuid",
    "Oud project zonder org",
    "Ziekenhuis Noord",
  ]);
  expect((await listDossiers(db, extern)).map((d) => d.name)).toEqual([
    "Kantoor Zuid",
  ]);
  // Ingelogd zonder organisatie: nul rijen — en dat is een echte nul, want de twee
  // regels hierboven bewijzen dat er wél iets te zien vált.
  expect(await listDossiers(db, zwever)).toEqual([]);
});

test("het statusfilter kan de scope niet verruimen", async () => {
  const db = (await createTestDb()) as TestDb;
  await tweeOrganisaties(db);
  const extern = toegangScope(await resolveToegang(db, "jan@installateur.nl"));

  // Zonder filter, met filter, met het archief-filter: nooit meer dan zijn eigen project.
  expect((await listDossiersFiltered(db, extern)).map((d) => d.name)).toEqual([
    "Kantoor Zuid",
  ]);
  expect(
    (await listDossiersFiltered(db, extern, "concept")).map((d) => d.name),
  ).toEqual(["Kantoor Zuid"]);
  expect(await listDossiersFiltered(db, extern, "archief")).toEqual([]);
  // Intern ziet in dezelfde stand méér — anders bewijst het bovenstaande niets.
  const intern = toegangScope(await resolveToegang(db, "timo@brinklicht.nl"));
  expect((await listDossiersFiltered(db, intern)).length).toBe(3);
});

test("SCHRIJVEN: een extern account kan de status van een vreemd project niet zetten", async () => {
  const db = (await createTestDb()) as TestDb;
  const { vanBrink, vanKlant } = await tweeOrganisaties(db);
  const extern = toegangScope(await resolveToegang(db, "jan@installateur.nl"));

  // Buiten de scope is de uitkomst letterlijk dezelfde als "bestaat niet".
  await expect(
    setStatus(db, extern, vanBrink.id, "gegund", "jan@installateur.nl"),
  ).rejects.toThrow("Project not found");
  await expect(
    setXisPhase(db, extern, vanBrink.id, "deal_making", "jan@installateur.nl"),
  ).rejects.toThrow("Project not found");

  // En er is niets geschreven — dat scheidt "de poort weigerde" van "hij deed zijn werk
  // en gooide daarna". `phase` is de veiligheidsschakelaar (regel 4), dus juist die.
  const [na] = await db
    .select()
    .from(projectDossiers)
    .where(eq(projectDossiers.id, vanBrink.id));
  expect(na.status).toBe("concept");
  expect(na.phase).toBe("tender");

  // Contra-test: op zijn éígen project komt dezelfde aanroep er wél door.
  await setStatus(db, extern, vanKlant.id, "gegund", "jan@installateur.nl");
  expect((await getDossier(db, extern, vanKlant.id))?.status).toBe("gegund");
});
