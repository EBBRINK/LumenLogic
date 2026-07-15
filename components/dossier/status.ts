// Eén bron van waarheid voor de vijf statussen (masterplan §3/§7). "Badge-taal overal
// gelijk": dezelfde kleur betekent op elk scherm hetzelfde. Esthetiek = eerlijkheid:
// rustige tinten, geen rode alarmen — blauw is een data-gat (onze actie), rood is
// "actie bij de klant", niet een fout. Systeemfouten zijn het enige andere rood.
// UI-taal: Engels (XIS-terminologie). De code-namen van de statussen blijven bewust NL
// ("groen"/"geel"/… als DB/enum-waarde); alleen de zichtbare labels zijn Engels.

export type MatchStatus = "open" | "groen" | "geel" | "blauw" | "rood" | "paars";

export type StatusMeta = {
  label: string; // korte UI-tekst
  word: string; // los woord voor zwart-witprint (NFR 4)
  dot: string; // Tailwind bg-* voor het gekleurde bolletje
  tint: string; // subtiele pill-achtergrond + tekst (licht + donker)
  meaning: string; // tooltip/uitleg
  countsInTotal: boolean; // telt mee in het projecttotaal? (groen+geel wel)
};

export const STATUS: Record<MatchStatus, StatusMeta> = {
  open: {
    label: "Open",
    word: "Open",
    dot: "bg-slate-400",
    tint: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    meaning: "Not matched yet.",
    countsInTotal: false,
  },
  groen: {
    label: "Green",
    word: "Green",
    dot: "bg-emerald-500",
    tint: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    meaning: "We have the product; all specs within the green margin.",
    countsInTotal: true,
  },
  geel: {
    label: "Yellow",
    word: "Yellow",
    dot: "bg-amber-500",
    tint: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    meaning: "Same brand, deviation within the yellow margin. Brink reviews and proposes.",
    countsInTotal: true,
  },
  blauw: {
    label: "Blue",
    word: "Blue",
    dot: "bg-sky-500",
    tint: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    meaning: "Brand not in the catalog yet — data gap, our action (load the brand).",
    countsInTotal: false,
  },
  rood: {
    label: "Red",
    word: "Red",
    dot: "bg-rose-500",
    tint: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    meaning: "Brand yes, this product no. Action on the customer's side.",
    countsInTotal: false,
  },
  paars: {
    label: "Purple",
    word: "Purple",
    dot: "bg-violet-500",
    tint: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    meaning: "Outside the assortment (not lighting). Report explicitly, never omit.",
    countsInTotal: true, // wél getoond op de estimate, maar als p.m. (niet opgeteld)
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
