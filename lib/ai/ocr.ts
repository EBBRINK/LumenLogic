// OCR-vision-laag voor beeld-PDF's (plan-ocr-beeld-pdf B3/B4, bouwstap 3): leest één
// gerasteriseerd paginabeeld van een armaturenboek en levert de regels die er létterlijk
// op staan (armatuurcode · merk · type · ruwe tekst). Deze module doet uitsluitend
// LEZEN + kosten-/budgetbeheer — geen repo-writes van spec-regels (dat is bouwstap 4),
// geen matching, geen beslissingen.
//
// BELANGRIJK: dit bestand importeert lib/matching/engine.ts NIET en mag dat nooit gaan
// doen. De matcher-engine blijft LLM-vrij (masterplan-besluit 8); de OCR-laag levert
// alleen gelezen tekst, de deterministische pipeline doet de rest.
//
// Ijzeren regels die hier afgedwongen worden:
//   • Regel 2: geen prijzen — het model krijgt geen catalogus-context en geen tools
//     behalve het verplichte lever_regels-afleverkanaal; de prompt verbiedt prijzen.
//   • Regel 5: elke gelezen pagina (ocr_page_done), elke afgekapte poging
//     (ocr_page_truncated), elke stilzwijgend opgevangen timeout op de eerste
//     poging (ocr_page_timeout, 17 jul) en elke fout (ocr_page_failed) wordt
//     gelogd in events. Skip-events (geen key / budget) logt de AANROEPER
//     (bouwstap 4) — daarvoor geeft deze module heldere {skipped: …}-vormen terug.
//
// Plafond (B4, hard): OCR_MAX_EUR_PER_RUN per boek, bovenop het maandbudget (L-06).
// Reserveringspatroon — gekozen: UPDATE-IN-PLACE. Vóór de eerste API-call schrijven
// we een llm_usage-rij met een geschatte kost (OCR_RESERVE_EUR); ná de call(s) werken
// we diezelfde rij bij naar de echte tokenkosten. Eén rij per PAGINA — een pagina is
// 1–2 calls (de O3-retry bij afkapping, zie readPageWithVision) en de rij krijgt de
// SOM van die calls. Zo telt de SUM-check een in-flight pagina mee zodra de
// reservering geschreven is, en blijft er precies één rij per pagina over —
// verwijderen+opnieuw inserten zou een venster openen waarin de pagina
// onzichtbaar is. Nuance gelijktijdigheid (reviewer bouwstap 3): check+insert is
// hier NIET atomisch — twee écht gelijktijdige checks kunnen elkaars reservering
// missen. Dat het plafond tóch hard is komt van de laag erboven: de beeldrij-lock
// (unique(run,page) in lib/repo/ocr.ts, éérst inserten) laat elke pagina hooguit
// één keer tot deze functie door, en de client-loop stuurt strikt sequentieel.
// De reservering is dus verdediging-in-de-diepte, niet de primaire grendel.
// Faalt de call, dan
// blíjft de reservering staan als conservatieve kostenpost (een timeout kan aan de
// API-kant tóch gekost hebben; te hoog tellen is veilig, te laag niet). Effectief
// plafond: €1 + hooguit één paginaprijs incl. eventuele retry, want de check
// gebeurt vóór de reservering en per pagina zijn er maximaal twee calls.
import type AnthropicSdk from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { llmUsage } from "@/db/schema";
import {
  CALL_TIMEOUT_MS,
  envApiKey,
  EUR_PER_MTOK_IN,
  EUR_PER_MTOK_OUT,
  MAX_RETRIES,
  SMALL_MODEL,
} from "@/lib/ai/shared";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";
import { getLlmSpend, getSetting } from "@/lib/repo/settings";
import { CODE } from "@/lib/pdf/armaturenboek";

