// UI-naam: Project. DB/code-naam blijft 'dossier' (bewust, zie docs/plan-aanvraag-estimate.md B1).
// Lumen Logic — datamodel (run 1).
//
// Ontworpen op de brondata (data/source/README.md) én op de vijf ijzeren regels uit
// docs/BUILD-PLAN.md. Twee regels zijn hier in het schema verankerd:
//   • Regel 3 (verlopen prijslijst = onzichtbaar): `price_lists.valid_until` is NOT NULL
//     en de view `visible_products` (db/migrations, hand-geschreven) dwingt de filter
//     centraal af — nooit per query opnieuw.
//   • Regel 4 (default = veilig): `project_dossiers.phase` default `tender`; de fase-poort
//     leeft in de repository-laag, het veld hier.
// Commercie (prices/price_lists) staat strikt los van matching (products + technische velden)
// zodat geld nooit in een ranking-codepad kan lekken (regel 2).

import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── bytea (B2) ───────────────────────────────────────────────────────────────
// Drizzle heeft geen ingebouwd bytea; bewezen in db/bytea.test.ts (bouwstap 1).
// Werkt op beide drivers: PGlite serialiseert de Uint8Array binair, neon-http
// maakt er zelf een "\x<hex>"-string van (encodeBuffersAsBytea) en parset het
// resultaat (oid 17) terug naar een Buffer. fromDriver normaliseert naar een
// verse Uint8Array en vangt defensief een rauwe hex-string af.
export function byteaFromDriver(value: Uint8Array | string): Uint8Array {
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export const bytea = customType<{
  data: Uint8Array;
  driverData: Uint8Array | string;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Uint8Array {
    return value;
  },
  fromDriver: byteaFromDriver,
});

// ── Enums ────────────────────────────────────────────────────────────────────
export const disclosureTier = pgEnum("disclosure_tier", [
  "tier1",
  "tier2",
  "tier3",
]);
export const dossierPhase = pgEnum("dossier_phase", ["tender", "awarded"]);
// B6 (docs/plan-aanvraag-estimate.md): commerciële status van een project —
// concept → estimate_gestuurd → offerte → gegund | niet_gegund → archief.
// Vervangt op termijn de lifecycle-code; `phase` blijft de afgeleide
// veiligheidsschakelaar (regel 4), met één schrijver in lib/repo/project-status.ts (stap 4).
export const projectStatus = pgEnum("project_status", [
  "concept",
  "estimate_gestuurd",
  "offerte",
  "gegund",
  "niet_gegund",
  "archief",
]);
// B6: XIS-fasen — de taal van Brink zelf (start…aftersales, win/lost).
export const xisPhase = pgEnum("xis_phase", [
  "start",
  "engineering",
  "calculations",
  "presenting",
  "tender",
  "deal_making",
  "deliver",
  "aftersales",
  "win",
  "lost",
]);
// Vijfstatussen-regelset (masterplan §3, met Eduard vastgesteld) — vervangt het oude
// open/matched/no_match. 'open' = nog niet gematcht (zesde waarde, besluit run 4).
export const matchStatus = pgEnum("match_status", [
  "open",
  "groen",
  "geel",
  "blauw",
  "rood",
  "paars",
]);
// Herkomst van een spec-regel (B-07): zichtbaar + betrouwbaarheid in de UI.
export const specSource = pgEnum("spec_source", [
  "manual",
  "csv",
  "pdf",
  "ocr",
  "llm",
]);
// Review-soorten (D-01): wat voor mensenkeuze een regel nodig heeft.
export const reviewKind = pgEnum("review_kind", [
  "geel",
  "variant",
  "onvolledig",
  "ocr",
]);
// Rollen als "petten" (L-03/04): meerdere per persoon. Rol bepaalt de default-view,
// nooit wat de engine toont (dat is de fase). org_admin beheert leden.
export const membershipRole = pgEnum("membership_role", [
  "calculator",
  "werkvoorbereider",
  "projectleider",
  "org_admin",
]);
// Dossier-lifecycle (A-05): naast de fase (tender/gegund) — opgeleverd = read-only,
// gearchiveerd mét reden (een verloren tender is data, geen niets).
export const dossierLifecycle = pgEnum("dossier_lifecycle", [
  "actief",
  "delivered",
  "archived",
]);
// Prijsaanvraag-lead (J-03) en merk-upload-staging (H-11).
export const leadStatus = pgEnum("lead_status", ["open", "opgevolgd", "gesloten"]);
export const uploadStatus = pgEnum("upload_status", [
  "staging",
  "approved",
  "rejected",
]);

