// De urgentieformule van het prijslijst-overzicht. Puur — geen React, geen DB — zodat het
// scherm, de kolomkoppen en de tests exact hetzelfde rekenen. De onderbouwing van elk
// gewicht en elke knik staat in docs/goal-prijslijst-urgentie.md; hier staat alleen wat
// niet uit de code zelf af te lezen is.
//
// ⚠️ Ijzeren regel 2: hier komt géén marge, omzet of inkoopvoordeel in. Dat is een besluit,
// geen vergeetachtigheid — zie het goal-document. Dit is weliswaar een interne werklijst en
// geen productranking, maar de grens tussen geld en volgorde laten we niet vervagen.
//
// De rijen zijn per MERK en niet per prijslijst: "een merk zonder prijslijst krijgt de
// maximale tijdfactor" kan alleen bestaan als zo'n merk een rij heeft.

import type { BrandLifecycle } from "@/db/schema";

/** De acht vraagsignalen. Alle tellingen; de weging gebeurt in demandScore(). */
export type BrandDemandSignals = {
  /** distinct dossiers met dit merk, laatste 12 maanden */
  projects12m: number;
  /** spec-regels met dit merk, laatste 12 maanden */
  lines12m: number;
  /** zoekacties met dit merk als filter, laatste 12 maanden */
  searches12m: number;
  /** spec-regels die dit merk vragen terwijl er geen product van is (analytics tegel 6) */
  requestedNotInCatalogue: number;
  /** brand_load_queue.frequency (analytics tegel 7) — per definitie actueel, geen venster */
  loadQueueDemand: number;
  /** zoekacties op dit merk die 0 resultaten gaven (analytics tegel 8) */
  unmetDemand12m: number;
  /** product_considered-events op producten van dit merk */
  considered12m: number;
  /** spec-regels waar een product van dit merk daadwerkelijk gekozen is */
  chosen12m: number;
};

export const GEEN_VRAAG: BrandDemandSignals = {
  projects12m: 0,
  lines12m: 0,
  searches12m: 0,
  requestedNotInCatalogue: 0,
  loadQueueDemand: 0,
  unmetDemand12m: 0,
  considered12m: 0,
  chosen12m: 0,
};

export type BrandUrgencyRow = {
  brandId: string;
  brandName: string;
  brandCode: string | null;
  lifecycle: BrandLifecycle | null;
  /** null = dit merk heeft geen actieve prijslijst */
  priceListId: string | null;
  priceListName: string | null;
  validUntil: string | null;
  /** dagen tot verval; negatief = verlopen. null ⇔ priceListId === null */
  daysLeft: number | null;
  /** gearchiveerd (bevinding B3): bestaat nog als metadata, maar is niet te verlengen */
  replacedAt: Date | null;
  /** prijsregels op de actieve lijst — 0 is voor de matcher hetzelfde gat als verlopen */
  priceCount: number;
  /** producten van dit merk in de catalogus, ongeacht prijslijst */
  productCount: number;
  demand: BrandDemandSignals;
};

// ── Tijdfactor ───────────────────────────────────────────────────────────────

/** De horizon waarbinnen de tijdfactor oploopt, aan beide kanten van de vervaldatum. */
export const URGENTIE_HORIZON_DAGEN = 90;
const BODEM = 0.1;
const OP_DE_DATUM = 0.7;
const MAX = 1;

/**
 * Er is niets om te verlengen: geen lijst, of een lijst zonder prijsregels. Alleen déze twee
 * gevallen krijgen de maximale tijdfactor — er valt geen datum meer te halen, er moet iets
 * kómen.
 *
 * ⚠️ Dit is NIET hetzelfde begrip als `isCoverageGap` in price-list-status.tsx. Die telt een
 * VERLOPEN lijst er ook bij (terecht: zijn producten vallen uit de matcher), maar zo'n lijst
 * heeft nog wel een datum, en die datum bepaalt hoe hard hij oploopt. Twee namen, twee
 * begrippen — ze door elkaar halen zou de hele tijdfactor platslaan.
 */
export function geenBruikbareLijst(row: BrandUrgencyRow): boolean {
  return row.priceListId === null || row.daysLeft === null || row.priceCount === 0;
}