export const OCR_MODEL = SMALL_MODEL;
export const OCR_ACTOR = "ai:ocr";
// B4: hard plafond per boek (importrun). Gedocumenteerd effectief plafond:
// OCR_MAX_EUR_PER_RUN + hooguit één paginaprijs (de check loopt vóór de reservering).
export const OCR_MAX_EUR_PER_RUN = 1.0;
// Geschatte kost per PAGINA (1–2 calls) die vóór de eerste call gereserveerd wordt.
// Worst case: call 1 vol afgekapt op 4000 output ≈ €0,02 + retry vol op 8000 output
// ≈ €0,04 + 2× beeldinput ≈ €0,003 ≈ €0,065 — reserveren mag te hoog zijn, nooit
// te laag, dus €0,08.
export const OCR_RESERVE_EUR = 0.08;
// O3-tripwire (goal-import-ai-leesroute, stap 2): een dichte A3-pagina kan ver boven
// de oude 1500 tokens uitkomen (Dordrecht 16 jul: stil afgekapt → 0/18 regels).
// 4000 is het ruime paginabudget voor de eerste call.
export const MAX_TOKENS_PER_PAGE = 4000;
// Retry-plafond: 2× het paginabudget; meer dan 8000 output voor één pagina is
// pathologisch, en het plafond begrenst de retry-kosten op ~€0,04.
export const MAX_TOKENS_RETRY = 8000;
const TOOL_NAME = "lever_regels";

// ── Injecteerbare client ─────────────────────────────────────────────────────
// Minimale doorsnede van de Messages-API voor precies deze call-vorm: één user-beurt
// met een image-blok en een geforceerde tool-keuze. Tests injecteren een mock; de
// runtime gebruikt de echte SDK. Geen key → de aanroep slaat netjes over.
export type OcrToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};
export type OcrContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type OcrUserContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };
export type OcrMessageParams = {
  model: string;
  max_tokens: number;
  system: string;
  tools: OcrToolDef[];
  tool_choice: { type: "tool"; name: string };
  messages: Array<{ role: "user"; content: OcrUserContent[] }>;
};
export type OcrResponse = {
  content: OcrContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
};
export interface OcrClient {
  createMessage(params: OcrMessageParams): Promise<OcrResponse>;
}

// Echte client op basis van de SDK. Dynamische import: de SDK wordt pas geladen als er
// daadwerkelijk een key is (en dus nooit in de browser-tests, die mocken de client).
export function createAnthropicOcrClient(apiKey: string): OcrClient {
  let sdkClient: AnthropicSdk | null = null;
  return {
    async createMessage(params) {
      if (!sdkClient) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        sdkClient = new Anthropic({
          apiKey,
          timeout: CALL_TIMEOUT_MS,
          maxRetries: MAX_RETRIES,
        });
      }
      const res = await sdkClient.messages.create({
        model: params.model,
        max_tokens: params.max_tokens,
        system: params.system,
        tools: params.tools as AnthropicSdk.Tool[],
        tool_choice: params.tool_choice,
        messages: params.messages as AnthropicSdk.MessageParam[],
      });
      return {
        content: res.content.flatMap((b): OcrContentBlock[] => {
          if (b.type === "text") return [{ type: "text", text: b.text }];
          if (b.type === "tool_use") {
            return [
              {
                type: "tool_use",
                id: b.id,
                name: b.name,
                input: (b.input ?? {}) as Record<string, unknown>,
              },
            ];
          }
          return [];
        }),
        stop_reason: res.stop_reason,
        usage: {
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
        },
      };
    },
  };
}

