// Import-voorstel: bevestigen maakt alléén spec_lines van de aangevinkte rows (OCR staat
// standaard uit), draait de matcher erop, en zet de run op 'bevestigd'. De niet-aangevinkte
// rij mag géén spec-regel worden — anders wordt er stilzwijgend iets geïmporteerd.
import { expect, test, vi } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { createDossier, getSpecLines } from "@/lib/repo/dossiers";
import {
  confirmImportRun,
  createImportRun,
  getImportRun,
  recordPdfImport,
} from "@/lib/repo/imports";
import { eq } from "drizzle-orm";
import { importRuns, type ImportRow } from "@/db/schema";
import { STATUS } from "@/components/dossier/status";

// A9: één regelbare crash in de matcher-lus, verder de échte matcher. Zolang
// `crashOpAanroep` null is gedraagt deze module zich exact als het origineel, zodat de
// tests hieronder hun echte statussen houden.
const harnas = vi.hoisted(() => ({ crashOpAanroep: null as number | null, aanroepen: 0 }));
vi.mock("@/lib/repo/matching", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/repo/matching")>();
  return {
    ...echt,
    runMatcher: async (...args: Parameters<typeof echt.runMatcher>) => {
      harnas.aanroepen++;
      if (harnas.crashOpAanroep === harnas.aanroepen) {
        // exact de fout die engine.ts zelf documenteert (:371-374)
        throw new Error("invalid input syntax for type integer");
      }
      return echt.runMatcher(...args);
    },
  };
});

test("bevestigen maakt alleen de aangevinkte rows tot spec_lines + matcht ze", async () => {
  const db = await createTestDb();
  // een merk in de catalogus zodat de matcher een echte status kan zetten
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { orgId: null, name: "Ziekenhuis Noord" });

  const rows: ImportRow[] = [
    {
      fixtureCode: "Lp301",
      quantity: 12,
      brandText: "XAL",
      productText: "SASSO 100",
      specs: { kelvin: 3000 },
      source: "ocr",
      page: 1,
      checked: true,
    },
    {
      // OCR-onzeker → standaard uitgevinkt; mag GEEN spec-regel worden
      fixtureCode: "Lx999",
      quantity: null,
      brandText: "??",
      productText: "onleesbaar",
      source: "ocr",
      page: 1,
      checked: false,
    },
    {
      fixtureCode: "Lw201",
      quantity: 8,
      brandText: "Wever & Ducré",
      productText: "SCAVA 1.0",
      source: "ocr",
      page: 2,
      checked: true,
    },
  ];

  const run = await createImportRun(db, {
    dossierId: dossier.id,
    source: "ocr",
    filename: "armaturenboek.pdf",
    rows,
    confidence: "middel",
    actor: "test",
  });
  expect(run.status).toBe("voorstel");

  // de mens vinkt alleen rij 0 en rij 2 aan
  const { created } = await confirmImportRun(db, run.id, [0, 2], "test");
  expect(created).toHaveLength(2);

  const lines = await getSpecLines(db, dossier.id);
  const codes = lines.map((l) => l.fixtureCode).sort();
  expect(codes).toEqual(["Lp301", "Lw201"]);
  // de uitgevinkte OCR-rij is nergens beland
  expect(codes).not.toContain("Lx999");

  // elke nieuwe regel heeft een geldige status gekregen (matcher heeft gedraaid) + herkomst
  for (const l of lines) {
    expect(Object.keys(STATUS)).toContain(l.status);
    expect(l.source).toBe("ocr");
  }
  // Lp301 matcht het gezaaide XAL-product → groen; herkomst-confidence overgenomen
  const lp301 = lines.find((l) => l.fixtureCode === "Lp301")!;
  expect(lp301.status).toBe("groen");

  // run staat na bevestigen op 'bevestigd'
  const after = await getImportRun(db, run.id);
  expect(after?.status).toBe("bevestigd");
});

// B2/stap 5: een PDF-import maakt direct een bevestigde run mét markdown-controlespoor,
// en de spec-regels verwijzen via importRunId terug naar die run (herkomst blijft vindbaar).
test("recordPdfImport: run 'bevestigd' mét rawMarkdown, regels gematcht + gekoppeld", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { orgId: null, name: "Museum West" });

  const markdown = "## Pagina 1\n\nLp301 XAL SASSO 100 3000K 20";
  const { run, created } = await recordPdfImport(db, {
    dossierId: dossier.id,
    filename: "armaturenboek.pdf",
    lines: [
      {
        fixtureCode: "Lp301",
        quantity: 1,
        brandText: "XAL",
        productText: "SASSO 100",
        reqKelvin: 3000,
      },
    ],
    rawMarkdown: markdown,
    actor: "test",
  });

  // de run is direct het controlespoor: bevestigd, met markdown, counts en bestandsnaam
  expect(run.status).toBe("bevestigd");
  expect(run.source).toBe("pdf");
  expect(run.filename).toBe("armaturenboek.pdf");
  expect(run.rawMarkdown).toBe(markdown);
  expect(run.counts).toEqual({ total: 1, checked: 1 });

  // de regel bestaat, is gematcht (matcher heeft gedraaid) en wijst terug naar de run
  expect(created).toHaveLength(1);
  expect(created[0].importRunId).toBe(run.id);
  const lines = await getSpecLines(db, dossier.id);
  expect(lines).toHaveLength(1);
  expect(lines[0].fixtureCode).toBe("Lp301");
  expect(lines[0].source).toBe("pdf");
  expect(lines[0].status).toBe("groen");

  // terug te lezen via getImportRun (de importrun-pagina + downloadroute doen dit)
  const terug = await getImportRun(db, run.id);
  expect(terug?.rawMarkdown).toBe(markdown);
});

