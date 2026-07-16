// Meetinstrument (stap 0 van docs/goal-import-ai-leesroute.md): haalt de vier echte
// testcases door het EXACTE productiecodepad en meet ze tegen de grondwaarheid
// (scripts/eval/grondwaarheid.ts). Draaien:
//
//   bun --env-file=.env.local scripts/eval-testset.ts [flags]
//
// Flags:
//   --json               machine-leesbaar volledig resultaatobject naar stdout
//   --case=<key>         alleen raadhuis|kvk|tno|dordrecht
//   --rank-limit=<n>     kandidaten-limiet voor de rang-meting (default 50)
//   --assert-nulmeting   toets de nulmeting van 16 jul; exit 1 bij elke afwijking
//                        (zonder AI gedefinieerd — combineren met --ai is een fout)
//   --ai                 AI-routes met echte API-calls (kosten!); vereist
//                        ANTHROPIC_API_KEY. Twee smaken, exact het productiepad:
//                        • geen tekstlaag → OCR/vision per pagina (dordrecht);
//                        • tekstlaag maar router zegt leesroute (beslisRoute:
//                          0 regels of merkdekking < 60%) → AI-tekstroute in
//                          batches van LEESROUTE_BATCH_PAGES (readPagesTextWithModel,
//                          de pure variant). Zonder --ai blijft bij een leesroute-
//                          besluit het deterministische resultaat staan, mét melding.
//
// ── CONTRACT: STRIKT READ-ONLY (met één gedocumenteerde uitzondering) ────────
// Dit script schrijft geen domeindata. Het roept bewust géén runMatcher, logEvent,
// addSpecLines of enige andere functie aan die insert/update/delete doet. Het enige
// DB-verkeer is evaluateSpecLine (lib/matching/engine.ts) — die doet uitsluitend
// selects — plus één `select name from brands` en één pg_trgm-smoke-select.
// UITZONDERING (--ai, budgetplicht): elke echte AI-call-eenheid (vision-pagina óf
// leesroute-batch) insert precies één llm_usage-rij { purpose: 'eval', costEur,
// importRunId: null }. Dev draait op de prod-database, dus elke betaalde call MOET
// meetellen in het maandbudget (L-06) — niet schrijven zou de budgetteller
// ondergraven. GEEN events, GEEN spec_lines, GEEN import_runs; llm_usage is de
// enige toegestane write.
// (Nuance: regelToSpecLine wordt uit lib/repo/ocr.ts geïmporteerd — die module
// bevat óók schrijvende functies, maar dit script roept uitsluitend de pure
// helpers regelToSpecLine en specRichness aan.)
// De testset-PDF's zijn echte klantdata: dit script LEEST ze alleen (EVAL_DIR,
// default ~/Downloads/lumenlogic-testset) en ze komen nooit in git.
// ─────────────────────────────────────────────────────────────────────────────
//
// Codepad per case (identiek aan de import-action, app/projects/actions.ts):
//   fs.readFile → extractPagesFromPdf → parseSpecLinesFromPages(pages, brandNames)
//   → per regel SpecRequest (specRequestFromLine-vorm) → evaluateSpecLine(db, req)
//   met de DEFAULT limit voor de statuskolom; voor gemapte regels een tweede call
//   met { limit: rankLimit } voor de rang van Jayden's artikelcode.

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brands, llmUsage } from "@/db/schema";
import {
  beslisRoute,
  LEESROUTE_BATCH_PAGES,
  readPagesTextWithModel,
  type LeesroutePagina,
} from "@/lib/ai/leesroute";
import {
  createAnthropicOcrClient,
  readPageWithVision,
  type OcrAttempt,
} from "@/lib/ai/ocr";
import { envApiKey, EUR_PER_MTOK_IN, EUR_PER_MTOK_OUT } from "@/lib/ai/shared";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import type { SpecLineInput } from "@/lib/repo/dossiers";
import { regelToSpecLine, specRichness } from "@/lib/repo/ocr";
import { getLlmSpend, getSetting } from "@/lib/repo/settings";
import {
  brandKeyOf,
  evaluateSpecLine,
  type MatchOutcome,
  type ScoredCandidate,
  type SpecRequest,
} from "@/lib/matching/engine";
import { normalizeSku } from "@/lib/matching/tolerances";
import {
  GRONDWAARHEID,
  type GrondwaarheidCase,
} from "./eval/grondwaarheid";
import { openPdf, renderPageToJpeg } from "./eval/raster";

// ── flags ────────────────────────────────────────────────────────────────────

type Flags = {
  json: boolean;
  caseKey: string | null;
  rankLimit: number;
  assertNulmeting: boolean;
  ai: boolean;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    json: false,
    caseKey: null,
    rankLimit: 50,
    assertNulmeting: false,
    ai: false,
  };
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--assert-nulmeting") flags.assertNulmeting = true;
    else if (arg === "--ai") flags.ai = true;
    else if (arg.startsWith("--case=")) {
      const v = arg.slice("--case=".length);
      if (!GRONDWAARHEID.some((c) => c.key === v)) {
        console.error(
          `Onbekende case '${v}' — kies uit: ${GRONDWAARHEID.map((c) => c.key).join("|")}`,
        );
        process.exit(1);
      }
      flags.caseKey = v;
    } else if (arg.startsWith("--rank-limit=")) {
      const n = Number(arg.slice("--rank-limit=".length));
      if (!Number.isInteger(n) || n < 1) {
        console.error(`Ongeldige --rank-limit '${arg}' — verwacht een positief geheel getal.`);
        process.exit(1);
      }
      flags.rankLimit = n;
    } else {
      console.error(`Onbekende flag '${arg}'.`);
      process.exit(1);
    }
  }
  return flags;
}

