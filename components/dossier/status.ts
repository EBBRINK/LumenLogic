// Eén bron van waarheid voor de vijf statussen (masterplan §3/§7). "Badge-taal overal
// gelijk": dezelfde kleur betekent op elk scherm hetzelfde. Esthetiek = eerlijkheid:
// rustige tinten, geen rode alarmen — blauw is een data-gat (onze actie), rood is
// "actie bij de klant", niet een fout. Systeemfouten zijn het enige andere rood.
// UI-taal: Engels (XIS-terminologie). De code-namen van de statussen blijven bewust NL
// ("groen"/"geel"/… als DB/enum-waarde); alleen de zichtbare labels zijn Engels.
//
// Sprint 2.0b: de kleuren staan niet langer als Tailwind-paletklassen in dit bestand
// maar als --status-*-tokens in app/globals.css. De wáárden zijn ongewijzigd (bevroren
// Tailwind-hues, letterlijk overgenomen) — dit was een mechanische omzetting, geen
// herkleuring. Waarom niet naar het kit-palet: zie de toelichting in globals.css en
// DESIGN.md O13. Kort: de kit heeft vijf kleuren voor zes statussen, en de labels ZIJN
// de kleurnamen — "Yellow" naar oranje zetten maakt het geprinte woord onwaar.
//
// `print` hoort hier en niet in lib/pdf/estimate.ts, want de belofte in regel 1 ("één
// bron van waarheid") gold tot nu toe alleen voor het scherm: de PDF had zijn eigen,
// losse kopie van het palet. Het zijn bewust dónkerdere varianten dan de schermkleuren
// — papier heeft geen backlight — dus ze zijn niet gelijk te trekken, wel op één plek
// te zetten. Waarden ongewijzigd overgenomen uit die kopie.
//
// Wat hier bewust NIET (meer) staat: een `countsInTotal`-vlag. Die stond er wél, met
// voor paars zelfs de tegengestelde waarde van wat de code doet (`true`, met een comment
// dat "niet opgeteld" zei) — en met nul lezers: alle drie de plekken die het écht willen
// weten roepen de functie aan. Eén bron van waarheid voor "telt mee in het totaal" is
// `countsInTotal()` in lib/repo/estimate.ts; deze module beschrijft alleen het uiterlijk
// en de betekenis van een status. Voeg de vlag hier niet opnieuw toe (reviewzwerm B14).

export type MatchStatus = "open" | "groen" | "geel" | "blauw" | "rood" | "paars";

export type StatusMeta = {
  label: string; // korte UI-tekst
  word: string; // los woord voor zwart-witprint (NFR 4)
  dot: string; // bg-status-*-dot voor het gekleurde bolletje
  tint: string; // subtiele pill-achtergrond + tekst; dark loopt via de tokens
  print: readonly [number, number, number]; // PDF-inkt, zie toelichting hieronder
  meaning: string; // tooltip/uitleg
};

export const STATUS: Record<MatchStatus, StatusMeta> = {
  open: {
    label: "Open",
    word: "Open",
    dot: "bg-status-grey-dot",
    tint: "bg-status-grey-tint text-status-grey-ink",
    print: [0.45, 0.47, 0.51],
    meaning: "Not matched yet.",
  },
  groen: {
    label: "Green",
    word: "Green",
    dot: "bg-status-green-dot",
    tint: "bg-status-green-tint text-status-green-ink",
    print: [0.02, 0.55, 0.38],
    meaning: "We have the product; all specs within the green margin.",
  },
  geel: {
    label: "Yellow",
    word: "Yellow",
    dot: "bg-status-amber-dot",
    tint: "bg-status-amber-tint text-status-amber-ink",
    print: [0.75, 0.51, 0.05],
    meaning: "Same brand, deviation within the yellow margin. Brink reviews and proposes.",
  },
  blauw: {
    label: "Blue",
    word: "Blue",
    dot: "bg-status-blue-dot",
    tint: "bg-status-blue-tint text-status-blue-ink",
    print: [0.04, 0.51, 0.72],
    meaning: "Brand not in the catalog yet — data gap, our action (load the brand).",
  },
  rood: {
    label: "Red",
    word: "Red",
    dot: "bg-status-red-dot",
    tint: "bg-status-red-tint text-status-red-ink",
    print: [0.82, 0.26, 0.35],
    meaning: "Brand yes, this product no. Action on the customer's side.",
  },
  paars: {
    label: "Purple",
    word: "Purple",
    dot: "bg-status-purple-dot",
    tint: "bg-status-purple-tint text-status-purple-ink",
    print: [0.53, 0.36, 0.83],
    meaning: "Outside the assortment (not lighting). Report explicitly, never omit.",
  },
};

export const STATUS_ORDER: MatchStatus[] = [
  "groen",
  "geel",
  "blauw",
  "rood",
  "paars",
  "open",
];

export type StatusCounts = Record<MatchStatus, number>;

export function emptyCounts(): StatusCounts {
  return { open: 0, groen: 0, geel: 0, blauw: 0, rood: 0, paars: 0 };
}
