// OCR-repo-laag (bouwstap 4) met PGlite + gemockte vision-client: end-to-end
// start → pagina's → finish (regels mét bron/review-flag, transcript, events,
// kosten), idempotent hervatten (B5), budget-stop (B4), de B2-harde eis dat
// alléén getOcrPageImage de bytes-kolom selecteert, en de dedupe/codeValid-keuzes.
import { expect, test } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { events, llmUsage, ocrPageImages, specLines, type ImportRow } from "@/db/schema";
import {
  addProductToBrand,
  createTestDb,
  seedBrandProduct,
  type TestDb,
} from "@/db/test-db";
import {
  OCR_MAX_EUR_PER_RUN,
  type OcrClient,
  type OcrMessageParams,
  type OcrResponse,
} from "@/lib/ai/ocr";
import { createDossier } from "@/lib/repo/dossiers";
import { getImportRun } from "@/lib/repo/imports";
import {
  finishOcrRun,
  getOcrPageImage,
  getOcrRunProgress,
  getOpenOcrRun,
  isJpegImage,
  processOcrPage,
  startOcrRun,
} from "@/lib/repo/ocr";
import { decideReview } from "@/lib/repo/review";

const ACTOR = "eduard@brinklicht.nl";
const USAGE = { input_tokens: 2000, output_tokens: 300 }; // → €0,0035 per pagina
const PAGE_COST = 0.0035;
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);

function mockClient(responses: Array<OcrResponse | Error>) {
  const calls: OcrMessageParams[] = [];
  const client: OcrClient = {
    async createMessage(params) {
      calls.push(params);
      const next = responses.shift();
      if (!next) throw new Error("mock-client: geen respons meer in het script");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

function toolResponse(regels: unknown, usage = USAGE): OcrResponse {
  return {
    content: [
      { type: "tool_use", id: "tu_1", name: "lever_regels", input: { regels } },
    ],
    stop_reason: "tool_use",
    usage,
  };
}

// Catalogus + dossier: XAL/SASSO (exacte kelvin → groen kan) en het merk
// "Wever & Ducré" (voor de splitBrandType-route als vision geen merk las).
async function seedWorld(db: TestDb) {
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    kelvin: 3000,
  });
  await db.insert(schema.brands).values({
    id: crypto.randomUUID(),
    name: "Wever & Ducré",
    slug: "wever-ducre",
  });
  const dossier = await createDossier(db, { name: "Deerns beeldboek" });
  return dossier.id;
}

async function eventsByAction(db: TestDb, action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

async function runLines(db: TestDb, runId: string) {
  return db
    .select()
    .from(specLines)
    .where(eq(specLines.importRunId, runId))
    .orderBy(asc(specLines.sortOrder));
}

// ── End-to-end: start → pagina's → finish ────────────────────────────────────
test("start → 3 pagina's → finish: regels, review-flags, transcript, events, kosten", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  const { run, resumed } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 3,
    actor: ACTOR,
  });
  expect(resumed).toBe(false);
  expect(run.source).toBe("ocr");
  expect(run.status).toBe("bevestigd"); // zoals recordPdfImport: geen voorstel-flow
  expect(run.ocrStatus).toBe("bezig");
  expect((await eventsByAction(db, "ocr_started")).length).toBe(1);

  // Pagina 1: een regel mét merk van vision, en één zónder (→ splitBrandType).
  const p1 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100 3000K",
          ruwe_tekst: "Lp301 XAL SASSO 100 3000K",
        },
        {
          armatuurcode: "Lw201",
          merk: null,
          type: null,
          ruwe_tekst: "Lw201 Wever & Ducré SCAVA 1.0",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p1).toMatchObject({ created: 2, duplicates: 0, costEur: PAGE_COST });

  // Pagina 2: duplicaat (Lp301 opnieuw) + een regel met ongeldig codeformaat.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100 3000K",
          ruwe_tekst: "Lp301 XAL SASSO 100 3000K (nogmaals)",
        },
        {
          armatuurcode: "SASSO-999",
          merk: "XAL",
          type: "mystery fitting",
          ruwe_tekst: "SASSO-999 XAL mystery fitting",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 1, duplicates: 1 });

  // Pagina 3: leeg (foto/plattegrond) — een lege lijst is een goed antwoord.
  const p3 = await processOcrPage(db, {
    runId: run.id,
    page: 3,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([toolResponse([])]).client,
    actor: ACTOR,
  });
  expect(p3).toMatchObject({ created: 0, duplicates: 0 });

  // Spec-regels: bron, pagina, vertrouwen, review-flag.
  const lines = await runLines(db, run.id);
  expect(lines.map((l) => l.fixtureCode)).toEqual(["Lp301", "Lw201", "SASSO-999"]);
  const [lp, lw, bad] = lines;
  expect(lp.source).toBe("ocr");
  expect(lp.sourcePage).toBe(1);
  expect(lp.sourceConfidence).toBe("middel");
  expect(lp.brandText).toBe("XAL");
  expect(lp.reqKelvin).toBe(3000); // parseProductName over de gelezen typetekst
  // vision gaf geen merk → deterministisch geknipt met splitBrandType
  expect(lw.brandText).toBe("Wever & Ducré");
  expect(lw.productText).toBe("SCAVA 1.0");
  // codeValid=false gaat WÉL mee, maar eerlijk gemarkeerd als 'laag'
  expect(bad.sourceConfidence).toBe("laag");
  expect(bad.sourcePage).toBe(2);
  // B7: elke OCR-regel zonder andere review-flag krijgt reviewKind 'ocr'
  for (const l of lines) expect(l.reviewKind).toBe("ocr");

  // Run-snapshot: álle gelezen regels (ook het duplicaat, checked=false) + counts.
  const snapshot = await getImportRun(db, run.id);
  const rows = (snapshot!.rows ?? []) as ImportRow[];
  expect(rows.length).toBe(4);
  expect(rows.filter((r) => r.checked).length).toBe(3);
  expect(rows[2]).toMatchObject({ fixtureCode: "Lp301", page: 2, checked: false });
  expect(snapshot!.counts).toMatchObject({ total: 4, checked: 3, pageCount: 3 });

  // Voortgang (zonder bytes): 3/3 pagina's, kosten = 3 × paginaprijs.
  const progress = await getOcrRunProgress(db, run.id);
  expect(progress).toMatchObject({
    ocrStatus: "bezig",
    pagesDone: 3,
    pagesTotal: 3,
    linesCreated: 3,
  });
  expect(progress!.costEur).toBeCloseTo(3 * PAGE_COST, 6);

  // Afronden: eerlijk transcript (B6), status klaar, ocr_done met totalen.
  const finished = await finishOcrRun(db, { runId: run.id, actor: ACTOR });
  expect(finished.ocrStatus).toBe("klaar");
  const md = finished.rawMarkdown!;
  expect(md).toContain("# OCR transcript (model output)");
  expect(md).toContain("not the source document"); // kopregel zegt wat dit is
  expect(md).toContain("## Page 1");
  expect(md).toContain("Lw201 Wever & Ducré SCAVA 1.0");
  expect(md).toContain("Lp301 XAL SASSO 100 3000K (nogmaals)"); // óók het duplicaat
  expect(md).toContain("## Page 3\n\n_no luminaire rows read_");

  const done = await eventsByAction(db, "ocr_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ pages: 3, regels: 3, rowsRead: 4 });
  expect(
    (done[0].payload as { costEur: number }).costEur,
  ).toBeCloseTo(3 * PAGE_COST, 6);
  expect((await eventsByAction(db, "ocr_page_done")).length).toBe(3);

  // Vangnet (B8): hier bewust NIET getriggerd — geen skip/failed/done-event ervan.
  for (const a of ["ai_vangnet_done", "ai_vangnet_failed", "ai_vangnet_skipped"]) {
    expect((await eventsByAction(db, a)).length).toBe(0);
  }

  // Afgerond = geen openstaande run meer (de hervat-knop verdwijnt).
  expect(await getOpenOcrRun(db, dossierId)).toBeNull();

  // Idempotent afronden: tweede finish doet niets nieuws.
  await finishOcrRun(db, { runId: run.id, actor: ACTOR });
  expect((await eventsByAction(db, "ocr_done")).length).toBe(1);
});

