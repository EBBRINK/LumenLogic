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
  expect(resumedStart.donePages).toEqual([1]);
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
  expect(resumed.donePages).toEqual([]);

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
