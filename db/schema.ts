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
export const specLineStatus = pgEnum("spec_line_status", [
  "open",
  "matched",
  "no_match",
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
  quantity: integer("quantity").notNull().default(1),
  description: text("description"),
  brandText: text("brand_text"), // gevraagd merk (vrije tekst)
  productText: text("product_text"), // gevraagd type (vrije tekst)
  reqKelvin: integer("req_kelvin"),
  reqCri: integer("req_cri"),
  reqIp: text("req_ip"),
  matchedProductId: uuid("matched_product_id").references(() => products.id),
  status: specLineStatus("status").notNull().default("open"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dossierId: uuid("dossier_id")
    .notNull()
    .references(() => projectDossiers.id, { onDelete: "cascade" }),
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
  kelvin: integer("kelvin"),
  cri: smallint("cri"),
  ipValue: text("ip_value"),
  dimmable: text("dimmable"),
  status: text("status"),
  grossPrice: numeric("gross_price", { precision: 12, scale: 2 }),
  currency: text("currency"),
  priceListId: uuid("price_list_id"),
  validUntil: date("valid_until"),
}).existing();

export type Product = typeof products.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type ProjectDossier = typeof projectDossiers.$inferSelect;
export type SpecLine = typeof specLines.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