// ── B7: matcher-flags gaan vóór de ocr-flag ──────────────────────────────────
test("regel die de matcher op geel zet houdt reviewKind 'geel' (niet 'ocr')", async () => {
  const db = await createTestDb();
  // Twee schone gele kandidaten (watt 14 op gevraagd 12 → geel, geen auto-door).
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000,
    maxWattage: 14,
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "VELA ROUND 900",
    kelvin: 3000,
    maxWattage: 14,
  });
  const dossier = await createDossier(db, { name: "Geel blijft geel" });
  const { run } = await startOcrRun(db, {
    dossierId: dossier.id,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });

  const result = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lk410",
          merk: "XAL",
          type: "VELA ROUND 12W 3000K",
          ruwe_tekst: "Lk410 XAL VELA ROUND 12W 3000K",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(result).toMatchObject({ created: 1 });

  const [line] = await runLines(db, run.id);
  expect(line.reqWatt).toBe("12.00"); // parseProductName las 12W als eis
  expect(line.status).toBe("geel");
  // De geel-review dekt lezing én match — de ocr-flag overschrijft hem niet (B7).
  expect(line.reviewKind).toBe("geel");
});

// ── Item C (docs/probleem-ocr-toc-verdringt-specs.md): specs staan vaak alleen
// in het langere ruweTekst-veld, niet in het korte type-veld — regelToSpecLine
// moet dus over ruweTekst + type parsen, niet alleen over type.
test("specs uit ruweTekst komen door ook als het korte type-veld ze niet noemt", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });

  const result = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          // Let op: "CRI ≥ 90" zonder dubbele punt — parseCri (lib/enrichment/
          // parser.ts) matcht niet als er een ":" direct na "CRI" staat (\s*
          // laat geen ":" toe); dat is bestaand parser-gedrag, buiten de scope
          // van item C (alleen regelToSpecLine hier).
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(result).toMatchObject({ created: 1 });

  const [line] = await runLines(db, run.id);
  expect(line.reqWatt).toBe("17.90");
  expect(line.reqKelvin).toBe(3000);
  expect(line.reqCri).toBe(90);
});

