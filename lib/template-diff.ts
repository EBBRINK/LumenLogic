// Diff-engine van het retour-pad (sprint 1.2): wat stelt een ingevuld merk-template voor
// t.o.v. wat we al hebben? Consumeert de 1.1-validator (lib/excel-validate.ts) ONGEWIJZIGD
// en levert per product een voorstel. Schrijft zelf niets — dat doet lib/repo/template-return.ts
// pas ná goedkeuring.
//
// SCHRIJF-MAPPING, NIET measure.column. docs/sprint1-2-briefing.md wijst
// field-catalog `measure.column` aan als "de brug van catalog-key naar DB-kolom". Dat is
// onjuist en gemeld: `measure` is de SCORECARD-MEET-brug en is verouderd t.o.v. migratie 0007
// (die kolommen aanlegde voor vrijwel élk catalogusveld — sdcm, ean_code, family, …, terwijl
// measure ze nog op kind:"none" heeft staan). Erger: `name_en` heeft measure: col("name"),
// dus wie de briefing letterlijk volgt schrijft de Engelse merknaam over products.name heen.
// Daarom staat de schrijf-mapping hieronder expliciet. Zie docs/plan-1-2-retourpad.md besluit 3.
//
// AANWEZIGHEID DRAAGT BETEKENIS — de belangrijkste regel van dit bestand. `GelezenRij.velden`
// is Record<catalogKey, string> waarbij `!("cri" in velden)` betekent "kolom ontbrak in het
// bestand → stel NIETS voor", en `velden.cri === ""` betekent "kolom stond er, cel leeg → het
// merk maakt dit veld leeg". Verwar die twee en je stelt voor bestaande data te wissen.
// De engine itereert daarom uitsluitend over keys die aanwezig ZIJN in `velden`.
import { getTableColumns } from "drizzle-orm";
import { products } from "@/db/schema";
import type { GelezenRij, RijWaarschuwing } from "@/lib/excel-validate";

/**
 * catalog-key (lib/field-catalog.ts) → kolomnaam op `products` (Drizzle-property).
 *
 * Expliciet en met de hand onderhouden, want dit is een SCHRIJF-besluit: welk veld van het
 * merk overschrijft welke kolom van ons. Een afgeleide mapping zou dat besluit verstoppen.
 * Keys die hier ontbreken zijn "not storable" — het voorstel-scherm toont ze als ontvangen
 * maar niet-opslagbaar, nooit stil weggegooid.
 *
 * `list_price_excl_vat` staat er bewust NIET in: prijzen lopen via prices/price_lists
 * (lib/repo/price-archive.ts), nooit via een products-kolom.
 * 🔒-velden (internalOnly) staan niet in het template en dus ook niet hier.
 */
