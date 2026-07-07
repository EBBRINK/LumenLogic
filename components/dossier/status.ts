// Eén bron van waarheid voor de vijf statussen (masterplan §3/§7). "Badge-taal overal
// gelijk": dezelfde kleur betekent op elk scherm hetzelfde. Esthetiek = eerlijkheid:
// rustige tinten, geen rode alarmen — blauw is een data-gat (onze actie), rood is
// "actie bij de klant", niet een fout. Systeemfouten zijn het enige andere rood.

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
    meaning: "Nog niet gematcht.",
    countsInTotal: false,
  },
  groen: {
    label: "Groen",
    word: "Groen",
    dot: "bg-emerald-500",
    tint: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    meaning: "Product hebben we; alle specs binnen de groene marge.",
    countsInTotal: true,
  },
  geel: {
    label: "Geel",
    word: "Geel",
    dot: "bg-amber-500",
    tint: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    meaning: "Zelfde merk, afwijking binnen de gele marge. Brink reviewt en stelt voor.",
    countsInTotal: true,
  },
  blauw: {
    label: "Blauw",
    word: "Blauw",
    dot: "bg-sky-500",
    tint: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    meaning: "Merk nog niet in de catalogus — datagat, onze actie (merk inladen).",
    countsInTotal: false,
  },
  rood: {
    label: "Rood",
    word: "Rood",
    dot: "bg-rose-500",
    tint: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    meaning: "Merk wél, dit product niet. Actie bij de klant.",
    countsInTotal: false,
  },
  paars: {
    label: "Paars",
    word: "Paars",
    dot: "bg-violet-500",
    tint: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    meaning: "Buiten assortiment (geen verlichting). Expliciet melden, niet weglaten.",
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