// ── Hervatten (B5): idempotent per pagina en per run ─────────────────────────
test("zelfde pagina 2× → alreadyDone, geen dubbele kosten; zelfde bestand → run hervat", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 5,
    actor: ACTOR,
  });

  const regels = [
    {
      armatuurcode: "Lp301",
      merk: "XAL",
      type: "SASSO 100",
      ruwe_tekst: "Lp301 XAL SASSO 100",
    },
  ];
  const first = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([toolResponse(regels)]).client,
    actor: ACTOR,
  });
  expect(first).toMatchObject({ created: 1 });

  // Nogmaals pagina 1 (tab dichtgeklapt, loop opnieuw): de beeldrij-lock weigert
  // VÓÓR de vision-call — de mock heeft geen respons meer en zou anders gooien.
  const again = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([]).client,
    actor: ACTOR,
  });
  expect(again).toEqual({ alreadyDone: true });

  // Geen dubbele kosten, geen dubbele regels, geen dubbele beeldrij.
  expect(
    (await db.select().from(llmUsage).where(eq(llmUsage.importRunId, run.id)))
      .length,
  ).toBe(1);
  expect((await runLines(db, run.id)).length).toBe(1);

  // B5/stap 5: de projectpagina ziet de openstaande run (voor de hervat-knop).
  const open = await getOpenOcrRun(db, dossierId);
  expect(open).toMatchObject({
    runId: run.id,
    filename: "boek.pdf",
    pagesDone: 1,
    pagesTotal: 5,
  });

  // Zelfde dossier + bestand + 'bezig' → géén tweede run, maar hervatten.
  const resumedStart = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 5,
    actor: ACTOR,
  });
  expect(resumedStart.resumed).toBe(true);
  expect(resumedStart.run.id).toBe(run.id);
  // O4: gedane TEGELS — een hele-pagina-run levert tile 0 per pagina.
  expect(resumedStart.doneTiles).toEqual([{ page: 1, tile: 0 }]);
  expect((await eventsByAction(db, "ocr_resumed")).length).toBe(1);
  expect((await eventsByAction(db, "ocr_started")).length).toBe(1);

  // Een ánder bestand is wel een nieuwe run.
  const other = await startOcrRun(db, {
    dossierId,
    filename: "ander-boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  expect(other.resumed).toBe(false);
  expect(other.run.id).not.toBe(run.id);
});

// ── Budget-stop (B4) ─────────────────────────────────────────────────────────
test("budget op → skipped, ocrStatus 'gestopt', event, beeldrij blijft staan", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 9,
    actor: ACTOR,
  });
  await db.insert(llmUsage).values({
    purpose: "ocr",
    costEur: OCR_MAX_EUR_PER_RUN.toFixed(4),
    importRunId: run.id,
  });

  const { client, calls } = mockClient([]);
  const result = await processOcrPage(db, {
    runId: run.id,
    page: 4,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client,
    actor: ACTOR,
  });
  expect(result).toEqual({ skipped: "budget_run", stopped: true });
  expect(calls.length).toBe(0);

  const after = await getImportRun(db, run.id);
  expect(after!.ocrStatus).toBe("gestopt");
  const skipped = await eventsByAction(db, "ocr_skipped_budget");
  expect(skipped.length).toBe(1);
  expect(skipped[0].payload).toMatchObject({ page: 4, reason: "budget_run" });
  // De beeldrij blijft staan (controlespoor; kost geen API-geld).
  const pages = await db
    .select({ page: ocrPageImages.page })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, run.id));
  expect(pages.map((p) => p.page)).toEqual([4]);
});

test("geen key en geen client → skipped no_key, run blijft 'bezig' (key terug = hervatten)", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  const result = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    actor: ACTOR,
  });
  expect(result).toEqual({ skipped: "no_key", stopped: false });
  expect((await getImportRun(db, run.id))!.ocrStatus).toBe("bezig");
  expect((await eventsByAction(db, "ocr_skipped_no_key")).length).toBe(1);

  // De beeldrij is weer weg: zonder lezing geen bewijs van verwerking — anders
  // telde getDonePages deze pagina als gedaan en zou het hervatten hem voorgoed
  // overslaan zonder melding.
  const pages = await db
    .select({ page: ocrPageImages.page })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, run.id));
  expect(pages).toEqual([]);
  const resumed = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  expect(resumed.resumed).toBe(true);
  expect(resumed.doneTiles).toEqual([]);

  // Key terug → precies deze pagina wordt alsnog gelezen (lock is echt vrij).
  const retried = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(retried).toMatchObject({ created: 1, duplicates: 0 });
  expect((await runLines(db, run.id)).map((l) => l.fixtureCode)).toEqual([
    "Lp301",
  ]);
});

// ── B2: alléén getOcrPageImage raakt de bytes-kolom ──────────────────────────
test("voortgangs-queries selecteren de bytes-kolom nooit; getOcrPageImage wél (round-trip)", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([toolResponse([])]).client,
    actor: ACTOR,
  });

  // Zelfde PGlite-client, maar mét query-logger: elke SQL-string wordt opgevangen.
  const queries: string[] = [];
  const spyDb = drizzle(db.$client, {
    schema,
    logger: { logQuery: (q: string) => void queries.push(q) },
  }) as TestDb;

  // Voortgang + open-run + hervat-start: bytes-vrij (B2) — geen query noemt de kolom.
  await getOcrRunProgress(spyDb, run.id);
  await getOpenOcrRun(spyDb, dossierId);
  await startOcrRun(spyDb, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });
  expect(queries.length).toBeGreaterThan(0);
  for (const q of queries) expect(q).not.toContain('"bytes"');

  // De ENIGE bytes-lezer: selecteert de kolom en levert het beeld intact terug.
  queries.length = 0;
  const image = await getOcrPageImage(spyDb, run.id, 1);
  expect(queries.some((q) => q.includes('"bytes"'))).toBe(true);
  expect(image).not.toBeNull();
  expect(image!.mime).toBe("image/jpeg");
  expect(image!.width).toBe(1568);
  expect(Array.from(image!.bytes)).toEqual(Array.from(IMAGE));

  // Onbekende pagina/run → null (de route maakt daar een 404 van).
  expect(await getOcrPageImage(db, run.id, 99)).toBeNull();
  expect(await getOcrPageImage(db, crypto.randomUUID(), 1)).toBeNull();
});

