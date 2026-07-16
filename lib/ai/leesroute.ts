// AI-tekstleesroute (goal-import-ai-leesroute, stap 3, fase A): leest de RUWE
// TEKSTLAAG van één of meer pagina's van een armaturenboek (unpdf-tekst, kolomlayout
// kwijt) en levert de regels die er létterlijk staan (armatuurcode · merk · type ·
// ruwe tekst · pagina). Zelfde laagafspraak als lib/ai/ocr.ts: deze module doet
// uitsluitend LEZEN + kosten-/budgetbeheer — geen repo-writes van spec-regels
// (dat is fase B), geen matching, geen beslissingen.
//
// BELANGRIJK: dit bestand importeert lib/matching/engine.ts NIET en mag dat nooit
// gaan doen (masterplan-besluit 8: de matcher-engine blijft LLM-vrij). De leesroute
// levert alleen gelezen tekst; de deterministische pipeline doet de rest.
//
// IJzeren regels die hier afgedwongen worden:
//   • Regel 2: geen prijzen — het model krijgt geen catalogus-context en geen tools
//     behalve het verplichte lever_regels-afleverkanaal; de (gedeelde) promptkern
//     verbiedt prijzen.
//   • Regel 5: elke gelezen batch (leesroute_batch_done), elke afgekapte poging
//     (leesroute_batch_truncated) en elke fout (leesroute_batch_failed) wordt gelogd
//     in events. Skip-events (geen key / budget) logt de AANROEPER — precies zoals
//     bij de OCR-route (lib/ai/ocr.ts): de aanroeper weet of het een run-start of
//     een losse batch is; deze module geeft daarvoor heldere {skipped: …}-vormen
//     terug.
//
// Budget: gedeeld €1-plafond per boek met de OCR-route. checkOcrBudget (geïmporteerd
// uit ocr.ts) sommeert llm_usage per importRunId ONGEACHT purpose — 'ocr' en
// 'leesroute' tellen dus samen tegen hetzelfde OCR_MAX_EUR_PER_RUN. Reserverings-
// patroon identiek aan ocr.ts (update-in-place, één rij per call-eenheid; faalt de
// call, dan blijft de reservering staan als conservatieve kostenpost).
import { eq } from "drizzle-orm";
import { llmUsage } from "@/db/schema";
import { envApiKey, EUR_PER_MTOK_IN, EUR_PER_MTOK_OUT } from "@/lib/ai/shared";
import {
  checkOcrBudget,
  createAnthropicOcrClient,
  LEVER_REGELS_TOOL,
  leverRegelsMetRetry,
  MAX_TOKENS_PER_PAGE,
  MAX_TOKENS_RETRY,
  OCR_RESERVE_EUR,
  SYSTEM_PROMPT_KERN,
  type OcrAttempt,
  type OcrClient,
  type OcrMessageParams,
  type OcrRegel,
  type OcrToolDef,
} from "@/lib/ai/ocr";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";

export const LEESROUTE_ACTOR = "ai:leesroute";
// Batchgrootte voor de aanroeper (fase B): 8 pagina's tekst per call houdt de
// input klein genoeg voor het batchbudget en de kosten per call overzichtelijk.
export const LEESROUTE_BATCH_PAGES = 8;
// Outputbudget voor een batch van 8 tekstpagina's (2× het paginabudget van de
// vision-route is te krap voor 8 dichte pagina's; 8000 is ruim voor de praktijk).
export const MAX_TOKENS_PER_BATCH = 8000;
// Retry-plafond bij afkapping: 2× het batchbudget, zelfde verhouding als de
// vision-route (4000 → 8000).
export const MAX_TOKENS_BATCH_RETRY = 16000;
// Geschatte kost per BATCH (1–2 calls) die vóór de eerste call gereserveerd wordt.
// Worst case: call 1 vol afgekapt op 8000 output ≈ €0,04 + retry vol op 16000
// output ≈ €0,08 + 2× tekstinput van 8 pagina's (~10k tokens) ≈ €0,02 ≈ €0,14 —
// reserveren mag te hoog zijn, nooit te laag, dus €0,16.
export const LEESROUTE_RESERVE_EUR = 0.16;
// Routerdrempel: onder 60% bekende merken vertrouwen we de deterministische
// parser niet en gaat het boek door de AI-leesroute (besluit Timo 16 jul).
export const MERKDEKKING_DREMPEL = 0.6;

