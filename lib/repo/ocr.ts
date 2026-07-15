// OCR-repo-laag (plan-ocr-beeld-pdf, bouwstap 4): run starten/hervatten (B5), per
// pagina beeldrij + vision + spec-regels + review-flag (B4/B7), afronden met een
// eerlijk transcript (B6), en de beeldtoegang (B2).
//
// Harde regels die hier leven:
//   • B2: alléén getOcrPageImage selecteert de bytes-kolom van ocr_page_images.
//     Álle andere queries (voortgang, run, review) noemen die kolom nooit —
//     anders sleept elke run-pagina megabytes beeld mee. PGlite-test bewijst dit.
//   • B4: de beeldrij is het per-pagina-lock. processOcrPage insert éérst de
//     beeldrij (unique(run,page)); conflict = pagina al gedaan → {alreadyDone}.
//     Pas daarná draait de vision-call. Zo is hervatten idempotent en kan een
//     dubbel verstuurde pagina nooit dubbel kosten.
//   • B7: reviewKind 'ocr' komt alleen op regels die nog GEEN reviewKind hebben.
//     Een matcher-gele regel of variant-flag blijft staan — "OCR goed gelezen" en
//     "match akkoord" zijn twee besluiten, en één regel draagt er hooguit één;
//     de geel-review dekt dan beide (plan B7).
//   • B8: finishOcrRun triggert het vangnet NIET. Een verhallucineerd merk mag
//     nooit de merkvergrendelde zoektool sturen vóór een mens de bron zag — de
//     vangnet-trigger komt in stap 7 vanuit de review-decide-flow.
//   • Regel 5: start/hervatten/skip/afronden krijgen elk hun event.
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  brands,
  importRuns,
  llmUsage,
  ocrPageImages,
  specLines,
  type ImportRow,
} from "@/db/schema";
import { isOcrPageSuccess, ocrPage, type OcrClient, type OcrRegel } from "@/lib/ai/ocr";
import { parseProductName } from "@/lib/enrichment/parser";
import { MARKDOWN_CAP, splitBrandType } from "@/lib/pdf/armaturenboek";
import { addSpecLines, type SpecLineInput } from "@/lib/repo/dossiers";
import { getImportRun } from "@/lib/repo/imports";
import { runMatcher } from "@/lib/repo/matching";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// ── Run starten of hervatten (B5) ────────────────────────────────────────────
// Eén lopende OCR-run per dossier+bestand: bestaat er al een run met ocrStatus
// 'bezig' voor precies dit bestand, dan is dít een hervatting (tab dichtgeklapt op
// pagina 14 → verder vanaf 15) en geven we die run terug in plaats van een tweede
// te beginnen. donePages voedt de client-loop (stap 5): die pagina's slaat hij over.
export async function startOcrRun(
  db: AppDb,
  input: {
    dossierId: string;
    filename: string;
    pageCount: number;
    actor?: string;
  },
) {
  const [existing] = await db
    .select()
    .from(importRuns)
    .where(
      and(
        eq(importRuns.dossierId, input.dossierId),
        eq(importRuns.source, "ocr"),
        eq(importRuns.filename, input.filename),
        eq(importRuns.ocrStatus, "bezig"),
      ),
    )
    .limit(1);
  if (existing) {
    const donePages = await getDonePages(db, existing.id);
    await logEvent(db, {
      entity: "import_run",
      entityId: existing.id,
      action: "ocr_resumed",
      actor: input.actor,
      payload: { filename: input.filename, pagesDone: donePages.length },
    });
    return { run: existing, resumed: true as const, donePages };
  }

  // Zoals recordPdfImport: geen voorstel-flow — de regels gaan direct het dossier in,
  // mét verplichte OCR-review (B9/Timo 2026-07-15). Status dus meteen 'bevestigd';
  // de OCR-voortgang leeft apart in ocrStatus. pageCount bewaren we in counts zodat
  // de voortgang (x/31) zonder extra kolom te tonen is.
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: "ocr",
      filename: input.filename,
      status: "bevestigd",
      rows: [],
      counts: { total: 0, checked: 0, pageCount: input.pageCount },
      ocrStatus: "bezig",
      actor: input.actor ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "import_run",
    entityId: run.id,
    action: "ocr_started",
    actor: input.actor,
    payload: {
      dossierId: input.dossierId,
      filename: input.filename,
      pageCount: input.pageCount,
    },
  });
  return { run, resumed: false as const, donePages: [] as number[] };
}