// ── artikelcode-vergelijking ─────────────────────────────────────────────────
// L-prefix-bevinding (read-only geverifieerd, 16 jul 2026): álle 210.117
// article_codes in visible_products beginnen met "L". Jayden's codes zoals
// "L3600482413537F" staan er letterlijk in als article_code "L360048-2413537F" —
// normalizeSku over article_code matcht dus direct, MÉT L-prefix.
// supplier_article_code is dezelfde code zónder het "L360…"-leveranciersprefix
// ("048-2413537F") en matcht niet, ook niet na L-strippen; bovendien draagt
// ScoredCandidate dat veld niet. We vergelijken daarom normalizeSku(articleCode)
// tegen de volledige én de L-gestripte Jayden-code (beide richtingen), zodat een
// eventueel prefix-loos gevoerde code ook telt. De zes Dordrecht-artikelcodes
// (Philips/Valerie Objects/Aromas/Ferm Living) staan in het geheel niet in
// products of visible_products — die rang blijft per definitie ">limit".
function candidateMatches(c: ScoredCandidate, artikelCodes: string[]): boolean {
  if (!c.articleCode) return false;
  const ac = normalizeSku(c.articleCode);
  return artikelCodes.some((j) => {
    const nj = normalizeSku(j);
    return ac === nj || ac === nj.replace(/^l/, "") || ac.replace(/^l/, "") === nj;
  });
}

// SpecRequest in exact de specRequestFromLine-vorm (lib/repo/matching.ts) — daar
// niet geïmporteerd omdat die module logEvent/runMatcher meebrengt en dit script
// contractueel niets uit de schrijvende repo-laag importeert. SpecLineInput draagt
// de req-velden al als number|null, dus de Number()-conversies van de DB-rij
// (numeric → string) zijn hier niet nodig.
function toSpecRequest(l: SpecLineInput): SpecRequest {
  return {
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    sku: null,
    specs: {
      kelvin: l.reqKelvin ?? null,
      cri: l.reqCri ?? null,
      ip: l.reqIp ?? null,
      watt: l.reqWatt ?? null,
      lumen: l.reqLumen ?? null,
      beamAngle: l.reqBeamAngle ?? null,
      sizeCm: l.reqSizeCm ?? null,
      shape: l.reqShape ?? null,
      color: l.reqColor ?? null,
      dimmable: l.reqDimmable ?? null,
    },
  };
}

// ── resultaatmodel ───────────────────────────────────────────────────────────

type MerkOordeel = "bestaand" | "fout" | "leeg";

type RegelResultaat = {
  code: string;
  gelezen: boolean;
  spook: boolean;
  // Spookcode die in bekendeExtraCodes staat: de bron bevat hem letterlijk maar
  // hij valt buiten de grondwaarheid-scope — "(bekend, buiten scope)", geen
  // hallucinatie. Apart geteld van onverwachte spookcodes.
  spookBekend: boolean;
  // Alleen OCR-route: matcht de gelezen code de CODE-regex? Informatief, geen
  // poort — Dordrecht-lettercodes (Ad, B, C1…) zijn per definitie codeValid=false.
  // Tekstroute: null (daar bestaat het begrip niet — de parser matcht per regex).
  codeValid: boolean | null;
  merkText: string | null;
  merkOordeel: MerkOordeel | null;
  status: string | null;
  // rang van Jayden's artikelcode in [...provable, ...incomplete] (1-based) bij
  // limit=rankLimit; null = geen mapping; ">N" = niet gevonden binnen de limiet
  rang: number | string | null;
  autoKeuze: boolean | null; // B3: unambiguousYellow matcht Jayden
  top1: boolean | null; // informatief: provable[0] ?? incomplete[0] matcht
};

// Tripwire-metadata per gerasteriseerde pagina (--ai): wat de vision-call deed
// en kostte. attempts komt 1-op-1 uit readPageWithVision (max 2: de O3-retry).
type OcrPaginaMeta = {
  pdf: string;
  pagina: number;
  regels: number;
  codeInvalid: number;
  attempts: OcrAttempt[];
  truncated: number;
  costEur: number;
};

type OcrCaseMeta = {
  paginas: OcrPaginaMeta[];
  kostenEur: number;
  truncatedPaginas: number; // pagina's met ≥1 afgekapte poging
};

// Tripwire-metadata per leesroute-batch (--ai, tekstlaag met leesroute-besluit):
// wat de tekst-call deed en kostte, plus het paginaOnbekend-signaal (regels
// waarvoor het model geen geldige batchpagina rapporteerde).
type LeesrouteBatchMeta = {
  paginas: [number, number]; // [eerste..laatste] pagina van de batch
  regels: number;
  codeInvalid: number;
  paginaOnbekend: number;
  attempts: OcrAttempt[];
  truncated: number;
  costEur: number;
};

type LeesrouteCaseMeta = {
  batches: LeesrouteBatchMeta[];
  kostenEur: number;
  truncatedBatches: number; // batches met ≥1 afgekapte poging
  paginaOnbekend: number;
};

type CaseResultaat = {
  key: string;
  bron: string;
  hadText: boolean;
  tekstlaagVerwacht: boolean;
  melding: string | null;
  historischeNoot: string | null;
  // Het routerbesluit (beslisRoute) over het deterministische parse-resultaat —
  // exact het productie-beslispad; null zonder tekstlaag (dan beslist de router niet).
  router: ReturnType<typeof beslisRoute> | null;
  // alleen gevuld als de OCR/vision-route echt gedraaid heeft (--ai, geen tekstlaag)
  ocr: OcrCaseMeta | null;
  // alleen gevuld als de AI-tekstroute echt gedraaid heeft (--ai + router: leesroute)
  leesroute: LeesrouteCaseMeta | null;
  import: {
    gelezen: number;
    verwacht: number;
    gemist: string[];
    // onverwachte spookcodes (mogelijk hallucinatie) …
    spookcodes: string[];
    // … versus codes die de bron wél letterlijk bevat maar buiten scope vallen
    spookcodesBekend: string[];
  };
  merk: {
    bestaand: number;
    fout: number;
    leeg: number;
    gelezenTotaal: number;
    verwachtGoed: number;
    verwachtBekend: number;
  };
  status: Record<string, number>;
  keuze: {
    nvt: boolean;
    gemapt: number;
    inTopRank: number;
    autoGoed: number;
    top1Goed: number;
  };
  regels: RegelResultaat[];
  duurMs: number;
};

