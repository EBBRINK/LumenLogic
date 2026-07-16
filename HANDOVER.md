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
· **Live geverifieerd in productie (DoD)**: na de deploy van `e28d46d` een no-op "Save & re-match"
op regel Lw102 gedaan via de live app. Nieuw event `ai_vangnet_run` om **10:14:16 UTC**:
`{"phase":"tender","checked":7,"discarded":0,"suggested":0,**"parseFailed":0**}`. Het veld
`parseFailed` bestaat alléén in de gefixte code, dus deze ene regel bewijst drie dingen: de
deploy serveert de nieuwe code, de tripwire werkt live, en `parseFailed: 0` bevestigt de meting
(model gaf echt niets; de parser at niets op). De twee oudere runs (08:57:53 = 0.1, 09:39:41 =
de meting) hebben het veld niet — precies zoals verwacht.
· **Kosten**: de meting kostte €0,0654 (`llm_usage` purpose `vangnet`: 21 → 42 rijen, €0,0619 →
€0,1273); de live-verificatie €0,0796 (42 → 67 rijen). Eindstand `vangnet` €0,2069, **maandtotaal
€0,3091** van de €10-cap.
· **Stap 6 van de briefing klopt niet — testdossier `49c6340e` staat er nog.** De briefing zegt
"opruimen met `scripts/cleanup-testdata.ts`", maar dat script scoopt op organisatie "Van Dijk
Elektro" (`ORG_NAME`, regel 27) en dit dossier heeft **geen `organizationId`**. Het script raakt
het dus niet aan. Bewust niets handmatig verwijderd (onomkeerbaar, en het is het bewijsspoor
onder 0.1 én 0.1b). Besluit Timo: laten staan, dit is het open punt.
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
_2026-07-16 (AI-leesroute **stap 0 — het meetinstrument staat**): `scripts/eval-testset.ts`
(+ `scripts/eval/grondwaarheid.ts` met test) haalt de vier echte testcases uit
`~/Downloads/lumenlogic-testset` (env `EVAL_DIR`; echte klantdata, nooit in git) door het
exacte productiecodepad — read-only: alleen `evaluateSpecLine`-selects, geen runMatcher/
logEvent/imports. `bun run eval --assert-nulmeting` reproduceert het 16 jul-ijkpunt exact:
Raadhuis 31/31 gelezen · merk 31× fout (zaalnamen) · {blauw:30, paars:1} (`Lf901` paars via
NON_LIGHTING-woord "tafel") · keuze 0/4 — KvK 0/49 — TNO 15/20 · {blauw:13, rood:2}
(zaalnaam "Focus" bestaat als merk, het O5-geval) — Dordrecht 0/18 (geen tekstlaag).
**Denominator-correctie KvK:** nulmeting zei 0/28, LEESMIJ zei 20; de tekstlaag bevat
aantoonbaar **49 unieke codetokens (27 basiscodes)** — beide eerdere zeven waren fout, de
PDF wint; het "KvK 20/20"-einddoel uit het goal-doc heet voortaan 49/49. Jayden-mapping voor
rang/keuze: Raadhuis 4 codes (via mail-aantallen), Dordrecht 6 (via handgeschreven
aantallen, incl. Kurbis-setje); KvK/TNO eerlijk "n.v.t.". L-prefix-bevinding: Jayden's
XIS-artikelcodes staan letterlijk (mét L-prefix) in `visible_products.article_code`; de zes
Dordrecht-artikelcodes staan (nog) helemaal niet in de catalogus. `--ai`-flag bestaat maar
de OCR-route is bewust doorgeschoven naar bouwstap 2 (rasterisatie server-side is daar pas
nodig; de nulmeting heeft hem niet nodig). Fixtures in de vier codestijlen:
`lib/pdf/codestijl-fixtures.ts` + tests (invariant-asserts die stap 1–6 overleven)._
_2026-07-16 (AI-leesroute **stap 1 — O1-fix: splitBrandType raadt nooit meer**): bekend
catalogusmerk wordt nu overal in de recordtekst herkend (hele-token-concatenaties,
genormaliseerd ≥3 tekens, langste match per startpositie, eerste positie wint — kolomvolgorde
is ruimte→fabricaat→type); geen bekend merk → `brandText: null` + `productText` = volledige
rest. Meetscript-delta Raadhuis: merk van 31× zaalnaam-fout naar **14 bestaand / 0 fout /
17 leeg**, status van {blauw:30, paars:1} naar {open:13, rood:12, geel:5, paars:1}; de vier
geoffreerde regels staan geel/open **mét kandidaten** (Lw002 rang 3). TNO: 7 merken bestaand,
0 fout. Acceptatietest: Zumtobel/Trilux nu geseed als merkrij zónder producten (`seedBrand`
in test-db) → **rood i.p.v. blauw (tot stap 4)** — het alternatief (niets seeden) zou vals
GROEN geven omdat merkloze regels catalogus-breed fuzzy matchen op "3000K". Blauw-semantiek
blijft unit-gedekt (engine.test.ts). **Risico's tot stap 3/4:** (1) het tekstlaag-pad voedt
de inlaadwachtrij (H-08) niet meer — onbekende merken zijn null, nooit blauw; (2) een
spec-arme regel zonder merk kan vals groen matchen op een generiek token. **Vondsten:**
grondwaarheid-correctie — het Raadhuis-boek voert zés fabricaten (XAL 4× geoffreerd, Bega 8,
Exenia 1, Trilux 6, Barthelme 2, 10× maatwerk "-"); "alles XAL" was een verkeerde lezing van
de OPDRACHT. Trilux/Barthelme staan niet in de brands-tabel (blijven leeg tot stap 3/4).
Lw101 slokt de noodverlichtingssectie op (NV-codes matchen `CODE` niet — tweede letter is
hoofdletter) en leest daardoor "Etap" van NVr001 — segmentatie-bevinding voor stap 3. Rang
in het meetscript is niet-deterministisch binnen naam-identieke varianten (drie STRETTA's
heten exact gelijk; orderBy heeft geen tiebreaker na naam) — eventuele `asc(articleCode)`-
tiebreaker is een bewuste engine-wijziging voor later, niet meegesmokkeld._
_2026-07-16 (AI-leesroute **stap 2 — O3-tripwire + --ai-meetroute**): `MAX_TOKENS_PER_PAGE`
1500 → 4000, nieuw `MAX_TOKENS_RETRY` 8000; `readPageWithVision` retryt intern precies één
keer bij `stop_reason === "max_tokens"` en retourneert additief `attempts`/`truncated`/som-
usage; `ocrPage` logt per afkapping `ocr_page_truncated` (page/attempt/maxTokens/final) en
zet `truncated`+`attempts` in het `ocr_page_done`-payload — een dubbel afgekapte pagina is
succes-met-waarschuwing, nooit `{failed}` (dat zou de beeldrij wissen → hervat-lus =
geldverbranding). `OCR_RESERVE_EUR` 0,02 → 0,08 (dekt 1–2 calls). Promptzin "An empty list
is a good answer" vervangen door de strikte variant. Meetscript: `--ai`-route gebouwd
(scripts/eval/raster.ts: unpdf + @napi-rs/canvas, zelfde 1568px/q80 als de browser-route;
`regelToSpecLine` uit lib/repo/ocr.ts geëxporteerd — puur, alleen zichtbaarheid) met
maandbudget-poort, €1-runteller en `llm_usage`-logging (purpose **'eval'**, importRunId
null — de enige DB-write van het script). **Acceptatie gehaald: Dordrecht 18/18 codes
gelezen (was 0/18)**, spookcode Th1, geen truncation meer nodig (output 1718/2112 tokens —
boven de oude cap van 1500, het directe O3-bewijs). Kosten €0,0244/run; purpose 'eval'
totaal €0,05; maandtotaal €0,38 van de €10. Merken op ~95 dpi effectief nog grotendeels
mis/verzonnen ("Pern Lusing" ≈ Ferm Living, Philips/Signify-verwarring) = O4 → stap 5;
"Aromas del Campo" ≠ "Aromas" = O5 → stap 4. A3-dpi-feit voor stap 5: 1568px lange zijde op
A3 landscape = 94,8 dpi effectief._
_2026-07-16 (AI-leesroute **stap 3 — de AI-tekstroute draait**): nieuw `lib/ai/leesroute.ts`
(één `lever_regels`-koppelcontract voor beeld én tekst: tool + promptkern geëxporteerd uit
ocr.ts; tekstvariant met verplicht `pagina`-veld en "=== PAGE N ==="-markers, batches van 8,
eigen tripwire-budgetten 8k/16k met per-pagina-escalatie) + `lib/repo/leesroute.ts`
(`recordLeesrouteImport`: run + `verwerkGelezenRegels` — de uit `processOcrPage`
geëxtraheerde B7-persistlus — reviewKind 'ocr' op élke AI-regel, rijkste-wint-dedup,
events `leesroute_batch_done/_truncated/_failed`, purpose **'leesroute'**, gedeelde €1-cap
per boek via `checkOcrBudget`). Router `beslisRoute` (puur; 0 regels óf <60% bekende merken
→ AI-route) aangeroepen in de import-action; geen key → eerlijke terugval op het
deterministische pad + `leesroute_skipped_no_key`. Reviewkaart linkt bij runs zonder
paginabeelden naar het markdown-controlespoor i.p.v. de 404'ende ocr-image-route.
**Acceptatie (meetscript, €0,16/volle run): Raadhuis 31/31 met verwacht merk 21/21 · KvK
48/48 · TNO 20/20 met merk 13/13; Deerns-acceptatietest bewijst het €0-snelpad** (route
"deterministisch" + geen leesroute-purpose/events). Bijvangst: leesroute brengt blauw/H-08
terug (Raadhuis: Trilux/Barthelme → 10× blauw op de inlaadwachtrij-route). **Engine-fix
(aparte commit): `fetchCandidates` crashte op `ORDER BY 0`** zodra een regel geen
producttekst-tokens had (bereikbaar sinds AI-regels met alleen een code bestaan) — constante
sorteertermen worden nu overgeslagen (semantisch identiek, regel 2 onaangeraakt) en een
regel zonder énig zoeksignaal krijgt eerlijk [] → rood. **Grondwaarheid-correcties:** KvK-N
49 → 48 (kaal L010 bleek een prozavoorbeeld op p.8, geen armatuurregel); TNO-merken per
code gevuld (13 letterlijk geverifieerd); `bekendeExtraCodes` (Raadhuis NV-sectie +
Helvar-sensoren; KvK T001) worden apart gerapporteerd als "bekend, buiten scope". **Open
bevinding voor Timo:** merkloze regels matchen catalogus-breed — KvK toont 39/48 "groen" op
generieke tokens (3000K, Downlight) tegen willekeurige merken; eerlijk volgens de huidige
beslisboom, maar "nooit groen zonder gevraagd merk" is een statussen-semantiek-besluit dat
alleen Timo kan nemen (vangrail)._
_2026-07-16 (AI-leesroute **stap 4 — O5: bekend = merk mét producten, plus aliassen**):
`brandExists` vervangen door `resolveBrand` (één query): "bekend" = ≥1 productrij in de
**basistabel** `products` (verlopen prijslijst blijft bekend → rood, nooit blauw; kandidaten
strikt `visible_products`, regel 3), en `brand_aliases` (migratie **0010, toegepast op
Neon**, additief + 3 seeds: aromasdelcampo→Aromas, intralight→Intra-lighting,
signify→**MyCreations** — níét Philips: de Dordrecht-artikelcodes L322… wijzen hard naar
MyCreations) resolvet boek-woorden naar het canonieke merk; de gecureerde alias wint van
naamgelijkheid (Signify bestaat zelf als lege merkrij). Wachtrij krijgt de canonieke key;
enrichment-hermatch is alias-aware (anders bleef "Intralight" blauw ná het inladen van
Intra-lighting). **Schaal-gevolg, bewust en zichtbaar: 405 van de 436 merken hebben 0
productrijen — die zijn nu blauw (+ inlaadwachtrij) i.p.v. rood.** Meetscript-delta:
Raadhuis {blauw:27, groen:14, paars:1} — Bega/ETAP/Trilux/Barthelme staan nu als
inlaadwerk op de wachtrij; Dordrecht 19/20 blauw; acceptatietest: Lp801/Ls802 aantoonbaar
terug van rood naar blauw incl. inlaadwachtrij (het regressiebewijs uit stap 1).
Alias-acceptatie "Aromas del Campo → kandidaten van Aromas" bewezen in unit-tests; de
meetscript-demonstratie wacht op stap 5 — **de vision-lezingen op ~95 dpi variëren per run**
(deze run las F leeg en D "Signify"; TNO-merken schommelen 9–13/13 tussen runs — O4).
Grondwaarheid: Ad verwacht nu "Signify" (wat het boek drukt; "Philips" kwam uit de
OPDRACHT-samenvatting). Intra-lighting/MyCreations hebben 0 producten — aliassen leveren
daar blauw-met-juiste-key, pas kandidaten na inladen ("geen datagat" uit het probleemdoc
gold alleen voor XAL/Aromas/&Tradition/Muuto)._
_2026-07-16 (AI-leesroute **stap 5 — O4: A3-tiling, geen verzonnen merken meer**): nieuw
`lib/pdf/tiles.ts` (puur, nul imports — één tegelplan voor browser, meetscript én repo):
pagina's die op 1568px lange zijde onder de **120 dpi-drempel** komen gaan in overlappende
300dpi-tegels van 1568² (A3 = 4×3 = 12, overlap ~438/598 px); daarboven blijft het bewezen
hele-pagina-pad **byte-identiek** (tile 0 ⟺ hele pagina, regressie-verankerd). Migraties
**0011** (ocr_page_images + tile-kolom, unique (run,page,tile), backfill via DEFAULT 0) en
**0012** (alias serax→Valerie Objects, gestaafd via D=13 ↔ offerte 13×) — beide toegepast
op Neon, additief. Client-loop uploadt per tegel (FormData tile/tileCount, hervatten per
(page,tile) via doneTiles, voortgang "(tile x/12)", ETA per tegel); tegels dragen een
sectie-promptzin incl. "alleen regels waarvan de code in DÉZE sectie zichtbaar is — nooit
een productnaam als code" (tegel-gescoopt, het A4-pad onaangeraakt). Rijkste-wint-dedup
bleek tegels al vanzelf correct te behandelen (een tegel is voor de dedup "nóg een
pagina"). **Acceptatie: Dordrecht 18/18 codes · verwacht merk 6/6-waar-bekend · 0
verzonnen merken** (nulmeting: 8/18 verzinsels als "GAZOO"; nu leest het model letterlijk
wat er staat: Signify, Philips, SERAX, QAZQA, Lightronics, Aromas del Campo, Ferm Living,
ETK) — en D/F staan groen mét kandidaten via de aliassen. Kosten getegelde meting
€0,10/run (24 calls). **Bekende bijvangst:** de 300dpi-tegels lezen óók de
installatietabel van de scan (Miele/Zehnder/Inatherm) en productnaam-fragmenten als
regels — na de promptaanscherping nog ~17–18 spookregels; het zijn letterlijke
transcripties (geen hallucinatie) en elke regel draagt de verplichte B7-review, maar het
is reviewbank-ruis; een nette oplossing (bv. tabel-scope-detectie) is werk voor later.
De "Philips → fout"-tellingen in het meetscript zijn correcte lézingen — "Philips"
bestaat alleen niet als merkrij (wel "Philips (lichtbronnen)" etc.); de kolom "verwacht
merk x/6" is maatgevend._
_2026-07-16 (AI-leesroute **stap 6 — O6: aantallen**): het `lever_regels`-koppelcontract
(beeld én tekst) kent nu een `aantal`-veld (number|null) + de promptregel "alleen als het
létterlijk gedrukt of handgeschreven bij de regel staat — nooit raden, nooit 1 defaulten".
`regelToSpecLine` neemt het over (de A-07-aanname "een boekpagina noemt geen aantallen"
vervalt als default, blijft als fallback: geen aantal → null → stukprijs-modus). Twee
merge-regels zodat een gelezen aantal nooit verloren gaat aan de rijkste-wint-dedup
(Dordrecht: de aantallen-lijst is spec-arm, de armaturenlijst heeft geen aantallen):
`upgradeOcrLine` merge't quantity (nieuw ?? bestaand) en het duplicaat-pad backfillt een
aantal op een regel zonder (event `ocr_quantity_backfilled`, geen hermatch — matching
raakt quantity niet). Meetscript: aantal-kolom + dezelfde merge. **Acceptatie: Dordrecht
18/18 aantallen correct incl. de geverifieerde 124 (tweede run; eerste run 17/18 —
vision-ruis, doel was 15/15) · Raadhuis 0 aantallen gelezen (het boek heeft er geen; de
echte aantallen staan in de mail — een bron die nog nergens in het ontwerp bestaat, dat
blijft de A-07/mail-vondst uit de testset-bouw).** De prompt-/toolsnapshots in
leesroute.test.ts zijn bewust bijgewerkt (gemotiveerde contractwijziging)._

## Sprint 1.1 — Format-validatiemodule — af 16 jul 2026

Poortwachter van het retour-pad: `lib/excel-validate.ts` toetst een ingevuld merk-template
tegen ons format. Pure functie, geen DB/UI/route/migratie. Briefing:
`docs/sprint1-1-briefing.md`, probleemanalyse `docs/sprint1-1-probleem.md`.

- `validateFilledTemplateXlsx(bytes, { knownArticleCodes? })` → discriminated union op `ok`.
  Afwijzing draagt géén rijen (type-niveau-garantie dat er niets half verwerkt wordt).
- `lib/excel-validate-messages.ts` maakt tekst van de codes. Bewust apart — zie taal.
- Tests: `lib/excel-validate.test.ts` (44) + `lib/excel-validate-messages.test.ts` (12).

**Events: bewust géén.** 1.1 voegt geen runtime-gedrag toe — de module is nog nergens
aangeroepen. Events horen in 1.2 op het upload-pad. Geen vergeten checkbox.

### Aannames en besluiten die 1.2 moet kennen

- **Kolomherkenning op naam** (genormaliseerd `labelEn`, rij 2), volgorde-onafhankelijk,
  exact-na-normalisatie. Géén fuzzy matching: een vals-positieve kolommatch schrijft stil
  de verkeerde data in het verkeerde veld.
- **Ontbrekende must-kólom = afwijzing, lege must-cél = waarschuwing.** Oogt inconsistent,
  is het niet: een ontbrekende kolom betekent dat het merk het veld nooit zag. Zonder
  `Supplier article code` is per-rij-controle bovendien onmogelijk.
- **`velden` is rauwe, getrimde tekst — niet geparsed.** Geen getallen, geen eenheden, geen
  decimaalteken-normalisatie. `"129,50"` als getal getypt leest terug als `"129.5"`.
  Denkt 1.2 dat de module normaliseerde, dan wordt dat een stille diff-fout. Prijs wordt
  alleen op gevuld/leeg getoetst (IJzeren regel 2).
- **`"cri" in rij.velden === false`** betekent "kolom ontbrak, stel niets voor";
  `velden.cri === ""` betekent "kolom stond er, cel leeg". Verwar ze niet — dan stelt 1.2
  voor om bestaande data te wissen.
- **Contract op `knownArticleCodes`: exact de codes van dít ene merk.** Verkeerd gescoopt
  (alle merken) → elke code "bekend", dubbelcheck vuurt nooit, en dat ziet er identiek uit
  als een schoon bestand. Daarom staat `artikelcodesGecontroleerd` in het resultaat.
- **Asymmetrische code-normalisatie, met opzet — niet "harmoniseren".** Bekende-codes-
  lookup: alleen trimmen (want `products_brand_sac_uniq` is hoofdlettergevoelig; casefolden
  zou de module laten zwijgen waar 1.2 exact matcht, "nieuw" concludeert en stil een
  dubbelproduct maakt). Duplicaat-binnen-bestand: wél casefolden (gemist duplicaat = stille
  schade, extra dubbelcheck = gratis).
- **Gemergde datacel** (merk mergt `Category` over 3 rijen): exceljs geeft slaves de
  master-waarde, dus alle drie de rijen tellen als gevuld. Inhoudelijk klopt dat; niet
  gerepareerd.

### Open punten

- **TAAL — besluit aan Timo.** Kaderpunt 4 van de briefing zegt "meldingen in het
  Nederlands, de interne UI is Nederlands". Dat klopt sinds de i18n-slag niet meer
  (`docs/i18n-glossary-xis.md`; `/data/brand-relations` toont "Brand relations"). Beide
  publieken lezen vandaag Engels. De renderer is daarom **Engels**. De kaders zijn expliciet
  "aanbevelingen — plan-agents mogen beargumenteerd afwijken", vandaar geen stop. Wil je
  Nederlands: dat is één bestand van ~60 regels, de module blijft ongemoeid.
- **Geen rij- of bestandslimiet in de module** (een cap is geen format-oordeel en zou 4.B's
  keuze voorwegnemen). **1.2 en 4.B moeten de uploadgrootte zelf begrenzen** — in 4.B komen
  de bytes van een externe partij. Zie ook `docs/probleem-413-pdf-upload.md`.
- **Leidende nullen gaan verloren vóór wij het bestand zien**: Excel slaat artikelcode
  `0012345` op als getal `12345`. Niet repareerbaar in de module. Als dit bij een echt
  merkbestand speelt, is het een instructie-kwestie richting het merk (cel als tekst
  opmaken), geen validator-kwestie.
- **Een veld naar `must` promoveren in `field-catalog.ts` is een breaking change** voor élk
  merkbestand dat op dat moment onderweg is — de validator leidt de must-set runtime af en
  verscherpt vanzelf mee. De wijzigingsdetector-test in `lib/excel-validate.test.ts` pint de
  huidige vier vast, zodat dat een bewust besluit wordt en geen sluipend.
- **Niet getest tegen een échte merk-Excel.** Alle fixtures zijn mutaties van onze eigen
  builder; `~/Downloads/lumenlogic-testset/` is klantdata en bleef er conform briefing
  buiten. Een Google Sheets-export is echte xlsx en hoort te werken, maar is niet
  gefixtured — waard om in 1.2 één keer handmatig te proberen.
- De rondgang-test bewijst dat builder en validator het eens zijn, niet dat ons format goed
  is voor echte merken — beide volgen dezelfde catalog. Dat is de prijs van de
  runtime-afleiding.

## Sprint 1.2 — Retour-pad: upload → voorstel → goedkeuren — af 16 jul 2026

Ingevulde templates komen binnen via de merkrelatie-pagina: upload → 1.1-validatie →
voorstel-scherm → goedkeuren/afwijzen. Niets wordt stil weggeschreven. Hier is ook
`lib/repo/price-archive.ts` eindelijk aangesloten. Briefing `docs/sprint1-2-briefing.md`,
probleemanalyse `docs/probleem-1-2-retourpad.md`, besluiten `docs/plan-1-2-retourpad.md`.

- `lib/template-diff.ts` — pure diff-engine + `SCHRIJF_MAPPING` + selectie-sleutels.
- `lib/repo/template-return.ts` — staging/apply/reject. `lib/repo/price-archive.ts` kreeg
  `upsertPriceLines` (regel-niveau). Schermen: `components/data/template-proposal.tsx`,
  route `app/data/brand-relations/[brandId]/upload/[uploadId]/`.
- Tests: `lib/template-diff.test.ts` (24), `lib/repo/template-return.test.ts` (14),
  `lib/repo/price-archive.test.ts` (8), `components/data/template-proposal.test.tsx` (18).
  **Geen migratie** — staging leeft op de bestaande `brand_uploads` met `kind: 'template'`.

### Aannames en besluiten

- **Een upload is een GEDEELTELIJKE bijwerking, nooit een lijstvervanging.** Het template
  vraagt nergens volledigheid en de validator accepteert 40 van 500 rijen. `replacePriceList`
  wordt op dit pad daarom nooit aangeroepen: het archiveert álle prijzen van het merk, en de
  overige 460 producten zouden via `visible_products` stil uit élke zoekactie verdwijnen
  (ijzeren regel 3). Prijzen lopen via `upsertPriceLines`, dat alleen daadwerkelijk vervangen
  regels archiveert. "Prijslijst 2027 komt binnen" blijft het scenario van `replacePriceList`
  en verdient een eigen ingang.
- **Geen `db.transaction()`** (neon-http gooit, PGlite niet). De veiligheid komt uit de vorm:
  idempotente upserts op natuurlijke sleutels, statusflip als laatste stap, verse
  diff-herberekening bij elke render én bij toepassen. Een afgebroken run blijft herkenbaar op
  `staging`; opnieuw goedkeuren maakt hem af.
- **`data_ontvangen`** valt bij de upload, **`verwerkt`** bij goedkeuren. Afwijzen laat de
  relatiestatus staan: er ís geleverd, het is alleen niet bruikbaar.
- **Conflict ≠ gewijzigd.** `changed` = merk levert een andere waarde; `conflict` = wissen /
  onverwerkbaar / bestand spreekt zichzelf tegen. Voor beide geldt: bestaand wint tenzij
  aangevinkt. Nieuw product = één vinkje, default UIT (een tikfout maakt stil een
  dubbelproduct), met "Select all new products" ernaast.

### Open punten / restrisico's

- **`field-catalog.ts` `measure` is verouderd** t.o.v. migratie 0007: tientallen velden staan
  op `kind: "none"` terwijl hun products-kolom bestaat, en `name_en` wijst naar
  `products.name`. `measure` is een scorecard-MEET-brug, geen schrijf-brug — de briefing zei
  van wel. 1.2 gebruikt daarom een eigen `SCHRIJF_MAPPING`. Het repareren van `measure` raakt
  scorecard-gedrag en K4-screenshots: **losse opvolgtaak**, bewust niet in 1.2.
- **Micro-venster binnen de apply** tussen diff-lezen en updaten blijft open (zelfde klasse
  als §Item A). De stale-guard dekt alleen het lange venster (tonen → toepassen).
- **`conflict/not_storable` is vandaag onbereikbaar**: alle 66 template-kolommen zijn gemapt.
  Het blijft als vangnet bestaan voor een toekomstig catalogusveld zonder mapping, maar geen
  echt bestand kan hem produceren — alleen een fixture.
- **Leidende nullen** gaan vóór ons verloren (Excel maakt van `007` een `7`); instructie-
  kwestie, geen codefix. Relevant bij matchen op `supplier_article_code`.
- **Nog niet handmatig tegen een écht merk-Excel getest** (Google-Sheets-export-check uit 1.1)
  — dat kan pas na deploy.

## ✅ Ongecommit werk zonder eigenaar — opgelost 16 jul 2026

_Stond hier als open punt (`d4b933f`); afgerond dezelfde dag na bevestiging door Timo._

Vijf bestanden stonden lokaal gewijzigd zonder bekende eigenaar — van geen enkele
sprint-0-sessie. Ze zijn nergens in meegelift (alle sprint-0-commits gebruikten expliciete
paden) en zijn alsnog netjes afgerond:

- **Merk-vragenlijst: NL-productnaam eruit** (`34e1e57`) — `lib/field-catalog.ts` +
  `field-catalog.test.ts` + `brand-message.test.tsx` + `brand-relations.test.tsx`. De
  must-velden `name_nl`/`description_nl` zijn geschrapt en `measure: col("name")` /
  `col("description")` verhuisd naar de Engelse keys: na de Engelse vertaalslag is
  "Productnaam (NL)" als must-veld onzinnig. Must-totaal blijft 3 (sac, name_en, category).
  Timo heeft bevestigd dat dit klopt. 529 tests groen, tsc schoon.
- **CLAUDE.md** (`96d573e`) — de magic-link-notitie (`vercel logs --expand`).

`git status` is daarmee schoon.

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
  bewaard als bewijsspoor. Opruimen kan **niet** met `scripts/cleanup-testdata.ts` (dat
  scoopt op org "Van Dijk Elektro"; dit dossier heeft geen `organizationId` — zie de
  0.1b-entry hierboven). Handwerk, staat op de week 4-checklist vóór de overdracht.

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
