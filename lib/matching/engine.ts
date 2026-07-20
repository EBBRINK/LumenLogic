// De vijfstatussen-matcher: beslisboom 4.3 als deterministische code.
// LLM's raken deze module NOOIT aan — statustoekenning is puur SQL + tolerantietabel
// (masterplan-besluit 8; NFR-invariant "LLM komt nooit voorbij de kandidaten-stap").
//
// De boom (functioneel ontwerp §4.3):
//   1. verlichting? nee → PAARS
//   1b. geen merk én geen enkele toetsbare spec? → OPEN, nooit groen (17 jul:
//       een lege eis "voldoet" anders triviaal aan alles — "vacuous truth")
//   2. merk in catalogus? nee → BLAUW (+ inlaadwachtrij)
//      "in catalogus" = ≥1 productrij in de basistabel (O5); gecureerde aliassen
//      (brand_aliases) resolven boek-woorden naar het canonieke merk
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

import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { brandAliases, brands, products, visibleProducts } from "@/db/schema";
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
  // B3 (geel auto-door): gezet als de regel geel is én er precies één kandidaat is met
  // een schoon-geel oordeel (zie pickUnambiguousYellow). Alle andere gevallen: undefined.
  // Puur en deterministisch — geen LLM, geen fase; het persisteren beslist de repo.
  unambiguousYellow?: ScoredCandidate;
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

// Live-check 17 jul ("vacuous green"): judgeCandidate (tolerances.ts) pusht alleen
// een deviation voor een GEVULD req-veld; zijn ze allemaal leeg, dan is
// deviations=[] voor élke kandidaat, en worstVerdict([]) valt terug op "groen"
// (leeg = geen tegenspraak). Precies dezelfde velden als judgeCandidate toetst —
// blijft dit false, dan kan geen enkele kandidaat ooit iets anders dan een lege
// deviations-lijst krijgen.
// Geëxporteerd sinds de gat-A-fix (20 jul): lib/repo/ocr.ts (upgradeOcrLine) heeft
// dezelfde toets nodig voor stillValid — één waarheid over de veldenlijst, zelfde
// patroon als SELECTION/toDelivered hierboven.
export function hasAnyRequestedSpec(specs: RequestedSpecs): boolean {
  return (
    specs.kelvin != null ||
    specs.cri != null ||
    !!specs.ip ||
    specs.watt != null ||
    specs.lumen != null ||
    specs.beamAngle != null ||
    specs.sizeCm != null ||
    !!specs.shape ||
    !!specs.color ||
    !!specs.dimmable
  );
}

