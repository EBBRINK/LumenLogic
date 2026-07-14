-- Migratie 0008 (plan-merkrelaties stap 2, puur additief):
-- • brand_relation_status: zes statussen (K1) — vrij muteerbaar, geen state-machine;
--   "geen reactie" is een filter, geen status.
-- • brand_relations: 1-op-1 met brands (unique op brand_id). Géén backfill — een merk
--   zonder rij is 'niet_benaderd' (de repo COALESCE't bij lezen; lezen schrijft nooit).
-- Handgeschreven, net als 0004–0007: de drizzle-snapshots stoppen bij 0003.
-- Nummer 0008 (niet 0007 uit het plan): 0007_datamodel_productspecs bestaat al in de tree.
CREATE TYPE brand_relation_status AS ENUM ('niet_benaderd', 'benaderd', 'wacht_op_data', 'data_ontvangen', 'verwerkt', 'afgewezen');
--> statement-breakpoint
CREATE TABLE brand_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  status brand_relation_status NOT NULL DEFAULT 'niet_benaderd',
  contact_name text,
  contact_email text,
  last_contact_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX brand_relations_brand_uniq ON brand_relations(brand_id);
