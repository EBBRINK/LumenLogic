-- Migratie 0015 (sprint 1.8, eigen velden — puur additief):
-- • `custom_fields`: de velddefinities die Stefan zelf aanmaakt. uuid-PK omdat
--   events.entity_id van het type uuid is: zonder uuid kan een velddefinitie niet
--   rechtstreeks aan zijn eigen events hangen (fase 1 §6).
-- • De uuid is ÓÓK de sleutel in products.custom_values (met prefix 'custom:' in de
--   veldcatalogus). Bewust geen label-afgeleide slug: hernoemen is toegestaan, en een
--   sleutel `cf_energieverbruik` op een veld dat inmiddels "Recycled content" heet is
--   precies de stille mismatch die dit project al eens vijf weken kostte.
-- • CHECK op niveau (must/wanna/nice) en op bucket_key <> 'intern': bucket 11 is per
--   definitie het complement van excelColumns() (zie de kop van lib/field-catalog.ts);
--   een eigen veld daarin zou de noemer van de scorecard uit de pas laten lopen met het
--   merk-Excel. De overige tien buckets leven in TypeScript en kan de database niet
--   kennen — dát blijft een applicatiecheck.
-- • CHECKs op niet-lege labels ÉN instructies. Rij 3 van het merk-Excel is wat het merk
--   vertelt wát het moet invullen; een leeg instructieveld is precies hoe je een kolom
--   krijgt die niemand invult.
-- • Partiële unique index op de genormaliseerde label_en waar archived_at is null:
--   twee actieve velden met dezelfde kolomkop maken via `dubbele_kolomkop` élk ingevuld
--   merkbestand onbruikbaar (fase 1, Val 1). De index slaat ook bij HERNOEMEN aan.
--   Hij dekt alleen eigen↔eigen; eigen↔catalogus zijn 66 labels in TypeScript en blijft
--   labelBotsing() in de server-actie.
--   De normalisatie hier (trim + witruimte-collaps + lowercase) is een BENADERING van
--   normLabel() uit lib/excel-validate.ts — NFKC kan Postgres niet immutabel. Dit is de
--   achtervang, niet de autoriteit.
-- • Archiveren (archived_at), geen hard delete: met een uuid-sleutel liggen de waarden na
--   verwijderen onder een uuid die niemand meer heeft. Onherstelbaar. De wáárden worden
--   sowieso nooit gewist — dat zou een mass-update over 211k productrijen zijn die
--   updated_at verzet en de fingerprint-discipline van elke volgende sprint breekt.
-- • `products.custom_values jsonb`, NIET in tier2_source: die staat in visible_products en
--   wordt door de matcher gelezen (fase 1, Val 6). Deze kolom staat in GEEN ENKELE view en
--   mag daar ook nooit in komen — db/matcher-grens.test.ts bewaakt dat.
-- • Kolomdefault NULL, GEEN backfill — zelfde keuze als 0013/0014: ADD COLUMN zonder
--   default is in PG metadata-only, geen table rewrite, geen UPDATE, updated_at blijft
--   ongemoeid. De 211317 bestaande productrijen worden dus niet aangeraakt.
-- • GEEN GIN-index op custom_values: hij helpt niet bij de `count(*) filter (…)` binnen de
--   gegroepeerde full scan van completenessSelection() — de query die er echt toe doet — en
--   kost bij élke productwrite. Later additief toe te voegen als de teltelling bij
--   archiveren meetbaar traag blijkt.
-- Handgeschreven, net als 0004-0014: de drizzle-snapshots stoppen bij 0003.
CREATE TABLE custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_nl text NOT NULL,
  label_en text NOT NULL,
  instructie_nl text NOT NULL,
  instruction_en text NOT NULL,
  niveau text NOT NULL,
  bucket_key text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_fields_niveau_check CHECK (niveau IN ('must', 'wanna', 'nice')),
  CONSTRAINT custom_fields_bucket_not_internal CHECK (bucket_key <> 'intern'),
  CONSTRAINT custom_fields_labels_not_empty CHECK (btrim(label_nl) <> '' AND btrim(label_en) <> ''),
  CONSTRAINT custom_fields_instructions_not_empty CHECK (btrim(instructie_nl) <> '' AND btrim(instruction_en) <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX custom_fields_label_en_active_uniq
  ON custom_fields (lower(regexp_replace(btrim(label_en), '\s+', ' ', 'g')))
  WHERE archived_at IS NULL;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN custom_values jsonb;
