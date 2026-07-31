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
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AppDb } from "@/lib/repo/db";
import {
  hasRed,
  hasUnknown,
  hasYellow,
  judgeCandidate,
  normalizeSku,
  parseIp,
  worstVerdict,
  type DeliveredSpecs,
  type RequestedSpecs,
} from "./tolerances";
import {
  suppressedFieldsFor,
  tokenizeWithSpans,
  tokenWeight,
} from "./textscore";
import { specSpans } from "@/lib/enrichment/parser";

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
//   • de kandidaat op lijst 1 ("aantoonbaar") staat, én
//   • er precies één kandidaat is waarvan het slechtste veld-verdict "geel" is en die
//     volledig beoordeelbaar is (geen rood én geen onbekend in de deviations), én
//   • geen van de gele afwijkingen van die kandidaat een keuzeveld betreft
//     (color/shape/dimmable — daar kiest een mens, nooit het systeem).
// Alle andere gevallen: undefined (bestaand gedrag: geel → review).
//
// A2 (reviewzwerm 2.5a, gereproduceerd): de lijst-eis is nieuw en repareert een gat
// tussen Gat A/B en dit predicaat. "Geen onbekend in de deviations" ving alleen de
// ONTBREKENDE waarde af, niet de ONBEVESTIGDE: een kandidaat wiens beam_angle wíj uit
// de optiekklasse hebben afgeleid (FL≈39°/WF≈57°, usesUnconfirmedSource) zakt van Gat B
// naar lijst 2, maar zijn deviations blijven schoon-geel. Dit predicaat las `scored` —
// álle kandidaten — en accepteerde hem alsnog automatisch: reviewKind null, geen mens,
// een match op onze eigen aanname, terwijl Gat B letterlijk "de mens kiest met reden"
// belooft. De lijst is de enige plek waar "onbevestigd" is vastgelegd (de vlag zelf
// leeft niet in de deviations), dus toetsen we daarop — dat dekt Gat A (specloos) mee.
export function pickUnambiguousYellow<
  C extends { deviations: MatchDeviation[]; list: "aantoonbaar" | "onvolledig" },
>(status: MatchStatus, candidates: C[]): C | undefined {
  if (status !== "geel") return undefined;
  // Ondubbelzinnigheid telt over ÁLLE kandidaten (ook lijst 2): staan er twee die
  // bijna passen, dan kiest het systeem nooit — dat was en blijft de B3-eis.
  const cleanYellow = candidates.filter(
    (c) =>
      hasYellow(c.deviations) &&
      !hasRed(c.deviations) &&
      !hasUnknown(c.deviations),
  );
  if (cleanYellow.length !== 1) return undefined;
  const only = cleanYellow[0];
  // A2: en de enige mag alleen automatisch door als hij aantoonbaar is.
  if (only.list !== "aantoonbaar") return undefined;
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
  // Herkomst per verrijkt veld (H-09). Nodig voor de onbevestigde-bron-poort hieronder:
  // zonder deze kolom kan de lijst-indeling niet weten of een waarde uit echte
  // fabrikantsdata komt of uit een eigen aanname.
  tier2Source: visibleProducts.tier2Source,
};

// Verrijkingsbronnen die de FABRIKANT NIET BEVESTIGD heeft (besluit Timo, 21 jul).
// 'optic-code' is onze eigen gecureerde vertaaltabel (lib/enrichment/optic-code.ts):
// FL≈39° / WF≈57° is een aanname over XAL's optiekklassen, geen data ván XAL. Ze is
// goed genoeg om mee te ZOEKEN en te ORDENEN, maar niet om "voldoet aantoonbaar" op te
// beloven. Zodra het 1.2-retourpad een bron bevestigt, gaat hij hier weg (één regel) en
// mogen zijn velden weer lijst 1 dragen.
// NB: 'parsed-from-name' staat hier bewust NIET in — die waarde stáát letterlijk in de
// productnaam van de fabrikant en is dus wél herleidbaar tot de bron.
const UNCONFIRMED_TIER2_SOURCES = new Set(["optic-code"]);

