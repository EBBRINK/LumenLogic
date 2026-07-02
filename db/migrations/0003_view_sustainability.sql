-- Zichtbaarheidsview uitgebreid met technische + duurzaamheidsvelden zodat de
-- gelijkwaardigheidsengine (run 3) alles via de centrale poort leest (ijzeren regel 3).
DROP VIEW IF EXISTS visible_products;
--> statement-breakpoint
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
  p.max_wattage,
  p.kelvin,
  p.cri,
  p.ip_value,
  p.dimmable,
  p.light_source,
  p.warranty_months,
  p.repairability,
  p.epd_lifetime_hours,
  p.country_of_origin,
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
