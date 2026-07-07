-- Run 4: vijfstatussen-regelset in de kern (masterplan §3/§5, functioneel ontwerp §1-§5).
-- • spec_lines: status-enum open/groen/geel/blauw/rood/paars + review-, herkomst-,
--   afwijkings-, zone-, dagprijs- en extra spec-velden (B-07/B-09/C-07/D-01/I-04/A-07/A-08)
-- • spec_line_candidates (C-10), import_runs (B-06), brand_load_queue (H-08),
--   xis_exports (E-12), allowed_emails (L-02), enrichment_* (H-03…H-09),
--   evaluation_* (H-07), app_settings + llm_usage (L-06)
-- • quotes: kopblok + bevriezen (A-09/A-10/I-06); products.tier2_source (H-09)
-- • visible_products opnieuw mét beam/afmetingen/kleur/materiaal/tier2_source
CREATE TYPE match_status AS ENUM ('open', 'groen', 'geel', 'blauw', 'rood', 'paars');
--> statement-breakpoint
CREATE TYPE spec_source AS ENUM ('manual', 'csv', 'pdf', 'ocr', 'llm');
--> statement-breakpoint
CREATE TYPE review_kind AS ENUM ('geel', 'variant', 'onvolledig', 'ocr');
--> statement-breakpoint
ALTER TABLE spec_lines ADD COLUMN status_new match_status NOT NULL DEFAULT 'open';
--> statement-breakpoint
UPDATE spec_lines SET status_new = CASE status::text
  WHEN 'matched' THEN 'groen'::match_status
  WHEN 'no_match' THEN 'rood'::match_status
  ELSE 'open'::match_status END;
--> statement-breakpoint
ALTER TABLE spec_lines DROP COLUMN status;
--> statement-breakpoint
ALTER TABLE spec_lines RENAME COLUMN status_new TO status;
--> statement-breakpoint
DROP TYPE IF EXISTS spec_line_status;
--> statement-breakpoint
ALTER TABLE spec_lines ALTER COLUMN quantity DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE spec_lines ALTER COLUMN quantity DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE spec_lines
  ADD COLUMN zone text,
  ADD COLUMN req_watt numeric(8,2),
  ADD COLUMN req_lumen integer,
  ADD COLUMN req_beam_angle numeric(6,2),
  ADD COLUMN req_size_cm numeric(8,2),
  ADD COLUMN req_shape text,
  ADD COLUMN req_color text,
  ADD COLUMN req_dimmable text,
  ADD COLUMN deviations jsonb,
  ADD COLUMN source spec_source NOT NULL DEFAULT 'manual',
  ADD COLUMN source_confidence text,
  ADD COLUMN source_page integer,
  ADD COLUMN import_run_id uuid,
  ADD COLUMN review_kind review_kind,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by text,
  ADD COLUMN review_decision text,
  ADD COLUMN review_reason text,
  ADD COLUMN no_match_reason text,
  ADD COLUMN manual_price numeric(12,2),
  ADD COLUMN manual_price_valid_until date,
  ADD COLUMN manual_price_set_by text;
--> statement-breakpoint
CREATE TABLE spec_line_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_line_id uuid NOT NULL REFERENCES spec_lines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  rank integer NOT NULL,
  list text NOT NULL,
  score numeric(8,4),
  verdicts jsonb,
  chosen boolean NOT NULL DEFAULT false,
  chosen_by text,
  chosen_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX spec_line_candidates_line_idx ON spec_line_candidates(spec_line_id);
--> statement-breakpoint
CREATE TABLE import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES project_dossiers(id) ON DELETE CASCADE,
  source text NOT NULL,
  filename text,
  confidence text,
  status text NOT NULL DEFAULT 'voorstel',
  rows jsonb NOT NULL,
  counts jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE brand_load_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key text NOT NULL,
  display_name text NOT NULL,
  frequency integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'wachtend',
  loaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX brand_load_queue_key_uniq ON brand_load_queue(brand_key);
--> statement-breakpoint
ALTER TABLE quotes
  ADD COLUMN quote_number text,
  ADD COLUMN customer text,
  ADD COLUMN contact_name text,
  ADD COLUMN address text,
  ADD COLUMN project_ref text,
  ADD COLUMN author_email text,
  ADD COLUMN quote_date date,
  ADD COLUMN valid_until date,
  ADD COLUMN frozen_at timestamptz,
  ADD COLUMN xis_project_id text;
--> statement-breakpoint
CREATE TABLE xis_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES project_dossiers(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id),
  mode text NOT NULL DEFAULT 'file',
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'aangemaakt',
  xis_project_id text,
  payload jsonb NOT NULL,
  response jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE allowed_emails (
  email text PRIMARY KEY,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO allowed_emails (email, added_by) VALUES
  ('hello@noplasticfloralfoam.com', 'migratie-0004'),
  ('timo@jouwainstein.com', 'migratie-0004')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN tier2_source jsonb;
--> statement-breakpoint
CREATE TABLE enrichment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  brand_name text NOT NULL,
  status text NOT NULL DEFAULT 'steekproef',
  counts jsonb,
  sample_error_rate numeric(5,4),
  actor text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE enrichment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES enrichment_runs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  source text NOT NULL,
  in_sample boolean NOT NULL DEFAULT false,
  sample_verdict text,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX enrichment_items_run_idx ON enrichment_items(run_id);
--> statement-breakpoint
CREATE TABLE evaluation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_code text NOT NULL,
  brand_text text,
  product_text text,
  specs jsonb,
  expected_status match_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  hit_rate numeric(5,4) NOT NULL,
  results jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  cost_eur numeric(8,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DROP VIEW IF EXISTS visible_products;
--> statement-breakpoint
CREATE VIEW visible_products AS
SELECT
  p.id,
  p.article_code,
  p.name,
  p.brand_id,
  p.brand_name,
  p.supplier_article_code,
  p.category_id,
  p.category_path,
  p.description,
  p.lumen_output,
  p.max_wattage,
  p.kelvin,
  p.cri,
  p.ip_value,
  p.beam_angle,
  p.dimmable,
  p.light_source,
  p.height_cm,
  p.width_cm,
  p.length_cm,
  p.diameter_cm,
  p.color_1,
  p.material_1,
  p.tier2_source,
  p.warranty_months,
  p.repairability,
  p.epd_lifetime_hours,
  p.country_of_origin,
  p.status,
  pr.gross_price,
  pr.currency,
  pr.price_list_id,
  pl.valid_until
FROM products p
JOIN prices pr ON pr.product_id = p.id
JOIN price_lists pl ON pl.id = pr.price_list_id
WHERE pl.valid_from <= CURRENT_DATE
  AND pl.valid_until >= CURRENT_DATE;