// ── Tool: lever_regels-variant voor tekst, mét verplicht paginaveld ──────────
// Structureel afgeleid van LEVER_REGELS_TOOL (het koppelcontract in ocr.ts) via
// spreads — het OCR-schema zelf blijft byte-identiek, alleen deze kopie krijgt
// het verplichte pagina-veld. Een batch bevat meerdere pagina's ('=== PAGE N ==='
// -markers), dus het model MOET per regel zeggen op welke pagina hij staat.
const ocrRegelsSchema = (
  LEVER_REGELS_TOOL.input_schema as {
    properties: {
      regels: {
        items: {
          properties: Record<string, unknown>;
          required: string[];
        } & Record<string, unknown>;
      } & Record<string, unknown>;
    };
  }
).properties.regels;

export const LEVER_REGELS_TOOL_TEKST: OcrToolDef = {
  ...LEVER_REGELS_TOOL,
  input_schema: {
    ...LEVER_REGELS_TOOL.input_schema,
    properties: {
      regels: {
        ...ocrRegelsSchema,
        items: {
          ...ocrRegelsSchema.items,
          properties: {
            ...ocrRegelsSchema.items.properties,
            pagina: {
              type: "integer",
              description:
                "the page number from the '=== PAGE N ===' marker above the row",
            },
          },
          required: [...ocrRegelsSchema.items.required, "pagina"],
        },
      },
    },
  },
};

// ── Prompt: eigen tekstlaag-intro + gedeelde kern + extra tekstlaag-regels ───
// De kern (het Rules-blok) is exact die van de vision-route; de extra regels
// adresseren de gemeten oorzaken O1/O2 (merkkolom vs. ruimtenaam, gelijmde codes,
// suffix-varianten, losse plattegrond-codes) en het paginaveld.
export const LEESROUTE_SYSTEM_PROMPT =
  "You read the raw text layer of one or more pages from a luminaire schedule " +
  "('armaturenboek'). The text comes from PDF extraction: the column layout is " +
  "lost, line breaks are unreliable and adjacent fields may run into each other. " +
  "Extract the luminaire rows and deliver them with the lever_regels tool.\n" +
  SYSTEM_PROMPT_KERN +
  "\n- The brand is the manufacturer column — never a room, space or function " +
  "name such as Raadzaal, Toilet, Woonkamer, Vergaderruimte.\n" +
  "- If the manufacturer field is a placeholder such as '-', 'n.t.b.' or " +
  "'te bepalen', or if no manufacturer is printed for the row, merk is null. " +
  "Never take a word from the type text, a proposal ('voorstel: …') or the " +
  "surrounding prose as the brand.\n" +
  "- Text extraction may glue a fixture code to the next word. Whenever a token " +
  "starts with a code from the same family as the other codes on the page but " +
  "carries extra trailing letters (e.g. 'L017of' = code L017 + the Dutch word " +
  "'of'; 'L008bof' = code L008b + 'of'), split it: deliver the bare fixture " +
  "code as its own row and keep the glued fragment untouched in ruwe_tekst. " +
  "Never skip a code because it is glued.\n" +
  "- The same fixture code may appear more than once in the page text " +
  "(floor-plan labels, legends). Deliver each code once per page, with the most " +
  "informative surrounding text as ruwe_tekst.\n" +
  "- Suffix variants such as Lr001B, Lr001_N or L010a are separate rows — never " +
  "fold a variant into its base code.\n" +
  "- On concept or floor-plan pages a code may appear on its own, without a " +
  "brand or type stream. That is still a row: deliver the code with merk null " +
  "and the nearest descriptive light text as type, or null if there is none.\n" +
  "- Pages are separated by '=== PAGE N ===' markers; report for every row the " +
  "page number it appears on.";