// ── merk-oordeel (in-process, één brands-fetch) ──────────────────────────────
// Drie emmers: "bestaand merk" (brandKeyOf ∈ brands én — waar verwacht bekend —
// gelijk aan het verwachte merk), "fout" (gevuld maar geen bestaand merk óf ≠
// verwacht-waar-bekend), "leeg" (null — eerlijk onbekend, GEEN fout).
function merkOordeel(
  brandText: string | null,
  verwachtMerk: string | undefined,
  brandKeySet: Set<string>,
): MerkOordeel {
  if (brandText == null || brandText.trim() === "") return "leeg";
  const key = brandKeyOf(brandText);
  if (!brandKeySet.has(key)) return "fout";
  if (verwachtMerk && key !== brandKeyOf(verwachtMerk)) return "fout";
  return "bestaand";
}

// ── OCR/vision-route (--ai) ──────────────────────────────────────────────────
// Het eval-equivalent van de productieloop: elke pagina server-side rasteriseren
// (scripts/eval/raster.ts — zelfde maat/kwaliteit als de browser-route) en lezen
// met readPageWithVision — exact de productiefunctie, inclusief de interne
// max_tokens-tripwire-retry (lib/ai/ocr.ts). Dedup over pagina's én PDF's op
// fixtureCode: de rijkste lezing wint (specRichness), zoals processOcrPage.

// Lokaal hernomen €1-plafond (productie: OCR_MAX_EUR_PER_RUN per importRun) —
// er is hier geen importRun om tegen te sommen, dus een scriptlokale teller.
const EVAL_RUN_CAP_EUR = 1.0;

async function ocrCase(
  c: GrondwaarheidCase,
  evalDir: string,
  brandNames: string[],
  runKosten: { eur: number },
): Promise<{
  lines: SpecLineInput[];
  codeValidByCode: Map<string, boolean>;
  meta: OcrCaseMeta;
  melding: string | null;
}> {
  const client = createAnthropicOcrClient(envApiKey()!);
  const paginas: OcrPaginaMeta[] = [];
  const beste = new Map<string, { line: SpecLineInput; codeValid: boolean }>();
  let melding: string | null = null;

  buiten: for (const rel of c.pdfPaden) {
    const bytes = await readFile(path.join(evalDir, ...rel.split("/")));
    const pdf = await openPdf(new Uint8Array(bytes));
    for (let p = 1; p <= pdf.numPages; p++) {
      // Budgetpoorten vóór elke call (zelfde semantiek als checkOcrBudget in
      // productie): eerst het maandbudget (L-06) over de hele llm_usage-tabel …
      const maandCap = await getSetting<number>(db, "llm_budget_eur");
      if (maandCap != null) {
        const maandSpend = await getLlmSpend(db);
        if (maandSpend >= maandCap) {
          melding =
            `maandbudget bereikt (€${maandSpend.toFixed(2)} ≥ €${maandCap.toFixed(2)}) — ` +
            `OCR gestopt vóór ${rel} p.${p}`;
          break buiten;
        }
      }
      // … dan het €1-runplafond, scriptlokaal (som van de eval-callkosten in deze run).
      if (runKosten.eur >= EVAL_RUN_CAP_EUR) {
        melding =
          `eval-runplafond €${EVAL_RUN_CAP_EUR.toFixed(2)} bereikt ` +
          `(€${runKosten.eur.toFixed(4)}) — OCR gestopt vóór ${rel} p.${p}`;
        break buiten;
      }

      const { jpegBytes } = await renderPageToJpeg(pdf, p);
      const { regels, usage, attempts, truncated } = await readPageWithVision({
        client,
        imageBytes: jpegBytes,
        mime: "image/jpeg",
        pageNumber: p,
      });
      // Kosten exact zoals ocrPage ze rekent (usage = somtotalen over 1–2 pogingen).
      const costEur =
        (usage.inputTokens * EUR_PER_MTOK_IN +
          usage.outputTokens * EUR_PER_MTOK_OUT) /
        1_000_000;
      runKosten.eur += costEur;
      // Budgetplicht (zie contract in de kop): dev = prod-DB, elke echte call moet
      // meetellen in het maandbudget. Dit is de ENIGE DB-write van dit script.
      await db.insert(llmUsage).values({
        purpose: "eval",
        costEur: costEur.toFixed(4),
        importRunId: null,
      });

      paginas.push({
        pdf: rel,
        pagina: p,
        regels: regels.length,
        codeInvalid: regels.filter((r) => !r.codeValid).length,
        attempts,
        truncated,
        costEur,
      });
      process.stderr.write(
        `[${c.key} ocr ${rel} p.${p}/${pdf.numPages}] regels=${regels.length} ` +
          `attempts=${attempts.length} truncated=${truncated} kosten=€${costEur.toFixed(4)}\n`,
      );

      for (const regel of regels) {
        // "eval" als runId-placeholder: regelToSpecLine zet hem alleen in het
        // importRunId-veld, en dit script schrijft de regel nooit naar de DB.
        const line = regelToSpecLine(regel, p, "eval", brandNames);
        const huidige = beste.get(regel.armatuurcode);
        if (!huidige || specRichness(line) > specRichness(huidige.line)) {
          beste.set(regel.armatuurcode, { line, codeValid: regel.codeValid });
        }
      }
    }
  }

  return {
    lines: [...beste.values()].map((b) => b.line),
    codeValidByCode: new Map(
      [...beste.entries()].map(([code, b]) => [code, b.codeValid]),
    ),
    meta: {
      paginas,
      kostenEur: paginas.reduce((s, pg) => s + pg.costEur, 0),
      truncatedPaginas: paginas.filter((pg) => pg.truncated > 0).length,
    },
    melding,
  };
}