// Merkrelaties (plan-merkrelaties K1): relatiestatus per merk — vrij muteerbaar
// (geen state-machine), elke wijziging gelogd. "Geen reactie" is een filter
// (GEEN_REACTIE_DAGEN in lib/field-catalog.ts), geen status.
export const brandRelationStatus = pgEnum("brand_relation_status", [
  "niet_benaderd",
  "benaderd",
  "wacht_op_data",
  "data_ontvangen",
  "verwerkt",
  "afgewezen",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ── Catalogus ────────────────────────────────────────────────────────────────
// suppliers: apart van brands (1 supplier ↔ n brands en omgekeerd).
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey(), // bron-UUID overgenomen → idempotente import
  supplierCode: text("supplier_code"),
  name: text("name").notNull(),
  country: text("country"),
  city: text("city"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  ...timestamps,
});

// brands: brand_code mag DUBBEL voorkomen in de bron → geen unique constraint.
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey(),
  brandCode: text("brand_code"), // XIS-code, NIET uniek (bv. L052 dubbel)
  name: text("name").notNull(),
  slug: text("slug").notNull(), // afgeleid van naam; niet uniek (naam-collisies mogelijk)
  country: text("country"),
  disclosureTier: disclosureTier("disclosure_tier").notNull().default("tier1"),
  descriptionNl: text("description_nl"),
  warranty: text("warranty"),
  rating: text("rating"),
  // kortings-/leveranciersinfo uit de bron (commercieel — nooit in ranking gebruikt)
  standardDiscountPct: numeric("standard_discount_pct", {
    precision: 6,
    scale: 2,
  }),
  baseDiscountPct: numeric("base_discount_pct", { precision: 6, scale: 2 }),
  paymentTermDays: integer("payment_term_days"),
  deliveryTimeDays: integer("delivery_time_days"),
  website: text("website"),
  ...timestamps,
});

// brand_aliases (O5, goal-import-ai-leesroute stap 4): gecureerde merknaam-redirects.
// Een boek-woord ("Aromas del Campo", "Intralight", "Signify") wijst naar het canonieke
// merk in brands. alias_key is altijd al genormaliseerd (brandKeyOf-vorm; een CHECK in
// migratie 0010 dwingt het af) en de unique index garandeert dat één alias nooit naar
// twee merken wijst. Seeds leven in de migratie zelf (dev = prod). Bewust géén fuzzy
// alternatief: een alias is een bewuste, menselijke keuze — nooit een gok.
export const brandAliases = pgTable(
  "brand_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    aliasKey: text("alias_key").notNull(), // genormaliseerd (lowercase, alfanumeriek)
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("brand_aliases_key_uniq").on(t.aliasKey)],
);

// categories: 3 niveaus (hoofd > sub > subsub), zelf-refererend.
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  nameNl: text("name_nl").notNull(),
  nameEn: text("name_en"),
  parentId: uuid("parent_id"), // self-ref (FK toegevoegd in migratie om cyclus te vermijden)
  level: integer("level").notNull(),
  displayOrder: integer("display_order"),
  fullPathNl: text("full_path_nl"),
  ...timestamps,
});