// ── Router: deterministisch snelpad of AI-leesroute? ─────────────────────────
// Puur, geen DB. 'Bekend' = de deterministische parser heeft een merkclaim
// (brandText non-null; ná stap 1 is dat altijd een tegen `brands` getoetst merk).
// 0 regels → leesroute (de parser las niets); dekking < 60% → leesroute; ≥60%
// (inclusief) → het deterministische resultaat telt. Nooit delen door 0.
export function beslisRoute(
  lines: Array<{ brandText?: string | null }>,
):
  | { route: "deterministisch"; bekendeMerken: number; totaal: number }
  | {
      route: "leesroute";
      reden: "geen_regels" | "merkdekking";
      bekendeMerken: number;
      totaal: number;
    } {
  const totaal = lines.length;
  if (totaal === 0) {
    return { route: "leesroute", reden: "geen_regels", bekendeMerken: 0, totaal: 0 };
  }
  const bekendeMerken = lines.filter((l) => l.brandText != null).length;
  if (bekendeMerken / totaal < MERKDEKKING_DREMPEL) {
    return { route: "leesroute", reden: "merkdekking", bekendeMerken, totaal };
  }
  return { route: "deterministisch", bekendeMerken, totaal };
}

// ── De tekst-call zelf (puur: geen database) ─────────────────────────────────
export type LeesroutePagina = { pageNumber: number; text: string };

type LeesResultaat = {
  regels: (OcrRegel & { pagina: number })[];
  // Regels waarvoor het model géén geldige batchpagina rapporteerde en die op de
  // eerste pagina van de batch zijn gezet — telbaar signaal, geen blokkade.
  paginaOnbekend: number;
  usage: { inputTokens: number; outputTokens: number };
  attempts: OcrAttempt[];
  truncated: number;
};

// Interne variant met instelbare budgetten: de batch draait op de batchbudgetten,
// de per-pagina-escalatie op de paginabudgetten van de vision-route (4000/8000).
async function leesPaginasTekst(opts: {
  client: OcrClient;
  pages: LeesroutePagina[];
  maxTokensEerste: number;
  maxTokensRetry: number;
}): Promise<LeesResultaat> {
  // Eén user-message met per pagina een '=== PAGE N ==='-marker boven de tekst;
  // het toolschema en de prompt verwijzen naar precies deze markers.
  const tekst = opts.pages
    .map((p) => `=== PAGE ${p.pageNumber} ===\n${p.text}`)
    .join("\n\n");
  const messages: OcrMessageParams["messages"] = [
    { role: "user", content: [{ type: "text", text: tekst }] },
  ];
  const res = await leverRegelsMetRetry({
    client: opts.client,
    system: LEESROUTE_SYSTEM_PROMPT,
    tools: [LEVER_REGELS_TOOL_TEKST],
    messages,
    maxTokensEerste: opts.maxTokensEerste,
    maxTokensRetry: opts.maxTokensRetry,
  });

  // Paginafallback: alleen paginanummers die écht in deze batch zitten zijn
  // geldig; alles anders (ontbrekend, 0, 99, …) valt terug op de eerste
  // batchpagina en wordt geteld in paginaOnbekend.
  const geldigePaginas = new Set(opts.pages.map((p) => p.pageNumber));
  const fallback = opts.pages[0].pageNumber;
  let paginaOnbekend = 0;
  const regels = res.regels.map((r): OcrRegel & { pagina: number } => {
    if (r.pagina != null && geldigePaginas.has(r.pagina)) {
      return { ...r, pagina: r.pagina };
    }
    paginaOnbekend++;
    return { ...r, pagina: fallback };
  });
  return {
    regels,
    paginaOnbekend,
    usage: res.usage,
    attempts: res.attempts,
    truncated: res.truncated,
  };
}

// Publieke pure laag (contract stap 3): batchbudgetten, geen DB.
export async function readPagesTextWithModel(opts: {
  client: OcrClient;
  pages: LeesroutePagina[];
}): Promise<LeesResultaat> {
  return leesPaginasTekst({
    client: opts.client,
    pages: opts.pages,
    maxTokensEerste: MAX_TOKENS_PER_BATCH,
    maxTokensRetry: MAX_TOKENS_BATCH_RETRY,
  });
}

// ── Orkestratie per batch ────────────────────────────────────────────────────
export type LeesrouteBatchResult =
  // Skip: de aanroeper (fase B) logt het bijbehorende skip-event, zoals bij OCR.
  | { skipped: "no_key" | "budget_run" | "budget_month" }
  // Fout: hier al gelogd als leesroute_batch_failed; de reservering blijft staan
  // (conservatief, zie kop-commentaar).
  | { failed: string }
  | {
      regels: (OcrRegel & { pagina: number })[];
      paginaOnbekend: number;
      // Somtotalen over álle calls van deze batch (incl. eventuele escalatie).
      inputTokens: number;
      outputTokens: number;
      costEur: number;
      truncated: number;
    };