// ── Server-hardening: alleen échte JPEG-bytes (ocrPageAction weigert de rest) ─
test("isJpegImage: FF D8 = JPEG; PNG/lege/afgeknipte bytes → geweigerd", () => {
  expect(isJpegImage(IMAGE)).toBe(true); // de testfixture is een JPEG-header
  // PNG-magic (89 50 4E 47) — gedeclareerd mime doet er niet toe, bytes wel.
  expect(isJpegImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(
    false,
  );
  expect(isJpegImage(new Uint8Array([]))).toBe(false);
  expect(isJpegImage(new Uint8Array([0xff]))).toBe(false);
});

// ── Fout op één pagina: doorgaan; reservering blijft, beeldrij gaat weg ──────
test("vision-fout → {failed}, beeldrij weg (hervatten leest de pagina alsnog)", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  const failed = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([new Error("timeout na 30s")]).client,
    actor: ACTOR,
  });
  expect(failed).toEqual({ failed: "timeout na 30s" });
  expect((await runLines(db, run.id)).length).toBe(0);
  expect((await getImportRun(db, run.id))!.ocrStatus).toBe("bezig");

  // Zelfde klasse als de no_key-fix: de beeldrij is weer weg — zonder lezing geen
  // bewijs van verwerking. Bleef hij staan, dan telde getDonePages de pagina als
  // gedaan en zou het hervatten hem voorgoed overslaan. De llm_usage-reservering
  // blijft wél staan (conservatieve kostenpost).
  const pages = await db
    .select({ page: ocrPageImages.page })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, run.id));
  expect(pages).toEqual([]);
  expect((await db.select().from(llmUsage)).length).toBe(1); // de reservering

  // Hervatten leest precies deze pagina alsnog (het lock is echt vrij).
  const retried = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lw201",
          merk: null,
          type: null,
          ruwe_tekst: "Lw201 Wever & Ducré SCAVA 1.0",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(retried).toMatchObject({ created: 1, duplicates: 0 });

  // De run loopt door: pagina 2 slaagt gewoon.
  const ok = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(ok).toMatchObject({ created: 1 });
});

// ── Item A (docs/probleem-ocr-toc-verdringt-specs.md, Besluit fase 2): rijkste
// lezing wint de dedup — een ToC-rij (arm, geen specs) mag niet blijvend winnen
// van de detailpagina van dezelfde code (rijk, wél specs) die later langskomt.
test("ToC-lezing (arm) → detailpagina-lezing (rijk), zelfde code: de rijkere lezing wint", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  // Pagina 1: inhoudsopgave-achtige rij — code, merk, type, geen specs.
  const p1 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p1).toMatchObject({ created: 1, duplicates: 0, upgraded: 0 });

  const [afterPage1] = await runLines(db, run.id);
  expect(afterPage1.reqKelvin).toBeNull();
  expect(afterPage1.reqWatt).toBeNull();
  expect(afterPage1.sourcePage).toBe(1);

  // Pagina 2: detailpagina van dezelfde code — nu wél alle specs.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  // Zelfde spec_line-id, nu met de specs + herkomst van de tweede (rijkere) lezing.
  const linesAfter = await runLines(db, run.id);
  expect(linesAfter.length).toBe(1);
  const [upgraded] = linesAfter;
  expect(upgraded.id).toBe(afterPage1.id);
  expect(upgraded.reqWatt).toBe("17.90");
  expect(upgraded.reqKelvin).toBe(3000);
  expect(upgraded.reqCri).toBe(90);
  expect(upgraded.sourcePage).toBe(2);

  const upgradedEvents = await eventsByAction(db, "ocr_line_upgraded");
  expect(upgradedEvents.length).toBe(1);
  expect(upgradedEvents[0].payload).toMatchObject({
    fixtureCode: "Lp301",
    oldRichness: 0,
    newRichness: 3,
    oldPage: 1,
    newPage: 2,
  });
});

// ── Gelijke rijkdom: ties blijven bij de bestaande lezing (geen onnodige churn).
test("gelijke rijkdom blijft liggen: geen upgrade, geen tweede event, geen rematch", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100 3000K",
          ruwe_tekst: "Lp301 XAL SASSO 100 3000K",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });

  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          // Zelfde rijkdom (alleen kelvin) maar een andere waarde — als de upgrade
          // per ongeluk toch draait, zou dit zichtbaar worden (3200 i.p.v. 3000).
          type: "SASSO 100 3200K",
          ruwe_tekst: "Lp301 XAL SASSO 100 3200K (tweede lezing, zelfde rijkdom)",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 1, upgraded: 0 });

  const [line] = await runLines(db, run.id);
  expect(line.reqKelvin).toBe(3000); // de eerste (bestaande) lezing blijft staan
  expect(line.sourcePage).toBe(1);

  expect((await eventsByAction(db, "ocr_line_upgraded")).length).toBe(0);
  // Geen rematch: precies één matched_status-event voor deze regel (van de creatie).
  const matched = (await eventsByAction(db, "matched_status")).filter(
    (e) => e.entityId === line.id,
  );
  expect(matched.length).toBe(1);
});