// Parser-veldnaam → productkolom, voor de dubbeltelling-poort in fetchCandidates. De
// parser-namen (lib/enrichment/parser.ts, FIELDS) zijn 1-op-1 de kolomnamen; deze map maakt
// dat expliciet én verbindt ze met de drizzle-kolomrefs.
const PARSER_FIELD_COLUMNS: Record<string, AnyPgColumn> = {
  kelvin: visibleProducts.kelvin,
  cri: visibleProducts.cri,
  ipValue: visibleProducts.ipValue,
  maxWattage: visibleProducts.maxWattage,
  lumenOutput: visibleProducts.lumenOutput,
  beamAngle: visibleProducts.beamAngle,
  dimmable: visibleProducts.dimmable,
};

// Welke PARSER-velden vraagt deze regel? (RequestedSpecs gebruikt andere namen dan de parser:
// watt→maxWattage, ip→ipValue, lumen→lumenOutput.) Alleen gevraagde velden kunnen dubbel tellen:
// staat `specs.watt` op null, dan beoordeelt specScore de wattage niet en is "27" gewoon tekst.
function requestedParserFields(specs: RequestedSpecs): ReadonlySet<string> {
  const out = new Set<string>();
  if (specs.kelvin != null) out.add("kelvin");
  if (specs.cri != null) out.add("cri");
  if (specs.ip) out.add("ipValue");
  if (specs.watt != null) out.add("maxWattage");
  if (specs.lumen != null) out.add("lumenOutput");
  if (specs.beamAngle != null) out.add("beamAngle");
  if (specs.dimmable) out.add("dimmable");
  return out;
}

// Van een getoetst veld (de `field` in een MatchDeviation, zie judgeCandidate) naar de
// productkolom(men) waar die waarde vandaan komt — want tier2_source is per KOLOM
// gestempeld, en de deviation-namen wijken daarvan af (watt→max_wattage, ip→ip_value…).
// Eén veld kan uit meerdere kolommen putten (sizeCm neemt de grootste beschikbare maat);
// dan telt het al als onbevestigd zodra één van die kolommen dat is.
const DEVIATION_FIELD_COLUMNS: Record<string, string[]> = {
  kelvin: ["kelvin"],
  cri: ["cri"],
  ip: ["ipValue"],
  watt: ["maxWattage"],
  lumen: ["lumenOutput"],
  beamAngle: ["beamAngle"],
  sizeCm: ["heightCm", "widthCm", "lengthCm", "diameterCm"],
  color: ["color1"],
  dimmable: ["dimmable"],
  shape: [], // geen kolom (vorm zit niet in products) — kan dus nooit onbevestigd zijn
};

// Ontleent één van de GETOETSTE velden van deze kandidaat zijn waarde aan een
// onbevestigde bron? Alleen velden die judgeCandidate daadwerkelijk beoordeeld heeft
// tellen mee: een onbevestigde kolom die niemand gevraagd heeft, zegt niets over deze
// regel. Een veld dat "onbekend" opleverde telt evenmin — daar is niets ontleend.
function usesUnconfirmedSource(
  tier2Source: unknown,
  deviations: MatchDeviation[],
): boolean {
  if (tier2Source == null || typeof tier2Source !== "object") return false;
  const src = tier2Source as Record<string, string>;
  return deviations.some((d) => {
    if (d.verdict === "onbekend") return false;
    const cols = DEVIATION_FIELD_COLUMNS[d.field] ?? [];
    return cols.some((c) => UNCONFIRMED_TIER2_SOURCES.has(src[c]));
  });
}

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

// Gewicht van de spec-bijdrage aan de gecombineerde primaire sorteersleutel. Bewust klein: de
// positiegewogen tekstscore (textscore.ts) bepaalt de FAMILIE (token 0 weegt 1,0 en houdt de
// echte SASSO's boven een generiek-token-rijk vreemd product); de specScore mag alleen bínnen
// die familie herordenen — een kandidaat die de typeaanduiding mist, mag nooit door een
// spec-bonus omhoogklimmen. Gemeten op de vier Raadhuis-regels; ijkbaar in de test.
const SPEC_COEFF = 0.15;

