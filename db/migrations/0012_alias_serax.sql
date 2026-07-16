-- Migratie 0012 (goal-import-ai-leesroute stap 5, puur additief): één extra
-- gecureerde merkalias, opgeleverd door de 300dpi-tegellezing van het
-- Dordrecht-boek. Het boek drukt "SERAX"; Jayden's offerte voert dezelfde regel
-- onder "Valerie Objects" (een Serax-label) — gestaafd via het handgeschreven
-- aantal D=13 ↔ offerte "13 x L052B7219361 Valerie Objects Ceiling lamp nr.02".
-- Valerie Objects heeft 90 producten in de catalogus, dus deze alias levert
-- écht kandidaten. Zelfde vorm als de seeds in 0010.
INSERT INTO brand_aliases (brand_id, alias_key, note)
SELECT id, 'serax',
       'Dordrecht-boek drukt "SERAX"; offerte voert Valerie Objects (Serax-label, D=13 ↔ 13x)'
FROM brands WHERE lower(name) = 'valerie objects'
ORDER BY name, id LIMIT 1;