// ── AI-tekstroute (--ai + router: leesroute) ─────────────────────────────────
// Het eval-equivalent van recordLeesrouteImport (lib/repo/leesroute.ts): lege
// pagina's deterministisch overslaan, batches van LEESROUTE_BATCH_PAGES door
// readPagesTextWithModel (de PURE productiefunctie, incl. batch-retry-tripwire),
// per regel de exacte productie-omzetting regelToSpecLine(regel, regel.pagina, …)
// en de rijkste-wint-dedup — zelfde vorm als de bestaande OCR-tak hierboven.
// Budget: dezelfde maandbudget-poort + scriptlokale runcap als ocrCase; elke
// batch-call is één llm_usage-rij { purpose: 'eval', importRunId: null }.
async function leesrouteCase(
  c: GrondwaarheidCase,
  pages: string[],
  brandNames: string[],
  runKosten: { eur: number },
): Promise<{
  lines: SpecLineInput[];
  codeValidByCode: Map<string, boolean>;
  meta: LeesrouteCaseMeta;
  melding: string | null;
}> {
  const client = createAnthropicOcrClient(envApiKey()!);
  const batches: LeesrouteBatchMeta[] = [];
  const beste = new Map<string, { line: SpecLineInput; codeValid: boolean }>();
  let melding: string | null = null;
  let paginaOnbekendTotaal = 0;

  // Zelfde deterministische zeef als recordLeesrouteImport: een lege pagina
  // heeft niets te lezen en mag geen call kosten.
  const paginas: LeesroutePagina[] = pages
    .map((text, i) => ({ pageNumber: i + 1, text }))
    .filter((p) => p.text.trim() !== "");

  for (let i = 0; i < paginas.length; i += LEESROUTE_BATCH_PAGES) {
    const batch = paginas.slice(i, i + LEESROUTE_BATCH_PAGES);
    const bereik: [number, number] = [
      batch[0].pageNumber,
      batch[batch.length - 1].pageNumber,
    ];
    // Budgetpoorten vóór elke call (zelfde semantiek als checkOcrBudget):
    // eerst het maandbudget (L-06) …
    const maandCap = await getSetting<number>(db, "llm_budget_eur");
    if (maandCap != null) {
      const maandSpend = await getLlmSpend(db);
      if (maandSpend >= maandCap) {
        melding =
          `maandbudget bereikt (€${maandSpend.toFixed(2)} ≥ €${maandCap.toFixed(2)}) — ` +
          `leesroute gestopt vóór p.${bereik[0]}–${bereik[1]}`;
        break;
      }
    }
    // … dan het €1-runplafond, scriptlokaal.
    if (runKosten.eur >= EVAL_RUN_CAP_EUR) {
      melding =
        `eval-runplafond €${EVAL_RUN_CAP_EUR.toFixed(2)} bereikt ` +
        `(€${runKosten.eur.toFixed(4)}) — leesroute gestopt vóór p.${bereik[0]}–${bereik[1]}`;
      break;
    }

    const { regels, paginaOnbekend, usage, attempts, truncated } =
      await readPagesTextWithModel({ client, pages: batch });
    const costEur =
      (usage.inputTokens * EUR_PER_MTOK_IN +
        usage.outputTokens * EUR_PER_MTOK_OUT) /
      1_000_000;
    runKosten.eur += costEur;
    // Budgetplicht (zie contract in de kop): de enige toegestane DB-write.
    await db.insert(llmUsage).values({
      purpose: "eval",
      costEur: costEur.toFixed(4),
      importRunId: null,
    });

    batches.push({
      paginas: bereik,
      regels: regels.length,
      codeInvalid: regels.filter((r) => !r.codeValid).length,
      paginaOnbekend,
      attempts,
      truncated,
      costEur,
    });
    paginaOnbekendTotaal += paginaOnbekend;
    process.stderr.write(
      `[${c.key} leesroute p.${bereik[0]}–${bereik[1]}] regels=${regels.length} ` +
        `paginaOnbekend=${paginaOnbekend} attempts=${attempts.length} ` +
        `truncated=${truncated} kosten=€${costEur.toFixed(4)}\n`,
    );

    for (const regel of regels) {
      // "eval" als runId-placeholder — de regel gaat nooit naar de DB.
      const line = regelToSpecLine(regel, regel.pagina, "eval", brandNames);
      const huidige = beste.get(regel.armatuurcode);
      if (!huidige || specRichness(line) > specRichness(huidige.line)) {
        beste.set(regel.armatuurcode, { line, codeValid: regel.codeValid });
      }
    }
  }

  return {
    lines: [...beste.values()].map((b) => b.line),
    codeValidByCode: new Map(
      [...beste.entries()].map(([code, b]) => [code, b.codeValid]),
    ),
    meta: {
      batches,
      kostenEur: batches.reduce((s, b) => s + b.costEur, 0),
      truncatedBatches: batches.filter((b) => b.truncated > 0).length,
      paginaOnbekend: paginaOnbekendTotaal,
    },
    melding,
  };
}

// ── één case meten ───────────────────────────────────────────────────────────