// ── Tool & prompt ────────────────────────────────────────────────────────────
// Eén verplichte tool: het afleverkanaal voor de gelezen regels. Geen zoek- of
// catalogus-tools — het model leest, meer niet (B3). Geëxporteerd als
// koppelcontract: de tekst-leesroute (lib/ai/leesroute.ts) leidt haar eigen
// toolvariant hiervan af (goal-import-ai-leesroute, stap 3) — één tool-definitie
// voor beeld én tekst.
export const LEVER_REGELS_TOOL: OcrToolDef = {
  name: TOOL_NAME,
  description:
    "Deliver ALL luminaire rows that are literally printed on this page, " +
    "every single one. An empty list is only correct when the page contains " +
    "no luminaire rows at all.",
  input_schema: {
    type: "object",
    properties: {
      regels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            armatuurcode: {
              type: "string",
              description:
                "The fixture code exactly as printed, e.g. Lp301 or Ls004-a",
            },
            merk: {
              type: ["string", "null"],
              description: "Brand name as printed, or null if not readable",
            },
            type: {
              type: ["string", "null"],
              description:
                "Product type/description as printed, or null if not readable",
            },
            ruwe_tekst: {
              type: "string",
              description: "The full row text exactly as printed on the page",
            },
            // Het LEVERANCIERSARTIKELNUMMER — een ander begrip dan armatuurcode.
            // Een armaturenboek kent alleen positiecodes (Lp301); een offerte-
            // aanvraag heeft een kolom 'Artikelnummer' met het nummer van de
            // fabrikant ("21012 0298"). Gemeten: die nummers dragen spaties, en
            // het eerste-token-gedrag maakte er "21012" van — of pakte een getal
            // uit de omschrijving. Zie docs/probleem-artikelnummer-matching.md.
            artikelnummer: {
              type: ["string", "null"],
              description:
                "The supplier/manufacturer article number for this row, " +
                "complete and exactly as printed INCLUDING any spaces " +
                "(e.g. '21012 0298', '32812 9220 BRBB'). Only from an article " +
                "number column or label — never a number taken from the " +
                "description text. Null if the row has none.",
            },
            // O6 (stap 6): aantallen bestaan wél — Dordrecht heeft ze met pen in
            // de kantlijn. Alleen wat er letterlijk staat; ontbreekt het → null
            // (A-07 stukprijs-modus blijft de fallback, niet meer de aanname).
            aantal: {
              type: ["number", "null"],
              description:
                "The quantity for this row, only if a number is literally " +
                "printed or handwritten next to the row (e.g. a count in the " +
                "margin); otherwise null. Never guess or default to 1.",
            },
          },
          required: ["armatuurcode", "ruwe_tekst"],
        },
      },
    },
    required: ["regels"],
  },
};

// Prompt: alleen lezen wat er staat. Geen prijzen (regel 2), geen catalogus-context,
// geen beslissingen — dat is allemaal werk van de deterministische pipeline en de mens.
// De KERN (het Rules-blok) wordt gedeeld met de tekst-leesroute (lib/ai/leesroute.ts);
// alleen de intro-zin verschilt per medium (paginabeeld vs. tekstlaag). De compositie
// intro + kern is byte-identiek aan de oorspronkelijke ene literal — een snapshot-test
// in lib/ai/leesroute.test.ts legt de oude string vast en bewaakt dat.
export const SYSTEM_PROMPT_KERN =
  "Rules:\n" +
  "- Report ONLY what is literally printed on the page. Never invent, guess, " +
  "complete or normalise codes, brands or types.\n" +
  "- A row typically starts with a fixture code such as Lp301, Ls004 or Lw201-a, " +
  "followed by a brand and a product type.\n" +
  "- Some documents are not luminaire schedules but order requests: a table per " +
  "brand with the columns description, article number ('Artikelnummer') and " +
  "quantity, and no fixture codes at all. There the article number sits between " +
  "the description and the quantity, and it belongs to the manufacturer.\n" +
  "- Such an article number is ONE field even when it contains spaces, and it may " +
  "begin with letters, with digits, or with a single letter: shapes like " +
  "'12345 6789', 'AB 1234', 'ABCDE 1234', 'X 12YZ' and 'PQ 45 RS' are all one " +
  "article number. Deliver the WHOLE field in artikelnummer: never split it at a " +
  "space, never deliver only its first or only its last part, never leave part of " +
  "it behind in the description, and never take a number out of the description " +
  "text. When such a row has no fixture code, use that same complete article " +
  "number as armatuurcode.\n" +
  "- Put the complete literal row text in ruwe_tekst.\n" +
  "- Only if the page truly contains no luminaire rows at all (a cover, a photo " +
  "page, a floor plan, a completely blank page), deliver an empty list.\n" +
  "- If the page shows even one luminaire row, deliver every single row on the " +
  "page. Never deliver an empty or shortened list because the page is long, " +
  "dense or hard to read.\n" +
  "- Report a quantity (aantal) only when a number is literally printed or " +
  "handwritten next to the row — a count in the margin counts, a wattage or " +
  "dimension does not. No quantity printed for the row → aantal is null; " +
  "never guess and never default to 1.\n" +
  "- Prices do not exist for you; never read, mention or estimate them.\n" +
  "- You make no decisions and no judgements — you only transcribe.";

