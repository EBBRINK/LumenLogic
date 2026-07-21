-- Migratie 0013 (sprint 1.5, merkbeheer — puur additief):
-- • brand_lifecycle: drie fasen. 'slapend' = een besluit van Brink ("niet meer gebruiken",
--   3 merken), 'bestaat_niet_meer' = een feit over de wereld ("BESTAAT NIET MEER", "failliet",
--   "= Leucos geworden", 10 merken). Twee waarden zouden die eerste drie tot een onwaarheid
--   dwingen; meer waarden heeft de werklijst niet nodig.
-- • GEEN opvolger-verwijzing ("Murano Due = Leucos geworden"). Dat is een aparte beslissing
--   met een self-reference-migratie en raakvlak met de matcher — opvolgtaak, zie HANDOVER.md.
-- • Kolomdefault, GEEN backfill — zelfde keuze als 0008 (brand_relations). ADD COLUMN met een
--   constante default is in PG11+ metadata-only: geen table rewrite, geen UPDATE, updated_at
--   blijft ongemoeid. De 437 bestaande merkrijen worden dus niet aangeraakt (besluit G2).
-- • GEEN unique index op name/brand_code: 19 dubbele codes en 2 dubbele namen staan in
--   productie en moeten blijven staan (G2, G5). De dubbelcheck leeft in de applicatielaag.
-- • GEEN index op lifecycle: 437 rijen, een seq scan is goedkoper dan de index.
-- Handgeschreven, net als 0004-0012: de drizzle-snapshots stoppen bij 0003.
CREATE TYPE brand_lifecycle AS ENUM ('actief', 'slapend', 'bestaat_niet_meer');
--> statement-breakpoint
ALTER TABLE brands ADD COLUMN lifecycle brand_lifecycle NOT NULL DEFAULT 'actief';
