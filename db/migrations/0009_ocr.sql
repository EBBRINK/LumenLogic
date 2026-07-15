-- Migratie 0009 (plan-ocr-beeld-pdf bouwstap 2, puur additief):
-- • ocr_page_images (B2): één rij per gerenderde pagina, bytes in bytea — de échte
--   bron van een OCR-import, cascade met de importrun. unique(import_run_id, page)
--   is tegelijk het per-pagina-lock uit B4 (éérst de beeldrij inserten; conflict =
--   pagina al bezig/gedaan → weigeren).
-- • llm_usage.import_run_id (B4): nullable, ON DELETE SET NULL — per-boek-som voor
--   het €1-plafond; kosten blijven in het maandbudget tellen als de run verdwijnt.
-- • import_runs.ocr_status (B5): text (zelfde stijl als `status`), null = geen OCR
--   (alle bestaande runs); 'bezig' | 'klaar' | 'gestopt'. Geen backfill nodig.
-- Handgeschreven, net als 0004+: de drizzle-snapshots stoppen bij 0003.
-- Nummer 0009: 0007 is gereserveerd voor de datamodel-branch, 0008 staat al op Neon.
CREATE TABLE ocr_page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  page integer NOT NULL,
  mime text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX ocr_page_images_run_page_uniq ON ocr_page_images(import_run_id, page);
--> statement-breakpoint
CREATE INDEX ocr_page_images_run_idx ON ocr_page_images(import_run_id);
--> statement-breakpoint
ALTER TABLE llm_usage ADD COLUMN import_run_id uuid REFERENCES import_runs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE import_runs ADD COLUMN ocr_status text;