export const SCHRIJF_MAPPING: Record<string, keyof typeof products.$inferSelect> = {
  // Bucket 1 — basis & identiteit
  supplier_article_code: "supplierArticleCode", // de sleutel zelf; nooit een voorstel
  ean_code: "eanCode",
  // ⚠️ name_en → nameEn, NIET name. products.name is onze hoofdnaam (uit de XIS-import);
  // die overschrijft een merk niet via het retour-pad. Bij het AANMAKEN van een nieuw
  // product vult name_en óók products.name — dan is er geen bestaande naam om te beschermen
  // en is name NOT NULL. Dat zit in de repo-laag, niet hier.
  name_en: "nameEn",
  description_en: "descriptionEn",
  family: "family",
  designer: "designer",
  category: "categoryPath", // alleen het tekstpad; category_id blijft onaangeraakt
  etim_class: "etimClass",
  // Bucket 3 — afmetingen
  height_cm: "heightCm",
  width_cm: "widthCm",
  length_cm: "lengthCm",
  diameter_cm: "diameterCm",
  cutting_size_height_cm: "cuttingSizeHeightCm",
  cutting_size_width_cm: "cuttingSizeWidthCm",
  cutting_size_length_cm: "cuttingSizeLengthCm",
  cutting_size_diameter_cm: "cuttingSizeDiameterCm",
  // Bucket 4 — uiterlijk
  color_1: "color1",
  material_1: "material1",
  color_2: "color2",
  material_2: "material2",
  // Bucket 5 — lichtbron & fitting
  light_source: "lightSource",
  light_source_system: "lightSourceSystem",
  light_source_included: "lightSourceIncluded",
  lamp_foot: "lampFoot",
  lamp_category: "lampCategory",
  max_wattage: "maxWattage",
  // Bucket 6 — fotometrie
  kelvin: "kelvin",
  lumen_output: "lumenOutput",
  cri: "cri",
  beam_angle: "beamAngle",
  sdcm: "sdcm",
  efficacy: "efficacy",
  ugr: "ugr",
  lifetime_rating: "lifetimeRating",
  system_lumen: "systemLumen",
  module_lumen: "moduleLumen",
  light_distribution: "lightDistribution",
  // Bucket 7 — elektrisch / driver
  dimmable: "dimmable",
  dim_protocol: "dimProtocol",
  driver_included: "driverIncluded",
  system_wattage: "systemWattage",
  led_wattage: "ledWattage",
  drive_current: "driveCurrent",
  forward_voltage: "forwardVoltage",
  nominal_voltage: "nominalVoltage",
  driver_type: "driverType",
  power_factor: "powerFactor",
  standby_power: "standbyPower",
  // Bucket 8 — bescherming & conformiteit
  ip_value: "ipValue",
  directionable: "directionable",
  protection_class: "protectionClass",
  ik_rating: "ikRating",
  energy_label: "energyLabel",
  emergency: "emergency",
  ambient_temp: "ambientTemp",
  flammable_mount: "flammableMount",
  // Bucket 9 — documentatie / links
  url_datasheet: "urlDatasheet",
  url_supplier_page: "urlSupplierPage",
  url_install_manual: "urlInstallManual",
  url_photometry: "urlPhotometry",
  url_declaration: "urlDeclaration",
  // Bucket 10 — duurzaamheid
  warranty_months: "warrantyMonths",
  repairability: "repairability",
  epd_lifetime_hours: "epdLifetimeHours",
  country_of_origin: "countryOfOrigin",
};

/** De catalog-key van de prijs. Loopt niet via products maar via het prijzenpad. */
export const PRIJS_VELD = "list_price_excl_vat";

/** Waar de prijs wél landt: prices.gross_price. Alleen om een conflict te kunnen benoemen —
 *  de repo-laag schrijft hem via upsertPriceLines, nooit als products-kolom. */
export const PRIJS_KOLOM = "grossPrice";

/** De catalog-key die identificeert. Nooit een veldvoorstel: hij bepaalt tégen welk product
 *  we vergelijken; hem "wijzigen" zou het product zijn dat je aan het vergelijken was. */
export const SLEUTEL_VELD = "supplier_article_code";

/** Kolomtype waarnaar we celtekst canonicaliseren. Afgeleid uit het Drizzle-schema, niet
 *  handmatig overgetypt — een tweede typetabel loopt uit sync met db/schema.ts. */
export type KolomType = "text" | "int" | "num" | "bool";

/** products-kolom → type, uit getTableColumns(). `db/schema` importeren is metadata, geen
 *  connectie: dit bestand blijft testbaar zonder database. */
export function kolomTypeVan(kolom: string): KolomType | null {
  const cols = getTableColumns(products);
  const c = (cols as Record<string, { columnType?: string } | undefined>)[kolom];
  if (!c?.columnType) return null;
  switch (c.columnType) {
    case "PgText":
      return "text";
    case "PgInteger":
    case "PgSmallInt":
      return "int";
    case "PgNumeric":
      return "num";
    case "PgBoolean":
      return "bool";
    default:
      return null;
  }
}

// ── Normalisatie ────────────────────────────────────────────────────────────

const BOOL_WAAR = new Set(["yes", "ja", "true", "1", "y", "j"]);
const BOOL_ONWAAR = new Set(["no", "nee", "false", "0", "n"]);

/**
 * Celtekst → canonieke vorm voor VERGELIJKEN én OPSLAAN. `null` = past niet in het kolomtype
 * (→ Conflict(b)). Beide kanten van de vergelijking lopen hierdoorheen, dus `"12,5"` uit het
 * bestand en `"12.50"` uit numeric(8,2) worden allebei `"12.5"` en zijn dus unchanged.
 *
 * Tekst: alleen trimmen. Een case-wijziging ÍS een wijziging — "Aluminium" vs "aluminium" is
 * een redactionele keuze van het merk, geen ruis, en stil normaliseren zou hem verbergen.
 */