async function meetCase(
  c: GrondwaarheidCase,
  evalDir: string,
  brandNames: string[],
  brandKeySet: Set<string>,
  flags: Flags,
  runKosten: { eur: number },
): Promise<CaseResultaat> {
  const t0 = performance.now();

  const pages: string[] = [];
  for (const rel of c.pdfPaden) {
    const bytes = await readFile(path.join(evalDir, ...rel.split("/")));
    pages.push(...(await extractPagesFromPdf(new Uint8Array(bytes))));
  }

  // het exacte productiecodepad (app/projects/actions.ts, importArmaturenboekPagesAction)
  const parsed = parseSpecLinesFromPages(pages, brandNames);
  // … inclusief het routerbesluit (stap 3): beslisRoute over het deterministische
  // resultaat — alleen bij een aanwezige tekstlaag, precies zoals de action.
  const router = parsed.hadText ? beslisRoute(parsed.lines) : null;

  let lines = parsed.lines;
  let melding: string | null = null;
  let ocrMeta: OcrCaseMeta | null = null;
  let leesrouteMeta: LeesrouteCaseMeta | null = null;
  let codeValidByCode: Map<string, boolean> | null = null;
  if (!parsed.hadText) {
    if (!flags.ai) {
      melding = "geen tekstlaag; OCR-route overgeslagen (--ai)";
    } else if (!envApiKey()) {
      melding =
        "--ai gevraagd maar geen ANTHROPIC_API_KEY in de omgeving — OCR-route overgeslagen";
    } else {
      const ocr = await ocrCase(c, evalDir, brandNames, runKosten);
      lines = ocr.lines;
      codeValidByCode = ocr.codeValidByCode;
      ocrMeta = ocr.meta;
      melding = ocr.melding;
    }
  } else if (router != null && router.route === "leesroute") {
    if (!flags.ai) {
      // Zonder --ai blijft het deterministische resultaat het meetobject — zo
      // blijft --assert-nulmeting geldig; de melding maakt het besluit zichtbaar.
      melding = `AI-leesroute nodig (router: ${router.reden}) — overgeslagen zonder --ai`;
    } else if (!envApiKey()) {
      melding =
        "--ai gevraagd maar geen ANTHROPIC_API_KEY in de omgeving — AI-leesroute overgeslagen";
    } else {
      const lr = await leesrouteCase(c, pages, brandNames, runKosten);
      lines = lr.lines;
      codeValidByCode = lr.codeValidByCode;
      leesrouteMeta = lr.meta;
      melding = lr.melding;
    }
  }

  const codesSet = new Set(c.codes);
  const bekendeExtra = new Set(c.bekendeExtraCodes ?? []);
  const lineByCode = new Map<string, SpecLineInput>();
  for (const l of lines) lineByCode.set(l.fixtureCode, l);

  const status: Record<string, number> = {};
  const regels: RegelResultaat[] = [];
  const merk = { bestaand: 0, fout: 0, leeg: 0, gelezenTotaal: 0, verwachtGoed: 0, verwachtBekend: 0 };
  const keuze = { nvt: Object.keys(c.keuze).length === 0, gemapt: 0, inTopRank: 0, autoGoed: 0, top1Goed: 0 };

  let i = 0;
  for (const line of lines) {
    i++;
    const tLine = performance.now();
    const code = line.fixtureCode;
    const spook = !codesSet.has(code);
    const verwachtMerk = c.verwachtMerkPerCode[code];

    // statuskolom: het productiepad met de DEFAULT limit
    const req = toSpecRequest(line);
    const outcome = await evaluateSpecLine(db, req);
    status[outcome.status] = (status[outcome.status] ?? 0) + 1;

    // merk-oordeel
    const oordeel = merkOordeel(line.brandText ?? null, verwachtMerk, brandKeySet);
    merk[oordeel]++;
    merk.gelezenTotaal++;
    if (verwachtMerk) {
      merk.verwachtBekend++;
      if (
        line.brandText != null &&
        brandKeyOf(line.brandText) === brandKeyOf(verwachtMerk)
      ) {
        merk.verwachtGoed++;
      }
    }

    // rang + keuze, alleen voor regels mét Jayden-mapping (tweede call, ruimere limit)
    let rang: RegelResultaat["rang"] = null;
    let autoKeuze: boolean | null = null;
    let top1: boolean | null = null;
    const mapping = c.keuze[code];
    if (mapping) {
      keuze.gemapt++;
      const wide: MatchOutcome = await evaluateSpecLine(db, req, {
        limit: flags.rankLimit,
      });
      const kandidaten = [...wide.provable, ...wide.incomplete];
      const idx = kandidaten.findIndex((k) =>
        candidateMatches(k, mapping.artikelCodes),
      );
      rang = idx >= 0 ? idx + 1 : `>${flags.rankLimit}`;
      if (idx >= 0) keuze.inTopRank++;

      // auto-keuze (B3) en top-1 op de DEFAULT-outcome — dat is wat productie doet
      autoKeuze =
        outcome.unambiguousYellow != null &&
        candidateMatches(outcome.unambiguousYellow, mapping.artikelCodes);
      if (autoKeuze) keuze.autoGoed++;
      const top = outcome.provable[0] ?? outcome.incomplete[0];
      top1 = top != null && candidateMatches(top, mapping.artikelCodes);
      if (top1) keuze.top1Goed++;
    }

    regels.push({
      code,
      gelezen: true,
      spook,
      spookBekend: spook && bekendeExtra.has(code),
      codeValid: codeValidByCode ? (codeValidByCode.get(code) ?? null) : null,
      merkText: line.brandText ?? null,
      merkOordeel: oordeel,
      status: outcome.status,
      rang,
      autoKeuze,
      top1,
    });

    const dt = ((performance.now() - tLine) / 1000).toFixed(1);
    process.stderr.write(
      `[${c.key} ${i}/${lines.length}] ${code} → ${outcome.status}, ${dt}s\n`,
    );
  }

  // niet-gelezen verwachte codes als lege rijen erbij (voor de regel-tabel)
  const gelezenVerwacht = c.codes.filter((code) => lineByCode.has(code));
  const gemist = c.codes.filter((code) => !lineByCode.has(code));
  for (const code of gemist) {
    regels.push({
      code,
      gelezen: false,
      spook: false,
      spookBekend: false,
      codeValid: null,
      merkText: null,
      merkOordeel: null,
      status: null,
      rang: null,
      autoKeuze: null,
      top1: null,
    });
  }
  const alleSpook = lines
    .map((l) => l.fixtureCode)
    .filter((code) => !codesSet.has(code));
  const spookcodes = alleSpook.filter((code) => !bekendeExtra.has(code));
  const spookcodesBekend = alleSpook.filter((code) => bekendeExtra.has(code));

  return {
    key: c.key,
    bron: c.pdfPaden.join(" + "),
    hadText: parsed.hadText,
    tekstlaagVerwacht: c.tekstlaagVerwacht,
    melding,
    historischeNoot: c.historischeNoot ?? null,
    router,
    ocr: ocrMeta,
    leesroute: leesrouteMeta,
    import: {
      gelezen: gelezenVerwacht.length,
      verwacht: c.codes.length,
      gemist,
      spookcodes,
      spookcodesBekend,
    },
    merk,
    status,
    keuze,
    regels,
    duurMs: Math.round(performance.now() - t0),
  };
}