export function brandKeyOf(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// B3: keuzevelden — kleur, vorm en dimprotocol zijn keuzes van de mens, geen
// toleranties. Een gele afwijking op zo'n veld mag nooit automatisch geaccepteerd
// worden. (Veldnamen conform judgeCandidate in tolerances.ts.)
const CHOICE_FIELDS = new Set(["color", "shape", "dimmable"]);

// B3-predicaat (puur, deterministisch): de ondubbelzinnige bijna-match.
// Gezet ALLEEN als:
//   • de regelstatus geel is, én
//   • er precies één kandidaat is waarvan het slechtste veld-verdict "geel" is en die
//     volledig beoordeelbaar is (geen rood én geen onbekend in de deviations), én
//   • geen van de gele afwijkingen van die kandidaat een keuzeveld betreft
//     (color/shape/dimmable — daar kiest een mens, nooit het systeem).
// Alle andere gevallen: undefined (bestaand gedrag: geel → review).
export function pickUnambiguousYellow<C extends { deviations: MatchDeviation[] }>(
  status: MatchStatus,
  candidates: C[],
): C | undefined {
  if (status !== "geel") return undefined;
  const cleanYellow = candidates.filter(
    (c) =>
      hasYellow(c.deviations) &&
      !hasRed(c.deviations) &&
      !hasUnknown(c.deviations),
  );
  if (cleanYellow.length !== 1) return undefined;
  const only = cleanYellow[0];
  const yellowOnChoiceField = only.deviations.some(
    (d) => d.verdict === "geel" && CHOICE_FIELDS.has(d.field),
  );
  return yellowOnChoiceField ? undefined : only;
}

// Geëxporteerd (ocr.ts, upgradeOcrLine): dezelfde veldenlijst voor de gerichte
// product-lookup, zodat toDelivered() daar hetzelfde blijft werken als hier —
// één plek voor de kolommenlijst, geen dubbele (kunnen-uit-elkaar-lopen) lijst.
export const SELECTION = {
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

// Geëxporteerd (ocr.ts, upgradeOcrLine): een gericht product rechtstreeks tegen
// specs toetsen, los van de kandidatenlijst/limiet van fetchCandidates hieronder
// (die limiet maakt "zit hij in de top-N" geen betrouwbare stillValid-toets).
export function toDelivered(r: Record<string, unknown>): DeliveredSpecs {
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

// Is dit merk überhaupt in de catalogus? (stap 2, O5.) "Bekend" = het merk heeft ≥1
// productrij in de BASISTABEL products — bewust níét visible_products: een merk met
// alleen een verlopen prijslijst is nog steeds bekend en wordt rood/dagprijs, nooit
// blauw (de verlopen-prijslijst-verdediging van vroeger blijft dus overeind). De
// kandidaten zelf blijven strikt uit visible_products komen (ijzeren regel 3) — deze
// toets verandert daar niets aan. Een kale merkrij zónder producten is daarentegen
// een datagat: blauw + inlaadwachtrij, want er valt niets te matchen.
//
// Resolutie in één query, twee routes naar een merkrij:
//   • gecureerde alias (brand_aliases, strikt op brand_id gejoind — 0 dangling,
//     geverifieerd; een tekst-join zou een fuzzy-sluiproute zijn en fuzzy/prefix-gok
//     als merkmatch is expliciet verboden), of
//   • exacte naamgelijkheid op de genormaliseerde merknaam.
// De alias wint van naamgelijkheid: "Signify" bestaat zelf als (lege) merkrij, maar
// de gecureerde redirect signify → MyCreations is de bewuste keuze — vandaar
// ORDER BY via-alias eerst, dan heeft-producten, dan naam (deterministisch).
async function resolveBrand(
  db: AppDb,
  brandText: string,
): Promise<{
  key: string;
  canonicalName: string | null;
  brandId: string | null;
  hasProducts: boolean;
}> {
  const key = brandKeyOf(brandText);
  if (!key) return { key, canonicalName: null, brandId: null, hasProducts: false };
  const viaAlias = sql<boolean>`(${brandAliases.id} is not null)`;
  const hasProducts = sql<boolean>`exists (select 1 from ${products} where ${products.brandId} = ${brands.id})`;
  const rows = await db
    .select({ id: brands.id, name: brands.name, hasProducts })
    .from(brands)
    .leftJoin(
      brandAliases,
      and(eq(brandAliases.brandId, brands.id), eq(brandAliases.aliasKey, key)),
    )
    .where(
      or(
        isNotNull(brandAliases.id),
        sql`regexp_replace(lower(${brands.name}), '[^a-z0-9]', '', 'g') = ${key}`,
      ),
    )
    .orderBy(desc(viaAlias), desc(hasProducts), asc(brands.name))
    .limit(1);
  if (rows.length === 0) {
    return { key, canonicalName: null, brandId: null, hasProducts: false };
  }
  return {
    key,
    canonicalName: rows[0].name,
    brandId: rows[0].id,
    hasProducts: Boolean(rows[0].hasProducts),
  };
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
  // Zonder énig zoeksignaal (geen sku-match, geen merk, geen producttekst) is er
  // niets om op te zoeken: kandidaten zoeken zonder criteria zou LIMIT-veel
  // willekeurige producten opleveren (en vóór deze poort crashte de query zelfs:
  // de constante-nul sorteertermen renderden als `ORDER BY 0` — een positionele
  // verwijzing voor Postgres). Bereikbaar sinds de AI-leesroute regels met alleen
  // een armatuurcode kan leveren (stap 3); de regel wordt dan rood → review/mens.
  if (brand.length === 0 && productText.length === 0) return [];

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

  // Regel 2: #tokens, prefix, similariteit, naam. Nooit prijs.
  // De constante-nul termen (geen tokens/producttekst) worden overgeslagen: een
  // constante sorteert toch niets én zou als kaal `ORDER BY 0` een positionele
  // verwijzing zijn (Postgres-fout). Semantisch identiek aan de oude volgorde.
  const orderTerms = [
    ...(tokens.length > 0 ? [desc(matchCount)] : []),
    ...(productText.length > 0 ? [desc(prefixBonus), desc(score)] : []),
    asc(visibleProducts.name),
  ];
  return db
    .select({ ...SELECTION, score, matchCount })
    .from(visibleProducts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderTerms)
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
      reason: "outside assortment (not lighting)",
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  const brand = (req.brandText ?? "").trim();

  // Stap 1b — genoeg gevraagd om gelijkwaardigheid te kunnen aantonen? Zonder merk
  // én zonder één toetsbare req_*-spec heeft stap 5 niets om te toetsen: elke
  // kandidaat krijgt dan een lege deviations-lijst, en worstVerdict([]) levert
  // "groen" op (leeg = geen tegenspraak) — een lege eis "voldoet" triviaal aan
  // alles ("vacuous truth"). Live-check 17 jul: Lf902 (geen merk, geen enkele
  // req_*-spec) kreeg zo 8 willekeurige accessoires als "Provably compliant".
  // Merk blijft een ECHTE eis (fetchCandidates dwingt hem af, ook zonder specs) —
  // dus dit raakt uitsluitend de combinatie merk=leeg + specs=leeg; een regel met
  // alléén een merk blijft ongemoeid.
  if (brand.length === 0 && !hasAnyRequestedSpec(req.specs)) {
    return {
      status: "open",
      reason: "te weinig gevraagd om gelijkwaardigheid aan te tonen (geen merk, geen specs)",
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Stap 2 — merk in catalogus? (BLAUW) "In catalogus" = merk mét producten in de
  // basistabel (zie resolveBrand). brandKey is bij een resolve de CANONIEKE key
  // (brandKeyOf(canonicalName)): de inlaadwachtrij moet het merk dragen dat wij écht
  // zouden inladen ('mycreations'), niet het boek-woord ('signify'); zonder resolve
  // blijft het de eigen key.
  const resolved = brand.length > 0 ? await resolveBrand(db, brand) : null;
  if (resolved && !resolved.hasProducts) {
    return {
      status: "blauw",
      reason: `merk '${brand}' niet in de catalogus (geen producten)`,
      brandKey: resolved.canonicalName
        ? brandKeyOf(resolved.canonicalName)
        : resolved.key,
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Substitutie (O5): bij een alias-hit zoekt fetchCandidates verder met de canonieke
  // merknaam ('Intralight' → 'Intra-lighting'), anders vindt de merkconditie niets.
  // Eén gesubstitueerd request voor de kandidaten-stap ÉN de C-09-fallback hieronder;
  // fetchCandidates zelf blijft ongewijzigd (en kandidaten strikt visible_products).
  const effectiveReq: SpecRequest = resolved?.canonicalName
    ? { ...req, brandText: resolved.canonicalName }
    : req;

  // Stap 3 — kandidaten zoeken.
  let rows = await fetchCandidates(db, effectiveReq, limit);

  // Stap 3-fallback (C-09): geen kandidaten → deeltermen uit de producttekst proberen
  // vóór "rood". Deterministisch (langste tokens eerst); LLM-hypotheses zijn een latere
  // uitbreiding en zitten nooit vóór deze stap.
  if (rows.length === 0 && effectiveReq.productText) {
    const tokens = effectiveReq.productText
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const t of tokens) {
      rows = await fetchCandidates(db, { ...effectiveReq, productText: t }, limit);
      if (rows.length > 0) break;
    }
  }

  // Stap 4 — geen kandidaten (merk bestaat wél): ROOD.
  if (rows.length === 0) {
    return {
      status: "rood",
      reason: "brand in catalog, but no matching product found",
      provable: [],
      incomplete: [],
      topDeviations: [],
    };
  }

  // Stap 5 — alle kandidaten toetsen tegen de tolerantietabel.
  //
  // Gat A ("vacuous green mét merk", live-check 20 jul, dossier ae0eead9): zonder
  // één toetsbare req_*-spec is er niets aan te tonen — het merk is bij
  // fetchCandidates een ZOEKFILTER, geen getoetste eis. Een kandidaat van het
  // juiste merk bewijst alleen dat het merk klopt, niet dat het product
  // gelijkwaardig is (vier XAL-regels stonden zo groen met montagerails als
  // "Provably compliant"). Daarom: specloos → élke kandidaat hooguit lijst 2
  // ("mogelijk — data onvolledig"), en de regel zakt via de bestaande
  // incomplete-tak naar 'open' (mens kiest met reden). Bewijs dat geel/groen
  // dan onbereikbaar is: judgeCandidate pusht uitsluitend onder gevulde-req-
  // veld-guards (exact de velden van hasAnyRequestedSpec), dus deviations
  // blijft [] voor elke kandidaat — anyGreen leest alleen provable (leeg) en
  // anyYellow vereist een gele deviation die niet kan bestaan; B3 auto-door
  // (pickUnambiguousYellow) vereist status geel én hasYellow — beide dood.
  // NB sku: specRequestFromLine zet sku vandaag altijd null (dood pad). Wordt
  // dat pad ooit geactiveerd, dan mag een exacte 3a-SKU-hit als "aantoonbaar"
  // gelden (de SKU is zelf de meest specifieke eis) — dan hoort hier een
  // sku-uitzondering bij.
  const specless = !hasAnyRequestedSpec(req.specs);
  const scored: ScoredCandidate[] = rows.map((r, i) => {
    const deviations = judgeCandidate(req.specs, toDelivered(r));
    const red = hasRed(deviations);
    const unknown = hasUnknown(deviations);
    // lijst 1 = alle gevraagde velden bekend én geen rood; lijst 2 = veld(en) onbekend
    // (maar geen verkeerde waarde — die sluit uit, C-08). Kandidaten met een rood veld
    // horen in geen van beide "voldoet"-lijsten, maar we tonen ze niet weg (ze bepalen
    // hooguit de rode status van de regel als er niets beters is).
    const list: "aantoonbaar" | "onvolledig" =
      !specless && !red && !unknown ? "aantoonbaar" : "onvolledig";
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

  // B3: de ondubbelzinnige bijna-match (alleen bij geel, zie pickUnambiguousYellow).
  const unambiguousYellow = pickUnambiguousYellow(status, scored);

  return {
    status,
    // Gat A: benoem wáárom een specloze regel open blijft (NB: outcome.reason
    // wordt nog niet per regel gepersisteerd — opvolgpunt 2.5, commit 2c29fa8).
    ...(specless
      ? { reason: "merk gevraagd maar geen toetsbare specs — niets aantoonbaar" }
      : {}),
    provable: provable.map(strip),
    incomplete: incomplete.map(strip),
    topDeviations: top ? top.deviations : [],
    unambiguousYellow: unambiguousYellow ? strip(unambiguousYellow) : undefined,
  };
}

// interne hulpvelden (_red/_unknown) niet lekken naar de buitenkant
function strip(c: ScoredCandidate): ScoredCandidate {
  const { productId, name, brandName, articleCode, grossPrice, currency, kelvin, cri, ipValue, deviations, list, score } = c;
  return { productId, name, brandName, articleCode, grossPrice, currency, kelvin, cri, ipValue, deviations, list, score };
}
