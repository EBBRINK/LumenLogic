-- Migratie 0007 (plan-datamodel-productspecs, fase 3 — puur additief + indexwissel):
-- • products: natuurlijke sleutel (brand_id, supplier_article_code) UNIEK — dedupe-check
--   op productie gaf 0 duplicaten en 0 lege waarden (2026-07-14). NULLs blijven toegestaan
--   (onbekend ≠ conflict; Postgres-default NULLS DISTINCT).
-- • products: volledige veldcatalogus als kolommen (B4: schema nú, gefaseerd vullen).
--   Alles nullable; herkomst blijft via tier2_source lopen.
-- • prices.purchase_price (🔒 intern): inkoop hoort bij de prijslijst-regel, nooit in views.
-- • price_lists: van "één lijst per merk ooit" naar "één ACTIEVE lijst per merk" —
--   unique op brand_id wordt partieel (WHERE replaced_at IS NULL), zodat vervangen
--   lijsten als metadata blijven bestaan voor quote_lines.price_list_id.
-- • archive-schema + archive.prices_archive (SCD type 4, append-only, bewust géén FK's:
--   archief mag nooit een delete/wijziging in de hot tabellen blokkeren).
-- • quote_lines: price_list_id + source_list_date — de offerte documenteert zelf uit
--   welke lijst z'n prijs kwam (laag 4, auditwaarborg).

-- ── products: unieke natuurlijke sleutel ─────────────────────────────────────
CREATE UNIQUE INDEX products_brand_sac_uniq
  ON products (brand_id, supplier_article_code);
--> statement-breakpoint

-- ── products: bucket 1 — basis & identiteit ──────────────────────────────────
ALTER TABLE products
  ADD COLUMN name_en text,
  ADD COLUMN description_en text,
  ADD COLUMN ean_code text,
  ADD COLUMN family text,
  ADD COLUMN designer text,
  ADD COLUMN etim_class text;
--> statement-breakpoint

-- ── products: bucket 2 — commercie-vlaggen (🔒 stock; webvlaggen) ────────────
ALTER TABLE products
  ADD COLUMN stock integer,
  ADD COLUMN stock_reserved integer,
  ADD COLUMN show_on_web text,
  ADD COLUMN show_price_on_web boolean;
--> statement-breakpoint

-- ── products: bucket 3 — zaagmaten ───────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN cutting_size_height_cm numeric(8,2),
  ADD COLUMN cutting_size_width_cm numeric(8,2),
  ADD COLUMN cutting_size_length_cm numeric(8,2),
  ADD COLUMN cutting_size_diameter_cm numeric(8,2);
--> statement-breakpoint

-- ── products: bucket 4 — tweede kleur/materiaal ──────────────────────────────
ALTER TABLE products
  ADD COLUMN color_2 text,
  ADD COLUMN material_2 text;
--> statement-breakpoint

-- ── products: bucket 5 — lichtbron & fitting ─────────────────────────────────
ALTER TABLE products
  ADD COLUMN light_source_system text,
  ADD COLUMN light_source_included boolean,
  ADD COLUMN lamp_foot text,
  ADD COLUMN lamp_category text;
--> statement-breakpoint

-- ── products: bucket 6 — fotometrie ──────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN sdcm smallint,
  ADD COLUMN efficacy numeric(6,1),
  ADD COLUMN ugr text,
  ADD COLUMN lifetime_rating text,
  ADD COLUMN system_lumen integer,
  ADD COLUMN module_lumen integer,
  ADD COLUMN light_distribution text;
--> statement-breakpoint

-- ── products: bucket 7 — elektrisch / driver ─────────────────────────────────
ALTER TABLE products
  ADD COLUMN dim_protocol text,
  ADD COLUMN system_wattage numeric(8,2),
  ADD COLUMN led_wattage numeric(8,2),
  ADD COLUMN drive_current text,
  ADD COLUMN forward_voltage numeric(6,1),
  ADD COLUMN nominal_voltage text,
  ADD COLUMN driver_type text,
  ADD COLUMN power_factor numeric(4,2),
  ADD COLUMN standby_power numeric(6,2);
--> statement-breakpoint

-- ── products: bucket 8 — bescherming & conformiteit ──────────────────────────
ALTER TABLE products
  ADD COLUMN protection_class text,
  ADD COLUMN ik_rating text,
  ADD COLUMN energy_label text,
  ADD COLUMN emergency boolean,
  ADD COLUMN ambient_temp text,
  ADD COLUMN flammable_mount boolean;
--> statement-breakpoint

-- ── products: bucket 9 — documentatie / links ────────────────────────────────
ALTER TABLE products
  ADD COLUMN url_datasheet text,
  ADD COLUMN url_supplier_page text,
  ADD COLUMN url_install_manual text,
  ADD COLUMN url_photometry text,
  ADD COLUMN url_declaration text;
--> statement-breakpoint

-- ── prices: inkoopprijs (🔒 intern-only, komt in géén enkele view) ───────────
ALTER TABLE prices ADD COLUMN purchase_price numeric(12,2);
--> statement-breakpoint

-- ── price_lists: één ACTIEVE lijst per merk (vervangen lijsten blijven) ──────
ALTER TABLE price_lists ADD COLUMN replaced_at timestamptz;
--> statement-breakpoint
DROP INDEX price_lists_brand_uniq;
--> statement-breakpoint
CREATE UNIQUE INDEX price_lists_brand_active_uniq
  ON price_lists (brand_id) WHERE replaced_at IS NULL;
--> statement-breakpoint

-- ── archive: koude opslag, append-only, geen FK's ────────────────────────────
CREATE SCHEMA IF NOT EXISTS archive;
--> statement-breakpoint
CREATE TABLE archive.prices_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_price_id uuid NOT NULL,
  product_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  price_list_name text,
  brand_id uuid,
  gross_price numeric(12,2) NOT NULL,
  purchase_price numeric(12,2),
  currency text NOT NULL DEFAULT 'EUR',
  valid_from date,
  valid_until date,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by text
);
--> statement-breakpoint
CREATE INDEX prices_archive_product_idx ON archive.prices_archive (product_id);
--> statement-breakpoint
CREATE INDEX prices_archive_list_idx ON archive.prices_archive (price_list_id);
--> statement-breakpoint

-- ── quote_lines: prijsherkomst vastklikken (laag 4) ──────────────────────────
ALTER TABLE quote_lines
  ADD COLUMN price_list_id uuid REFERENCES price_lists(id),
  ADD COLUMN source_list_date date;