// Server-hardening (CodeRabbit, PR #2): de client-loop stuurt altijd JPEG, maar het
// gedeclareerde mime-type is client-input — de bytes zelf moeten het waarmaken vóór
// ze opgeslagen en naar de vision-API gaan. JPEG begint altijd met FF D8 (SOI).
export function isJpegImage(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

// Welke pagina's al een beeldrij hebben — bewust ZONDER de bytes-kolom (B2).
async function getDonePages(db: AppDb, runId: string): Promise<number[]> {
  const rows = await db
    .select({ page: ocrPageImages.page })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, runId))
    .orderBy(asc(ocrPageImages.page));
  return rows.map((r) => r.page);
}

export type ProcessOcrPageResult =
  // Beeldrij bestond al (unique(run,page)) → pagina is al gedaan of bezig; de
  // aanroeper gaat door met de volgende pagina. Er is niets gekost.
  | { alreadyDone: true }
  // Skip vóór de call: geen key of budget op. Bij budget is de run gestopt.
  | { skipped: "no_key" | "budget_run" | "budget_month"; stopped: boolean }
  // Vision-call mislukt (event ocr_page_failed is al gelogd); doorgaan met de rest.
  | { failed: string }
  | { created: number; duplicates: number; costEur: number };

// ── Eén pagina verwerken ─────────────────────────────────────────────────────
// VOLGORDE-AFSPRAAK (B4): éérst de beeldrij, dán pas de vision-call. De unique
// (run,page)-index is het lock dat het €1-plafond hard maakt: een pagina kan maar
// één keer een reservering + call veroorzaken, hoe vaak de client hem ook stuurt.
export async function processOcrPage(
  db: AppDb,
  opts: {
    runId: string;
    page: number;
    imageBytes: Uint8Array;
    mime: string;
    width: number;
    height: number;
    client?: OcrClient;
    actor?: string;
  },
): Promise<ProcessOcrPageResult> {
  const run = await getImportRun(db, opts.runId);
  if (!run) throw new Error(`import run ${opts.runId} not found`);

  // (a) Beeldrij-lock. onConflictDoNothing + returning: leeg = de rij bestond al.
  const inserted = await db
    .insert(ocrPageImages)
    .values({
      importRunId: opts.runId,
      page: opts.page,
      mime: opts.mime,
      width: opts.width,
      height: opts.height,
      bytes: opts.imageBytes,
    })
    .onConflictDoNothing()
    .returning({ id: ocrPageImages.id });
  if (inserted.length === 0) return { alreadyDone: true };

  // (b) De vision-call (budgetcheck + reservering + call zitten in ocrPage).
  const result = await ocrPage(db, {
    importRunId: opts.runId,
    pageNumber: opts.page,
    imageBytes: opts.imageBytes,
    mime: opts.mime,
    client: opts.client,
    actor: opts.actor,
  });

  if ("skipped" in result) {
    // Budget op = de run is klaar-met-stoppen ('gestopt', terminaal — geen
    // hervatten); de beeldrij blijft dan staan als controlespoor (kost geen
    // API-geld). Zonder key blijft de run 'bezig' (key terug → hervatten kan
    // gewoon) — dan moet de zojuist geïnsertte beeldrij WEER WEG: de rij is
    // lock én bewijs van verwerking, en zonder lezing is er geen bewijs. Bleef
    // hij staan, dan telde getDonePages deze pagina als gedaan en zou het
    // hervatten precies deze pagina voorgoed overslaan, zonder melding.
    const stopped =
      result.skipped === "budget_run" || result.skipped === "budget_month";
    if (stopped) {
      await db
        .update(importRuns)
        .set({ ocrStatus: "gestopt", updatedAt: new Date() })
        .where(eq(importRuns.id, opts.runId));
    } else {
      await db
        .delete(ocrPageImages)
        .where(eq(ocrPageImages.id, inserted[0].id));
    }
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.runId,
      action:
        result.skipped === "no_key" ? "ocr_skipped_no_key" : "ocr_skipped_budget",
      actor: opts.actor,
      payload: { page: opts.page, reason: result.skipped },
    });
    return { skipped: result.skipped, stopped };
  }
  if (!isOcrPageSuccess(result)) {
    // Vision-fout (event ocr_page_failed is al gelogd): net als bij no_key moet de
    // zojuist geïnsertte beeldrij WEER WEG — de rij is lock én bewijs van verwerking,
    // en zonder lezing is er geen bewijs. Bleef hij staan, dan telde getDonePages
    // deze pagina als gedaan en zou het hervatten precies deze pagina voorgoed
    // overslaan, zonder melding. De llm_usage-reservering blijft wél staan
    // (conservatieve kostenpost — een timeout kan aan de API-kant tóch gekost hebben).
    await db.delete(ocrPageImages).where(eq(ocrPageImages.id, inserted[0].id));
    return { failed: result.failed };
  }

  // (c) Regels verwerken. Dedupe op armatuurcode tegen álles wat deze run al las
  // (run.rows is de volledige leesgeschiedenis, incl. eerdere pagina's): een boek
  // noemt een armatuur vaak op meerdere pagina's, maar één code = één spec-regel.
  const existingCodes = new Set(
    ((run.rows ?? []) as ImportRow[]).map((r) => r.fixtureCode),
  );
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);

  const newRows: ImportRow[] = [];
  const inputs: SpecLineInput[] = [];
  let duplicates = 0;
  for (const regel of result.regels) {
    const line = regelToSpecLine(regel, opts.page, run.id, brandNames);
    const isDuplicate = existingCodes.has(regel.armatuurcode);
    if (!isDuplicate) existingCodes.add(regel.armatuurcode);
    else duplicates++;
    // Élke gelezen regel komt in run.rows (mét ruwe_tekst → het transcript, B6);
    // checked zegt eerlijk of hij een spec-regel werd (duplicaat → false).
    newRows.push({
      fixtureCode: regel.armatuurcode,
      quantity: line.quantity ?? null,
      brandText: line.brandText ?? null,
      productText: line.productText ?? null,
      source: "ocr",
      rawText: regel.ruweTekst,
      page: opts.page,
      checked: !isDuplicate,
    });
    if (!isDuplicate) inputs.push(line);
  }

  const created = inputs.length
    ? await addSpecLines(db, run.dossierId, inputs)
    : [];
  for (const line of created) {
    await runMatcher(db, line.id, opts.actor);
  }
  // B7: OCR-review op elke nieuwe regel die nog géén reviewKind heeft. De matcher
  // zette zonet eventueel 'geel' — die flag blijft staan (één review per regel;
  // de gele kaart toont de bron erbij, dus de lezing wordt daar mee-beoordeeld).
  if (created.length) {
    await db
      .update(specLines)
      .set({ reviewKind: "ocr", reviewedAt: null, updatedAt: new Date() })
      .where(
        and(
          inArray(
            specLines.id,
            created.map((l) => l.id),
          ),
          isNull(specLines.reviewKind),
        ),
      );
  }

  // Run-snapshot bijwerken: rows groeit per pagina aan, counts tellen mee.
  const rows = [...((run.rows ?? []) as ImportRow[]), ...newRows];
  const counts = {
    ...(run.counts ?? {}),
    total: rows.length,
    checked: rows.filter((r) => r.checked).length,
  };
  await db
    .update(importRuns)
    .set({ rows, counts, updatedAt: new Date() })
    .where(eq(importRuns.id, opts.runId));

  return { created: created.length, duplicates, costEur: result.costEur };
}

