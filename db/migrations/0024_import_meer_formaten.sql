-- Upload-vak → xlsx/csv/docx/beeld (docs/goal-import-meer-formaten.md, Bouwer A stap 1).
--
-- ⚠️ EIGEN BESTAND, ALLEEN DDL: `ALTER TYPE ... ADD VALUE` mag op Neon niet in dezelfde
-- transactie als DML die de nieuwe waarde gebruikt. Onze migrator (db/migrate.ts) voert
-- statements los uit over neon-http, maar de regel blijft: enum-uitbreiding nooit mengen
-- met INSERT/UPDATE — die horen in code of een vólgende migratie. Precedent: 0022.
ALTER TYPE spec_source ADD VALUE IF NOT EXISTS 'tabel';
--> statement-breakpoint
ALTER TYPE review_kind ADD VALUE IF NOT EXISTS 'tabel';
--> statement-breakpoint

-- Bronbestand van een tabel-import (xlsx/csv/docx), gechunkt opgeslagen à max 2 MB per
-- rij (Vercel's ~4,5 MB request-limiet blijft zo gerespecteerd) en max 8 chunks (15 MB
-- totaal — daarboven wordt het bestand niet opgeslagen, event source_file_skipped_too_large).
-- unique(import_run_id, chunk) is tegelijk het idempotentie-lock van de upload-loop
-- (B4-patroon uit de OCR-flow): een dubbel verstuurde chunk conflicteert en kost niets.
-- Cascade met de run: het bronbestand leeft even lang als zijn controlespoor.
CREATE TABLE IF NOT EXISTS import_source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  chunk integer NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS import_source_files_run_chunk_uniq
  ON import_source_files (import_run_id, chunk);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS import_source_files_run_idx
  ON import_source_files (import_run_id);
