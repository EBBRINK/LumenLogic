-- Migratie 0006 (plan-aanvraag-estimate B6 + stap 3, puur additief):
-- • project_dossiers: status (commerciële ladder) + xis_phase (taal van Brink),
--   met backfill van bestaande dossiers. `phase` blijft de bron van waarheid
--   en de veiligheidsschakelaar (regel 4) tot bouwstap 4 — hier ongewijzigd.
-- • import_runs.raw_markdown (B2): PDF→markdown-controlespoor.
-- • ai_suggestions (B4): AI-vangnet-suggesties met rationale + tokenverbruik.
-- Geen ALTER TYPE ADD VALUE op bestaande enums; alles nieuw.
CREATE TYPE project_status AS ENUM ('concept', 'estimate_gestuurd', 'offerte', 'gegund', 'niet_gegund', 'archief');
--> statement-breakpoint
CREATE TYPE xis_phase AS ENUM ('start', 'engineering', 'calculations', 'presenting', 'tender', 'deal_making', 'deliver', 'aftersales', 'win', 'lost');
--> statement-breakpoint
-- Default xis_phase = 'start' (bewust ≠ plan-tekst 'tender'): een nieuw project begint
-- vóór XIS Start — de estimate komt eerder dan de tender. De veilige engine-stand blijft
-- geregeld via `phase` default 'tender'; bestaande dossiers backfillen hieronder wél
-- naar 'tender'/'deal_making', want die zitten feitelijk al in die fase.
ALTER TABLE project_dossiers
  ADD COLUMN status project_status NOT NULL DEFAULT 'concept',
  ADD COLUMN xis_phase xis_phase NOT NULL DEFAULT 'start';
--> statement-breakpoint
-- Backfill status: archived → archief; delivered → gegund; actief mét bevroren
-- (= uitgestuurde) estimate → estimate_gestuurd; overig actief → concept.
UPDATE project_dossiers d SET status = CASE
  WHEN d.lifecycle = 'archived' THEN 'archief'::project_status
  WHEN d.lifecycle = 'delivered' THEN 'gegund'::project_status
  WHEN EXISTS (
    SELECT 1 FROM quotes q WHERE q.dossier_id = d.id AND q.frozen_at IS NOT NULL
  ) THEN 'estimate_gestuurd'::project_status
  ELSE 'concept'::project_status
END;
--> statement-breakpoint
-- Backfill xis_phase: awarded → deal_making; anders tender (bestaande dossiers zitten
-- feitelijk in de tenderfase — alleen níéuwe projecten krijgen de default 'start').
-- `phase` zelf wordt hier bewust NIET gewijzigd (bron van waarheid tot bouwstap 4).
UPDATE project_dossiers SET xis_phase = CASE
  WHEN phase = 'awarded' THEN 'deal_making'::xis_phase
  ELSE 'tender'::xis_phase
END;
--> statement-breakpoint
ALTER TABLE import_runs ADD COLUMN raw_markdown text;
--> statement-breakpoint
CREATE TABLE ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_line_id uuid NOT NULL REFERENCES spec_lines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  rationale text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by text
);
--> statement-breakpoint
CREATE INDEX ai_suggestions_line_idx ON ai_suggestions(spec_line_id);