// ── Spookmatch-fix, negatief geval: een mens-gekozen match die na de upgrade nog
// steeds klopt (staat nog gewoon in outcome.provable) mag NIET worden losgekoppeld.
// Reviewer-fix: de eerdere versie vergeleek de oude matchedProductId uitsluitend
// tegen outcome.unambiguousYellow (alleen gezet bij status 'geel'), waardoor élke
// groene, nog kloppende match — bereikbaar via de bestaande chooseCandidateAction-
// UI-flow — bij een upgrade onterecht werd losgekoppeld.
test("mens-gekozen match die na de upgrade nog steeds klopt: matchedProductId blijft staan", async () => {
  const db = await createTestDb();
  // P matcht de rijkere pagina-2-lezing EXACT (kelvin/cri/watt) — hoort dus na de
  // upgrade nog gewoon in outcome.provable te staan, niet alleen in unambiguousYellow.
  const { productId: productP } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    kelvin: 3000,
    cri: 90,
    maxWattage: 17.9,
  });
  const dossier = await createDossier(db, { name: "Nog steeds geldig na upgrade" });
  const { run } = await startOcrRun(db, {
    dossierId: dossier.id,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  // Pagina 1: arme ToC-lezing.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  const [beforeChoice] = await runLines(db, run.id);

  // Mens bevestigt expliciet product P (chooseCandidate-achtige, groene, aantoonbare keuze).
  await decideReview(db, {
    specLineId: beforeChoice.id,
    decision: "accepteer",
    productId: productP,
    reason: "handmatig bevestigd tijdens review",
    actor: "iemand@brink.nl",
  });
  const [afterChoice] = await runLines(db, run.id);
  expect(afterChoice.matchedProductId).toBe(productP);
  expect(afterChoice.status).toBe("groen");

  // Pagina 2: detailpagina — specs die exact bij P passen.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  const [afterUpgrade] = await runLines(db, run.id);
  // P is nog steeds een geldige (groene) kandidaat → GEEN spookmatch, dus blijft staan.
  expect(afterUpgrade.matchedProductId).toBe(productP);

  // De upgrade zelf wordt wél gelogd (specs zijn gewijzigd), maar zonder dat de
  // koppeling verdwijnt.
  const upgradedEvents = await eventsByAction(db, "ocr_line_upgraded");
  expect(upgradedEvents.length).toBe(1);
});

// ── Top-8-blinde-vlek (2e reviewronde): evaluateSpecLine's fetchCandidates heeft
// een default limit van 8 (lib/matching/engine.ts). Bij >8 matchende kandidaten
// voor hetzelfde merk/producttoken kan een nog steeds geldige, mens-gekozen match
// buiten die top-8 vallen — dan mag hij NIET als spookmatch gewist worden. De
// stillValid-toets moet het oude product dus rechtstreeks toetsen, los van de
// (gelimiteerde) kandidatenlijst van runMatcher.
test(">8 kandidaten voor hetzelfde merk/token: een mens-gekozen match buiten de top-8 blijft staan", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: ">8 kandidaten" });

  // 9 decoys matchen BEIDE producttext-tokens ("SASSO" én "100") → matchCount=2,
  // en vullen daarmee gegarandeerd de volledige top-8 van fetchCandidates
  // (desc(matchCount) staat voorop in de ORDER BY), ongeacht hun eigen specs.
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 Decoy 1",
  });
  for (let i = 2; i <= 9; i++) {
    await addProductToBrand(db, {
      brandId,
      priceListId,
      name: `SASSO 100 Decoy ${i}`,
    });
  }

  // P matcht maar één token ("SASSO", niet "100") → matchCount=1, dus altijd ná
  // de 9 decoys gerangschikt: gegarandeerd buiten de top-8 (limit=8), ongeacht
  // score/prefix-tiebreaks. Specs kloppen wél exact met de rijkere pagina-2-lezing.
  const { productId: productP } = await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO Special Edition",
    kelvin: 3000,
    cri: 90,
    maxWattage: 17.9,
  });

  const { run } = await startOcrRun(db, {
    dossierId: dossier.id,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  // Pagina 1: arme ToC-lezing.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  const [beforeChoice] = await runLines(db, run.id);

  // Mens kiest expliciet P — een product dat (net als bij een handmatige link)
  // niet per se in de standaard-kandidatenlijst hoeft te staan.
  await decideReview(db, {
    specLineId: beforeChoice.id,
    decision: "accepteer",
    productId: productP,
    reason: "handmatig bevestigd tijdens review",
    actor: "iemand@brink.nl",
  });
  const [afterChoice] = await runLines(db, run.id);
  expect(afterChoice.matchedProductId).toBe(productP);

  // Pagina 2: detailpagina met specs die exact bij P passen. P blijft buiten
  // fetchCandidates' top-8 (de 9 decoys matchen allebei de tokens, P maar één),
  // dus outcome.provable/unambiguousYellow van déze hermatch bevatten P niet —
  // de directe toets op P zélf moet hem tóch als geldig herkennen.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  const [afterUpgrade] = await runLines(db, run.id);
  // P is nog steeds geldig (directe toets), ondanks dat hij buiten de top-8 van
  // de gelimiteerde kandidatenzoektocht valt → GEEN spookmatch-clear.
  expect(afterUpgrade.matchedProductId).toBe(productP);
  // CodeRabbit (PR #4, Major): matchedProductId behouden is niet genoeg — runMatcher
  // kende de regel zonet zijn eigen (top-8-beperkte) status toe, die "rood"/"open"
  // kan zijn terwijl P bij directe toetsing nog groen-waardig is. Zonder reconciliatie
  // zou deze regel met een geldige match tóch buiten generateQuote/de estimate vallen.
  expect(afterUpgrade.status).toBe("groen");
  expect(afterUpgrade.deviations).not.toBeNull();

  const upgradedEvents = await eventsByAction(db, "ocr_line_upgraded");
  expect(upgradedEvents.length).toBe(1);
});