export function timeFactor(row: BrandUrgencyRow): number {
  if (geenBruikbareLijst(row)) return MAX;
  const d = row.daysLeft as number;
  if (d >= URGENTIE_HORIZON_DAGEN) return BODEM;
  if (d >= 0) {
    // 90 → 0 dagen: BODEM → OP_DE_DATUM.
    const voortgang = (URGENTIE_HORIZON_DAGEN - d) / URGENTIE_HORIZON_DAGEN;
    return BODEM + (OP_DE_DATUM - BODEM) * voortgang;
  }
  if (d > -URGENTIE_HORIZON_DAGEN) {
    // 0 → 90 dagen verlopen: OP_DE_DATUM → MAX. Doorstijgen, geen sprong.
    const voortgang = -d / URGENTIE_HORIZON_DAGEN;
    return OP_DE_DATUM + (MAX - OP_DE_DATUM) * voortgang;
  }
  // Voorbij de horizon vlak: een jaar verlopen is niet zesentwintig keer erger dan twee weken.
  return MAX;
}

// ── Vraagscore ───────────────────────────────────────────────────────────────

/**
 * Gewichten per signaal. Projecten wegen het zwaarst: een project is een klant die iets wil,
 * productregels zijn een gevolg van hoe groot dat project toevallig is. Beredeneerd, niet
 * gemeten — zie de sectie "Wat er niet gehaald is" in het goal-document.
 */
export const VRAAG_GEWICHT: Record<keyof BrandDemandSignals, number> = {
  projects12m: 3,
  lines12m: 1,
  searches12m: 0.75,
  requestedNotInCatalogue: 1.5,
  loadQueueDemand: 1,
  unmetDemand12m: 0.5,
  considered12m: 0.5,
  chosen12m: 0.5,
};

/**
 * 1 + Σ gewicht × ln(1 + telling).
 *
 * Logaritmisch (expliciete instructie): één enorm project mag de lijst niet overheersen, en
 * het verschil tussen 1 en 5 projecten hoort groter te zijn dan tussen 40 en 44.
 *
 * De basis is 1 en niet 0: bij 0 zou een merk zonder enig vraagsignaal urgentie 0 krijgen en
 * deed de tijdfactor er voor de hele stille staart niet meer toe.
 */
export function demandScore(demand: BrandDemandSignals): number {
  let score = 1;
  for (const [sleutel, gewicht] of Object.entries(VRAAG_GEWICHT)) {
    const telling = demand[sleutel as keyof BrandDemandSignals];
    // Negatieve tellingen bestaan niet, maar ln(1 + -2) is NaN en zou de hele sortering
    // stilletjes omgooien. Klemmen is goedkoper dan erop vertrouwen.
    score += gewicht * Math.log1p(Math.max(0, telling));
  }
  return score;
}

export function urgencyScore(row: BrandUrgencyRow): number {
  return demandScore(row.demand) * timeFactor(row);
}

// ── Reden ────────────────────────────────────────────────────────────────────

/** `meervoud(1, "search", "searches")` → "1 search"; zonder derde argument gewoon +s. */
function meervoud(n: number, enkel: string, meer = `${enkel}s`): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}

/**
 * De sterkste vraagreden, of null als er geen enkel signaal is. Bewust géén "0 projects":
 * een reden die niets zegt is erger dan geen reden, want hij leest als een gemeten nul.
 */
function vraagReden(demand: BrandDemandSignals): string | null {
  if (demand.projects12m > 0) return meervoud(demand.projects12m, "project");
  if (demand.requestedNotInCatalogue > 0)
    return `${meervoud(demand.requestedNotInCatalogue, "request")} without a product`;
  if (demand.lines12m > 0) return meervoud(demand.lines12m, "spec line");
  if (demand.searches12m > 0)
    return meervoud(demand.searches12m, "search", "searches");
  if (demand.loadQueueDemand > 0) return `queued (${demand.loadQueueDemand}×)`;
  if (demand.considered12m > 0) return `${meervoud(demand.considered12m, "time")} considered`;
  if (demand.chosen12m > 0) return `${meervoud(demand.chosen12m, "time")} chosen`;
  if (demand.unmetDemand12m > 0)
    return `${meervoud(demand.unmetDemand12m, "search", "searches")} with no result`;
  return null;
}

function tijdReden(row: BrandUrgencyRow): string {
  if (row.priceListId === null || row.daysLeft === null) return "no price list";
  if (row.priceCount === 0) return "price list has 0 products";
  const d = row.daysLeft;
  if (d < 0) return `expired ${meervoud(-d, "day")} ago`;
  if (d === 0) return "expires today";
  return `expires in ${meervoud(d, "day")}`;
}

/**
 * Waaróm deze rij hoog staat, in de taal van het scherm: "expires in 12 days · 28 projects".
 * Een kaal urgentiegetal vertrouwt niemand, en terecht.
 */