// De vision-intro blijft hier lokaal in de compositie; de leesroute plakt haar
// eigen intro (en extra tekstlaag-regels) om dezelfde kern heen.
export const SYSTEM_PROMPT =
  "You read one page image from a luminaire schedule ('armaturenboek'). " +
  "Extract the luminaire rows and deliver them with the lever_regels tool.\n" +
  SYSTEM_PROMPT_KERN;

// ── Resultaatvormen ──────────────────────────────────────────────────────────
export type OcrRegel = {
  armatuurcode: string;
  merk: string | null;
  type: string | null;
  ruweTekst: string;
  // Toetsing aan dezelfde CODE-regex als de tekstlaag-parser. Niet-matchende codes
  // gaan wél mee (het stond er, dus we geven het door) maar gemarkeerd — bouwstap 4
  // beslist wat ermee gebeurt. sourceConfidence blijft daar constant 'middel' (B3).
  codeValid: boolean;
  // Paginanummer zoals het model het rapporteert (leesroute: verplicht veld in het
  // toolschema, uit de '=== PAGE N ==='-markers). De vision-route levert per pagina
  // en heeft dit veld niet — dan blijft het weggelaten. parseLeverRegels neemt het
  // alleen mee als het een positieve integer is.
  pagina?: number | null;
  // O6 (stap 6): het aantal zoals het létterlijk bij de regel staat (gedrukt of
  // met pen in de kantlijn — Dordrecht). Alleen positieve integers; alles anders
  // → null/afwezig. Geen aantal gelezen → stukprijs-modus (A-07 als fallback).
  // Optioneel zodat bestaande OcrRegel-constructies (tests) geldig blijven;
  // parseLeverRegels zet het veld altijd.
  aantal?: number | null;
  // Het leveranciersartikelnummer, compleet en met spaties ("21012 0298"). Een
  // ander begrip dan armatuurcode: dát is de positiecode uit een armaturenboek.
  // Optioneel om dezelfde reden als `aantal`; parseLeverRegels zet hem altijd.
  artikelnummer?: string | null;
};

// Defensieve parser over de tool-output: ongeldige of ontbrekende structuur levert
// gewoon nul regels op, nooit een crash. Regels zonder leesbare armatuurcode vallen
// weg (zonder code valt er niets te reviewen of te matchen).
export function parseLeverRegels(content: OcrContentBlock[]): OcrRegel[] {
  const toolUse = content.find(
    (b): b is Extract<OcrContentBlock, { type: "tool_use" }> =>
      b.type === "tool_use" && b.name === TOOL_NAME,
  );
  if (!toolUse) return [];
  const regels = (toolUse.input as { regels?: unknown }).regels;
  if (!Array.isArray(regels)) return [];
  const out: OcrRegel[] = [];
  for (const r of regels) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as Record<string, unknown>;
    const code =
      typeof row.armatuurcode === "string" ? row.armatuurcode.trim() : "";
    if (!code) continue;
    const merk =
      typeof row.merk === "string" && row.merk.trim().length > 0
        ? row.merk.trim()
        : null;
    const type =
      typeof row.type === "string" && row.type.trim().length > 0
        ? row.type.trim()
        : null;
    const ruweTekst =
      typeof row.ruwe_tekst === "string" ? row.ruwe_tekst.trim() : "";
    // Pagina alleen meenemen als het een positieve integer is; anders wéglaten
    // (niet null zetten) zodat vision-regels exact hun oude vorm houden.
    const pagina =
      typeof row.pagina === "number" &&
      Number.isInteger(row.pagina) &&
      row.pagina > 0
        ? row.pagina
        : null;
    // Aantal: alleen een positieve integer telt — een 1.5 of 0 is nooit een
    // geloofwaardig handgeschreven/gedrukt stuksaantal en wordt null.
    const aantal =
      typeof row.aantal === "number" &&
      Number.isInteger(row.aantal) &&
      row.aantal > 0
        ? row.aantal
        : null;
    // Artikelnummer: letterlijk overnemen, alleen trimmen. Geen normalisatie —
    // spaties en streepjes hóren bij de code zoals de klant hem opschreef; de
    // matcher normaliseert pas bij het vergelijken (normalizeSku).
    const artikelnummer =
      typeof row.artikelnummer === "string" && row.artikelnummer.trim().length > 0
        ? row.artikelnummer.trim()
        : null;
    out.push({
      armatuurcode: code,
      merk,
      type,
      ruweTekst,
      codeValid: CODE.test(code),
      aantal,
      artikelnummer,
      ...(pagina != null ? { pagina } : {}),
    });
  }
  return out;
}