export function isLeesrouteBatchSuccess(
  r: LeesrouteBatchResult,
): r is Extract<LeesrouteBatchResult, { regels: (OcrRegel & { pagina: number })[] }> {
  return "regels" in r;
}

// Eén call-eenheid (een batch óf één geëscaleerde pagina): budgetcheck →
// reservering (llm_usage, purpose 'leesroute', mét importRunId) → tekst-call →
// rij bijwerken naar echte somkosten → events. Spiegelt ocrPage één-op-één.
type EenheidResult =
  | { skipped: "budget_run" | "budget_month" }
  | { failed: string }
  | {
      regels: (OcrRegel & { pagina: number })[];
      paginaOnbekend: number;
      inputTokens: number;
      outputTokens: number;
      costEur: number;
      truncated: number;
      // True als de LAATSTE poging afgekapt was — de trigger voor escalatie.
      laatsteAfgekapt: boolean;
    };

async function leesrouteEenheid(
  db: AppDb,
  opts: {
    importRunId: string;
    pages: LeesroutePagina[];
    client: OcrClient;
    actor: string;
    maxTokensEerste: number;
    maxTokensRetry: number;
    reserveEur: number;
  },
): Promise<EenheidResult> {
  const budget = await checkOcrBudget(db, opts.importRunId);
  if (!budget.ok) return { skipped: budget.reason };

  // Reservering VÓÓR de call (zelfde B4-patroon als ocrPage): de SUM-check van
  // een parallelle call telt deze in-flight eenheid zo altijd mee.
  const [reservation] = await db
    .insert(llmUsage)
    .values({
      purpose: "leesroute",
      costEur: opts.reserveEur.toFixed(4),
      importRunId: opts.importRunId,
    })
    .returning();

  // Eventpayload-bereik: [eerste..laatste] pagina van deze eenheid.
  const paginas = [
    opts.pages[0].pageNumber,
    opts.pages[opts.pages.length - 1].pageNumber,
  ];

  try {
    const { regels, paginaOnbekend, usage, attempts, truncated } =
      await leesPaginasTekst({
        client: opts.client,
        pages: opts.pages,
        maxTokensEerste: opts.maxTokensEerste,
        maxTokensRetry: opts.maxTokensRetry,
      });
    // usage is de SOM over alle pogingen, dus de kosten volgen daar vanzelf uit.
    const costEur =
      (usage.inputTokens * EUR_PER_MTOK_IN +
        usage.outputTokens * EUR_PER_MTOK_OUT) /
      1_000_000;
    await db
      .update(llmUsage)
      .set({ costEur: costEur.toFixed(4) })
      .where(eq(llmUsage.id, reservation.id));

    // Regel 5: elke afgekapte poging in het event-log (tripwire zichtbaar).
    // final: true alleen op een afgekapte LAATSTE poging.
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      if (a.stopReason !== "max_tokens") continue;
      await logEvent(db, {
        entity: "import_run",
        entityId: opts.importRunId,
        action: "leesroute_batch_truncated",
        actor: opts.actor,
        payload: {
          paginas,
          attempt: i + 1,
          maxTokens: a.maxTokens,
          outputTokens: a.outputTokens,
          final: i === attempts.length - 1,
        },
      });
    }

    // Regel 5: elke afgeronde call-eenheid in het event-log — één done-event per
    // llm_usage-rij, met dezelfde kosten. Een dubbel afgekapte batch krijgt dus
    // óók een done-event (truncated: 2, regels vrijwel zeker 0); de escalatie
    // logt daarna per pagina haar eigen events.
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.importRunId,
      action: "leesroute_batch_done",
      actor: opts.actor,
      payload: {
        paginas,
        regels: regels.length,
        codeInvalid: regels.filter((r) => !r.codeValid).length,
        paginaOnbekend,
        tokens: { input: usage.inputTokens, output: usage.outputTokens },
        costEur: Number(costEur.toFixed(4)),
        truncated,
        attempts: attempts.length,
      },
    });
    return {
      regels,
      paginaOnbekend,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costEur,
      truncated,
      laatsteAfgekapt:
        attempts[attempts.length - 1]?.stopReason === "max_tokens",
    };
  } catch (err) {
    // Reservering blijft bewust staan (conservatieve kostenpost). Fout = event
    // (regel 5); de aanroeper kan met de volgende batch verder.
    const melding = err instanceof Error ? err.message : String(err);
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.importRunId,
      action: "leesroute_batch_failed",
      actor: opts.actor,
      payload: { paginas, melding },
    });
    return { failed: melding };
  }
}

