-- H2/H3 (latere horizon): organisaties & rollen, dossier-lifecycle, disclosure &
-- merkrelaties, staffelprijzen, armaturenboek-versies + datasheets, substitutie-
-- voorstellen, merkportaal-staging, en de disclosure/aggregatie-views.
-- Bron: docs/MASTERPLAN.md §7 + docs/FUNCTIONEEL-ONTWERP.md §1 (⏳-features).
CREATE TYPE membership_role AS ENUM ('calculator', 'werkvoorbereider', 'projectleider', 'org_admin');
--> statement-breakpoint
CREATE TYPE dossier_lifecycle AS ENUM ('actief', 'delivered', 'archived');
--> statement-breakpoint
CREATE TYPE lead_status AS ENUM ('open', 'opgevolgd', 'gesloten');
--> statement-breakpoint
CREATE TYPE upload_status AS ENUM ('staging', 'approved', 'rejected');
--> statement-breakpoint
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  branding jsonb,
  plan text NOT NULL DEFAULT 'trial',
  seat_limit integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  roles membership_role[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memberships_org_email_uniq ON memberships(org_id, email);
--> statement-breakpoint
ALTER TABLE project_dossiers
  ADD COLUMN org_id uuid REFERENCES organizations(id),
  ADD COLUMN lifecycle dossier_lifecycle NOT NULL DEFAULT 'actief',
  ADD COLUMN archived_reason text,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN delivered_at timestamptz;
--> statement-breakpoint
ALTER TABLE spec_lines ADD COLUMN location text;
--> statement-breakpoint
CREATE TABLE brand_field_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  field text NOT NULL,
  visible boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX brand_field_vis_uniq ON brand_field_visibility(brand_id, field);
--> statement-breakpoint
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  brand_id uuid REFERENCES brands(id),
  user_email text,
  org_id uuid REFERENCES organizations(id),
  dossier_id uuid REFERENCES project_dossiers(id),
  status lead_status NOT NULL DEFAULT 'open',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  min_qty integer NOT NULL DEFAULT 1,
  gross_price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX price_tiers_uniq ON price_tiers(product_id, price_list_id, min_qty);
--> statement-breakpoint
CREATE TABLE armaturenboek_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES project_dossiers(id) ON DELETE CASCADE,
  version integer NOT NULL,
  note text,
  snapshot jsonb NOT NULL,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE product_datasheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE substitution_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES project_dossiers(id) ON DELETE CASCADE,
  spec_line_id uuid REFERENCES spec_lines(id) ON DELETE SET NULL,
  reference_product_id uuid REFERENCES products(id),
  alternative_product_id uuid REFERENCES products(id),
  fields jsonb,
  saving_note text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE brand_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status upload_status NOT NULL DEFAULT 'staging',
  submitted_by text,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- visible_specs (J-01): specs los van prijs voor de disclosure-productkaart.
CREATE VIEW visible_specs AS
SELECT
  p.id,
  p.article_code,
  p.name,
  p.brand_id,
  p.brand_name,
  b.disclosure_tier,
  p.category_path,
  p.description,
  p.lumen_output,
  p.max_wattage,
  p.kelvin,
  p.cri,
  p.ip_value,
  p.beam_angle,
  p.dimmable,
  p.color_1,
  p.tier2_source,
  p.warranty_months,
  p.repairability,
  p.epd_lifetime_hours,
  p.country_of_origin,
  p.status
FROM products p
LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.status = 'actief';
--> statement-breakpoint
-- K-05: geaggregeerd merk-dashboard. Materialized view = de anonimiseringsgrens:
-- individuele events worden pas na aggregatie zichtbaar. Refresh handmatig/periodiek.
CREATE MATERIALIZED VIEW mv_brand_considerations AS
SELECT
  pr.brand_name,
  count(*) FILTER (WHERE e.action = 'product_considered') AS considered,
  count(*) FILTER (WHERE e.action = 'spec_line_matched') AS chosen
FROM events e
JOIN products pr ON pr.id = (e.payload->>'productId')::uuid
WHERE e.payload ? 'productId'
GROUP BY pr.brand_name;
--> statement-breakpoint
CREATE UNIQUE INDEX mv_brand_considerations_brand ON mv_brand_considerations(brand_name);
