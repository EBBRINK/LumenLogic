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
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  brands,
  importRuns,
  llmUsage,
  ocrPageImages,
  specLineCandidates,
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
  | { created: number; duplicates: number; upgraded: number; costEur: number };

// ── Rijkste-wint-dedup (item A, docs/probleem-ocr-toc-verdringt-specs.md) ───
// Rijkdom = aantal niet-null GEVRAAGDE specvelden — bewust niet ruweTekst-lengte:
// een lange lezing kan alsnog geen extra spec bevatten, en een korte kan er zes
// hebben. Werkt op zowel een net-geparste SpecLineInput als een bestaande
// specLines-rij (numeric-kolommen komen als string terug uit drizzle — "!= null"
// is genoeg, de waarde zelf doet er voor het tellen niet toe).
type SpecRichnessFields = {
  reqKelvin?: number | string | null;
  reqCri?: number | string | null;
  reqIp?: string | null;
  reqWatt?: number | string | null;
  reqLumen?: number | string | null;
  reqBeamAngle?: number | string | null;
  reqDimmable?: string | null;
};
export function specRichness(line: SpecRichnessFields): number {
  const fields: (keyof SpecRichnessFields)[] = [
    "reqKelvin",
    "reqCri",
    "reqIp",
    "reqWatt",
    "reqLumen",
    "reqBeamAngle",
    "reqDimmable",
  ];
  return fields.reduce((n, f) => (line[f] != null ? n + 1 : n), 0);
}

// Bestaande spec_line van DEZE run+code — bewust gescoopt op importRunId (nooit
// dossier-breed): een andere run of een handmatige regel met toevallig dezelfde
// fixtureCode mag nooit "geüpgraded" worden door deze OCR-lezing.
async function getOwnOcrLine(db: AppDb, runId: string, fixtureCode: string) {
  const [line] = await db
    .select()
    .from(specLines)
    .where(
      and(eq(specLines.importRunId, runId), eq(specLines.fixtureCode, fixtureCode)),
    )
    .limit(1);
  return line ?? null;
}