// Eén gelezen regel → SpecLineInput, met de bestaande deterministische helpers:
// gaf vision geen merk, dan knipt splitBrandType het uit de typetekst (zelfde
// helper als de tekstlaag-import); specs komen uit parseProductName (nooit geraden).
// quantity blijft leeg: een armaturenboek-pagina noemt geen aantallen en OCR
// verzint niets — het bestek koppelt de aantallen later (A-07).
// codeValid=false-regels gaan WÉL mee, maar met sourceConfidence 'laag': het stond
// er (dus we laten niets stilzwijgend weg), maar een code buiten het bekende
// formaat is verdacht — de OCR-review en het lage vertrouwen maken dat zichtbaar.
// Geldige codes krijgen constant 'middel' (B3: LLM-confidence is slecht
// gekalibreerd, we doen niet alsof).
function regelToSpecLine(
  regel: OcrRegel,
  page: number,
  runId: string,
  brandNames: string[],
): SpecLineInput {
  let brand = regel.merk;
  let type = regel.type;
  if (!brand) {
    // geen merk gelezen → deterministisch knippen uit type of ruwe tekst (zonder code)
    const rest =
      regel.type ??
      regel.ruweTekst.replace(regel.armatuurcode, "").trim();
    const split = splitBrandType(rest, brandNames);
    brand = split.brand;
    type = split.type || regel.type || null;
  }
  const specs = type ? parseProductName(type) : {};
  return {
    fixtureCode: regel.armatuurcode,
    quantity: null,
    brandText: brand,
    productText: type || null,
    reqKelvin: specs.kelvin ?? null,
    reqCri: specs.cri ?? null,
    reqIp: specs.ipValue ?? null,
    reqWatt: specs.maxWattage ?? null,
    reqLumen: specs.lumenOutput ?? null,
    reqBeamAngle: specs.beamAngle ?? null,
    reqDimmable: specs.dimmable ?? null,
    source: "ocr",
    sourceConfidence: regel.codeValid ? "middel" : "laag",
    sourcePage: page,
    importRunId: runId,
  };
}

