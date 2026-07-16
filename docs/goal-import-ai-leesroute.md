# Goal: de import leert echte armaturenboeken lezen (AI-voorop)

> **Status: klaar om uit te voeren, nog niet uitgevoerd.** Opgesteld 16 jul 2026 door de
> sprintmaster-sessie na fase 1 (probleem, `docs/probleem-import-leest-verkeerd.md`) en
> fase 2 (twee plan-agents). Besluit Timo: **AI-voorop** voor het kolom/code-lezen — het
> model bepaalt welke kolom het merk is en wat een code is; de deterministische parser
> blijft alleen als snelpad voor de bewezen Deerns-stijl. Dit document is de volledige
> briefing; werk 'm stap voor stap af.

## Doel

Alle vier de echte testcases (Raadhuis · KvK · TNO · Dordrecht) komen door de import met
correcte codes én merken, meetbaar tegen Jayden's offertes als grondwaarheid — zodat de
matcher eindelijk kandidaten kan tonen en de estimate inhoud krijgt in plaats van €0,00.

**Nulmeting (16 jul, ijkpunt):** Raadhuis import 31/31 maar merk 31× fout (zaalnamen),
match 0/31 · KvK import 0/28 · TNO import 15/20, match 0/15 (merk = "Woonkamer") ·
Dordrecht 0/18 (OCR-antwoord stil afgekapt).

## Verplichte leeslijst (in deze volgorde)

1. `docs/probleem-import-leest-verkeerd.md` — de zes oorzaken O1–O6 met bestand:regel,
   plus wat expliciet GEEN oorzaak is (top-8 ingetrokken; handschrift leesbaar; catalogus
   gevuld).
2. `docs/lumenlogic-sprintplan-augustus.md` §"Uitkomst van de meting" + §"Wat de
   evaluatieset blootlegde" — de metingen en scope-vondsten.
3. `~/Downloads/lumenlogic-testset/` — de vier testcases mét `grondwaarheid_uit_XIS.json`
   en per case een `OPDRACHT.md`. **Echte klantdata: nooit in git committen.**
4. Code: `lib/pdf/armaturenboek.ts` · `lib/ai/ocr.ts` · `lib/repo/ocr.ts` ·
   `lib/matching/engine.ts` (m.n. `brandExists` :176) ·
   `tests/acceptatie-aanvraag-estimate.test.ts` (het regressie-anker).

## Het besluit (Timo, 16 jul): AI-voorop

De regex-/eerste-woord-parser is bewezen ontoereikend (vier huisstijlen, twee testregexen
met tegengestelde blinde vlekken). Daarom:

- **Eén AI-leesroute voor tekst én beeld.** Hetzelfde `lever_regels`-tool/prompt-patroon
  dat de OCR al gebruikt, ook voor tekstlaag-PDF's (paginatekst i.p.v. beeld). Het model
  bepaalt kolommen: merk = fabrikantkolom, nooit een ruimtenaam ("Raadzaal", "Woonkamer");
  code = het recordstart-token, ongeacht huisstijl (`Lp301`, `L004`, `Lr001B`, `Ad`).
- **Deterministisch snelpad blijft** voor de bewezen Deerns-stijl: draai `parseTocText`
  eerst; levert dat regels met overwegend bekende merken (≥60% via `brands`-toets), dan is
  dat het resultaat — €0, en de acceptatietest blijft dat pad bewandelen. Anders → AI-route.
- **Op élk AI-pad de 0.1b-tripwire**: `stop_reason` toetsen, afkapping = event + teller +
  retry met hoger budget, nooit stil `[]`. "An empty list is a good answer" mag alleen
  gelden voor een écht lege pagina.
- **Kosten**: tekstroute ~€0,005–0,01/pagina; maandcap €10 (verbruik ~€0,41), `purpose`
  apart loggen in `llm_usage`. Budgetpoort zoals bij vangnet/OCR.

## Stappen (elke stap: DoD + meetscript draaien vóór de volgende)

**Stap 0 — Meetinstrument (5–6 u).** `scripts/eval-testset.ts`: haalt de vier cases door
het productiecodepad (parse → `evaluateSpecLine` per regel, read-only tegen de bestaande
DB) en print per case drie kolommen tegen de grondwaarheid: **import** (codes gelezen/N +
merk-correctheid), **match** (statusverdeling + staat Jayden's product in de kandidaten,
op welke rang), **keuze**. Testset-pad via env `EVAL_DIR` (default `~/Downloads/
lumenlogic-testset`). OCR/AI-calls alleen achter `--ai`-flag (kost centen; dev=prod-DB dus
de kosten tellen tegen de echte cap). Plus kleine geanonimiseerde tekstfixtures in de vier
codestijlen voor unit-tests. **Acceptatie: het script reproduceert exact de nulmeting.**
Reproduceert het die niet, dan is het instrument fout — eerst fixen.

**Stap 1 — O1-quick-win in de deterministische parser (3 u).** `armaturenboek.ts`
`splitBrandType`: bekend merk overal in de recordtekst herkennen (woordgrens, genormaliseerd
≥3 tekens, langste match wint), niet alleen als prefix; géén bekend merk → `brandText:
null` (eerlijk onbekend), nooit meer het eerste woord als merkclaim. **Acceptatie: Raadhuis
0 zaalnamen als merk; de vier hermetings-regels gaan naar geel/open mét kandidaten;
acceptatietest groen** (let op de 2-blauw-verwachting: alleen bijwerken als de nieuwe
uitkomst aantoonbaar de juistere is, met motivering in de commit).

