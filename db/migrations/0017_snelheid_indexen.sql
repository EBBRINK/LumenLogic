-- Sprint 2.5b — snelheid. UITSLUITEND indexen: geen kolom, geen view, geen enkele
-- gedragsverandering. Zie docs/2.5b-snelheid.md voor de meting achter elke regel.
--
-- WAAROM EXPRESSIE-INDEXEN EN GEEN GEGENEREERDE KOLOM (besluit 2.5b)
-- De matcher vergelijkt merk en artikelnummer genormaliseerd — `regexp_replace(lower(x),
-- '[^a-z0-9]','','g')` — zodat "LedsC4" ≡ "LEDS-C4". Die uitdrukking is wat de query
-- stelt, en de bestaande indexen staan op de KALE kolom; die kan Postgres er niet voor
-- gebruiken. Een gegenereerde `brand_key`-kolom zou hetzelfde oplossen, maar dan moet de
-- code die kolom nóémen, en elke push naar main deployt binnen 3 s zónder aparte
-- migratiestap: de nieuwe code draait dus even tegen het oude schema. Een index toevoegen
-- is in die volgorde veilig, een kolom waar de code meteen op leunt niet. Bovendien blijft
-- de conditie in de code hier letterlijk ongewijzigd — er is geen tweede waarheid die uit
-- de pas kan lopen.
--
-- ⚠️ DE UITDRUKKINGEN HIERONDER MOETEN LETTERLIJK GELIJK ZIJN aan die in de code
-- (lib/repo/products.ts, lib/matching/engine.ts). Postgres matcht een expressie-index
-- structureel: één spatie of een andere klassevolgorde en de index wordt stil genegeerd —
-- geen fout, alleen weer een seq scan. `db/migration-0017.test.ts` pint dat vast door de
-- écht gegenereerde query te laten plannen en op de indexnaam te toetsen.

-- 1. Merk genormaliseerd (bevinding B5). `like '%…%'` → trigram, dus gin_trgm_ops.
--    Gemeten op productie (211k rijen), merk-alleen-tak van /catalog:
--    XAL 345 → 225 ms · Prado 185 → 60 ms · Lombardo 660 → 312 ms.
CREATE INDEX IF NOT EXISTS products_brand_key_trgm_idx
  ON products USING gin (
    (regexp_replace(lower(brand_name), '[^a-z0-9]', '', 'g')) gin_trgm_ops
  );
--> statement-breakpoint

-- 2. Artikelnummer genormaliseerd (lib/matching/engine.ts, exacte SKU-tak). Dit is `=`,
--    geen `like`, dus een gewone btree. Deze query draait PER SPEC-REGEL in runMatcher:
--    gemeten 276 ms → 0,1 ms. Bij een armaturenboek van 200 regels scheelt dat ~55 s.
CREATE INDEX IF NOT EXISTS products_article_code_key_idx
  ON products ((regexp_replace(lower(article_code), '[^a-z0-9]', '', 'g')));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_supplier_article_code_key_idx
  ON products ((regexp_replace(lower(supplier_article_code), '[^a-z0-9]', '', 'g')));
--> statement-breakpoint

-- 3. Artikelnummer alleen lowercase (lib/repo/products.ts, exacte tak van searchProducts).
--    Andere uitdrukking dan 2 — `lower(x) = lower($1)` zonder normalisatie — dus een eigen
--    index; de twee zoekpaden normaliseren nu eenmaal verschillend. Gemeten 55 → 0,1 ms.
CREATE INDEX IF NOT EXISTS products_article_code_lower_idx
  ON products ((lower(article_code)));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_supplier_article_code_lower_idx
  ON products ((lower(supplier_article_code)));
--> statement-breakpoint

-- Expressie-indexen krijgen pas statistieken ná een ANALYZE; zonder dit blijft de planner
-- op zijn oude, verkeerde rijschattingen zitten en kiest hij de index soms niet.
ANALYZE products;
