// Migratie 0019 (sprint 3.1): organizations.type (G31), de Brink-org, de backfill van
// bestaande dossiers en de memberships van bestaande gebruikers. Die drie backfills zijn
// alleen écht te testen door de migratie over bestaande data heen te draaien — daarom bouwt
// deze test zijn eigen PGlite, voert 0000–0018 uit, zet er de óude toestand in (13 dossiers
// zonder org, 3 users) en pas dán 0019. Precies zoals hij straks op Neon loopt.
// Zelfde aanpak als db/migration-0006.test.ts.
//
// ⚠️ Deze migratie heette 0017 tot de rebase op main van 3 aug: sprint 2.5b had dat nummer
// (en 0018) toen al ingenomen met zijn expressie-indexen. Hernummerd naar 0019 omdat 3.1
// nog niet gedeployd was. De indexen van 2.5b draaien hieronder gewoon mee — ze raken
// organizations niet, maar de volgorde hoort te kloppen met wat er op Neon gebeurt.
import { expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import * as schema from "@/db/schema";
import { activationPins, memberships, organizations, projectDossiers } from "@/db/schema";
import initSql from "@/db/migrations/0000_init.sql?raw";
import searchSql from "@/db/migrations/0001_search_and_visibility.sql?raw";
import authSql from "@/db/migrations/0002_auth.sql?raw";
import viewSql from "@/db/migrations/0003_view_sustainability.sql?raw";
import vijfstatussenSql from "@/db/migrations/0004_vijfstatussen.sql?raw";
import h2h3Sql from "@/db/migrations/0005_h2_h3.sql?raw";
import projectstatusSql from "@/db/migrations/0006_projectstatus_ai.sql?raw";
import datamodelSql from "@/db/migrations/0007_datamodel_productspecs.sql?raw";
import merkrelatiesSql from "@/db/migrations/0008_merkrelaties.sql?raw";
import ocrSql from "@/db/migrations/0009_ocr.sql?raw";
import brandAliasesSql from "@/db/migrations/0010_brand_aliases.sql?raw";
import ocrTilesSql from "@/db/migrations/0011_ocr_tiles.sql?raw";
import aliasSeraxSql from "@/db/migrations/0012_alias_serax.sql?raw";
import levensfaseSql from "@/db/migrations/0013_merk_levensfase.sql?raw";
import milieuFabrieksafstandSql from "@/db/migrations/0014_milieu_fabrieksafstand.sql?raw";
import eigenVeldenSql from "@/db/migrations/0015_eigen_velden.sql?raw";
import eigenVeldenEngelsSql from "@/db/migrations/0016_eigen_velden_engels.sql?raw";
import snelheidIndexenSql from "@/db/migrations/0017_snelheid_indexen.sql?raw";
import analyticsMerkgatSql from "@/db/migrations/0018_analytics_merkgat_index.sql?raw";
import orgTypeActivatieSql from "@/db/migrations/0019_org_type_activatie.sql?raw";

// De uitgangsstand van 30 jul 2026 (§2 van de sprintbriefing).
const BESTAANDE_USERS = [
  "hello@noplasticfloralfoam.com",
  "timo@jouwainstein.com",
  "e.brink@brinklicht.nl",
];

async function dbTot0018() {
  const client = await PGlite.create({ extensions: { pg_trgm } });
  for (const sql of [
    initSql,
    searchSql,
    authSql,
    viewSql,
    vijfstatussenSql,
    h2h3Sql,
    projectstatusSql,
    datamodelSql,
    merkrelatiesSql,
    ocrSql,
    brandAliasesSql,
    ocrTilesSql,
    aliasSeraxSql,
    levensfaseSql,
    milieuFabrieksafstandSql,
    eigenVeldenSql,
    eigenVeldenEngelsSql,
    snelheidIndexenSql,
    analyticsMerkgatSql,
  ]) {
    await client.exec(sql);
  }
  return { client, db: drizzle(client, { schema }) };
}

test("0019 over de bestaande stand: Brink-org, 13 dossiers gekoppeld, 3 memberships", async () => {
  const { client, db } = await dbTot0018();

  // Oude toestand: 13 dossiers zonder org, 3 users, 0 organisaties, 0 memberships.
  for (let i = 1; i <= 13; i++) {
    await db.insert(projectDossiers).values({ name: `Bestaand project ${i}` });
  }
  for (const email of BESTAANDE_USERS) {
    await client.query(
      `INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`,
      [crypto.randomUUID(), email.split("@")[0], email],
    );
  }
  // Rauw geteld: vóór 0019 kent organizations de kolom `type` nog niet, dus het
  // drizzle-schema past nog niet op de tabel.
  expect((await client.query(`SELECT id FROM organizations`)).rows).toHaveLength(0);
  expect(await db.select().from(memberships)).toHaveLength(0);

  await client.exec(orgTypeActivatieSql);

  // Eén Brink-org, type 'intern'.
  const orgs = await db.select().from(organizations);
  expect(orgs).toHaveLength(1);
  expect(orgs[0].slug).toBe("brink-licht");
  expect(orgs[0].name).toBe("Brink Licht");
  expect(orgs[0].type).toBe("intern");

  // Alle 13 dossiers hangen eraan.
  const dossiers = await db.select().from(projectDossiers);
  expect(dossiers).toHaveLength(13);
  expect(dossiers.every((d) => d.orgId === orgs[0].id)).toBe(true);

  // Alle drie de bestaande gebruikers zijn org_admin in de interne org — dat is
  // "intern super admin" uit de G21-kaart.
  const leden = await db.select().from(memberships);
  expect(leden.map((m) => m.email).sort()).toEqual([...BESTAANDE_USERS].sort());
  expect(leden.every((m) => m.orgId === orgs[0].id)).toBe(true);
  expect(leden.every((m) => m.roles.includes("org_admin"))).toBe(true);
});

test("0019 is idempotent: tweemaal draaien verandert niets meer", async () => {
  const { client, db } = await dbTot0018();
  await db.insert(projectDossiers).values({ name: "Bestaand project" });
  await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`, [
    crypto.randomUUID(),
    "timo",
    "timo@jouwainstein.com",
  ]);

  // Twee keer de ÉCHTE migratie, niet een met de hand overgetypte kopie van het
  // datagedeelte: die kopie zou groen blijven staan terwijl 0019 zelf verandert.
  await client.exec(orgTypeActivatieSql);
  await client.exec(orgTypeActivatieSql);

  expect(await db.select().from(organizations)).toHaveLength(1);
  expect(await db.select().from(memberships)).toHaveLength(1);
  const dossiers = await db.select().from(projectDossiers);
  expect(dossiers).toHaveLength(1);
  expect(dossiers[0].orgId).toBe((await db.select().from(organizations))[0].id);
});

test("0019 promoveert alleen de drie gemeten adressen, niet zomaar elke user-rij", async () => {
  const { client, db } = await dbTot0018();
  // Een externe installateur die al een user-rij heeft vóórdat deploy 1 landt.
  for (const email of ["timo@jouwainstein.com", "installateur@externebv.nl"]) {
    await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`, [
      crypto.randomUUID(),
      email.split("@")[0],
      email,
    ]);
  }

  await client.exec(orgTypeActivatieSql);

  const leden = await db.select().from(memberships);
  expect(leden.map((m) => m.email)).toEqual(["timo@jouwainstein.com"]);
});

