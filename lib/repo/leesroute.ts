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
//   • A6-VANGNET (reviewzwerm 2.5a): de batchlus loopt serieel binnen ÉÉN server
//     action; per batch staat er tot ~240 s (CALL_TIMEOUT_MS 120 s + tweede poging)
//     tegen een functieplafond van 300 s. Een boek van 40 pagina's haalt dat niet.
//     Dit is NIET de echte oplossing (die trekt de leesroute naar het OCR-patroon:
//     één action per batch, door de client aangestuurd) — het is het vangnet:
//     (1) `app/projects/[id]/page.tsx` zet een expliciete `maxDuration`, zodat het
//     plafond een keuze is; (2) de run-rij draagt een STAND. `ocrStatus` 'bezig'
//     vanaf de eerste regel, 'klaar' als de lus hem uitloopt, 'gestopt' bij een
//     budgetstop. Kapt het platform de functie af, dan blijft de rij op 'bezig'
//     staan mét `counts.pagesDone` — herkenbaar afgebroken (niet mislukt, niet
//     klaar) en hervatbaar: dezelfde upload pakt die run op en leest verder vanaf
//     de eerste onbehandelde pagina. Geen nieuw mechanisme: dit is exact de
//     hervat-vorm van startOcrRun (lib/repo/ocr.ts), en de dedup over batches heen
//     bestond al (run.rows, rijkste-wint).
import { and, desc, eq } from "drizzle-orm";
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
  // A6: pakte deze aanroep een eerder afgebroken run op (ocrStatus 'bezig')?
  hervat: boolean;
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
  // (a-0) A6: bestaat er voor precies dit dossier + bestand al een leesroute-run
  // die op 'bezig' bleef staan, dan is dít een hervatting van een afgebroken run —
  // geen tweede run. Zelfde vorm als startOcrRun; de source-filter ('pdf' hier,
  // 'ocr' daar) houdt de twee routes uit elkaars vaarwater.
  const [afgebroken] = input.filename
    ? await db
        .select()
        .from(importRuns)
        .where(
          and(
            eq(importRuns.dossierId, input.dossierId),
            eq(importRuns.source, "pdf"),
            eq(importRuns.filename, input.filename),
            eq(importRuns.ocrStatus, "bezig"),
          ),
        )
        .orderBy(desc(importRuns.createdAt))
        .limit(1)
    : [];

  // (a) De run: zoals recordPdfImport (source 'pdf', direct 'bevestigd', markdown
  // als controlespoor), maar met lege rows/counts — de regels stromen per batch
  // binnen. pageCount in counts, zoals de OCR-run, voor de voortgangsweergave.
  // ocrStatus 'bezig' is hier de A6-stand: "deze run loopt nog" (zie kop) — niet
  // beeld-OCR, want die queries filteren allemaal op source 'ocr'.
  const hervat = !!afgebroken;
  const run =
    afgebroken ??
    (
      await db
        .insert(importRuns)
        .values({
          dossierId: input.dossierId,
          source: "pdf",
          filename: input.filename ?? null,
          status: "bevestigd",
          rows: [],
          counts: {
            total: 0,
            checked: 0,
            pageCount: input.pages.length,
            pagesDone: 0,
          },
          ocrStatus: "bezig",
          rawMarkdown: input.markdown,
          actor: input.actor ?? null,
        })
        .returning()
    )[0];
  // Zelfde event als recordPdfImport (entity dossier, action import_run_created),
  // met de route + routerreden erbij zodat het audit-spoor vertelt wáárom dit
  // boek door het model gelezen werd (regel 5). Bij een hervatting is de run al
  // aangemaakt — dan een hervat-event, zodat het afkappen zichtbaar blijft.
  const eerderGedaan = Number(run.counts?.pagesDone ?? 0);
  if (hervat) {
    await logEvent(db, {
      entity: "import_run",
      entityId: run.id,
      action: "leesroute_resumed",
      actor: input.actor,
      payload: {
        filename: input.filename ?? null,
        pagesDone: eerderGedaan,
        pageCount: input.pages.length,
      },
    });
  } else {
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
  }

  // (b) Lege pagina's overslaan (deterministisch veilig — zie kop-commentaar), en
  // bij een hervatting alles wat de afgebroken run al las (A6): verder waar hij
  // ophield, geen tweede keer betalen voor dezelfde pagina's.
  const paginas: LeesroutePagina[] = input.pages
    .map((text, i) => ({ pageNumber: i + 1, text }))
    .filter((p) => p.text.trim() !== "" && p.pageNumber > eerderGedaan);

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
  // A6-HERSTEL: pagesDone is een AANEENGESLOTEN voortgangsmerk ("tot hier is alles
  // gelezen"), geen "laatste pagina die toevallig lukte". Een gefaalde batch slaat
  // de lus over (`continue`) zonder pagesDone te verhogen — zette een látere batch
  // hem dan op zijn eigen laatste pagina, dan sprong het merk over het gat heen en
  // werden die pagina's bij een hervatting stilzwijgend overgeslagen (paginaverlies).
  // Na een gat schuift het merk daarom niet meer op: een hervatting begint bij de
  // eerste pagina van de gefaalde batch en leest de rest opnieuw. Dat kost een
  // tweede lezing van pagina's die al verwerkt zijn — geen duplicaten, want de
  // dedup van verwerkGelezenRegels toetst tegen de database (lib/repo/ocr.ts).
  let pagesDoneAaneengesloten = eerderGedaan;
  let gatInDeVoortgang = false;

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
    // Gefaalde batch: leesroute_batch_failed is al gelogd — door met de rest, maar
    // de voortgang heeft nu een gat en pagesDone bevriest (zie boven).
    if ("failed" in result) {
      gatInDeVoortgang = true;
      continue;
    }

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
    // A6: pagesDone gaat MEE in dezelfde snapshot-update die verwerkGelezenRegels
    // toch al doet (die spreidt run.counts) — geen extra schrijfactie, en de
    // voortgang staat pas in de database als de batch écht verwerkt is.
    if (!gatInDeVoortgang) {
      pagesDoneAaneengesloten =
        batchPaginas[batchPaginas.length - 1].pageNumber;
    }
    snapshot = {
      ...snapshot,
      counts: {
        ...(snapshot.counts ?? {}),
        pagesDone: pagesDoneAaneengesloten,
      },
    };
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

  // (f-0) A6: de eindstand op de run-rij. 'klaar' = de lus liep uit. Een
  // budgetstop is terminaal ('gestopt', zoals processOcrPage doet): hervatten
  // levert dezelfde weigering op. Zonder key blijft de run bewust op 'bezig' —
  // key terug = gewoon verder, precies het OCR-gedrag. En kapt het platform de
  // functie hierboven af, dan wordt deze update nooit bereikt en blijft 'bezig'
  // staan: dát is de afgebroken-stand waaraan de volgende poging verder kan.
  if (gestopt !== "no_key") {
    const eindstand =
      gestopt === "budget_run" || gestopt === "budget_month"
        ? "gestopt"
        : "klaar";
    await db
      .update(importRuns)
      .set({ ocrStatus: eindstand, updatedAt: new Date() })
      .where(eq(importRuns.id, run.id));
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
    hervat,
  };
}
