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
//   • Regel 5: elke gelezen pagina (ocr_page_done) en elke fout (ocr_page_failed)
//     wordt gelogd in events. Skip-events (geen key / budget) logt de AANROEPER
//     (bouwstap 4) — daarvoor geeft deze module heldere {skipped: …}-vormen terug.
//
// Plafond (B4, hard): OCR_MAX_EUR_PER_RUN per boek, bovenop het maandbudget (L-06).
// Reserveringspatroon — gekozen: UPDATE-IN-PLACE. Vóór de API-call schrijven we een
// llm_usage-rij met een geschatte kost (OCR_RESERVE_EUR); ná de call werken we
// diezelfde rij bij naar de echte tokenkosten. Zo telt de SUM-check een in-flight
// call altijd mee (twee "gelijktijdige" pagina's kunnen samen het plafond niet
// doorbranden) en blijft er precies één rij per call over — verwijderen+opnieuw
// inserten zou een venster openen waarin de call onzichtbaar is. Faalt de call, dan
// blíjft de reservering staan als conservatieve kostenpost (een timeout kan aan de
// API-kant tóch gekost hebben; te hoog tellen is veilig, te laag niet). Effectief
// plafond: €1 + maximaal één paginaprijs, want de check gebeurt vóór de reservering.
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
// Geschatte kost per paginacall die vóór de call gereserveerd wordt. Ruim boven de
// verwachte werkelijkheid (~1568px-beeld + ~1500 output-tokens ≈ €0,01) — reserveren
// mag te hoog zijn, nooit te laag.
export const OCR_RESERVE_EUR = 0.02;
// Eén pagina levert hooguit enkele tientallen korte regels — 1500 tokens is ruim.
const MAX_TOKENS_PER_PAGE = 1500;
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
// catalogus-tools — het model leest, meer niet (B3).
const LEVER_REGELS_TOOL: OcrToolDef = {
  name: TOOL_NAME,
  description:
    "Deliver the luminaire rows that are literally printed on this page. " +
    "Deliver an empty list if the page contains no luminaire rows.",
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
const SYSTEM_PROMPT =
  "You read one page image from a luminaire schedule ('armaturenboek'). " +
  "Extract the luminaire rows and deliver them with the lever_regels tool.\n" +
  "Rules:\n" +
  "- Report ONLY what is literally printed on the page. Never invent, guess, " +
  "complete or normalise codes, brands or types.\n" +
  "- A row typically starts with a fixture code such as Lp301, Ls004 or Lw201-a, " +
  "followed by a brand and a product type.\n" +
  "- Put the complete literal row text in ruwe_tekst.\n" +
  "- If the page contains no luminaire rows (cover, photo, floor plan, blank), " +
  "deliver an empty list. An empty list is a good answer.\n" +
  "- Prices do not exist for you; never read, mention or estimate them.\n" +
  "- You make no decisions and no judgements — you only transcribe.";

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
    out.push({
      armatuurcode: code,
      merk,
      type,
      ruweTekst,
      codeValid: CODE.test(code),
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

// ── De vision-call zelf (puur: geen database) ────────────────────────────────
// Eén API-call: paginabeeld als base64-image-blok + geforceerde lever_regels-tool.
// Gooit alleen bij een client-/netwerkfout; kapotte model-output → gewoon 0 regels.
export async function readPageWithVision(opts: {
  client: OcrClient;
  imageBytes: Uint8Array;
  mime: string;
  pageNumber: number;
}): Promise<{
  regels: OcrRegel[];
  usage: { inputTokens: number; outputTokens: number };
}> {
  const res = await opts.client.createMessage({
    model: OCR_MODEL,
    max_tokens: MAX_TOKENS_PER_PAGE,
    system: SYSTEM_PROMPT,
    tools: [LEVER_REGELS_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
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
        ],
      },
    ],
  });
  return {
    regels: parseLeverRegels(res.content),
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
  };
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
  if (monthBudget != null && monthBudget > 0) {
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
      inputTokens: number;
      outputTokens: number;
      costEur: number;
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

  try {
    const { regels, usage } = await readPageWithVision({
      client,
      imageBytes: opts.imageBytes,
      mime: opts.mime,
      pageNumber: opts.pageNumber,
    });
    const costEur =
      (usage.inputTokens * EUR_PER_MTOK_IN +
        usage.outputTokens * EUR_PER_MTOK_OUT) /
      1_000_000;
    await db
      .update(llmUsage)
      .set({ costEur: costEur.toFixed(4) })
      .where(eq(llmUsage.id, reservation.id));

    // Regel 5: elke gelezen pagina in het event-log, met tokens en kosten.
    await logEvent(db, {
      entity: "import_run",
      entityId: opts.importRunId,
      action: "ocr_page_done",
      actor: opts.actor ?? OCR_ACTOR,
      payload: {
        page: opts.pageNumber,
        regels: regels.length,
        codeInvalid: regels.filter((r) => !r.codeValid).length,
        tokens: { input: usage.inputTokens, output: usage.outputTokens },
        costEur: Number(costEur.toFixed(4)),
      },
    });
    return {
      regels,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costEur,
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
      payload: { page: opts.pageNumber, melding },
    });
    return { failed: melding };
  }
}