// products: technische velden (matching) + duurzaamheidsvelden (grotendeels leeg, run 2+).
const productColumns = {
  id: uuid("id").primaryKey(),
  articleCode: text("article_code"), // intern artikelnummer (XIS A1)
  name: text("name").notNull(),
  brandId: uuid("brand_id").references(() => brands.id),
  brandName: text("brand_name"), // backup-veld, snel zoeken zonder JOIN
  supplierArticleCode: text("supplier_article_code"),
  categoryId: uuid("category_id").references(() => categories.id),
  categoryPath: text("category_path"),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  supplierName: text("supplier_name"),
  status: text("status").notNull().default("actief"),
  // technische velden (nullable) — hierop matcht de engine
  description: text("description"),
  lumenOutput: integer("lumen_output"),
  maxWattage: numeric("max_wattage", { precision: 8, scale: 2 }),
  kelvin: integer("kelvin"),
  cri: smallint("cri"),
  ipValue: text("ip_value"),
  beamAngle: numeric("beam_angle", { precision: 6, scale: 2 }),
  dimmable: text("dimmable"),
  driverIncluded: text("driver_included"),
  lightSource: text("light_source"),
  directionable: boolean("directionable"),
  heightCm: numeric("height_cm", { precision: 8, scale: 2 }),
  widthCm: numeric("width_cm", { precision: 8, scale: 2 }),
  lengthCm: numeric("length_cm", { precision: 8, scale: 2 }),
  diameterCm: numeric("diameter_cm", { precision: 8, scale: 2 }),
  color1: text("color_1"),
  material1: text("material_1"),
  // duurzaamheidsvelden (nu leeg; run 2+ vult ze) — schema-ruimte vanaf dag één
  warrantyMonths: integer("warranty_months"),
  repairability: text("repairability"),
  epdLifetimeHours: integer("epd_lifetime_hours"),
  countryOfOrigin: text("country_of_origin"),
  // H-09: herkomst per verrijkt veld — { kelvin: 'parsed-from-name', cri: 'llm', … }
  tier2Source: jsonb("tier2_source").$type<Record<string, string>>(),
  // ── Veldcatalogus 0007 (plan-datamodel-productspecs B4): schema nú, gefaseerd vullen ──
  // Bucket 1 — basis & identiteit
  nameEn: text("name_en"),
  descriptionEn: text("description_en"),
  eanCode: text("ean_code"),
  family: text("family"),
  designer: text("designer"),
  etimClass: text("etim_class"), // ETIM-haakje (B5) — geen ombouw naar ETIM-codes
  // Bucket 2 — commercie-vlaggen (🔒 intern; komen in géén view)
  stock: integer("stock"),
  stockReserved: integer("stock_reserved"),
  showOnWeb: text("show_on_web"), // XIS-enum: 'J' | 'N' | 'Uitlopend' | …
  showPriceOnWeb: boolean("show_price_on_web"),
  // Bucket 3 — zaagmaten (inbouw)
  cuttingSizeHeightCm: numeric("cutting_size_height_cm", { precision: 8, scale: 2 }),
  cuttingSizeWidthCm: numeric("cutting_size_width_cm", { precision: 8, scale: 2 }),
  cuttingSizeLengthCm: numeric("cutting_size_length_cm", { precision: 8, scale: 2 }),
  cuttingSizeDiameterCm: numeric("cutting_size_diameter_cm", { precision: 8, scale: 2 }),
  // Bucket 4 — tweede kleur/materiaal
  color2: text("color_2"),
  material2: text("material_2"),
  // Bucket 5 — lichtbron & fitting
  lightSourceSystem: text("light_source_system"), // bv. Fortimo, Reo
  lightSourceIncluded: boolean("light_source_included"),
  lampFoot: text("lamp_foot"), // fitting
  lampCategory: text("lamp_category"),
  // Bucket 6 — fotometrie
  sdcm: smallint("sdcm"),
  efficacy: numeric("efficacy", { precision: 6, scale: 1 }), // lm/W
  ugr: text("ugr"), // bv. '<19'
  lifetimeRating: text("lifetime_rating"), // bv. 'L80B10 @ 50.000u'
  systemLumen: integer("system_lumen"), // armatuur ná optiek
  moduleLumen: integer("module_lumen"), // LED-module bron
  lightDistribution: text("light_distribution"), // direct/indirect/…
  // Bucket 7 — elektrisch / driver
  dimProtocol: text("dim_protocol"), // DALI / DALI-2 / 1-10V / fase / Casambi
  systemWattage: numeric("system_wattage", { precision: 8, scale: 2 }),
  ledWattage: numeric("led_wattage", { precision: 8, scale: 2 }),
  driveCurrent: text("drive_current"), // 350mA / 700mA / …
  forwardVoltage: numeric("forward_voltage", { precision: 6, scale: 1 }),
  nominalVoltage: text("nominal_voltage"), // 230V AC / 24V DC / 48V DC
  driverType: text("driver_type"), // constante stroom / constante spanning
  powerFactor: numeric("power_factor", { precision: 4, scale: 2 }),
  standbyPower: numeric("standby_power", { precision: 6, scale: 2 }),
  // Bucket 8 — bescherming & conformiteit
  protectionClass: text("protection_class"), // I / II / III
  ikRating: text("ik_rating"), // IK02…IK10
  energyLabel: text("energy_label"),
  emergency: boolean("emergency"), // noodverlichting
  ambientTemp: text("ambient_temp"), // bv. '-20 tot +40 °C'
  flammableMount: boolean("flammable_mount"), // F-markering
  // Bucket 9 — documentatie / links
  urlDatasheet: text("url_datasheet"),
  urlSupplierPage: text("url_supplier_page"),
  urlInstallManual: text("url_install_manual"),
  urlPhotometry: text("url_photometry"), // IES/LDT
  urlDeclaration: text("url_declaration"), // CE/DoC
  ...timestamps,
};
// Natuurlijke sleutel (O1): merk + leveranciers-artikelcode identificeert een artikel —
// een herimport werkt bij i.p.v. dupliceert. NULLs botsen niet (Postgres NULLS DISTINCT).
export const products = pgTable("products", productColumns, (t) => [
  uniqueIndex("products_brand_sac_uniq").on(t.brandId, t.supplierArticleCode),
]);

// ── Commercie (strikt gescheiden van matching) ───────────────────────────────
// price_lists: per merk. valid_until is VERPLICHT — dit veld drijft ijzeren regel 3.
export const priceLists = pgTable(
  "price_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    name: text("name").notNull(),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until").notNull(), // ⚠️ verplicht — geen prijslijst zonder einddatum
    // 0007: vervangen lijsten blijven als metadata bestaan (quote_lines verwijst ernaar);
    // hun prijsregels verhuizen naar archive.prices_archive.
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    ...timestamps,
  },
  // één ACTIEVE lijst per merk — vervangen lijsten (replaced_at gezet) tellen niet mee
  (t) => [
    uniqueIndex("price_lists_brand_active_uniq")
      .on(t.brandId)
      .where(sql`${t.replacedAt} IS NULL`),
  ],
);

