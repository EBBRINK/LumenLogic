-- 0022 — Vervallen producten worden zichtbaar (ijzeren regel 3, herschreven).
--
-- Oud: "verlopen prijslijst = onzichtbaar in álle zoekresultaten".
-- Nieuw: "verlopen prijslijst = zichtbaar zonder prijs, rood, mét de laatst bekende lijst".
-- Aanleiding en meting: docs/probleem-vervallen-producten.md · spec: docs/goal-vervallen-producten.md
--
-- DE BESCHERMING VERANDERT NIET, DE VORM WEL. Er mag nooit geoffreerd worden op een
-- verouderde prijs. Dat is hier afgedwongen door `gross_price`, `currency`, `price_list_id`
-- en `valid_until` op NULL te zetten zodra de toestand niet `actueel` is — niet door de rij
-- weg te laten. Een consument die een bedrag toont krijgt dus NULL, ongeacht of hij van deze
-- wijziging weet. Dat sluit meteen het staffel-lek: lib/repo/staffel.ts bindt
-- price_tiers.price_list_id aan visible_products.price_list_id, en NULL matcht daar niets.
--
-- DRIE TOESTANDEN, GESLOTEN (`price_state`):
--   'actueel'             prijsregel in een lopende lijst → prijs zichtbaar
--   'prijslijst_verlopen' prijsregel in een lijst waarvan valid_until voorbij is → onze data
--   'uit_prijslijst'      geen prijsregel meer, wél een archiefrij → het product zelf
-- De laatste twee lijken op elkaar op het scherm (rood, geen bedrag) maar zijn een ander
-- gesprek: bij de eerste bel je het merk om een verlenging, bij de tweede zoek je een vervanger.
--
-- NOOIT-GEPRIJSD BLIJFT ONZICHTBAAR. Geen prijsregel én geen archiefrij → geen rij in de view.
-- Anders overspoelen 200k+ nooit-geprijsde producten de catalogus. "Zichtbaar" betekent nu:
-- wij kennen de prijs, of wij kenden hem.
--
-- EEN NOG-NIET-BEGONNEN LIJST BLIJFT ONZICHTBAAR. `valid_from > CURRENT_DATE` is geen
-- verval maar het omgekeerde: die prijs komt eraan. "Price list expired" erop plakken zou
-- liegen, en er valt niets na te vragen bij het merk. De LATERAL kijkt daarom alleen naar
-- lijsten die begonnen zijn; een product met uitsluitend een toekomstige lijst valt uit de
-- view, precies zoals vóór deze migratie.
--
-- ÉÉN RIJ PER PRODUCT, net als voorheen — elke consument neemt dat aan. Een product met
-- prijsregels in meerdere lijsten kiest: geldig boven verlopen, daarbinnen de hoogste
-- valid_until. Dat is de LATERAL hieronder.
--
-- WAAROM LATERAL EN GEEN CTE MET DISTINCT ON. Een CTE met DISTINCT ON sorteert eerst alle
-- 210k prijsrijen en is een barrière voor predicate pushdown; de view wordt in praktijk
-- altijd bevraagd met een filter op products (naam ilike, merk, artikelnummer). Met LATERAL
-- blijft products de drijvende tabel en doet Postgres één indexlookup per kandidaat op
-- prices_product_list_uniq (product_id, price_list_id).
--> statement-breakpoint
-- Het archief had geen enkele index (append-only, bewust geen FK's). De LATERAL hieronder
-- zoekt erop per product; zonder deze index wordt dat een seq scan per rij.
CREATE INDEX IF NOT EXISTS prices_archive_product_idx
  ON archive.prices_archive (product_id, valid_until DESC, archived_at DESC);
--> statement-breakpoint
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
  p.beam_angle,
  p.dimmable,
  p.light_source,
  p.height_cm,
  p.width_cm,
  p.length_cm,
  p.diameter_cm,
  p.color_1,
  p.material_1,
  p.tier2_source,
  p.warranty_months,
  p.repairability,
  p.epd_lifetime_hours,
  p.country_of_origin,
  p.status,
  -- De toestand. Gesloten verzameling van drie; er is geen 'onbekend', want een rij zonder
  -- prijsspoor haalt de WHERE onderaan niet.
  CASE
    WHEN l.geldig THEN 'actueel'
    WHEN l.price_id IS NOT NULL THEN 'prijslijst_verlopen'
    ELSE 'uit_prijslijst'
  END AS price_state,
  -- ⚠️ De poort. Alles wat geld is, is NULL zodra de toestand niet 'actueel' is.
  CASE WHEN l.geldig THEN l.gross_price END AS gross_price,
  CASE WHEN l.geldig THEN l.currency END AS currency,
  CASE WHEN l.geldig THEN l.price_list_id END AS price_list_id,
  CASE WHEN l.geldig THEN l.valid_until END AS valid_until,
  -- De laatst bekende lijst. Óók gevuld bij 'actueel' (dan is het de lopende lijst) — één
  -- betekenis per kolom, geen "soms wel, soms niet". Dit is het enige wat het scherm nodig
  -- heeft om te zeggen wélke lijst de laatste was, en het is prijsloos.
  COALESCE(l.price_list_name, g.price_list_name) AS last_price_list_name,
  COALESCE(l.valid_until, g.valid_until) AS last_price_list_valid_until
FROM products p
LEFT JOIN LATERAL (
  SELECT
    pr.id AS price_id,
    pr.gross_price,
    pr.currency,
    pr.price_list_id,
    pl.name AS price_list_name,
    pl.valid_until,
    (pl.valid_until >= CURRENT_DATE) AS geldig
  FROM prices pr
  JOIN price_lists pl ON pl.id = pr.price_list_id
  WHERE pr.product_id = p.id
    AND pl.valid_from <= CURRENT_DATE
  ORDER BY
    (pl.valid_until >= CURRENT_DATE) DESC,
    pl.valid_until DESC
  LIMIT 1
) l ON TRUE
LEFT JOIN LATERAL (
  SELECT a.id AS archive_id, a.price_list_name, a.valid_until
  FROM archive.prices_archive a
  WHERE a.product_id = p.id
  ORDER BY a.valid_until DESC, a.archived_at DESC
  LIMIT 1
) g ON TRUE
WHERE l.price_id IS NOT NULL OR g.archive_id IS NOT NULL;
