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
  visibleProducts,
  type ImportRow,
} from "@/db/schema";
import { isOcrPageSuccess, ocrPage, type OcrClient, type OcrRegel } from "@/lib/ai/ocr";
import { parseProductName } from "@/lib/enrichment/parser";
import {
  hasAnyRequestedSpec,
  SELECTION as PRODUCT_SELECTION,
  toDelivered,
} from "@/lib/matching/engine";
import { hasRed, hasUnknown, judgeCandidate, worstVerdict } from "@/lib/matching/tolerances";
import { MARKDOWN_CAP, splitBrandType } from "@/lib/pdf/armaturenboek";
import { addSpecLines, type SpecLineInput } from "@/lib/repo/dossiers";
import { getImportRun } from "@/lib/repo/imports";
import { runMatcher, specRequestFromLine } from "@/lib/repo/matching";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// ── Run starten of hervatten (B5) ────────────────────────────────────────────
// Eén lopende OCR-run per dossier+bestand: bestaat er al een run met ocrStatus
// 'bezig' voor precies dit bestand, dan is dít een hervatting (tab dichtgeklapt op
// pagina 14 → verder vanaf 15) en geven we die run terug in plaats van een tweede
// te beginnen. doneTiles voedt de client-loop: die (pagina, tegel)-paren slaat
// hij over. Sinds O4 (A3-tiling) per TEGEL — tile 0 = hele pagina, dus voor
// bestaande hele-pagina-runs is dit exact het oude donePages-gedrag.
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
    const doneTiles = await getDoneTiles(db, existing.id);
    await logEvent(db, {
      entity: "import_run",
      entityId: existing.id,
      action: "ocr_resumed",
      actor: input.actor,
      payload: {
        filename: input.filename,
        // tilesDone = aantal beeldrijen; pagesDone = distinct pagina's. Bij
        // hele-pagina-runs (alles tile 0) zijn die twee gelijk.
        tilesDone: doneTiles.length,
        pagesDone: new Set(doneTiles.map((t) => t.page)).size,
      },
    });
    return { run: existing, resumed: true as const, doneTiles };
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
  return {
    run,
    resumed: false as const,
    doneTiles: [] as { page: number; tile: number }[],
  };
}