// prices: product ↔ price_list, brutoprijs. Staffels zijn run 2+.
export const prices = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id),
    grossPrice: numeric("gross_price", { precision: 12, scale: 2 }).notNull(),
    // 0007 (🔒 intern-only): inkoop hoort bij de prijslijst-regel; komt in géén view.
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("EUR"),
    ...timestamps,
  },
  (t) => [uniqueIndex("prices_product_list_uniq").on(t.productId, t.priceListId)],
);

// ── Archief (0007, SCD type 4): koude opslag in apart schema, append-only ────
// Bewust GEEN foreign keys: het archief mag nooit een wijziging in de hot
// tabellen blokkeren. Rijen komen er alleen bij via archivePriceList (lib/repo).
export const archiveSchema = pgSchema("archive");
export const pricesArchive = archiveSchema.table("prices_archive", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalPriceId: uuid("original_price_id").notNull(),
  productId: uuid("product_id").notNull(),
  priceListId: uuid("price_list_id").notNull(),
  priceListName: text("price_list_name"),
  brandId: uuid("brand_id"),
  grossPrice: numeric("gross_price", { precision: 12, scale: 2 }).notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  archivedAt: timestamp("archived_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedBy: text("archived_by"),
});

// ── Dossier / calculatorflow ─────────────────────────────────────────────────
export const projectDossiers = pgTable("project_dossiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  customer: text("customer"),
  phase: dossierPhase("phase").notNull().default("tender"), // default = veilig (regel 4)
  // B6: commerciële status; backfill van bestaande dossiers in migratie 0006.
  status: projectStatus("status").notNull().default("concept"),
  // B6: XIS-fase. Default bewust 'start' (het plan noemde 'tender'): een nieuw project
  // begint vóór XIS Start — de estimate komt eerder dan de tender. De veilige engine-stand
  // (nooit alternatieven in tender) blijft geregeld via `phase` default 'tender' hierboven;
  // bestaande dossiers worden in 0006 gebackfilld naar 'tender'/'deal_making'.
  xisPhase: xisPhase("xis_phase").notNull().default("start"),
  // H2: org-scoping (nullable → interne Brink-dossiers zonder org blijven werken).
  orgId: uuid("org_id"),
  // A-05: lifecycle naast de fase. archived draagt altijd een reden.
  lifecycle: dossierLifecycle("lifecycle").notNull().default("actief"),
  archivedReason: text("archived_reason"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps,
});