export function normaliseer(ruw: string, type: KolomType): string | null {
  const t = ruw.trim();
  if (t === "") return null;
  switch (type) {
    case "text":
      return t;
    case "bool": {
      const k = t.toLowerCase();
      if (BOOL_WAAR.has(k)) return "true";
      if (BOOL_ONWAAR.has(k)) return "false";
      return null;
    }
    case "int": {
      const n = getal(t);
      if (n === null || !Number.isInteger(n)) return null;
      return String(n);
    }
    case "num": {
      const n = getal(t);
      return n === null ? null : String(n);
    }
  }
}

/**
 * Streng: "," → "." en dan alléén een kaal decimaal getal. Bewust géén duizendtal-heuristiek —
 * "1,234.56" is Engels 1234.56 of een tikfout, en gokken schrijft stil een factor 1000 fout weg.
 * Onverwerkbaar is een zichtbaar conflict; een verkeerd gegokt getal is stille schade.
 */
function getal(t: string): number | null {
  const genormaliseerd = t.replaceAll(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(genormaliseerd)) return null;
  const n = Number(genormaliseerd);
  return Number.isFinite(n) ? n : null;
}

/**
 * Canonieke tekst → de JS-waarde die Drizzle voor die kolom wil. integer/smallint willen een
 * number, numeric een string, boolean een boolean, text een string. Hier, bij de mapping, en
 * niet in de repo: het kolomtype is een eigenschap van de mapping, niet van de schrijver.
 */
export function waardeVoorKolom(kolom: string, waarde: string | null): unknown {
  if (waarde === null) return null;
  switch (kolomTypeVan(kolom)) {
    case "int":
      return Number(waarde);
    case "bool":
      return waarde === "true";
    case "num":
    case "text":
      return waarde;
    default:
      return waarde;
  }
}

/**
 * De waarde die naast dit voorstel op het scherm stond ("oud"), of null als het veld leeg was.
 * De stale-guard vergelijkt hem met de `prevSeen` uit het formulier; omdat de diff bij toepassen
 * VERS wordt herberekend, is dit per definitie de actuele DB-waarde.
 */
export function getoondeOudeWaarde(voorstel: FieldProposal | PriceProposal): string | null {
  switch (voorstel.kind) {
    case "new":
      return null;
    case "changed":
      return voorstel.prev;
    case "unchanged":
      return voorstel.waarde === "" ? null : voorstel.waarde;
    case "conflict":
      if (voorstel.reden.code === "clear" || voorstel.reden.code === "price_clear") {
        return voorstel.reden.prev;
      }
      return null;
  }
}

// ── Uitkomsten per veld ─────────────────────────────────────────────────────

/**
 * Vier uitkomsten, drie zichtbaar. Zie docs/plan-1-2-retourpad.md besluit 4.
 *
 * De conflictregel ("bestaand veld wint, tenzij expliciet aangevinkt") geldt als GEDRAGSregel
 * voor de hele klasse "DB was gevuld": `changed` én `conflict/clear` krijgen een vinkje dat
 * default UIT staat. Het verschil tussen die twee is inhoudelijk, niet beleidsmatig:
 * `changed` = het merk levert een andere waarde; `conflict` = het merk wil WISSEN, wij kunnen
 * er niets mee, of het bestand spreekt zichzelf tegen.
 */
export type FieldProposal =
  /** DB leeg/NULL, cel gevuld en verwerkbaar. Vinkje default AAN (additief, niets gaat stuk). */
  | { kind: "new"; fieldKey: string; kolom: string; next: string; nextRuw: string }
  /** DB gevuld, cel gevuld, verschillend. Vinkje default UIT — bestaand wint. */
  | {
      kind: "changed";
      fieldKey: string;
      kolom: string;
      prev: string;
      next: string;
      nextRuw: string;
    }
  /** Genormaliseerd gelijk. Niet getoond, telt alleen mee in de samenvatting. */
  | { kind: "unchanged"; fieldKey: string; kolom: string; waarde: string }
  /** Zie ConflictReden. Alleen `clear` is toepasbaar (met vinkje, default UIT). */
  | { kind: "conflict"; fieldKey: string; reden: ConflictReden };