test("recordPdfImport: geen tekstlaag → run zonder regels, notitie als controlespoor", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { orgId: null, name: "Beeld-PDF" });
  const { run, created } = await recordPdfImport(db, {
    dossierId: dossier.id,
    filename: "scan.pdf",
    lines: [],
    rawMarkdown: "> geen tekstlaag aangetroffen",
  });
  expect(run.status).toBe("bevestigd");
  expect(run.counts).toEqual({ total: 0, checked: 0 });
  expect(run.rawMarkdown).toBe("> geen tekstlaag aangetroffen");
  expect(created).toHaveLength(0);
  expect(await getSpecLines(db, dossier.id)).toHaveLength(0);
});

test("annuleren/re-run: een al bevestigde run voegt niets extra toe (idempotent)", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { orgId: null, name: "Kantoor Zuid" });
  const rows: ImportRow[] = [
    { fixtureCode: "A1", quantity: 1, brandText: "X", productText: "y", source: "csv", checked: true },
  ];
  const run = await createImportRun(db, {
    dossierId: dossier.id,
    source: "csv",
    rows,
  });
  await confirmImportRun(db, run.id, [0]);
  // tweede keer bevestigen mag geen dubbele regel maken
  const second = await confirmImportRun(db, run.id, [0]);
  expect(second.created).toHaveLength(0);
  const lines = await getSpecLines(db, dossier.id);
  expect(lines).toHaveLength(1);
});

// A9 (reviewzwerm 2.5a, bewezen door de weerlegger): de idempotentietest hierboven dekt
// alleen een eerste aanroep die sláágde. De echte toestand is de halve mislukking: de
// regels staan er, de matcher klapt, de run blijft op 'voorstel' → tweede klik op
// Bevestigen verdubbelt het dossier.
test("A9: crasht de matcher halverwege, dan blijft het bij één set regels (geen duplicaten)", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { orgId: null, name: "Halve import" });
  const rows: ImportRow[] = [
    { fixtureCode: "A1", quantity: 10, brandText: "X", productText: "y", source: "csv", checked: true },
    { fixtureCode: "A2", quantity: 4, brandText: "X", productText: "y", source: "csv", checked: true },
    { fixtureCode: "A3", quantity: 6, brandText: "X", productText: "y", source: "csv", checked: true },
  ];
  const run = await createImportRun(db, { dossierId: dossier.id, source: "csv", rows });

  harnas.aanroepen = 0;
  harnas.crashOpAanroep = 2; // regel 2 van 3
  await expect(confirmImportRun(db, run.id, [0, 1, 2])).rejects.toThrow(
    /invalid input syntax/,
  );
  harnas.crashOpAanroep = null;

  // de regels stáán er — dat was en blijft zo, er is geen transactie om op terug te vallen
  expect(await getSpecLines(db, dossier.id)).toHaveLength(3);
  // …maar de run is bevestigd, dus de poort staat dicht (vóór de fix: 'voorstel')
  expect((await getImportRun(db, run.id))?.status).toBe("bevestigd");

  // de gebruiker klikt nogmaals op Bevestigen
  const tweede = await confirmImportRun(db, run.id, [0, 1, 2]);
  expect(tweede.created).toHaveLength(0);
  // vóór de fix stonden hier 6 regels: verdubbelde aantallen op het klantstuk
  expect(await getSpecLines(db, dossier.id)).toHaveLength(3);
});

// Race (fix 20 aug 2026): twee gelijktijdige bevestigingen (dubbelklik, twee tabbladen)
// lazen allebei 'voorstel' en maakten allebei regels aan. De poort is nu een atomaire
// claim: UPDATE … SET status='bevestigen_bezig' WHERE status='voorstel' RETURNING.
// PGlite is single-connection, dus we testen het contract: een run die al geclaimd is
// ('bevestigen_bezig' — de toestand die de verliezer van de race aantreft) levert nul
// regels en de bestaande "al bevestigd"-uitkomst.
test("race: bevestigen van een al-geclaimde run ('bevestigen_bezig') maakt nul regels", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { orgId: null, name: "Dubbelklik" });
  const rows: ImportRow[] = [
    { fixtureCode: "A1", quantity: 3, brandText: "X", productText: "y", source: "csv", checked: true },
  ];
  const run = await createImportRun(db, { dossierId: dossier.id, source: "csv", rows });

  // de winnaar heeft geclaimd maar is nog bezig — dit is precies wat de verliezer ziet
  await db
    .update(importRuns)
    .set({ status: "bevestigen_bezig" })
    .where(eq(importRuns.id, run.id));

  const verliezer = await confirmImportRun(db, run.id, [0]);
  expect(verliezer.created).toHaveLength(0);
  expect(await getSpecLines(db, dossier.id)).toHaveLength(0);
  // de claim van de winnaar blijft staan — de verliezer zet niets terug
  expect((await getImportRun(db, run.id))?.status).toBe("bevestigen_bezig");
});