// Uint8Array → base64, zonder Buffer-afhankelijkheid (de tests draaien in de browser).
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ── De lever_regels-call met tripwire-retry (puur: geen database) ────────────
// Gedeeld hart van de vision-route (hieronder) en de tekst-leesroute
// (lib/ai/leesroute.ts): 1–2 API-calls met geforceerde lever_regels-tool. Gooit
// alleen bij een client-/netwerkfout; kapotte model-output → gewoon 0 regels.
export type OcrAttempt = {
  maxTokens: number;
  // "timeout" is geen echte Anthropic-stop_reason — een intern signaal (zie
  // isTimeoutError) dat de EERSTE poging op CALL_TIMEOUT_MS liep vóór er een
  // antwoord was.
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
};

// Live-check 17 jul (Raadhuis, dossier ae0eead9/run daf7c660): een dichte
// leesroute-batch liep tegen CALL_TIMEOUT_MS aan (toen 30 s); de SDK gooit dan
// `APIConnectionTimeoutError` met precies deze boodschap ("Request timed out.").
// Berichttoets i.p.v. instanceof: de SDK-klasse importeren zou de dynamische
// "alleen laden als er een key is"-opzet van createAnthropicOcrClient breken,
// en mock-clients in tests gooien toch een kale Error met dezelfde tekst.
function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && /timed out/i.test(err.message);
}

