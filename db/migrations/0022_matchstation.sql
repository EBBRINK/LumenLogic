-- Sprint M1 (docs/plan-matchstation-eigen-machine.md): de wachtrij + claim/heartbeat
-- voor het matchstation, en de twee nieuwe review-redenen die het terugstuur-endpoint
-- kan zetten (docs/goal-agent-matching.md, contract-tabel).
--
-- Twee ALTER TYPE ADD VALUE hieronder — bewust, met de afweging: migratie 0006 koos
-- destijds "geen ALTER TYPE ADD VALUE, alles nieuw" voor project_status/xis_phase, maar
-- dat waren twee GEHEEL NIEUWE kolommen zonder bestaande data. review_kind heeft al
-- rijen en drie code-plekken (review.ts, review-queue-scherm) die op de vier bestaande
-- waarden matchen; een nieuwe enum + kolom-migratie zou al die plekken moeten leren
-- weten dat de oude kolom nog kan voorkomen. ALTER TYPE ... ADD VALUE is op Postgres 12+
-- (Neon) een gewone, niet-blokkerende DDL-operatie buiten een transactie — precies wat
-- hier gebeurt, één statement per waarde. Wie hier liever een aparte tekstkolom voor
-- machine-subtypes had gezien: dat kan alsnog, dit is de kleinere ingreep.
ALTER TYPE review_kind ADD VALUE IF NOT EXISTS 'onzeker';
--> statement-breakpoint
ALTER TYPE review_kind ADD VALUE IF NOT EXISTS 'niet_beoordeeld';
--> statement-breakpoint

-- De wachtrij zelf. Status bewust text (zelfde reden als import_runs.ocr_status: een
-- pg-enum-wijziging kost op Neon een aparte ALTER TYPE, en dit is interne voortgang,
-- geen klantzichtbare waarde). 'wachtend' | 'geclaimd' | 'verwerkt'.
CREATE TABLE IF NOT EXISTS matchstation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES project_dossiers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'wachtend',
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by text,
  claimed_at timestamptz,
  lease_until timestamptz,
  result_received_at timestamptz,
  dead_alert_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS matchstation_queue_status_idx
  ON matchstation_queue (status, enqueued_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS matchstation_queue_dossier_idx
  ON matchstation_queue (dossier_id);
--> statement-breakpoint

-- Eigen kostenplafond (M1-eis 4): los van OCR_MAX_EUR_PER_RUN, dat vandaag alle
-- llm_usage van één import_run_id sommeert zonder purpose-filter (lib/ai/ocr.ts:557-566).
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS matchstation_job_id uuid
  REFERENCES matchstation_queue(id) ON DELETE SET NULL;
