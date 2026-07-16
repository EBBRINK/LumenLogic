# HANDOVER — Lumen Logic (runs 1–3)

_Bijgewerkt: 2026-07-02. Zie `docs/BUILD-PLAN.md` voor de oorspronkelijke run-1-opdracht._
_2026-07-07: eindbeeld + roadmap runs 4–8 vastgelegd in `docs/MASTERPLAN.md` (plansessie,
geen code gewijzigd)._
_2026-07-07 (later, grill-sessie): koers herzien — Brink-binnendienst als klant nul,
vijfstatussen-regelset als domeinmodel, XIS-koppeling. `docs/MASTERPLAN.md` vervangen;
nieuw: `docs/matching-regelset.md` + `docs/xis-post-api-attributes.md` (voor Lynx-call)._
_2026-07-07 (avond): `docs/FUNCTIONEEL-ONTWERP.md` — alle 78 features getraceerd naar bron,
complete appstructuur, per scherm wireframes met elk knopje, 12 Mermaid-flowdiagrammen,
event-catalogus, rollenmatrix. Bouwsessies: masterplan = koers, functioneel ontwerp = wat/hoe._
_2026-07-07 (nacht): runs 4–6 gebouwd — vijfstatussen-regelset in de kern, review-station,
estimate met totalen-per-kleur, XIS-export, verrijkingspijplijn, /data-werkbank, catalogus,
instellingen + allowlist, import-voorstelscherm. Zie "Runs 4–6" hieronder._
_2026-07-14: estimate-PDF (plan stap 9, B5). Berekenlogica geëxtraheerd naar
`lib/repo/estimate.ts` (één bron voor scherm + PDF; `computeEstimate` is puur,
`getEstimateData` haalt kop + regels), `lib/pdf/estimate.ts` (pdf-lib/Helvetica, A4 staand,
meerpaginasteun, ellipsis, zones + subtotalen, p.m.-sectie), route
`/projecten/[id]/offerte/pdf` (requireSession, event `estimate_pdf_generated`) + knop
"Download PDF" naast de printknop. Aannames: geen logo-asset in `public/` → tekstkop
"Brink Licht" (pdf-lib kan alleen PNG/JPG embedden); prijzen = bruto adviesprijs (B5);
zone-subtotalen staan wél in de PDF, het scherm bleef ongewijzigd. Testkanttekening:
pdf-lib hangt op tslib v1 — in `vitest.config.ts` een klein pre-resolve-plugin
(tslib→es6-build alleen voor pdf-lib) + `optimizeDeps` exclude pdf-lib / include pako._
_2026-07-15 (sprint 0.2 — repo synchroon): `main` liep 58 commits achter op productie
(`origin/main` had al PR #1 i18n + PR #2 OCR). Het datamodel-0007-werk was de enige
on-gemergede eenheid. Geïntegreerd via [PR #3](https://github.com/Timo-AInstein/lumenlogic/pull/3)
(`f5046dd`): `origin/main` → revert van de ontkoppel-commit `aef5a59` (herstelt de
`price-archive`-repolaag) → cherry-pick van de datamodel-WIP `6dc4cef` (schema-kolommen +
migratie 0007 + docs). Migratie `0007_datamodel_productspecs` stond al toegepast op Neon
(14 jul; `__migrations` heeft 0007 t/m 0009; alle kolommen/indexen/`archive.prices_archive`
aanwezig; 0 duplicaten `(brand_id, supplier_article_code)`) — geen migratie gedraaid bij de
merge. Bestandsnaam bewust NIET hernummerd (DB kent "0007" al als toegepast). Verificatie:
`bunx tsc --noEmit` schoon; `bun vitest run` (met `.worktrees` uitgesloten) **509 groen,
0 failures** (58 files); twee onafhankelijke agents (bouw + verify) + git-controle bevestigden
dat OCR (0009) + merkrelaties (0008) byte-identiek behouden bleven en de `schema.ts`-unie
compleet is. Lokale `main` weer synchroon met `origin/main`. Opgeruimd: de gemergede
OCR-worktree in `.worktrees/ocr` verwijderd, `/.worktrees/` toegevoegd aan `.gitignore` en de
`vitest.config.ts`-exclude uitgebreid naar `**/.worktrees/**` (geneste worktrees vervuilden de
testrun — de exclude dekte alleen `**/.claude/**`); daarna 509 tests groen zónder CLI-flag.
De vier bronbranches (`runs-4-6-vijfstatussen`, `english-xis`, `english-xis-ship`,
`datamodel-productspecs`) + de integratiebranch zijn lokaal en op GitHub verwijderd; hun
inhoud zit in `main`. Let op: `datamodel-productspecs` was ge-cherry-pickt, dus de oude SHA
`6dc4cef` is géén voorouder van `main` — de inhoud is dat wel (geverifieerd)._
_2026-07-16 (sprint 0.1 — **AI-vangnet draait live**): het vangnet heeft voor het eerst in
productie gedraaid. Beslissend bewijs: event `ai_vangnet_run` met `checked: 7, suggested: 0,
phase: tender` op dossier **`49c6340e-83d8-45c7-84d9-64fe1f48cb88`** ("ZZ-TEST 0.1 vangnet
16-07"), deploy-SHA **`966191f`** (`dpl_DXy9T3HdreW57HJt4DRCdSAm5RV2`), meetmoment 16 jul
08:56–08:58 UTC. Volledige import van `docs/examples/test-armaturenboek.pdf` → 1 tekstpagina
(géén OCR), 20 spec-regels. **Gemeten kosten: €0,0619** over 21 API-calls (`llm_usage`,
`purpose='vangnet'`); maandtotaal daarmee €0,1641. **Budgetcap staat permanent op €10/maand**
(`app_settings.llm_budget_eur = 10`).
· **`after()` werkt in productie — het maxDuration-risico is weerlegd**: de import was klaar op
08:56:59.708 (`pdf_import`), het vangnet draaide daarna nog **54 s** door (14 `search`-events
met actor `ai:vangnet` van 08:57:01.661 tot 08:57:52.481) en sloot af met `ai_vangnet_run` om
08:57:53.808 — 7 ms na de laatste `llm_usage`-rij. Geen `FUNCTION_INVOCATION_TIMEOUT`, geen
afgekapte run. Er is dus géén `maxDuration`-export of `vercel.json` nodig gebleken.
· **Acceptatiecriterium 2 (budgetstop) afgevinkt** met een gratis probe (€0): cap tijdelijk op
€0,01 → `editSpecLineAction` → `ai_vangnet_skipped_budget` (`budgetEur 0.01, spendEur 0.1022`).
Dat dit event verscheen i.p.v. `ai_vangnet_skipped_no_key` bewijst dat `ANTHROPIC_API_KEY`
zichtbaar is voor de runtime (de no-key-check zit vóór de budgetcheck).
· **Correctie op een eerdere aanname (was F8 in `docs/sprint0-1-ai-vangnet-live.md`)**: de 31
OCR-rijen van 15 jul (€0,1022) komen uit een **lokale `bun dev`-run, niet uit productie** —
`lib/ai/ocr.ts` is aangemaakt om 13:44:15, ná die rijen. `llm_usage` heeft geen omgevingskolom,
dus de DB kan dev niet van prod onderscheiden (dev = prod, één Neon-DB, besluit B1). Trap daar
niet in.
· **`checked: 7` is correct en verklaarbaar**: `selectLines` pakt rood/open + geel-in-review;
4 rood + 3 geel = 7. De 2 blauwe regels bleven terecht buiten beeld omdat het project in
**tender**-fase staat (ijzeren regel 4). Het vangnet raakte **geen enkele status** aan — na de
matcher (08:56:59.686) staat er geen `matched_status` meer; een suggestie is geen beslissing.
· **Nog niet bewezen**: `suggested: 0`, dus het schrijven van een `ai_suggestions`-rij en het
tonen ervan op `/projects/[id]/review` is in productie nog **niet** end-to-end waargenomen.
Nul suggesties is legitiem (het model mag `{"suggesties":[]}` teruggeven) en gold vooraf als
geslaagd, maar dat pad blijft ongetest live.
· Drie fixes meegegaan: `step="0.01"` op het budgetveld (`4c3a849`; met `step="1"` weigerde de
browser €0,01 en was de budgettest onmogelijk) · budget `0` is nu een **echt plafond** i.p.v.
"geen cap" (`7071038`, `overBudget` in `vangnet.ts` + `checkOcrBudget` in `ocr.ts`; alleen
`budget == null` betekent nog "geen cap") · redirect `/dossiers` wees permanent (301) naar de
niet-bestaande route `/projecten` → `/projects` (`966191f`).
· Let op bij vervolgmetingen: de actor van `ai_vangnet_run` is het **ingelogde e-mailadres**,
niet `ai:vangnet` — filter op `action LIKE 'ai_%'`, alleen `search` hardcodeert de actor._
_2026-07-16 (sprint 0.1b — **gemeten: de parser at niets op; `suggested: 0` was eerlijk**):
de meting van stap 2 is uitgevoerd (lokaal, `runVangnet` direct op de prod-DB — zelfde
codepad als productie op `after()` na, dat was al bewezen in 0.1/G7). **Alle 7 regels** van
`49c6340e` gaven `stop_reason=end_turn` en een nette slottekst die eindigt op
`{"suggesties":[]}`; drie ervan (Ld107, Lp601, Lr701) in een ```json-fence. De ongefixte
regex is empirisch tegen die vormen nagedraaid en parseert ze **allemaal correct** — er is
dus **géén parse-mislukking** geweest. Briefingtabel rij 2: het model vond echt niets.
· **WAAROM — en dit is de eigenlijke vondst.** Het model gaf niets omdat het **ijzeren regel
4 gehoorzaamt**. De tender-tak van `systemPrompt` (`vangnet.ts`) zegt letterlijk: *"zoek
uitsluitend het GEVRAAGDE product (zelfde merk en type). Suggesties voor andere merken of
alternatieven zijn hier niet toegestaan."* Het model schreef dat ook terug, bv. Ld202: *"Aangezien
dit een TENDER-fase betreft en ik uitsluitend het exact gevraagde product mag suggereren …"*.
Het vond wél nabije kandidaten (Kreon Holon 80 in-Cana 3000K **30,2W** vs. gevraagd 40W · Axo
Light NEST SEMI-RECESSED 3000K **7W/10W** vs. gevraagd 9W · XAL UNICO **Q4 15,7W** en **WALL 4L
29,8W** vs. gevraagd Q4 30W) en verwierp ze allemaal als "ander type / afwijkend vermogen".
· **Structureel gevolg — lees dit vóór je 0.1b's criterium 3 opnieuw probeert te halen.** Een
regel is rood/open *omdat* de matcher het exacte product niet vond. In tender mag het vangnet
alléén datzelfde exacte product suggereren. Het vangnet zoekt daar dus precies naar wat al
bewezen afwezig is: **`suggested: 0` is in tender bijna tautologisch**. Het is geen tautologie —
de AI kan een naamvariant redden die de token-matcher miste — maar zit het product niet in de
catalogus, dan is 0 het enige juiste antwoord. **Criterium 3 is daarom afgesloten met
onderbouwing i.p.v. met een `ai_suggestions`-rij** (zoals de briefing voorzag: "verzin geen
suggestie"). Een rij afdwingen op dít dossier kan alleen door de fase te forceren — expliciet
verboden in de briefing.
· **De parserfix is er tóch** (criterium 2 eist hem onverkort): `parseSuggestions` gebruikt nu
een string-bewuste, accolade-balancerende matcher die alle kandidaten van achter naar voren
probeert (laatste bruikbare wint, conform de prompt). De gulzige `[\s\S]*` is weg — die rekte
tot de láátste `}` in de tekst en gooide stil zodra het model ná zijn JSON proza met een
accolade schreef. **De bug was latent, niet actief**: in deze run stond de JSON steeds als
laatste. Het liegende commentaar erboven is vervangen door een kloppend commentaar.
· **De stille `catch` laat nu een spoor na.** `ParseOutcome { suggesties, parseFailed }` →
event `ai_suggestion_parse_failed` per regel (payload alléén `reden` + `tekstLengte`, **nooit**
de modeltekst — besluit Timo) + een teller `parseFailed` in de `ai_vangnet_run`-payload
(`events.payload` is jsonb, **geen migratie**). Daarmee is de uitleestabel voortaan een
DB-query: `suggested: 0, parseFailed: 0` = model vond echt niets · `suggested: 0, parseFailed: >0`
= wij konden het niet lezen. Dát onderscheid was vóór 0.1b onmogelijk, en het is waarom
`discarded: 0` nooit bewees wat het leek te bewijzen.
· **Kosten**: de meting kostte €0,0654 (`llm_usage` purpose `vangnet`: 21 → 42 rijen, €0,0619 →
€0,1273). Maandtotaal **€0,2295** van de €10-cap. Geen tweede hermatch nodig gebleken.
· **Criterium 4 (log eruit) is hard geverifieerd**: `grep -rn "console\." lib/ai/` geeft niets —
exact de G5-nulmeting van vóór de sprint. De tijdelijke meetcode en `scripts/meet-0-1b.ts`
bestaan niet meer; ze hebben **nooit in productie gedraaid** (de meting was lokaal, dat scheelde
twee deploys).
· **Nieuw open punt**: beurten-uitputting blijft stil. Raakt `runLine` `MAX_TURNS_PER_LINE`
zonder slottekst, dan is `finalText` leeg → `parseFailed: false` → opnieuw een onverklaarde nul.
G4 bewijst dat dit bij `49c6340e` niet speelde. Zelfde blinde vlek, één laag hoger.
· **Bewust niet gedaan**: de slotbeurt een *tool call* maken (`submit_suggestions`) i.p.v. JSON
in vrije tekst — optie (c) uit de briefing. Reden: het vervangt het modelantwoord door een ánder
antwoord vóórdat je het oude gelezen hebt, en dat vernietigt juist de meting die 0.1b moest doen.
Nu de meting er ligt, is het een schoon apart item; `parseFailed` is de beslisgrond (blijft die
0, dan loont het niet). Ook niet gedaan: de prompt aanraken (ander item — prompt én parser in één
sprint wijzigen maakt een vervolgmeting onuitlegbaar) en de stale comments rond de tijdgrenzen
(besluit Timo: blijft hygiëne-item 2.5)._

## Open punten uit sprint 0.1 — vastgelegd, bewust niet gefixt

Gevonden tijdens 0.1, buiten scope gehouden om de sprint klein te houden. Geen van deze
punten blokkeert het vangnet.

- **De OCR-budgetmelding liegt.** Bij een maandcap-stop toont de UI hardcoded "het €1-boek-
  budget is op" (`app/projects/actions.ts:310-311` plet beide redenen tot één string +
  `components/dossier/pdf-upload-card.tsx:158-160`). Het event in de DB heeft de waarheid.
- **Een OCR-run die op budget stopt is terminaal**: `ocrStatus` gaat naar `gestopt` en
  hervatten kan alleen bij `bezig` — ook nadat de cap weer omhoog gaat.
- **De instellingen-UI spreekt de budget-fix tegen.** Na `7071038` is budget `0` een hard,
  actief afgedwongen plafond, maar `components/settings/llm-budget-block.tsx:24` gebruikt
  `hasBudget = budgetEur != null && budgetEur > 0` en toont bij `0` dus "No monthly cap set" —
  precies het tegenovergestelde van wat er gebeurt. Losse UI-fix waard.
- **Geen test dekt het nieuwe `budget = 0`-gedrag.** `vangnet.test.ts` gebruikt alleen cap `1`,
  `ocr.test.ts` `0.5`, `settings.test.tsx` rendert `budgetEur` `20`/`50`/`null` — nooit `0`.
  De fix is met code-inspectie geverifieerd, maar staat regressie-onbeschermd.
- **Stale comments in `lib/ai/vangnet.ts`** (rond de tijdgrenzen) beweren nog dat de run
  "awaited in de import-respons" wordt. Sinds de `after()`-refactor klopt dat niet — en 0.1
  heeft nu live gemeten dat de run inderdaad ná de response draait (54 s).
- **`VANGNET_MAX_MS` (120 s) is dood beleid** onder `after()`: het is een zachte grens *tussen*
  regels, en de live run haalde 52 s voor 7 regels — één regel kan theoretisch tot ~360 s duren.
- **`getLlmSpend` gebruikt de lokale tijdzone** voor `startOfMonth` (op Vercel UTC) — latente
  bug in de eerste uren van een maand.
- **De maandcap is gedeeld** tussen OCR en vangnet; OCR kan het vangnet wegdrukken.
  `getLlmSpendForPurpose` bestaat al voor een uitsplitsing.
- **Testproject `49c6340e` ("ZZ-TEST 0.1 vangnet 16-07") staat nog in productie** — bewust
  bewaard als bewijsspoor. Opruimen kan met `scripts/cleanup-testdata.ts`.

## Status: runs 4–6 staan — vijfstatussen in de volledige keten

`bun vitest run` → **182 tests groen** (21 files): repo-/engine-tests op een echte PGlite-db
(zelfde migraties + view als productie) + white-box RSC-render/screenshottests van de schermen
(licht/donker × mobiel/desktop). `bunx tsc --noEmit` is schoon voor `app/`, `lib/`,
`components/`, `db/` én `scripts/`. Migratie `0004_vijfstatussen` is toegepast op Neon; de
demo is opnieuw geseed (3 groen · 1 blauw · 1 rood) en end-to-end in de browser geverifieerd
(dossierlijst met kleuren-telling, dossier-tabs, regel-detail met twee kandidatenlijsten +
afwijkingentabel, estimate met totalen-per-kleur + p.m. + open punten, XIS-push-dialoog).

### Runs 4–6 — wat erbij kwam

- **Vijfstatussen-regelset (run 4)** — `match_status`-enum (`open|groen|geel|blauw|rood|paars`)
  vervangt `open/matched/no_match`. De matcher is deterministische code: `lib/matching/
  tolerances.ts` (de tolerantietabel uit `docs/matching-regelset.md`, met Eduard vastgesteld)
  + `lib/matching/engine.ts` (de beslisboom §4.3) + `lib/repo/matching.ts` (persisteert status,
  kandidaten en afwijkingen, logt events, zet blauw op de inlaadwachtrij). **De 7 invarianten
  staan elk in een test** (`lib/matching/engine.test.ts`, `tolerances.test.ts` — 27 tests):
  strengste-telt, IP-nooit-lager, kelvin-exact, ontbrekend≠afwijkend, niets weggelaten,
  aanvraagvolgorde, geen prijs in de ranking.
- **Twee-lijsten-presentatie + transparantie** — regel-detail (`/dossiers/[id]/regel/[lineId]`)
  toont "voldoet aantoonbaar" vs "mogelijk — data onvolledig", een afwijkingentabel per
  gevraagd veld (ook binnen groen), en rood/blauw/paars-knoppen + dagprijs-flow.
- **Review-station (run 4)** — `/dossiers/[id]/review`: geel-review, variantkeuze,
  onvolledig-bevestiging, OCR-controle; elke beslissing met actor + reden. Tab-badge toont
  het aantal wachtende items.
- **Estimate (run 4)** — `/dossiers/[id]/offerte`: kopblok, zone-groepering, totalen groen+geel
  apart én samen, blauw/rood/paars als p.m. (nooit opgeteld), automatische open-punten +
  merken-inladen-lijst, print-CSS met kleuren óók als woord.
- **Import-voorstelscherm (run 4)** — `import_runs` + `/dossiers/[id]/import/[runId]`:
  bewerkbare voorstel-tabel, OCR/LLM-rijen standaard uitgevinkt, niets stil weggeschreven.
- **Allowlist + instellingen (run 4)** — `allowed_emails`; magic-link stuurt alleen naar
  toegestane adressen (zelfde succesmelding, geen account-enumeratie). `/instellingen`:
  gebruikers, LLM-budgetcap + teller, XIS-sleutel + sandbox-schakelaar.
- **Verrijkingspijplijn + /data-werkbank (run 5)** — `lib/enrichment/parser.ts` (deterministische
  naam-parser) + `lib/repo/enrichment.ts` (run → steekproef → publiceren → hermatch) +
  `lib/repo/evaluation.ts` (hit-rate op de evaluatieset). Schermen: `/data/verrijking`,
  `/data/inladen` (blauw-wachtrij), `/data/prijslijsten` (verloopt-binnenkort/dekkingsgaten),
  `/data/evaluatie`.
- **XIS-export (run 6)** — `lib/repo/xis.ts`: `buildXisPayload` (aanvraagvolgorde,
  `external_reference` = dossier-id, classificatie product/tekstregel/nieuw-product),
  `createXisExport` (idempotent op dossier-id, snapshot in `xis_exports`, sandbox default).
  Push-dialoog met pre-flight op de estimate-tab. De echte Lynx-API bestaat nog niet — dit is
  het exportbestand in het toekomstige payload-formaat.
- **Catalogus + hoofdnav** — `/catalogus` (los zoeken, merk-eerst, twee lijsten); dunne
  hoofdbalk Dossiers · Catalogus · Data · Analytics · Instellingen.

### Feature-traceability — §1 van `docs/FUNCTIONEEL-ONTWERP.md`

Elke 🔨-feature (V1, runs 4–6) uit de inventaris, getraceerd naar code. ✅ = gebouwd +
getest · ◑ = gebouwd met bewuste beperking · ⏳ = uitgesteld (reden erbij). De ⏳-features
uit §1 (H2/H3) vallen buiten deze runs.

| # | Feature | Status | Bewijs / noot |
|---|---|---|---|
| A-02 | Dossierlijst met kleuren-telling | ✅ | `StatusTally` in `dossier-list.tsx`, `getStatusCounts` |
| A-04 | Faseovergang = gelogde actie + dialoog | ✅ | `phase-toggle.tsx` (bevestigingsdialoog), event `phase_changed` |
| A-06 | Boek + bestek koppelen op code | ✅ | PDF-import + `linkQuantities`/`parseBestek` (tekening = H2) |
| A-07 | Aantal ontbreekt → stukprijs-modus | ✅ | `quantity` nullable, "p/st" op estimate |
| A-08 | Zone/ruimte-veld + groepering | ✅ | `zone`-kolom, zone-groepering in `quote-view` |
| A-09 | Offertenummer BL-{jaar}-{4} | ✅ | `nextQuoteNumber` in `generateQuote`; toegekend + bewaard (BL-2026-0001) |
| A-10 | Kopblok bewerkbaar | ✅ | `updateQuoteHeader` + "Kopblok bewerken"-form op de estimate-tab |
| B-04 | OCR-route beeld-PDF | ⏳ | Geen OCR-lib aangesloten; PDF-import leest alleen tekstlaag, meldt eerlijk als die ontbreekt. Volgende stap. |
| B-05 | LLM-fallback rommelige PDF | ⏳ | Geen LLM-key; deterministische segmentatie draait, LLM-fallback is een latere stap |
| B-06 | Voorstel-scherm vóór opslaan | ✅ | `import_runs` + `/import/[runId]`, niets stil weggeschreven |
| B-07 | Herkomst per regel zichtbaar | ✅ | `source`-veld, getoond in regel-detail |
| B-08 | Bestek/telstaat-import | ✅ | `parseBestek` + `linkQuantities` |
| B-09 | 10 kernvelden per regel | ✅ | alle `req_*`-velden in schema + invoer- + bewerk-form |
| B-10 | Regels bewerken (edit) | ✅ | `updateSpecLine` + "Regel bewerken"-form → matcher draait opnieuw |
| C-02 | SKU-normalisatie | ✅ | `normalizeSku`, getest |
| C-04 | Parametrisch matchen binnen merk | ✅ | `engine.ts` |
| C-05..C-07 | Vijfstatussen + tolerantie + transparantie | ✅ | `tolerances.ts`/`engine.ts`, 27 invariant-tests |
| C-08 | Twee gescheiden lijsten | ✅ | provable/incomplete in regel-detail |
| C-09 | 3–5 zoekhypotheses vóór "niet gevonden" | ◑ | deterministische deeltermen-fallback in `engine.ts`; LLM-hypotheses = latere stap |
| C-10 | Kandidaten persistent | ✅ | `spec_line_candidates` |
| C-11/C-12 | Aanvraagvolgorde heilig / niets weglaten | ✅ | tests |
| C-13 | Varianten tonen | ⏳ | variantkeuze zit in het review-station (D-02/03); een los "beschikbare varianten"-blok vergt kleur-/optiek-groepering die de brondata niet levert |
| C-14 | Custom-config-notitie bij rood | ✅ | rood-knop met notitie in regel-detail |
| D-01..D-06 | Review-station | ✅ | `/review` + `review-queue.tsx`, elke beslissing met actor + reden |
| E-01..E-05 | Estimate + totalen/telling/inladen/open-punten | ✅ | `quote-view.tsx` (geverifieerd: groen €7.286, blauw/rood p.m.) |
| E-07 | Live herberekening bij aantal | ◑ | `setQuantityAction` (server-action + revalidate), geen client-live-herberekening |
| E-08 | Print / PDF | ◑ | print-CSS via `PrintButton` (browser → PDF); een los PDF-bestand met `pdf-lib` is optioneel |
| E-09..E-12 | XIS-push + administratie | ✅ | `lib/repo/xis.ts` + push-dialoog; API stubbed als exportbestand (Lynx bouwt nog) |
| G-01 | Gecodeerd armaturenboek | ✅ | `/armaturenboek` |
| H-03 | Naam-parser | ✅ | `lib/enrichment/parser.ts`, 12 tests |
| H-04 | LLM-verrijking restgroep | ⏳ | Geen LLM-key; parser-route draait, budget-teller staat klaar |
| H-05..H-09 | Steekproef-UI / volgorde / evaluatie / inladen / tier2_source | ✅ | `/data/*` + `lib/repo/enrichment.ts` + `evaluation.ts` |
| I-03 | Dekkingsgat-alert | ✅ | `/data/prijslijsten` |
| I-04 | Dagprijs-werkstroom | ✅ | `setDayPrice` + regel-detail-blok |
| K-02/K-03/K-06 | Consideration / afwijzingsreden / hit-rate | ✅ | events `product_considered`, redenvelden, `/data/evaluatie` |
| L-01 | Magic-link (mail) | ◑ | werkt via serverconsole; mail-provider (Resend) nog niet aangesloten |
| L-02 | Allowlist 2–5 gebruikers | ✅ | `allowed_emails` + gate in `lib/auth.ts` + `/instellingen` |
| L-06 | LLM-budget + teller | ◑ | UI + `llm_usage`-tabel klaar; teller staat op €0 zolang er geen LLM-calls zijn |

Kort: alle 🔨-features zijn gebouwd, op **vier bewuste beperkingen** na, alle door één
oorzaak — er is nog geen LLM- of mail-key en geen OCR-lib aangesloten: **B-04** (OCR),
**B-05/H-04** (LLM), **L-01** (mail). Plus **C-13** (varianten-blok, brondata-beperkt).
Deze zijn hierboven expliciet als ⏳/◑ gemarkeerd, niet stilzwijgend overgeslagen.

### Latere horizon (H2/H3) — nu óók gebouwd

De ⏳-features uit §1 (H2/H3) én de latere-horizon-schermen (§3.16) zijn ingebouwd.
`bun vitest run` → **294 tests groen** (34 files); `tsc` schoon. Migratie `0005_h2_h3` op
Neon; end-to-end in de browser geverifieerd (productdetail met disclosure, dossierlijst met
lifecycle-filter + org-veld, `/instellingen/organisatie`, `/merk/dashboard`, `/admin/merken`).

| # | Feature (H2/H3) | Status | Bewijs / noot |
|---|---|---|---|
| L-03/04 | Organisaties, memberships & rollen (petten) | ✅ | `lib/repo/orgs.ts`, `/instellingen/organisatie`; rol = default-view, nooit de engine |
| L-05 | Prijsmodel (abonnement/per-dossier) | ◑ | `organizations.plan` + seat_limit als datamodel; facturatie zelf = extern |
| A-05 | Dossier-lifecycle delivered/archived + reden | ✅ | `lib/repo/lifecycle.ts`, lifecycle-controls + read-only-banner + fase/lifecycle-filter |
| J-01/02 | Disclosure-tiers + projectgebonden prijs | ✅ | `lib/repo/disclosure.ts` (beslisboom §4.11, getest), `visible_specs`-view, `/producten/[id]` |
| J-03 | Prijsaanvraag-knop = lead | ✅ | tier2-gated → "Prijs via Brink aanvragen" → `leads` + lead-event |
| J-04 | Per-veld-zichtbaarheid | ✅ | `brand_field_visibility` + `fieldVisible`; beheerbaar in `/admin/merken` |
| J-05 | Vergelijk-tray zonder prijzen | ✅ | `compare-tray.tsx` (max 4, prijsvrij) |
| F-06 | Substitutievoorstel-document | ✅ | `lib/repo/substitution.ts` + printbaar document veld-voor-voor-veld + duurzaamheidswinst |
| F-07 | Systeemalternatieven | ◑ | heuristische cross-categorie-suggestie (zone + aantal), gemarkeerd "voorstel" |
| F-08 | Besparing tonen, nooit sorteren | ✅ | prijsverschil als tekst in `saving_note`, geen ranking op prijs |
| G-02 | Versiebeheer armaturenboek | ✅ | `armaturenboek_versions` + snapshot + diff-weergave |
| G-03 | Locatie per regel (WAAR) | ✅ | `spec_lines.location` + in versiehistorie |
| G-04 | Datasheets als bijlage | ✅ | `product_datasheets` + weergave |
| I-05 | Staffelprijzen | ✅ | `price_tiers` + `getPriceForQty` (hoogste drempel ≤ aantal) |
| H-10 | PDL-import (Connecting the Dots) | ◑ | als staging-import in `/admin/imports` (echte PDL-sync = externe koppeling) |
| H-11 | Eén publicatiepad via staging→goedkeuring | ✅ | `brand_uploads` + goedkeuren/afwijzen in `/admin/imports` |
| K-05 | Merk-dashboard (geaggregeerd) | ✅ | materialized view `mv_brand_considerations` (aggregatie = anonimiseringsgrens), `/merk/dashboard` |

Gedeelde kern-contracten die alle H2/H3-schermen delen: `lib/repo/orgs.ts`,
`lib/repo/disclosure.ts` (met `disclosure.test.ts`) en `lib/repo/lifecycle.ts`.

Resterend na H2/H3 (echt extern-afhankelijk, gemarkeerd ◑): mail-provider (L-01),
LLM (B-05/H-04), OCR (B-04), echte facturatie (L-05) en de echte PDL-sync (H-10). Datamodel
en UI staan klaar; alleen de externe koppeling/sleutel ontbreekt.

### Aannames / open eindes runs 4–6

- `open` blijft de zesde status ("nog niet gematcht"); `paars` telt in `STATUS.countsInTotal`
  als "wél tonen", maar op de estimate staat het als p.m. (niet opgeteld) — bewust.
- CRI en dimbaarheid staan niet in de tolerantietabel van de regelset; keuze in `tolerances.ts`:
  CRI lager dan gevraagd = rood (minimum-eis), afwijkend dim-protocol = geel. Herijken met Eduard.
- Variant-kleuren in het review-station zijn een vaste lijst (wit/zwart/grijs/aluminium) omdat
  er geen kleur-enum in het schema staat — makkelijk te vervangen.
- LLM-verrijking (H-04) is nog niet aangesloten; de parser-route draait deterministisch.
  ~~Geen key~~ — achterhaald sinds 16 jul: `ANTHROPIC_API_KEY` staat in Vercel (Production) en
  is bewezen zichtbaar voor de runtime; het AI-vangnet draait live. Budgetteller (`llm_usage`)
  en cap staan op `/settings` (**niet** `/instellingen` — i18n-slag), cap = €10/maand.
- Vorm (`req_shape`) en beam angle worden pas echt bruikbaar zodra run 5-verrijking die velden
  op producten vult; de matcher behandelt ze nu meestal als "geen data" (grijze vlag).

## Status: het complete Lumen Logic staat (runs 1–3)

### De drie rollen (driekoppige gebruiker) — compleet
- **Calculator** → geprijsde tender-inschrijving. Engine in tender-stand (spec-getrouw,
  geen suggesties). `/dossiers/[id]/offerte`.
- **Werkvoorbereider** → value-engineering ná gunning. `/dossiers/[id]/werkvoorbereiding`
  (alleen in gegund-stand).
- **Projectleider** → gecodeerd armaturenboek. `/dossiers/[id]/armaturenboek`.

### De vijf ijzeren regels — in code én in tests
1. **Geen webshop** — geen winkelwagen/checkout/publieke prijzen.
2. **Geld nooit in de ranking** — matching (`lib/repo/products.ts`) én de vergelijkings-
   engine (`lib/repo/equivalence.ts`) sorteren puur op objectieve velden; prijs wordt
   getoond, nooit gesorteerd. Aparte test bewijst dit.
3. **Verlopen prijslijst = onzichtbaar** — centrale view `visible_products`; alle zoek-/
   engine-code leest enkel hieruit. Bewezen voor zoeken, exacte SKU én de engine.
4. **Default = veilig** — dossier-fase default `tender`; `getEquivalentAlternatives` geeft
   in tender altijd `[]`. Bewezen in repo- én UI-tests.
5. **Event-log vanaf dag één** — elke search/match/no-match/offerte/suggestie/PDF-import
   in `events`; de `/analytics`-view maakt er het Fase-2-fundament van.

### Run 1 — fundament (af)
Datamodel · import van **211.310 echte XIS-producten** · calculatorflow (dossiers,
spec-regels los + CSV-plak, matchen, printbare offerte).

### Run 2 — PDF-import + armaturenboek (af)
- **Armaturenboek-export** (projectleider): gecodeerd, printbaar overdrachtsdocument.
- **PDF-import** (`lib/pdf/armaturenboek.ts`): leest de inhoudsopgave-tekstlaag van een
  geüpload armaturenboek, segmenteert op armatuurcodes en splitst merk/type via de
  merkenlijst. ⚠️ Het Deerns-voorbeeld in `docs/examples/…ANN…pdf` is als **beeld/outline**
  geëxporteerd en heeft géén tekstlaag — daar valt niets uit te parsen (de UI meldt dat
  eerlijk). Voor de live demo genereert `bun scripts/gen-demo-pdf.ts` een tekst-PDF
  (`docs/examples/demo-armaturenboek.pdf`) die de import wél leest (7 regels).

### Run 3 — fase-bewuste gelijkwaardigheidsengine (af)
- **Engine** (`lib/repo/equivalence.ts`) — "scheidsrechter, geen rechter": rangschikt
  alternatieven op objectieve merk-velden (categorie, kelvin, CRI, IP) + duurzaamheid
  (garantie, repareerbaarheid, EPD) als tiebreak, **nooit prijs**. Toont de bron
  ("merk-opgave") en eerlijk "geen data" bij ontbrekende cijfers. Alleen in gegund-stand.
- **Werkvoorbereidersview** met objectieve vergelijkingstabellen per gematchte regel.

## DoD-demo (klaargezet in Neon)
`bun run seed:demo` → `bun run seed:scenario` zet het Deerns-dossier klaar en valideert de
volledige pijplijn end-to-end. Na inloggen ziet Timo het dossier met 3 matches + 2 nette
no-matches; op “gegund” toont de werkvoorbereider cross-merk groenere gelijkwaardigen.

## Aannames & keuzes onderweg
- **Prijsgeldigheid:** bron heeft geen datum → prijslijst `valid_until = 2026-12-31`. Eén
  prijslijst per merk (staffels = later). Zichtbaarheid vereist een geldige prijs.
- **Categorie- en duurzaamheidsdata ontbreekt in de bron** (`category_path` op 19 van 211k
  rijen, duurzaamheid leeg). De engine/architectuur zijn daarop gebouwd; de data komt in
  productie van de merken. Voor de demo zetten `seed:scenario` (cross-merk spots-scenario)
  en `seed:sustainability` **synthetische, duidelijk-gemarkeerde** categorie/kelvin/
  duurzaamheidscijfers op een kleine set producten, zodat de engine zichtbaar werkt.
- **Eigen HTTP-migrator** (`bun run db:migrate`) i.p.v. drizzle-kit's ws-driver (hing hier).
- **Better Auth via de Drizzle-adapter** (pg-provider mist het `pg`-pakket). Magic link →
  serverconsole (op Vercel: functie-logs).
- **Testomgeving-compat:** geteste componenten zijn server-safe (lucide → lokale inline-
  SVG's; shadcn Slot direct uit `@radix-ui/react-slot`; `Table` niet meer `"use client"`).

## Nodig voor de live Vercel-demo
- **`DATABASE_URL`** — Neon (al gevuld; migraties + import + seeds hiertegen gedraaid).
- **`BETTER_AUTH_SECRET`** — staat lokaal in `.env.local`; **zet dezelfde waarde als Vercel
  project-env**, anders werkt de magic-link-login op de deploy niet.
- Schone DB opbouwen: `db:migrate` → `import` → `seed:demo` → `seed:scenario`.

## Commando's
`bun dev` · `bun run test` · `bun run db:migrate` · `bun run import` · `bun run seed:demo`
· `bun run seed:scenario` · `bun run seed:sustainability` · `bun scripts/gen-demo-pdf.ts`

## Bewust NIET gedaan / vervolg
- OCR voor beeld-geëxporteerde PDF-armaturenboeken (zoals het Deerns-voorbeeld) — nu een
  eerlijke melding; OCR-pijplijn is een volgende stap.
- Echte merk-duurzaamheidsdata (PDL/ConnectingTheDots-koppeling), staffelprijzen,
  disclosure-tier-gating in de UI, rollen & rechten, Elasticsearch (richting 3M SKU's).
- Client-side navigatie (`next/link`) in de twee lijst-componenten die nu `<a>` gebruiken.

## Review-pass (Fable, 2026-07-02)
Frisse-ogen-review na oplevering; drie fixes doorgevoerd (43 tests groen):
- **Matching**: prefix-bonus in de fuzzy-ranking — het armatuur ("SASSO 100 SQ SP CEIL…")
  wint nu van accessoires die de familienaam middenin noemen ("SNOOT … FOR SASSO 100").
  `seed:demo` matcht Lp301 daardoor direct aan het echte armatuur. Nog steeds puur tekst.
- **CSV-plak**: meegeplakte kolomkop ("code, aantal, merk, type") wordt overgeslagen.
- **Analytics**: uuid-cast op `payload->>'productId'` afgeschermd met een regex-guard —
  één afwijkend event kan de pagina niet meer breken.

## Open eindes
- RLS staat uit op de bron-Supabase — bekend, niet van ons (alleen-lezen bron).
- Eén gebruiker (Timo), geen rollen; rollen komen bij een echte multi-user-uitrol.

## Status- en fasemodel (B6 stap 4, 2026-07-14)
`phase` (tender/awarded) is nu AFGELEID met één schrijver: `lib/repo/project-status.ts`
(`derivePhase`: awarded alléén bij status `gegund` óf xis_phase ∈ {deal_making, deliver,
aftersales, win}). Phase-toggle, `setDossierPhase` en de lifecycle-code (controls, filter,
`lib/repo/lifecycle.ts`) zijn verwijderd; alles draait op `status`. Bewuste keuzes:
- **lifecycle-kolom** blijft in het schema staan (deprecated, wordt niet meer beschreven of
  gelezen); oude `lifecycle_changed`-events blijven historie.
- **deliveredAt wordt genegeerd** bij status `gegund`: het hoorde bij het oude
  lifecycle-"opgeleverd" (armaturenboek overgedragen) en dat is niet hetzelfde als gunning.
  Het gunningsmoment staat in het `status_changed`-event. Kolom deprecated, blijft staan.
- **Read-only alléén bij archief** — bestaande "opgeleverde" dossiers (backfill 0006 →
  status gegund) zijn daarmee weer bewerkbaar (bewust, zie plan B6).
- `setStatus` naar `estimate_gestuurd` bevriest een bestaande, nog niet bevroren estimate
  (I-06) + `quote_frozen`-event; zonder quote gebeurt er niets.

## Review-kaarten (stap 7, 2026-07-14)
Herontwerp §4: review alleen bij échte keuzes, en elke bevestigende keuze telt als
menskeuze. Bewuste besluiten:
- **Accepteer → groen** (was: bleef geel). Élke bevestigende review-beslissing
  (accepteer voorstel, "welke van deze N", kleurvariant, handmatig linken) maakt de
  regel groen mét merkteken "handmatig gekozen" (chosenBy = actor); de oorspronkelijke
  afwijkingen blijven als notitie op regel + estimate + PDF staan (C-07).
  'gecontroleerd' (OCR) en 'bevestigd' (onvolledig) blijven status-neutraal — daar is
  de match al gekozen of gaat het om de bron, niet om een productkeuze.
- **Badge-telling**: rode regels zonder match tellen mee als 'wachtend' in de
  Review-tab-badge — de review-pagina bevat er werk voor (sectie "Niet gevonden —
  handmatig linken"). Na het linken is de regel groen en valt hij uit de telling;
  het audit-spoor leeft in events (`manual_link`) + chosenBy/chosenReason.
  Uitzondering (reviewer-bevinding): regels mét een reviewKind — zoals een
  afgewezen gele regel — blijven alleen in "Afgerond" en tellen niet als wachtend;
  handmatig linken kan dan nog via het regel-detail ("Andere match").
- **Kleurvarianten**: échte zusterproducten (zelfde merk, zelfde naam minus
  kleur-token) uit `visible_products`. De kleur-tokens (EN+NL woordenlijst, ook
  samengesteld "BLACK/GOLD") leven in de naam-parser (`lib/enrichment/parser.ts`,
  `extractColorTokens`) — bewust conservatief: alleen hele kleurwoorden, nooit codes;
  nul varianten → fallback op de kandidatenlijst, nooit een verzonnen kleur.
- **N-keuze-drempel**: de "welke van deze N"-kaart verschijnt bij ≥2 schone kandidaten
  (lijst 'aantoonbaar' — volledig beoordeelbaar, geen rood/onbekend); max 4 knoppen.
- **Kandidaat-record bij niet-getoetste keuze**: een gekozen zuster/gelinkt product dat
  nog geen kandidaat was krijgt een record in lijst 'onvolledig' met lege verdicts —
  "aantoonbaar" zou liegen (C-08); de mens was hier de toetser.
- **Rood-kaart is fase-veilig** (ijzeren regel 4): het systeem toont er nooit
  suggesties; de resultatenlijst verschijnt pas na een eigen zoekactie (GET-formulier
  → `searchProducts`, dat zelf logt).

## Onderdeel Aanvraag→Estimate — afgerond 2026-07-14

Plan: `docs/plan-aanvraag-estimate.md` (B1–B6); herontwerp + nulmeting in de vault
(`projects/lumenlogic/onderdelen/aanvraag-tot-estimate.md`). Alle tien bouwstappen staan.

### Wat er gebouwd is (stappen 1–9 samengevat)

1. **Hernoemen "Projecten"** — routes `/dossiers` → `/projecten` (permanente redirect),
   alle UI-labels; DB-tabellen en code-identifiers bewust níét (B1, zie besluiten).
2. **Cleanup-testdata-script** — `scripts/cleanup-testdata.ts`: Van Dijk-org + leden weg,
   Flos → tier-1; dry-run default, `--apply` vereist, idempotent, events gelogd.
3. **Migratie 0006** (additief + backfill in één transactie) — kolommen `status` en
   `xis_phase` op `project_dossiers`, `raw_markdown` op `import_runs`, tabel `ai_suggestions`.
4. **Status/fasemodel** — `lib/repo/project-status.ts` is de éne schrijver van `phase`
   (`derivePhase`); statusfilter, XIS-fasen in het formulier, "Markeer als gestuurd"
   bevriest de quote (I-06).
5. **PDF-upload bovenaan + md-controlespoor** — upload als eerste blok; de volledige
   tekstlaag als markdown ("## Pagina N", cap ~2 MB) opgeslagen, toonbaar en downloadbaar
   per importrun.
6. **Geel auto-door (B3)** — `pickUnambiguousYellow` in de engine (puur, deterministisch):
   precies één schoon-gele kandidaat zonder keuzeveld-afwijking → match direct gezet,
   `chosenBy='system:auto'`, label "automatisch geaccepteerde bijna-match", event
   `near_match_auto_accepted`. Ambiguïteit → gewoon review.
7. **Review-kaarten** — echte kleurvarianten (zusterproduct-query), "welke van deze N",
   inline catalogus-zoeker op rood-kaarten; élke bevestigende keuze → groen mét merkteken
   "handmatig gekozen" (zie "Review-kaarten (stap 7)" hierboven).
8. **AI-vangnet (B4)** — `lib/ai/vangnet.ts` (`@anthropic-ai/sdk`, claude-haiku): automatisch
   na import/hermatch over alléén de restregels; drie read-only tools uitsluitend op
   `visible_products` (regel 3), nooit prijs (regel 2), tender = server-side merkvergrendeling
   (regel 4); suggesties-only, budgetstop via `llm_budget_eur`/`llm_usage`, alles in events.
9. **Estimate-PDF (B5)** — `lib/repo/estimate.ts` (`computeEstimate`, één bron voor scherm
   én PDF) + `lib/pdf/estimate.ts` (pdf-lib) + downloadroute; getest op terugleesbare tekst.

**Stap 10 — acceptatietest**: `tests/acceptatie-aanvraag-estimate.test.ts` — de hele keten
op PGlite met het échte `docs/examples/test-armaturenboek.pdf` (20 regels): project →
PDF-import (incl. markdown-spoor) → matcher (9 groen · 5 geel · 2 rood · 2 blauw · 2 paars;
van de gele gaan er 3 auto-door en blijven er 2 in review) → vangnet met gemockte client
(suggesties, statussen onaangetast) → review (accepteer/variant/handmatig linken) →
estimate-PDF terugleesbaar (offertenummer, totalen, p.m., beide merktekens) → statusflow
(estimate_gestuurd bevriest; gegund → awarded) → audittrail-asserts over de hele keten.

### Bewuste besluiten

- **B1-compromis naamgeving**: UI + routes zeggen "Project"; DB-tabellen
  (`project_dossiers`), code-identifiers en de events-historie blijven "dossier" —
  gedeelde Neon-DB, audit-log niet herschrijven. Commentaarkop "UI-naam: Project" in
  schema/repo's.
- **Fase-grens AI (B4)**: het vangnet zoekt in tender uitsluitend het gevraagde product —
  de merkvergrendeling zit in de tool-implementatie (server-side), niet alleen in de
  prompt; blauw-suggesties bestaan alleen bij `awarded`. De matcher-engine blijft LLM- en
  fase-vrij.
- **Backfill-aannames (0006)**: actief + bevroren quote → `estimate_gestuurd`; actief →
  `concept`; delivered → `gegund`; archived → `archief`; fase awarded → xis `deal_making`.
- **Review → groen**: élke bevestigende review-keuze maakt de regel groen mét merkteken
  "handmatig gekozen"; de oorspronkelijke afwijkingen blijven benoemd (C-07).
- **deliveredAt genegeerd** bij status `gegund` (hoorde bij het oude lifecycle-"opgeleverd");
  kolom blijft deprecated staan, het gunningsmoment leeft in het `status_changed`-event.
- **Read-only alléén bij archief**: bestaande "opgeleverde" dossiers zijn weer bewerkbaar.
- **EUR≈USD-kostenaanname**: de vangnet-budgetteller rekent bewust conservatief 1 USD ≈ 1 EUR
  (haiku $1/M in · $5/M uit), zodat `llm_usage.cost_eur` nooit te laag telt.
- **Groene regels krijgen géén automatische match**: alleen de B3-auto-door zet een match
  zonder mens; een groene regel telt pas mee in de totalen nadat iemand de kandidaat koos.

### Open punten

- ~~**`ANTHROPIC_API_KEY` ontbreekt nog**~~ — ✅ **opgelost 16 jul (sprint 0.1)**: key staat in
  `.env.local` én als Vercel-env; het vangnet draait aantoonbaar live. Zie de entry van
  2026-07-16 bovenaan. *(Stond hier als open punt sinds 14 jul; niet verwijderd maar
  doorgestreept — de rest van deze sectie beschrijft de stand van 14 jul.)*
- ~~**Resend/mailprovider**~~ — ❌ **vervallen 16 jul** (besluit 6): géén mailverzending vanuit
  Lumen Logic deze sprintperiode. Onboarding gaat via **PIN → wachtwoord** (besluit Timo
  16 jul): Brink maakt het account aan met een tijdelijke PIN, de gebruiker vult die in en
  kiest direct een wachtwoord; dat wachtwoord zijn daarna de inloggegevens. Wachtwoord
  vergeten = Brink geeft een nieuwe PIN (zelfde pad, geen apart resetmechanisme). Intern gaat
  de magic link nog via de serverconsole (L-01).
- **Echte XIS-API** — export is een idempotent snapshot in het payload-formaat; de echte
  Lynx-POST wacht op API-keys (extern).

## Onderdeel OCR voor beeld-PDF's — werkend af 2026-07-15

Plan: `docs/plan-ocr-beeld-pdf.md` (B1–B10, bouwstappen 1–8). Een armaturenboek dat als
beeld geëxporteerd is (0 tekens tekstlaag, zoals het echte Deerns-boek) wordt nu wél
geïmporteerd: client-side rasterisatie (pdfjs uit unpdf, 1568 px langste zijde) → per
pagina server-action → Claude-vision (Haiku, geforceerde `lever_regels`-tool, "verzin
niets") → dezelfde deterministische pipeline (splitBrandType → parseProductName →
matcher) → verplichte review.

### Wat werkt

- **Keten**: upload-kaart detecteert beeld-PDF → `startOcrRun` → client-loop per pagina
  (voortgang, hervatten na dichtgeklapte tab via `unique(run,page)` als lock, B5) →
  `finishOcrRun` met eerlijk transcript ("OCR transcript (model output)", B6 — de échte
  bron zijn de opgeslagen paginabeelden, geserveerd via
  `/projects/[id]/ocr-image/[runId]/[page]` met sessie- + eigendomscheck).
- **€1-plafond per boek hard** (B4): beeldrij éérst (lock), dan reservering (€0,02) in
  `llm_usage` (purpose 'ocr', mét `import_run_id`), na de call bijgewerkt naar echte
  tokenkosten. Effectief plafond: €1 + hooguit één paginaprijs. Maandbudget (L-06)
  geldt daarnaast; uitsplitsing "Of which OCR" op /settings.
- **Review-semantiek (B7)**: elke OCR-regel zonder matcher-flag krijgt reviewKind 'ocr'
  (`sourceConfidence` constant 'middel'; ongeldig codeformaat 'laag'); matcher-geel
  houdt 'geel' — "OCR goed gelezen" en "match akkoord" zijn twee besluiten, één review
  per regel. Rode regels keren ná de afgeronde OCR-review terug in de
  handmatig-linken-werkvoorraad (versoepeling in `getRedLinkLines`/badge).
- **Vangnet-gating (B8, hard)**: `selectLines` in `lib/ai/vangnet.ts` sluit regels met
  een ÓPEN OCR-review uit — een verhallucineerd merk mag nooit de merkvergrendelde
  zoektool sturen vóór een mens de bron zag. `finishOcrRun` triggert het vangnet NIET;
  de trigger zit in `decideReview` (repo-laag, zelfde `triggerVangnet`-patroon als de
  imports) en vuurt alleen bij de overgang open → afgerond van een 'ocr'-review.
- **OCR-review-UI**: de bestaande OcrCard in de review-wachtrij, verrijkt met het
  paginanummer + "View page image"-link (nieuw tabblad) naar het opgeslagen paginabeeld.
- **Acceptatietest**: `tests/acceptatie-ocr.test.ts` — hele keten op PGlite met
  gemockte vision-client (groen/geel/rood, dedupe, transcript, kosten mét importRunId,
  events-keten, B8-gating vóór en trigger ná review, quote + estimate-PDF met de
  OCR-regels in stukprijs-modus).

### Bewuste besluiten & open eindes

- **Tinder-deck geparkeerd op Timo's verzoek** ("ik kom eerst met voorbeelden") — de
  bestaande OcrCard is voorlopig dé OCR-review. Het deck (paginabeeld naast waarden,
  sneltoetsen, inline corrigeren) staat beschreven in het plan (B7) en kan er later op.
- **Uitsnedes/bounding boxes per regel** = latere verfijning (open einde in het plan);
  nu linkt de kaart naar het hele paginabeeld.
- **no_key-gedrag**: zonder `ANTHROPIC_API_KEY` slaat een pagina netjes over
  (`ocr_skipped_no_key`), de zojuist geplaatste beeldrij wordt weer verwijderd (anders
  zou hervatten die pagina voorgoed overslaan) en de run blijft 'bezig' — key zetten →
  hervatten werkt. Budget op → run terminaal 'gestopt'.
- **Migratie `0009_ocr` is nog NIET op Neon toegepast** (ocr_page_images,
  llm_usage.import_run_id, ocr_status) — eerst mergen, dan migreren.
- **Hervatten**: openstaande run → "Resume OCR (N of M pages done)" op de upload-kaart;
  idempotent dankzij de beeldrij-lock (dubbel gestuurde pagina kost nooit dubbel).
- **Follow-ups uit de CodeRabbit-review op PR #2** (bewust uitgesteld — alle drie
  niet-optredend zolang er één gebruiker is en de client-loop strikt sequentieel
  stuurt; oppakken zodra er meerdere gebruikers komen):
  - Resume-herkenning op filename+pageCount is zwak — een ánder boek met dezelfde
    naam en paginatelling hervat de verkeerde run. Beter: content-fingerprint
    (hash van de PDF-bytes) op de run.
  - `startOcrRun` heeft een get-or-create-race: twee gelijktijdige starts voor
    hetzelfde dossier+bestand kunnen elk een eigen run beginnen. Beter: unieke
    index of advisory lock rond het get-or-create.
  - Page-commits (run.rows/counts bijwerken in `processOcrPage`) zijn niet
    geserialiseerd — twee parallelle tabs op dezelfde run kunnen elkaars
    snapshot overschrijven (last-writer-wins). Beter: rij-lock of UPDATE met
    jsonb-append i.p.v. read-modify-write.
  Het €0,99+€0,02-plafondpunt uit dezelfde review is bestaand, gedocumenteerd
  ontwerp (effectief plafond €1 + hooguit één paginaprijs) — geen actie.

### Item A: rijkste-wint-dedup (ToC verdringt specs) — 2026-07-15

Volledige probleemomschrijving en besluit: `docs/probleem-ocr-toc-verdringt-specs.md`.
Samengevat: `processOcrPage` upgrade't een bestaande OCR-regel (zelfde run+fixtureCode)
zodra een latere pagina een rijkere lezing oplevert (meer ingevulde specvelden) —
zo wint de detailpagina alsnog van een eerder gelezen inhoudsopgave-rij van dezelfde
code, in plaats van dat de eerste (armste) lezing blijvend wint.

- **Spookmatch-fix** (`upgradeOcrLine` in `lib/repo/ocr.ts`) — twee reviewrondes:
  1. Eerste versie vergeleek uitsluitend tegen `outcome.unambiguousYellow` (alleen
     gezet bij status 'geel'), waardoor élke nog kloppende groene match bij een
     upgrade onterecht werd losgekoppeld.
  2. Tweede versie verbeterde dat naar "staat de oude `matchedProductId` in
     `outcome.provable` óf gelijk aan `outcome.unambiguousYellow`?" — maar
     `outcome.provable`/`unambiguousYellow` zijn beide afgeleid van de top-N
     (default `limit=8`, `evaluateSpecLine` in `lib/matching/engine.ts`)
     kandidaten die `fetchCandidates` teruggeeft. Bij een merk/producttekst met
     meer dan 8 matchende kandidaten in de 211k-catalogus kan een nog steeds
     geldige, mens-gekozen match buiten die top-8 vallen (de rijkere OCR-tekst
     kan de ranking op matchCount/score verschuiven) en zou dan alsnog onterecht
     als "spookmatch" gewist worden — de top-8-blinde-vlek.

  **Huidige, definitieve aanpak**: het oude product wordt RECHTSTREEKS tegen de
  nieuwe gevraagde specs getoetst, los van elke kandidatenlijst/limiet.
  `judgeCandidate`/`hasRed`/`hasUnknown` (`lib/matching/tolerances.ts`) en
  `toDelivered`/`SELECTION` (nu geëxporteerd uit `lib/matching/engine.ts`, geen
  gedragswijziging — alleen zichtbaar gemaakt) worden gebruikt om het ÉNE oude
  product te bevragen via `visibleProducts` (regel 3: verlopen prijslijst =
  onzichtbaar, dus nooit een ruwe `products`-tabel-query) en de resulterende
  `DeliveredSpecs` te toetsen tegen de nieuwe `RequestedSpecs`
  (`specRequestFromLine`, nu geëxporteerd uit `lib/repo/matching.ts`, dezelfde
  omzetting die `runMatcher` zelf gebruikt). `stillValid` = het product bestaat
  nog (zichtbaar) ÉN heeft geen rode/onbekende afwijkingen op de nieuwe specs —
  volledig onafhankelijk van of het toevallig in een top-N van een generieke
  kandidatenzoektocht zou vallen. Getest met een catalogus van 9 decoy-producten
  die de mens-gekozen match gegarandeerd buiten de standaard-limiet (8) drukken.
- **Audit-bewaring**: de oude `matchedProductId` + bijbehorende
  `chosenBy`/`chosenReason` worden vóór het herdraaien uitgelezen en als
  `previousChoice` meegestuurd in het `ocr_line_upgraded`-event, zodat een
  losgekoppelde spookmatch nooit stilzwijgend uit het logboek verdwijnt (regel 5).
- **Geaccepteerd race-risico, geen migratie**: de upgrade-stappen (lezen → updaten →
  hermatchen → vergelijken → event) lopen sequentieel, NIET binnen een
  `db.transaction()`. De productie-client (`db/client.ts`) draait op
  `drizzle-orm/neon-http`, en die driver ondersteunt géén interactieve transacties
  (`session.js`: "No transactions support in neon-http driver"). Omdat `AppDb`
  hetzelfde type is voor productie (neon-http) én tests (PGlite), zou een
  `db.transaction()`-aanroep alle tests laten slagen maar in productie altijd
  gooien. Twee overlappende page-verwerkingen van dezelfde run/code zouden dus in
  theorie kunnen interfereren — zelfde geaccepteerde risicopatroon als de drie
  CodeRabbit-follow-ups hierboven (single-user, sequentiële client-loop maakt een
  echte gelijktijdige aanroep voor dezelfde run praktisch onmogelijk). Geen nieuwe
  unique-constraint/migratie hiervoor.
- **`upgraded`-teller nog niet in de UI**: `ProcessOcrPageResult` en
  `ocrPageAction` (`app/projects/actions.ts`) geven `upgraded` nu door, maar de
  client-loop/voortgangsweergave op de projectpagina toont hem nergens apart (net
  zomin als `created`/`duplicates` los getoond worden — de voortgangsbalk telt
  alleen totalen). Bekende beperking, geen blokkade: wie wil zien welke regels
  zijn geüpgraded kan dat via het `ocr_line_upgraded`-event of de spec-regel zelf
  (`sourcePage` sprong naar de laatste lezing) aflezen.
- **CRI-parser-workaround in de acceptatietest**: `tests/acceptatie-ocr.test.ts` gebruikt
  bewust `"CRI ≥ 90"` (géén dubbele punt tussen "CRI" en "≥") in de gemockte OCR-tekst.
  `parseCri` (`lib/enrichment/parser.ts`) matcht op `/\b(?:CRI|Ra)\s*(?:≥|>=|>)?\s*(\d{2,3})/i`
  — dat verdraagt geen letterlijke `":"` tussen het label en het `≥`-symbool ("CRI: ≥ 90"
  breekt de match, `\s*` overbrugt geen `:`). Een echte OCR-lezing die zo'n dubbele punt
  toevoegt zou dus zelf weer als "geen CRI gelezen" landen. Losse taak-chip staat al klaar
  hiervoor ("CRI-parser mist optionele dubbele punt na label") — niet in deze branch
  opgelost, bewust een aparte, kleine parser-fix.

## Onderdeel Merkrelaties & data-inwinning — afgerond 2026-07-14

Plan: `docs/plan-merkrelaties.md` (stappen 1–8). Overzicht `/data/merkrelaties`
(status, prijslijst-indicator, mini-scorecard), detailpagina met volledige scorecard +
relatieformulier, Excel-template-download en bericht-klaarzetten.

### Aannames & bewuste besluiten

- **Gradient-semantiek scorecard**: donkergroen = álle must-velden van de bucket 100%
  gevuld; daaronder kleurt het blokje mee met de dekkingsratio (rood→geel→groen). De
  exacte ratio-drempels zijn een UI-keuze, geen datamodel-feit.
- **Niet-meetbare velden grijs**: velden die nog niet in het datamodel bestaan tonen
  "niet meetbaar" (grijs) tot de datamodel-migratie (0007, parallelle workstream) landt.
  Daarna is per veld alleen `measure.column` invullen in `lib/field-catalog.ts` genoeg.
- **Drizzle-snapshot-gat**: migraties vanaf 0004 zijn handgeschreven; de drizzle-kit
  meta-snapshots lopen dus achter op de werkelijke schema-staat.
- **Dubbele brand_codes (K8)**: merken met een gedeelde code krijgen alleen een badge;
  merge-tooling is bewust later.
- **"Geen reactie"-filter** vereist een gevulde `lastContactAt` — status 'benaderd'
  zonder contactdatum valt er buiten.
- **TOCTOU-venstertje in het status-event**: tussen lezen van de oude status en de
  upsert kan in theorie een andere schrijver zitten; single-user, acceptabel.
- **Retour-pad** (ingevulde templates terug verwerken) is bewust het volgende onderdeel.
- **exceljs** toegevoegd als dependency (echte .xlsx-template) — met Timo's akkoord.
- **`brand_template_downloaded`-event** heeft `entityId` null (download is niet aan één
  merk gebonden bij de generieke template).
