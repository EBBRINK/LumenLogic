# Implementatieplan — OCR voor beeld-PDF's (fase 2, 2026-07-15)

> Wensen: vault `projects/lumenlogic/onderdelen/ocr-beeld-pdf.md` (bindend).
> Plan-agent + kritische reviewer (15 bevindingen, waarvan 2 blokkerend — alle verwerkt).
> Status: **wacht op akkoord Timo.** Bouwen op de dan-actuele branch (i18n-sessie loopt;
> routes heten inmiddels `app/projects/`, strings mogelijk Engels).

## Kern

Beeld-PDF (0 tekens tekstlaag) → client rendert pagina's → Claude vision leest per pagina
gestructureerd de regels → zelfde deterministische pipeline (parseProductName → matcher) →
álle OCR-regels via review, met een snelle "Tinder"-deck: paginabeeld naast de gelezen
waarden, Goed/Fout met sneltoetsen. Plafond €1/boek, alles gelogd.

## Beslissingen (incl. reviewer-correcties)

- **B1 — Rasterisatie client-side** met de pdfjs die al in unpdf zit (geen nieuwe runtime-dep):
  per pagina render → JPEG (~0.8) → upload; strikt sequentieel, canvas hergebruiken.
  **1568 px op de lángste zijde** (reviewer 3: Anthropic-limiet; 1536-breed zou door de API
  teruggeschaald worden en juist de code-pixels kosten). Dichte pagina's evt. in 2 banden.
  **Bouwstap 1 = render-smoke in een echte browser tegen het echte Deerns-boek** (reviewer
  7/14): bewijs render-API (canvas-param pdfjs-versie!), main-thread-gedrag en beeldkwaliteit
  vóór er iets anders gebouwd wordt.
- **B2 — Transport & opslag:** per-pagina server-action met FormData (past ruim in de 4 MB-
  limiet); tabel `ocr_page_images` (bytea, unique(run,page), cascade met de importrun).
  Drizzle-customType voor bytea (neon-http serialiseert hex — werkend bewijzen in de
  smoke). **Harde regel in de repo-laag:** alléén `getOcrPageImage` selecteert de
  bytes-kolom; run-/reviewqueries raken hem nooit (PGlite-test bewijst dit). Beelden
  geserveerd via `/projects/[id]/ocr-image/[runId]/[page]` met sessie- en
  eigendomscheck, cache no-store.
- **B3 — Vision-call** (`lib/ai/ocr.ts`, spiegel van vangnet.ts): injecteerbare client,
  Haiku, timeout 30 s, maxRetries 1; één call per pagina; geforceerde tool-use
  `lever_regels {regels: [{armatuurcode, merk, type, ruwe_tekst}]}`; prompt "verzin niets,
  lege lijst mag"; geen prijzen, geen catalogus-tools, geen beslissingen. Codes gevalideerd
  tegen de bestaande code-regex. `sourceConfidence` constant 'middel' (reviewer 11 —
  LLM-confidence is slecht gekalibreerd, we doen niet alsof).
- **B4 — Plafond €1/boek écht hard** (reviewer 4): `unique(run,page)` als lock — éérst de
  beeldrij inserten (conflict = pagina al bezig/gedaan → weigeren), en de kostencheck telt
  een gereserveerde schatting voor de lopende call mee. Effectief plafond €1 + max één
  paginaprijs; gedocumenteerd. `llm_usage` krijgt nullable `import_run_id` (per-boek-som);
  maandbudget blijft daarnaast gelden. Purpose 'ocr'; uitsplitsing op /instellingen.
- **B5 — Hervatten van een halve run** (reviewer 5): importrun krijgt OCR-status
  ('ocr_bezig' → 'ocr_klaar'); tab dichtgeklapt op pagina 14 → bij herbezoek toont de
  upload-kaart "OCR hervatten vanaf pagina 15" (idempotent dankzij unique(run,page)).
- **B6 — Eerlijk controlespoor** (reviewer 6): de markdown heet "OCR-transcript
  (model-output)" — de échte bron zijn de paginabeelden, die even lang leven als de run;
  de run-pagina linkt ernaar.