// Eén batch tekstpagina's: envApiKey → budgetcheck → reservering → tekst-call →
// echte kosten → events. Truncatie-escalatie: is óók de retry afgekapt én bevat
// de batch meer dan één pagina, dan wordt de batch alsnog per pagina verwerkt
// (single-page calls op de vision-paginabudgetten 4000/8000, elk met eigen
// budgetcheck + eigen reservering + eigen events) en geaggregeerd. De regels van
// de afgekapte batchcall zelf tellen dan niet mee (vrijwel zeker leeg, en de
// escalatie herleest alle pagina's — meenemen zou dubbelen riskeren); de kosten,
// tokens en truncated-teller ervan wél.
export async function leesrouteBatch(
  db: AppDb,
  opts: {
    importRunId: string;
    pages: LeesroutePagina[];
    client?: OcrClient;
    actor?: string;
  },
): Promise<LeesrouteBatchResult> {
  // Zonder key geen leesroute: nette skip-vorm, nooit een fout. Het skip-event
  // logt de aanroeper (zie kop-commentaar).
  const apiKey = envApiKey();
  const client =
    opts.client ?? (apiKey ? createAnthropicOcrClient(apiKey) : null);
  if (!client) return { skipped: "no_key" };
  // Defensief: lege batch = niets te lezen, geen call, geen reservering.
  if (opts.pages.length === 0) {
    return {
      regels: [],
      paginaOnbekend: 0,
      inputTokens: 0,
      outputTokens: 0,
      costEur: 0,
      truncated: 0,
    };
  }
  const actor = opts.actor ?? LEESROUTE_ACTOR;

  const batch = await leesrouteEenheid(db, {
    importRunId: opts.importRunId,
    pages: opts.pages,
    client,
    actor,
    maxTokensEerste: MAX_TOKENS_PER_BATCH,
    maxTokensRetry: MAX_TOKENS_BATCH_RETRY,
    reserveEur: LEESROUTE_RESERVE_EUR,
  });
  if ("skipped" in batch || "failed" in batch) return batch;

  if (!(batch.laatsteAfgekapt && opts.pages.length > 1)) {
    // Normale afloop (ook: één pagina die dubbel afkapt — daar valt niets meer
    // te splitsen; succes met de beste poging en truncated in de events).
    const { laatsteAfgekapt: _laatsteAfgekapt, ...resultaat } = batch;
    return resultaat;
  }

  // Escalatie: per pagina opnieuw, op de kleinere paginabudgetten. De reservering
  // per pagina volgt de vision-rekensom (OCR_RESERVE_EUR dekt 4000+8000 output).
  const totaal = {
    regels: [] as (OcrRegel & { pagina: number })[],
    paginaOnbekend: 0,
    inputTokens: batch.inputTokens,
    outputTokens: batch.outputTokens,
    costEur: batch.costEur,
    truncated: batch.truncated,
  };
  for (const page of opts.pages) {
    const r = await leesrouteEenheid(db, {
      importRunId: opts.importRunId,
      pages: [page],
      client,
      actor,
      maxTokensEerste: MAX_TOKENS_PER_PAGE,
      maxTokensRetry: MAX_TOKENS_RETRY,
      reserveEur: OCR_RESERVE_EUR,
    });
    // Budget op halverwege de escalatie: stoppen — elke volgende check faalt ook.
    // De al gelezen pagina's blijven in het aggregaat; wat ontbreekt is zichtbaar
    // doordat er voor die pagina's geen done-event is.
    if ("skipped" in r) break;
    // Fout op één pagina: al gelogd (leesroute_batch_failed); door met de rest.
    if ("failed" in r) continue;
    totaal.regels.push(...r.regels);
    totaal.paginaOnbekend += r.paginaOnbekend;
    totaal.inputTokens += r.inputTokens;
    totaal.outputTokens += r.outputTokens;
    totaal.costEur += r.costEur;
    totaal.truncated += r.truncated;
  }
  return totaal;
}
