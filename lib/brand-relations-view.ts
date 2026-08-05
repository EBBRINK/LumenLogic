// Presentatielaag van het merkrelaties-overzicht: wélke rijen je ziet, in welke volgorde
// en op welke pagina. Puur — geen React, geen DB — zodat de RSC-pagina, de links in de
// werkbalk en de tests exact dezelfde selectie berekenen.
//
// Waarom dit uit components/data/brand-relations-table.tsx is gehaald (UX-audit 30 jul,
// bak 2 item 10): het filteren gebeurde daar in `useState` + `useMemo`, dus álle 438 merken
// moesten als props de client in en er stonden 438 rijen (met 438 `<select>`s) in de DOM.
// De selectie hoort vóór de rendergrens te gebeuren, op de server; de tabel krijgt alleen
// nog de rijen van de huidige pagina. Zelfde reden als waarom de filterstand in de URL
// leeft en niet in component-state: een gefilterde pagina is dan deelbaar en
// terugknop-bestendig — het idioom van components/dossier/status-filter.tsx.

import { GEEN_REACTIE_DAGEN } from "@/lib/field-catalog";
import type { ScorecardAggregate } from "@/lib/field-catalog";

export type RelationStatus =
  | "niet_benaderd"
  | "benaderd"
  | "wacht_op_data"
  | "data_ontvangen"
  | "verwerkt"
  | "afgewezen";

export type PriceIndicator =
  | "aanwezig_geldig"
  | "verloopt_binnenkort"
  | "verlopen"
  | "ontbreekt";

export const STATUS_LABEL: Record<RelationStatus, string> = {
  niet_benaderd: "Not approached",
  benaderd: "Approached",
  wacht_op_data: "Awaiting data",
  data_ontvangen: "Data received",
  verwerkt: "Processed",
  afgewezen: "Declined",
};

// Vaste volgorde = de volgorde van het inwinningsproces, niet alfabetisch.
export const STATUS_ORDER: RelationStatus[] = [
  "niet_benaderd",
  "benaderd",
  "wacht_op_data",
  "data_ontvangen",
  "verwerkt",
  "afgewezen",
];

export function isRelationStatus(v: unknown): v is RelationStatus {
  return typeof v === "string" && (STATUS_ORDER as string[]).includes(v);
}

// Alles wat nodig is om te FILTEREN en de rij te tekenen, behalve compleetheid: die is
// duur (zie lib/repo/brand-relations.ts) en wordt daarom pas ná het pagineren opgehaald,
// alleen voor de merken die je werkelijk ziet.
export type BrandRelationBaseRow = {
  brandId: string;
  brandName: string;
  brandCode: string | null;
  status: RelationStatus;
  lastContactAt: string | null;
  productCount: number;
  priceListIndicator: PriceIndicator;
  sharedBrandCode: boolean;
};

export type BrandRelationTableRow = BrandRelationBaseRow & {
  // 0..1 = aandeel gevulde Excel-velden over alle producten van dit merk; null = merk
  // zonder producten ("n/a"). Verving de mini-scorecard van 10 blokjes van 8px, die
  // zonder legenda niet te lezen was — zie components/data/brand-relations-table.tsx.
  completeness: number | null;
};

// ── URL-stand ────────────────────────────────────────────────────────────────
// Eén bron van waarheid voor zoeken, statusfilter, het "geen reactie"-filter en de
// pagina. De pagina leest hem uit searchParams, de werkbalk schrijft hem in hrefs.

export type BrandRelationsQuery = {
  q: string;
  status: "alle" | RelationStatus;
  noResponse: boolean;
  page: number; // 1-based
};

// 25 rijen: de rij is met status-badge + laatste contact ~44px hoog, dus een pagina vult
// ruim één 800px-scherm en je scrollt hooguit een halve slag. Bij 438 merken zijn dat 18
// pagina's — genoeg om zoeken/filteren het primaire pad te houden, wat het ook is.
export const BRAND_RELATIONS_PAGE_SIZE = 25;