// ── Afronden (B6) ────────────────────────────────────────────────────────────
// raw_markdown = "OCR transcript (model output)": wat het MODEL las, per pagina.
// De kopregel zegt dat expliciet — de échte bron zijn de paginabeelden, die even
// lang leven als de run en via /projects/[id]/ocr-image bereikbaar zijn (mét
// dossier-eigendomscheck, zoals de markdown-route). Idempotent: een al
// afgeronde run wordt niet opnieuw afgerond (geen dubbel event).
// Het vangnet wordt hier bewust NIET getriggerd (B8, zie kop-commentaar).
export async function finishOcrRun(
  db: AppDb,
  input: { runId: string; actor?: string },
) {
  const run = await getImportRun(db, input.runId);
  if (!run) throw new Error(`import run ${input.runId} not found`);
  if (run.ocrStatus === "klaar") return run;

  const donePages = await getDonePages(db, run.id);
  const rows = (run.rows ?? []) as ImportRow[];
  const byPage = new Map<number, ImportRow[]>();
  for (const row of rows) {
    const page = row.page ?? 0;
    byPage.set(page, [...(byPage.get(page) ?? []), row]);
  }
  const header =
    "# OCR transcript (model output)\n\n" +
    "> This is what the vision model read — not the source document. The source\n" +
    "> is the set of stored page images of this run.";
  const body = donePages
    .map((page) => {
      const pageRows = byPage.get(page) ?? [];
      const text = pageRows.length
        ? pageRows.map((r) => r.rawText ?? r.fixtureCode).join("\n")
        : "_no luminaire rows read_";
      return `## Page ${page}\n\n${text}`;
    })
    .join("\n\n");
  let markdown = `${header}\n\n${body}`;
  if (markdown.length > MARKDOWN_CAP) {
    markdown = `${markdown.slice(0, MARKDOWN_CAP)}\n\n> truncated at 2 MB`;
  }

  await db
    .update(importRuns)
    .set({ rawMarkdown: markdown, ocrStatus: "klaar", updatedAt: new Date() })
    .where(eq(importRuns.id, run.id));

  // Totalen voor het event: pagina's, aangemaakte regels, en de kosten als som
  // van llm_usage over deze run (reserveringen van gefaalde pagina's tellen mee —
  // conservatief, zoals het reserveringspatroon bedoelt).
  const [cost] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, run.id))) as { total: string }[];
  const counts = (run.counts ?? {}) as Record<string, number>;
  await logEvent(db, {
    entity: "import_run",
    entityId: run.id,
    action: "ocr_done",
    actor: input.actor,
    payload: {
      dossierId: run.dossierId,
      pages: donePages.length,
      regels: counts.checked ?? 0,
      rowsRead: counts.total ?? 0,
      costEur: Number(cost?.total ?? 0),
    },
  });
  return (await getImportRun(db, run.id))!;
}

