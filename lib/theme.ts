// Thema-schakelaar (light/dark) — één bron van waarheid voor de inline-init in
// app/layout.tsx, de knop in de balk en de tests.
//
// WAAROM DIT ER KOMT. Dark mode is verplicht (DESIGN.md O3 / besluit G24) en het
// `.dark`-tokenblok in app/globals.css is compleet, maar er was geen enkele weg
// naartoe: geen provider, geen toggle buiten de tests. Elke sprint maakte dus
// light/dark-screenshotparen van een stand die geen gebruiker kon bereiken. Deze
// module maakt hem bereikbaar. Er verandert géén tokenwaarde: alleen wánneer de
// klasse `dark` op <html> staat.
//
// WAAROM DE STANDAARD LICHT IS EN NIET DE SYSTEEMVOORKEUR (besluit Timo).
// DESIGN.md O13 zegt letterlijk: "De dark-paren (`-950`/`-300`) zijn nooit op
// contrast nagerekend." Zolang dat zo is, mag niemand in dark BELANDEN zonder erom
// te vragen — een donker ingestelde Mac is geen verzoek om een ongemeten UI. Dus:
// een opgeslagen keuze wint, en zónder opgeslagen keuze is de app licht.
// `prefers-color-scheme` wordt hier BEWUST nergens gelezen — niet in het init-script
// en niet in een matchMedia-luisteraar. Niet later stilzwijgend alsnog inbouwen;
// dat hoort bij de vraag aan Eduard uit O13.
//
// WAAROM GEEN next-themes. Wat hier nodig is: één klasse op <html> en één
// localStorage-sleutel. Dat is dit bestand (± 20 regels). Een dependency zou een
// provider + context in de RSC-boom hangen — elke renderServer-test zou hem eromheen
// moeten krijgen — om precies dit terug te geven. Niet gedaan.

export type Theme = "light" | "dark";

/** localStorage-sleutel voor de EXPLICIETE keuze. Ontbreekt hij, dan is de app licht. */
export const THEME_STORAGE_KEY = "lumenlogic-theme";
/** De klasse waar `@custom-variant dark (&:is(.dark *))` in globals.css op haakt. */
export const DARK_CLASS = "dark";

/** De expliciete keuze, of null = "geen keuze gemaakt" → licht. */
export function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    // Alleen de twee bekende waarden tellen; rommel in de opslag ("paars", een
    // half geschreven waarde) is géén keuze en valt dus terug op licht.
    return v === "dark" || v === "light" ? v : null;
  } catch {
    // Safari-privémodus e.d. gooit op localStorage. Dan geen voorkeur — liever licht
    // dan de balk laten crashen.
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // idem: niet kunnen onthouden mag de klik niet slopen.
  }
}

/** Zet/haalt de klasse op <html>. De enige plek die het document aanraakt. */
export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
}

export function isDarkNow(): boolean {
  return document.documentElement.classList.contains(DARK_CLASS);
}

// Draait als eerste kind van <body>, dus vóór de rest van het document geparsed is
// en vóór hydratie: zonder dit ziet een gebruiker die dark koos eerst een wit scherm
// (flash of wrong theme). Bewust één regel platte ES5 zonder imports — hij wordt
// letterlijk in de HTML geplakt en moet dus ook draaien als de bundel nog niet
// geladen is. Regel: alleen de opgeslagen keuze "dark" zet de klasse. Al het andere
// (geen keuze, "light", rommel, opslag die gooit) = licht.
//
// `toggle(klasse, waarde)` en niet `add()`: bij een echte paginalading staat de klasse
// er nog niet, maar zo is het script idempotent in BEIDE richtingen — twee keer draaien
// geeft altijd de stand die in de opslag staat. Dat maakt "overleeft een herlading" in
// de test een echte assertie in plaats van een toevalstreffer.
export const THEME_INIT_SCRIPT =
  `try{document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)},` +
  `localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark")}catch(e){}`;