export type ConflictReden =
  /** Kolom aanwezig, cel leeg, DB gevuld → voorstel om te WISSEN. Toepasbaar mét vinkje. */
  | { code: "clear"; kolom: string; prev: string }
  /** Celtekst past niet in het kolomtype ("warm" in kelvin). Niet toepasbaar. */
  | { code: "unprocessable"; kolom: string; ruw: string; kolomType: KolomType }
  /** Geen schrijf-mapping. Ontvangen, niet opslagbaar — nooit stil weggooien. */
  | { code: "not_storable"; ruw: string }
  /** Prijs wissen: nooit toepasbaar. Een gewiste prijs maakt het product onzichtbaar
   *  (ijzeren regel 3 via visible_products) — dat is geen veldwijziging maar schade. */
  | { code: "price_clear"; prev: string };

// ── Uitkomsten per rij ──────────────────────────────────────────────────────

export type PriceProposal =
  | { kind: "new"; next: string; nextRuw: string }
  | { kind: "changed"; prev: string; next: string; nextRuw: string }
  | { kind: "unchanged"; waarde: string }
  | { kind: "conflict"; reden: ConflictReden };

export type ProductDiff =
  /** Artikelcode bekend bij dit merk → veldvoorstellen op een bestaand product. */
  | {
      kind: "known";
      rij: number;
      articleCode: string;
      productId: string;
      productName: string;
      fields: FieldProposal[];
      price: PriceProposal | null;
      waarschuwingen: RijWaarschuwing[];
    }
  /** Artikelcode onbekend → nieuw product, of een tikfout. 1.1 waarschuwt, oordeelt niet.
   *  Vinkje op PRODUCTniveau, default UIT: een tikfout maakt stil een dubbelproduct. */
  | {
      kind: "new_product";
      rij: number;
      articleCode: string;
      fields: FieldProposal[];
      price: PriceProposal | null;
      /** `products.name` is NOT NULL: zonder Product name (English) kunnen we niets aanmaken.
       *  `missing_article_code`: de rij vulde wél iets in maar liet Supplier article code leeg
       *  (1.1 laat dat door als `must_veld_leeg`-waarschuwing, niet als afwijzing). Zonder
       *  sleutel kan er geen product ontstaan: (brand_id, supplier_article_code) IS de
       *  identiteit, en twee zulke rijen zouden via ON CONFLICT DO NOTHING stil één product
       *  worden. Zie het rapport bij WP-A: dit lid ontbrak in het contract. */
      blocked: { code: "missing_name" } | { code: "missing_article_code" } | null;
      waarschuwingen: RijWaarschuwing[];
    }
  /** Dezelfde artikelcode meerdere keren in het bestand: het bestand spreekt zichzelf tegen.
   *  Niet toepasbaar — "fix the file". Eén entry voor de hele groep. */
  | { kind: "ambiguous_duplicate"; articleCode: string; rijen: number[] };

export type ProposalCounts = {
  newFields: number;
  changedFields: number;
  conflicts: number;
  unchangedFields: number;
  newProducts: number;
  knownProducts: number;
  ambiguous: number;
  priceLines: number;
};

export type TemplateProposal = { rows: ProductDiff[]; counts: ProposalCounts };

/** Wat de diff-engine van de catalogus moet weten. De repo-laag levert dit; de engine leest
 *  zelf geen database (testbaar zonder PGlite, en de aanroeper bepaalt de versheid). */
export type BestaandProduct = {
  id: string;
  name: string;
  supplierArticleCode: string;
  /** products-kolomnaam → huidige waarde als tekst (null = leeg). */
  velden: Record<string, string | null>;
  /** Brutoprijs op de ACTIEVE prijslijst, of null als er geen (geldige) prijsregel is. */
  grossPrice: string | null;
};

// ── De payload zoals hij in brand_uploads.payload leeft ─────────────────────

