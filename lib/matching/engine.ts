// De vijfstatussen-matcher: beslisboom 4.3 als deterministische code.
// LLM's raken deze module NOOIT aan — statustoekenning is puur SQL + tolerantietabel
// (masterplan-besluit 8; NFR-invariant "LLM komt nooit voorbij de kandidaten-stap").
//
// De boom (functioneel ontwerp §4.3):
//   1. verlichting? nee → PAARS
//   2. merk in catalogus? nee → BLAUW (+ inlaadwachtrij)
//   3. SKU in de regel? → exacte match (SKU-normalisatie)
//      anders parametrisch binnen merk + fuzzy op producttekst
//   4. geen kandidaten (ook na zoekhypotheses)? → ROOD
//   5. toets alle gevraagde specs tegen de tolerantietabel:
//        een rood-veld of IP lager → ROOD
//        alle bekend + groen → GROEN (lijst 1)
//        bekend maar veld(en) onbekend → lijst 2 ("mogelijk — data onvolledig")
//        minstens één geel → GEEL
//
// De uitkomst is een `MatchOutcome`: status + twee kandidatenlijsten + afwijkingen.
// Het persisteren (spec_line_candidates, status, events) doet lib/repo/matching.ts.

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { brands, visibleProducts } from "@/db/schema";
import type { MatchDeviation } from "@/db/schema";
import type { AppDb } from "@/lib/repo/db";
import {
  hasRed,
  hasUnknown,
  hasYellow,
  judgeCandidate,
  normalizeSku,
  worstVerdict,
  type DeliveredSpecs,
  type RequestedSpecs,
} from "./tolerances";

export type MatchStatus = "open" | "groen" | "geel" | "blauw" | "rood" | "paars";

export type ScoredCandidate = {
  productId: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  grossPrice: string | null;
  currency: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  deviations: MatchDeviation[];
  list: "aantoonbaar" | "onvolledig";
  score: number;
};

export type MatchOutcome = {
  status: MatchStatus;
  reason?: string; // bij paars/blauw/rood: waarom
  brandKey?: string; // bij blauw: genormaliseerd merk voor de inlaadwachtrij
  provable: ScoredCandidate[]; // lijst 1: voldoet aantoonbaar
  incomplete: ScoredCandidate[]; // lijst 2: mogelijk — data onvolledig
  // de afwijkingen van de best passende kandidaat (voor de spec-regel zelf)
  topDeviations: MatchDeviation[];
};

export type SpecRequest = {
  brandText: string | null;
  productText: string | null;
  specs: RequestedSpecs;
  sku?: string | null; // expliciete artikelcode in de regel
  // heuristiek "is dit verlichting?": expliciet paars-signaal vanuit de UI/parser.
  nonLighting?: boolean;
};

// Woorden die duiden op niet-verlichting (PAARS). Bewust klein en expliciet — de
// hoofdregel is dat bijna alles verlichting is; dit vangt de duidelijke gevallen.
const NON_LIGHTING = [
  "stoel", "chair", "tafel", "table", "kast", "bank", "sofa",
  "televisie", "tv", "gordijn", "vloerkleed", "tapijt",
];

function looksNonLighting(text: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return NON_LIGHTING.some((w) => new RegExp(`\\b${w}\\b`).test(t));
}

