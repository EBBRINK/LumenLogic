// Woorden die als afkorting op het scherm horen. Eén tabel, gedeeld door élke
// label-vangnetfunctie in de app.
//
// WAAROM DIT BESTAAN MOET (reparatie 30 jul): `eventLabel()` in lib/event-labels.ts had
// zo'n tabel, `fieldLabel()` in lib/matching/tolerances.ts niet. Gevolg, gemeten: de ene
// vangnetfunctie maakte van `ocr_page_done` netjes "OCR page done", de andere van `IP`
// een "Ip", van `CRI` een "Cri" en van `UGR` een "Ugr". Twee vangnetten met twee
// verschillende ideeën over hetzelfde woord is precies hoe de UI weer uit elkaar loopt.
//
// Bewust een eigen bestandje zonder imports: lib/matching mag hier van afhangen zonder
// lib/event-labels (de /data-woordenlijst) mee te trekken, en omgekeerd.
const ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  cct: "CCT",
  cri: "CRI",
  csv: "CSV",
  epd: "EPD",
  id: "ID",
  ip: "IP",
  led: "LED",
  llm: "LLM",
  ocr: "OCR",
  pdf: "PDF",
  pdl: "PDL",
  rgb: "RGB",
  sdcm: "SDCM",
  ugr: "UGR",
  url: "URL",
  xis: "XIS",
};

/**
 * Eén woord uit een identifier omzetten naar schermtaal.
 *
 * - staat het in de afkortingentabel → de afkorting, in hoofdletters ("ip" → "IP");
 * - is het een getal met een eenheidsletter → onaangeroerd ("2700K" blijft "2700K",
 *   niet "2700 k" zoals de eerste versie deed);
 * - anders → kleine letters, want dit is de MIDDEN-IN-DE-ZIN-vorm. Hoofdletters zet de
 *   rendersite (zie `capitalizeFirst`), niet de data.
 */
export function acronymWord(word: string): string {
  const known = ACRONYMS[word.toLowerCase()];
  if (known) return known;
  if (/^\d+[A-Za-z]$/.test(word)) return word;
  return word.toLowerCase();
}

/**
 * Eerste letter groot, tenzij het woord al een afkorting is ("IP" blijft "IP").
 * Hoort op de rendersite: een kolomkop of lijstitem begint met een hoofdletter, dezelfde
 * tekst midden in een zin niet.
 */
export function capitalizeFirst(text: string): string {
  if (!text) return text;
  const [first] = text.split(" ");
  if (first && first === first.toUpperCase() && /[A-Z]/.test(first)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Identifier → losse woorden. Splitst camelCase, snake_case en kebab-case, houdt een
 * afkortingenrij bij elkaar ("IPRating" → ["IP", "Rating"]) en splitst een cijfer alleen
 * van een woord dat écht een woord is ("tier2Source" → ["tier2", "Source"], maar
 * "2700K" blijft één stuk).
 */
export function splitIdentifier(key: string): string[] {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\d)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean);
}