/**
 * Snapshot van de 1.1-validator, niet de diff. De diff wordt bij élke render én bij toepassen
 * VERS herberekend tegen de actuele catalogus — een opgeslagen diff toont verouderde
 * "oud"-waarden en past bij goedkeuren iets toe wat de gebruiker niet zag.
 * Rauwe xlsx-bytes bewaren we niet: deze snapshot is verliesvrij voor alles wat wij doen.
 */
export type TemplateReturnPayload = {
  v: 1;
  filename: string;
  fileSize: number;
  werkblad: string;
  rijen: GelezenRij[];
  waarschuwingen: RijWaarschuwing[];
  /** Alleen de fieldKeys — de kolomnummers zijn na validatie niet meer nodig. */
  kolommen: string[];
  onbekendeKolommen: { kolom: number; koptekst: string }[];
  ontbrekendeOptioneleKolommen: string[];
  artikelcodesGecontroleerd: boolean;
};

// ── Selectie-sleutels: het contract tussen het formulier en de apply ─────────

/**
 * Gesleuteld op het Excel-RIJNUMMER, niet op de artikelcode: het rijnummer is stabiel over
 * herberekeningen, uniek binnen het bestand (duplicaten zijn ambiguous_duplicate en niet
 * aanvinkbaar) en overleeft rare tekens in artikelcodes (een code mag punten bevatten).
 */
export function fieldSelectionKey(rij: number, fieldKey: string): string {
  return `r${rij}.${fieldKey}`;
}

export function newProductSelectionKey(rij: number): string {
  return `np.r${rij}`;
}

export function priceSelectionKey(rij: number): string {
  return `r${rij}.${PRIJS_VELD}`;
}

/**
 * Wat het formulier terugstuurt. `prevSeen` is de STALE-GUARD: de oude waarde zoals hij op het
 * scherm stond. Wijkt de actuele DB-waarde daarvan af op het moment van toepassen, dan is de
 * catalogus tussentijds gewijzigd en slaan we het veld over (+ event) — nooit blind
 * overschrijven wat de gebruiker niet zag.
 */
export type ApplySelection = {
  /** Aangevinkte veld-sleutels → de oude waarde zoals getoond (null = was leeg). */
  fields: Map<string, string | null>;
  /** Aangevinkte nieuw-product-sleutels. */
  newProducts: Set<string>;
};

// ── De engine ───────────────────────────────────────────────────────────────

/**
 * Bouwt het voorstel. Puur: geen database, geen tijd, geen willekeur — zelfde rijen + zelfde
 * catalogus geeft altijd hetzelfde voorstel.
 *
 * @param rijen        uit de opgeslagen validator-snapshot (payload.rijen)
 * @param bestaand     producten van DIT merk, gesleuteld op getrimde supplier_article_code.
 *                     Hoofdlettergevoelig, consistent met products_brand_sac_uniq en met
 *                     codeVoorLookup() in de validator: een valse "bekend" verbergt schade.
 * @param waarschuwingen uit de snapshot; worden per rij bij het voorstel getoond.
 */
export function diffTemplateRows(
  rijen: GelezenRij[],
  bestaand: Map<string, BestaandProduct>,
  waarschuwingen: RijWaarschuwing[],
): TemplateProposal {
  const perRij = waarschuwingenPerRij(waarschuwingen);
  const duplicaten = duplicaatGroepen(rijen, waarschuwingen);
  const rijenInDuplicaat = new Set(duplicaten.flatMap((g) => g.rijen));

  // Eén lijst, gesorteerd op (eerste) rijnummer: het scherm leest van boven naar beneden
  // door het bestand, niet door onze interne categorieën.
  const genummerd: { sorteer: number; diff: ProductDiff }[] = [];
  for (const groep of duplicaten) {
    genummerd.push({ sorteer: groep.rijen[0], diff: groep });
  }
  for (const rij of rijen) {
    if (rijenInDuplicaat.has(rij.rij)) continue;
    genummerd.push({
      sorteer: rij.rij,
      diff: diffRij(rij, bestaand, perRij.get(rij.rij) ?? []),
    });
  }
  genummerd.sort((a, b) => a.sorteer - b.sorteer);
  const rows = genummerd.map((g) => g.diff);

  return { rows, counts: tel(rows) };
}

// ── Rij-diff ────────────────────────────────────────────────────────────────