export function urgencyReason(row: BrandUrgencyRow): string {
  const delen = [tijdReden(row), vraagReden(row.demand)].filter(
    (s): s is string => s !== null,
  );
  return delen.join(" · ");
}

// ── Sorteren ─────────────────────────────────────────────────────────────────

export type UrgencySort = "urgency" | "days" | "projects" | "lines" | "brand";
export type SortDir = "asc" | "desc";
export type UrgencyQuery = { sort: UrgencySort; dir: SortDir };

const SORT_KEYS: UrgencySort[] = ["urgency", "days", "projects", "lines", "brand"];

/**
 * De richting waarin een kolom bij de EERSTE klik het meest urgente bovenaan zet. Voor
 * dagen is dat oplopend (het langst verlopen eerst), voor de rest aflopend — behalve de
 * merknaam, die alfabetisch is en geen urgentie kent.
 */
const STANDAARD_RICHTING: Record<UrgencySort, SortDir> = {
  urgency: "desc",
  days: "asc",
  projects: "desc",
  lines: "desc",
  brand: "asc",
};

export const DEFAULT_URGENCY_QUERY: UrgencyQuery = { sort: "urgency", dir: "desc" };

/**
 * Waar dit overzicht vandaag woont. Het verhuist naar Brand Management (de taak "Ruim
 * hoofdnavigatie en Data-menu op"), en `urgencyHref` neemt het pad daarom als argument: het
 * scherm bepaalt zijn eigen basispad, deze module weet er niets van. De constante is alleen
 * de default voor de huidige plek.
 */
export const PRICE_LISTS_PATH = "/data/price-lists";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Alles wat niet exact klopt valt terug op de default — de adresbalk is invoer. */
export function parseUrgencyQuery(sp: RawSearchParams): UrgencyQuery {
  const sortRaw = first(sp.sort);
  const sort = SORT_KEYS.includes(sortRaw as UrgencySort)
    ? (sortRaw as UrgencySort)
    : DEFAULT_URGENCY_QUERY.sort;
  const dirRaw = first(sp.dir);
  const dir: SortDir =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : STANDAARD_RICHTING[sort];
  return { sort, dir };
}

/**
 * Href van een kolomkop. Dezelfde kolom nog eens aanklikken draait de richting om; een
 * andere kolom begint in zijn eigen standaardrichting. De default-stand laat beide
 * parameters weg, zodat de kale URL de kanonieke vorm blijft.
 */
export function urgencyHref(
  query: UrgencyQuery,
  sort: UrgencySort,
  basePath: string = PRICE_LISTS_PATH,
): string {
  const dir: SortDir =
    query.sort === sort
      ? query.dir === "asc"
        ? "desc"
        : "asc"
      : STANDAARD_RICHTING[sort];
  if (sort === DEFAULT_URGENCY_QUERY.sort && dir === DEFAULT_URGENCY_QUERY.dir) {
    return basePath;
  }
  return `${basePath}?sort=${sort}&dir=${dir}`;
}

/**
 * `daysLeft` van een merk zónder lijst is null en dat is geen 0: die rij hoort niet stil
 * middenin de dagen-kolom te belanden. Hij zakt naar de bodem van die sortering, in beide
 * richtingen — de kolom zegt niets over hem.
 */
function dagenSleutel(row: BrandUrgencyRow, dir: SortDir): number {
  if (row.daysLeft === null) return dir === "asc" ? Infinity : -Infinity;
  return row.daysLeft;
}

export function sortUrgencyRows(
  rows: readonly BrandUrgencyRow[],
  query: UrgencyQuery,
): BrandUrgencyRow[] {
  const teken = query.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let verschil = 0;
    switch (query.sort) {
      case "urgency":
        verschil = urgencyScore(a) - urgencyScore(b);
        break;
      case "days":
        verschil = dagenSleutel(a, query.dir) - dagenSleutel(b, query.dir);
        break;
      case "projects":
        verschil = a.demand.projects12m - b.demand.projects12m;
        break;
      case "lines":
        verschil = a.demand.lines12m - b.demand.lines12m;
        break;
      case "brand":
        verschil = a.brandName.localeCompare(b.brandName);
        break;
    }
    if (verschil !== 0) return teken * verschil;
    // Gelijkspel: eerst alsnog de urgentie (aflopend), dan de naam. Zonder een vaste
    // tweede sleutel wisselt de volgorde van gelijke rijen per render.
    const opUrgentie = urgencyScore(b) - urgencyScore(a);
    if (opUrgentie !== 0) return opUrgentie;
    return a.brandName.localeCompare(b.brandName);
  });
}