export function brandKeyOf(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SELECTION = {
  id: visibleProducts.id,
  name: visibleProducts.name,
  brandName: visibleProducts.brandName,
  articleCode: visibleProducts.articleCode,
  supplierArticleCode: visibleProducts.supplierArticleCode,
  kelvin: visibleProducts.kelvin,
  cri: visibleProducts.cri,
  ipValue: visibleProducts.ipValue,
  maxWattage: visibleProducts.maxWattage,
  lumenOutput: visibleProducts.lumenOutput,
  beamAngle: visibleProducts.beamAngle,
  dimmable: visibleProducts.dimmable,
  color1: visibleProducts.color1,
  heightCm: visibleProducts.heightCm,
  widthCm: visibleProducts.widthCm,
  lengthCm: visibleProducts.lengthCm,
  diameterCm: visibleProducts.diameterCm,
  grossPrice: visibleProducts.grossPrice,
  currency: visibleProducts.currency,
};

function toDelivered(r: Record<string, unknown>): DeliveredSpecs {
  const num = (v: unknown): number | null =>
    v == null ? null : Number(v);
  // grootste beschikbare maat als proxy voor "afmeting"
  const sizes = [r.heightCm, r.widthCm, r.lengthCm, r.diameterCm]
    .map(num)
    .filter((v): v is number => v != null);
  return {
    kelvin: num(r.kelvin),
    cri: num(r.cri),
    ip: (r.ipValue as string | null) ?? null,
    watt: num(r.maxWattage),
    lumen: num(r.lumenOutput),
    beamAngle: num(r.beamAngle),
    sizeCm: sizes.length ? Math.max(...sizes) : null,
    shape: null, // vorm zit in run 5-verrijking; nu geen kolom → onbekend
    color: (r.color1 as string | null) ?? null,
    dimmable: (r.dimmable as string | null) ?? null,
  };
}

// Is dit merk überhaupt in de catalogus? (stap 2 — los van zichtbaarheid/prijs, want
// een merk zonder geldige prijslijst is nog steeds "bekend"; dat wordt rood/dagprijs,
// niet blauw.)
async function brandExists(db: AppDb, brandText: string): Promise<boolean> {
  const key = brandKeyOf(brandText);
  if (!key) return false;
  const rows = await db
    .select({ id: brands.id })
    .from(brands)
    .where(
      sql`regexp_replace(lower(${brands.name}), '[^a-z0-9]', '', 'g') = ${key}`,
    )
    .limit(1);
  return rows.length > 0;
}

// Kandidaten ophalen: exact-op-SKU eerst, anders fuzzy binnen merk (C-03/C-04).
async function fetchCandidates(
  db: AppDb,
  req: SpecRequest,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const brand = (req.brandText ?? "").trim();
  const productText = (req.productText ?? "").trim();

  // 3a. Exacte SKU-match (genormaliseerd) als de regel een code draagt.
  if (req.sku && req.sku.trim()) {
    const nsku = normalizeSku(req.sku);
    const exact = await db
      .select(SELECTION)
      .from(visibleProducts)
      .where(
        or(
          sql`regexp_replace(lower(${visibleProducts.articleCode}), '[^a-z0-9]', '', 'g') = ${nsku}`,
          sql`regexp_replace(lower(${visibleProducts.supplierArticleCode}), '[^a-z0-9]', '', 'g') = ${nsku}`,
        ),
      )
      .limit(limit);
    if (exact.length) return exact;
  }

  // 3b. Parametrisch binnen merk + fuzzy op producttekst.
  const conditions = [];
  if (brand.length > 0) {
    const nb = brandKeyOf(brand);
    conditions.push(
      sql`regexp_replace(lower(${visibleProducts.brandName}), '[^a-z0-9]', '', 'g') like ${"%" + nb + "%"}`,
    );
  }
  const tokens = productText.split(/\s+/).filter((t) => t.length >= 2);
  let matchCount = sql<number>`0`;
  if (tokens.length > 0) {
    conditions.push(
      or(...tokens.map((t) => ilike(visibleProducts.name, `%${t}%`))),
    );
    matchCount = sql<number>`(${sql.join(
      tokens.map(
        (t) =>
          sql`(case when ${visibleProducts.name} ilike ${"%" + t + "%"} then 1 else 0 end)`,
      ),
      sql` + `,
    )})`;
  } else if (productText.length > 0) {
    conditions.push(ilike(visibleProducts.name, `%${productText}%`));
  }
  const score = productText
    ? sql<number>`similarity(${visibleProducts.name}, ${productText})`
    : sql<number>`0`;
  const prefixBonus = productText
    ? sql<number>`(case when ${visibleProducts.name} ilike ${productText + "%"} then 1 else 0 end)`
    : sql<number>`0`;

  return db
    .select({ ...SELECTION, score, matchCount })
    .from(visibleProducts)
    .where(conditions.length ? and(...conditions) : undefined)
    // Regel 2: #tokens, prefix, similariteit, naam. Nooit prijs.
    .orderBy(desc(matchCount), desc(prefixBonus), desc(score), asc(visibleProducts.name))
    .limit(limit);
}

// De volledige beslisboom voor één spec-regel.
export async function evaluateSpecLine(
  db: AppDb,
  req: SpecRequest,
  opts: { limit?: number } = {},
): Promise<MatchOutcome> {
  const limit = opts.limit ?? 8;

  // Stap 1 — verlichting? (PAARS)
  if (req.nonLighting || looksNonLighting(req.productText)) {
    return {
      status: "paars",
      reason: "buiten assortiment (geen verlichting)",
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Stap 2 — merk in catalogus? (BLAUW)
  const brand = (req.brandText ?? "").trim();
  if (brand.length > 0 && !(await brandExists(db, brand))) {
    return {
      status: "blauw",
      reason: `merk '${brand}' niet in de catalogus`,
      brandKey: brandKeyOf(brand),
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Stap 3 — kandidaten zoeken.
  let rows = await fetchCandidates(db, req, limit);

  // Stap 3-fallback (C-09): geen kandidaten → deeltermen uit de producttekst proberen
  // vóór "rood". Deterministisch (langste tokens eerst); LLM-hypotheses zijn een latere
  // uitbreiding en zitten nooit vóór deze stap.
  if (rows.length === 0 && req.productText) {
    const tokens = req.productText
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const t of tokens) {
      rows = await fetchCandidates(db, { ...req, productText: t }, limit);
      if (rows.length > 0) break;
    }
  }

  // Stap 4 — geen kandidaten (merk bestaat wél): ROOD.
  if (rows.length === 0) {
    return {
      status: "rood",
      reason: "merk in catalogus, maar geen passend product gevonden",
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Stap 5 — alle kandidaten toetsen tegen de tolerantietabel.
  const scored: ScoredCandidate[] = rows.map((r, i) => {
    const deviations = judgeCandidate(req.specs, toDelivered(r));
    const red = hasRed(deviations);
    const unknown = hasUnknown(deviations);
    // lijst 1 = alle gevraagde velden bekend én geen rood; lijst 2 = veld(en) onbekend
    // (maar geen verkeerde waarde — die sluit uit, C-08). Kandidaten met een rood veld
    // horen in geen van beide "voldoet"-lijsten, maar we tonen ze niet weg (ze bepalen
    // hooguit de rode status van de regel als er niets beters is).
    const list: "aantoonbaar" | "onvolledig" =
      !red && !unknown ? "aantoonbaar" : "onvolledig";
    return {
      productId: String(r.id),
      name: String(r.name ?? ""),
      brandName: (r.brandName as string | null) ?? null,
      articleCode: (r.articleCode as string | null) ?? null,
      grossPrice: (r.grossPrice as string | null) ?? null,
      currency: (r.currency as string | null) ?? null,
      kelvin: (r.kelvin as number | null) ?? null,
      cri: (r.cri as number | null) ?? null,
      ipValue: (r.ipValue as string | null) ?? null,
      deviations,
      list,
      score: Number(r.score ?? 0) || 0,
      _red: red,
      _unknown: unknown,
    } as ScoredCandidate & { _red: boolean; _unknown: boolean };
  });

  // C-08: lijst 1 = geen rood, geen onbekend. Verkeerde waarde (rood) is uitgesloten
  // uit beide "voldoet"-lijsten; ontbrekend veld → lijst 2.
  const provable = scored.filter((c) => c.list === "aantoonbaar");
  const incomplete = scored.filter(
    (c) => c.list === "onvolledig" && !(c as ScoredCandidate & { _red: boolean })._red,
  );

  // Regelstatus = beste haalbare uitkomst over de kandidaten (strengste-telt geldt per
  // kandidaat; over kandidaten heen nemen we de gunstigste beschikbare match).
  // • is er een groene kandidaat (lijst 1, alles groen) → GROEN
  // • anders een gele (lijst 1-achtig maar met gele velden) → GEEL
  // • anders alleen onvolledige → GROEN noch GEEL; de regel blijft 'open' tot review
  //   (lijst 2 kiezen gebeurt met reden), maar de kleur toont het beste dat er is.
  const anyGreen = provable.some(
    (c) => worstVerdict(c.deviations) === "groen",
  );
  const anyYellow = scored.some((c) => {
    const w = worstVerdict(c.deviations);
    return w === "geel" && !hasRed(c.deviations);
  });

  let status: MatchStatus;
  if (anyGreen) status = "groen";
  else if (anyYellow) status = "geel";
  else if (incomplete.length > 0) status = "open"; // alleen data-onvolledige kandidaten → mens kiest met reden
  else status = "rood"; // alle kandidaten hebben een verkeerde (rode) waarde

  // top-afwijkingen: van de best passende kandidaat (eerste in de relevante lijst).
  const top =
    provable[0] ?? incomplete[0] ?? scored[0];

  return {
    status,
    provable: provable.map(strip),
    incomplete: incomplete.map(strip),
    topDeviations: top ? top.deviations : [],
  };
}

// interne hulpvelden (_red/_unknown) niet lekken naar de buitenkant
function strip(c: ScoredCandidate): ScoredCandidate {
  const { productId, name, brandName, articleCode, grossPrice, currency, kelvin, cri, ipValue, deviations, list, score } = c;
  return { productId, name, brandName, articleCode, grossPrice, currency, kelvin, cri, ipValue, deviations, list, score };
}