**Stap 2 — O3-tripwire (2 u).** `lib/ai/ocr.ts`: `MAX_TOKENS_PER_PAGE` 1500 → 4000;
`stop_reason === "max_tokens"` → event `ocr_page_truncated` + teller + één retry, nooit
stil leeg. Promptzin "An empty list is a good answer" inperken tot pagina's zonder regels.
**Acceptatie: unit-test met gemockte afkapping; Dordrecht-pagina levert 18 codes i.p.v. 0.**

**Stap 3 — De AI-tekstroute (8 u).** Nieuw `lib/ai/leesroute.ts`: hergebruik
`LEVER_REGELS_TOOL` + systeemprompt uit `ocr.ts` (exporteren — één tool-definitie voor
beeld én tekst, dat is het koppelcontract voortaan), input = paginatekst. Promptregel
erbij: "the brand is the manufacturer column — never a room/space/function name such as
Raadzaal, Toilet, Woonkamer, Vergaderruimte". Router op de plek waar de import
`parseSpecLinesFromPages` aanroept (server-side, niet in de pure parser): deterministisch
resultaat met <60% bekende merken of 0 regels → AI-route per pagina. Regels uit de AI-route
krijgen dezelfde verplichte review als OCR-regels (B7-patroon: niets stil opslaan) en
`codeValid`-vertrouwenssignaal via de bestaande CODE-regex (signaal, geen poort).
**Acceptatie: Raadhuis 31/31 met merk correct · KvK 20/20 · TNO 20/20 (meetscript);
Deerns-acceptatietest groen zónder AI-call (€0).**

**Stap 4 — O5: `brandExists` toetst producten + aliassen (5 u).**
`lib/matching/engine.ts:176`: "bekend" = merk heeft ≥1 productrij in de **basistabel**
(niet `visible_products` — de bestaanstoets mag het verlopen-prijslijst-geval niet blauw
maken; kandidaten blijven strikt `visible_products`, ijzeren regel 3). Nieuwe tabel
`brand_aliases(brand_id, alias_key)` (genormaliseerd via `brandKeyOf`), resolve in
`brandExists` én in de merkconditie van `fetchCandidates`; seed: `aromasdelcampo → Aromas`
+ wat de grondwaarheid nog oplevert. Geen fuzzy/prefix-gok als match. **Acceptatie:
merkrij-zonder-producten → blauw · merk met alleen onzichtbare producten → niet blauw ·
"Aromas del Campo" → kandidaten van Aromas (unit + meetscript).**

**Stap 5 — O4: A3-tiling in de OCR (6 u).** Pagina's in overlappende stroken (~300 dpi
effectief, elk ≤1568px lange zijde) naar de vision-call; dedup over stroken op code (de
bestaande rijkste-wint-dedup). Schema: `ocr_page_images` + kolom `tile` (default 0),
unique `(run, page, tile)` — migratie, bestaande rijen backfill 0. **Acceptatie:
Dordrecht-merken 18/18 correct, 0 verzonnen (nulmeting: 8/18 verzonnen).**

**Stap 6 — O6: aantallen (3 u).** Toolschema veld `aantal` (number|null), promptregel
"report a quantity only if literally printed or handwritten next to the row; otherwise
null"; `lib/repo/ocr.ts:596` neemt het over i.p.v. hard `null` (comment herschrijven —
de A-07-aanname vervalt als default, blijft als fallback). Check: `upgradeOcrLine` moet
`quantity` meenemen bij een rijkere herlezing. **Acceptatie: Dordrecht 15/15 incl. de
geverifieerde 124; Raadhuis blijft `null` (aantallen staan daar in de mail — niets
verzinnen).**

**Stap 7 — Top-8: alleen meten (1 u).** Het meetscript rapporteert per regel de rang van
Jayden's product. Na stap 1–6 aflezen of de top-8 knelt. **Geen fix** — de afkap is een
ingetrokken oorzaak; pas bij een aantoonbaar knelpunt wordt het een eigen probleemdoc.

## Vangrails — verandert expliciet NIET

- **IJzeren regels 1–5**, m.n. regel 2 (geld nooit in de ranking — `engine.ts:250` orderBy
  en de invariant-tests blijven onaangeraakt) en regel 3 (kandidaten alleen uit
  `visible_products`).
- **Statussen-semantiek** (vijfstatussen, beslisvolgorde, tolerantietabel, B3 geel-auto-door,
  eventlogging in `lib/repo/matching.ts`).
- **De groene suite** — verwachtingen alleen bijwerken waar een fix het correctere antwoord
  oplevert, altijd met motivering in de commit.
- **Geen `maxDuration`/`vercel.json`** (weerlegd), **geen top-8-fix** (ingetrokken), **geen
  nieuwe regex als "oplossing"** voor O2 (bewezen doodlopend).
- **Testset-PDF's nooit in git** (echte klantdata); fixtures zijn kleine geanonimiseerde
  uittreksels.

## Werkwijze & DoD

- Per stap: `bun vitest run` groen · `bunx tsc --noEmit` schoon · meetscript gedraaid en
  delta gerapporteerd · kleine commit op main, pushen · `HANDOVER.md` bij · events waar
  gedrag bijkomt (ijzeren regel 5).
- **Stop vóór elke productie-deploy en vraag Timo's akkoord.** Draai geen imports op
  productiedossiers; het meetscript is read-only.
- Er werken parallelle sessies: **altijd eerst `git fetch origin`**, redeneer tegen
  `origin/main`.
- Budget: AI-calls loggen in `llm_usage` met eigen `purpose`; bij twijfel over kosten >€1
  per run eerst melden.
- Planning: stap 0–2 horen bij "deze week" (estimate helemaal af); stap 3–7 zijn week 1-werk
  ("de merkgegevens stromen binnen"). Niet alles hoeft in één sessie — na elke stap is de
  keten meetbaar en de repo consistent.
