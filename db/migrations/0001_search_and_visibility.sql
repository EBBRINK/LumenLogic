-- Ijzeren regel 3 (verlopen prijslijst = product onzichtbaar) + zoek-infrastructuur.
-- Deze DDL is met opzet hand-geschreven en wordt óók in de tests (PGlite) toegepast,
-- zodat Neon en de testomgeving exact dezelfde zichtbaarheidsregel afdwingen.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Centrale zichtbaarheidspoort. Een product verschijnt UITSLUITEND via deze view:
-- het moet een prijs hebben op een prijslijst die vandaag geldig is. Verloopt de
-- prijslijst, dan valt het product uit álle zoekresultaten. "Een gat is eerlijk."
CREATE VIEW visible_products AS
SELECT
  p.id,
  p.article_code,
  p.name,
  p.brand_id,
  p.brand_name,
  p.supplier_article_code,
  p.category_id,
  p.category_path,
  p.description,
  p.lumen_output,
  p.kelvin,
  p.cri,
  p.ip_value,
  p.dimmable,
  p.status,
  pr.gross_price,
  pr.currency,
  pr.price_list_id,
  pl.valid_until
FROM products p
JOIN prices pr ON pr.product_id = p.id
JOIN price_lists pl ON pl.id = pr.price_list_id
WHERE pl.valid_from <= CURRENT_DATE
  AND pl.valid_until >= CURRENT_DATE;
--> statement-breakpoint

-- Trigram-index voor fuzzy zoeken op producttekst (merk + naam).
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_brand_name_trgm_idx
  ON products USING gin (brand_name gin_trgm_ops);
--> statement-breakpoint

-- Exact-match op artikelnummers (SKU) — matcht vóór de fuzzy-tak.
CREATE INDEX IF NOT EXISTS products_article_code_idx
  ON products (article_code);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_supplier_article_code_idx
  ON products (supplier_article_code);
--> statement-breakpoint

-- Prijslijst-geldigheid wordt bij elke zoekopdracht gecheckt → index op valid_until.
CREATE INDEX IF NOT EXISTS price_lists_valid_until_idx
  ON price_lists (valid_until);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS prices_product_idx ON prices (product_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand_id);
