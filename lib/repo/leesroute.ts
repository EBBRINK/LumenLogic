// Repo-laag van de AI-tekstleesroute (goal-import-ai-leesroute, stap 3, fase B):
// één import-run voor een tekst-PDF waarvan de deterministische parser het merk-
// lezen niet vertrouwt (router beslisRoute: 0 regels of merkdekking < 60%). De
// pagina's gaan in batches van LEESROUTE_BATCH_PAGES naar de tekst-leeslaag
// (lib/ai/leesroute.ts); de gelezen regels landen via exact dezelfde persist-lus
// als de OCR-route (verwerkGelezenRegels, lib/repo/ocr.ts): rijkste-wint-dedup,
// matcher, verplichte review (reviewKind 'ocr' waar nog geen flag staat, B7),
// run-snapshot.
//
// Harde keuzes die hier leven:
//   • source = 'pdf', GÉÉN nieuwe enum-waarde: semantisch is dit de tekst-PDF-
//     import (zelfde bron, zelfde markdown-controlespoor als recordPdfImport);
//     alleen het LEZEN gebeurt door het model. De spec-regels zelf dragen
//     source 'ocr' + sourceConfidence via codeValid (regelToSpecLine) — zo is
//     per regel zichtbaar dat een model hem las.
//   • Lege pagina's (text.trim() === "") slaan we deterministisch over: daar
//     valt niets te lezen en elke call kost geld. Dit is bewust géén O2-gok —
//     een pagina met ook maar íéts van tekst gaat gewoon mee.
//   • Skip (geen key / budget) stopt de run eerlijk: skip-event op de run
//     (regel 5), wat al gelezen is blijft staan, en het gestopt-veld vertelt de
//     aanroeper waarom. Een gefaalde batch (event al gelogd door leesrouteBatch)
//     stopt de run níét — de volgende batch kan gewoon slagen, zoals bij OCR.
//   • GEEN vangnet-trigger (B8): elke leesroute-regel heeft een open review
//     (reviewKind 'ocr' — of 'geel' van de matcher, óók open) en de vangnet-
//     gating sluit regels met een open review uit; een door het model gelezen
//     merk mag de merkvergrendelde zoektool niet sturen vóór een mens de bron
//     zag. De trigger volgt, net als bij OCR, uit de review-decide-flow.
import { importRuns } from "@/db/schema";
import {
  LEESROUTE_BATCH_PAGES,
  leesrouteBatch,
  type LeesroutePagina,
} from "@/lib/ai/leesroute";
import type { OcrClient } from "@/lib/ai/ocr";
import { verrijkRegelsMetSegment } from "@/lib/pdf/rijsegmenten";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { getImportRun } from "./imports";
import { regelToSpecLine, specRichness, verwerkGelezenRegels } from "./ocr";

export type RecordLeesrouteImportResult = {
  run: typeof importRuns.$inferSelect;
  created: number;
  duplicates: number;
  upgraded: number;
  // Aantal batches dat succesvol gelezen én verwerkt is (skips/failures tellen niet).
  batches: number;
  // Som van afgekapte pogingen over alle gelezen batches (tripwire-teller).
  truncated: number;
  costEur: number;
  gestopt: "budget_run" | "budget_month" | "no_key" | null;
};