- **B7 — Review-semantiek (de twee blokkerende punten):**
  - Het Tinder-deck toont **uitsluitend regels met reviewKind 'ocr'** ("is de lezing
    goed?"). Regels die de matcher op geel/variant zette doorlopen daarna gewoon de
    bestaande kaarten — "OCR goed gelezen" en "match akkoord" zijn twee besluiten;
    'gecontroleerd' sluit nooit stiekem een geel-review (reviewer 1).
  - Rode OCR-regels vallen na "Goed" terug in de werkvoorraad: `getRedLinkLines`/badge
    versoepelen van `reviewKind IS NULL` naar "geen ópen review", en het deck meldt bij
    een rode regel "blijft rood → daarna handmatig linken" (reviewer 2).
  - Deck: paginabeeld links (klik = zoom), waarden rechts, Goed/Fout + sneltoetsen
    (→/g, ←/f), voortgang "12/31", CSS-transform-animatie (geen lib). Fout → inline
    corrigeren (regel bijwerken + hermatch + review afronden) of afwijzen. Uitsnedes per
    regel (bounding boxes) = latere verfijning, open einde.
- **B8 — Vangnet pas ná OCR-review** (reviewer 9): de vangnet-selectie sluit regels met
  een ópen OCR-review uit; de trigger loopt (ook) vanuit de review-decide-flow. Een
  verhallucineerd merk mag nooit de merkvergrendelde zoektool sturen vóór een mens de
  bron zag.
- **B9 — Documentatie-consistentie** (reviewer 10): het B-06-kopcommentaar in
  lib/repo/imports.ts ("OCR landt eerst als voorstel") wordt bijgewerkt naar het nieuwe
  besluit (direct spec_lines mét verplichte review — Timo 2026-07-15), anders bouwt een
  volgende sessie het terug.
- **B10 — Migratie:** nummer + journal + snapshot pas bepalen ná de merge van de
  parallelle sessie (0007/0008 bezet; journal in-flight) (reviewer 12).

## Flow

upload-kaart detecteert 0 tekst → `startOcrImportAction` (run, events; geen key/budget →
eerlijke melding) → client-loop per pagina (render → FormData → beeldrij-lock →
plafondcheck → vision → llm_usage → regels: parseProductName → addSpecLines(source 'ocr',
sourcePage) → matcher → reviewKind 'ocr' waar nog leeg → events) → `finishOcrAction`
(transcript, ocr_done, status ocr_klaar) → Tinder-review → (na review) vangnet.
Fout op één pagina → event + doorgaan; afgebroken → hervatten (B5).

## Bouwstappen

1. **Render-smoke** (echte browser, echt Deerns-boek): pdfjs-render-API vastleggen,
   beeldkwaliteit/1568px, bytea-round-trip over neon-http. Go/no-go-moment.
2. Migratie (na merge parallelle sessie): `ocr_page_images`, `llm_usage.import_run_id`,
   OCR-status op importrun.
3. `lib/ai/ocr.ts` + tests (mock: happy path, lege pagina, ongeldige output, plafond
   mid-run, geen key).
4. Repo-laag (`lib/repo/ocr.ts`): run/pagina/afronden, beeldopslag, reviewKind-logica,
   rood-werkvoorraad-versoepeling + tests (incl. "reviewquery raakt bytes nooit").
5. Actions + beeldroute (FormData, locks, sessie) + tests.
6. Client-loop in de upload-kaart (voortgang, resttijd-indicatie, hervatten) + interactietests.
7. Tinder-deck + correctie-action + RSC-screenshots (light/dark × mobile/desktop, incl. zoom).
8. Vangnet-gating (B8) + acceptatietest end-to-end (beeld-fixture, vision gemockt) +
   handmatige smoke met het echte boek + HANDOVER.md + /instellingen-uitsplitsing.

Elke stap: bouwer + onafhankelijke reviewer, kleine commits, `bun vitest run` +
`bunx tsc --noEmit` groen.

## Acceptatietest

Het echte Deerns-boek (31 pagina's, beeld): upload → OCR draait automatisch → regels
verschijnen progressief → Tinder-deck: alle lezingen in hoog tempo beoordelen mét
paginabeeld → gele/rode vervolgstappen via de bestaande kaarten → estimate-PDF. Kosten
zichtbaar in /instellingen en ruim onder €1; alles terug te zien in events.
