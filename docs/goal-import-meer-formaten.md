# Goal: upload-vak uitbreiden naar xlsx, docx, CSV en jpg/png

**Datum:** 20 aug 2026 · **Status:** in uitvoering (2 bouwers)
**Aanleiding:** bestekpartijen leveren armaturenstaten niet alleen als PDF. Eén upload-vak
op de projectpagina dat zelf het type herkent; alles door dezelfde pijplijn: bronbestand
als audit trail → regels lezen → élke regel naar de Review-tab.

## Beslissingen (Timo, 20 aug)

- Zelfde upload-vak als PDF, typeherkenning op extensie + mime.
- Inhoud: armaturenstaten (geen prijslijsten — daar is de prijslijst-skill voor).
- Elke regel door de bestaande review-stap, zelfde flow als Sprint M2.
- **Bronbestand wordt voortaan opgeslagen, met size-limiet 15 MB** (nieuwe tabel
  `import_source_files`, bytea in Neon, gechunkt geüpload à 2 MB / max 8 chunks — de
  413/Vercel-4,5 MB-limiet blijft gerespecteerd). Boven 15 MB: alleen de client-gelezen
  rijen, event `source_file_skipped_too_large`, `sourceStored:false` op de run.

## Arbitrage tussen de twee plannen

- Transport xlsx/csv/docx: **gechunkt** (start → chunk → finish, B4-lockpatroon), niet één
  FormData-call van 4 MB.
- **Geen AI op tabelrijen**: rijen zijn al gestructureerd; deterministische rij-mapper.
  De rij-variant van de leesprompt (`LEVER_REGELS_TOOL_RIJEN`, `rij`-veld i.p.v. `pagina`)
  alleen op het docx-vrije-tekst-fallbackpad. Ijzeren regel 2 blijft vanzelf geborgd.
- **PNG server-side accepteren** (mime-set + `isPngImage` magic bytes), geen client-side
  JPEG-hercodering.

## Bouwer A — server/datamodel

1. **Migratie 0024** (eigen bestand; `ALTER TYPE ... ADD VALUE` niet mengen met DML op Neon):
   `spec_source` + waarde `'tabel'`; `review_kind` + waarde `'tabel'`; tabel
   `import_source_files` (id, import_run_id FK cascade, filename, mime, size, chunk,
   bytes bytea, created_at; unique (import_run_id, chunk)).
2. **Parsers** `lib/table/`: `rowsFromXlsx` (exceljs, zit al in deps), `rowsFromCsv`
   (delimiter-sniffing `;`/`,`/tab), `rowsFromDocx` (**mammoth**, nieuw in deps; tabellen →
   rijen, lopende tekst → vrije-tekst-fallback), `parseSpecLinesFromRows` (koprij-detectie,
   `sourcePage` = 1-based rijnummer — semantiek documenteren in schema.ts; rijgrenzen heilig,
   géén `pages.join`). Magic bytes generaliseren naar `lib/bytes/magic.ts` (PK-zip, PNG;
   `isJpegImage` blijft geëxporteerd).
3. **Repo**: `recordPdfImport` generaliseren naar interne `recordImport`;
   `recordTableImport` ('tabel'-wrapper, rawMarkdown = rijen als markdown-tabel, elke regel
   zonder bestaand reviewKind → `'tabel'`, matcher per regel — LLM-vrij); `startTableImport`,
   `addSourceChunk`, `assembleSourceFile` (B2-regel: alleen `getSourceFile` selecteert bytes).
4. **Actions** (zod via `lib/validation.ts`, requireSession → parseForm → repo):
   `startTableImportAction` → `{runId, doneChunks}`; `uploadSourceChunkAction` (idempotent);
   `finishTableImportAction` (assembleren, size-check, parsen, `addSpecLines` + matcher,
   events, redirect `?tabel=<n>&run=<id>`); `importTabelRowsAction` ({filename, rows},
   >15 MB-pad); `ocrPageAction` verruimen naar PNG. Filename-conventie N losse beelden:
   `armaturenstaat-<dossierId-kort>-<yyyymmdd>.beelden`, beeld i = pagina i.
5. **Events** (regel 5): `tabel_import_done`, `source_file_stored` (éénmaal, niet per chunk),
   `source_file_skipped_too_large`, `tabel_import_rejected`.
6. **Tests** (PGlite): parser-tests, repo-tests (incl. bewijs dat `recordPdfImport`
   byte-identiek bleef), chunk-lock-tests, PNG-magic-bytes-tests.

## Bouwer B — client/UI/prompt

1. **Upload-card** (`components/dossier/pdf-upload-card.tsx`, niet hernoemen):
   accept-attribuut, `detectUploadKind` (extensie eerst, mime secundair; unknown → eerlijke
   fout), per-type route: pdf ongewijzigd; jpg/png → OCR-loop zonder pdfjs (pageCount 1..N,
   synthetische filename-conventie van bouwer A); xlsx/csv/docx → chunk-uploadloop
   (start → chunks → finish) met client-size-check en >15 MB-fallback naar
   `importTabelRowsAction` met client-gelezen rijen. Alles via `callAction()`.
2. **Leesprompt-rijvariant** (`lib/ai/leesroute.ts`): `LEVER_REGELS_TOOL_RIJEN` +
   `LEESROUTE_SYSTEM_PROMPT_RIJEN` (=== ROW N ===-markers, zelfde `SYSTEM_PROMPT_KERN`,
   zelfde logging/budget-afspraken, batch ~40 rijen) — alleen aangeroepen op het
   docx-vrije-tekst-fallbackpad.
3. **UI-teksten**: kaarttitel/intro/knoppen/foutmeldingen type-neutraal; Review-tab
   "Read from row N" bij tabelbron, "View page image"-link onderdrukken bij tabel (wél
   tonen bij beeld-import); bevestigingsbanner op de projectpagina type-neutraal.
4. **Tests**: uitbreiden van `pdf-upload.test.tsx` + stubs (rij-import happy/error,
   te groot, unknown type, png-OCR-flow, PDF-regressie); leesroute-rijvariant-tests;
   RSC-screenshots light/dark × mobile/desktop (kaart idle, fouttoestand, Review-tab
   met rijregels).

## Interface-afspraken (vastgeklikt, beide bouwers houden zich eraan)

- Actions en signaturen zoals onder Bouwer A punt 4; bouwer B importeert ze op naam.
- `sourcePage` = rijnummer bij tabelbron; discriminator = `import_runs.source === 'tabel'`.
- Redirect bij succes: `/projects/<id>?tabel=<n>&run=<runId>`.
- Bestandslimieten: 15 MB totaal, 2 MB per chunk, max 8 chunks.

## Niet in scope

Matcher-engine (blijft LLM-vrij), prijslogica, bestaande CSV-plak-flow, blob-storage,
download-knop voor het bronbestand (later), hernoemen van de upload-card.

## Risico's

- `ADD VALUE` op Neon in eigen migratiebestand; geen `db.transaction()` op neon-http.
- mammoth onder Bun/Next-server-runtime eerst kort verifiëren.
- Vitest: nooit twee volle runs tegelijk; bouwers draaien alleen gerichte tests, de volle
  suite draait de hoofdsessie na afloop.