export async function recordLeesrouteImport(
  db: AppDb,
  input: {
    dossierId: string;
    filename?: string | null;
    // De volledige tekstlaag, één string per pagina (1-gebaseerd via de index) —
    // exact wat de import-action van de browser krijgt.
    pages: string[];
    markdown: string;
    brandNames: string[];
    routerBesluit: {
      reden: "geen_regels" | "merkdekking";
      bekendeMerken: number;
      totaal: number;
    };
    client?: OcrClient;
    actor?: string;
  },
): Promise<RecordLeesrouteImportResult> {
  // (a) De run: zoals recordPdfImport (source 'pdf', direct 'bevestigd', markdown
  // als controlespoor), maar met lege rows/counts — de regels stromen per batch
  // binnen. pageCount in counts, zoals de OCR-run, voor de voortgangsweergave.
  // ocrStatus blijft null: dit is geen beeld-OCR-run (geen paginabeelden, geen
  // hervat-loop) — de batches lopen synchroon binnen deze ene aanroep.
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: "pdf",
      filename: input.filename ?? null,
      status: "bevestigd",
      rows: [],
      counts: { total: 0, checked: 0, pageCount: input.pages.length },
      rawMarkdown: input.markdown,
      actor: input.actor ?? null,
    })
    .returning();
  // Zelfde event als recordPdfImport (entity dossier, action import_run_created),
  // met de route + routerreden erbij zodat het audit-spoor vertelt wáárom dit
  // boek door het model gelezen werd (regel 5).
  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "import_run_created",
    actor: input.actor,
    payload: {
      runId: run.id,
      source: "pdf",
      rows: 0,
      status: "bevestigd",
      route: "leesroute",
      reden: input.routerBesluit.reden,
      bekendeMerken: input.routerBesluit.bekendeMerken,
      totaal: input.routerBesluit.totaal,
    },
  });

  // (b) Lege pagina's overslaan (deterministisch veilig — zie kop-commentaar).
  const paginas: LeesroutePagina[] = input.pages
    .map((text, i) => ({ pageNumber: i + 1, text }))
    .filter((p) => p.text.trim() !== "");

  // (c) Sequentieel batchen. `snapshot` volgt de rows/counts die
  // verwerkGelezenRegels per batch teruggeeft, zodat de dedup van batch n+1
  // tegen álles van batch 1..n toetst zonder de run te herladen.
  let snapshot = run;
  let created = 0;
  let duplicates = 0;
  let upgraded = 0;
  let batches = 0;
  let truncated = 0;
  let costEur = 0;
  let segmentRegels = 0;
  let segmentVerrijkt = 0;
  let gestopt: RecordLeesrouteImportResult["gestopt"] = null;

  for (let i = 0; i < paginas.length; i += LEESROUTE_BATCH_PAGES) {
    const batchPaginas = paginas.slice(i, i + LEESROUTE_BATCH_PAGES);
    const result = await leesrouteBatch(db, {
      importRunId: run.id,
      pages: batchPaginas,
      client: input.client,
      actor: input.actor,
    });

    // (d) Skip = stoppen: geen key komt niet terug binnen deze aanroep, en een
    // budgetplafond faalt ook voor elke volgende batch. Wat al gelezen is blijft
    // staan; het skip-event maakt de stop zichtbaar (regel 5, nooit stil).
    if ("skipped" in result) {
      gestopt = result.skipped;
      await logEvent(db, {
        entity: "import_run",
        entityId: run.id,
        action:
          result.skipped === "no_key"
            ? "leesroute_skipped_no_key"
            : "leesroute_skipped_budget",
        actor: input.actor,
        payload: { reden: result.skipped },
      });
      break;
    }
    // Gefaalde batch: leesroute_batch_failed is al gelogd — door met de rest.
    if ("failed" in result) continue;

    batches++;
    truncated += result.truncated;
    costEur += result.costEur;

    // (e-1) Gat B (20 jul): deterministische segment-verrijking. Het model kapt
    // ruwe_tekst soms af vóór de spec-sectie (de vier XAL-regels van dossier
    // ae0eead9 verloren zo al hun specs); de server heeft de volledige
    // paginatekst, dus snijden we per regel het échte rijsegment uit (model-
    // codes als ankers, lib/pdf/rijsegmenten.ts) en geeft regelToSpecLine dat
    // als extra parse-input mee. We voeden de VOLLEDIGE paginalijst, niet
    // alleen de batch: de paginaOnbekend-fallback kan een regel aan een andere
    // pagina toewijzen dan de batchgrens.
    const verrijkt = verrijkRegelsMetSegment(
      result.regels.map((r) => ({ ...r, page: r.pagina })),
      paginas,
    );
    // Teller voor het audit-event (regel 5): hoeveel regels kregen een segment
    // én werden er aantoonbaar rijker van (specRichness mét vs. zónder segment).
    for (const r of verrijkt) {
      if (!r.segmentTekst) continue;
      segmentRegels++;
      const zonder = specRichness(
        regelToSpecLine(r, r.page, run.id, input.brandNames),
      );
      const met = specRichness(
        regelToSpecLine(r, r.page, run.id, input.brandNames, r.segmentTekst),
      );
      if (met > zonder) segmentVerrijkt++;
    }

    // (e-2) Persisteren via exact de OCR-lus; de pagina komt per regel uit het
    // verplichte pagina-veld van het tekst-toolschema.
    const verwerkt = await verwerkGelezenRegels(db, {
      run: snapshot,
      regels: verrijkt,
      brandNames: input.brandNames,
      actor: input.actor,
    });
    created += verwerkt.created;
    duplicates += verwerkt.duplicates;
    upgraded += verwerkt.upgraded;
    snapshot = { ...snapshot, rows: verwerkt.rows, counts: verwerkt.counts };
  }

  // Audit (regel 5): één run-event als de segment-verrijking iets deed — licht,
  // geen event per regel; het batch-event zelf blijft van lib/ai/leesroute.ts.
  if (segmentRegels > 0) {
    await logEvent(db, {
      entity: "import_run",
      entityId: run.id,
      action: "leesroute_segmenten_verrijkt",
      actor: input.actor,
      payload: { regelsMetSegment: segmentRegels, regelsVerrijkt: segmentVerrijkt },
    });
  }

  // (f) Totalen. GEEN triggerVangnet hier (B8, zie kop-commentaar): elke
  // leesroute-regel draagt een open reviewKind en de vangnet-gating sluit die
  // uit — de trigger hoort bij de review-beslissing, niet bij de import.
  const fresh = await getImportRun(db, run.id);
  return {
    run: fresh ?? snapshot,
    created,
    duplicates,
    upgraded,
    batches,
    truncated,
    costEur,
    gestopt,
  };
}
