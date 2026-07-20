// Gedeelde constanten voor de AI-lagen (lib/ai/vangnet.ts en lib/ai/ocr.ts), zodat
// model, timeouts en tarieven op precies één plek leven. Dit bestand bevat bewust
// GEEN logica met database of tools — alleen constanten en de key-detectie.
//
// BELANGRIJK: net als de AI-lagen zelf importeert dit bestand lib/matching/engine.ts
// NIET en mag dat nooit gaan doen (masterplan-besluit 8: de engine blijft LLM-vrij).

// Klein en goedkoop model — vangnet en OCR zijn lees-/zoekklussen, geen redeneerwerk.
export const SMALL_MODEL = "claude-haiku-4-5-20251001";

// Per API-call 120 s (SDK-default is ~10 min) met hooguit één retry. Was 30 s tot
// de live-check van 17 jul: een dichte A3-leesroute-batch (~2k+ outputtokens) had
// écht ~61 s nodig en liep tegen 2× de oude 30 s-grens aan (leesroute_batch_failed,
// "Request timed out.", dossier ae0eead9/run daf7c660) — 30 s was te krap voor een
// legitieme trage call, niet alleen voor een kapotte verbinding.
export const CALL_TIMEOUT_MS = 120_000;
export const MAX_RETRIES = 1;

// Kosten per miljoen tokens voor claude-haiku-4-5 ($1 in / $5 uit); we rekenen bewust
// conservatief 1 USD ≈ 1 EUR zodat de budgetteller (llm_usage.cost_eur, L-06) nooit
// te laag telt.
export const EUR_PER_MTOK_IN = 1.0;
export const EUR_PER_MTOK_OUT = 5.0;

export function envApiKey(): string | undefined {
  // In de browser-tests bestaat `process` niet — dan is er per definitie geen key.
  if (typeof process === "undefined") return undefined;
  const key = process.env?.ANTHROPIC_API_KEY;
  return key && key.trim().length > 0 ? key : undefined;
}