// ── CodeRabbit (PR #4, Major, vierde reviewronde): stillValid (!hasRed &&
// !hasUnknown) is NIET hetzelfde als "groen". Een product zonder rode/onbekende
// afwijkingen kan best een gele afwijking dragen (bv. watt binnen de gele
// tolerantiezone, niet de exacte marge) — de status hoort dan "geel" te worden,
// niet hardcoded "groen". requested watt=10/delivered=12 → dev=20% →
// judgeWatt/pctVerdict(0.10, 0.40) geeft "geel" (empirisch bevestigd door de
// reviewer), terwijl hasRed/hasUnknown allebei false blijven.
test("stillValid met een gele afwijking (watt binnen tolerantie, niet exact): status wordt geel, niet groen", async () => {
  const db = await createTestDb();
  // P levert exact de gevraagde kelvin (groen), maar 12W tegen een straks
  // gevraagde 10W — 20% afwijking, binnen de gele zone (10–40%).
  const { productId: productP } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    kelvin: 3000,
    maxWattage: 12,
  });
  const dossier = await createDossier(db, { name: "Stillvalid-maar-geel" });
  const { run } = await startOcrRun(db, {
    dossierId: dossier.id,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  // Pagina 1: arme ToC-lezing.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  const [beforeChoice] = await runLines(db, run.id);

  // Mens bevestigt expliciet product P.
  await decideReview(db, {
    specLineId: beforeChoice.id,
    decision: "accepteer",
    productId: productP,
    reason: "handmatig bevestigd tijdens review",
    actor: "iemand@brink.nl",
  });

  // Pagina 2: detailpagina — vraagt 10W (P levert 12W: geel, geen rood/onbekend).
  // Geen CRI in de tekst, dus geen cri-deviation (req.cri blijft null).
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 10 W. " +
            "Kleurtemperatuur: 3000 K.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  const [afterUpgrade] = await runLines(db, run.id);
  // P blijft de match (geen rood/onbekend → geen spookmatch-clear) — maar de
  // status moet de gele watt-afwijking weerspiegelen, niet hardcoded groen.
  expect(afterUpgrade.matchedProductId).toBe(productP);
  expect(afterUpgrade.status).toBe("geel");
  expect(afterUpgrade.deviations).toContainEqual(
    expect.objectContaining({ field: "watt", verdict: "geel" }),
  );
});

// ── CodeRabbit (PR #4, Major): de "checked terugzetten"-loop in processOcrPage
// doorzocht alleen priorRows (vorige pagina's), niet de newRows die al binnen
// DEZELFDE pagina zijn opgebouwd. Als vision per ongeluk twee keer dezelfde code
// op één pagina aflevert (arme lezing gevolgd door een rijkere), bleven beide
// rijen checked:true staan en liep counts.checked ten onrechte op.
test("dezelfde code twee keer op één pagina (arm dan rijk): precies één regel telt als checked", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });

  const p1 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p1).toMatchObject({ created: 1, duplicates: 0, upgraded: 1 });

  const lines = await runLines(db, run.id);
  expect(lines.length).toBe(1);

  const updatedRun = await getImportRun(db, run.id);
  const rows = (updatedRun?.rows ?? []) as ImportRow[];
  expect(rows.filter((r) => r.fixtureCode === "Lp301")).toHaveLength(2);
  expect(rows.filter((r) => r.checked).length).toBe(1);
  expect(updatedRun?.counts?.checked).toBe(1);
});

// ── KRITIEK: een mens had de arme lezing al goedgekeurd (matchedProductId + chosenBy)
// vóórdat de rijkere detailpagina langskwam. Twee reviewer-gaten uit het besluit-
// document (spookmatch + audit-bewaring) moeten hier allebei standhouden.
test("mens had de arme lezing al goedgekeurd: upgrade maakt de spookmatch los, bewaart de oude keuze in het event", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  // X: een mens-gekozen product dat met GEEN redelijke lezing van "XAL SASSO 100"
  // zou matchen (ander merk) — zo kan de rematch X nooit toevallig weer kiezen.
  const { productId: productX } = await seedBrandProduct(db, {
    brand: "Zonneveld Verlichting",
    name: "Onbedoeld gekozen product",
    kelvin: 6500,
  });

  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });

  // Pagina 1: arme ToC-lezing.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  const [beforeChoice] = await runLines(db, run.id);

  // Een mens keurt de lezing/match goed en kiest expliciet product X.
  await decideReview(db, {
    specLineId: beforeChoice.id,
    decision: "accepteer",
    productId: productX,
    reason: "handmatig gekozen tijdens review",
    actor: "iemand@brink.nl",
  });
  const [afterChoice] = await runLines(db, run.id);
  expect(afterChoice.matchedProductId).toBe(productX);

  // Pagina 2: de detailpagina met specs die NIET bij X passen (X is 6500K, hier
  // vraagt de lezing 3000K van een heel ander merk-gebonden product).
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  const [afterUpgrade] = await runLines(db, run.id);
  // Spookmatch-fix: de oude (mens-gekozen) koppeling is losgemaakt, niet blijven hangen.
  expect(afterUpgrade.matchedProductId).not.toBe(productX);
  expect(afterUpgrade.matchedProductId).toBeNull();

  // Audit-bewaring: de oude keuze verdwijnt niet stilzwijgend uit het logboek.
  const upgradedEvents = await eventsByAction(db, "ocr_line_upgraded");
  expect(upgradedEvents.length).toBe(1);
  expect(upgradedEvents[0].payload).toMatchObject({
    fixtureCode: "Lp301",
    previousChoice: {
      productId: productX,
      chosenBy: "iemand@brink.nl",
    },
  });
});