export async function leverRegelsMetRetry(opts: {
  client: OcrClient;
  system: string;
  tools: OcrToolDef[];
  messages: OcrMessageParams["messages"];
  maxTokensEerste: number;
  maxTokensRetry: number;
}): Promise<{
  // Regels van de BESTE poging (de poging met de meeste geparste regels).
  regels: OcrRegel[];
  // SOMTOTALEN over alle pogingen — dit is wat de aanroep gekost heeft.
  usage: { inputTokens: number; outputTokens: number };
  attempts: OcrAttempt[];
  // Aantal afgekapte pogingen (0 | 1 | 2). Het onderscheid afgekapt-vs-blanco
  // komt híér vandaan, nooit uit de regels zelf.
  truncated: number;
}> {
  const attempts: OcrAttempt[] = [];
  const parsed: OcrRegel[][] = [];
  // vangTimeout: alleen de EERSTE poging vangt een timeout op en meldt dat terug
  // als retry-trigger (zie hieronder). De tweede poging (retry, ongeacht of hij
  // door afkapping of door een timeout getriggerd werd) vangt niets meer —
  // timet die óók uit, dan gooit hij door naar de aanroeper (ocrPage/
  // leesrouteEenheid), die het als een echte fout logt (ocr_page_failed/
  // leesroute_batch_failed) en de reservering laat staan. Zo blijft een
  // aanhoudende storing zichtbaar en hervatbaar i.p.v. stil als "0 regels,
  // klaar" geboekt — dat zou de pagina/tegel voorgoed als gedaan markeren
  // zonder dat er ooit een antwoord kwam.
  const attempt = async (
    maxTokens: number,
    vangTimeout: boolean,
  ): Promise<string | null> => {
    try {
      const res = await opts.client.createMessage({
        model: OCR_MODEL,
        max_tokens: maxTokens,
        system: opts.system,
        tools: opts.tools,
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: opts.messages,
      });
      attempts.push({
        maxTokens,
        stopReason: res.stop_reason,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      });
      parsed.push(parseLeverRegels(res.content));
      return res.stop_reason;
    } catch (err) {
      if (!vangTimeout || !isTimeoutError(err)) throw err;
      attempts.push({ maxTokens, stopReason: "timeout", inputTokens: 0, outputTokens: 0 });
      parsed.push([]);
      return "timeout";
    }
  };

  // O3-tripwire-retry. Bij een non-streaming respons die midden in een
  // tool_use-blok op max_tokens stuit wordt het incomplete blok NIET meegeleverd
  // (de respons-JSON moet geldig blijven) — parseLeverRegels levert dan vrijwel
  // zeker []. Reken dus nooit op partiële regels (Dordrecht-empirie 16 jul:
  // stop_reason max_tokens → stil 0/18). Maximaal twee calls, hard; de
  // retry-trigger is stop_reason === "max_tokens" ÓF een timeout op de eerste
  // poging (17 jul: CALL_TIMEOUT_MS was te krap voor een dichte batch) — een
  // leeg antwoord met stop_reason "tool_use"/"end_turn" is legitiem blanco en
  // mag nooit een tweede betaalde call veroorzaken.
  const stop1 = await attempt(opts.maxTokensEerste, true);
  if (stop1 === "max_tokens" || stop1 === "timeout") {
    await attempt(opts.maxTokensRetry, false);
  }

  const best = parsed.reduce((a, b) => (b.length > a.length ? b : a));
  return {
    regels: best,
    usage: {
      inputTokens: attempts.reduce((s, a) => s + a.inputTokens, 0),
      outputTokens: attempts.reduce((s, a) => s + a.outputTokens, 0),
    },
    attempts,
    truncated: attempts.filter((a) => a.stopReason === "max_tokens").length,
  };
}

// ── De vision-call zelf (puur: geen database) ────────────────────────────────
// Dunne wrapper: bouwt het image-message (paginabeeld als base64-blok + korte
// tekstinstructie) en delegeert naar leverRegelsMetRetry met de paginabudgetten.
// Sinds stap 5 (O4, A3-tiling) optioneel tegel-bewust: bij een echte tegel
// (count > 1) krijgt het model één extra zin die zegt wélke uitsnede dit is en
// dat rijen die op de beeldrand zijn afgesneden overgeslagen moeten worden (de
// overlap van het tegelplan garandeert dat ze compleet in een buurtegel staan).
// Zonder tile (of met count 1) is de call byte-identiek aan vóór de tiling.
export async function readPageWithVision(opts: {
  client: OcrClient;
  imageBytes: Uint8Array;
  mime: string;
  pageNumber: number;
  // O4: welke uitsnede dit beeld is (n = tegelnummer 1..count). Afwezig of
  // count 1 = hele pagina. pageNumber blijft altijd de ECHTE pagina.
  tile?: { n: number; count: number };
}): Promise<{
  regels: OcrRegel[];
  usage: { inputTokens: number; outputTokens: number };
  attempts: OcrAttempt[];
  truncated: number;
}> {
  const content: OcrUserContent[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: opts.mime,
        data: toBase64(opts.imageBytes),
      },
    },
    {
      type: "text",
      text: `Read the luminaire rows on page ${opts.pageNumber} of this luminaire schedule.`,
    },
  ];
  if (opts.tile && opts.tile.count > 1) {
    content.push({
      type: "text",
      text:
        `This image is section ${opts.tile.n} of ${opts.tile.count} of page ` +
        `${opts.pageNumber}; sections overlap. Skip rows that are cut off at ` +
        "the image edges — they appear complete in another section. Only " +
        "deliver rows whose fixture code is visible in THIS section: if the " +
        "code column falls outside this section, deliver an empty list — " +
        "never use a product name, article number or type string as the code.",
    });
  }
  const messages: OcrMessageParams["messages"] = [
    { role: "user", content },
  ];
  return leverRegelsMetRetry({
    client: opts.client,
    system: SYSTEM_PROMPT,
    tools: [LEVER_REGELS_TOOL],
    messages,
    maxTokensEerste: MAX_TOKENS_PER_PAGE,
    maxTokensRetry: MAX_TOKENS_RETRY,
  });
}