export const specLines = pgTable("spec_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  fixtureCode: text("fixture_code").notNull(), // bv. "Lp301"
  // A-07: aantal mag ontbreken (bestek komt later) → stukprijs-modus op de estimate.
  quantity: integer("quantity"),
  zone: text("zone"), // A-08: optioneel; ingevuld → groeperen + subtotaal per zone
  location: text("location"), // G-03: WAAR — uit de tekening-bron, op het armaturenboek
  description: text("description"),
  brandText: text("brand_text"), // gevraagd merk (vrije tekst; "merk hebben we altijd")
  productText: text("product_text"), // gevraagd type (vrije tekst)
  // B-09: de tien gevraagde kernvelden — wat gevuld is wordt matcheis.
  reqKelvin: integer("req_kelvin"),
  reqCri: integer("req_cri"),
  reqIp: text("req_ip"),
  reqWatt: numeric("req_watt", { precision: 8, scale: 2 }),
  reqLumen: integer("req_lumen"),
  reqBeamAngle: numeric("req_beam_angle", { precision: 6, scale: 2 }),
  reqSizeCm: numeric("req_size_cm", { precision: 8, scale: 2 }),
  reqShape: text("req_shape"),
  reqColor: text("req_color"),
  reqDimmable: text("req_dimmable"),
  matchedProductId: uuid("matched_product_id").references(() => products.id),
  status: matchStatus("status").notNull().default("open"),
  // C-07: élke afwijking benoemd — jsonb-array {field, requested, delivered, verdict}.
  deviations: jsonb("deviations").$type<MatchDeviation[]>(),
  // B-07: herkomst per regel zichtbaar, met betrouwbaarheid + paginanummer (PDF).
  source: specSource("source").notNull().default("manual"),
  sourceConfidence: text("source_confidence"), // 'hoog' | 'middel' | 'laag'
  sourcePage: integer("source_page"),
  importRunId: uuid("import_run_id"),
  // D-01…D-06: review-station. reviewKind ≠ null → regel staat in de wachtrij.
  reviewKind: reviewKind("review_kind"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  reviewDecision: text("review_decision"), // 'accepteer' | 'afgewezen' | 'variant' | 'gecontroleerd' | 'bevestigd'
  reviewReason: text("review_reason"),
  // C-14/K-03: reden bij rood/paars/losmaken.
  noMatchReason: text("no_match_reason"),
  // I-04: dagprijs op DE REGEL (catalogus blijft leeg — het gat blijft eerlijk).
  manualPrice: numeric("manual_price", { precision: 12, scale: 2 }),
  manualPriceValidUntil: date("manual_price_valid_until"),
  manualPriceSetBy: text("manual_price_set_by"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

// Afwijkings-record (C-06/C-07): oordeel per veld uit de tolerantietabel.
export type MatchDeviation = {
  field: string;
  requested: string | number;
  delivered: string | number | null;
  verdict: "groen" | "geel" | "rood" | "onbekend";
  note?: string;
};

// C-10: kandidaten persistent — top-N + score + wie koos wat → reproduceerbaar + analytics.
export const specLineCandidates = pgTable("spec_line_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  specLineId: uuid("spec_line_id")
    .notNull()
    .references(() => specLines.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  rank: integer("rank").notNull(),
  // C-08: twee gescheiden lijsten — 'aantoonbaar' vs 'onvolledig'.
  list: text("list").notNull(), // 'aantoonbaar' | 'onvolledig'
  score: numeric("score", { precision: 8, scale: 4 }),
  verdicts: jsonb("verdicts").$type<MatchDeviation[]>(),
  chosen: boolean("chosen").notNull().default(false),
  chosenBy: text("chosen_by"),
  chosenReason: text("chosen_reason"), // verplicht bij keuze uit lijst 2
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// B4: AI-vangnet — zoekt uitsluitend het gevraagde product (fase-veilig); de matcher-
// engine blijft LLM-vrij en een suggestie wijzigt nooit de regelstatus. Tokens per
// suggestie vastgelegd voor de budgetstop (L-06). Index op spec_line_id in migratie 0006
// (net als spec_line_candidates: niet-unieke indexes leven in de SQL, niet hier).
export const aiSuggestions = pgTable("ai_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  specLineId: uuid("spec_line_id")
    .notNull()
    .references(() => specLines.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  rationale: text("rationale").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedBy: text("dismissed_by"),
});

// B-06: voorstel-scherm vóór opslaan — geparste regels zijn pas spec_lines na bevestiging.
export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // 'pdf' | 'ocr' | 'llm' | 'csv' | 'bestek'
  filename: text("filename"),
  confidence: text("confidence"), // 'hoog' | 'middel' | 'laag'
  status: text("status").notNull().default("voorstel"), // 'voorstel' | 'bevestigd' | 'geannuleerd'
  rows: jsonb("rows").$type<ImportRow[]>().notNull(),
  counts: jsonb("counts").$type<Record<string, number>>(),
  actor: text("actor"),
  // B2: PDF→markdown-controlespoor (cap ~2 MB) — inzichtelijk + downloadbaar per import.
  rawMarkdown: text("raw_markdown"),
  // B5: OCR-voortgang, los van `status` (voorstel/bevestigd/geannuleerd — dat is de
  // voorstel-flow, OCR is een fase dáárvoor). Bewust text en geen pg-enum, in de stijl
  // van `status` hierboven: een enum-wijziging kost op Neon een aparte ALTER TYPE en
  // deze waarden zijn puur intern. null = geen OCR (alle bestaande runs);
  // 'bezig' | 'klaar' | 'gestopt'. Hervatten (B5) leunt op unique(run, page) hieronder.
  ocrStatus: text("ocr_status"),
  ...timestamps,
});

// ── OCR-paginabeelden (B2/B4) ────────────────────────────────────────────────
// De échte bron van een OCR-import: één rij per gerenderde pagina, bytes in bytea.
// unique(import_run_id, page) is tegelijk het per-pagina-lock uit B4: éérst de
// beeldrij inserten — conflict = pagina al bezig/gedaan → weigeren. Cascade met de
// run (B6: beelden leven even lang als de run). Harde regel (B2): alléén
// getOcrPageImage in de repo-laag selecteert de bytes-kolom.
export const ocrPageImages = pgTable(
  "ocr_page_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    page: integer("page").notNull(), // 1-gebaseerd, zoals spec_lines.source_page
    // O4 (stap 5, A3-tiling): tegelnummer binnen de pagina. INVARIANT: tile 0 ⟺
    // het beeld beslaat de hele pagina; 1..N = rij-major genummerde uitsnedes
    // (lib/pdf/tiles.ts). Bestaande rijen zijn hele pagina's → backfill via
    // DEFAULT 0 (migratie 0011). De unique-index hieronder is per TEGEL het
    // B4-lock dat eerst per pagina was.
    tile: integer("tile").notNull().default(0),
    mime: text("mime").notNull(), // 'image/jpeg'
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ocr_page_images_run_page_tile_uniq").on(
      t.importRunId,
      t.page,
      t.tile,
    ),
    index("ocr_page_images_run_idx").on(t.importRunId),
  ],
);

export type ImportRow = {
  fixtureCode: string;
  quantity: number | null;
  brandText: string | null;
  productText: string | null;
  zone?: string | null;
  specs?: Partial<{
    kelvin: number;
    cri: number;
    ip: string;
    watt: number;
    lumen: number;
    beamAngle: number;
    sizeCm: number;
    shape: string;
    color: string;
    dimmable: string;
  }>;
  source: "pdf" | "ocr" | "llm" | "csv" | "bestek";
  rawText?: string;
  page?: number;
  checked: boolean; // OCR/LLM standaard uitgevinkt (B-04)
};

// H-08: blauw-merken-inlaadwachtrij met frequentie (dossiers × regels).
export const brandLoadQueue = pgTable(
  "brand_load_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandKey: text("brand_key").notNull(), // genormaliseerd (lowercase, alfanumeriek)
    displayName: text("display_name").notNull(),
    frequency: integer("frequency").notNull().default(1),
    status: text("status").notNull().default("wachtend"), // 'wachtend' | 'ingeladen'
    loadedAt: timestamp("loaded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("brand_load_queue_key_uniq").on(t.brandKey)],
);

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  // A-09/A-10: kopblok. Nummer BL-{jaar}-{4 cijfers}; teller verhoogt pas bij
  // uitsturen/print — niet bij elke render.
  quoteNumber: text("quote_number"),
  customer: text("customer"),
  contactName: text("contact_name"),
  address: text("address"),
  projectRef: text("project_ref"),
  authorEmail: text("author_email"),
  quoteDate: date("quote_date"),
  validUntil: date("valid_until"),
  // I-06/E-09: na uitsturen is de estimate bevroren (kopblok + aantallen op slot).
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  xisProjectId: text("xis_project_id"),
  ...timestamps,
});

