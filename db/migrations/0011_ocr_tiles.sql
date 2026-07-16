-- Migratie 0011 (goal-import-ai-leesroute stap 5, O4: A3-tiling in de OCR).
-- Een A3-pagina op één beeld van max 1568 px lange zijde is effectief ~95 dpi —
-- het vision-model verzint dan merken (Dordrecht-nulmeting: 8/18 verzonnen).
-- Pagina's onder de dpi-drempel worden voortaan in overlappende tegels van elk
-- ≤1568 px gerenderd (~300 dpi effectief); elke tegel krijgt een eigen beeldrij.
--
-- • tile: tegelnummer binnen de pagina. INVARIANT: tile 0 ⟺ het beeld beslaat
--   de HELE pagina (het bestaande pad); getegelde pagina's nummeren 1..N
--   (rij-major, linksboven eerst) en hebben nooit een tegel 0. Alle bestaande
--   rijen zijn per definitie hele pagina's → backfill via DEFAULT 0, geen
--   aparte UPDATE nodig.
-- • unique(import_run_id, page) wordt unique(import_run_id, page, tile): de
--   beeldrij blijft het per-TEGEL-lock uit B4 (éérst de beeldrij inserten;
--   conflict = tegel al bezig/gedaan → weigeren) — hervatten en het €1-plafond
--   werken dus per tegel, precies zoals eerst per pagina.
-- Handgeschreven, net als 0004+: de drizzle-snapshots stoppen bij 0003.
ALTER TABLE ocr_page_images ADD COLUMN tile integer NOT NULL DEFAULT 0;
--> statement-breakpoint
DROP INDEX ocr_page_images_run_page_uniq;
--> statement-breakpoint
CREATE UNIQUE INDEX ocr_page_images_run_page_tile_uniq ON ocr_page_images(import_run_id, page, tile);
