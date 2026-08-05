-- Sprint 2.5b — snelheid. Eén expressie-index, zelfde regels als 0017: geen kolom,
-- geen view, geen gedrag. Apart van 0017 omdat hij een ánder scherm bedient.
--
-- Tegel 7 van /analytics ("brandsNotInCatalogue", lib/repo/analytics-tiles.ts) vraagt:
-- welke gevraagde merken hebben we niet in de catalogus. Dat is een NOT EXISTS van 186
-- spec-regels tegen 211k producten, en zonder index maakt Postgres er een hash anti-join
-- van: hij bouwt een hashtabel over ÁLLE producten (8 batches, spilt naar temp) om er
-- 186 rijen tegen te toetsen. Gemeten met EXPLAIN (ANALYZE, BUFFERS): 103 ms, en dat is
-- veruit de traagste van de tien tegels — de andere negen samen halen geen 8 ms.
--
-- Met de index worden het 186 index-probes: 103 ms → 0,5 ms.
--
-- ⚠️ De uitdrukking moet letterlijk gelijk blijven aan die in analytics-tiles.ts
-- (`lower(btrim(p.brand_name))`). Zie de toelichting boven 0017: een expressie-index die
-- niet meer matcht faalt stil. db/migration-0017.test.ts toetst deze mee.
CREATE INDEX IF NOT EXISTS products_brand_name_trimmed_lower_idx
  ON products ((lower(btrim(brand_name))));
--> statement-breakpoint

ANALYZE products;