// ── O4 (goal-import-ai-leesroute stap 5): A3-tiling — het lock, de dedup en de
// voortgang werken per TEGEL. tile 0 = hele pagina (invariant); alle tests
// hierboven draaien zonder tile-opt en pinnen dus het oude gedrag vast.
test("zelfde (page, tile) 2× → alreadyDone zonder tweede reservering", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });

  const first = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 1,
    tileCount: 12,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(first).toMatchObject({ created: 1 });

  // Zelfde tegel opnieuw: het (run, page, tile)-lock weigert VÓÓR de vision-call
  // (de mock heeft geen respons meer en zou anders gooien) — geen tweede
  // reservering, geen dubbele kosten.
  const again = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 1,
    tileCount: 12,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([]).client,
    actor: ACTOR,
  });
  expect(again).toEqual({ alreadyDone: true });
  expect(
    (await db.select().from(llmUsage).where(eq(llmUsage.importRunId, run.id)))
      .length,
  ).toBe(1);
});

test("twee verschillende tegels van dezelfde pagina: beide verwerkt; beeldtoegang per tegel", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });
  // Tweede JPEG met andere bytes (wel FF D8) om de tegel-selectie te bewijzen.
  const IMAGE_T2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 5, 4, 3, 2]);

  const t1 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 1,
    tileCount: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100 3000K",
          ruwe_tekst: "Lp301 XAL SASSO 100 3000K",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(t1).toMatchObject({ created: 1 });

  // Tegel 2 van dezelfde pagina is GEEN alreadyDone: eigen lock, eigen call.
  const t2 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 2,
    tileCount: 2,
    imageBytes: IMAGE_T2,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lw201",
          merk: null,
          type: null,
          ruwe_tekst: "Lw201 Wever & Ducré SCAVA 1.0",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(t2).toMatchObject({ created: 1 });

  // Beide regels dragen de ECHTE pagina, niet het tegelnummer.
  const lines = await runLines(db, run.id);
  expect(lines.map((l) => l.sourcePage)).toEqual([1, 1]);

  // Elke tegel z'n eigen kostenrij; de done-events dragen het tegelnummer.
  expect(
    (await db.select().from(llmUsage).where(eq(llmUsage.importRunId, run.id)))
      .length,
  ).toBe(2);
  const done = await eventsByAction(db, "ocr_page_done");
  expect(
    done.map((d) => (d.payload as { tile: number }).tile).sort(),
  ).toEqual([1, 2]);

  // Beeldtoegang (B2 + O4): zonder tile de LAAGSTE tegel; mét tile exact die
  // tegel; een niet-bestaande tegel → null (de route maakt daar een 404 van).
  const lowest = await getOcrPageImage(db, run.id, 1);
  expect(Array.from(lowest!.bytes)).toEqual(Array.from(IMAGE));
  const exact = await getOcrPageImage(db, run.id, 1, 2);
  expect(Array.from(exact!.bytes)).toEqual(Array.from(IMAGE_T2));
  expect(await getOcrPageImage(db, run.id, 1, 3)).toBeNull();
});

test("dedup over twee tegels: arme lezing op tegel 1, rijke op tegel 2 → upgrade, één checked", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });

  // Tegel 1: arme lezing (code + merk + type, geen specs — bv. de kop van de rij).
  const p1 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 1,
    tileCount: 12,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p1).toMatchObject({ created: 1, duplicates: 0, upgraded: 0 });

  // Tegel 2 (overlap of vervolg van dezelfde rij): rijke lezing mét specs.
  // ImportRow.page is de echte pagina, dus de bestaande rijkste-wint-dedup ziet
  // dit vanzelf als dezelfde code binnen dezelfde run — upgrade, geen duplicaat.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    tile: 2,
    tileCount: 12,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1568,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
            "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

  // Eén regel, geüpgraded met de specs; sourcePage = de ECHTE pagina.
  const lines = await runLines(db, run.id);
  expect(lines).toHaveLength(1);
  expect(lines[0].reqWatt).toBe("17.90");
  expect(lines[0].reqKelvin).toBe(3000);
  expect(lines[0].sourcePage).toBe(1);

  // Precies één rij checked:true in het run-snapshot (de rijkste lezing).
  const snapshot = await getImportRun(db, run.id);
  const rows = (snapshot!.rows ?? []) as ImportRow[];
  expect(rows.filter((r) => r.fixtureCode === "Lp301")).toHaveLength(2);
  expect(rows.filter((r) => r.checked)).toHaveLength(1);
  expect(snapshot!.counts?.checked).toBe(1);
});