// ── Budget (B4) ──────────────────────────────────────────────────────────────
export type OcrBudgetCheck =
  | { ok: true; runSpendEur: number }
  | {
      ok: false;
      reason: "budget_run" | "budget_month";
      spendEur: number;
      capEur: number;
    };

// Som van llm_usage over déze run (reserveringen tellen mee — dat is de kern van het
// patroon) tegen het €1-plafond, plus het bestaande maandbudget (L-06).
export async function checkOcrBudget(
  db: AppDb,
  importRunId: string,
): Promise<OcrBudgetCheck> {
  const [row] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, importRunId))) as { total: string }[];
  const runSpend = Number(row?.total ?? 0);
  if (runSpend >= OCR_MAX_EUR_PER_RUN) {
    return {
      ok: false,
      reason: "budget_run",
      spendEur: runSpend,
      capEur: OCR_MAX_EUR_PER_RUN,
    };
  }
  const monthBudget = await getSetting<number>(db, "llm_budget_eur");
  if (monthBudget != null) {
    const monthSpend = await getLlmSpend(db);
    if (monthSpend >= monthBudget) {
      return {
        ok: false,
        reason: "budget_month",
        spendEur: monthSpend,
        capEur: monthBudget,
      };
    }
  }
  return { ok: true, runSpendEur: runSpend };
}

// ── Orkestratie per pagina ───────────────────────────────────────────────────
export type OcrPageResult =
  // Skip: de aanroeper (bouwstap 4) logt het bijbehorende skip-event.
  | { skipped: "no_key" | "budget_run" | "budget_month" }
  // Fout: hier al gelogd als ocr_page_failed; de aanroeper gaat door met de volgende
  // pagina. De reservering blijft staan (conservatief, zie kop-commentaar).
  | { failed: string }
  | {
      regels: OcrRegel[];
      // Somtotalen over alle pogingen (1–2 calls) voor deze pagina.
      inputTokens: number;
      outputTokens: number;
      costEur: number;
      // Aantal afgekapte pogingen (0 | 1 | 2). Een dubbel afgekapte pagina is
      // bewust GEEN {failed}: dat zou in processOcrPage de beeldrij wissen en
      // een hervat-lus starten die opnieuw tegen dezelfde afkapping aanloopt
      // (geldverbranding). Het is een succes met de regels van de beste poging
      // (vrijwel zeker []) en truncated: 2 — de events maken het zichtbaar.
      truncated: number;
    };

export function isOcrPageSuccess(
  r: OcrPageResult,
): r is Extract<OcrPageResult, { regels: OcrRegel[] }> {
  return "regels" in r;
}