// ── output: tabellen met vaste kolombreedtes ─────────────────────────────────

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function statusStr(status: Record<string, number>): string {
  const entries = Object.entries(status).sort((a, b) => b[1] - a[1]);
  return entries.length
    ? entries.map(([k, v]) => `${k}:${v}`).join(" ")
    : "–";
}

function printCase(r: CaseResultaat, rankLimit: number) {
  const out = console.log;
  out("");
  out(`═══ ${r.key} ─ ${r.bron} ═══`);
  if (r.historischeNoot) out(`  noot: ${r.historischeNoot}`);
  if (r.router) {
    const dekking =
      r.router.totaal > 0
        ? `${Math.round((r.router.bekendeMerken / r.router.totaal) * 100)}%`
        : "–";
    out(
      `  router : ${r.router.route}` +
        ("reden" in r.router ? ` (reden: ${r.router.reden})` : "") +
        ` — bekende merken ${r.router.bekendeMerken}/${r.router.totaal} (dekking ${dekking})`,
    );
  }
  if (r.melding) out(`  melding: ${r.melding}`);
  out("");
  // compacte regel-tabel: code · gelezen · merk→oordeel · status · rang · keuze
  const W = { code: 9, gelezen: 8, merk: 34, status: 7, rang: 6, keuze: 22 };
  out(
    "  " +
      pad("code", W.code) +
      pad("gelezen", W.gelezen) +
      pad("merk → oordeel", W.merk) +
      pad("status", W.status) +
      pad("rang", W.rang) +
      pad("keuze", W.keuze),
  );
  out("  " + "─".repeat(W.code + W.gelezen + W.merk + W.status + W.rang + W.keuze));
  for (const regel of r.regels) {
    const merkCel = regel.gelezen
      ? `${regel.merkText ?? "∅"} → ${regel.merkOordeel}`
      : "–";
    const keuzeCel =
      regel.rang == null
        ? "–"
        : `auto:${regel.autoKeuze ? "ja" : "nee"} top-1:${regel.top1 ? "ja" : "nee"}`;
    out(
      "  " +
        pad(
          regel.code +
            (regel.spook ? (regel.spookBekend ? "‡" : "*") : "") +
            (regel.codeValid === false ? "†" : ""),
          W.code,
        ) +
        pad(regel.gelezen ? "ja" : "NEE", W.gelezen) +
        pad(merkCel.slice(0, W.merk - 1), W.merk) +
        pad(regel.status ?? "–", W.status) +
        pad(regel.rang == null ? "–" : String(regel.rang), W.rang) +
        pad(keuzeCel, W.keuze),
    );
  }
  if (r.import.spookcodes.length) {
    out(`  * spookcodes (gelezen maar niet in grondwaarheid): ${r.import.spookcodes.length} — ${r.import.spookcodes.join(", ")}`);
  }
  if (r.import.spookcodesBekend.length) {
    out(
      `  ‡ (bekend, buiten scope) — staat letterlijk in de bron maar buiten de ` +
        `grondwaarheid: ${r.import.spookcodesBekend.length} — ${r.import.spookcodesBekend.join(", ")}`,
    );
  }
  if (r.regels.some((regel) => regel.codeValid === false)) {
    out(
      "  † codeValid=false: code matcht de CODE-regex niet — informatief, geen poort",
    );
  }
  out("");
  // case-samenvatting
  out(`  import : ${r.import.gelezen}/${r.import.verwacht} gelezen` +
    (r.import.gemist.length ? ` · gemist: ${r.import.gemist.join(", ")}` : "") +
    ` · spookcodes: ${r.import.spookcodes.length}` +
    (r.import.spookcodesBekend.length
      ? ` · bekend buiten scope: ${r.import.spookcodesBekend.length}`
      : ""));
  out(
    `  merk   : bestaand merk ${r.merk.bestaand}/${r.merk.gelezenTotaal} · ` +
      `verwacht merk ${r.merk.verwachtGoed}/${r.merk.verwachtBekend}-waar-bekend · ` +
      `fout ${r.merk.fout} · leeg ${r.merk.leeg}`,
  );
  out(`  match  : ${statusStr(r.status)}`);
  if (r.ocr) {
    out(
      `  ocr    : ${r.ocr.paginas.length} pagina('s) gelezen · ` +
        `kosten €${r.ocr.kostenEur.toFixed(4)} · ` +
        `truncated ${r.ocr.truncatedPaginas} pagina('s)`,
    );
    for (const pg of r.ocr.paginas) {
      const pogingen = pg.attempts
        .map(
          (a) =>
            `${a.stopReason ?? "?"} @max ${a.maxTokens} (in ${a.inputTokens}/uit ${a.outputTokens})`,
        )
        .join(" → ");
      out(
        `           ${pg.pdf} p.${pg.pagina}: ${pg.regels} regels ` +
          `(codeInvalid ${pg.codeInvalid}) · pogingen: ${pogingen} · €${pg.costEur.toFixed(4)}`,
      );
    }
  }
  if (r.leesroute) {
    out(
      `  leesroute: ${r.leesroute.batches.length} batch(es) gelezen · ` +
        `kosten €${r.leesroute.kostenEur.toFixed(4)} · ` +
        `truncated ${r.leesroute.truncatedBatches} batch(es) · ` +
        `paginaOnbekend ${r.leesroute.paginaOnbekend}`,
    );
    for (const b of r.leesroute.batches) {
      const pogingen = b.attempts
        .map(
          (a) =>
            `${a.stopReason ?? "?"} @max ${a.maxTokens} (in ${a.inputTokens}/uit ${a.outputTokens})`,
        )
        .join(" → ");
      out(
        `           p.${b.paginas[0]}–${b.paginas[1]}: ${b.regels} regels ` +
          `(codeInvalid ${b.codeInvalid}, paginaOnbekend ${b.paginaOnbekend}) · ` +
          `pogingen: ${pogingen} · €${b.costEur.toFixed(4)}`,
      );
    }
  }
  out(
    r.keuze.nvt
      ? "  keuze  : n.v.t. — geen betrouwbare code→offerte-mapping"
      : `  keuze  : auto-keuze (B3) ${r.keuze.autoGoed}/${r.keuze.gemapt} · ` +
          `top-1 (informatief) ${r.keuze.top1Goed}/${r.keuze.gemapt} · ` +
          `kandidaat in top-${rankLimit}: ${r.keuze.inTopRank}/${r.keuze.gemapt}`,
  );
  out(`  duur   : ${(r.duurMs / 1000).toFixed(1)}s`);
}

