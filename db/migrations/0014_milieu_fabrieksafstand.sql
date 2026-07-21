-- Migratie 0014 (sprint 1.7, milieuvelden — puur additief):
-- • Twee kolommen, geen aparte `brand_factories`-tabel: één fabriekslocatie per merk is
--   vandaag de werkelijkheid, en een 1-op-1-tabel voor twee velden voegt niets toe.
-- • `factory_location text` is het FEIT van het merk (Brink's eigen opgave); `factory_
--   distance_km integer` is ONZE berekening tegen het Brink-adres (lib/brink.ts). Die
--   scheiding staat ook zo in het commentaar bij de kolommen in db/schema.ts.
-- • Kolomdefault NULL, GEEN backfill — zelfde keuze als 0013: ADD COLUMN zonder default
--   is in PG metadata-only, geen table rewrite, geen UPDATE, updated_at blijft ongemoeid.
--   De 436 bestaande bronimport-merken worden dus niet aangeraakt.
-- • `integer`, geen `numeric`: sub-kilometerprecisie op een afstand van 200-1500 km is
--   schijnnauwkeurigheid. Precedent op `brands`: payment_term_days, delivery_time_days
--   zijn ook nullable integers zonder default.
-- • CHECK km > 0: 0 zou betekenen "de fabriek staat op het Brink-adres" — en elke 0 die
--   ooit binnenkomt ís vermoedelijk het leeg-werd-0-ongeluk (zie HANDOVER.md), niet een
--   echte meting. Leeg blijft dus NULL, nooit 0.
-- • CHECK km NOT NULL ⇒ location NOT NULL: een afstand zonder locatie is niet te
--   controleren en dus geen bruikbare meting.
-- • GEEN `factory_distance_basis`-kolom (welk Brink-adres gold ten tijde van de meting):
--   een adreswijziging is een globale gebeurtenis, geen per-rij-gebeurtenis. Na een
--   verhuizing is de werklijst één query (zie lib/brink.ts) en weet je zonder stempel
--   welke afstanden opnieuw moeten. Voor/ná de verhuizing is een datumvergelijking op het
--   event `brand_environment_changed` (dat draagt actor én tijdstip), geen kolom.
-- • GEEN `measured_by`/`measured_at`-kolommen: hetzelfde event draagt dat al.
-- Handgeschreven, net als 0004-0013: de drizzle-snapshots stoppen bij 0003.
ALTER TABLE brands ADD COLUMN factory_location text;
--> statement-breakpoint
ALTER TABLE brands ADD COLUMN factory_distance_km integer;
--> statement-breakpoint
ALTER TABLE brands ADD CONSTRAINT brands_factory_distance_km_positive
  CHECK (factory_distance_km IS NULL OR factory_distance_km > 0);
--> statement-breakpoint
ALTER TABLE brands ADD CONSTRAINT brands_factory_distance_needs_location
  CHECK (factory_distance_km IS NULL OR factory_location IS NOT NULL);