// Per-veld spec-score als één NULL-neutrale SQL-uitdrukking, uitsluitend over de GEVRAAGDE
// velden. Spiegelt de tolerantie-oordelen (tolerances.ts) zodat ranking en beoordeling niet
// tegenspreken: groen +1, geel +0,5, rood −1, en NULL (kolom leeg) altijd 0 — geen-data mag
// een product nooit omlaag duwen (besluit 4). Kolommen die vandaag vrijwel leeg zijn (cri,
// beam_angle) dragen nu dus ~niets bij, maar zijn correct bedraad voor zodra verrijking ze
// vult. Geen prijs, geen merk. Retourneert null als er geen enkel gevraagd veld is.
function specScoreSql(specs: RequestedSpecs): ReturnType<typeof sql> | null {
  const terms: ReturnType<typeof sql>[] = [];
  const c = visibleProducts;

  if (specs.kelvin != null) {
    terms.push(sql`(case when ${c.kelvin} is null then 0 when ${c.kelvin} = ${specs.kelvin} then 1 else -1 end)`);
  }
  if (specs.cri != null) {
    terms.push(sql`(case when ${c.cri} is null then 0 when ${c.cri} >= ${specs.cri} then 1 else -1 end)`);
  }
  const reqIp = specs.ip ? parseIp(specs.ip) : null;
  if (reqIp != null) {
    // ip_value is tekst ("IP20"/"44"); eerste twee cijfers = de IP-waarde (parseIp-semantiek).
    terms.push(sql`(case when ${c.ipValue} is null then 0 when substring(${c.ipValue} from '(\\d{2})')::int >= ${reqIp} then 1 else -1 end)`);
  }
  if (specs.watt != null) {
    const w = specs.watt;
    // Drempels als decimale literal (sql.raw): lumen_output/max_wattage kunnen integer-kolommen
    // zijn, en dan zou een fractionele bound-param (2,7) door Postgres naar integer gecoërceerd
    // worden en falen ("invalid input syntax for type integer: 2.7").
    terms.push(sql`(case when ${c.maxWattage} is null then 0 when abs(${c.maxWattage} - ${w}) <= ${sql.raw((w * 0.1).toString())} then 1 when abs(${c.maxWattage} - ${w}) <= ${sql.raw((w * 0.4).toString())} then 0.5 else -1 end)`);
  }
  if (specs.lumen != null) {
    const l = specs.lumen;
    terms.push(sql`(case when ${c.lumenOutput} is null then 0 when abs(${c.lumenOutput} - ${l}) <= ${sql.raw((l * 0.15).toString())} then 1 when abs(${c.lumenOutput} - ${l}) <= ${sql.raw((l * 0.4).toString())} then 0.5 else -1 end)`);
  }
  if (specs.beamAngle != null) {
    const b = specs.beamAngle;
    terms.push(sql`(case when ${c.beamAngle} is null then 0 when abs(${c.beamAngle} - ${b}) <= 10 then 1 when abs(${c.beamAngle} - ${b}) <= 25 then 0.5 else -1 end)`);
  }
  if (specs.dimmable) {
    // judgeDimmable: genormaliseerd, tweezijdige bevatting = groen (+1), ander protocol = geel
    // (+0,5), leeg = onbekend (0). Nooit rood.
    const nd = specs.dimmable.toLowerCase().replace(/[^a-z0-9]/g, "");
    terms.push(sql`(case when ${c.dimmable} is null then 0 when regexp_replace(lower(${c.dimmable}), '[^a-z0-9]', '', 'g') like ${"%" + nd + "%"} or ${nd} like '%' || regexp_replace(lower(${c.dimmable}), '[^a-z0-9]', '', 'g') || '%' then 1 else 0.5 end)`);
  }

  if (terms.length === 0) return null;
  return sql`(${sql.join(terms, sql` + `)})`;
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
  // Ongewogen telling: blijft de sorteersleutel voor de spec-loze route (poort hieronder) en
  // byte-identiek aan vandaag — de garantie waarop inv2/inv7b leunen. `matchCount` wordt ook nog
  // in de SELECT teruggegeven; die kolom houdt zijn oude betekenis.
  let matchCount = sql<number>`0`;
  // Positiegewogen som (textscore.ts): vroege tokens = de typeaanduiding en wegen zwaar, de
  // spec-proza-staart licht. Dit is de tekstscore van de spec-bewuste route.
  let weightedMatch = sql<number>`0`;
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
    // Dubbeltelling-poort (docs/goal-wattage-dubbeltelling.md): een token dat de BRON is van een
    // gevraagde spec is al aan specScore overgedragen en mag hier niet nóg eens meetellen. De
    // spans komen uit parseProductName's eigen patronen (lib/enrichment/parser.ts) — dezelfde
    // parser die deze req_*-velden uit deze producttekst heeft gehaald, dus één waarheid.
    //
    // NULL-conditioneel per kandidaat, en dat is wat de ingreep klein houdt: specScore is
    // NULL-neutraal (besluit 4), dus waar de productkolom leeg is oordeelt hij níét — en dan is
    // het tekst-token het enige bewijs dat er is en blijft het gewoon tellen. Alleen waar de
    // kolom gevuld is (en specScore het feit dus mét tolerantie beoordeelt) zwijgt de tekst.
    // Overlapt een token meerdere velden, dan telt het alleen mee als álle betrokken kolommen
    // NULL zijn.
    const spans = specSpans(productText);
    const requestedFields = requestedParserFields(req.specs);
    const positioned = tokenizeWithSpans(productText);
    weightedMatch = sql<number>`(${sql.join(
      positioned.map((tok, i) => {
        // Gewicht als decimale literal (sql.raw), niet als bound param: een untyped param in een
        // CASE met `else 0` laat Postgres het resultaattype op integer gokken en dan faalt de
        // coërcie van 0,667 op "invalid input syntax for type integer".
        const w = sql.raw(tokenWeight(i).toFixed(6));
        const like = ilike(visibleProducts.name, `%${tok.text}%`);
        const fields = suppressedFieldsFor(tok, i, spans, requestedFields);
        if (fields.length === 0) {
          return sql`(case when ${like} then ${w} else 0 end)`;
        }
        const allNull = sql.join(
          fields.map((f) => sql`${PARSER_FIELD_COLUMNS[f]} is null`),
          sql` and `,
        );
        return sql`(case when (${allNull}) and ${like} then ${w} else 0 end)`;
      }),
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

  // Poort (besluit Timo, docs/goal-tekstrelevantie.md): de spec-bewuste ordening geldt UITSLUITEND
  // als de regel gevraagde specs draagt. Zonder specs (of zonder tokens) is de query byte-identiek
  // aan vandaag — dat is de garantie waarmee inv2/inv7b overeind blijven (die draaien met specs:{}).
  //
  // Óók een merk vereist. Zonder merk is er geen betrouwbare kandidatenset: de spec-score zou dan
  // over de héle catalogus een willekeurig spec-matchend product omhoog trekken. Gemeten: de
  // merkloze placeholder-regel Ls002 ("Te bepalen door meubelmaker", enige eis dimmable=DALI)
  // kreeg zo een outdoor up/down-light als GROEN — een misleidende groen die de brandloze
  // productText (rommeltokens) niet kon tegenhouden. De positiegewogen tekstscore leunt bovendien
  // op de kolomvolgorde ná het merk; zonder merk klopt die aanname niet. Merkloze regels vallen
  // dus terug op de ordening van vandaag.
  const specScore =
    brand.length > 0 && tokens.length > 0 && hasAnyRequestedSpec(req.specs)
      ? specScoreSql(req.specs)
      : null;

  // Regel 2: nooit prijs. De constante-nul termen (geen tokens/producttekst) worden overgeslagen:
  // een constante sorteert toch niets én zou als kaal `ORDER BY 0` een positionele verwijzing zijn
  // (Postgres-fout).
  //
  // Sluittermen (artikelcode, dan id): `name` is GEEN totale orde — productnamen zijn niet uniek.
  // De 131 SASSO PRO 100-varianten en de drie STRETTA 600-rijen hebben byte-identieke namen, en
  // binnen zo'n gelijke sorteersleutel mag Postgres teruggeven wat het queryplan uitkomt: dezelfde
  // regel gaf over drie identieke runs rang 1, 1 en 3. article_code is niet uniek (alleen
  // brand_id+supplier_article_code is dat), dus id sluit de rij af — pas dan is de orde aantoonbaar
  // totaal. Beide zijn prijs-blind; ijzeren regel 2 blijft ongemoeid.
  const tailTerms = [
    asc(visibleProducts.name),
    asc(visibleProducts.articleCode),
    asc(visibleProducts.id),
  ];
  let orderTerms;
  if (specScore != null) {
    // Gecombineerde primaire sleutel: tekstscore + kleine spec-bijdrage. Een strikte tiebreak
    // (tekst → spec) is bewezen ontoereikend — hij herordent alleen bínnen een gelijke tekstscore
    // en haalt een verlies daarop nooit in (Lr303 verloor de tekstsleutel met 0,125 terwijl hij
    // op specs vóórlag). De som lost dat op zonder de familie te verliezen (SPEC_COEFF klein).
    // Daarna een continue watt-afstand: de emmers scheiden 26,5 W niet van 27 W (beide binnen 10%),
    // de afstand wel — NULL achteraan (grote coalesce), zodat geen-data nooit vooraan komt.
    const combined = sql<number>`(${weightedMatch} + ${sql.raw(SPEC_COEFF.toString())} * ${specScore})`;
    const wattDist =
      req.specs.watt != null
        ? [asc(sql`coalesce(abs(${visibleProducts.maxWattage} - ${req.specs.watt}), 1e9)`)]
        : [];
    orderTerms = [
      desc(combined),
      ...wattDist,
      desc(prefixBonus),
      desc(score),
      ...tailTerms,
    ];
  } else {
    // Spec-loze route: exact de ordening van vandaag (byte-identiek — inv2/inv7b-garantie).
    orderTerms = [
      ...(tokens.length > 0 ? [desc(matchCount)] : []),
      ...(productText.length > 0 ? [desc(prefixBonus), desc(score)] : []),
      ...tailTerms,
    ];
  }
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
  // Gat B ("aantoonbaar op een aanname", besluit Timo 21 jul): dezelfde figuur als Gat A
  // hierboven, maar dan over de HERKOMST van de waarde in plaats van over het bestaan van
  // een eis. Sinds de optiekcode-verrijking dragen 3.989 XAL-producten een beam_angle die
  // wíj hebben afgeleid (FL≈39°/WF≈57°), niet XAL. Gemeten gevolg: vier tno-regels
  // (Lr302–Lr305) sprongen naar GROEN op "beamAngle requested 51, delivered 57 → groen".
  // Formeel klopt dat — de tolerantietabel zegt ≤10° = groen — maar de regel belooft dan
  // "voldoet aantoonbaar" op grond van onze eigen aanname. Daarom: een veld waarvan de
  // waarde uit een onbevestigde bron komt gedraagt zich als ONBEKEND. De kandidaat zakt
  // naar lijst 2 ("mogelijk — data onvolledig") en de regel valt via de bestaande
  // incomplete-tak naar 'open' — nooit rood (er is niets tegengesproken) en nooit geel
  // (er is geen gele deviation bijgekomen); de mens kiest met reden.
  // Bewust NIET aangeraakt: de deviations zelf. De waarde matcht echt, en dat mag zichtbaar
  // blijven; alleen de belofte "aantoonbaar" vervalt. En de RANKING blijft ongemoeid —
  // dit zit ná fetchCandidates en verandert geen enkele sorteersleutel.
  const specless = !hasAnyRequestedSpec(req.specs);
  const scored: ScoredCandidate[] = rows.map((r, i) => {
    const deviations = judgeCandidate(req.specs, toDelivered(r));
    const red = hasRed(deviations);
    const unknown = hasUnknown(deviations);
    const unconfirmed = usesUnconfirmedSource(r.tier2Source, deviations);
    // lijst 1 = alle gevraagde velden bekend én geen rood; lijst 2 = veld(en) onbekend
    // (maar geen verkeerde waarde — die sluit uit, C-08). Kandidaten met een rood veld
    // horen in geen van beide "voldoet"-lijsten, maar we tonen ze niet weg (ze bepalen
    // hooguit de rode status van de regel als er niets beters is).
    const list: "aantoonbaar" | "onvolledig" =
      !specless && !red && !unknown && !unconfirmed ? "aantoonbaar" : "onvolledig";
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