export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  specLineId: uuid("spec_line_id").references(() => specLines.id),
  productId: uuid("product_id").references(() => products.id),
  productName: text("product_name").notNull(), // snapshot op moment van offerte
  fixtureCode: text("fixture_code").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  // 0007 (laag 4): prijsherkomst — de offerte documenteert zelf uit welke prijslijst
  // z'n prijs kwam, onafhankelijk van wat er later met prices/archive gebeurt.
  priceListId: uuid("price_list_id").references(() => priceLists.id),
  sourceListDate: date("source_list_date"),
  ...timestamps,
});

// ── Event-log (regel 5: vanaf dag één) ───────────────────────────────────────
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity: text("entity").notNull(), // 'spec_line' | 'product' | 'dossier' | 'quote'
  entityId: uuid("entity_id"),
  action: text("action").notNull(), // 'search' | 'match' | 'no_match' | 'quote_generated' | ...
  actor: text("actor").notNull().default("system"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// De view `visible_products` wordt in db/migrations/0001 (hand-geschreven) aangemaakt:
//   product ⨝ prices ⨝ price_lists WHERE valid_from <= now <= valid_until.
// `.existing()` → drizzle-kit genereert hier GEEN DDL; de migratie is de bron van waarheid.
// Alle zoekopdrachten gaan via lib/repo/products.ts, dat uitsluitend deze view raadpleegt.
export const visibleProducts = pgView("visible_products", {
  id: uuid("id"),
  articleCode: text("article_code"),
  name: text("name"),
  brandId: uuid("brand_id"),
  brandName: text("brand_name"),
  supplierArticleCode: text("supplier_article_code"),
  categoryId: uuid("category_id"),
  categoryPath: text("category_path"),
  description: text("description"),
  lumenOutput: integer("lumen_output"),
  maxWattage: numeric("max_wattage", { precision: 8, scale: 2 }),
  kelvin: integer("kelvin"),
  cri: smallint("cri"),
  ipValue: text("ip_value"),
  beamAngle: numeric("beam_angle", { precision: 6, scale: 2 }),
  dimmable: text("dimmable"),
  lightSource: text("light_source"),
  heightCm: numeric("height_cm", { precision: 8, scale: 2 }),
  widthCm: numeric("width_cm", { precision: 8, scale: 2 }),
  lengthCm: numeric("length_cm", { precision: 8, scale: 2 }),
  diameterCm: numeric("diameter_cm", { precision: 8, scale: 2 }),
  color1: text("color_1"),
  material1: text("material_1"),
  tier2Source: jsonb("tier2_source").$type<Record<string, string>>(),
  warrantyMonths: integer("warranty_months"),
  repairability: text("repairability"),
  epdLifetimeHours: integer("epd_lifetime_hours"),
  countryOfOrigin: text("country_of_origin"),
  status: text("status"),
  grossPrice: numeric("gross_price", { precision: 12, scale: 2 }),
  currency: text("currency"),
  priceListId: uuid("price_list_id"),
  validUntil: date("valid_until"),
}).existing();

// visible_specs (J-01): productspecs LOS van de prijs — voor de disclosure-productkaart,
// waar tier 2 wél de specs toont maar de prijs gated is. Toont actieve producten met hun
// merk-disclosure-tier; géén prijskolom (die loopt via visible_products, regel 3 blijft).
export const visibleSpecs = pgView("visible_specs", {
  id: uuid("id"),
  articleCode: text("article_code"),
  name: text("name"),
  brandId: uuid("brand_id"),
  brandName: text("brand_name"),
  disclosureTier: disclosureTier("disclosure_tier"),
  categoryPath: text("category_path"),
  description: text("description"),
  lumenOutput: integer("lumen_output"),
  maxWattage: numeric("max_wattage", { precision: 8, scale: 2 }),
  kelvin: integer("kelvin"),
  cri: smallint("cri"),
  ipValue: text("ip_value"),
  beamAngle: numeric("beam_angle", { precision: 6, scale: 2 }),
  dimmable: text("dimmable"),
  color1: text("color_1"),
  tier2Source: jsonb("tier2_source").$type<Record<string, string>>(),
  warrantyMonths: integer("warranty_months"),
  repairability: text("repairability"),
  epdLifetimeHours: integer("epd_lifetime_hours"),
  countryOfOrigin: text("country_of_origin"),
  status: text("status"),
}).existing();

// ── XIS-koppeling (E-09…E-12, run 6) ─────────────────────────────────────────
// Zolang de Lynx-API er niet is: exportbestand in hetzelfde payload-formaat.
// Idempotent op dossier-id (external_reference) — herverzenden maakt geen duplicaat.
export const xisExports = pgTable("xis_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id").references(() => quotes.id),
  mode: text("mode").notNull().default("file"), // 'file' | 'api'
  environment: text("environment").notNull().default("sandbox"), // NFR 7: sandbox default
  status: text("status").notNull().default("aangemaakt"), // 'aangemaakt' | 'verzonden' | 'mislukt'
  xisProjectId: text("xis_project_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  response: jsonb("response").$type<Record<string, unknown>>(),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Gebruikers (L-02): allowlist 2–5 interne adressen, geen rollen ───────────
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Verrijking (H-03…H-09, run 5) ────────────────────────────────────────────
export const enrichmentRuns = pgTable("enrichment_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  brandName: text("brand_name").notNull(),
  status: text("status").notNull().default("steekproef"), // 'steekproef' | 'gepubliceerd' | 'afgewezen'
  counts: jsonb("counts").$type<Record<string, number>>(),
  sampleErrorRate: numeric("sample_error_rate", { precision: 5, scale: 4 }),
  actor: text("actor"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
});

// Eén rij = één gevuld veld op één product binnen een run; steekproef-items dragen
// een menselijk oordeel vóór publicatie (H-05).
export const enrichmentItems = pgTable("enrichment_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => enrichmentRuns.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(),
  field: text("field").notNull(), // 'kelvin' | 'maxWattage' | …
  value: text("value").notNull(),
  source: text("source").notNull(), // 'parsed-from-name' | 'llm'
  inSample: boolean("in_sample").notNull().default(false),
  sampleVerdict: text("sample_verdict"), // 'goed' | 'fout' | null
  applied: boolean("applied").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Evaluatieset (H-07, K-06): 50–100 echte regels = meetlat van de matcher ──
export const evaluationLines = pgTable("evaluation_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  fixtureCode: text("fixture_code").notNull(),
  brandText: text("brand_text"),
  productText: text("product_text"),
  specs: jsonb("specs").$type<Record<string, string | number>>(),
  expectedStatus: matchStatus("expected_status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const evaluationRuns = pgTable("evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  hitRate: numeric("hit_rate", { precision: 5, scale: 4 }).notNull(),
  results: jsonb("results").$type<
    { lineId: string; expected: string; got: string; hit: boolean }[]
  >(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Instellingen + LLM-budget (L-06) ─────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const llmUsage = pgTable("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(), // 'import' | 'zoek-fallback' | 'verrijking' | 'ocr'
  costEur: numeric("cost_eur", { precision: 8, scale: 4 }).notNull(),
  // B4: per-boek-som voor het €1-plafond. Nullable (bestaand gebruik heeft geen run);
  // set null bij run-delete — de kosten zijn gemaakt en blijven in het maandbudget tellen.
  importRunId: uuid("import_run_id").references(() => importRuns.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── H2: organisaties, memberships & rollen (L-03/04/05) ──────────────────────
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  branding: jsonb("branding").$type<Record<string, unknown>>(), // logo-url, accentkleur
  plan: text("plan").notNull().default("trial"), // L-05: prijsmodel (abonnement/per-dossier)
  seatLimit: integer("seat_limit"),
  ...timestamps,
});

// Eén persoon kan meerdere rollen (petten) in een org hebben. Koppelt op e-mail
// (net als allowed_emails); rol bepaalt de default-view, nooit wat de engine toont.
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roles: membershipRole("roles").array().notNull().default(sql`'{}'::membership_role[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("memberships_org_email_uniq").on(t.orgId, t.email)],
);

// ── H2: disclosure & merkrelaties (J-01…J-05) ────────────────────────────────
// Per-veld-uitzonderingen bovenop de disclosure-tier van het merk (J-04).
export const brandFieldVisibility = pgTable(
  "brand_field_visibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    field: text("field").notNull(), // productveld-naam, bv. 'max_wattage' of 'gross_price'
    visible: boolean("visible").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("brand_field_vis_uniq").on(t.brandId, t.field)],
);

// Prijsaanvraag-knop bij tier 2 = een lead (J-03).
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id),
  brandId: uuid("brand_id").references(() => brands.id),
  userEmail: text("user_email"),
  orgId: uuid("org_id").references(() => organizations.id),
  dossierId: uuid("dossier_id").references(() => projectDossiers.id),
  status: leadStatus("status").notNull().default("open"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── H2: staffelprijzen (I-05) ────────────────────────────────────────────────
// Stukprijs volgt aantal; drempel min_qty. In V1 doet XIS dit; hier het datamodel.
export const priceTiers = pgTable(
  "price_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    minQty: integer("min_qty").notNull().default(1),
    grossPrice: numeric("gross_price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("price_tiers_uniq").on(t.productId, t.priceListId, t.minQty)],
);

// ── H2: armaturenboek-versiebeheer (G-02) + datasheets (G-04) ────────────────
export const armaturenboekVersions = pgTable("armaturenboek_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  note: text("note"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>[]>().notNull(),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productDatasheets = pgTable("product_datasheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── H2: substitutievoorstel-document (F-06) ──────────────────────────────────
export const substitutionProposals = pgTable("substitution_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
  specLineId: uuid("spec_line_id").references(() => specLines.id, {
    onDelete: "set null",
  }),
  referenceProductId: uuid("reference_product_id").references(() => products.id),
  alternativeProductId: uuid("alternative_product_id").references(() => products.id),
  // veld-voor-veld origineel vs alternatief + duurzaamheidswinst + bron
  fields: jsonb("fields").$type<
    { field: string; reference: string | null; alternative: string | null; source: string }[]
  >(),
  savingNote: text("saving_note"), // besparing tonen (F-08), nooit als sortering
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── H3: merkportaal — één publicatiepad via staging → goedkeuring (H-11) ──────
export const brandUploads = pgTable("brand_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'pricelist' | 'data'
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: uploadStatus("status").notNull().default("staging"),
  submittedBy: text("submitted_by"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  ...timestamps,
});


// ── Merkrelaties (K2): 1-op-1 met brands, reads virtueel ─────────────────────
// Géén backfill: een merk zonder rij is per definitie 'niet_benaderd' (de repo
// COALESCE't bij het lezen — lezen schrijft nooit). Alleen upsertBrandRelation
// schrijft, via INSERT … ON CONFLICT (brand_id) DO UPDATE (race-vrij).
// Contactpersoon/e-mail staan hier en niet op suppliers: ander soort contact
// (data-inwinning, niet inkoop).
export const brandRelations = pgTable(
  "brand_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    status: brandRelationStatus("status").notNull().default("niet_benaderd"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    lastContactAt: date("last_contact_at"), // laatste contactmoment ("geen reactie"-filter)
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("brand_relations_brand_uniq").on(t.brandId)],
);

export type Product = typeof products.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type BrandAlias = typeof brandAliases.$inferSelect;
export type ProjectDossier = typeof projectDossiers.$inferSelect;
export type SpecLine = typeof specLines.$inferSelect;
export type SpecLineCandidate = typeof specLineCandidates.$inferSelect;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type ProjectStatus = (typeof projectStatus.enumValues)[number];
export type XisPhase = (typeof xisPhase.enumValues)[number];
export type QuoteLine = typeof quoteLines.$inferSelect;
export type ImportRun = typeof importRuns.$inferSelect;
export type OcrPageImage = typeof ocrPageImages.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipRole =
  (typeof membershipRole.enumValues)[number];
export type Lead = typeof leads.$inferSelect;
export type BrandUpload = typeof brandUploads.$inferSelect;
export type BrandRelation = typeof brandRelations.$inferSelect;
export type BrandRelationStatus =
  (typeof brandRelationStatus.enumValues)[number];
export type ArmaturenboekVersion = typeof armaturenboekVersions.$inferSelect;
export type SubstitutionProposal = typeof substitutionProposals.$inferSelect;