function diffRij(
  rij: GelezenRij,
  bestaand: Map<string, BestaandProduct>,
  waarschuwingen: RijWaarschuwing[],
): ProductDiff {
  // Hoofdlettergevoelig, alleen getrimd — zie codeVoorLookup() in de validator: een valse
  // "bekend" schrijft stil in het verkeerde product.
  const articleCode = (rij.velden[SLEUTEL_VELD] ?? "").trim();
  const product = articleCode === "" ? undefined : bestaand.get(articleCode);

  if (product) {
    const { fields, price } = voorstellenVoor(rij, product);
    return {
      kind: "known",
      rij: rij.rij,
      articleCode,
      productId: product.id,
      productName: product.name,
      fields,
      price,
      waarschuwingen,
    };
  }

  const { fields, price } = voorstellenVoor(rij, null);
  return {
    kind: "new_product",
    rij: rij.rij,
    articleCode,
    fields,
    price,
    blocked: blokkade(rij, articleCode),
    waarschuwingen,
  };
}

/** Kan dit een product wórden? De sleutel eerst: zonder identiteit heeft een naam geen zin. */
function blokkade(
  rij: GelezenRij,
  articleCode: string,
): { code: "missing_article_code" } | { code: "missing_name" } | null {
  if (articleCode === "") return { code: "missing_article_code" };
  if ((rij.velden.name_en ?? "").trim() === "") return { code: "missing_name" };
  return null;
}

/**
 * De kern. Itereert UITSLUITEND over keys die aanwezig ZIJN in `rij.velden` — een ontbrekende
 * kolom levert per constructie geen entry op, want er is niets om over te itereren.
 *
 * `product === null` (nieuw product): er is niets om tegen af te wegen, dus léveren lege cellen
 * geen entry op. "Unchanged" en "wissen" veronderstellen allebei een bestaande rij.
 */
function voorstellenVoor(
  rij: GelezenRij,
  product: BestaandProduct | null,
): { fields: FieldProposal[]; price: PriceProposal | null } {
  const fields: FieldProposal[] = [];
  let price: PriceProposal | null = null;

  for (const fieldKey of Object.keys(rij.velden)) {
    const ruw = (rij.velden[fieldKey] ?? "").trim();
    if (fieldKey === SLEUTEL_VELD) continue; // de sleutel zelf is nooit een veldvoorstel
    if (fieldKey === PRIJS_VELD) {
      price = prijsVoorstel(ruw, product?.grossPrice ?? null, product !== null);
      continue;
    }
    const voorstel = veldVoorstel(fieldKey, ruw, product);
    if (voorstel) fields.push(voorstel);
  }
  return { fields, price };
}

function veldVoorstel(
  fieldKey: string,
  ruw: string,
  product: BestaandProduct | null,
): FieldProposal | null {
  const kolom = SCHRIJF_MAPPING[fieldKey];
  const kolomType = kolom ? kolomTypeVan(kolom) : null;
  if (!kolom || !kolomType) {
    // Ontvangen maar niet opslagbaar — nooit stil weggooien. Een lege cel in zo'n kolom is
    // echter niets: er is niets ontvangen om over te melden.
    return ruw === "" ? null : { kind: "conflict", fieldKey, reden: { code: "not_storable", ruw } };
  }

  const prevRuw = product?.velden[kolom] ?? null;
  const prev = prevRuw === null || prevRuw.trim() === "" ? null : normaliseer(prevRuw, kolomType);

  if (ruw === "") {
    // Kolom stond er, cel leeg: het merk maakt dit veld leeg.
    if (product === null) return null; // nieuw product: niets om te wissen, niets te melden
    if (prev === null) return { kind: "unchanged", fieldKey, kolom, waarde: "" };
    return { kind: "conflict", fieldKey, reden: { code: "clear", kolom, prev } };
  }

  const next = normaliseer(ruw, kolomType);
  if (next === null) {
    return {
      kind: "conflict",
      fieldKey,
      reden: { code: "unprocessable", kolom, ruw, kolomType },
    };
  }
  if (prev === null) return { kind: "new", fieldKey, kolom, next, nextRuw: ruw };
  if (prev === next) return { kind: "unchanged", fieldKey, kolom, waarde: next };
  return { kind: "changed", fieldKey, kolom, prev, next, nextRuw: ruw };
}