// Upgrade van een bestaande OCR-regel met een rijkere lezing (bv. de inhoudsopgave
// won eerst, de detailpagina komt later met alle cijfers). Twee blokkerende
// reviewer-gaten uit het besluitdocument, allebei hier gefixt:
//  1. Spookmatch: runMatcher laat matchedProductId ongemoeid tenzij er een NIEUWE
//     auto-geel-kandidaat is — een mens-gekozen (of eerder auto-gekozen) match kan
//     na de upgrade dus blijven hangen terwijl de nieuwe specs een heel andere (of
//     geen) kandidaat opleveren. Ná runMatcher expliciet vergelijken en zo nodig
//     loskoppelen — anders verdwijnt de regel stilzwijgend uit de "handmatig
//     linken"-werkvoorraad (getRedLinkLines filtert op matchedProductId IS NULL).
//  2. Verloren audit-spoor: runMatcher verwijdert en herbouwt alle candidates
//     zonder een eerdere chosen/chosenBy/chosenReason te bewaren — de oude keuze
//     dus VÓÓR het herdraaien uitlezen en meesturen in het event (ijzeren regel 5).
//
// Geen db.transaction() hier: de production-client (db/client.ts) draait op
// drizzle-orm/neon-http, en die driver ondersteunt géén interactieve transacties
// ("No transactions support in neon-http driver" — drizzle-orm/neon-http/session.js).
// AppDb is bewust hetzelfde type voor app (neon-http) en tests (PGlite), dus een
// db.transaction() zou hier in de tests slagen maar in productie altijd stuk gaan.
// De stappen hieronder lopen daarom sequentieel, zonder atomische garantie. Het
// race-risico (twee overlappende page-verwerkingen voor dezelfde run/code) is
// hetzelfde geaccepteerde risico als eerder in dit project: single-user, een
// sequentiële client-loop maakt een echte gelijktijdige aanroep voor dezelfde run
// praktisch onmogelijk. Geen nieuwe unique-constraint/migratie hiervoor.
async function upgradeOcrLine(
  db: AppDb,
  input: {
    existing: typeof specLines.$inferSelect;
    line: SpecLineInput;
    fixtureCode: string;
    page: number;
    actor?: string;
  },
): Promise<void> {
  const { existing, line, fixtureCode, page, actor } = input;

  // a) Oude match-koppeling + chosen-kandidaat bewaren VÓÓR het herdraaien — na
  // runMatcher zijn de oude candidates al weg (idempotent verwijderd/herbouwd).
  const oldMatchedProductId = existing.matchedProductId;
  let previousChoice:
    | { productId: string; chosenBy: string | null; chosenReason: string | null }
    | null = null;
  if (oldMatchedProductId) {
    const [chosen] = await db
      .select({
        chosenBy: specLineCandidates.chosenBy,
        chosenReason: specLineCandidates.chosenReason,
      })
      .from(specLineCandidates)
      .where(
        and(
          eq(specLineCandidates.specLineId, existing.id),
          eq(specLineCandidates.productId, oldMatchedProductId),
        ),
      )
      .limit(1);
    previousChoice = {
      productId: oldMatchedProductId,
      chosenBy: chosen?.chosenBy ?? null,
      chosenReason: chosen?.chosenReason ?? null,
    };
  }

  // b) Eigen kleine update met de nieuwe specvelden — NIET via de gedeelde
  // updateSpecLine (die is voor menselijke edits, dit is een rijkere OCR-lezing).
  // reqWatt/reqBeamAngle/reqSizeCm zijn numeric-kolommen → String(...), zelfde
  // conventie als addSpecLines/updateSpecLine in lib/repo/dossiers.ts.
  await db
    .update(specLines)
    .set({
      brandText: line.brandText ?? null,
      productText: line.productText ?? null,
      reqKelvin: line.reqKelvin ?? null,
      reqCri: line.reqCri ?? null,
      reqIp: line.reqIp ?? null,
      reqWatt: line.reqWatt != null ? String(line.reqWatt) : null,
      reqLumen: line.reqLumen ?? null,
      reqBeamAngle: line.reqBeamAngle != null ? String(line.reqBeamAngle) : null,
      reqDimmable: line.reqDimmable ?? null,
      sourceConfidence: line.sourceConfidence ?? null,
      sourcePage: page,
      reviewKind: "ocr",
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, existing.id));

  // c) Hermatchen op de nieuwe, rijkere specs.
  const outcome = await runMatcher(db, existing.id, actor);

  // d) Spookmatch-fix: de oude koppeling blijft geldig als de NIEUWE evaluatie hem
  // nog steeds erkent — óf als de auto-geel-kandidaat (unambiguousYellow, de enige
  // die runMatcher zelf expliciet zet), óf als een aantoonbare/groene kandidaat in
  // outcome.provable (bv. een mens-gekozen match via chooseCandidate, fromList
  // "aantoonbaar" — die zit niet in unambiguousYellow, maar staat wél nog gewoon in
  // provable als hij nog klopt). Alleen als hij in GEEN van beide voorkomt, is het
  // een échte spookmatch — dan pas loskoppelen. (Reviewer-fix: de eerdere versie
  // vergeleek uitsluitend tegen unambiguousYellow, waardoor elke groene match —
  // ook een nog steeds kloppende — onterecht werd losgekoppeld, want
  // unambiguousYellow is alleen gezet bij status 'geel'.)
  const stillValid =
    oldMatchedProductId != null &&
    (outcome.provable.some((c) => c.productId === oldMatchedProductId) ||
      outcome.unambiguousYellow?.productId === oldMatchedProductId);
  if (oldMatchedProductId && !stillValid) {
    await db
      .update(specLines)
      .set({ matchedProductId: null })
      .where(eq(specLines.id, existing.id));
  }

  // e) Audit-event: de oude keuze mag nooit stilzwijgend verdwijnen (ijzeren regel 5).
  await logEvent(db, {
    entity: "spec_line",
    entityId: existing.id,
    action: "ocr_line_upgraded",
    actor,
    payload: {
      fixtureCode,
      oldRichness: specRichness(existing),
      newRichness: specRichness(line),
      oldPage: existing.sourcePage,
      newPage: page,
      ...(previousChoice ? { previousChoice } : {}),
    },
  });
}

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
  // noemt een armatuur vaak op meerdere pagina's. Vroeger won de eerste lezing
  // altijd; nu wint de RIJKSTE lezing (item A, docs/probleem-ocr-toc-verdringt-
  // specs.md) — een arme inhoudsopgave-rij wordt overschreven zodra de rijkere
  // detailpagina van dezelfde code langskomt.
  const existingCodes = new Set(
    ((run.rows ?? []) as ImportRow[]).map((r) => r.fixtureCode),
  );
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);

  // Mutabele kopie van de al opgebouwde rows: bij een upgrade zetten we de
  // eerdere winnende entry van dezelfde code terug op checked:false (stap f).
  const priorRows = [...((run.rows ?? []) as ImportRow[])];
  const newRows: ImportRow[] = [];
  let created = 0;
  let duplicates = 0;
  let upgraded = 0;

  for (const regel of result.regels) {
    const line = regelToSpecLine(regel, opts.page, run.id, brandNames);
    const baseRow: ImportRow = {
      fixtureCode: regel.armatuurcode,
      quantity: line.quantity ?? null,
      brandText: line.brandText ?? null,
      productText: line.productText ?? null,
      source: "ocr",
      rawText: regel.ruweTekst,
      page: opts.page,
      checked: false,
    };

    if (!existingCodes.has(regel.armatuurcode)) {
      // Nog nooit gezien in deze run → huidig pad (created), ongewijzigd.
      existingCodes.add(regel.armatuurcode);
      const [createdLine] = await addSpecLines(db, run.dossierId, [line]);
      await runMatcher(db, createdLine.id, opts.actor);
      // B7: OCR-review op elke nieuwe regel die nog géén reviewKind heeft. De
      // matcher draaide zonet en kan 'geel' hebben gezet — dat moet in de DB
      // gecheckt worden (isNull-where), niet op het createdLine-object van vóór
      // runMatcher: die flag blijft staan (één review per regel; de gele kaart
      // toont de bron erbij).
      await db
        .update(specLines)
        .set({ reviewKind: "ocr", reviewedAt: null, updatedAt: new Date() })
        .where(
          and(eq(specLines.id, createdLine.id), isNull(specLines.reviewKind)),
        );
      created++;
      newRows.push({ ...baseRow, checked: true });
      continue;
    }

    // Code al bekend in deze run — kijk of er echt al een eigen spec_line voor
    // bestaat (gescoopt op run+code). Binnen dezelfde pagina kan dezelfde code
    // twee keer voorkomen vóórdat de eerste al is weggeschreven — dat blijft,
    // net als voorheen, gewoon een duplicaat (geen spec_line om tegen te upgraden).
    const existing = await getOwnOcrLine(db, run.id, regel.armatuurcode);
    if (!existing) {
      duplicates++;
      newRows.push(baseRow);
      continue;
    }

    const newRichness = specRichness(line);
    const oldRichness = specRichness(existing);
    if (newRichness <= oldRichness) {
      // Gelijke of armere rijkdom: bestaande lezing blijft staan (ties geen churn).
      duplicates++;
      newRows.push(baseRow);
      continue;
    }

    // Rijkere lezing → upgrade (spookmatch-fix + audit-bewaring zitten in
    // upgradeOcrLine hierboven).
    await upgradeOcrLine(db, {
      existing,
      line,
      fixtureCode: regel.armatuurcode,
      page: opts.page,
      actor: opts.actor,
    });
    upgraded++;
    newRows.push({ ...baseRow, checked: true });
    // f) De eerdere winnende entry van deze code (uit een vorige pagina) is niet
    // langer de "checked" lezing — precies één rij per code mag checked:true zijn.
    for (const r of priorRows) {
      if (r.fixtureCode === regel.armatuurcode && r.checked) {
        r.checked = false;
        break;
      }
    }
  }

  // Run-snapshot bijwerken: rows groeit per pagina aan, counts tellen mee.
  const rows = [...priorRows, ...newRows];
  const counts = {
    ...(run.counts ?? {}),
    total: rows.length,
    checked: rows.filter((r) => r.checked).length,
  };
  await db
    .update(importRuns)
    .set({ rows, counts, updatedAt: new Date() })
    .where(eq(importRuns.id, opts.runId));

  return { created, duplicates, upgraded, costEur: result.costEur };
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
  // Specs komen vaak alleen in de langere ruweTekst voor ("Vermogen: 17,9 W.
  // Kleurtemperatuur: 3000 K. CRI: ≥ 90."), niet in het korte type-veld ("SASSO
  // 100") — zie docs/probleem-ocr-toc-verdringt-specs.md, Besluit fase 2, item C.
  // We parsen daarom over ruweTekst + type samen; komt type ook al in ruweTekst
  // voor, dan matcht de parser gewoon twee keer op dezelfde eenheid — onschadelijk.
  const parseInput = [regel.ruweTekst, type].filter(Boolean).join(" ");
  const specs = parseInput ? parseProductName(parseInput) : {};
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
