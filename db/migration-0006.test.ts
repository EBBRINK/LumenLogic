// Migratie 0006 (B6 + stap 3): defaults van de nieuwe kolommen, ai_suggestions
// (rij + cascade) en de backfill van bestaande dossiers. De backfill is écht te
// testen: deze test bouwt zijn eigen PGlite, draait eerst 0000–0005, seedt
// dossiers in de óude toestand en voert dan pas 0006 uit — precies zoals de
// migratie straks op Neon over bestaande data heen loopt.
import { expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { eq } from "drizzle-orm";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { aiSuggestions, importRuns, projectDossiers, specLines } from "@/db/schema";
import initSql from "@/db/migrations/0000_init.sql?raw";
import searchSql from "@/db/migrations/0001_search_and_visibility.sql?raw";
import authSql from "@/db/migrations/0002_auth.sql?raw";
import viewSql from "@/db/migrations/0003_view_sustainability.sql?raw";
import vijfstatussenSql from "@/db/migrations/0004_vijfstatussen.sql?raw";
import h2h3Sql from "@/db/migrations/0005_h2_h3.sql?raw";
import projectstatusSql from "@/db/migrations/0006_projectstatus_ai.sql?raw";

test("nieuw dossier: status default 'concept', xis_phase default 'start'", async () => {
  const db = await createTestDb();
  const [d] = await db
    .insert(projectDossiers)
    .values({ name: "Nieuw project" })
    .returning();
  expect(d.status).toBe("concept");
  expect(d.xisPhase).toBe("start");
  // De veilige engine-stand blijft via `phase` geregeld (regel 4).
  expect(d.phase).toBe("tender");
});

test("import_runs: raw_markdown (B2) round-trip, nullable", async () => {
  const db = await createTestDb();
  const [d] = await db
    .insert(projectDossiers)
    .values({ name: "Project met PDF" })
    .returning();
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: d.id,
      source: "pdf",
      rows: [],
      rawMarkdown: "## Pagina 1\n\nLp301 — 12 st — downlight 3000K",
    })
    .returning();
  expect(run.rawMarkdown).toContain("Lp301");
  // Zonder markdown (csv/handmatig) blijft het veld gewoon leeg.
  const [zonder] = await db
    .insert(importRuns)
    .values({ dossierId: d.id, source: "csv", rows: [] })
    .returning();
  expect(zonder.rawMarkdown).toBeNull();
});

test("ai_suggestions: rij met defaults, cascade bij verwijderen spec-regel", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart Lotis 82",
  });
  const [d] = await db
    .insert(projectDossiers)
    .values({ name: "Vangnet-project" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({ dossierId: d.id, fixtureCode: "Lp301" })
    .returning();

  const [s] = await db
    .insert(aiSuggestions)
    .values({
      specLineId: line.id,
      productId,
      rationale: "Zelfde merk en typenummer als gevraagd; exacte code-match.",
      model: "claude-haiku",
      inputTokens: 1200,
      outputTokens: 85,
    })
    .returning();
  expect(s.id).toBeTruthy();
  expect(s.createdAt).toBeInstanceOf(Date);
  expect(s.dismissedAt).toBeNull();
  expect(s.dismissedBy).toBeNull();

  // Token-defaults (0) als ze niet meegegeven worden.
  const [kaal] = await db
    .insert(aiSuggestions)
    .values({
      specLineId: line.id,
      productId,
      rationale: "Tweede suggestie zonder tokentelling.",
      model: "claude-haiku",
    })
    .returning();
  expect(kaal.inputTokens).toBe(0);
  expect(kaal.outputTokens).toBe(0);

  // Regel weg → suggesties weg (ON DELETE CASCADE).
  await db.delete(specLines).where(eq(specLines.id, line.id));
  expect(await db.select().from(aiSuggestions)).toHaveLength(0);
});

test("backfill 0006: bestaande dossiers krijgen juiste status/xis_phase, phase onaangetast", async () => {
  const client = await PGlite.create({ extensions: { pg_trgm } });
  for (const sql of [initSql, searchSql, authSql, viewSql, vijfstatussenSql, h2h3Sql]) {
    await client.exec(sql);
  }
  // De oude toestand, zoals die nu op Neon staat (vóór 0006).
  await client.exec(`
    INSERT INTO project_dossiers (id, name, phase, lifecycle) VALUES
      ('00000000-0000-0000-0000-000000000001', 'actief zonder estimate', 'tender', 'actief'),
      ('00000000-0000-0000-0000-000000000002', 'actief, estimate gestuurd', 'tender', 'actief'),
      ('00000000-0000-0000-0000-000000000003', 'opgeleverd', 'awarded', 'delivered'),
      ('00000000-0000-0000-0000-000000000004', 'gearchiveerde tender', 'tender', 'archived');
    -- Bevroren quote = uitgestuurde estimate (alleen dossier 2).
    INSERT INTO quotes (dossier_id, frozen_at)
      VALUES ('00000000-0000-0000-0000-000000000002', now());
    -- Niet-bevroren quote op dossier 1: mag géén 'estimate_gestuurd' opleveren.
    INSERT INTO quotes (dossier_id)
      VALUES ('00000000-0000-0000-0000-000000000001');
  `);

  await client.exec(projectstatusSql);

  const { rows } = await client.query<{
    name: string;
    status: string;
    xis_phase: string;
    phase: string;
  }>(`SELECT name, status, xis_phase, phase FROM project_dossiers ORDER BY id`);
  expect(rows).toEqual([
    { name: "actief zonder estimate", status: "concept", xis_phase: "tender", phase: "tender" },
    { name: "actief, estimate gestuurd", status: "estimate_gestuurd", xis_phase: "tender", phase: "tender" },
    { name: "opgeleverd", status: "gegund", xis_phase: "deal_making", phase: "awarded" },
    { name: "gearchiveerde tender", status: "archief", xis_phase: "tender", phase: "tender" },
  ]);

  // Een dossier dat ná 0006 ontstaat krijgt wél de nieuwe defaults.
  await client.exec(`INSERT INTO project_dossiers (name) VALUES ('nieuw na 0006')`);
  const vers = await client.query<{ status: string; xis_phase: string }>(
    `SELECT status, xis_phase FROM project_dossiers WHERE name = 'nieuw na 0006'`,
  );
  expect(vers.rows[0]).toEqual({ status: "concept", xis_phase: "start" });
});