function printEindtabel(results: CaseResultaat[], rankLimit: number) {
  const out = console.log;
  out("");
  out("═══ EINDTABEL ═══");
  const W = { key: 11, imp: 8, merk: 20, status: 24, rang: 12, auto: 11, top1: 7 };
  out(
    pad("case", W.key) +
      pad("import", W.imp) +
      pad("merk best/fout/leeg", W.merk) +
      pad("statusverdeling", W.status) +
      pad(`rang≤${rankLimit}`, W.rang) +
      pad("auto-keuze", W.auto) +
      pad("top-1", W.top1),
  );
  out("─".repeat(W.key + W.imp + W.merk + W.status + W.rang + W.auto + W.top1));
  for (const r of results) {
    const keuzeCel = r.keuze.nvt
      ? ["–", "–", "–"]
      : [
          `${r.keuze.inTopRank}/${r.keuze.gemapt}`,
          `${r.keuze.autoGoed}/${r.keuze.gemapt}`,
          `${r.keuze.top1Goed}/${r.keuze.gemapt}`,
        ];
    out(
      pad(r.key, W.key) +
        pad(`${r.import.gelezen}/${r.import.verwacht}`, W.imp) +
        pad(`${r.merk.bestaand}/${r.merk.fout}/${r.merk.leeg}`, W.merk) +
        pad(statusStr(r.status), W.status) +
        pad(keuzeCel[0], W.rang) +
        pad(keuzeCel[1], W.auto) +
        pad(keuzeCel[2], W.top1),
    );
  }
}

// ── --assert-nulmeting: de nulmeting van 16 jul, exact ───────────────────────

