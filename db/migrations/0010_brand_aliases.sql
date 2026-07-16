-- Migratie 0010 (goal-import-ai-leesroute stap 4, O5): gecureerde merknaam-redirects.
-- Een armaturenboek schrijft soms een ander woord dan de catalogusnaam ("Aromas del
-- Campo", "Intralight", "Signify"); brand_aliases wijst zo'n boek-woord naar het
-- canonieke merk. alias_key is altijd al genormaliseerd (brandKeyOf-vorm: lowercase
-- alfanumeriek — de CHECK dwingt dat af), zodat de engine met één gelijkheids-join
-- resolvet. De unique index garandeert dat één alias NOOIT naar twee merken wijst.
-- Seeds staan in de migratie zelf: dev = prod (één Neon-database), dus de gecureerde
-- redirects horen bij het schema. INSERT…SELECT: matcht een verse (test-)database het
-- merk niet, dan insert er gewoon niets — veilig op elke omgeving.
-- Handgeschreven, net als 0004+: de drizzle-snapshots stoppen bij 0003.
CREATE TABLE brand_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  alias_key text NOT NULL CHECK (alias_key = regexp_replace(lower(alias_key), '[^a-z0-9]', '', 'g')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX brand_aliases_key_uniq ON brand_aliases(alias_key);
--> statement-breakpoint
-- ORDER BY … LIMIT 1: merknamen zijn niet uniek in de bron; mocht een naam dubbel
-- voorkomen dan kiest de migratie deterministisch één rij i.p.v. te crashen op de
-- unique index.
INSERT INTO brand_aliases (brand_id, alias_key, note)
SELECT id, 'aromasdelcampo', 'Dordrecht-boek schrijft "Aromas del Campo"; grondwaarheid L348…'
FROM brands WHERE lower(name) = 'aromas'
ORDER BY name ASC, id ASC LIMIT 1;
--> statement-breakpoint
INSERT INTO brand_aliases (brand_id, alias_key, note)
SELECT id, 'intralight', 'TNO-boek schrijft "Intralight"; grondwaarheid L323…'
FROM brands WHERE lower(name) = 'intra-lighting'
ORDER BY name ASC, id ASC LIMIT 1;
--> statement-breakpoint
INSERT INTO brand_aliases (brand_id, alias_key, note)
SELECT id, 'signify', 'Dordrecht-vision leest "Signify"; de grondwaarheid-artikelcodes L322… dragen merk MyCreations — bewust niet Philips: L388/L062/L262 bestaan maar de Dordrecht-codes wijzen hard naar L322'
FROM brands WHERE lower(name) = 'mycreations'
ORDER BY name ASC, id ASC LIMIT 1;