function prijsVoorstel(
  ruw: string,
  prevRuw: string | null,
  bestaatProduct: boolean,
): PriceProposal | null {
  const prev = prevRuw === null || prevRuw.trim() === "" ? null : normaliseer(prevRuw, "num");

  if (ruw === "") {
    if (!bestaatProduct) return null;
    if (prev === null) return { kind: "unchanged", waarde: "" };
    // Nooit toepasbaar: een gewiste prijs maakt het product onzichtbaar (ijzeren regel 3).
    return { kind: "conflict", reden: { code: "price_clear", prev } };
  }

  const next = normaliseer(ruw, "num");
  if (next === null) {
    return {
      kind: "conflict",
      reden: { code: "unprocessable", kolom: PRIJS_KOLOM, ruw, kolomType: "num" },
    };
  }
  if (prev === null) return { kind: "new", next, nextRuw: ruw };
  if (prev === next) return { kind: "unchanged", waarde: next };
  return { kind: "changed", prev, next, nextRuw: ruw };
}

// ── Duplicaten ──────────────────────────────────────────────────────────────

/**
 * Groepen afgeleid uit de 1.1-waarschuwing `dubbele_artikelcode` — niet zelf opnieuw
 * gededupliceerd. De validator casefoldt bewust bij dedup en niet bij de DB-lookup; die
 * asymmetrie hier naspelen zou de twee implementaties uit elkaar laten lopen.
 */
function duplicaatGroepen(
  rijen: GelezenRij[],
  waarschuwingen: RijWaarschuwing[],
): { kind: "ambiguous_duplicate"; articleCode: string; rijen: number[] }[] {
  const gezien = new Set<number>();
  const groepen: { kind: "ambiguous_duplicate"; articleCode: string; rijen: number[] }[] = [];
  for (const w of waarschuwingen) {
    if (w.code !== "dubbele_artikelcode") continue;
    if (gezien.has(w.rij)) continue;
    const groep = [w.rij, ...w.ookOpRijen].sort((a, b) => a - b);
    for (const nr of groep) gezien.add(nr);
    const eerste = rijen.find((r) => r.rij === groep[0]);
    groepen.push({
      kind: "ambiguous_duplicate",
      articleCode: (eerste?.velden[SLEUTEL_VELD] ?? w.artikelcode).trim(),
      rijen: groep,
    });
  }
  return groepen;
}

function waarschuwingenPerRij(
  waarschuwingen: RijWaarschuwing[],
): Map<number, RijWaarschuwing[]> {
  const map = new Map<number, RijWaarschuwing[]>();
  for (const w of waarschuwingen) {
    map.set(w.rij, [...(map.get(w.rij) ?? []), w]);
  }
  return map;
}

// ── Tellingen ───────────────────────────────────────────────────────────────

/**
 * `conflicts` telt veld- én prijsconflicten (niet de geblokkeerde nieuwe producten — die
 * staan als `blocked` op de productgroep zelf). `priceLines` telt de prijsvoorstellen die
 * écht een prijsregel zouden schrijven (new + changed), want dát is wat de prijslijst-
 * fieldset moet aankondigen. `newProducts` telt álle nieuwe-productgroepen, ook geblokkeerde.
 */
function tel(rows: ProductDiff[]): ProposalCounts {
  const counts: ProposalCounts = {
    newFields: 0,
    changedFields: 0,
    conflicts: 0,
    unchangedFields: 0,
    newProducts: 0,
    knownProducts: 0,
    ambiguous: 0,
    priceLines: 0,
  };
  for (const row of rows) {
    if (row.kind === "ambiguous_duplicate") {
      counts.ambiguous++;
      continue;
    }
    if (row.kind === "known") counts.knownProducts++;
    else counts.newProducts++;

    for (const f of row.fields) {
      if (f.kind === "new") counts.newFields++;
      else if (f.kind === "changed") counts.changedFields++;
      else if (f.kind === "unchanged") counts.unchangedFields++;
      else counts.conflicts++;
    }
    if (row.price?.kind === "conflict") counts.conflicts++;
    if (row.price?.kind === "new" || row.price?.kind === "changed") counts.priceLines++;
  }
  return counts;
}