test("voortgang per tegel: pagesDone = distinct pagina's, tilesDone = alle tegels; hervatten levert doneTiles", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 3,
    actor: ACTOR,
  });

  const leeg = () => mockClient([toolResponse([])]).client;
  // Pagina 1: twee tegels; pagina 2: één hele-pagina-beeld (tile 0, default).
  for (const opts of [
    { page: 1, tile: 1, tileCount: 12 },
    { page: 1, tile: 2, tileCount: 12 },
    { page: 2 },
  ]) {
    await processOcrPage(db, {
      runId: run.id,
      ...opts,
      imageBytes: IMAGE,
      mime: "image/jpeg",
      width: 1568,
      height: 1568,
      client: leeg(),
      actor: ACTOR,
    });
  }

  const progress = await getOcrRunProgress(db, run.id);
  expect(progress).toMatchObject({
    pagesDone: 2, // distinct pagina's (1 en 2)
    tilesDone: 3, // alle beeldrijen
    pagesTotal: 3,
  });

  // Hervatten: doneTiles gesorteerd op pagina, dan tegel; het ocr_resumed-event
  // draagt beide tellingen.
  const resumed = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 3,
    actor: ACTOR,
  });
  expect(resumed.resumed).toBe(true);
  expect(resumed.doneTiles).toEqual([
    { page: 1, tile: 1 },
    { page: 1, tile: 2 },
    { page: 2, tile: 0 },
  ]);
  const resumedEvents = await eventsByAction(db, "ocr_resumed");
  expect(resumedEvents).toHaveLength(1);
  expect(resumedEvents[0].payload).toMatchObject({ tilesDone: 3, pagesDone: 2 });
});

// ── O6 (stap 6): aantallen — lezen, mergen en backfillen, nooit verzinnen ────
// De Dordrecht-flow: de armaturenlijst (specs, geen aantallen) en de
// aantallen-lijst (pen-aantallen, spec-arm) gaan door dezelfde run. Een gelezen
// aantal mag nooit verloren gaan aan de rijkste-wint-dedup, en een lezing
// zonder aantal mag een eerder aantal nooit wissen.
test("O6: aantal uit de tool-output landt als quantity; zonder aantal blijft hij null", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 1,
    actor: ACTOR,
  });
  const result = await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100",
          aantal: 124, // het geverifieerde pen-aantal
        },
        {
          armatuurcode: "Lp302",
          merk: "XAL",
          type: "SASSO 200",
          ruwe_tekst: "Lp302 XAL SASSO 200",
          // geen aantal geleverd → null, nooit default 1
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(result).toMatchObject({ created: 2 });
  const lines = await runLines(db, run.id);
  const byCode = new Map(lines.map((l) => [l.fixtureCode, l]));
  expect(byCode.get("Lp301")!.quantity).toBe(124);
  expect(byCode.get("Lp302")!.quantity).toBeNull();
});

test("O6: rijkere spec-lezing zonder aantal wist het eerder gelezen aantal niet (merge)", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  // Pagina 1 = de aantallen-lijst: spec-arm maar mét pen-aantal.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Ad",
          merk: null,
          type: null,
          ruwe_tekst: "Ad 124",
          aantal: 124,
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  // Pagina 2 = de armaturenlijst: rijke specs, géén aantal → upgrade mét merge.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Ad",
          merk: "Signify",
          type: "GreenSpace",
          ruwe_tekst: "Ad Signify GreenSpace 3000 K CRI ≥ 90 IP44",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ upgraded: 1 });
  const lines = await runLines(db, run.id);
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(124); // gemerged, niet gewist
  expect(lines[0].reqKelvin).toBe(3000); // de rijkere specs wonnen wél
});

test("O6: armere lezing mét aantal backfillt alleen het aantal (event, geen hermatch-churn)", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { run } = await startOcrRun(db, {
    dossierId,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  // Pagina 1 = de armaturenlijst: rijke specs, geen aantal.
  await processOcrPage(db, {
    runId: run.id,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Ad",
          merk: "Signify",
          type: "GreenSpace",
          ruwe_tekst: "Ad Signify GreenSpace 3000 K CRI ≥ 90 IP44",
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  // Pagina 2 = de aantallen-lijst: spec-arm (verliest de rijkste-wint) mét aantal.
  const p2 = await processOcrPage(db, {
    runId: run.id,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    client: mockClient([
      toolResponse([
        {
          armatuurcode: "Ad",
          merk: null,
          type: null,
          ruwe_tekst: "Ad 124",
          aantal: 124,
        },
      ]),
    ]).client,
    actor: ACTOR,
  });
  // Duplicaat voor de rijkdom-telling, maar het aantal is wél bijgeschreven.
  expect(p2).toMatchObject({ duplicates: 1, upgraded: 0 });
  const lines = await runLines(db, run.id);
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(124);
  expect(lines[0].reqKelvin).toBe(3000); // de rijke lezing bleef intact
  const backfills = await db
    .select()
    .from(events)
    .where(eq(events.action, "ocr_quantity_backfilled"));
  expect(backfills).toHaveLength(1);
  expect(backfills[0].payload).toMatchObject({
    fixtureCode: "Ad",
    quantity: 124,
    page: 2,
  });
});