function assertNulmeting(results: CaseResultaat[]): string[] {
  const fouten: string[] = [];
  const by = (k: string) => results.find((r) => r.key === k);
  // canonicaliseer platte objecten (sorteer keys) zodat {blauw:30,paars:1} en
  // {paars:1,blauw:30} als gelijk gelden — insertievolgorde is geen afwijking
  const canon = (v: unknown): string =>
    v != null && typeof v === "object" && !Array.isArray(v)
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ),
        )
      : JSON.stringify(v);
  const eq = (label: string, got: unknown, want: unknown) => {
    if (canon(got) !== canon(want)) {
      fouten.push(`${label}: verwacht ${canon(want)}, gekregen ${canon(got)}`);
    }
  };

  const raadhuis = by("raadhuis");
  if (!raadhuis) fouten.push("raadhuis: case ontbreekt in de resultaten");
  else {
    eq("raadhuis hadText", raadhuis.hadText, true);
    eq("raadhuis import", `${raadhuis.import.gelezen}/${raadhuis.import.verwacht}`, "31/31");
    eq("raadhuis merk-bestaand", raadhuis.merk.bestaand, 0);
    eq("raadhuis merk-fout (alle 31 gevuld en fout — zaalnamen)", raadhuis.merk.fout, 31);
    eq("raadhuis merk-leeg", raadhuis.merk.leeg, 0);
    // {blauw:30, paars:1}: Lf901 wordt paars via het NON_LIGHTING-woord "tafel"
    eq("raadhuis statusverdeling", raadhuis.status, { blauw: 30, paars: 1 });
  }

  const kvk = by("kvk");
  if (!kvk) fouten.push("kvk: case ontbreekt in de resultaten");
  else {
    eq("kvk hadText", kvk.hadText, true);
    // denominator 16 jul: 49; op 16 jul (stap 3) gecorrigeerd naar 48 — kaal L010
    // bleek een prozavoorbeeld ("bijv. L010 of L011"), geen armatuurregel.
    eq("kvk import", `${kvk.import.gelezen}/${kvk.import.verwacht}`, "0/48");
  }

  const tno = by("tno");
  if (!tno) fouten.push("tno: case ontbreekt in de resultaten");
  else {
    eq("tno hadText", tno.hadText, true);
    eq("tno import", `${tno.import.gelezen}/${tno.import.verwacht}`, "15/20");
    const verwachtGelezen = [
      "Lr001", "Lr301", "Lr302", "Lp201", "Lp202", "Lr303", "Lr304", "Lw201",
      "Lr305", "Ls001", "Ls002", "Ls003", "Lp203", "Lp602", "Lp101",
    ].sort();
    const gelezen = tno.regels
      .filter((r) => r.gelezen && !r.spook)
      .map((r) => r.code)
      .sort();
    eq("tno gelezen codes", gelezen, verwachtGelezen);
    eq(
      "tno gemiste codes",
      [...tno.import.gemist].sort(),
      ["Lr001B", "Lr001C", "Lr001_N", "Lp601a", "Lp601b"].sort(),
    );
    // "Focus" bestaat als merk → Lr305 + Ls001 rood
    eq("tno statusverdeling", tno.status, { blauw: 13, rood: 2 });
  }

  const dordrecht = by("dordrecht");
  if (!dordrecht) fouten.push("dordrecht: case ontbreekt in de resultaten");
  else {
    eq("dordrecht hadText", dordrecht.hadText, false);
    eq("dordrecht import", `${dordrecht.import.gelezen}/${dordrecht.import.verwacht}`, "0/18");
    eq(
      "dordrecht melding",
      dordrecht.melding,
      "geen tekstlaag; OCR-route overgeslagen (--ai)",
    );
  }

  return fouten;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const evalDir =
    process.env.EVAL_DIR ??
    path.join(os.homedir(), "Downloads", "lumenlogic-testset");

  if (flags.assertNulmeting && flags.ai) {
    console.error(
      "--assert-nulmeting is zonder AI gedefinieerd (het ijkpunt van 16 jul is de " +
        "tekstroute) — combineer hem niet met --ai.",
    );
    process.exit(1);
  }

  if (flags.ai) {
    process.stderr.write(
      "--ai: beeld-PDF's zonder tekstlaag gaan door de OCR/vision-route — echte " +
        "API-calls (kosten tellen mee in het maandbudget via llm_usage, purpose 'eval').\n",
    );
  }

  // pg_trgm-smoke: de fuzzy-ranking van fetchCandidates leunt op similarity().
  try {
    await db.execute(sql`select similarity('a','a')`);
  } catch (e) {
    console.error(
      "FOUT: de pg_trgm-smoke-query (select similarity('a','a')) faalde. " +
        "Zonder de pg_trgm-extensie kan evaluateSpecLine geen kandidaten ranken — " +
        "controleer `create extension pg_trgm` op deze database én de DATABASE_URL " +
        "in .env.local. Onderliggende fout: " +
        (e instanceof Error ? e.message : String(e)),
    );
    process.exit(1);
  }

  // één brands-fetch; merk-oordeel gebeurt daarna volledig in-process
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const brandKeySet = new Set(brandNames.map(brandKeyOf));

  let gitRev = "onbekend";
  try {
    gitRev = execSync("git rev-parse --short HEAD", {
      cwd: path.dirname(new URL(import.meta.url).pathname),
    })
      .toString()
      .trim();
  } catch {
    // geen git beschikbaar — meta blijft "onbekend"
  }

  const cases = flags.caseKey
    ? GRONDWAARHEID.filter((c) => c.key === flags.caseKey)
    : GRONDWAARHEID;

  // Scriptlokale kostenteller over de hele run (alle cases samen) — voedt het
  // €1-runplafond in ocrCase én de kosten-regel in de meta.
  const runKosten = { eur: 0 };
  const results: CaseResultaat[] = [];
  for (const c of cases) {
    results.push(
      await meetCase(c, evalDir, brandNames, brandKeySet, flags, runKosten),
    );
  }

  const meta = {
    datum: new Date().toISOString(),
    gitRev,
    evalDir,
    rankLimit: flags.rankLimit,
    ai: flags.ai,
    aiKostenEur: Number(runKosten.eur.toFixed(4)),
    duurPerCaseMs: Object.fromEntries(results.map((r) => [r.key, r.duurMs])),
  };

  if (flags.json) {
    console.log(JSON.stringify({ meta, results }, null, 2));
  } else {
    console.log(
      `eval-testset · ${meta.datum} · rev ${meta.gitRev} · EVAL_DIR=${meta.evalDir} · rank-limit=${meta.rankLimit}`,
    );
    for (const r of results) printCase(r, flags.rankLimit);
    printEindtabel(results, flags.rankLimit);
    console.log(
      "\nduur per case: " +
        results.map((r) => `${r.key} ${(r.duurMs / 1000).toFixed(1)}s`).join(" · "),
    );
    if (flags.ai) {
      console.log(`AI-kosten deze run: €${runKosten.eur.toFixed(4)}`);
    }
  }

  if (flags.assertNulmeting) {
    if (flags.caseKey) {
      console.error(
        "--assert-nulmeting toetst alle vier de cases; combineer hem niet met --case.",
      );
      process.exit(1);
    }
    const fouten = assertNulmeting(results);
    if (fouten.length) {
      console.error("\nNULMETING WIJKT AF — het instrument (of de keten) is veranderd:");
      for (const f of fouten) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.error("\n✓ nulmeting exact gereproduceerd (16 jul-ijkpunt)");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
