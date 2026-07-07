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
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────
export const disclosureTier = pgEnum("disclosure_tier", [
  "tier1",
  "tier2",
  "tier3",
]);
export const dossierPhase = pgEnum("dossier_phase", ["tender", "awarded"]);
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
export const products = pgTable("products", {
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
  ...timestamps,
});

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
    ...timestamps,
  },
  (t) => [uniqueIndex("price_lists_brand_uniq").on(t.brandId)], // één actieve lijst per merk (run 1)
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
    currency: text("currency").notNull().default("EUR"),
    ...timestamps,
  },
  (t) => [uniqueIndex("prices_product_list_uniq").on(t.productId, t.priceListId)],
);

// ── Dossier / calculatorflow ─────────────────────────────────────────────────
export const projectDossiers = pgTable("project_dossiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  customer: text("customer"),
  phase: dossierPhase("phase").notNull().default("tender"), // default = veilig (regel 4)
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
  ...timestamps,
});

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
  purpose: text("purpose").notNull(), // 'import' | 'zoek-fallback' | 'verrijking'
  costEur: numeric("cost_eur", { precision: 8, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type ProjectDossier = typeof projectDossiers.$inferSelect;
export type SpecLine = typeof specLines.$inferSelect;
export type SpecLineCandidate = typeof specLineCandidates.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type ImportRun = typeof importRuns.$inferSelect;
