-- Migratie 0019 (sprint 3.1, onboarding externen — puur additief):
-- ⚠️ Heette 0017 tot de rebase op main van 3 aug 2026; sprint 2.5b had 0017 en 0018 toen al
--    ingenomen. Hernummerd omdat deze migratie nog niet gedeployd was.
-- • `organizations.type` (besluit G31): het INLOGTYPE hoort bij de organisatie, niet bij de
--   persoon. `membership_role` blijft onveranderd "welke pet draag je binnen je org";
--   org_type zegt wie je bent tegenover Brink. "Intern super admin" uit de G21-kaart is
--   dus een org_admin-membership in de org met type 'intern'.
--   Default 'extern' — ijzeren regel 4, default = veilig: een organisatie die per ongeluk
--   zonder type wordt aangemaakt krijgt het minst bevoorrechte type, nooit 'intern'.
-- • De Brink-org zelf. Idempotent op slug via WHERE NOT EXISTS en niet via ON CONFLICT:
--   organizations heeft géén unique constraint op slug (0005_h2_h3.sql), dus er valt niets
--   te conflicteren. Deze INSERT landt óók in een verse test-DB — net als de allowlist-seed
--   van 0004 — zodat productie en test op precies dezelfde migratie draaien.
-- • De bestaande dossiers zonder org (13 op productie op 30 jul 2026, 0 in een verse
--   test-DB) gaan naar de Brink-org. `project_dossiers.org_id` draagt in de database wél
--   een FK naar organizations(id) (0005_h2_h3.sql:34-35) terwijl db/schema.ts die
--   `.references()` mist; die mismatch hoort bij 3.2a en wordt hier NIET gerepareerd.
-- • Memberships voor de bestaande gebruikers: de drie gemeten adressen zijn Brink-kant
--   (Timo tweemaal, Eduard eenmaal), dus alle drie org_admin in de interne org. De adressen
--   staan expliciet in de SQL en er wordt getoetst dat de user-rij écht bestaat; op een
--   verse test-DB raakt deze INSERT dus nul rijen.
--   `plan` blijft bewust op de kolomdefault 'trial': trial/abonnement/per-dossier is het
--   prijsmodel (L-05) en de interne org hoort in geen van die drie thuis — een vierde,
--   nergens bestaande waarde 'intern' verzinnen is rommel, geen betekenis.
-- • `activation_pins` (C10/G34): de tijdelijke PIN waarmee een genodigde zijn wachtwoord
--   zet. De primary key op e-mail ÍS de regel "één actieve PIN per gebruiker" — een
--   nieuwe PIN overschrijft de oude, geldig of verlopen. Alleen de scrypt-hash wordt
--   bewaard; de klaartekst bestaat exact één keer, in het antwoord van
--   issueActivationPin(). Koppelt op e-mail (net als memberships en allowed_emails),
--   niet op user.id: een PIN kan al bestaan voordat iemand ooit inlogt, en de rest van
--   deze codebase koppelt personen ook op adres.
-- Élk statement hieronder is idempotent, ook de DDL. db/migrate.ts draait een migratie maar
-- één keer (tabel __migrations), dus strikt genomen hoeft dat niet — maar zo is de migratie
-- als geheel opnieuw uit te voeren en toetst db/migration-0017.test.ts de échte SQL twee keer
-- in plaats van een overgetypte kopie ervan.
-- Handgeschreven, net als 0004-0016: de drizzle-snapshots stoppen bij 0003.
DO $$ BEGIN
  CREATE TYPE org_type AS ENUM ('intern', 'extern', 'brand');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type org_type NOT NULL DEFAULT 'extern';
--> statement-breakpoint
INSERT INTO organizations (name, slug, type)
SELECT 'Brink Licht', 'brink-licht', 'intern'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'brink-licht');
--> statement-breakpoint
UPDATE project_dossiers
SET org_id = (SELECT id FROM organizations WHERE slug = 'brink-licht')
WHERE org_id IS NULL;
--> statement-breakpoint
-- Expliciete adreslijst, géén cross join over de hele user-tabel. Dat maakt de aanname hard:
-- dít zijn de drie gemeten user-rijen van 30 jul 2026 en zij zijn alle drie Brink-kant.
-- Een kale `FROM organizations o, "user" u` zou élke user-rij die op het moment van deploy
-- bestaat tot org_admin van de interne org promoveren — valt deploy 1 later dan de eerste
-- PIN-uitgifte, dan is dat een externe installateur met beheerrechten.
INSERT INTO memberships (org_id, email, roles)
SELECT o.id, u.email, ARRAY['org_admin']::membership_role[]
FROM organizations o
CROSS JOIN (VALUES
  ('hello@noplasticfloralfoam.com'),
  ('timo@jouwainstein.com'),
  ('e.brink@brinklicht.nl')
) AS u(email)
WHERE o.slug = 'brink-licht'
  AND EXISTS (SELECT 1 FROM "user" bestaand WHERE lower(btrim(bestaand.email)) = u.email)
ON CONFLICT (org_id, email) DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS activation_pins (
  email text PRIMARY KEY,
  pin_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- De applicatie normaliseert elk adres (trim + lowercase) vóór het schrijven; deze CHECK
  -- is de achtervang, zodat "Timo@X" en "timo@x" nooit twee PIN-rijen kunnen worden en de
  -- regel "één actieve PIN per gebruiker" niet op waakzaamheid berust.
  CONSTRAINT activation_pins_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT activation_pins_email_not_empty CHECK (btrim(email) <> ''),
  CONSTRAINT activation_pins_attempts_nonneg CHECK (attempts >= 0)
);