export const BRAND_RELATIONS_PATH = "/data/brand-relations";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseBrandRelationsQuery(
  sp: RawSearchParams,
): BrandRelationsQuery {
  const statusRaw = first(sp.status);
  const pageRaw = Number(first(sp.page));
  return {
    q: (first(sp.q) ?? "").trim(),
    status: isRelationStatus(statusRaw) ? statusRaw : "alle",
    noResponse: first(sp.noresponse) === "1",
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  };
}

// Href voor de werkbalk. Alles wat de SELECTIE verandert zet de pagina terug op 1 — anders
// sta je na een filterklik op pagina 12 van 3 en lijkt het scherm leeg.
export function brandRelationsHref(
  query: BrandRelationsQuery,
  patch: Partial<BrandRelationsQuery>,
): string {
  const next: BrandRelationsQuery = {
    ...query,
    ...patch,
    page: patch.page ?? 1,
  };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.status !== "alle") p.set("status", next.status);
  if (next.noResponse) p.set("noresponse", "1");
  if (next.page > 1) p.set("page", String(next.page));
  const qs = p.toString();
  return qs ? `${BRAND_RELATIONS_PATH}?${qs}` : BRAND_RELATIONS_PATH;
}

// ── Selectie ─────────────────────────────────────────────────────────────────

function daysSince(iso: string, todayIso: string): number {
  return Math.floor(
    (Date.parse(todayIso) - Date.parse(iso)) / (24 * 60 * 60 * 1000),
  );
}

// "Geen reactie" is géén status maar een filter (plan-merkrelaties K1): status 'benaderd'
// waarvan het laatste contact langer dan GEEN_REACTIE_DAGEN geleden is.
export function filterBrandRelationRows<T extends BrandRelationBaseRow>(
  rows: readonly T[],
  query: BrandRelationsQuery,
  todayIso: string,
): T[] {
  const q = query.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (
      q &&
      !r.brandName.toLowerCase().includes(q) &&
      !(r.brandCode ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (query.status !== "alle" && r.status !== query.status) return false;
    if (query.noResponse) {
      if (r.status !== "benaderd") return false;
      if (!r.lastContactAt) return false;
      if (daysSince(r.lastContactAt, todayIso) <= GEEN_REACTIE_DAGEN) {
        return false;
      }
    }
    return true;
  });
}

export type PageWindow = {
  page: number; // gecorrigeerd binnen [1, pageCount]
  pageCount: number;
  from: number; // 1-based index van de eerste rij op deze pagina (0 bij leeg)
  to: number; // 1-based index van de laatste rij (0 bij leeg)
  total: number;
};

export function pageWindow(
  total: number,
  page: number,
  pageSize: number = BRAND_RELATIONS_PAGE_SIZE,
): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (clamped - 1) * pageSize + 1;
  const to = Math.min(clamped * pageSize, total);
  return { page: clamped, pageCount, from, to, total };
}

export function pageSlice<T>(
  rows: readonly T[],
  window: PageWindow,
  pageSize: number = BRAND_RELATIONS_PAGE_SIZE,
): T[] {
  const start = (window.page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

// ── Compleetheid als één getal ───────────────────────────────────────────────
// Veldgewogen over categorie 1-10, exact de noemer die de scorecard zelf gebruikt
// (G11/G12: sommeer de coverage over de drie niveaus, deel door het aantal meetbare
// velden — nooit het gemiddelde van drie percentages). null = merk zonder producten.
export function overallCoverage(aggregate: ScorecardAggregate): number | null {
  if (!aggregate.hasProducts) return null;
  const niveaus = ["must", "wanna", "nice"] as const;
  let coverageSum = 0;
  let measurable = 0;
  for (const n of niveaus) {
    coverageSum += aggregate.totals[n].coverageSum;
    measurable += aggregate.totals[n].measurableFields;
  }
  return measurable > 0 ? coverageSum / measurable : null;
}