// Eén pagina: budgetcheck → reservering (llm_usage, purpose 'ocr', mét importRunId)
// → vision-call → rij bijwerken naar echte kosten → ocr_page_done-event.
export async function ocrPage(
  db: AppDb,
  opts: {
    importRunId: string;
    pageNumber: number;
    imageBytes: Uint8Array;
    mime: string;
    client?: OcrClient;
    actor?: string;
    // O4 (stap 5): tegel-info voor de prompt en de events. Afwezig of count 1 =
    // hele pagina (gedrag byte-identiek); de event-payloads dragen additief het
    // tegelnummer (default 0 = hele pagina).
    tile?: { n: number; count: number };
  },
): Promise<OcrPageResult> {
  // Zonder key geen OCR: nette skip-vorm, nooit een fout. Het skip-event logt de
  // aanroeper (die weet of het een run-start of een losse pagina is).
  const apiKey = envApiKey();
  const client =
    opts.client ?? (apiKey ? createAnthropicOcrClient(apiKey) : null);
  if (!client) return { skipped: "no_key" };

  const budget = await checkOcrBudget(db, opts.importRunId);
  if (!budget.ok) return { skipped: budget.reason };

  // Reservering VÓÓR de call (B4): de SUM-check van een parallelle pagina telt deze
  // in-flight call zo altijd mee. Na de call wordt precies deze rij bijgewerkt.
  const [reservation] = await db
    .insert(llmUsage)
    .values({
      purpose: "ocr",
      costEur: OCR_RESERVE_EUR.toFixed(4),
      importRunId: opts.importRunId,
    })
    .returning();

  // Het tegelnummer voor de event-payloads: 0 = hele pagina (ook als er geen
  // tile-info meekwam — dat ís de hele pagina).
  const tileNr = opts.tile?.n ?? 0;

  try {
    const { regels, usage, attempts, truncated } = await readPageWithVision({
      client,
      imageBytes: opts.imageBytes,
      mime: opts.mime,
      pageNumber: opts.pageNumber,
      tile: opts.tile,
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

    // Regel 5: elke afgekapte poging in het event-log (O3-tripwire zichtbaar).
    // final: true alleen op een afgekapte LAATSTE poging — dan zijn de regels
    // van deze pagina vrijwel zeker onvolledig gebleven.
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      if (a.stopReason !== "max_tokens") continue;
      await logEvent(db, {
        entity: "import_run",
        entityId: opts.importRunId,
        action: "ocr_page_truncated",
        actor: opts.actor ?? OCR_ACTOR,
        payload: {
          page: opts.pageNumber,
          tile: tileNr, // additief (O4): 0 = hele pagina
          attempt: i + 1,
          maxTokens: a.maxTokens,
          outputTokens: a.outputTokens,
          final: i === attempts.length - 1,
        },
      });
    }

    // Regel 5: was de eerste poging een timeout (17 jul, CALL_TIMEOUT_MS)? Dan
    // is er stilzwijgend een retry gedaan (leverRegelsMetRetry) — dat hoort
    // zichtbaar te zijn. Alleen attempts[0] kan hier "timeout" zijn: een
    // timeout op de tweede poging gooit door naar het catch-blok hieronder.
    if (attempts[0]?.stopReason === "timeout") {
      await logEvent(db, {
        entity: "import_run",
        entityId: opts.importRunId,
        action: "ocr_page_timeout",
        actor: opts.actor ?? OCR_ACTOR,
        payload: {
          page: opts.pageNumber,
          tile: tileNr,
          maxTokens: attempts[0].maxTokens,
        },
      });
    }

    // Regel 5: elke gelezen pagina in het event-log, met tokens (somtotalen)
    // en kosten.
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.importRunId,
      action: "ocr_page_done",
      actor: opts.actor ?? OCR_ACTOR,
      payload: {
        page: opts.pageNumber,
        tile: tileNr, // additief (O4): 0 = hele pagina
        regels: regels.length,
        codeInvalid: regels.filter((r) => !r.codeValid).length,
        tokens: { input: usage.inputTokens, output: usage.outputTokens },
        costEur: Number(costEur.toFixed(4)),
        truncated,
        attempts: attempts.length,
      },
    });
    return {
      regels,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costEur,
      truncated,
    };
  } catch (err) {
    // Reservering blijft bewust staan (conservatieve kostenpost). Fout = event
    // (regel 5); de aanroeper kan met de volgende pagina verder.
    const melding = err instanceof Error ? err.message : String(err);
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.importRunId,
      action: "ocr_page_failed",
      actor: opts.actor ?? OCR_ACTOR,
      payload: { page: opts.pageNumber, tile: tileNr, melding },
    });
    return { failed: melding };
  }
}