// Server-hardening (CodeRabbit, PR #2): de client-loop stuurt altijd JPEG, maar het
// gedeclareerde mime-type is client-input — de bytes zelf moeten het waarmaken vóór
// ze opgeslagen en naar de vision-API gaan. JPEG begint altijd met FF D8 (SOI).
export function isJpegImage(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

// Welke (pagina, tegel)-paren al een beeldrij hebben — bewust ZONDER de
// bytes-kolom (B2). Gesorteerd op pagina, dan tegel. Tile 0 = hele pagina
// (invariant, zie db/schema.ts) — de oude getDonePages is hier de deelvorm van.
async function getDoneTiles(
  db: AppDb,
  runId: string,
): Promise<{ page: number; tile: number }[]> {
  return db
    .select({ page: ocrPageImages.page, tile: ocrPageImages.tile })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, runId))
    .orderBy(asc(ocrPageImages.page), asc(ocrPageImages.tile));
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
      // O6: quantity MERGEN, niet overschrijven — een rijkere spec-lezing zonder
      // aantal (de armaturenlijst) mag het eerder gelezen pen-aantal (de
      // aantallen-lijst) nooit wissen. Nieuw aantal wint alleen als het er is.
      quantity: line.quantity ?? existing.quantity,
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
  await runMatcher(db, existing.id, actor);

  // d) Spookmatch-fix: het oude product RECHTSTREEKS tegen de nieuwe gevraagde
  // specs toetsen — niet via outcome.provable/unambiguousYellow van runMatcher.
  // Die zijn afgeleid van de top-N (default limit=8, evaluateSpecLine) kandidaten
  // die fetchCandidates teruggeeft; in de 211k-catalogus kan een merk/producttekst
  // makkelijk meer dan 8 matchende kandidaten opleveren, en de rijkere OCR-tekst
  // kan de ranking (matchCount/score) net genoeg verschuiven dat een nog steeds
  // geldige, mens-gekozen match buiten die top-8 valt — dan zou hij ten onrechte
  // als "spookmatch" worden gewist terwijl hij bij directe toetsing nog gewoon
  // groen zou zijn. (2e reviewronde: de vorige versie, die wél al de provable-lijst
  // meenam i.p.v. alleen unambiguousYellow, had precies deze top-8-blinde-vlek.)
  // Een gerichte query op precies dát ene product, los van enige lijst/limiet, is
  // de robuuste vorm.
  let stillValid = false;
  if (oldMatchedProductId) {
    // De NIEUWE (net bijgewerkte) gevraagde specs — dezelfde omzetting als
    // runMatcher zelf gebruikt (specRequestFromLine), dus geen tweede waarheid
    // over hoe een specLines-rij naar RequestedSpecs wordt vertaald.
    const [currentLine] = await db
      .select()
      .from(specLines)
      .where(eq(specLines.id, existing.id))
      .limit(1);
    const req = specRequestFromLine(currentLine);
    // Regel 3 (verlopen prijslijst = onzichtbaar): dezelfde visibleProducts-view
    // als de rest van de matcher — nooit een ruwe products-tabel-query. Niet meer
    // zichtbaar (bv. prijslijst verlopen sinds de eerdere keuze) → ook niet
    // stillValid, dus alsnog loskoppelen.
    const [productRow] = await db
      .select(PRODUCT_SELECTION)
      .from(visibleProducts)
      .where(eq(visibleProducts.id, oldMatchedProductId))
      .limit(1);
    if (productRow) {
      const deviations = judgeCandidate(req.specs, toDelivered(productRow));
      // Gat A (20 jul, "vacuous green"): zonder één toetsbare req_*-spec is
      // deviations=[] en zou !hasRed && !hasUnknown vacuous true zijn — de oude
      // match bleef dan hangen en de regel werd hieronder zelfs hard "groen"
      // gezet, op nul bewijs. Zelfde regel als evaluateSpecLine stap 5: geen
      // getoetste eis → niets aantoonbaar → loskoppelen; de status blijft wat
      // runMatcher er net van maakte ('open' bij kandidaten, mens kiest).
      stillValid =
        hasAnyRequestedSpec(req.specs) &&
        !hasRed(deviations) &&
        !hasUnknown(deviations);
      if (stillValid) {
        // CodeRabbit (PR #4, Major, ronde 1): runMatcher hierboven kende de regel
        // zonet nog zijn eigen (top-8-beperkte) status/deviations toe — die kan
        // best "rood"/"open" zijn terwijl de directe toets hier net vaststelde dat
        // het OUDE product nog steeds bruikbaar is. Zonder deze reconciliatie zou
        // de regel een geldige matchedProductId hebben mét een niet-kloppende
        // status — en zo'n regel valt dan stilzwijgend buiten generateQuote/de
        // estimate. status en deviations horen dus bij dezelfde (directe) toets
        // als matchedProductId.
        //
        // CodeRabbit (PR #4, Major, ronde 2 — vierde reviewronde): stillValid
        // (!hasRed && !hasUnknown) is NIET hetzelfde als "groen". Een product kan
        // "geen rood, geen onbekend" zijn én toch een gele afwijking dragen (bv.
        // watt 20% buiten de exacte marge maar binnen de gele tolerantiezone) —
        // dat hoort geel te worden, niet hardcoded groen (empirisch bevestigd:
        // requested watt=10/delivered=12 → hasRed=false, hasUnknown=false, maar
        // worstVerdict="geel"). generateQuote (lib/repo/dossiers.ts) telt sowieso
        // zowel groen als geel mee met geldige prijs, dus een correcte geel-status
        // volstaat. worstVerdict (lib/matching/tolerances.ts) is dezelfde functie
        // die engine.ts gebruikt om groen/geel te bepalen (regel 356-368) — geen
        // eigen nieuwe logica hier.
        const status = worstVerdict(deviations) === "groen" ? "groen" : "geel";
        await db
          .update(specLines)
          .set({ status, deviations })
          .where(eq(specLines.id, existing.id));
      }
    }
  }
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

