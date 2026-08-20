// Tabel-import-repo (goal-import-meer-formaten): recordTableImport zet de regels
// direct in het dossier mét verplichte 'tabel'-review, en het bewijs dat
// recordPdfImport door de generalisatie (recordImport) byte-identiek bleef.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { events, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { createDossier } from "@/lib/repo/dossiers";
import { recordPdfImport, recordTableImport } from "@/lib/repo/imports";
import { startTableImport } from "@/lib/repo/source-files";

const ACTOR = "test@brinklicht.nl";

async function actionsFor(db: Awaited<ReturnType<typeof createTestDb>>, dossierId: string) {
  const rows = await db.select().from(events).where(eq(events.entityId, dossierId));
  return rows.map((e) => e.action);
}

test("recordTableImport: run 'bevestigd', regels source 'tabel' + rijnummer + verplichte review", async () => {
  const db = await createTestDb();
  // TWEE bijna-matches (watt 14 en 15 op gevraagd 12): allebei geel, dus geen
  // ondubbelzinnige auto-door — de matcher zet status geel MET reviewKind 'geel'.
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL",
    price: "310.00",
    maxWattage: 14,
  });
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 200 SQ SP CEIL",
    price: "340.00",
    maxWattage: 15,
  });
  const dossier = await createDossier(db, { orgId: null, name: "Tabelstaat" });

  const { run, created } = await recordTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.xlsx",
    lines: [
      {
        // onbekend merk → rood, geen matcher-review → verplichte 'tabel'-review
        fixtureCode: "Lp301",
        quantity: 12,
        brandText: "??",
        productText: "onbekend armatuur",
        sourcePage: 3, // rijnummer in het bronbestand
      },
      {
        fixtureCode: "Lw201",
        quantity: 4,
        brandText: "XAL",
        productText: "SASSO",
        reqWatt: 12,
        sourcePage: 7,
      },
    ],
    rawMarkdown: "| Code | Aantal |\n| --- | --- |\n| Lp301 | 12 |",
    actor: ACTOR,
  });

  expect(run.source).toBe("tabel");
  expect(run.status).toBe("bevestigd");
  expect(run.rawMarkdown).toContain("| Lp301 | 12 |");
  expect(run.counts).toEqual({ total: 2, checked: 2 });
  // rows-snapshot draagt het rijnummer (page) — herkomst blijft reconstrueerbaar
  expect(run.rows.map((r) => r.page)).toEqual([3, 7]);
  expect(created).toHaveLength(2);

  // rechtstreeks uit de tabel: getSpecLines projecteert sourcePage/importRunId weg
  const lines = await db
    .select()
    .from(specLines)
    .where(eq(specLines.dossierId, dossier.id));
  const lp301 = lines.find((l) => l.fixtureCode === "Lp301")!;
  const lw201 = lines.find((l) => l.fixtureCode === "Lw201")!;
  for (const l of [lp301, lw201]) {
    expect(l.source).toBe("tabel");
    expect(l.importRunId).toBe(run.id);
  }
  expect(lp301.sourcePage).toBe(3);
  expect(lw201.sourcePage).toBe(7);

  // B7-regel: de matcher-gele regel houdt 'geel' (één review dekt beide besluiten);
  // de regel zonder matcher-review krijgt de verplichte 'tabel'-review.
  expect(lw201.status).toBe("geel");
  expect(lw201.reviewKind).toBe("geel");
  expect(lp301.reviewKind).toBe("tabel");
  expect(lp301.status).toBe("blauw"); // onbekend merk = datagat

  // events: tabel_import_done op de run, GEEN vangnet-trigger (eerst de mens)
  const runEvents = await db.select().from(events).where(eq(events.entityId, run.id));
  expect(runEvents.map((e) => e.action)).toContain("tabel_import_done");
  const dossierActions = await actionsFor(db, dossier.id);
  expect(dossierActions).toContain("import_run_created");
  expect(dossierActions.some((a) => a.startsWith("ai_vangnet"))).toBe(false);
});

test("gechunkt pad: recordTableImport vult de run van startTableImport (geen tweede run)", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { orgId: null, name: "Chunked" });
  const { run: gestart } = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.csv",
    actor: ACTOR,
  });
  expect(gestart.status).toBe("voorstel");

  const { run } = await recordTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.csv",
    lines: [{ fixtureCode: "Lp001", quantity: 1, sourcePage: 2 }],
    rawMarkdown: "| Lp001 |",
    existingRunId: gestart.id,
    actor: ACTOR,
  });
  expect(run.id).toBe(gestart.id);
  expect(run.status).toBe("bevestigd");
  expect(run.rows).toHaveLength(1);
});

// ── Het bewijs dat de generalisatie recordPdfImport NIET veranderde ──────────
test("recordPdfImport na de generalisatie: zelfde run-vorm, geen page-veld, geen review, wél vangnet", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { orgId: null, name: "PDF ongewijzigd" });

  const { run, created } = await recordPdfImport(db, {
    dossierId: dossier.id,
    filename: "armaturenboek.pdf",
    lines: [
      {
        fixtureCode: "Lp301",
        quantity: 12,
        brandText: "XAL",
        productText: "SASSO 100",
        reqKelvin: 3000,
      },
    ],
    rawMarkdown: "## Page 1\n\nLp301 XAL SASSO 100",
    actor: ACTOR,
  });

  // exact het oude rows-snapshot: source 'pdf', checked true, GEEN page-sleutel
  // (PDF-TOC-regels dragen geen sourcePage; het nieuwe page-veld verschijnt alleen
  // wanneer een regel er één heeft — dus hier nergens).
  expect(run.source).toBe("pdf");
  expect(run.status).toBe("bevestigd");
  expect(run.rows).toEqual([
    {
      fixtureCode: "Lp301",
      quantity: 12,
      brandText: "XAL",
      productText: "SASSO 100",
      reqArticleCode: null,
      zone: null,
      specs: { kelvin: 3000 },
      source: "pdf",
      checked: true,
    },
  ]);
  expect(run.counts).toEqual({ total: 1, checked: 1 });

  // regels: source 'pdf', géén verplichte tabel-review op het PDF-pad
  expect(created).toHaveLength(1);
  const [line] = await db
    .select()
    .from(specLines)
    .where(eq(specLines.dossierId, dossier.id));
  expect(line.source).toBe("pdf");
  expect(line.reviewKind).toBeNull();
  expect(line.sourcePage).toBeNull();

  // en de vangnet-trigger draait nog (zonder key: een skip-event, nooit stil)
  const dossierActions = await actionsFor(db, dossier.id);
  expect(dossierActions.some((a) => a.startsWith("ai_vangnet"))).toBe(true);
});