// Openstaande OCR-run van een dossier (B5, stap 5): de projectpagina geeft dit aan
// de upload-kaart zodat die bij een paginabezoek een "Resume OCR (N of M pages
// done)"-knop toont. Bewust bytes-vrij (B2): dit draait op élke projectpagina-load.
export async function getOpenOcrRun(db: AppDb, dossierId: string) {
  const [run] = await db
    .select({
      id: importRuns.id,
      filename: importRuns.filename,
    })
    .from(importRuns)
    .where(
      and(
        eq(importRuns.dossierId, dossierId),
        eq(importRuns.source, "ocr"),
        eq(importRuns.ocrStatus, "bezig"),
      ),
    )
    .orderBy(desc(importRuns.createdAt))
    .limit(1);
  if (!run) return null;
  const progress = await getOcrRunProgress(db, run.id);
  return {
    runId: run.id,
    filename: run.filename ?? "armaturenboek.pdf",
    pagesDone: progress?.pagesDone ?? 0,
    pagesTotal: progress?.pagesTotal ?? null,
  };
}

// ── Beeldtoegang (B2) ────────────────────────────────────────────────────────
// DE ENIGE functie in de repo-laag die de bytes-kolom van ocr_page_images
// selecteert (B2-harde eis). Voeg de kolom nergens anders aan een select toe:
// run-, voortgangs- en reviewqueries blijven bytes-vrij, anders sleept elke
// paginaweergave megabytes beeld door de verbinding.
export async function getOcrPageImage(db: AppDb, runId: string, page: number) {
  const [row] = await db
    .select({
      mime: ocrPageImages.mime,
      width: ocrPageImages.width,
      height: ocrPageImages.height,
      bytes: ocrPageImages.bytes,
    })
    .from(ocrPageImages)
    .where(
      and(eq(ocrPageImages.importRunId, runId), eq(ocrPageImages.page, page)),
    )
    .limit(1);
  return row ?? null;
}

// Voortgang van een run: pagina's gedaan/totaal + kosten tot nu toe — bewust
// ZONDER de bytes-kolom (B2): dit draait bij elke poll van de client-loop.
export async function getOcrRunProgress(db: AppDb, runId: string) {
  const run = await getImportRun(db, runId);
  if (!run) return null;
  const [pages] = (await db
    .select({ done: sql<number>`count(*)` })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, runId))) as { done: number }[];
  const [cost] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, runId))) as { total: string }[];
  const counts = (run.counts ?? {}) as Record<string, number>;
  return {
    ocrStatus: run.ocrStatus,
    pagesDone: Number(pages?.done ?? 0),
    pagesTotal: counts.pageCount ?? null,
    linesCreated: counts.checked ?? 0,
    costEur: Number(cost?.total ?? 0),
  };
}