// ── Gelezen regels persisteren (stappen c–f, gedeeld met de leesroute) ───────
// VERBATIM geëxtraheerd uit processOcrPage (fase B, goal-import-ai-leesroute
// stap 3): rijkste-wint-dedup tegen run.rows, addSpecLines → runMatcher →
// reviewKind 'ocr' alleen-waar-nog-null (B7), upgradeOcrLine (incl. spookmatch-
// fix), de rows/checked-boekhouding en de run-snapshot-update. Eén verschil in
// vorm, niet in gedrag: de pagina komt per REGEL mee (regel.page) in plaats van
// als één opts.page — processOcrPage geeft elke regel dezelfde pagina mee, de
// leesroute (lib/repo/leesroute.ts) het pagina-veld uit de batch. De helper
// werkt het run-snapshot zelf bij (zoals processOcrPage dat deed) en geeft de
// nieuwe rows/counts terug zodat een batchende aanroeper niet hoeft te herladen.
export async function verwerkGelezenRegels(
  db: AppDb,
  opts: {
    run: typeof importRuns.$inferSelect;
    // segmentTekst (gat B): optioneel, alleen op de tekst-leesroute — het
    // deterministisch uitgesneden rijsegment gaat mee naar regelToSpecLine.
    regels: (OcrRegel & { page: number; segmentTekst?: string })[];
    brandNames: string[];
    actor?: string;
  },
): Promise<{
  created: number;
  duplicates: number;
  upgraded: number;
  rows: ImportRow[];
  counts: Record<string, number>;
}> {
  const { run, brandNames } = opts;

  // (c) Regels verwerken. Dedupe op armatuurcode tegen álles wat deze run al las
  // (run.rows is de volledige leesgeschiedenis, incl. eerdere pagina's): een boek
  // noemt een armatuur vaak op meerdere pagina's. Vroeger won de eerste lezing
  // altijd; nu wint de RIJKSTE lezing (item A, docs/probleem-ocr-toc-verdringt-
  // specs.md) — een arme inhoudsopgave-rij wordt overschreven zodra de rijkere
  // detailpagina van dezelfde code langskomt.
  const existingCodes = new Set(
    ((run.rows ?? []) as ImportRow[]).map((r) => r.fixtureCode),
  );

  // Mutabele kopie van de al opgebouwde rows: bij een upgrade zetten we de
  // eerdere winnende entry van dezelfde code terug op checked:false (stap f).
  const priorRows = [...((run.rows ?? []) as ImportRow[])];
  const newRows: ImportRow[] = [];
  let created = 0;
  let duplicates = 0;
  let upgraded = 0;

  for (const regel of opts.regels) {
    const line = regelToSpecLine(
      regel,
      regel.page,
      run.id,
      brandNames,
      regel.segmentTekst,
    );
    const baseRow: ImportRow = {
      fixtureCode: regel.armatuurcode,
      quantity: line.quantity ?? null,
      brandText: line.brandText ?? null,
      productText: line.productText ?? null,
      source: "ocr",
      rawText: regel.ruweTekst,
      page: regel.page,
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
      // O6-uitzondering: draagt déze lezing een aantal terwijl de winnende regel
      // er nog geen heeft (Dordrecht: de aantallen-lijst is spec-arm maar heeft
      // de pen-aantallen), dan alleen het aantal gericht bijschrijven — nooit
      // gelezen data verliezen omdat de rest van de lezing armer is. Matching
      // raakt quantity niet, dus geen hermatch; wel een event (regel 5).
      if (line.quantity != null && existing.quantity == null) {
        await db
          .update(specLines)
          .set({ quantity: line.quantity, updatedAt: new Date() })
          .where(eq(specLines.id, existing.id));
        await logEvent(db, {
          entity: "spec_line",
          entityId: existing.id,
          action: "ocr_quantity_backfilled",
          actor: opts.actor,
          payload: {
            fixtureCode: regel.armatuurcode,
            quantity: line.quantity,
            page: regel.page,
          },
        });
      }
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
      page: regel.page,
      actor: opts.actor,
    });
    upgraded++;
    newRows.push({ ...baseRow, checked: true });
    // f) De eerdere winnende entry van deze code is niet langer de "checked"
    // lezing — precies één rij per code mag checked:true zijn. CodeRabbit (PR #4,
    // Major): dat eerdere winnende exemplaar kan ook al in newRows staan (vision
    // levert per ongeluk twee keer dezelfde code op ÉÉN pagina — de arme eerste
    // keer werd hierboven al als upgrade verwerkt en zit als checked:true in
    // newRows), niet alleen in priorRows (een vorige pagina). Beide arrays
    // doorzoeken voorkomt dat twee rijen checked:true blijven staan.
    for (const r of [...priorRows, ...newRows]) {
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
    .where(eq(importRuns.id, run.id));

  return { created, duplicates, upgraded, rows, counts };
}

// ── Eén pagina (of tegel) verwerken ──────────────────────────────────────────
// VOLGORDE-AFSPRAAK (B4): éérst de beeldrij, dán pas de vision-call. De unique
// (run,page,tile)-index is het lock dat het €1-plafond hard maakt: een tegel kan
// maar één keer een reservering + call veroorzaken, hoe vaak de client hem ook
// stuurt. Zonder tile (default 0 = hele pagina) is dit exact het oude
// per-pagina-lock. ImportRow.page blijft de ECHTE pagina — de rijkste-wint-dedup
// in verwerkGelezenRegels werkt op armatuurcode over run.rows heen en dedupt zo
// vanzelf óók over tegels van dezelfde (of een andere) pagina.
export async function processOcrPage(
  db: AppDb,
  opts: {
    runId: string;
    page: number;
    // O4 (stap 5): tegelnummer binnen de pagina (0 = hele pagina, default);
    // tileCount alleen voor de prompt-info ("section n of count").
    tile?: number;
    tileCount?: number;
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
  const tile = opts.tile ?? 0;
  const tileCount = opts.tileCount ?? 1;

  // (a) Beeldrij-lock. onConflictDoNothing + returning: leeg = de rij bestond al.
  const inserted = await db
    .insert(ocrPageImages)
    .values({
      importRunId: opts.runId,
      page: opts.page,
      tile,
      mime: opts.mime,
      width: opts.width,
      height: opts.height,
      bytes: opts.imageBytes,
    })
    .onConflictDoNothing()
    .returning({ id: ocrPageImages.id });
  if (inserted.length === 0) return { alreadyDone: true };

  // (b) De vision-call (budgetcheck + reservering + call zitten in ocrPage).
  // pageNumber blijft de echte pagina; de tegel-info stuurt alleen de extra
  // promptzin (bij count > 1) en het tile-veld in de events.
  const result = await ocrPage(db, {
    importRunId: opts.runId,
    pageNumber: opts.page,
    imageBytes: opts.imageBytes,
    mime: opts.mime,
    client: opts.client,
    actor: opts.actor,
    tile: { n: tile, count: tileCount },
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

  // (c)–(f): persist-lus — verplaatst naar verwerkGelezenRegels (gedeeld met de
  // AI-leesroute, fase B). Elke vision-regel krijgt hier uniform de pagina van
  // deze call mee; het gedrag is verder byte-identiek aan vóór de extractie.
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const { created, duplicates, upgraded } = await verwerkGelezenRegels(db, {
    run,
    regels: result.regels.map((r) => ({ ...r, page: opts.page })),
    brandNames,
    actor: opts.actor,
  });

  return { created, duplicates, upgraded, costEur: result.costEur };
}

// Eén gelezen regel → SpecLineInput, met de bestaande deterministische helpers:
// gaf vision geen merk, dan knipt splitBrandType het uit de typetekst (zelfde
// helper als de tekstlaag-import); specs komen uit parseProductName (nooit geraden).
// Sinds stap 1 (O1-fix) kan splitBrandType óók null opleveren (geen bekend merk →
// eerlijk onbekend, geen eerste-woord-gok meer); de verplichte OCR-review (B7)
// vangt dat — een mens ziet de regel sowieso vóór hij meetelt.
// quantity = wat het model létterlijk las (O6, stap 6): Dordrecht bewees dat
// aantallen wél in het boek kunnen staan — met pen in de kantlijn. De oude
// aanname "een armaturenboek-pagina noemt geen aantallen" vervalt als default;
// géén aantal gelezen → null → stukprijs-modus (A-07 blijft de fallback, geen
// natuurwet). Het model mag nooit raden (promptregel: alleen wat er staat).
// codeValid=false-regels gaan WÉL mee, maar met sourceConfidence 'laag': het stond
// er (dus we laten niets stilzwijgend weg), maar een code buiten het bekende
// formaat is verdacht — de OCR-review en het lage vertrouwen maken dat zichtbaar.
// Geldige codes krijgen constant 'middel' (B3: LLM-confidence is slecht
// gekalibreerd, we doen niet alsof).
// Geëxporteerd (stap 2, goal-import-ai-leesroute) uitsluitend zodat het meetscript
// (scripts/eval-testset.ts, --ai-route) de EXACTE productie-omzetting OcrRegel →
// SpecLineInput meet in plaats van een eigen kopie. De functie is puur (geen DB,
// geen I/O); dit is alleen een zichtbaarheidswijziging, geen gedragswijziging.
export function regelToSpecLine(
  regel: OcrRegel,
  page: number,
  runId: string,
  brandNames: string[],
  // Gat B (20 jul): het deterministisch uitgesneden rijsegment uit de
  // server-side paginatekst (lib/pdf/rijsegmenten.ts) — alleen op de
  // TEKST-leesroute beschikbaar; vision en het oude tekstpad geven hem niet
  // mee (gedrag daar byte-identiek). Hij wordt ACHTERAAN de parse-input
  // geplakt: parseProductName is eerste-match-wint per veld, dus wat het
  // model wél leverde (ruweTekst/type) wint, en het segment vult alleen de
  // velden bij die door een afgekapte ruwe_tekst leeg bleven.
  segmentTekst?: string | null,
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
  // We parsen daarom over ruweTekst + type samen (+ sinds gat B het rijsegment
  // achteraan); komt type ook al in ruweTekst voor, dan matcht de parser gewoon
  // twee keer op dezelfde eenheid — onschadelijk.
  const parseInput = [regel.ruweTekst, type, segmentTekst]
    .filter(Boolean)
    .join(" ");
  const specs = parseInput ? parseProductName(parseInput) : {};
  return {
    fixtureCode: regel.armatuurcode,
    quantity: regel.aantal ?? null,
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

  // Transcript blijft per PAGINA (de mens leest pagina's, geen tegels): distinct
  // pagina's uit de gedane tegels; getDoneTiles sorteert al op pagina.
  const doneTiles = await getDoneTiles(db, run.id);
  const donePages = [...new Set(doneTiles.map((t) => t.page))];
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
// O4: tile gegeven → exact die tegel; zonder tile de LAAGSTE tegel van de
// pagina — voor hele-pagina-runs (alles tile 0) dus byte-identiek aan vroeger.
export async function getOcrPageImage(
  db: AppDb,
  runId: string,
  page: number,
  tile?: number,
) {
  const [row] = await db
    .select({
      mime: ocrPageImages.mime,
      width: ocrPageImages.width,
      height: ocrPageImages.height,
      bytes: ocrPageImages.bytes,
    })
    .from(ocrPageImages)
    .where(
      and(
        eq(ocrPageImages.importRunId, runId),
        eq(ocrPageImages.page, page),
        ...(tile != null ? [eq(ocrPageImages.tile, tile)] : []),
      ),
    )
    .orderBy(asc(ocrPageImages.tile))
    .limit(1);
  return row ?? null;
}

// Voortgang van een run: pagina's/tegels gedaan + kosten tot nu toe — bewust
// ZONDER de bytes-kolom (B2): dit draait bij elke poll van de client-loop.
// O4: pagesDone telt DISTINCT pagina's (een half-getegelde pagina telt als
// gedaan zodra er één tegel staat — voortgangsindicatie, geen lock); tilesDone
// telt alle beeldrijen. Bij hele-pagina-runs zijn beide gelijk.
export async function getOcrRunProgress(db: AppDb, runId: string) {
  const run = await getImportRun(db, runId);
  if (!run) return null;
  const [pages] = (await db
    .select({
      done: sql<number>`count(distinct ${ocrPageImages.page})`,
      tiles: sql<number>`count(*)`,
    })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, runId))) as {
    done: number;
    tiles: number;
  }[];
  const [cost] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, runId))) as { total: string }[];
  const counts = (run.counts ?? {}) as Record<string, number>;
  return {
    ocrStatus: run.ocrStatus,
    pagesDone: Number(pages?.done ?? 0),
    tilesDone: Number(pages?.tiles ?? 0),
    pagesTotal: counts.pageCount ?? null,
    linesCreated: counts.checked ?? 0,
    costEur: Number(cost?.total ?? 0),
  };
}
