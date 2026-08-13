-- Migratie 0021 (puur additief): één extra gecureerde merkalias.
--
-- De offerteaanvraag van Eduard voert het merk als "Tekna Nautic"; de catalogus kent
-- het als "Tekna". Gemeten 13 aug via het echte codepad — evaluateSpecLine op de
-- ESSEX-regel gaf:
--     blauw: merk 'Tekna Nautic' niet in de catalogus (geen producten)
-- terwijl Tekna er op dat moment 1.885 producten en 1.885 prijzen had staan. Vijf
-- regels (23 stuks) bleven zo onmatchbaar op een schrijfwijze.
--
-- "Nautic" is Tekna's eigen productlijn (scheepvaartarmaturen), geen ander merk: de
-- vijf regels dragen artikelnummers in Tekna's eigen notatie (N094DBR222HG,
-- N086DBRL60185, N030DBR — de N-reeks), en die codes bestaan in de Tekna-catalogus.
-- Daarom een alias en geen tweede merkrij.
--
-- Zelfde vorm als de seeds in 0010 en 0012.
INSERT INTO brand_aliases (brand_id, alias_key, note)
SELECT id, 'teknanautic',
       'Offerteaanvraag schrijft "Tekna Nautic"; catalogus voert "Tekna" (Nautic is Tekna''s eigen lijn, N-reeks artikelnummers)'
FROM brands WHERE lower(name) = 'tekna'
ORDER BY name, id LIMIT 1
ON CONFLICT (alias_key) DO NOTHING;