test("een dossier dat al aan een andere org hangt wordt niet verplaatst", async () => {
  const { client, db } = await dbTot0018();
  // Rauw, want vóór 0019 bestaat organizations.type nog niet.
  const ingevoegd = await client.query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ('Installatiebedrijf De Vries', 'de-vries') RETURNING id`,
  );
  const klant = ingevoegd.rows[0];
  await db.insert(projectDossiers).values({ name: "Klantproject", orgId: klant.id });
  await db.insert(projectDossiers).values({ name: "Brink-project" });

  await client.exec(orgTypeActivatieSql);

  const [brink] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  const dossiers = await db.select().from(projectDossiers);
  expect(dossiers.find((d) => d.name === "Klantproject")?.orgId).toBe(klant.id);
  expect(dossiers.find((d) => d.name === "Brink-project")?.orgId).toBe(brink.id);
  // Een bestaande org die al vóór 0019 bestond krijgt het veilige default-type.
  const [devries] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, klant.id));
  expect(devries.type).toBe("extern");
});

test("organizations.type: default 'extern' (regel 4, default = veilig) en de enum kent drie waarden", async () => {
  const db = await createTestDb();
  const [nieuw] = await db
    .insert(organizations)
    .values({ name: "Nieuwe klant", slug: "nieuwe-klant" })
    .returning();
  expect(nieuw.type).toBe("extern");

  const [merk] = await db
    .insert(organizations)
    .values({ name: "Flos", slug: "flos", type: "brand" })
    .returning();
  expect(merk.type).toBe("brand");

  // Een vierde waarde bestaat niet.
  await expect(
    db.execute(
      "INSERT INTO organizations (name, slug, type) VALUES ('X', 'x', 'superadmin')",
    ),
  ).rejects.toThrow();
});

test("activation_pins: één rij per adres, genormaliseerd adres afgedwongen in de database", async () => {
  const db = await createTestDb();
  await db.insert(activationPins).values({
    email: "iemand@extern.nl",
    pinHash: "zout:hash",
    expiresAt: new Date("2026-08-06T10:00:00Z"),
  });

  // De primary key op e-mail ís "één actieve PIN per gebruiker".
  await expect(
    db.insert(activationPins).values({
      email: "iemand@extern.nl",
      pinHash: "ander:hash",
      expiresAt: new Date("2026-08-06T10:00:00Z"),
    }),
  ).rejects.toThrow();

  // Achtervang op normalisatie: een adres met hoofdletters of spaties komt er niet in.
  await expect(
    db.insert(activationPins).values({
      email: "Iemand@Extern.NL",
      pinHash: "x:y",
      expiresAt: new Date("2026-08-06T10:00:00Z"),
    }),
  ).rejects.toThrow();

  const [rij] = await db.select().from(activationPins);
  expect(rij.attempts).toBe(0);
  expect(rij.usedAt).toBeNull();
});
