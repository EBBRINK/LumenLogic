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
_2026-07-16 (AI-leesroute **stap 7 — rangmeting: de top-8 is niet het knelpunt**):
eindmeting over de vier cases (€0,25/run). **Doel gehaald: Raadhuis 31/31 met merk
21/21-waar-bekend en de vier geoffreerde regels groen mét kandidaten · KvK 48/48 · TNO
20/20 · Dordrecht 18/18 met verwacht merk 6/6, 0 verzonnen, aantallen 18/18 incl. de
geverifieerde 124.** De rangmeting (limit 50) wijst uit: Jayden's exacte artikelcode staat
bij géén van de 10 gemapte regels in de top-50 — de ingetrokken top-8-hypothese blijft
ingetrokken, maar het echte knelpunt ligt dieper: de naamtoken-ranking
(matchCount→prefix→similarity op productnaam) kan de specifieke váriant die Jayden kiest
(DALI, stralingshoek, kleur — specs die niet in de naam-fuzzy meewegen) niet naar boven
halen in een assortiment met tientallen naamgenoten. Auto-keuze (B3) is overal 0 — eerlijk:
kiezen blijft menswerk. Dit verdient een eigen probleemdoc (variant-ranking op specs), geen
fix nu (vangrail: geen top-8-fix). **Restpunten voor een volgende sessie:** (1) de
leesroute-merklezingen variëren per run (TNO 9–13/13; temperature staat niet op 0 — bewuste
afweging waard); (2) Dordrecht-spookregels variëren 17–37 (de installatietabel op de scan —
transcriptie, geen hallucinatie, maar reviewbank-ruis); (3) het KvK-vals-groen (28–39/48 op
merkloze regels, semantiek-besluit voor Timo); (4) de mail als aantallen-bron bestaat nog
nergens in het ontwerp. **Er is niets gedeployed naar productie** — alle wijzigingen staan
op main (preview); migraties 0010–0012 zijn additief toegepast op de gedeelde Neon-DB._

## Sprint 3.1 golf 1 — auth-fundament + PIN-laag + org/rollen — 30 jul 2026

Briefing: `docs/sprint3-1-briefing.md`. Dit is stuk 1–3 (fundament); de schermen (stuk 4–6)
zijn golf 2. **Niets gedeployed, niets naar main gepusht** — het werk staat op branch
`claude/sprint31-pin`. G32 betekent bovendien dat er twéé losse deploy-akkoorden nodig zijn.

- `lib/auth-factory.ts` — `createAuth(db, opts)` (besluit G30). `lib/auth.ts` blijft de
  singleton (`export const auth`) en re-exporteert de factory. De splitsing was nodig:
  `db/client.ts` gooit bij import al een fout zonder `DATABASE_URL`, dus een test die alleen
  de factory wil struikelde erover. `emailAndPassword` staat aan mét `disableSignUp: true`;
  de magic link + allowlist-poort staat er ongewijzigd naast (G32, deploy 1).
- `lib/repo/activation.ts` — PIN-datamodel: 8 cijfers, scrypt-hash, 7 dagen, eenmalig,
  5 pogingen, één actieve PIN per adres. `lib/auth-activation.ts` — `redeemActivationPin`:
  wachtwoord zetten en pas dáárna een sessie.
- Migratie `0017_org_type_activatie.sql` — `organizations.type` (G31), de Brink-org, backfill
  van dossiers zonder org en memberships voor bestaande users, plus `activation_pins`.
- Eerste tests die dit project op Better Auth heeft: `lib/auth-activation.test.ts` (hele flow
  + faalpaden), `lib/repo/activation.test.ts`, `db/migration-0017.test.ts`. 29 nieuwe tests.

**Aannames en open eindes**
1. **De allowlist geldt bewust NIET voor het wachtwoordpad.** Hij blijft de poort onder de
   magic link (L-02). Zou hij ook onder wachtwoorden liggen, dan moest elke externe
   installateur eerst in Brinks interne lijst — dan is de hele PIN-onboarding zinloos. De
   poort onder het wachtwoordpad is dat je een PIN van Brink nodig hebt om er één te kúnnen
   zetten. **Gevolg voor deploy 2 (G27):** als de magic link eruit gaat, verliest de
   allowlist zijn enige gebruiker. Bewuste keuze van Timo nodig: weghalen of herbestemmen.
2. **`hello@noplasticfloralfoam.com`** krijgt via 0017 een `org_admin`-membership in de
   Brink-org, net als de andere twee users — het is Timo's eigen tweede adres. Er is
   **niets** aan de allowlist veranderd. Het account kan dus pas inloggen zodra Brink er een
   PIN voor aanmaakt; via magic link kan het (op productie) niet. Bewust zo gelaten.
3. **Alle drie de bestaande users worden `org_admin`** in de interne org ("intern super
   admin" uit de G21-kaart). Ze zijn alle drie Brink-kant; er is geen bestaande gebruiker
   waarvoor een lichtere rol klopt.
4. **`organizations.type` default `extern`** — default = veilig (regel 4). Elke org die vóór
   0017 bestond wordt dus `extern`; alleen de Brink-org is `intern`.
5. **Minimale wachtwoordlengte 12** (NIST SP 800-63B vraagt 8). Bewust hoger: er draait geen
   check tegen gelekte wachtwoorden, dus lengte is de enige weerstand die er is.
6. **Migratie 0017 zaait de Brink-org in élke database**, ook in een verse test-DB — zelfde
   patroon als de allowlist-seed van 0004. Eén bestaande assertie in
   `scripts/cleanup-testdata.test.ts` telde het aantal organisaties en is daarop bijgesteld
   (2 → 3).
7. **`redeemActivationPin` claimt de PIN vóór het wachtwoord wordt geschreven.** Faalt de
   schrijfactie daarna alsnog, dan is de PIN op en moet Brink een nieuwe geven. Dat is de
   goede kant om op te falen: eenmaligheid blijft dan hoe dan ook waar.
8. **`nextCookies()` staat alleen in de productie-instantie**, niet in de testfactory (er is
   geen request-scope in een test). Golf 2 kan in een server action dus gewoon
   `auth.api.signInEmail(...)` aanroepen; de cookie wordt vanzelf gezet.

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

- ✅ **Opgelost in 1.3-A (20 jul)** — zie §Sprint 1.3 hieronder. ~~**`field-catalog.ts`
  `measure` is verouderd**~~ t.o.v. migratie 0007: tientallen velden staan
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

## Sprint 1.3 — Merkenbeheer als hoofdingang (+ measure-reparatie) — af 20 jul 2026

Twee besluiten, twee commits. Briefing `docs/sprint1-3-briefing.md`.
A = `3b5d53e`, B = `b93bccf`.

### Deel A — `measure` gelijkgetrokken met migratie 0007

45 velden stonden op `measure: NONE` ("nog niet meetbaar") terwijl `products.<key>` sinds
0007 bestaat, en `name_en`/`description_en` maten de buurkolom (`name`/`description`). De
scorecard toonde daardoor "Product name (English) 100%" op grond van de Nederlandse naam,
en "bestaat nog niet in het datamodel" over kolommen die er wél waren.

- `lib/field-catalog.ts` — 47 `measure`-regels gerepareerd. De catalogus-key bleek voor
  alle 45 exact de kolomnaam; per veld getoetst tegen `getTableColumns(products)`, niet
  aangenomen. **Geen migratie.**
- Ongewijzigd en bewust zo: `list_price_excl_vat` blijft `{kind:"price"}` (EXISTS op een
  geldige lijst, nooit het bedrag — ijzeren regel 2); `purchase_price_excl_vat` en
  `brand_discount` blijven `NONE` want zij hebben géén kolom; `category` blijft
  `col("category_path")`. Géén `inExcel`/`internalOnly`/`niveau`/`matcher` aangeraakt —
  dat zou het merk-Excel en daarmee 1.1/1.2 breken. `excelColumns()` leest `measure` niet,
  dus het template is byte-identiek.

**De scorecard is hierdoor gekelderd, en dat is de bedoeling** (besluit Timo, 20 jul).
Gemeten op de productiedatabase (211.311 producten; `name_en` 1 rij gevuld,
`description_en`/`sdcm`/`ean_code` 0) voor merk **Flos** (4 producten):

| | vóór A | ná A |
|---|---|---|
| meetbare velden | 25 | **70** |
| grijs "niet meetbaar" | 47 | **2** |
| bucket 1 must | 83,3% (2/3) | **58,3% (1/3)** |
| bucket 1 meetbaar/grijs | 4 / 4 | **8 / 0** |
| bucket 9 (documentatie) | 0 meetbaar, 5 grijs | **5 meetbaar, 0 grijs** |
| `name_en` gevuld | 4/4 (mat `name`) | **1/4 (meet `name_en`)** |

Geen verzachting ingebouwd: geen drempels, geen uitgezonderde buckets, geen "tel alleen
velden met data".

**De belangrijkste toevoeging is de converse-test.** De bestaande test toetste alleen
"elke `measure.column` bestaat als kolom" — die bleef vijf weken groen terwijl 45 velden
fout stonden, en liet `name_en → col("name")` door omdat `name` nu eenmaal een echte kolom
is. De nieuwe test toetst de andere kant: bestaat `products.<key>`, dan MOET het veld die
kolom meten. Violations worden verzameld en in één keer gerapporteerd. Geverifieerd door
beide bugvormen opnieuw te introduceren — de test noemde alle drie bij naam.

Meegenomen omdat A ze onwaar maakte: `lib/brand-message.ts` documenteerde lek-preventie met
"álle internalOnly-velden zijn kind none" (klopt niet meer nu `stock` c.s. meetbaar zijn —
er lekt niets, want `dekking()` leest alleen must+wanna en die vier zijn `nice`, maar de
claim is nu de smallere wáre invariant mét test), en de header van `lib/template-diff.ts`
noemde `measure` "verouderd" met `name_en` als voorbeeld. `SCHRIJF_MAPPING` blijft de
schrijf-brug, bewust gescheiden van de meet-brug.

### Deel B — "Brand relations" in de hoofdnavigatie

Nieuw item **Brand relations** → `/data/brand-relations` (intern merkenbeheer), ná Catalog en vóór
Data. Het bestaande **Brand** heet nu **Brand portal** (`/brand`, wat een mérk ziet). Route
ongewijzigd, geen redirects, de kaart onder `/data` blijft. Overzicht, scorecard,
kruislink en outreach-filter stonden er al sinds 14 juli — dit was alleen de nav.

- `components/nav-items.ts` (nieuw) — items + `activeNavHref`, een pure module zonder
  `"use client"`/`getSession`. Nodig, niet cosmetisch: exports van een client-module worden
  client-references en zijn in de RSC-testomgeving niet aanroepbaar.
- `components/nav-link.tsx` — `NavLink` krijgt `active` als prop (+ `aria-current`);
  nieuwe `NavBar` beslist de actieve sectie één keer centraal.
  `components/site-nav.tsx` blijft de sessiepoort.
- **Bug meegefixt:** `NavLink` bepaalde "actief" per link met een losse prefix-match, dus op
  `/data/brand-relations` lichtten zowel "Data" als "Brand relations" op. Nu wint de langste prefix.

### Aannames en besluiten

- **Boolean `false` telt als gevuld.** De filled-count is `count(*) filter (where <kolom> is
  not null)`, dus een merk dat "nee" antwoordt op `emergency`/`light_source_included` heeft
  het veld geleverd. Dat was al zo voor `directionable`; niet nieuw, wel nu op 4 velden meer.
- **Ijzeren regel 2 blijft intact.** Geen prijs-BEDRAG werd meetbaar: `list_price_excl_vat`
  meet alleen bestaan-op-een-geldige-lijst, `purchase_price_excl_vat`/`brand_discount`
  blijven `NONE`. `show_price_on_web` is een weergavevlag, geen bedrag. De scorecard is geen
  ranking-input.
- **Geen nieuwe events.** A verandert alleen hoe bestaande data gemeten wordt, B is
  navigatie. Bewust benoemd zodat het geen vergeten checkbox lijkt (regel 5 blijft gelden
  voor zoeken/matchen/offreren).

### Open punten / restrisico's

- ✅ **Naamgeving: glossary wint van de briefing.** De briefing koos "Brands", maar
  `docs/i18n-glossary-xis.md` legde Merkrelaties al vast als **"Brand relations"**. Dat
  conflict is gemeld in plaats van stil opgelost; **besluit Timo (20 jul): "Brand
  relations"**, ook omdat het duidelijker scheelt van "Brand portal". De glossary is
  bijgewerkt: de navigatierij stond nog op "Brand" en heeft nu zowel Merkrelaties als het
  hernoemde Merkportaal.
- ⚠️ **De balk loopt over op 375px.** Na "Anal…" vallen Settings, Brand portal en Admin
  buiten beeld. Niet nieuw — zeven items pasten al niet in een `flex`-rij zonder wrap
  (~390px nodig tegen ~290px beschikbaar) — maar B maakt het één item erger. Een echte
  oplossing (`overflow-x-auto`, overloopmenu of drawer) is een ontwerpbesluit en viel buiten
  1.3. **Bewust gemeld, niet stilzwijgend geredesigned.**
- **Overzichtsquery is zwaarder geworden.** `getAllBrandCompleteness` doet nu 69 in plaats
  van 24 `count(*) filter`-aggregaties in één group-by over ~211k producten, zonder `WHERE`.
  Het zijn `IS NOT NULL`-tests op rijen die er toch al zijn (geen extra I/O), en de
  correlated `EXISTS` op prijzen was al de kostendrijver — maar `/data/brand-relations` is
  door B wél een hoofdingang geworden. **Nog niet onder productielast gemeten.**
- **`measure` en `SCHRIJF_MAPPING` lijken nu bijna identiek** (69 vs 66 regels) en de
  verleiding om ze te "unificeren" wordt groot. Niet doen: de één is snake_case DB-namen
  voor SQL, de ander camelCase Drizzle-properties voor schrijven, en `category` mapt in
  beide anders. Meten ≠ een merk toestaan te overschrijven.

## Sprint 1.8 — Eigen velden toevoegen zonder de app te verlaten — af 21 jul 2026

Stefan kan op `/data/fields` een productveld toevoegen zonder code en zonder deploy.
Definities in `custom_fields` (migratie 0015), waarden in `products.custom_values jsonb`.
Geen `ALTER TABLE` vanuit de app: een veld toevoegen is een INSERT.

**Fase-documenten:** `docs/sprint1-8-fase1-probleem.md` (meting), `docs/sprint1-8-fase2-plan.md`
(het bevroren contract + waarom per beslissing), `docs/milieuvelden-toevoegen.md` (het recept).

### Aannames en open eindes

- **De briefing zei 13 lezers van de veldcatalogus; het zijn er 9.** Vijf daarvan importeren
  alleen types of een constante en zijn niet gewijzigd. Gemeten met
  `grep -rln 'from "@/lib/field-catalog"'`.
- **`lib/template-diff.ts` importeerde de veldcatalogus niet** en was er tóch aan gekoppeld,
  via de conventie dat `SCHRIJF_MAPPING` op catalog-key gesleuteld is. Dáárom viel een
  onbekend veld er stil doorheen als `not_storable`. Opgelost door `FieldProposal.kolom` te
  vervangen door `doel: SchrijfDoel` — een union, zodat de compiler elke vergeten plek aanwijst.
  ⚠️ **Niet terugdraaien naar een string-conventie**; dat was precies de bug.
- **`must` betekent voor een eigen veld iets anders dan voor een catalogusveld.** Bij de 66 is
  een ontbrekende must-KOLOM een harde afwijzing van het hele bestand; bij een eigen veld nooit.
  Reden: die afwijzing bestaat omdat catalogus-musts dragend zijn voor de verwerking (zonder
  `supplier_article_code` is er geen sleutel), en een veld van Stefan kan dat per definitie niet
  zijn. Zou het wél afwijzen, dan maakt één klik elk merkbestand dat onderweg is onbruikbaar —
  bestanden die geen merk had kúnnen invullen. Staat als commentaar in `lib/excel-validate.ts`
  en in het recept. **Niet "harmoniseren".**
- **De sleutel van een eigen veld is `custom:<uuid>`, niet iets leesbaars.** Bewust: het label
  mag hernoemd worden, dus een van het label afgeleide sleutel gaat liegen zodra dat gebeurt.
  Leesbaarheid zit in de events (elke payload draagt `labelEn`).
- **Verwijderen bestaat niet, archiveren wel.** `archived_at` wordt gezet, waarden blijven in
  `custom_values` staan. Waarden wissen zou een mass-update over productrijen zijn en
  `updated_at` verzetten — dat breekt de fingerprint-discipline van elke volgende sprint.
  Gevolg: een gearchiveerd veld laat weeswaarden achter. Er is geen opruimknop; dat is een
  bewuste keuze, geen omissie.
- **Labelbotsing is maar half een DB-constraint.** Eigen↔eigen: partiële unique index op de
  genormaliseerde `label_en` waar `archived_at is null`. Eigen↔catalogus kan geen constraint
  zijn — die 66 labels leven in TypeScript. Dat blijft `labelBotsing()` in de server-actie.
  ⚠️ **Restrisico:** voegt een programmeur later een catalogusveld toe met een label dat botst
  met een bestaand eigen veld, dan vangt niets dat af vóór de merge. De faalwijze is wél luid
  (`dubbele_kolomkop` → bestandsafwijzing), nooit stil verkeerde data.
- **`lib/custom-fields.ts` importeert `normLabel` uit `lib/excel-validate.ts`**, en
  `lib/template-diff.ts` importeert nu `lib/custom-fields.ts`. Daarmee trekt `template-diff` bij
  een runtime-import exceljs mee. Onschadelijk op serverpaden. ⚠️ **Een client component mag
  uitsluitend types uit `template-diff`/`custom-fields` importeren**, geen waarden.
- **`SchrijfDoel` heeft een derde variant `{ kind: "prijs" }`** die niet in het plan stond.
  `ConflictReden.unprocessable` wordt ook door het prijspad gebruikt en de prijs landt op
  `prices.gross_price` — geen products-kolom, dus niet uit te drukken als
  `keyof typeof products.$inferSelect`. Het alternatief was een cast, en dat is precies de
  stille leugen die deze union moet uitbannen.
- **`getBrandCompleteness`/`getAllBrandCompleteness` kregen een optionele `catalogus`-parameter**
  met `laadCatalogus(db)` als terugval, omdat hun aanroepers op geen van beide bouwagentlijsten
  stonden. Overal elders is de parameter verplicht zónder default — met opzet, want een default
  laat een aanroeper stil zonder eigen velden doorcompileren.
- **In de database staat één actief eigen veld** ("Recycled content (%)", categorie 10) plus één
  gearchiveerd exemplaar met dezelfde naam, en op `ZZTEST QA-15 / ZZTEST-LL15-0001` staat de
  waarde `42` onder de uuid van het gearchiveerde veld. Dat is het bewijsmateriaal van DoD 4 en
  6; weg te halen zodra het niet meer nodig is.
- ⚠️ **Er staan 5 git-stashes** (`sprint1-8-wip-*`) die een parallelle sessie tijdens deze bouw
  op de gedeelde werkdirectory heeft aangemaakt. Ze bevatten momentopnamen van dit sprintwerk.
  Niet zomaar droppen zonder te kijken.

### Bekend en niet gerepareerd

- **De testsuite is flaky onder volle belasting, breder dan gedacht.** Niet alleen
  `components/data/brand-message.test.tsx` (bekend), maar ook `components/admin/brand-admin.test.tsx`
  en de nieuwe `components/data/custom-fields.test.tsx`. Alle drie geïsoleerd groen (25/25, 14/14),
  alle drie vallen wisselend om in de volle run met "Matcher did not succeed in time".
  `brand-admin` is niet aangeraakt door deze sprint. Het is dus een suite-conditie
  (browser-mode + `waitFor` onder parallelle druk), geen bestandsprobleem — en de aanname
  "er is één bekende flaky test" klopt niet meer.

## Sprint 1.7 — Milieudata: de afstand tot Brink Licht — af 21 jul 2026

Eén gegeven erbij op het merk: `brands.factory_location` (het feit van het mérk) en
`brands.factory_distance_km` (ónze meting), onder een eigen kopje "Environment" op
`/admin/brands`. Garantietermijn, energielabel en land van herkomst bestonden al op
productniveau en zijn niet aangeraakt (G13).

**Correctie op alle eerdere tellingen: het zijn 436 bronimport-merken, niet 437.** Naar
aanmaakdag: 436 op 2 jul (de import), plus `ZZTEST QA-14` (20 jul) en `ZZTEST QA-15`
(21 jul). Sprint 1.5 telde QA-14 mee als bronimport-merk. Commentaar en fixtures die nog
"437" of "405 van de 437" zeggen zijn daarmee verouderd — cosmetisch, bewust niet
opgeschoond. Meting in `docs/sprint1-7-fase1-probleem.md`.

**De fingerprint-SQL ligt nu letterlijk vast** (zelfde doc). Sprint 1.5 legde alleen de
véldnamen vast, waardoor de hash `f4deb1efbea17090df1ff94d4b667cff` niet reproduceerbaar
is. De nieuwe nulmeting is `436 / 9e7695bf4b10ed555b27b5325d736c46` en was vóór én ná de
migratie identiek.

**Aannames en bewuste grenzen:**

- **Geen geocoding, geen kaartdienst.** De kilometers worden ingetypt. Daarom ook geen
  herrekenknop: die zou theater zijn.
- **Geen `factory_distance_basis`-kolom.** Een verhuizing van Brink is een globale
  gebeurtenis, geen per-rij-gebeurtenis: op dat moment zijn álle niet-lege afstanden
  verdacht. De werklijst staat als query in `lib/brink.ts`, direct naast het adres dat je
  dan wijzigt. Voor/ná de verhuizing is af te lezen uit het tijdstip van het event.
- **Eigen event `brand_environment_changed` met `{from, to}`**, niet een naam erbij in
  `payload.changed` van `brand_updated`. Reden: `changed` logt namen, geen waarden, en dit
  is het enige veld met een gedocumenteerd belangenconflict (een merk heeft er belang bij
  de afstand tot óns adres laag te schatten). Precedent: het lifecycle-event in dezelfde
  functie, om dezelfde reden.
- **G16 is hier niet gevolgd, bewust.** Uitbreiden zou via `lib/field-catalog.ts` gaan,
  maar die catalogus meet productkolommen en beschrijft wat we in het merk-Excel vrágen.
  Dit is een merkveld dat Brink zelf invult. Bovendien was field-catalog.ts een harde
  grens (sprint 1.6 zat erin).
- **Geen schrijfpad in het merkportaal** (dat is 4.B) en **geen handleiding voor Stefan**
  (dat is 1.8). Geverifieerd: `app/brand/data/page.tsx` heeft nul `<form>` en nul server
  actions — het invoerkanaal voor merkdata bestaat nog niet. De fabriekslocatie wordt door
  Brink ingevuld op basis van wat het merk per mail antwoordt.

**Testdata die in productie blijft staan:** `ZZTEST QA-15` heeft nu
`factory_location = "Bovezzo, Italië"`, `factory_distance_km = 980` — gezet via
`updateBrand()` om DoD 1 en 3 te bewijzen. Buiten de fingerprint.

**Open eindes / gemeld maar niet gerepareerd:**

- `deleteBrand` (`lib/repo/brands.ts`) kan `{ok:true}` melden zonder DELETE en zonder event
  als het merk tussen de impact-check en `getBrandForEdit` verdwijnt.
- `updateBrand` returnt stil bij een verdwenen merk, waarna `updateBrandAction`
  `{status:"idle"}` geeft — een edit op een verwijderd merk oogt als geslaagd.
- `components/dossier/pdf-upload.test.tsx:193` is **flaky onder volle suite-belasting**
  ("Matcher did not succeed in time"): faalde in één volledige run, groen in isolatie (43
  tests) en groen in een tweede volledige run (872 tests). Timing-gevoelig, niet gerelateerd
  aan 1.7.
- De comment in `components/admin/brand-form.tsx` beloofde dat een milieuveld "één regel"
  in `FIELDS` zou zijn. Dat klopte niet — `FIELDS` kent geen secties en de renderer zet
  hardcoded `type="text"`. Comment bijgewerkt, `FIELDS` ongemoeid.

## Sprint 1.4 — End-to-end via een testmerk — af 20 jul 2026

Het weekdoel: bewijzen dat merkdata door de héle keten komt en **zichtbaar wordt in de
catalogus**. De Flos-check van 20 jul maakte een product zónder prijs en bewees die helft dus
niet. Gedaan met een **testmerk**, omdat een verzonnen prijs alleen daar mag.

**Wat er in productie blijft staan (bewust, niets verwijderd):**

| | |
|---|---|
| Merk | `ZZTEST QA-14`, id `9ce0b729-c5e7-43ec-a7d1-4f62ce52ea5c` |
| Producten | 3 (`ZZTEST-LL14-0001/0002/0003`), status `actief` |
| Prijsregels | 2 (€111,11 en €222,22) — 0003 heeft er bewust géén |
| Prijslijst | `ZZTEST prijslijst 1.4`, **verlopen** (`valid_until` = `current_date - 7`) |
| Uploads / events | 1 upload, 13 events |

**Uitschakeling is gebeurd via ijzeren regel 3, niet met DELETE.** `visible_products` voor dit
merk staat op 0; producten, prijsregels en audit-spoor zijn intact. `archive.prices_archive`
is leeg gebleven — bewijs dat `archivePriceList` (die DELETE't) níét gebruikt is.

**Aannames en keuzes:**
- Fixture met een **ongelijk vulpatroon** (3/3, 2/3, 1/3, 0/3), vooraf vastgelegd. Een fixture
  die alles vult geeft overal 100% en is met elke kapotte implementatie verenigbaar.
- Eén product **zonder prijs** als negatieve controle: binnen hetzelfde merk 2 zichtbaar,
  1 niet. Dat scheidt "de view toont alle producten van het merk" van "…met geldige prijs".
- Matcher-velden kregen **absurde waarden** (kelvin 9999, CRI 1, IP00, 1 lm). De scorecard
  meet `IS NOT NULL` en leest de waarde nooit, dus volle dekking terwijl elk parametrisch
  filter het product uitsluit.
- Merknaam bewust **niet** `ZZ-TEST Lumen Logic` (de suggestie uit de briefing):
  `lib/matching/engine.ts:294` vergelijkt merken met `LIKE '%query%'`, een substring — een
  spec-regel met merktekst "Lumen" zou daarop matchen.

**Restrisico's — open, niet gefixt:**
- **`visible_specs` kent geen prijs-join** (`db/migrations/0005_h2_h3.sql:120-146`) en filtert
  alleen op `status='actief'`. De productpagina van het testartikel blijft dus bestaan, mét
  specs, zonder prijs. Regel 3 dekt `visible_products`, niet dit. Meting ná het verlopen:
  `visible_products` = 0, `visible_specs` = 3.
- **Verlopen is niet symmetrisch met aanmaken.** De lijst blijft "actief" in de
  `replaced_at IS NULL`-zin, dus `actievePrijslijst()` geeft hem terug. Een volgende upload
  voor dit merk toont daardoor géén prijslijst-fieldset en hangt prijzen aan een verlopen
  lijst — stil onzichtbaar.

**Codevondsten (gemeld met bewijs, bewust NIET gefixt — dit item verifieert die bestanden):**
- **`template_apply_finished.appliedFields` is structureel 0** bij een run met alleen nieuwe
  producten. `appliedFields` wordt alleen opgehoogd in de bestaande-producten-lus
  (`lib/repo/template-return.ts:518`), nooit in de nieuwe-producten-lus (`:415-478`). In
  productie gereproduceerd: `createdProducts: 3, appliedFields: 0` terwijl er 38 velden
  geschreven zijn. De betrouwbare teller is `product_created_from_template.payload.fields`
  (15 + 13 + 10 = 38).
- **Nergens wordt gevalideerd dat `validFrom <= vandaag`** — niet in het formulier
  (`components/data/template-proposal.tsx:630`, alleen `required`), niet in de action
  (`upload-actions.ts:186-190`), niet in `upsertPriceLines`. Een `validFrom` in de toekomst
  geeft **scorecard "prijs ✓" terwijl de catalogus leeg blijft**: de scorecard test alleen
  `valid_until >= current_date` (`lib/repo/brand-relations.ts:170`), de view óók
  `valid_from <= CURRENT_DATE`. Reëel gat, niet alleen een meetvalstrik.
- **Een niet-opslagbaar veld op een nieuw product laat geen enkel event achter**
  (`template-return.ts:419` + `template-diff.ts:525-548`). Bij bestaande producten is er nog
  `template_field_skipped_stale`.
- **`brand_template_downloaded` heeft `entity_id: null`** bij `entity: "brand"`
  (`app/data/brand-relations/template/route.ts:17`); de route kent geen brandId. De download
  is alleen op tijdstip aan een merk te koppelen.
- **Verouderde comment:** `db/schema.ts:686` verwijst voor de `visible_products`-DDL naar
  migratie 0001. De operatieve DDL staat in `db/migrations/0004_vijfstatussen.sql:201-241`
  (0003 en 0004 hebben de view herschreven).
- **Drizzle liet een onbekende kolom stil vallen:** `insert(brands).values({notes})` draaide
  zonder fout terwijl `brands` geen `notes` heeft (die hoort bij `suppliers`). Pas
  `bunx tsc --noEmit` ving het. Het merk is achteraf bijgewerkt met `description_nl`.

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
_2026-07-17 (live-check-fix, Raadhuis): `leesroute_batch_failed` — "Request timed out."
op dossier ae0eead9/run daf7c660 (batches pagina 1+4). Oorzaak: `CALL_TIMEOUT_MS`
(`lib/ai/shared.ts`) stond op 30 s; een dichte A3-leesroute-batch had ~61 s nodig
(2×30 s bevestigt de tijdlijn) — de SDK gooit dan `APIConnectionTimeoutError`
("Request timed out."), buiten het bereik van de bestaande O3-tripwire (die alleen op
`stop_reason === "max_tokens"` retryt). Fix: `CALL_TIMEOUT_MS` → 120 s, én
`leverRegelsMetRetry` (`lib/ai/ocr.ts`) vangt een timeout op de EERSTE poging op als
extra retry-trigger naast afkapping — alleen de eerste poging; timet de retry óók uit
(of om een andere reden), dan gooit hij door zoals voorheen (`{failed}`, reservering
blijft staan, hervatbaar). Nieuwe events `ocr_page_timeout`/`leesroute_batch_timeout`
maken een stil-opgevangen timeout zichtbaar zonder de bestaande "truncated"-naam te
misbruiken voor een andere faalklasse. Unit-tests (ocr.test.ts + leesroute.test.ts):
timeout→retry-succes, timeout→retry-timeout (blijft failed), timeout ná een echte
afkapping (blijft failed — alleen de eerste poging is beschermd), en een regressie-
anker dat een bericht met alleen het woord "timeout" (niet de letterlijke SDK-tekst
"timed out") geen retry triggert. `bunx tsc --noEmit` schoon, volledige suite groen
(722/1 skip), meetscript-dry-run (Raadhuis, geen `--ai`) groen. Klein gehouden: alleen
`lib/ai/shared.ts` + `lib/ai/ocr.ts` + `lib/ai/leesroute.ts` + hun tests.
_2026-07-17 (live-check-fix, "vacuous green"): dossier ae0eead9 (ZZ-TEST Raadhuis),
regel Lf902 (`18a8e22b…`) stond groen met 8 accessoires als "Provably compliant" —
zonder merk én zonder één toetsbare `req_*`-spec. Oorzaak: `judgeCandidate` (specs, …)
levert `deviations=[]` als er niets gevraagd is; `worstVerdict([])` valt terug op
`"groen"` (leeg = geen tegenspraak) — een lege eis "voldoet" triviaal aan alles. **De
lek zit in stap 5**, niet in de kandidatenzoektocht: live-onderzoek (read-only) toont
dat `Lw003`/`Lw101` in hetzelfde boek exact hetzelfde profiel hebben (merk `null`, alle
specs `null`) maar toevallig 0 fuzzy-kandidaten vonden ("Maatwerk wandarmatuur" matcht
niets) → rood via stap 4 — dat "rood" was dus zelf toeval van de zoektocht, geen
oordeel. Fix in `lib/matching/engine.ts`: nieuwe stap 1b — merk leeg ÉN geen enkele
toetsbare spec → status `open` met reden "te weinig gevraagd om gelijkwaardigheid aan
te tonen", vóór er zelfs naar kandidaten gezocht wordt. Merk-only regels (geen specs,
wél een merk) blijven ongemoeid — daar is het merk zelf de eis (expliciete non-goal,
bewaakt met een eigen test). Twee nieuwe tests + twee bestaande tests bijgewerkt
(bewuste statuswijziging, met motivering in de test-comments). `bunx tsc --noEmit`
schoon, volledige suite groen (725/1 skip). **Lf902 in productie gehermatcht**
(`runMatcher`, actor `system:fix-vacuous-green`): groen → open bevestigd. Bijvangst
(niet gefixt, buiten scope): `Lw003`/`Lw101` in dit dossier zouden bij hermatch óók
naar open verschuiven (zelfde profiel) — nog niet gehermatcht, op verzoek van Timo
kan dat alsnog. `outcome.reason` wordt nergens per regel gepersisteerd (alleen gebruikt
voor de blauw-wachtrij) — pre-existing gat, niet aangepakt in deze fix.
_2026-07-20 (live-check-fix, **gat A: vacuous green mét merk**): vervolg op c2121a3 —
de vier XAL-regels in dossier ae0eead9 stonden groen ("Provably compliant" met
montagerails en 2700K-varianten) terwijl alle req_*-velden null waren: mét merk glipte
een specloze regel door stap 1b, kreeg deviations=[] per kandidaat en dus vacuous
groen. Fix in `lib/matching/engine.ts` stap 5: bij nul toetsbare specs is élke
kandidaat hooguit **lijst 2** ("mogelijk — data onvolledig") — het merk is bij
fetchCandidates een zoekfilter, geen getoetste eis — en de regel zakt via de bestaande
incomplete-tak naar **open** met reason "merk gevraagd maar geen toetsbare specs —
niets aantoonbaar". Bewijs in comment dat geel/groen/auto-door dan onbereikbaar zijn
(judgeCandidate pusht alleen onder gevulde-req-veld-guards). `hasAnyRequestedSpec`
geëxporteerd; zelfde guard in `upgradeOcrLine`'s stillValid (verdediging-in-de-diepte:
via de rijkste-wint-poort is dat pad vandaag alleen met ≥1 spec bereikbaar). Bewust
omgedraaide testverwachting: de c2121a3-test "merk-only blijft WEL groen" pinde de
non-goal vast die de live-check weerlegde; inv2/inv7b toetsen de prijs-invariant nu op
lijst 2 (zelfde invariant, eerlijke lijst). Acceptatietest: groen 9→5 + open 4
(Lp302/Ls001/Lp401/Ls010 — boekregels zonder toetsbare spec), vangnet checked 4→8
(open doet mee — bestaand open-gedrag), estimate-totalen ongewijzigd (geen van de
geflipte regels had een match). Volle suite 726 groen; nulmeting-assert intact (het
ijkpunt bevat geen groen). **Live hermatch dossier ae0eead9** (actor
system:fix-vacuous-green-A): de vier XAL-regels groen→open, kandidaten als lijst 2;
0 regels groen-zonder-eis over; eindstand {paars:1, blauw:27, rood:8, open:6}.
Zichtbaar keten-effect (bedoeld): open-regels vallen buiten offerte/estimate-totalen
tot een mens kiest, en het vangnet checkt ze voortaan (budgetpoort blijft de rem)._
_2026-07-20 (live-check-fix, **gat B: de boek-specs landen op de regel**): de vier
XAL-regels van dossier ae0eead9 hadden alle req_*-velden null terwijl de brontekst de
specs letterlijk noemt. Oorzaak empirisch: het model kapt `ruwe_tekst` inconsistent af
vóór de spec-sectie (Lr301 stopte bij "112x106mm (ØxH)"; de Trilux-rij Ls004 was
volledig en had wél specs) — en `parseProductName` parseert het volledige rijsegment
perfect (27W/3000K/CRI90/IP20/39°/2810lm/DALI, incl. "13,1 W" met komma). Fix:
**deterministische segment-verrijking** (`lib/pdf/rijsegmenten.ts`, puur): de door het
model geleverde codes zijn segmentatie-ankers in de server-side paginatekst; het échte
rijsegment gaat ACHTERAAN de parse-input van `regelToSpecLine` (parseProductName is
eerste-match-wint — modeltekst wint, segment vult alleen lege velden; geen
verzin-risico, zelfde laagafspraak als besluit 8: LLM leest codes, deterministiek leest
cijfers). Randgevallen gedekt: rijkste-parse-wint bij meermaals voorkomende codes,
langste-code-wint bij suffixen (Lr001 vs Lr001B), gelijmde codes via preferente (niet
verplichte) rechtergrens, gemiste tussencode = geaccepteerd opslok-gedrag (B7-review
vangt het). Aanroep in `recordLeesrouteImport` (+ event `leesroute_segmenten_verrijkt`
met tellers) én in het meetscript (pariteit). Toolschema-route bewust verworpen: zeven
extra output-velden per regel vergroten precies de max_tokens-druk die het afkappen
veroorzaakte, en erven de gedocumenteerde run-variantie. **Backfill**
(`scripts/backfill-leesroute-segmenten.ts`, runId-arg, idempotent — 2e run 0): run
8e85421e bijgevuld, 30+ regels kregen specs uit het opgeslagen rawMarkdown, elk met
event `leesroute_specs_backfilled` + hermatch. **Acceptatie**: Lr301/Lr303 dragen
3000K/CRI90/IP20/27W/2810lm/39°|57° → eerlijk ROOD (de 2700K-SASSO's falen op
kelvin-exact); Lw001/Lw002 dragen 3000K/CRI90/IP44/13,1W|19,7W → open, rails als
"data onvolledig", nooit "aantoonbaar". Bonus-signaal: Jayden's vier artikelen staan
óók na de fix niet in de top-50 (rang >50 op alle vier) — bevestigt dat variant-ranking
op specs een eigen probleemdoc blijft (specs filteren de kandidatenquery niet, ze
beoordelen alleen). **Bijvangst, niet gefixt**: parseProductName leest een enkel
artikelnummer als spec (BEGA "24786W" → watt 24786 op Lr304; "304°"-achtige
beam-uitschieters) — pre-existing parserlimiet, alleen zichtbaar op blauwe regels;
kandidaat voor de parser-hygiënelijst. **Testflakiness**: drie volle suite-runs
flakten elk op een andere dark-mode-screenshottest (screens/data-screens/merk/
pdf-upload) die in isolatie —óók met de wijzigingen gestasht— groen is;
omgevingsflakiness browser-mode onder volle belasting, geen regressie._

_2026-07-20 (variant-ranking **stap 0: nulmeting**, geen code gewijzigd): `eval-testset.ts
--case=raadhuis` op rev `091241d`, limit 50 én 300. Uitkomst: `provable` leeg op alle vier
(Lr301 0/19, Lr303 0/31, Lw001 0/10, Lw002 0/19) — de belofte "hier komt geen groen uit"
staat. **De rang is limietafhankelijk**: Lw001 staat op 1 bij limit 50 en op 3 bij limit 300;
noteer voortaan `rang@limit`, een kale rang is betekenisloos. Drie eerdere claims sneuvelden,
alle drie read-only nagemeten: (a) de HANDOVER-regel hierboven "rang >50 op alle vier" klopt
niet — Lw001/Lw002 staan op 1 resp. 3; (b) hun top-3 is drie keer dezelfde
equivalentieklasse (`STRETTA 600 …37H/38H/32H`, identieke naam), dus tegen de herziene
meetlat zijn die twee **al klaar** en voortaan regressie-anker; (c) het probleemdoc's "131
SASSO-varianten delen de topscore" klopt niet — de SASSO's halen de lijst niet eens. Jayden's
artikel bestaat onder exact de boeknaam (`SASSO PRO 100 FL ADJ DALI 27W HO … 3000K`) maar
scoort `matchCount=6` tegen `INS 100 … CRI90 HIGH LUMEN DALI …` met **9**: de winnaar wint op
generieke tokens uit de vervuilde producttekst (`CRI` 13.407 XAL-producten, `LED` 22.621,
`3000K` 10.607), het juiste product draagt de onderscheidende (`SASSO` 4.846, `PRO` 1.323).
**Hefboommeting** (A = echt codepad, B–H = SQL-simulaties, XAL-only — richting, geen bewijs;
rang van `L360048-2413537F`): huidig **448** → schone tekst **105** → +spec-tiebreak **21** →
+beam uit optiekcode **8** → +dim-term **4**. Daaruit vier bijstellingen, vastgelegd als
correctiesectie in `docs/goal-variant-ranking.md`: (1) **stap 1 geeft nul rangwinst** —
verrijking vult kolommen, niet namen, dus `matchCount` beweegt niet; het is een
beoordelingsstap, niet de ">50% van de winst"-hefboom; (2) **stap 4 vóór stap 2 is schadelijk**
— idf zonder schone tekst maakt het slechter (448 → **504**), want dan wegen juist
paginakop-tokens (`Gefacetteerde`, `pasring`, `SDCM`) het zwaarst en wint een `PENDANT SHEET
METAL CLIP`; (3) stap 3 mist een **`dimmable`-term** (boek eist DALI-2; 62 van de 131 SASSO PRO
100 hebben de kolom gevuld) — zonder term staan vier niet-dimbare varianten vóór Jayden's
artikel; (4) de **watt-emmers scheiden 26,5 W niet van 27 W** (beide binnen 10% → zelfde +2,
daarna beslist het alfabet) — dat houdt de equivalentieklasse op 3–4; los op met een continue
`abs(max_wattage − gevraagd)`-tiebreak ná de emmers, NULL laatst. **Herziene volgorde: 2 → 3 →
5 → 1 → 4 → 6**; stapinhoud en alle *Doet NIET*-regels ongewijzigd. Nog open: `--assert-nulmeting`
toetst het 16 jul-ijkpunt en is **nu al rood** (verwacht raadhuis `merk-fout 31` /
`{blauw:30, paars:1}`, gemeten `merk-bestaand 14` / `fout 0` /
`{open:13, blauw:10, geel:5, rood:2, paars:1}`) — herijken in de stap 2-commit, mét motivering,
niet stilzwijgend. Stap 1 schrijft naar de **productie-DB** (dev draait op prod-Neon): afspraak
met Timo is poort-eerst-repareren, reviewrijen tonen, publiceren pas na expliciet akkoord._

_2026-07-20 (variant-ranking **stap 2 afgebroken — de hefboommeting van hierboven was fout**):
de twee plan-agents voor stap 2 kwamen onafhankelijk met dezelfde bevinding terug en die klopt.
**De hefboomtabel in de vorige entry is ingetrokken.** Hij was gebouwd op handgetypte invoer in
plaats van de echte geparste `productText`: wat "huidig (vuile tekst)" heette was Lr303's tekst,
en wat "schone producttekst (stap 2)" heette was de kále typeaanduiding `SASSO PRO 100` (3
tokens) — een tekst die stap 2 helemaal niet oplevert. Hermeten op het echte codepad
(`parseSpecLinesFromPages` → rang binnen de XAL-kandidatenset): **Lr301 (134 tok) → 2676,
Lr303 (55 tok) → 2023**; met de volledige termenstapel uit stap 3 + 5 (kelvin/watt-emmers, beam
uit optiekcode, dim-term, continue wattafstand) verschuift dat naar **2452 resp. 2020** — vrijwel
niets. **Oorzaak, en het haalt stap 3 als ontwerp onderuit:** `matchCount` is de primaire
sorteersleutel, Jayden's artikel scoort `mc=6` en ruim 2400 XAL-producten scoren hoger; een
tiebreak kan alleen hérordenen bínnen een gelijke matchCount en haalt een verlies op de primaire
sleutel per definitie nooit in. De doc-keuze "specScore is een tiebreak, geen gewogen som" had
een goede reden maar maakt de fix structureel onmogelijk. **Stap 2 is ook niet de oorzaak:**
Lr303's tekst is vandaag al schoon (55 tokens, geen paginarand) en staat op 2023 — de al-schone
regel is even stuk als de vuile; de tokens waarop de verkeerde winnaar scoort (`CRI` 13.407
producten, `LED` 22.621, `3000K` 10.607) staan in Lr301's **eigen** regeltekst, niet in de rand.
**Meetlat bijgesteld:** `Lr301 < 25 tokens` is onhaalbaar — de schone body is ~57 tokens en
tweelingregel Lr303 is 55 en geldt als gezond; onder 25 komen gooit `IP20/27 W/3000K/(39°)/2810
lm` weg, precies de `req*`-velden die stap 3 en 5 consumeren. Nieuw: **≤ 65 tokens én
reqKelvin/reqWatt/reqBeamAngle blijven gevuld**. **Wat de meting wél aanwijst:** het probleem zit
in de tekstrelevantie-term zelf — zolang 50–130 beschrijvingstokens even zwaar tellen wint een
product met veel generieke spec-woorden in zijn naam (`INS 100 1171 CRI90 HIGH LUMEN DALI …`,
mc=9) van het product dat de typeaanduiding draagt (mc=6). Naïeve idf is géén oplossing: dan
wegen `Gefacetteerde`/`SDCM`/`112x106mm`/`104` het zwaarst. **Status: stap 3/4/5 terug naar de
plan-fase** als één ingreep op de tekstrelevantie; stap 2 (opruiming, herziene lat) en stap 1
(beoordeling, poort eerst) blijven los uitvoerbaar. Geen code gewijzigd. **Les, tweede keer deze
sessie en vijfde keer deze week:** elke rangmeting begint bij `parseSpecLinesFromPages` op het
echte PDF, nooit bij een string in een script — beide keren zag de nagebouwde meting er
plausibel uit en wees hij de verkeerde kant op._

_2026-07-20 (variant-ranking **plan-fase tekstrelevantie + totale-orde-bugfix**): twee
plan-agents op de ontwerpvraag "hoe weeg je de typeaanduiding zwaarder dan de spec-proza",
beide verplicht gemeten via het echte codepad. Synthese in `docs/goal-tekstrelevantie.md`,
probleem in `docs/probleem-tekstrelevantie.md`. **Vier convergenties**, onafhankelijk: (1) de
primaire sleutel moet gerepareerd, een tiebreak kán het niet — bij Lr303 verliest het juiste
artikel de tekstsleutel met **0,125** (token `27` matcht `27W`, niet `26,5W`) terwijl het op
specs +2 vóórligt; dat haalt geen tiebreak in, op geen enkele epsilon (bevestigt `dc961fd`);
(2) de vroege tokens zíjn de typeaanduiding, want `splitBrandType` snijdt het merk eraf —
beide voorstellen zijn dezelfde gedachte in twee hardheden (harde kop vs continu
positiegewicht); (3) de optiekcode `FL`/`WF` is onmisbaar (Lr301 en Lr303 verschillen in niets
anders) én de tabel is **handwerk, niet af te leiden**: `beam_angle` is op 4% van de XAL-rijen
gevuld en de enige groepen die er zijn spreken zichzelf tegen (`ME` én `SP` staan op 30°);
(4) ⚠️ **de ordening was geen totale orde.** Gemeten: `asc(name)` als laatste sorteerterm,
namen niet uniek (131 SASSO PRO 100-varianten en 3 STRETTA 600-rijen byte-identiek), dus
Postgres mocht binnen een gelijke sleutel teruggeven wat het queryplan uitkwam — Lw001 gaf
over drie identieke runs rang **1, 1, 3**. Daarmee droeg **elke rangmeting op exacte
artikelcode in dit dossier ±2 ruis**, inclusief de mijne; alleen de equivalentieklasse was
stabiel (toevallig precies de gekozen meetlat, maar nu om de goede reden). **Gefixt in deze
commit**: `asc(articleCode), asc(id)` als sluittermen in `fetchCandidates`. `article_code` is
niet uniek (alleen `brand_id+supplier_article_code` is dat), dus `id` sluit de rij af — pas dan
is de orde aantoonbaar totaal. Beide prijs-blind, ijzeren regel 2 ongemoeid. Geverifieerd: 3
identieke runs geven nu identieke rang én identieke top-1 op alle vier de regels; Lw001/Lw002
staan stabiel op 2 (equivalentieklasse 1–2, meetlat gehaald). `bun vitest run` 748 groen /
70 bestanden, `bunx tsc --noEmit` schoon. **Gemeten resultaat van het voorstel zelf** (nog niet
gebouwd): Lr301 2675 → eq-klasse 1, Lr303 2023 → eq-klasse 1, ankers ongewijzigd, én het echte
criterium gehaald — Lr301 en Lr303 leveren **verschillende** topkandidaten (`SASSO PRO 100 FL
ADJ DALI 27W` vs `… WF ADJ DALI 26,5W`). **Eerlijke negatieven, gemeten:** spec-tokens
downwegen maakt het slechter (2675 → 9129); woordgrens-matching werkt qua rang (2675 → 40)
maar kost 10× looptijd (4,5 s → 46 s, ook met genormaliseerde naam/afgeleide tabel 54 s) en is
onbruikbaar; `typeHead` alléén scheidt Lr301/Lr303 niet. **Besluit Timo:** de vangrail "zonder
gevraagde specs blijft de query byte-identiek" blijft **letterlijk** — poort op
`hasAnyRequestedSpec`; specloze regels krijgen geen tekstrelevantie-verbetering, `inv2`/`inv7b`
houden hun garantie ongewijzigd. Agent 1's kop-poort daarmee afgekeurd in zijn huidige vorm.
**Nog niet gemeten en poort vóór merge:** beide voorstellen zijn afgeregeld op vier regels uit
één PDF en agent 2's coëfficiënten zijn gevoelig (`α=0,05` → Lr303 rang 9; `α=0,30` → Lw001
rang 3) — `eval-testset.ts` over de héle testset vóór merge, met als eis dat de andere 27
raadhuis-regels en kvk/tno ongewijzigd of beter zijn._

_2026-07-20 (variant-ranking **GEBOUWD: de tekstrelevantie-term**, agent 2's basis): in
`lib/matching/engine.ts` (`fetchCandidates`) + nieuw `lib/matching/textscore.ts`. **Positiegewogen
tekstscore** (`tokenWeight(i)=1/(1+i/2)`: token 0 = de typeaanduiding, want het merk is al
afgesneden, weegt 1,0; de proza-staart licht) repareert de PRIMAIRE sorteersleutel — de kern die
een tiebreak niet kon. **Gecombineerde sleutel** `weightedMatch + 0,15·specScore`, specScore
NULL-neutraal en spiegelend aan de tolerantie-oordelen (groen +1 / geel +0,5 / rood −1 / leeg 0),
plus een continue watt-afstand-tiebreak (NULL achteraan). **Drievoudige poort**: alleen bij
`brand.length>0` **én** `hasAnyRequestedSpec` **én** tokens — anders byte-identiek aan vandaag.
Twee subtiliteiten die stil konden slopen en gefixt zijn: (1) tokengewicht/coëfficiënt als
decimale literal via `sql.raw`, niet als bound-param — een untyped param in een CASE met `else 0`
laat Postgres integer gokken en dan faalt de coërcie van 0,667/2,7 ("invalid input syntax for type
integer"); (2) de **merk-poort** is geen kosmetiek maar een regressiefix: zonder merk trok de
spec-score op de merkloze placeholder-regel Ls002 ("Te bepalen door meubelmaker", enige eis
dimmable=DALI) een outdoor up/down-light als GROEN omhoog — gevonden tijdens het bouwen via de
volledige eval, gedicht door de merk-eis in de poort (agent 1 had dit voorspeld: Ls004→"EHBO").
**Gemeten (echt codepad, 3 identieke runs, stabiel):** Lr301 2676→**3**, Lr303 2023→**7**,
Lw001/Lw002 ankers eq-klasse **1** ongewijzigd. **Eerlijk over de meetlat die NIET gehaald is,
één oorzaak:** `beam_angle` is leeg, dus Lr301 (FL/39°) en Lr303 (WF/57°) krijgen dezelfde top-1
(`SASSO PRO 100 ME ADJ DALI 27W`) — "verschillende topkandidaten" en "eq-klasse 1–2" hangen aan de
optiekcode→beam-verrijking (volgende stap), precies zoals voorspeld. Wat wél binnen is: de juiste
familie staat bovenaan i.p.v. rang 2676 — de voorwaarde waar al het andere op wachtte.
**Blast-radius geverifieerd tegen main** (git stash-vergelijking, niet beredeneerd): raadhuis
wijzigt op precies één regel — Lr301 geel→open, en dat is eerlijker (juiste familie present, maar
cri/ip/lumen/beam onbekend → `provable` blijft leeg zoals beloofd; geen valse tolerantie-match op
een verkeerd product meer). tno/kvk/dordrecht **byte-identiek** aan main (Ls002's groen is
pre-existing en brandless — de merk-poort maakt merkloze regels byte-identiek). Vangrails: geen
prijs, `list`-toekenning + `judgeCandidate` onaangeraakt, `WHERE`/recall byte-identiek,
inv2/inv7b groen. Tests: `lib/matching/textscore.test.ts` (puur) + twee engine-tests (type-product
verslaat generiek-token-rijk lokproduct; merkloze poort gebruikt oude ordening). `bun vitest run`
**754 groen** / 71 bestanden, `tsc` schoon. **Nog niet gepusht** (besluit W4 — alleen de
sprintmaster pusht met expliciete SHA). Commit staat lokaal klaar. **Volgende stap, afgesproken:**
optiekcode→beam door de verrijkingspoort (bron `'optic-code'`, eigen `tier2_source`), NIET
hardgecodeerd; de beam-term in `specScore` is al bedraad en gaat vanzelf meewegen zodra de kolom
gevuld is._

_2026-07-21 (**steekproefpoort gerepareerd + optiekcode→beam gepubliceerd**): twee dingen, in
die volgorde. **(1) De poort, want die bestond alleen op papier.** `inSampleAt(i) = i % 3 === 0`
gaf voor XAL ~4.500 reviewrijen én publiceren paste ongereviewde items gewoon toe (alleen een
expliciete `'fout'` blokkeerde één item). Nu: `pickSampleIndices` — begrensd op 100, gestratificeerd
over distinct naamvormen (`nameShape`: cijferreeksen → `#`), en `assertSampleReviewed` laat
`publishRun` weigeren zolang één rij zonder oordeel staat. De UI toont dat en zet de knop uit.
⚠️ **Val die ik zelf maakte en de voorvertoning ving:** de eerste versie pakte de eerste 100
strata alfabetisch → de steekproef liep van ANDRO tot INS en toonde SASSO nooit. Nu worden de
plekken gelijkmatig over álle vormen verdeeld (bij XAL: 187 vormen → ANDRO…VARO, mét SASSO).
Een test dekt dit af; let op dat testdata dáárvoor in LETTERS moet verschillen, niet in cijfers
(nameShape maakt van elke cijferreeks een `#` — mijn eerste testopzet had daardoor 1 stratum).
**(2) De gecureerde tabel** in `lib/enrichment/optic-code.ts`, bron `'optic-code'`, via dezelfde
pijplijn (`startOpticCodeRun`) — dus mét steekproef, herkomststempel per veld en nooit-overschrijven.
Woordgrens-matching (`FL` niet in `FLEX`/`REFLECTOR`, `SP` niet in `SUSP`), zwijgen bij >1 code.
**Besluit Timo: alleen FL+WF gepubliceerd.** De meting bracht een scherpere tegenspraak boven water
dan gedacht: van de XAL-rijen mét beam_angle staan ME (48×) én SP (48×) allebei op exact 30,00° —
die data onderscheidt ME dus niet van SP en oogt als generieke default, terwijl onze tabel 25/15
zegt. FL/WF hadden nul gevulde rijen. `CONFIRMED_CODES = ["FL","WF"]`; ME/SP staan wél in de tabel
als vastgelegde kennis maar worden niet voorgesteld tot het 1.2-retourpad ze bevestigt (één regel).
**Gepubliceerd naar productie na expliciet akkoord**: run `3989/3989` toegepast, 0 overschrijvingen.
`L360048-2413537F` beam=39 en `L360048-2412537W` beam=57, beide met `tier2_source
{"beamAngle":"optic-code"}`.
**Resultaat: Lr301 staat nu op rang 1** (was 3). **Maar de acceptatie "Lr301 en Lr303 verschillende
top-1" is NIET gehaald** — beide geven `…2413537F`. Oorzaak exact gemeten, geen aanname:
FL-tekstscore 2,5644 vs WF 2,4394; het hele verschil (0,1250) komt van één token, `"27"` op positie
14 — de WATTAGE. WF wint op spec met 0,0750 (beam exact 57 vs 18° mis → geel), dus netto blijft FL
0,0500 vóór. **Dit is dubbeltelling in de tekstrelevantie-term van commit `3d5d69e`, niet in de
verrijking:** de tekstscore beloont het lettelijk voorkomen van `27` in de naam, terwijl `specScore`
watt al mét tolerantie beoordeelt (FL 27W exact, WF 26,5W binnen 10% — allebei groen). De ruwe
tekstmatch wint van de tolerante spec-match. **Voorgestelde fix (niet gebouwd, wacht op besluit):**
spec-waarde-tokens uitsluiten van de positiegewogen tekstscore zodra de spec-bewuste route actief
is — de tekstscore hoort het TYPE te identificeren (SASSO PRO ADJ), niet de getallen te
herbeoordelen. Let op: NIET alle cijfertokens uitsluiten — `100` in "SASSO PRO 100" is juist
type-identificerend; alleen tokens die een gevraagde spec-waarde zijn (of een eenheid dragen).
Vergt een volledige herverificatie tegen main, vandaar het besluitmoment.
⚠️ **Gevolg dat een besluit vraagt — de stopgap produceert nu GROEN.** Volledige testset na
publicatie: raadhuis `rang≤50` **4/4** (was 2/4), top-1 1/4, statusverdeling terug op de
oorspronkelijke nulmeting (`open:13 blauw:10 geel:5 rood:2 paars:1`). Maar **tno springt van
`groen:1` naar `groen:5`**: Lr302, Lr303, Lr304 en Lr305 zijn nu *aantoonbaar voldoet* (lijst 1).
Hun oordeel luidt telkens `beamAngle requested 51/56, delivered 57 → groen` + `dimmable DALI →
groen`, en die 57 komt uit ónze onbevestigde optiekcode-tabel. Formeel klopt het (de
tolerantietabel zegt ≤10° = groen, en er is ≥1 getoetst veld, dus "groen is groen" is niet
geschonden), en de herkomst is traceerbaar via `tier2_source`. Maar GROEN betekent in dit systeem
"aantoonbaar", en die bewering rust hier op een stopgap die XAL nog niet bevestigd heeft. Optie
als dat te ver gaat: een veld met `tier2_source = 'optic-code'` wél lijst 2 (mogelijk) laten
dragen maar géén lijst 1 (aantoonbaar), tot het retourpad bevestigt — dat vergt
herkomst-bewust oordelen in `judgeCandidate`, een nieuw mechanisme. Bewust niet eigenhandig
gebouwd; dit is een semantisch besluit, geen technisch.

_**→ BESLIST EN GEBOUWD (21 jul, gat B).** Besluit Timo: een verrijkt veld uit een ONBEVESTIGDE
bron mag lijst 2 dragen ("mogelijk — data onvolledig"), nooit lijst 1 ("voldoet aantoonbaar").
In `lib/matching/engine.ts`: `SELECTION` neemt nu `tier2Source` mee (staat al in de
`visible_products`-view, geen migratie nodig); `UNCONFIRMED_TIER2_SOURCES = new Set(["optic-code"])`
met de reden erbij; en in de scored-map zakt een kandidaat naar lijst 2 zodra één GETOETST veld
zijn waarde aan zo'n bron ontleent — zelfde figuur als gat A, in dezelfde stijl uitgeschreven.
Twee details die het gemakkelijk mis had kunnen gaan: (a) `tier2_source` is per KOLOM gestempeld
terwijl de deviations ándere veldnamen dragen (`watt`→`max_wattage`, `ip`→`ip_value`), dus er is
een expliciete `DEVIATION_FIELD_COLUMNS`-map — `sizeCm` put uit vier kolommen en telt al als
onbevestigd zodra één daarvan dat is; (b) een deviation met verdict `onbekend` telt NIET mee — daar
is niets ontleend. `'parsed-from-name'` staat bewust niet in de lijst: die waarde stáát letterlijk
in de fabrikantsnaam. De deviations zelf blijven ongemoeid (de waarde matcht écht; alleen de
belofte "aantoonbaar" vervalt) en de RANKING is niet aangeraakt — dit zit ná `fetchCandidates`.
**Gemeten via het echte codepad, vóór/ná op dezelfde base:** tno `groen:5 → groen:1`, en die vier
regels (Lr302/Lr303/Lr304/Lr305) staan nu `open` — niet rood (er is niets tegengesproken), niet
geel (er is geen gele deviation bijgekomen). Ls002 blijft groen: dat is de merkloze DALI-regel,
geen optic-code, dus terecht ongemoeid. Raadhuis, kvk en dordrecht **byte-identiek** (raadhuis
`open:13 blauw:10 geel:5 rood:2 paars:1`, `rang≤50` 4/4, Lr301 nog steeds **rang 1, top-1:ja**).
`bun vitest run` 808 groen / 74 bestanden, `tsc` schoon. Drie tests toegevoegd: onbevestigde bron →
open+lijst 2, bevestigde bron (`parsed-from-name`) → groen, en een onbevestigde kolom die niemand
toetst blokkeert niets._

_2026-07-21 (**dubbeltelling-fix — de laatste test van variant-ranking is GEHAALD**): docs in
`docs/probleem-wattage-dubbeltelling.md` + `docs/goal-wattage-dubbeltelling.md`.
**Het probleem:** de positiegewogen tekstscore beloonde het letterlijk voorkomen van een
spec-waarde in de productnaam, terwijl `specScore` datzelfde veld al mét tolerantie beoordeelt.
Gemeten op Lr303: FL-tekstscore 2,5644 vs WF 2,4394 — het hele verschil (0,1250) is één token,
`"27"` op positie 14, de wattage; WF won op spec met 0,0750 (beam exact 57 vs 18° mis), dus netto
bleef FL 0,0500 vóór. Hetzelfde getal telde twee keer, en de bottere meting won. **Het geldt niet
alleen voor watt:** Lr301/Lr303 dragen elk zes zulke tokens (lumen, watt, beam, kelvin, cri×2).
**De fix (herkomst, niet vorm):** een stuk tekst waaruit wíj een `req_*`-veld hebben afgeleid is
overgedragen aan `specScore` en mag door de tekstscore niet nóg eens ruw beoordeeld worden. De
spans komen uit **`parseProductName`'s eigen patronen** (nieuwe export `specSpans` in
`lib/enrichment/parser.ts`) — beslissend detail dat ik heb nagetrokken: `armaturenboek.ts:131`
doet `parseProductName(type)` waarna `type` als `productText` op de regel landt, dus de
`req_*`-velden zijn geparsed uit exact de tekst die de tekstscore tokeniseert. Eén waarheid; een
tweede regexset in de matcher zou ervan kunnen afwijken. Meteen daarmee opgelost: `L90`
(levensduur) matcht `CRI_RE` niet en wordt dus niet als CRI=90 onderdrukt — de valse positief die
naïeve getal-gelijkheid wél zou pakken. Drie beschermingen: (a) **NULL-conditioneel per kandidaat**
— is de productkolom leeg dan oordeelt `specScore` niet (besluit 4) en blijft het tekst-token
gewoon tellen; alleen waar de kolom gevuld is zwijgt de tekst; (b) **posities 0–1 nooit
onderdrukt** (Bega's `24786W` is een typenummer dat `parseWatt` als 24786 watt leest); (c) alleen
in `weightedMatch`, dus de spec-loze route en de `WHERE`/recall blijven byte-identiek —
`inv2`/`inv7b` groen zonder extra werk.
**ACCEPTATIE GEHAALD:** Lr301 → `L360048-2413537F` (FL), Lr303 → `L360048-2412537W` (WF) —
**verschillende top-1**. Lr303 sprong van rang 3 naar **rang 1**; raadhuis top-1 1/4 → **2/4**.
Beide topkandidaten hebben nu `beamAngle: groen (exact)`, en de 0,5 W verschil wordt correct als
tolerantie afgehandeld in plaats van als tekst-mismatch.
**Blast radius, vóór/ná via `--json` op dezelfde base: precies TWEE regels gewijzigd in de hele
testset.** Lr303 (de acceptatie) en Lr301 (`open → geel`). kvk, tno en dordrecht **byte-identiek**;
raadhuis `rang≤50` blijft 4/4; tno blijft `groen:1` (gat B intact); `provable` blijft 0 op beide
doelregels (gat A/B intact); auto-keuze blijft 0/4 vóór én ná (`pickUnambiguousYellow` vuurt niet,
want de kandidaten dragen onbekenden). Lr301's `open → geel` is dus informatief, geen
auto-acceptatie, en de top-1 blijft ongewijzigd en correct.
⚠️ **De in fase 1 voorspelde ~11 omslagen zijn NIET uitgekomen** — precies zoals het probleemdoc
waarschuwde dat die voorspelling onbetrouwbaar was (de replica modelleert de tiebreaks niet en
miste 9 van 13 volgordes). Dat is de bevestiging dat "meten, niet voorspellen" hier de juiste
regel was; de NULL-conditie + index-guard hielden de ingreep chirurgisch.
`bun vitest run` **878 groen / 76 bestanden**, `tsc` schoon. Zes nieuwe pure tests in
`textscore.test.ts` (o.a. `"100"` in SASSO PRO 100 blijft altijd staan, `L90` niet onderdrukt,
positie 0–1 onaantastbaar, en `tokenizeWithSpans` reproduceert exact de tokenlijst van
`fetchCandidates`). `scripts/eval-testset.ts` kreeg één read-only meetveld `top1Code` — zonder de
identiteit van de gekozen kandidaat is "verbetering of regressie?" op ongemapte regels niet in te
vullen._

⚠️ **Parallelle sessie in dezelfde working tree**: `app/admin/brands/*`, `components/admin/brand*`,
`lib/repo/{admin,brands}.ts`, `db/schema.ts`, `db/test-db.ts`, migratie `0013_merk_levensfase.sql`
en `docs/sprint1-5-*` zijn NIET van mij en zijn ongecommit gelaten. `components/admin/admin.test.tsx`
is momenteel rood door hún WIP (`brands-tier-block.tsx`, "client reference export 't' called on
server") — geverifieerd door alleen hún drie admin-bestanden te stashen: dan 9/9 groen met mijn werk
intact. Mijn commit raakt hun bestanden niet aan. Verder: `pdf-upload.test.tsx` is flaky onder
volledige parallelle suite-belasting (slaagt geïsoleerd, mét én zonder mijn wijzigingen)._

## Sprint 1.5 — merkbeheer in het systeem zelf (21 jul)

Merken konden alleen bestaan als de bronimport ze bracht. Nu kan de binnendienst via
`/admin/brands` een merk aanmaken, bewerken, de levensfase zetten en (als er niets aan hangt)
verwijderen. Migratie `0013_merk_levensfase.sql`, puur additief.

**De 437 bestaande merkrijen zijn niet aangeraakt (besluit G2), en dat is gemeten**, niet
aangenomen: fingerprint over id, naam, code, slug, land, tier, omschrijving, website en
`updated_at` van alle rijen, vóór de migratie én na de volledige DoD-run —
`437 rijen, md5 f4deb1efbea17090df1ff94d4b667cff`, identiek. `ADD COLUMN … NOT NULL DEFAULT` is
in PG11+ metadata-only, dus er is geen enkele UPDATE gedraaid.
⚠️ De brands-tabel telt inmiddels 438 rijen: `ZZTEST QA-15` is van een parallelle sessie, niet
van mij. Sluit die rij uit en de hash klopt exact.
*(Sprintmaster, 21 jul: dat testmerk is van mij — aangemaakt voor een handmatige walkthrough van
het merkretourpad, midden in deze sessie. De meting van 1.5 was dus correct op het moment van
meten; alleen de noemer schoof erna op. Het merk staat er bewust nog: de prijslijst is geldig tot
21-07-2027, dus het is zichtbaar in de catalogus. Opruimen kan met `scripts/testmerk-1-4.ts`.)*

**Levensfase = drie waarden**, niet twee: `actief | slapend | bestaat_niet_meer`. In de 18
geannoteerde merknamen staan twee verschillende zinnen. `Itre (niet meer gebruiken)` is een
besluit van Brink (→ `slapend`); `Tronconi (BESTAAT NIET MEER)` en `Luxit (Is failliet)` zijn
uitspraken over de wereld (→ `bestaat_niet_meer`). Met alleen een tweede waarde zou Timo bij die
eerste drie een onwaarheid moeten vastleggen en zou de annotatie in de naam blijven staan — dan
lost G1 die rijen niet op. Géén `failliet` (dat is een reden, hoort in `description_nl`).

**Twee fouten in de sprintbriefing, gevonden door tegen de bron te meten:**
1. De briefing noemt `categories` en `organizations` als tabellen met een FK naar `brands`. Geen
   van beide heeft die. De regelnummers waren één tabel verschoven. Wél blokkerend en níét
   genoemd: **`price_lists`**. Volledige lijst uit `information_schema` staat in
   `docs/sprint1-5-fase1-probleem.md`.
2. De briefing gaat ervan uit dat 405 merken vrij verwijderbaar zijn. **Dat zijn er nul.** De
   import geeft élk merk precies één prijslijst (437 lijsten over 437 merken), ook merken zonder
   één product. Bij 405 merken is die lege lijst de énige blocker. DoD 3 is daarom alleen te
   demonstreren op een merk dat in dezelfde sessie is aangemaakt; DoD 4 is het normale geval.
   Daarom noemt het scherm de prijslijst bij naam mét het aantal prijsregels — "1 price list —
   Brutoprijslijst Tronconi (0 price rows)" — anders leest "1 prijslijst" bij een leeg merk als
   een fout.

**Bewust niet gedaan / open eindes:**
- **Opvolger-verwijzing** ("Murano Due = Leucos geworden", 5 merken). Timo heeft die vraag gehad
  en niet gekozen. `bestaat_niet_meer` dekt de status, niet de bestemming. Vergt een
  self-reference-migratie en raakt de matcher. **Opvolgtaak.**
- **`slug` beweegt niet mee bij hernoemen.** Slug is niet uniek, is nergens een route (die gaan
  op `brandId`) en heeft buiten de import één lezer. Stil laten verschuiven wijzigt een waarde
  die niemand ziet. Bewuste keuze.
- **N+1 in `app/admin/brands/page.tsx`**: `listBrandFieldOverrides` draait één query per merk,
  over 437 merken. Bestond al vóór 1.5, niet gerepareerd (melden, niet meenemen). Eén `IN`-query
  zou het oplossen. **Opvolgtaak.**
- **`components/data/brand-message.test.tsx` is flaky** onder volledige suite-belasting (de
  10s-`waitFor` op "Copied"); geïsoleerd 6/6 groen, en mijn diff raakt `components/data/` niet.
- **`BrandTierRow.brandCode` en `.lifecycle` zijn optioneel gemaakt** zodat de bestaande fixtures
  in `components/admin/admin.test.tsx` niet hoefden te wijzigen (die vier PNG's blijven geldig).
  Wil je ze verplicht: twee fixture-regels daar.
- **Milieu-informatie per merk** is buiten scope gehouden, maar het formulier zet zijn tekstvelden
  in een `FIELDS`-array — een veld erbij is één regel.

## Sprint 1.6 — de scorecard vertelt de waarheid over merkdata (21 jul)

**Deel A.** `pl.valid_until >= current_date` is uit `completenessSelection()`
(`lib/repo/brand-relations.ts`) gehaald. Compleetheid meet vanaf nu AANLEVERING, niet
geldigheid. Zichtbaarheid blijft ongemoeid bij `visible_products` — gemeten: 210 119 rijen
vóór én ná. De meting blijft een EXISTS; het bedrag wordt nergens gelezen.

**Deel B.** `components/data/price-list-expiry-notice.tsx` — één gedeelde component, drie
gewichten (`banner` op de merkpagina, `badge` op `/admin/brands`, `inline` op
`/data/price-lists`). Neemt `indicator` van `priceListIndicator()` en herhaalt de datumregel
dus niet. Er is bewust géén prop voor een bedrag.

**Deel C.** De zes 🔒-velden staan nu in bucket 11 "Internal"; categorie 1 t/m 10 wordt via
`templateBuckets()` afgeleid uit `excelColumns()` (66 = 66). `scorecardAggregate()` rekent
veldgewogen (G12) náást `bucketScore()`, dat ongewijzigd bleef.

**Bewust niet gedaan / open eindes:**
- **Catalogus-uitzondering (ijzeren regel 3).** Een merk met een verlopen prijslijst verdwijnt
  volledig uit `visible_products` — er is dus geen merk-rij om een waarschuwing aan te hangen,
  precies op de plek waar iemand het effect merkt. Daar is bewust NIETS gebouwd: dat raakt regel
  3 en is een eigen ontwerpvraag. **Opvolgtaak.**
- **Latent lek in `lib/brand-message.ts`.** Dat bucket 11 nooit in de merkmail belandt, hangt
  eraan dat `dekking()` `null` teruggeeft zodra `must.total + wanna.total === 0` — en de vier
  meetbare 🔒-velden staan toevallig allemaal op `nice`. Krijgt `purchase_price_excl_vat` ooit
  een kolom (de converse-test dwingt dan `measure: col(...)` af), dan wordt `wanna.total` 1 en
  verschijnt het label "Internal" in de mail NAAR HET MERK. Vastgelegd met een expliciete test
  in `lib/brand-message.test.ts`, maar het blijft een scherpe rand. **Opvolgtaak.**
- **`priceListIndicator(validUntil)` wordt op de merkpagina zonder `today` aangeroepen**
  (`app/data/brand-relations/[brandId]/page.tsx`), terwijl de lijstpagina wél een vaste `today`
  meegeeft. Bestaande inconsistentie, niet gerepareerd (melden, niet meenemen). **Opvolgtaak.**
- **`listBrandRelations` neemt `max(valid_until)` als "de" prijslijst.** Heeft een merk ooit een
  nieuwere kortlopende naast een oudere langlopende lijst, dan is de indicator fout. Vandaag
  latent: alle 438 merken hebben precies één lijst. **Opvolgtaak.**
- **Screenshots kappen af op de viewporthoogte.** `page.screenshot()` schildert alleen wat binnen
  de viewport (800 px) valt; alles daaronder is blanco. Raakt élke pagina langer dan 800 px en
  bestond al vóór 1.6. Daarom een aparte capture op volle hoogte
  (`data-scorecard-volledig.*.test.png`) — anders is de scorecard niet visueel te controleren.
- **`components/data/brand-message.test.tsx` blijft flaky** onder volle suite-belasting (de
  10s-`waitFor` op "Copied"); al gemeld bij 1.5, opnieuw waargenomen, geïsoleerd groen.
## Liegende import-melding (goal-liegende-import-melding, 21 jul)

Een geslaagde PDF-import meldde zich als mislukking: bovenaan "20 spec lines imported",
eronder in het rood "Import failed — please try again." Oorzaak, bewezen in de
Next-bron (16.2.10, `server-action-reducer.js:215-234`): een server action die
`redirect()` aanroept laat zijn **client-side promise REJECTEN** met een
`NEXT_REDIRECT`-error — Next' navigatiesignaal, geen fout. De lege `catch` in
`pdf-upload-card.tsx` verklaarde dat tot "Import failed". Omdat de redirect naar
dezelfde route ging bleef de kaart gemount en bleef de rode regel staan.

Aanpak: classificeren op **bestemming** (`lib/next-action-result.ts`), niet op "is het
een redirect" — alleen een redirect naar de eigen projectroute is succes, `/login` is
een verlopen sessie, en al het overige faalt (default-deny). Details en meetlat in
`docs/probleem-liegende-import-melding.md` en `docs/goal-liegende-import-melding.md`.

**Bewust niet gedaan / open eindes:**
- **Het action-contract is NIET omgegooid.** Overwogen is om `redirect()` uit de twee
  client-geawaite actions te halen en `{ok:true, …}` terug te laten geven, met
  `router.push()` op de client. Afgewezen: `revalidatePath` + `redirect` zijn serverside
  één transactieafsluiting waarvan de URL de drager is, het zou 2 van de 24 actions laten
  afwijken, en het raakt `app/projects/actions.ts` (de vangrail van deze opdracht).
  Beslissend: `requireSession()` redirect naar `/login`, dus `NEXT_REDIRECT` blijft óók
  mét dat contract binnenkomen — de classificator is de ondergrens bij élk contract.
  Als deze codebase ooit één gedeeld actie-resultaatcontract krijgt, is dát de juiste
  vorm, en dan voor alle 24 tegelijk. **Opvolgtaak.**
- **Het proptype liegt nog steeds.** `PdfPagesImportAction` heet
  `Promise<{error: string} | void>`, maar dat `void`-succespad is in productie
  onbereikbaar (bij succes rejectet de promise). TypeScript kan dat niet uitdrukken;
  er staat nu een comment op de typedefinitie. Verdwijnt pas met de contractwijziging
  hierboven. **Opvolgtaak.**
- **`app/projects/[id]/page.tsx` geeft de upload-kaart een `key={run ?? "idle"}`.**
  ⚠️ Die key mag UITSLUITEND van searchParams afhangen. `revalidatePath()` vuurt bij élke
  OCR-tegel, dus de pagina rendert tijdens een lopende run voortdurend opnieuw; een key
  die van dáta afhangt (regelaantal, `pendingOcr`, `updatedAt`) remount de kaart middenin
  de OCR-lus en doodt een betaalde run. Staat als comment ter plekke.
- **Eén bestaande assert is bewust omgekeerd**, niet afgezwakt: de happy-OCR-test
  verwachtte na afloop een wéér vrije knop. De kaart blijft nu in 'handoff' op slot tot
  de navigatie hem remount — anders nodigt een geslaagde run uit tot een tweede, betaalde
  poging. Bij een FOUT gaat de kaart wél weer van slot (ongewijzigd getoetst).
- **De 10s-anti-hang in de kaart** is een vangnet voor het geval de navigatie uitblijft
  (de `key` kan dat niet detecteren: geen navigatie = geen nieuwe key). Het is het eerste
  dat mag sneuvelen als iemand hier wil snoeien.
- **Andere client-side action-aanroepen zijn nagelopen** en zitten niet in deze val: de
  `catch`-blokken in `compare-tray.tsx` en `brand-message-block.tsx` omsluiten
  localStorage resp. de clipboard-API, en alle overige redirectende actions lopen via
  `<form action={…}>` of een server component.

## TNO-boek regel-voor-regel beoordeeld — 7 openstaande bevindingen (27 jul)

Een aparte sessie liep alle 20 regels van `Bijlage_E02_TNO_AvB_Armaturenlijst.pdf` na tegen
`scripts/eval/grondwaarheid.ts` en het boek zelf. De sprintmaster heeft de bevindingen
read-only tegen de database geverifieerd; de cijfers hieronder zijn zelf nagemeten, tenzij
anders vermeld. **Bevinding 1 is opgelost en staat live** (`3f9fd60`, zie
`docs/probleem-productnaam-kolom-valt-weg.md`). De overige zeven staan open — vandaar deze
lijst, zodat ze niet met die chat verdwijnen.

Gegroepeerd naar dader-laag, want dat bepaalt wie het oplost.

### Laag 1 — inlezen (parser/AI-leesroute)

- **Kale getallen zonder eenheid worden niet als eis gelezen** — raakt 19 van de 20 regels.
  Het boek drukt lumen, W, CRI, IP, kleur en maat als losse kolomwaarden (`2460  23,8  103  19`);
  de parser heeft een eenheid of label nodig (`WATT_RE`, `CRI_RE` … in `lib/enrichment/parser.ts`).
  Geverifieerd: `req_cri` is **null op alle 20 regels**, terwijl het boek bij Lr001 gewoon
  `CRI> 80` in een eigen kolom heeft staan. **Grootste resterende hefboom in deze laag.**
- **Merk komt uit de verkeerde subrij of kolom** — 4 regels. Bij Lp601a/Lp601b/Lp602 staan twee
  subrijen (armatuur + lichtbron) met twee merken; de lezer pakt consequent de laatste →
  `merk="Philips"` in plaats van Oblure/Pantone. Bij Ls001 schuift hij één kolom op →
  `merk="Xooline"` (de productnaam) in plaats van LED Linear. Beide zelf geverifieerd in
  `spec_lines`. Gevolg: de inlaadwachtrij vult zich met `philips`/`xooline` terwijl Oblure er
  níét in staat — en Jayden offreerde er wél twee Oblure-artikelen voor.
- **Het rijsegment van de laatste code is onbegrensd** — 1 regel (Lp101). Zijn segment loopt door
  tot het einde van het document en slokt het Opmerkingen-blok plus kolomkoppen op. Geverifieerd:
  `req_watt = 40.00` en `req_beam_angle = 25.00` terwijl het boek bij Lp101 tweemaal `n.t.b.` zegt.
  Herkomst (door de sessie gerapporteerd, plausibel): "Maximaal 40W." en "bij Ta 25°C" — een
  omgevingstemperatuur uit een kolomkop is een stralingshoek-eis geworden. **Verzonnen eisen zijn
  erger dan ontbrekende: ze sturen de matcher actief de verkeerde kant op.**
- **Stralingshoek wordt alleen gelezen mét gradenteken** — 2 regels. Geverifieerd: Ls002 (`120`
  zonder `°`) → `req_beam_angle = null`; Ls003 (`120°`) → `120.00`. `BEAM_RE` eist `°`/`deg`/`graden`.

### Laag 2 — data (lege kolommen / merken zonder producten)

- **Vijf merkrijen bestaan maar hebben nul producten**: Philips MyCreation, Intra-lighting, Moooi,
  Oblure, LED Linear. Het gedrag is correct (blauw + inlaadwachtrij, precies waarvoor blauw
  bestaat), maar het gat is echt: **Jayden offreerde uit vier van deze vijf**. Dit is
  week 1-werk (merkgegevens-spoor), niet het matchspoor.

### Laag 3 — ordening

- **Merkloze regels zoeken door de hele catalogus** — 3 regels (Ls002/Ls003/Lp101). De poort in
  `fetchCandidates` schakelt bij een leeg merk terecht de spec-bewuste ordening uit, maar laat de
  tekstzoektocht wél toe. Gevolg: pendelkits en spiegelarmaturen als kandidaat bij een
  placeholder-regel. Status `open` is per regelset verdedigbaar (lijst 2, alles onbekend), maar
  wat de gebruiker ziet is ruis.

### Laag 4 — oordeel

- **Placeholder-merk valt willekeurig uiteen in rood en open** — 7 regels. `n.t.b.`
  (Lr001/B/C/_N) wordt **rood**; "te bepalen door meubelmaker/wandenmaker" (Ls002/Ls003) wordt
  **open**. Beide betekenen "nog te bepalen". Het enige verschil is of het Nederlandse typewoord
  toevallig in een productnaam voorkomt. **Dit is geen bug maar een openstaand besluit van Timo:
  welke status hoort bij een expliciet-nog-te-bepalen regel?** Zolang dat niet beslist is, blijft
  de uitkomst toeval.

**Cijfers van de ronde:** import 20/20 codes gelezen (de AI-leesroute leest er méér dan de
deterministische 15/20) · merkkolom 16/20 correct (9 van de 13 gevulde, 7 van de 7 lege — leeg
lezen wáár het boek `n.t.b.` zegt is correct gedrag, geen misser) · bruikbare kandidaten vóór
bevinding 1: 0/20.

---

## 2026-07-30 — Sprint 2.0a: informatiestructuur opnieuw indelen (doelboom bevestigd)

**Fase 0/1 afgerond via ingesproken feedback van Timo** (de HTML-sorter is opzij gezet — Timo
gaf de indeling mondeling). Onderstaande **doelboom is door Timo bevestigd (30 jul)** en is de
basis waarop gebouwd wordt. Alles is de **Intern-view**; labels voor de User-rol veranderen pas
later. **Harde grens blijft: alleen structuur. Géén auth, géén server-side route-gating, géén
rollen/orgs in de db** — dat is week 3. Deze sprint levert de structuur + een rol→schermen-kaart
op papier.

**Bevestigde besluiten (30 jul):**
1. **Merk-plek.** Admin wordt **puur "merken toevoegen/verwijderen"**. Al het andere rond een
   merk — relatie, datacollectie **én zichtbaarheid/tier + per-veld-uitzonderingen** (nu
   `/admin/brands` "Brands & visibility") — verhuist naar **Brand relations**. De dubbele
   Data-kaart naar brand-relations vervalt.
2. **Event-log = ruwe data → onder Data.** Het "Logged events / By type"-blok (nu op
   `/analytics`) én de Activity-tabel (`/admin/events`) zijn twee vensters op dezelfde
   events-tabel → samenvoegen tot **één Event-log-view onder Data**. Weg van Analytics én weg
   uit Admin.
3. **Analytics = puur waarde-inzicht, deze sprint alleen placeholders** (optie A: "hoeft niet af
   te zijn"). Tegels: veel-opgezocht · "expert worden" · "armaturen → XIS" · projecten
   aangemaakt · XIS-herkende projecten · **Loading-signaal** (vaak aangevraagde merken die we nog
   niet hebben — verhuisd van `/data/loading`) · + 5× "to be determined". Echte berekeningen = later.
4. **Rol-conditie deze sprint = nee.** Bouw één goede interne structuur voor iedereen. Enige
   verschil Intern vs. super admin = of je **Admin** ziet. Geen rol-schakelaar in de UI.

**Doelboom (top-nav, intern):**
1. **Projects** — ongewijzigd. *Weg:* de "Analytics →"-link op de projectenpagina.
2. **Catalog** — ongewijzigd (+ productdetail `/products/[id]`).
3. **Brand relations** — thuisbasis voor álles rond een merk (relatie + datacollectie +
   zichtbaarheid/tier + per-veld-uitzonderingen).
4. **Data** (puur data) — kaarten: Enrichment · Price lists · Evaluation · Fields · **Event-log**.
5. **Analytics** (puur waarde, alles placeholder) — zie besluit 3. *Weg:* ruwe "Logged
   events/By type" (→ Data) + back-links.
6. **Settings** — ongewijzigd.
7. **Brand portal** — ongewijzigd (preview van de merk-omgeving).
8. **Admin** (super admin) — alleen: merken toevoegen/verwijderen · Imports · Users. *Weg:*
   Activity (→ Data), Brands & visibility (→ Brand relations).

**Rol→schermen-kaart (op papier, voor week 3):** Intern = 1–7 · Super admin = 1–8 · User =
Projects + Catalog · Brand = Brand portal.

**Zelf op te pakken (geen Timo-beslissing nodig):**
- **Brand relations is traag** — Timo's eigen constatering. Meten + melden met bewijs; **niet**
  repareren binnen 2.0a (anders niet meer te zien wat 2.0a veranderde).
- **Mobiel/375px** — desktop-first; balk netjes laten afbreken i.p.v. overlopen; geen apart
  hamburgermenu tenzij Timo erom vraagt.
- **Event-log-scherm onder Data** — tellingen (By type) + chronologische tabel samenvoegen tot
  één scherm.

**Nog te bewaken:** ijzeren regel 5 (elke navigatie/zoekactie logt een event) blijft heel; de
Activity-viewer verplaatsen verandert de logging niet. `components/site-nav.test.tsx` groen
houden of bewust aanpassen.

### Fase 2 afgerond — convergerend bouwplan + 3 guardrails (30 jul)

Twee onafhankelijke plan-agents (Fable) convergeerden. Timo gaf **groen licht voor Fase 3** met
drie guardrails:

1. **HARD — analytics-querylaag blijft staan.** `lib/repo/analytics.ts` (`getAnalytics`) én
   `components/analytics-view.tsx` worden **niet** aangeraakt/verwijderd — dat is het fundament
   van 2.1 en is niet achteraf toe te voegen. Alléén `app/analytics/page.tsx` → placeholder-tegels
   (geen `getAnalytics`-call, geen back-link). De nieuwe Event-log-view krijgt daarom een **eigen**
   telquery `countEventsByAction` (nieuw in `lib/repo/events.ts`) en een eigen label-map — de
   `ACTION_LABEL` in `analytics-view.tsx` wordt niet verplaatst maar los opnieuw gezet (nieuw
   `lib/event-labels.ts`), zodat `analytics-view.tsx` byte-stabiel blijft.
2. **Scope bevestigd (geen afwijking):** top-nav blijft **8 items**. De **vier-rollen-nav** én de
   **375px-overloop** schuiven naar later (week 3 / apart item). Het eerder genoemde
   "balk-graceful-wrap"-zelfklusje **vervalt** — 375px is nu expliciet uitgesteld.
3. **Rol→schermen-kaart opgeleverd:** `docs/rol-schermen-kaart-2.0a.md` (de G21-papierdeliverable
   waarop week 3 verbergt zonder herbouw).

**Convergerend bouwplan (wat gebouwd wordt):**
- **Event-log → Data.** Nieuw `app/data/event-log/page.tsx` + view die tellingen (By type) +
  chronologische tabel samenvoegt. `components/admin/events-block.tsx` → `components/data/`
  (puur presentational, 1-op-1). Nieuwe lean query `countEventsByAction` in `lib/repo/events.ts`;
  `recentEvents` (bestaat) hergebruiken — **direct** uit `events.ts` importeren, niet via
  `recentAdminEvents` (dat in `admin.ts` bij schrijfpaden woont). `app/admin/events/page.tsx` weg
  + redirect `/admin/events` → `/data/event-log` in `next.config.ts`. Admin-overzicht: Activity-kaart
  + `recentAdminEvents`-call weg.
- **Merk-zichtbaarheid → Brand relations.** Tier + per-veld-toggles als sectie "Visibility
  (disclosure)" op de **detailpagina** `app/data/brand-relations/[brandId]/page.tsx` (niet in de
  437-rijen-tabel). Nieuw `components/data/brand-visibility-block.tsx` (éénmerks-variant van
  `brands-tier-block.tsx`). Actions `setTierAction`/`setFieldVisibilityAction` verhuizen van
  `app/admin/actions.ts` → `app/data/brand-relations/actions.ts` (alleen `revalidatePath`-doelen
  wijzigen); de repo-functies (`setBrandTier`/`setBrandFieldOverride`) — die de events loggen —
  blijven staan → **ijzeren regel 5 heel**. `/admin/brands` wordt de slanke
  add/edit/delete-lijst; de bekende N+1 verdwijnt als **bijvangst** (geen extra perf-werk).
- **Data-hub:** Event-log-kaart erbij; Loading- en Brand-relations-kaart eruit; badges in
  `app/data/page.tsx` opschonen.
- **Analytics → placeholders** (guardrail 1). **Projects:** "Analytics →"-link eruit.
- **Tests:** `site-nav.test.tsx` blijft groen (nav ongewijzigd); `admin`/`brand-admin`/
  `brand-relations`/`data-screens`-tests + screenshots bewust bijwerken.

**Bug gemeld, NIET gefixt (Timo's regel):** Brand relations traag → `getAllBrandCompleteness`
(`lib/repo/brand-relations.ts:262-277`) scant de volledige products-tabel (~210k rijen) met
~67 `count(...) filter`-expressies per rij + gecorreleerde prijs-`EXISTS`; `listBrandRelations`
telt `productCount` via gecorreleerde subquery per merk (×437). Kandidaat voor latere sprint.

**Uitvoering:** gebouwd door sonnet-agents (Timo's model-per-fase: bouwen = lichter model), die
elkaars diff cross-reviewen; daarna volledige `bun vitest run` + screenshots (light/dark ×
mobile/desktop) bekeken. **Niet pushen/deployen zonder Timo's expliciete akkoord** (elke push naar
main deployt live).

### Fase 3 afgerond — gebouwd, geverifieerd, NIET gepusht (30 jul)

Drie sonnet-bouwagents (event-log · data-hub+analytics+projects · merk-zichtbaarheid), daarna
twee cross-review-agents. Resultaat:
- **Verificatie:** `bunx tsc --noEmit` schoon (exit 0). `bun vitest run` = **967 groen, 1 skip,
  1 failure** — die ene = `components/data/custom-fields.test.tsx`, een bekend-flaky suite onder
  volle belasting; **geïsoleerd 14/14 groen**, dus geen regressie. (Test-infra: eerst `bun install`
  in de worktree nodig, anders falen alle DB-tests op de PGlite `Invalid FS bundle size`-infra-gap —
  zie memory.) Screenshots event-log / brand-visibility / brand-list (light+dark, desktop+mobile)
  zelf bekeken: correct; de 375px-tabeloverloop is het bekende, uitgestelde item.
- **Beide cross-reviews = GO.** Guardrail G1 hard bevestigd: `lib/repo/analytics.ts` +
  `components/analytics-view.tsx` staan **niet** in de diff (byte-stabiel). Ijzeren regel 5 heel
  (`logEvent`-calls in `setBrandTier`/`setBrandFieldOverride` ongewijzigd; alleen action-wrappers
  verhuisd). Geen dangling refs; redirect `/admin/events`→`/data/event-log` + revalidatePath-doelen
  correct. `nav-items.ts` ongewijzigd (8 items).
- **Diff (schoon):** M `app/admin/actions.ts`, `app/admin/brands/page.tsx`, `app/admin/page.tsx`,
  `app/analytics/page.tsx`, `app/data/brand-relations/[brandId]/page.tsx` + `actions.ts` +
  `page.tsx`, `app/data/page.tsx`, `app/projects/page.tsx`, `components/data/data-cards.tsx`,
  `lib/repo/admin.ts` + `lib/repo/events.ts`, `next.config.ts` + tests; D `app/admin/events/page.tsx`,
  `components/admin/brands-tier-block.tsx`, `components/admin/events-block.tsx`; nieuw
  `app/data/event-log/`, `components/data/event-log-{view,block}.tsx`,
  `components/data/brand-visibility-block.tsx`, `components/admin/brands-list-block.tsx`,
  `lib/event-labels.ts` + tests, `docs/rol-schermen-kaart-2.0a.md`. Dev-restjes opgeruimd
  (`ia-card-sorter.html` weg, `launch.json` terug op HEAD; de werkende sorter staat in de scratchpad).
- **Nog te doen (wacht op Timo):** committen op de branch + akkoord om te pushen (= live deploy).
  Nog niet gecommit/gepusht.

## 2026-07-30 — Sprint 2.4: twee UI's die onwaarheid toonden

Gebouwd tegen `origin/main` = `c5bd87a`. Werkwijze: twee planagents onafhankelijk tegen de
echte code → één plan → twee bouwagents op strikt gescheiden bestanden → twee cross-review-agents
op elkaars diff → correcties → volledige suite. **Niet gepusht** (elke push naar main deployt live).

### Bug 1 — de OCR-stopmelding noemde altijd het €1-boekbudget

`app/projects/actions.ts:403` plette `budget_run` en `budget_month` tot één `"budget"`, waarna
`components/dossier/pdf-upload-card.tsx` bij een volle **maandcap** meldde dat het *€1-budget van
dit boek* op was. Andere oorzaak, andere uitweg. De domeinlaag (`lib/ai/ocr.ts:518-548`) en de
repolaag (`lib/repo/ocr.ts:155`) kenden het verschil al; alleen de brug naar de UI gooide het weg.

Gefixt door het type te verbreden naar `"budget_run" | "budget_month" | "no_key"` in actions én
kaart, de ternary te vervangen door pure doorgifte, en de melding uit een `ocrStopMessage()`-helper
met `never`-exhaustiviteitscheck te halen. Nieuwe `budget_month`-tekst wijst naar de instellingen
en zegt dat een ander boek niet helpt — beide claims zijn tegen de code geverifieerd (de run-check
vuurt vóór de maandcheck, dus een nieuw boek knalt opnieuw op de maandcap).

**Bewust géén gedeeld type**: `app/projects/[id]/page.tsx:110` geeft de echte action aan de kaart,
dus `tsc` bewaakt de conformiteit al. Het verbreden liet `tsc` eerst falen op precies vier plekken
(de ternary, de kaart-ternary en de twee stubs) en nergens anders — dat is het bewijs dat er geen
geplette reden meer rondzwierf.

### Bug 2 — budget 0 toonde "No monthly cap set."

`components/settings/llm-budget-block.tsx:24` (`budgetEur > 0`) zag 0 als "geen cap", terwijl 0 het
strengste plafond is: `lib/ai/ocr.ts:535` en `lib/ai/vangnet.ts:537` blokkeren bij cap 0 werkelijk
alles. Commit `7071038` fixte dat destijds in de domeinlaag; de UI volgde nooit. Geverifieerd dat 0
ongeschonden door de keten gaat (`app/settings/actions.ts:36-40` → `lib/repo/settings.ts:59-69`,
nergens een `|| null`).

Besluiten, met reden:
- **`hasCap = budgetEur != null`** — alleen `null` betekent "geen plafond".
- **De meter wordt bij cap 0 wél gerenderd, op 100%.** Een lege balk suggereert speelruimte die er
  niet is; en zonder balk is cap-0 visueel niet te onderscheiden van "geen cap".
- **`over` blijft strikt `>`** — "exceeded" bij € 0,00 uitgegeven zou de nieuwe leugen zijn. De
  aparte muted regel draagt daar de betekenis.
- **`capBlocksAll` is `<= 0`, niet `=== 0`** — een negatieve cap blokkeert net zo hard (`0 >= -5`)
  en kreeg anders een lege balk náást "exceeded". Via het formulier onbereikbaar
  (`app/settings/actions.ts` weigert `< 0`), via een directe jsonb-write niet.

### Verificatie
`bunx tsc --noEmit` schoon (exit 0). `bun vitest run` = **83 bestanden, 979 groen, 1 skip, 1
failure**: `components/data/custom-fields.test.tsx` ("archiveren vraagt om bevestiging"), het
bekend-flaky bestand onder volle belasting — **geïsoleerd 14/14 groen in 2,6 s**, dus geen
regressie van 2.4. Beide nieuwe testsets zijn negatief getoetst: teruggezet op de oude conditie
gingen ze rood, terwijl de `null`-controletest groen bleef. 8 nieuwe screenshots (light/dark ×
mobile/desktop) zelf bekeken.

**Testkosten bijgesteld.** De nieuwe screenshotlus `project-ocr-budget-month` liep onder volle
suitebelasting één keer tegen de 25s-timeout (geïsoleerd 48/48 groen). Oorzaak: vier opnames die
elk een beeld-PDF genereren én rasteriseren. Teruggebracht naar `makeBeeldPdf(2)` — de stub stopt
toch bij pagina 2, dus de derde pagina kostte alleen rasterisatie en de melding is even lang.
Blijft dit terugkomen, dan is de bestaande OCR-precedent (één light/desktop-opname, zoals
`project-ocr-progress`) de terugval; dan wel bewust vastleggen dat de nieuwe tekst niet in
dark/mobile bekeken is.

### Screenshot-valkuil (kostte tijd, waard om te weten)
De harness legt **full-page** vast en **schaalt** naar de gevraagde viewporthoogte. Een `page.viewport(375, 1400)`
leverde daardoor PNG's van 193 px breed (51%) waarop de nieuwe regel onleesbaar was — terwijl de
conventie in de repo 333 px (mobile) / 1152 px (desktop) is. Tegelijk schildert de harness bij
drie gestapelde kaarten op 375 px de onderste niet meer bij. Oplossing: viewporthoogte laten staan
en het aantal blokken per opname beperken. `components/data/brand-relations.test.tsx:532` heeft
dezelfde afwijking (1280×3200 → 288 px breed) en is dus geen precedent maar een tweede geval.

### Gevonden, met bewijs, bewust NIET gerepareerd (buiten scope 2.4)
1. **De AI-leesroute laat de stopreden volledig vallen.** `lib/repo/leesroute.ts:51` levert
   `gestopt: "budget_run"|"budget_month"|"no_key"`, maar `app/projects/actions.ts:236` stopt dat
   alleen in de event-payload en redirect daarna; `app/projects/[id]/page.tsx:46-58` toont enkel
   "N spec lines imported from the PDF and matched." Een halverwege afgekapte import presenteert
   zich als een geslaagde, kleinere import. **Zelfde bugklasse als bug 1, één laag verderop — dit
   is de duidelijkste kandidaat voor een vervolgsprint.**
2. **Hervatten na een budgetstop kost dubbel en dupliceert regels.** `lib/repo/ocr.ts:629-635` zet
   de run op `'gestopt'`; `startOcrRun` (`:64-75`) hervat alleen `'bezig'`. Hetzelfde boek opnieuw
   kiezen maakt een nieuwe `importRunId` → verse €1-teller, `doneTiles` leeg, alle pagina's opnieuw
   betaald, en de dedup is per run gescoopt dus de regels landen een tweede keer. Dat raakt de
   nieuwe `budget_month`-melding: "raise the cap" is een geldige uitweg, maar niet een gratis.
3. **Bij twee volle caps wint `budget_run`.** `lib/ai/ocr.ts:527-546` checkt de run eerst, dus wie
   én zijn boekbudget én zijn maandcap vol heeft, hoort alleen over het boek en loopt in het
   volgende boek meteen opnieuw vast.
4. **`>` versus `>=` op de maandcap.** De UI meldt overschrijding bij `spentEur > budgetEur`, de
   handhaving blokkeert bij `spend >= budget` (`lib/ai/ocr.ts:538`, `lib/ai/vangnet.ts:540`). Bij
   cap 50 en precies € 50,00 is alles geblokkeerd terwijl de UI zwijgt. Niet meegenomen: `>` naar
   `>=` trekken verruilt deze leugen voor een andere ("exceeded" terwijl er niets overschreden is);
   de eerlijke oplossing is een aparte "cap reached"-toestand, en dat is een ontwerpbesluit.
5. **Een maandcap is nooit meer te wissen.** `app/settings/actions.ts:37`: `if (raw === "") return;`
   — leeg opslaan laat de oude waarde staan, dus na deze sprint is "No monthly cap set." onbereikbaar
   zodra er ooit een cap stond. 0 is juist het tegenovergestelde van wissen.
6. **Ongeldige budgetinvoer verdwijnt geruisloos.** `app/settings/actions.ts:38-39`: `"abc"` of `-5`
   → `return` zonder melding; het scherm komt onveranderd terug alsof het gelukt is.
7. **Geen regressietest op de action-laag zelf.** De bug zat in `app/projects/actions.ts`, maar alle
   tests stubben die action weg. Iemand kan het pletten type-geldig herintroduceren
   (`… ? "no_key" : "budget_run"`) zonder dat één test rood wordt. Bewust niet opgelost: dit is de
   staande conventie van de repo (zie `components/admin/brand-admin.test.tsx:16-17` — "niet van de
   actie-brug"), en de compile-time-koppeling via `app/projects/[id]/page.tsx:110` dekt de
   type-vorm. Een echte actietest vraagt nieuwe mock-infra en is een eigen besluit.
8. **De progressbar heeft geen toegankelijke naam** (`llm-budget-block.tsx:55-61`, geen
   `aria-label`). Pre-existent; bij cap 0 hoort een schermlezer nu "100 procent" met de duiding pas
   in de volgende alinea.

### Diff (6 bestanden, geen styling geraakt)
M `app/projects/actions.ts`, `components/dossier/pdf-upload-card.tsx`,
`components/dossier/pdf-upload-test-stubs.tsx`, `components/dossier/pdf-upload.test.tsx`,
`components/settings/llm-budget-block.tsx`, `components/settings/settings.test.tsx`.
Nieuwe PNG's: `components/dossier/project-ocr-budget-month.*` en
`components/settings/settings-budget-cap-nul.*` (elk light/dark × mobile/desktop).

**Nog te doen (wacht op Timo):** committen + akkoord om te pushen (= live deploy). Nog niet
gecommit/gepusht.

---

## Sprint 2.0b — huisstijl afgemaakt (2026-07-30)

Drie commits op `claude/huisstijl-2.0b`, gebaseerd op `origin/main` (`d102cd0`).
**Nog niet gepusht — de deploy-poort ligt bij Timo.**

| | Commit | Wat |
|---|---|---|
| 1 | `050a933` | Merk-assets naar `public/brand/`, favicon aangesloten (O7 gesloten, O11 geopend) |
| 2 | `efcd76a` | Navbalk + tabbalk navy met teal-accent (O12) |
| 3 | `f91bb5d` | 207 paletklassen → `--status-*`-tokens, hues bevroren (O13) |

Besluiten van Timo deze sessie: navbalk-variant 2 (navy + teal-accent) · logo-optie 3 (alleen
het beeldmerk op navy) · statuskleuren "mechanisme om, hues bevriezen" · de AA-fout in
`badge.tsx`/`button.tsx` alleen melden, niet repareren. Vastgelegd in `DESIGN.md` O11/O12/O13.

### Gemeten bevindingen in bestaande code — gemeld, niet gerepareerd

1. **`bg-destructive/10 text-destructive` faalt AA** in `components/ui/badge.tsx:16` en
   `components/ui/button.tsx:32`: **3,69:1** in light, **3,11:1** in dark (nagemeten in een
   echte browser, niet geschat). Het faalt op élk donker vlak. Geen legacy: `button.tsx` is in
   2.0b stap 3 aangeraakt en deze variant bleef staan. Twee regels, staat los van O13. Besluit
   Timo: alleen melden.
2. **De navbalk loopt op mobiel over** — al op `origin/main`. Bij 333px (de effectieve
   testviewport) zijn Settings, Brand portal en Admin onbereikbaar: `nav` heeft geen
   `flex-wrap`, geen `overflow-x-auto` en er is geen mobiel menu. Bewijs: een baseline-PNG
   gegenereerd van `origin/main`. IA-werk, geen huisstijlwerk.
3. **Screenshots uit een volle parallelle testrun kunnen stil blanco zijn.** Drie van de vier
   `review-queue.*.png` kwamen uit de volle run als 2–4 KB (leeg) terwijl de vierde 83 KB was;
   geïsoleerd zijn alle vier 62–83 KB. Dit is dezelfde lastafhankelijkheid die
   `custom-fields.test.tsx` en `pdf-upload.test.tsx` flaky maakt. **Gevolg voor de werkwijze:
   "screenshots bekeken" is onbetrouwbaar als je ze uit de volle run haalt — regenereer het
   betreffende testbestand geïsoleerd voordat je een PNG beoordeelt.**
4. **`StatusTally` gebruikt kleur als enig onderscheid** (`components/dossier/status-badge.tsx:47-58`):
   per status alleen een `aria-hidden` bolletje plus het getal, zonder `label`/`word`. Kit §11 en
   `DESIGN.md` §7 eisen letterlijk dat kleur nooit het enige onderscheid is. Er staat een
   `title` op, maar dat is hover-only (geen touch, geen toetsenbord, niet in print).
5. **Rood→groen HSL-verloop, twee keer gedupliceerd** in `components/data/brand-scorecard.tsx:31-32`
   en `components/data/mini-scorecard.tsx:18-20` (`hsl(142 72% 26%)` + `hsl(${ratio*110} 65% 45%)`).
   Off-kit hues, en het is kleur als enige drager. Buiten O13 gelaten: dit is een ontwerpvraag,
   geen find-replace.
6. **`price-list-status.tsx` buckets `"7"` en `"14"` hebben een identieke tint** — twee toestanden,
   één uiterlijk. Pre-existent. **Bijgewerkt 30 jul:** het is inmiddels erger. Commit `0067427`
   voegde een vijfde stand `leeg` toe (geldige lijst, 0 producten) en gaf die óók
   `bg-status-amber-tint`, dus **vier van de zes standen** zijn nu amber: `"7"`, `"14"`, `leeg`
   met een prima datum, en `leeg` binnen 30 dagen. De labels verschillen wel ("Expires in 3 d"
   vs. "Valid · 0 products"), dus kleur is niet de enige drager — het onderscheid is alleen
   volledig naar de tekst verschoven. Vraag voor Timo, zie de sectie hieronder van 30 jul over
   de kleursemantiek van dekkingsgaten.
7. **`enrichment-status.tsx`** heeft een comment "bewust niet de STATUS-kleuren" die nu verwarrend
   leest, omdat het bestand `bg-status-*`-tokens gebruikt. Feitelijk nog juist (het gaat over de
   `STATUS`-constante, niet over de CSS-tokens), maar het vraagt een herformulering.
8. **`docs/plan-2.0b-huisstijl-implementatie.md` is verouderd**: §1-4, §5, §8 en §10 noemen
   "163 voorkomens in 26 bestanden". Werkelijk: **207 in 27** (`rose` en `violet` ontbraken in de
   telling). §10 wijst de "rood→groen-volledigheidsmeter" bovendien aan `coverage-meter.tsx` toe,
   die geen rood heeft — die zit in de twee scorecards (punt 5).

### Aannames en open eindes

- **~20 plekken zijn één shade genormaliseerd** naar de badge-taal (een `-600`/`-700`/`-900`/`-50`/`-200`
  werd `-800`/`-100`). Zichtbaar maar klein; de gevallen waar het wél opviel zijn teruggedraaid.
  Wil Timo die twintig exact, dan is een extra `ink-soft`-tokentier de enige route.
- **`catalog-search.tsx:74`**: `text-slate-500` → `text-muted-foreground` maakt die hint gelijk aan
  zijn twee buur-alinea's, maar zet hem daarmee op `#8E9BA8` (2,84:1) — de geaccepteerde
  O8-afwijking. Bewuste keuze, geen slip.
- **De dark-statusparen (`-950`/`-300`) zijn nooit op contrast nagerekend**, niet vóór en niet na
  deze sprint. Hoort bij de kit-vraag voor Eduard, samen met O1/O8/O11.
- **De actieve tabstreep is teal op wit = 2,95:1**, onder de 3:1-drempel voor UI-elementen (was
  17,4:1 met `--foreground`). Aanvaard omdat labelkleur en gewicht meebewegen.
  `border-brand-blue dark:border-brand-teal` is de volledig conforme route.
- **Voor Eduard:** de mono-witte lockup (O11) en een zes-kleuren-statusramp met tint/inkt-paren (O13).

### Testtoestand

`bun install` in de worktree gedaan (anders vallen de db-tests om op een misleidende
PGlite-melding). Volledige run: **1010 geslaagd, 1 overgeslagen, 3 gefaald in 2 bestanden** —
`components/data/custom-fields.test.tsx` en `components/dossier/pdf-upload.test.tsx`, de twee
bekende lastafhankelijke flaky's. Geïsoleerd samen **62/62 groen**. Baseline vóór deze sprint had
dezelfde twee bestanden rood, dus geen regressie. Nieuw: `components/dossier/dossier-tabs.test.tsx`
(had nul dekking) en 4+2 tests in `site-nav`/`huisstijl`.

## Filterrij op de projectenpagina naar knoppen (2026-07-30)

`components/dossier/status-filter.tsx`: de rij **All · Concept · Estimate sent · Quote · Won ·
Lost · Archived** was platte tekst met een onderstreep onder het actieve item, en is nu een rij
echte knoppen via `Button asChild` (het blijven links — `href` + `aria-current` ongewijzigd).

**Actief** = `variant="default"`: navy vlak met wit label in light, en in dark het
wit-vlak-met-navy-label uit O10. Navy gevuld kán daar niet: `#1A1F3A` op canvas `#0F1626` is
~1,3:1 en de chip verdwijnt — daarom `--primary` en niet de `--nav-*`-tokens zelf.
**Inactief** = `variant="secondary"` + `border-input font-medium`. Het teal-accent van de
navbalk (O12) komt terug als **stip op de actieve chip**; gevuld teal is bewust niet gebruikt
(wit-op-teal 2,95:1, in O12 al afgewezen).

**Maat `sm` (28px) — een bewuste uitbreiding van O9, geen rechttoe-rechtaan toepassing.** O9
beperkt de 44px-eis tot `default`/`lg`/formuliervelden, maar de formulering ("de compacte maten
blijven zoals ze zijn") grandfathert de 56 bestaande plekken en zegt niets over nieuwe. Deze rij
rekent zich er bij: zeven opties naast elkaar is een dense control. Gemeten gevolg: het
aanraakdoel krimpt van **38px naar 28px** en de rij van **469px naar 444px** (~5%). Beide hoogtes
halen WCAG 2.5.8 (24px), geen van beide de 44px van 2.5.5 — er verschuift geen criterium, maar
kleiner is het wel. Wil Timo 44px, dan is dat één `size`-waarde.

**Nevenwinst op O8:** de inactieve labels stonden op `text-muted-foreground` (`#8E9BA8`, de
geaccepteerd-slechte 2,84:1) en staan nu op `--secondary-foreground` = **14,39:1**. Deze rij is
dus per ongeluk uit de O8-afwijking gelopen; O8 zelf is niet aangeraakt.

### Nagemeten contrast (WCAG 2.x, uit de hexwaarden in `globals.css`)

| Combinatie | Light | Dark |
|---|---|---|
| Label actief (wit op navy / navy op wit) | 16,14:1 | 16,14:1 |
| Label inactief | 14,39:1 | 12,93:1 |
| Actief vlak vs. canvas | 16,14:1 | 18,06:1 |
| **Actief vlak vs. inactief vlak** (de stand-drager) | **14,39:1** | **12,93:1** |
| Teal stip op het actieve vlak | 5,47:1 | 2,95:1 |
| Focus-rand op het chipvlak | 6,34:1 | 4,38:1 |
| Focus-rand op het canvas | 7,11:1 | 6,12:1 |
| Focus-rand vs. de ónbefocuste rand | 4,87:1 | 3,41:1 |

Afgewezen omdat ze het niet halen: `variant="outline"` en `ghost` staan op `--brand-blue` =
**2,54:1** op het dark canvas; gevuld teal **2,95:1**.

Kleur is niet de enige drager (kit §11): vulling, gewicht (semibold/medium), rand en de stip
bewegen alle vier mee. Het vlakverschil van 14,4:1 / 12,9:1 betekent dat de stand ook in
grijswaarde en bij elke vorm van kleurenblindheid leesbaar is. Vastgepind met computed-style-
assertions in `project-status.test.tsx` (32 tests, incl. focus-screenshots en een
overloopcheck op 320px).

### Elders bekeken, bewust niet aangeraakt

- **`components/dossier/dossier-tabs.tsx`** — visueel identieke rij, maar dat is paginanavigatie
  en het uiterlijk is vandaag in **O12** vastgelegd (teal streep, 2,95:1, aanvaard). Meebouwen
  zou een besluit van een halve dag oud omgooien. **Vraag voor Timo:** moeten die tabs mee naar
  knoppen, of blijft de streep het onderscheid tussen "filter" en "navigatie"?
- **`components/data/brand-relations-table.tsx`** en **`components/admin/brand-filter-bar.tsx`** —
  wél filters, maar native `<select>` in een dense tabel-toolbar, geen rij van opties. Zeven
  chips zouden daar breedte kosten zonder iets duidelijker te maken.
- Een sweep over `app/` en `components/` vond geen andere rij van elkaar uitsluitende opties
  (nul hits op `role="tablist"`, `ToggleGroup`, `?tab=`, `?view=`, `?sort=`).

### Cross-review: drie echte correcties

Een tweede agent heeft de wijziging nagerekend. Alle contrastgetallen klopten op één na, en er
kwamen drie punten uit die zijn doorgevoerd:

1. **Een onterechte claim.** De eerste versie van de code-toelichting schreef dat deze rij de
   "~333px-overloop" verbeterde. Onjuist: de oude filterrij had **al** `flex-wrap` en kon dus
   nooit horizontaal overlopen. De ~333px-overloop is bevinding 2 hierboven — de **site-navbalk**
   (`components/nav-link.tsx:79`, `flex` zónder wrap). Ander component; deze wijziging raakt noch
   repareert die. De geschatte breedtes ("~475 tegen ~524px") zijn vervangen door de gemeten
   469→444px.
2. **Een testschijnzekerheid.** De overloop-test controleerde
   `document.scrollWidth <= clientWidth` — dat blijft groen zolang de rij `flex-wrap` heeft, óók
   als de chips verdubbelen. Vervangen door de assertie die er wél iets over zegt: geen chip mag
   breder zijn dan zijn kolom op 320px.
3. **De focus-test toetste alleen `activeElement`**, niet de ring. `focus-visible:border-ring`
   uit `button.tsx` slopen liet hem groen. Nu meet hij de gerénderde `borderTopColor` tegen
   `--ring`, plus dat de ruststand een andere kleur is. Alle drie de gerepareerde tests zijn met
   een negatieve controle geverifieerd: kapotmaken → rood, herstellen → groen.

Verder aangescherpt: de inactieve rand was `not.toBe(transparent)` en is nu de exacte
`--input`-waarde per stand. Eén getal gecorrigeerd: navy op het dark canvas is **1,12:1**, niet
"~1,3:1" (de conclusie werd er alleen sterker van).

### Bevinding in bestaande code — gemeld, niet gerepareerd

**De focus-indicator van `button.tsx` is één pixel.** `focus-visible:border-ring
focus-visible:ring-3 focus-visible:ring-ring/10` verkleurt de bestaande 1px-rand en legt er een
halo van 10% opacity naast. Dat haalt de 3:1 van WCAG 1.4.11/2.4.11 op alle drie de assen (zie
tabel), maar niet de 2px-perimeter van 2.4.13 (AAA), en kit §7 schrijft voor invoervelden
letterlijk "rand 2 px" voor. Geldt voor **élke** knop in de app, niet voor deze rij; ingevoerd in
`e8325cb`. Zijeffect hier: de oude filterrij had geen eigen focus-stijl en kreeg dus de
browser-outline (dikker) — die is nu vervangen door de app-brede, dunnere variant. Lokaal
opplussen is afgewezen: één rij die van de focus-taal afwijkt is erger dan een dunne ring.

### Testtoestand

Volledige run twee keer gedaan: beide keren **1021 geslaagd, 1 overgeslagen, 3 gefaald** — maar
in een **andere set bestanden** (run 1: `lib/ai/ocr.test.ts` + `custom-fields`; run 2:
`custom-fields` + 2× `pdf-upload`). Allemaal timeouts, allemaal in bestanden die deze wijziging
niet raakt, en alle vier geïsoleerd groen (ocr 18/18, custom-fields 14/14, pdf-upload 48/48,
huisstijl 20/20 — de logopalet-guard blijft groen). Dezelfde lastafhankelijkheid die hierboven
al als bekend staat. `bun install` gedaan, `tsc --noEmit` en `eslint` schoon, `bun run build`
groen (`/projects` blijft server-rendered — `@radix-ui/react-slot` heeft geen `"use client"`,
dus `Button asChild` forceert geen client-boundary).

**Niet geverifieerd in de dev-server:** poort 3000 was in gebruik door een parallelle sessie, en
`.claude/launch.json` staat in git — die aanpassen om een andere poort te pakken zou in de
commit belanden. De screenshots komen uit vitest' browsermodus (echte Chromium, echte computed
styles); wat daar ontbreekt is het echte lettertype (de harnas valt terug op een serif, die
bréder is dan Geist — de overloopmeting is dus de pessimistische kant).
---

## 2026-07-30 — Open eindes uit de XAL-verrijking (vastgelegd, niet gebouwd)

### 1. XAL-productnamen kappen af op 100 tekens — en dat raakt de matcher

**752 XAL-namen zijn exact 100 tekens lang en geen enkele is langer.** De langste naam in de
hele catalogus is 266 tekens, dus dit is geen kolomlimiet van ons maar de XAL-prijslijst zelf.
De lengteverdeling bevestigt het: 96tk×525, 97tk×915, 98tk×1009, dan een dal bij 99tk×533 en
een **piek bij 100tk×752**. Zo'n piek na een dal is het handtekeningpatroon van afkapping —
alles wat langer was is teruggeknipt naar precies 100.

Waarom dit meer is dan een verrijkingsprobleem: de matcher leest diezelfde namen, en de
positiegewogen tekstscore (`lib/matching/textscore.ts`) weegt tokens naar hun plaats in de naam.
Een afgekapte naam mist dus niet alleen specs maar verschuift ook de weging van wat er nog wél
staat. Verdient een eigen probleemdoc met eigen meting; niet meenemen in het verrijkingsspoor.

Wat het **niet** is: er is geen enkele aanwijzing dat er een tweede CRI-waarde achter de
afkapping schuilt. Gemeten over alle 211.317 producten draagt geen enkele naam meer dan één
CRI-token — nul precedent, ook bij de niet-afgekapte namen.

### 2. Draagt een draagrail een CRI? (accessoire-vraag)

`PICO SUPPORT` is een draagrail met twaalf losse lichtpunten (`12x1.1W`). Hoort zo'n product
een CRI, kelvin of bundelhoek te dragen — en hoort het überhaupt als kandidaat op te komen bij
een armatuur-regel? Dit is dezelfde vraag als de `accessoire-context`-vlag in
`lib/enrichment/verdenking.ts` en de 4.072 producten die mogelijk zélf een accessoire zijn
(zie `docs/plan-steekproef-zwerm.md`, R2). Hoort daar thuis, niet in de CRI-run.

### 3. Bronfouten van XAL, niet van onze pijplijn

`220-200V` (aflopend spanningsbereik) en `2200-31000K` staan in namen van 56–59 tekens — dus
compleet ingelezen, niet afgekapt. Typefouten in de bronprijslijst. Vastgelegd zodat een
volgende sessie ze niet als import- of parserfout aanmerkt.

### 4. Twee dingen voor de overdracht naar het kolom-spoor (30 jul)

**De `NON DIM`-fix raakt ook de aanvraagkant.** `parseDimmable` leest `DIM` uit `NON DIM` — het
streepje/de spatie is een woordgrens, dus `\bDIM\b` matcht en de ontkenning wordt genegeerd. Bij
XAL zijn dat 2.800 producten (3.376 over alle merken), vrijwel allemaal accessoires
(aansluitdozen, plafondkappen). De waarde is niet onzeker maar **omgekeerd**.

De fix hoort in `lib/enrichment/parser.ts`, en juist dáárom raakt hij meer dan de verrijking:
`parseProductName` wordt ook door de aanvraagkant gebruikt
([lib/pdf/armaturenboek.ts:131](lib/pdf/armaturenboek.ts:131)), dus een bestek dat "NON DIM"
vraagt verandert mee. **Die fix vraagt dus een eigen nulmeting/nameting**, niet alleen een
verrijkingsmeting — en tno is daar het scherpste meetpunt, want dat vraagt dimbaarheid op al
zijn regels.

**`publishRun` doet drie losse verzoeken per product.** In de publish-lus
([enrichment.ts:414–447](lib/repo/enrichment.ts:414)) staan drie awaited queries: één `select`
per product met voorstellen, plus — alleen waar iets landt — een `update` op `products` en een
`update` op `enrichment_items`. Er is geen transactie en geen batching; de neon-**http**-driver
maakt van elke query een aparte round-trip.

Gemeten latency vanaf een werkstation: **139 ms per round-trip**. Daarmee klopt de XAL-run:
13.407 × 3 × 139 ms ≈ 93 min voorspeld, **90 min gemeten** (branch 91,3, productie 90,0).

Voor de schaal naar 28 merken telt niet het aantal voorstellen maar het aantal **producten**:

| aanpak | round-trips | bij 139 ms |
|---|---|---|
| veld-voor-veld, alle merken (157.682 landende voorstellen) | ~473.000 | **~18 uur** |
| alle velden per merk in één run | minder (groepering per product), maar plus selects voor producten waar niets landt | tussen 12 en 18 uur |

⚠️ Reken niet met de 328.871 voorstellen — dat geeft ~38 uur en overschat: lang niet elk voorstel
landt, en meerdere voorstellen op hetzelfde product delen één passage door de lus. Het exacte
getal vraagt een telling van distinct producten met ≥1 landend voorstel; die is nog niet gedaan.

Wie dit wil terugbrengen: één bulk-`update ... from (values ...)` per blok van 1.000 producten
haalt er twee ordes af. Dat is een wijziging aan beproefde code en hoort niet in dezelfde run als
een datavulling — eerst apart bewijzen op een branch.

## 2026-07-30 — Twee besluiten voor Timo na de prijslijst-badge (bug #3)

Commit `0067427` maakte de badge op `/data/price-lists` waar (geen groen meer bij 0 producten);
een reparatiepas erna trok de hub-badge, de tellers en de precedentie recht (zie de commit die
hierbij hoort). Wat overblijft zijn **geen defecten maar keuzes** — DESIGN.md harde regel 2:
wijkt iets af van de brand kit of ontbreekt het erin, dan gaat het naar Timo en vult niemand het
zelf in.

### 1. Kleursemantiek: het bestaande gat is stiller dan het potentiële

`components/data/price-list-status.tsx` telt sinds `0067427` zes standen. De commit betoogt in
zijn eigen kopcommentaar dat "voor de matcher een geldige lijst met 0 producten exact hetzelfde
is als een verlopen lijst" — maar hij verft ze verschillend:

| Stand | Tint | Betekenis |
|---|---|---|
| `verlopen` | grijs | gat, **nu al** |
| `leeg` (datum ok) | amber | gat, **nu al** |
| `leeg` (binnen 30 d) | amber | gat, nu al + verloopt |
| `"7"` / `"14"` | amber | nog geen gat, dreigt |
| `"30"` | blauw | nog geen gat, dreigt |
| `ok` | groen | niets aan de hand |

Twee dingen die een besluit vragen, niet een patch:

1. **Grijs voor verlopen is zachter dan amber voor leeg**, terwijl beide hetzelfde gat zijn. De
   luidste tint van de tabel (amber) hangt nu deels aan een gat dat er nog niet is (`"7"`/`"14"`)
   en de stilste (grijs) aan een gat dat er wél is. Grijs is verdedigbaar ("dit is een feit, geen
   alarm"), maar dan hoort `leeg` er ook grijs bij — en dat is precies de vraag.
2. **Amber is de tint van vier van de zes standen.** Zie ook punt 6 in de bevindingenlijst van
   sprint 2.0b hierboven, dat hiermee is bijgewerkt. De labels verschillen wel, dus kleur is niet
   de enige drager (Kit §11 / DESIGN.md §7 blijven gehaald), maar de kleur draagt zo goed als
   geen informatie meer.

Niet zelf opgelost: er is geen zesde tint bij te maken zonder O13 te heropenen (hues bevroren),
en welke van de twee gaten de luidere plek verdient is een ontwerpbesluit. De route die O13 al
noemt — een zes-kleuren-statusramp met tint/inkt-paren voor Eduard — is de enige waarin dit
netjes past.

### 2. Bug #3 is niet gefixt op mobiel

Op 375px (effectief ~333px in de testviewport) staat de **hele Status-kolom buiten beeld** — de
kolom die het onderwerp ván bug #3 is. Nagemeten op de opnieuw gegenereerde
`components/data/data-prijslijsten.light.mobile.test.png`: de kop knipt af midden in "Products",
en de `colSpan`-uitlegregel onder de verlopen rij eindigt op "What's …". De tabel zit in
`overflow-x-auto`, dus het is bereikbaar door te vegen, maar er is geen enkele affordance die
zegt dat er nog vier kolommen naar rechts liggen.

Grotendeels pre-existent (dezelfde tabel deed dit vóór `0067427` ook), en het is dezelfde klasse
als de overlopende navbalk uit sprint 2.0b: IA-/layoutwerk, geen huisstijlwerk. Wel met een
gevolg dat benoemd moet worden: **wie het scherm op zijn telefoon opent, ziet de gerepareerde
badge niet.** De kopregel boven de tabel ("1 expired · 2 with 0 products — coverage gaps · 2
expiring soon") is daar de énige plek waar het gat zichtbaar is — hij loopt op 375px over twee
regels, maar staat er wel. Opties, geen van beide gekozen: de tabel op smal in kaarten laten omslaan
(zoals de dossierregels), of de Status-kolom als tweede kolom zetten zodat hij binnen de eerste
schermbreedte valt.

## 2026-07-30 — Open eind: de tekst-fallback van de OCR-kaart stuurt naar modeluitvoer

Bij het repareren van de brontekst op de reviewkaart (reviewronde 2 op `2e8492c`) bleef één ding
staan dat een besluit vraagt en dus niet in die pas is meegenomen.

Heeft een OCR-regel géén paginabeeld van zijn eigen pagina, dan linkt `OcrCard`
(`components/dossier/review-queue.tsx`) naar `/projects/[id]/import/[runId]`. Dat scherm toont
`import_runs.raw_markdown` — en `finishOcrRun` (`lib/repo/ocr.ts`) zet daar zelf boven: "OCR
transcript (model output) … not the source document". De reviewer die de lezing van het model
moet controleren, wordt daar dus naar de uitvoer van datzelfde model gestuurd. Voor een
leesroute-run (AI-tekstroute, stap 3 fase B) is dat nog te verdedigen — er is geen beeld, het
transcript is het enige dat er is — maar voor een OCR-run is het een controle tegen de verdachte.

De tak bestaat sinds `f02e382`; `2e8492c` maakte hem voor OCR-runs pas écht bereikbaar door de
beeldvlag per pagina te correleren (een run met gedeeltelijke beelddekking valt nu terug in plaats
van naar een 404 te linken). Niet gefixt in deze pas: de keuzes lopen uiteen (de tak verbergen bij
`source = 'ocr'` en alleen het paginanummer als tekst laten staan; het paginabeeld opnieuw
renderen; of het transcript op dat scherm expliciet als "modeluitvoer, geen bron" labelen naast de
review-link) en raken zowel de kaart als het importscherm.

## 2026-07-30 — Foutgrenzen en uuid-guards: aannames en open eindes (bug #1, reparatiepas)

Commit `4280f2f` zette `not-found.tsx`, `error.tsx` en de gedeelde `isUuid`/`requireUuid`
neer; een adversariële verificatie erna vond dat de kopregel ("een kapot id geeft 404, niet
500") nog niet waar was. De reparatiepas daarop staat in de bijbehorende commit. Wat hier
hoort — de commit zelf raakte geen doc, tegen de werkwijze in — zijn de twee aannames die hij
declareerde plus wat deze pas eraan heeft toegevoegd.

### 1. Er komt bewust GEEN root `loading.tsx`, en ook geen route-group-variant

Gemeten op de dev-server (Next 16.2.10, dezelfde URL met en zonder het bestand): een root
loading-boundary **commit de HTTP-status voordat de pagina resolveert**. `/products/<geen-uuid>`
gaf daarmee **200 in plaats van 404**, en een uitgelogde `/projects` **200 in plaats van 307**.
Dat sloopt precies wat bug #1 repareert, dus het bestand is er niet.

De remedie die daar eerst bij stond ("dan scoped in een route-group") is **fout** en is in
`app/fallbacks.test.tsx` gecorrigeerd. Zowel `requireUuid()` als `requireSession()` (die
`redirect("/login")` doet) draaien *binnen* de pagina, dus ónder elke loading-boundary op
layout-niveau — een `loading.tsx` in een route-group loopt tegen exact dezelfde muur en commit
de status net zo hard. Wachtstand voor de trage schermen (`/data/brand-relations` scant ~210k
rijen) hoort daarom in een **`<Suspense>`-grens binnen de pagina, ná de sessie- en uuid-check**:
dan staat de status al vast voordat de fallback in beeld komt. Nog te bouwen; niet gemeten.

### 2. Drie harnasgrenzen bij de foutschermen (vitest-plugin-rsc 0.2.3)

Gemeten op 30 jul, zodat een volgende bouwer ze niet nóg eens uitzoekt. De eerste twee stonden
al in de testfile, de derde komt uit deze pas:

1. Een **server**-component die `next/link` importeert is niet in te laden — de
   react-server-build van `Link` klapt met "client reference export is called on server".
   Daarom staat er in `not-found.tsx` een kale `<a>`.
2. `renderServer` stuurt props van een **client**-component door een RSC-payload, dus ze moeten
   serialiseerbaar zijn. Een echte `Error` en een `reset`-closure zijn dat niet — het scherm
   rendert dan leeg. Gevolg: **dat de Try again-knop `reset()` aanroept is met deze harnas niet
   te testen.** Die ene regel (`onClick={reset}` in `app/error.tsx`, en nu ook in
   `app/global-error.tsx`) staat onbewaakt. Alles eromheen — de kop, de twee uitwegen, en dat de
   foutmelding níét lekt — is wel gedekt.
3. `app/global-error.tsx` (nieuw in deze pas) rendert zijn eigen `<html>`/`<body>`, want het
   vervángt de root-layout — Next eist dat daar. De harnas hangt de boom in een container-`<div>`
   en React laat die twee elementen dan **vallen**: er staat na de render geen genest
   `<html>`/`<body>` meer in de DOM. Daarmee vallen ook `bg-background text-foreground` weg, dus
   de **donkere stand van dit ene scherm is hier niet op te wekken** — een `dark`-opname was
   letterlijk een lichte opname met een donkere bestandsnaam. Er staan daarom twee eerlijke
   opnamen (mobiel + desktop) in plaats van vier. `canvas()` eromheen zetten als plaatsvervangend
   `<body>` lost het níét op: dan rendert React de boom helemaal niet meer en lopen alle tests in
   een timeout. Ook gemeten — niet opnieuw proberen. Het donkere beeld van dit scherm is
   één-op-één dat van `error.tsx` (zelfde markup, zelfde tokens) en staat daar wél in vier opnamen.

### 3. Waarom de guard-dekking nu een test is en geen discipline

De eerste ronde miste drie van de vier `?brand=`-resolvers en drie van de drie route handlers.
Oorzaak was geen slordigheid maar structuur: `resolveBrand` stond **vier keer byte-identiek** in
de boom (`app/brand/{,data/,dashboard/,price-lists/}page.tsx`). Die vier zijn nu één
`resolveBrandFromParam` in `lib/repo/brand-portal.ts`, en `lib/uuid.test.ts` scant sindsdien de
app-boom (`import.meta.glob` + `?raw`, want de testrun staat in de browser en heeft geen
`node:fs`) op vier regels: elke dynamische route handler filtert met `isUuid`, geen `?brand=`-
pagina raakt `brands.id` nog zelf aan, elke dynamische pagina/layout roept `requireUuid`, en het
losse `/^[0-9a-f-]{36}$/i` bestaat nergens meer. Nieuwe pagina's vallen daar automatisch in.

De regel zelf staat één keer opgeschreven, bij `requireUuid` in `lib/uuid.ts`: **elke
render-eenheid die een route-param in een uuid-kolom stopt, guardt hem zelf.** Layout en pagina
renderen concurrent en dekken elkaar dus niet (wie het eerst gooit bepaalt het antwoord, béide
kanten op), en een route handler draait helemaal geen layout — dat laatste was het gat waardoor
`/projects/nope/quote/pdf` nog 500 gaf.

### Open eind: twee bestanden konden niet mee

`app/projects/[id]/quote/page.tsx` en `app/projects/[id]/review/page.tsx` waren tijdens deze pas
in handen van parallelle sessies en hebben nog geen eigen `requireUuid(id)`. Ze staan als
`NOG_TE_DOEN` in `lib/uuid.test.ts`; zodra de guard erin staat horen die twee regels weg en dekt
de test ze vanzelf. Tot dan leunen ze op de layout-guard — dat werkt meestal, maar het is de race
die hierboven beschreven staat, plus een losse afgewezen DB-promise per request.

---

## 2026-07-30 — Kopblokpoort hersteld; A-09 en `nextQuoteNumber` spreken elkaar tegen

### Besluit voor Timo: wanneer krijgt een offerte zijn nummer?

Twee bronnen zeggen iets anders, en dat is nooit opgelost:

- **A-09 (functioneel ontwerp, regel 62 en §3.8 punt 2):** het nummer `BL-{jaar}-{4 cijfers}`
  is *voorgesteld en bewerkbaar*; **de teller verhoogt pas bij bevestigen/uitsturen.**
- **De code (`nextQuoteNumber` + `generateQuote`, `lib/repo/dossiers.ts`):** het nummer wordt
  **bij genereren** toegekend, weggeschreven in `quotes.quote_number` en daarna bewaard. De
  functiecommentaar zegt dat ook met zoveel woorden. Er is nooit code geweest die op uitsturen
  nummerde.

De UX-audit-pas van vanochtend verving de oude veldtekst `BL-2026-{nummer volgt}` door
`"Number assigned on sending"` — schoon Engels, maar **onwaar**, op een veld dat letterlijk op
het klantdocument (scherm én PDF) wordt afgedrukt. De tekst is nu
`"Number assigned when the estimate is generated"` (`NUMBER_PENDING` in `lib/repo/estimate.ts`).

**De copy volgt dus de code. Het nummergedrag is NIET aangepast.** Welke van de twee moet wijken
is een besluit voor Timo:

1. *Code volgt A-09* — nummer pas bij uitsturen toekennen. Dan moet de estimate vóór verzending
   nummerloos door de PDF kunnen (dat kan al: `quoteNumberAssigned` is false → titel en voettekst
   lopen zonder nummer), en moet er een plek komen die op uitsturen nummert.
2. *A-09 volgt de code* — het ontwerpdoc aanpassen. Dan verdwijnt de tegenspraak zonder
   codewijziging, maar er lopen wel nummers weg aan estimates die nooit verstuurd worden
   (hergenereren verbruikt géén nieuw nummer, dus het gat blijft beperkt tot één per project).

### Wat er wél veranderde: de poort van bug #6 was een val

`headerComplete` (datum + geldigheid ingevuld) haalde Print, Download PDF en → To XIS weg. Twee
feiten maakten daar een klem van:

- **Geen enkel codepad heeft ooit `valid_until` geschreven.** `generateQuote` liet het op `null`.
  Elke offerte in productie heeft dus een lege geldigheid en viel na deploy achter de poort.
- **Een bevroren offerte kan er niet uit.** Status `estimate_gestuurd` bevriest de offerte
  (I-06); daarna rendert `KopblokBewerken` niets en weigert `updateQuoteHeader`. De banner
  verwees naar "Edit header" — een knop die er dan niet is — en `/quote/pdf` gaf 409. Het net
  verstuurde document was niet meer te produceren.

Drie besluiten, alle drie in tests vastgelegd (zie hieronder):

1. **Een bevroren offerte is nooit gepoort.** De poort heet nu `outputsAllowed` en zit in
   `computeEstimate` (`headerComplete || frozen`) — één bron voor pagina, PDF-route én
   `xisExportAction`. `getEstimateData` leest `frozenAt` en geeft het door.
2. **`generateQuote` stelt een geldigheid voor:** offertedatum + `DEFAULT_VALIDITY_DAYS` (30,
   `lib/repo/dossiers.ts`). Een **voorstel, geen regel** — Timo mag het getal veranderen, en het
   kopblok blijft bewerkbaar. Bestaande rijen repareert dit niet; daarvoor is punt 1 er.
3. **De banner noemt alleen een control die er is.** `QuoteView` krijgt `headerEditable`; staat er
   geen bewerkbaar kopblok (nog geen offerte gegenereerd), dan wijst de tekst naar
   "Generate estimate" in plaats van naar "Edit header".

De XIS-dialoog wordt **niet** meer in zijn geheel verborgen: hij is ook de enige plek waar
"Already sent — {datum} ({omgeving}, {status})" staat. Alleen de verzendknop gaat weg
(`blockedReason`), en de echte poort staat serverkant in `xisExportAction`.

### Nog open

- **`validUntil` is nergens anders schrijfbaar dan via "Edit header".** Er is geen datumkolom in
  een lijstweergave en geen bulk-actie. Voor bestaande niet-bevroren offertes is dat de enige weg;
  dat werkt, maar het is één veld per project.
- **De poort toetst aanwezigheid, geen zinnigheid.** `validUntil: "2020-01-01"` (verleden, en
  vóór `quoteDate`) komt er gewoon door. Bewust niet dichtgezet: een datumvalidatie die te streng
  is blokkeert een legitieme her-uitgifte met een oude datum, en de fout is zichtbaar op het
  document zelf. Als het wél moet: de check hoort in `computeEstimate`, naast
  `missingHeaderFields`, met een eigen lijst (`invalidHeaderFields`) — niet in dezelfde bak, want
  "leeg" en "onlogisch" vragen een andere zin in de banner.
- **`SpecLineTable` mount één `Dialog` per regel.** Gemeten op 30 jul in de testharnas: 200 regels
  → 200 dialoogtriggers, **0** dialoog-inhoud in de DOM (Radix portalt de inhoud pas bij openen),
  4631 DOM-knopen totaal (~23 per rij, lineair) en ~334 ms render. Geen reden tot herontwerp;
  hier genoteerd zodat de volgende die het ziet niet opnieuw gaat meten.

---

## 2026-07-30 — Eén locale-regel voor getallen en datums (besluit Timo)

`docs/DESIGN.md` kent geen locale-regel, en per DESIGN.md-regel 2 hoort zo'n gat bij Timo. Hij
is gesteld en luidt:

> **Getallen en bedragen volgen de EU-conventie** (`211.317`, `€ 265,00`). **Datums dragen een
> geschreven maand** (`30 Jul 2026`, met tijd `30 Jul 2026, 12:24`), 24-uursklok.

De motivering staat ook als commentaar in `lib/format.ts`. Kort: het argument "en-GB, want de UI
is Engels" is gesneuveld — dat zou net zo goed `211,317` afdwingen, en dat willen we niet. Het
échte argument is smaller: de dd/mm-vs-mm/dd-verwarring bestaat alleen bij een datum in lóuter
cijfers. Een geschreven maand is in elke locale maar op één manier te lezen en staat daarom prima
naast EU-getallen. De `en-GB`-locale in de formatter is dus een implementatiedetail voor de
woordvolgorde dag-maand-jaar, geen uitspraak over de rest van de app.

**Tijdzone: `Europe/Amsterdam`, hard gepind in beide formatters.** Dit was een echte
productiefout, geen cosmetica. Zonder `timeZone` volgt `Intl` de tijdzone van het proces —
lokaal Europe/Amsterdam, **op Vercel UTC**. Een event van 11:00 stond in productie dus als
"09:00" op het scherm, in een formaat dat er gezaghebbend uitziet en de zone niet noemt. De
gebruikers zijn Nederlands en de events zijn hun werkdag. Bijvangst: de weergave is nu ook in
de tests deterministisch — `TZ=UTC bun vitest run lib/format.test.ts` hoort groen te zijn, en
dat is de test die telt.

**Kale kalenderdatums.** `price_lists.valid_until`, `quotes.quote_date` en
`manual_price_valid_until` zijn `date()`-kolommen: die waarden hebben geen tijdstip en dus geen
zone. `formatDate()` herkent de vorm `YYYY-MM-DD` en leest hem zoals hij er staat, in plaats van
er een zone overheen te zetten (dat is de klassieke off-by-one: middernacht UTC wordt in een
zone vóór UTC de vorige dag). Eén scherpe rand blijft: geef zo'n waarde als **string** door, niet
als `new Date(...)` — dan is de zone-informatie al weg vóór de formatter hem ziet.

**Nog open:** `app/projects/[id]/quote/page.tsx` heeft nog een eigen `nl-NL`-datumformatter
(regel ~86). Die stond tijdens deze ronde bij een parallelle sessie; hij hoort ook naar
`formatDate()`.

---

## 2026-07-30 — Dark mode is bereikbaar (en niets anders)

Het `.dark`-tokenblok in `app/globals.css` was al compleet, maar er was geen enkele weg
ernaartoe: geen `prefers-color-scheme`, geen provider, geen toggle buiten `*.test.tsx`. Elke
sprint maakte dus light/dark-screenshotparen van een stand die geen gebruiker kon bereiken,
terwijl `CLAUDE.md` die paren eist en DESIGN.md O3/G24 dark verplicht stelt. Nieuw:
`lib/theme.ts` (sleutel + klasse + init-script), `components/theme-toggle.tsx` (de knop),
een inline `<script>` als eerste kind van `<body>` in `app/layout.tsx`, en de knop gemonteerd
in `components/nav-link.tsx`. **Geen tokenwaarde gewijzigd** — alleen wánneer `.dark` op
`<html>` staat.

**De standaard is LICHT, niet de systeemvoorkeur (besluit Timo).** DESIGN.md O13 zegt
letterlijk dat de dark-paren nooit op contrast zijn nagerekend; zolang dat zo is mag niemand
in dark bélanden zonder erom te vragen. `prefers-color-scheme` wordt daarom nergens gelezen —
niet in het init-script, niet in een matchMedia-luisteraar. Twee tests bewaken dat: de
`THEME_INIT_SCRIPT`-string mag het woord niet bevatten, en tijdens het monteren van de knop
wordt `window.matchMedia` bespioneerd en mag hij niet met een color-scheme-query worden
aangeroepen. Een eventuele latere ramp van Eduard (O13) is de plek om deze knoop te herzien,
niet een opruimactie.

**Geen dependency.** `next-themes` zou een provider + context in de RSC-boom hangen (elke
`renderServer`-test moet er dan omheen) voor één klasse en één localStorage-sleutel.
Dat is nu ± 20 regels in `lib/theme.ts`. De stand staat niet in React-state maar wordt via
`useSyncExternalStore` van de klasse op `<html>` gelezen — het init-script schrijft die klasse
vóór React bestaat, dus een `useState`-kopie zou na hydratie moeten worden bijgetrokken.

**Knop:** echte `<button type="button">` met `aria-pressed` en `aria-label="Dark mode"`, 32px
(size-8). Dat is bewust ónder de 44px uit kit §7 — DESIGN.md **O9** legt vast dat 44px geldt
voor `default`, `lg` en formuliervelden, niet voor compacte icoon-only bedieningen. 44px zou
de balk 16px hoger maken. Focus-ring teal `#1BA89A` en niet `--ring`: blauw haalt op de navy
balk 2,3:1 (O10/O12, zelfde redenering als `NavLink`). Beide iconen staan altijd in de DOM en
worden door de `dark:`-variant gewisseld — hingen ze aan de state, dan klapte het icoon ná
hydratie om, precies de flits die de inline-init voorkomt. **Geen thema-transitie**: DESIGN.md
§8 eist respect voor `prefers-reduced-motion` en de app doet dat nergens; een cross-fade over
de hele app zou dat gat groter maken.

**Openstaand — de balk bij 375px.** In de testharnas gemeten, vóór en ná: `document.body.scrollWidth`
**595 → 651** bij viewport 375 (+56 = 32px knop + de `gap-6` naar het groepje ernaast);
balkhoogte onveranderd 73px. De balk liep daar dus al over (op productie eerder 640 gemeten) en
loopt nu 56px verder over. **Bewust niet gerepareerd**: dat is week 3 (besluit G21, vier rollen),
die sprint herbouwt de balk toch. Er staat daarom géén assertie op `scrollWidth` — het getal
staat in `components/site-nav.test.tsx` in commentaar zodat week 3 niet opnieuw hoeft te meten.
De enige wijziging in `nav-link.tsx` is de knop plus een wrapper-div die het aantal
flex-kinderen op drie houdt (anders verdeelt `justify-between` de bestaande elementen anders).

## 2026-07-30 — Verificatie projectlijst: het datumlabel klopt nu, de chips wissen niets meer

Verificatieronde op commit `8d5e597` (projectlijst-UX). Twee dingen gerepareerd, één
beslissing bewust NIET genomen maar hieronder vastgelegd.

**1. "Last edited" is `Status or phase changed` geworden — het label, niet de data.**
De kaart toont `project_dossiers.updated_at`. Die kolom heeft in `db/schema.ts` géén
`$onUpdate`; hij beweegt alleen waar iemand hem expliciet zet, en dat zijn in productie
exact drie schrijvers (nagelopen op álle `update(projectDossiers)`-aanroepen buiten
tests): `setStatus` en `setXisPhase` in `lib/repo/project-status.ts`, en `setDossierOrg`
in `lib/repo/orgs.ts` — die laatste wordt alléén vanuit `createDossierAction` aangeroepen,
dus na het aanmaken verzetten in de praktijk alleen status en XIS-fase de datum. Een PDF
importeren, spec-regels toevoegen/bewerken en de matcher draaien schrijven naar
`spec_lines.updated_at` en laten de dossierrij ongemoeid. "Last edited" beloofde dus meer
dan de kolom waarmaakt — dezelfde soort halve waarheid als de groene "valid"-badge op een
prijslijst met 0 producten. Het label zegt nu wat er staat. De sortering blijft
`desc(updatedAt)`, ongewijzigd.

**OPEN BESLISSING VOOR TIMO — `project_dossiers.updated_at` optrekken bij regelwerk?**
Alternatief voor de relabel: de dossierrij mee laten bewegen met wat er in het dossier
gebeurt. Dan mag het label wél "Last edited" heten en wordt de bestaande `updated_at DESC`-
sortering pas echt "recent gewerkt bovenaan". Kosten: het raakt élk schrijfpad dat vandaag
alleen `spec_lines` aanraakt — `addSpecLines`, `updateSpecLine`, `setQuantity`,
`linkQuantities`, `deleteSpecLine` (`lib/repo/dossiers.ts`), `runMatcher`/`chooseCandidate`/
`setLineStatus`/`unlinkMatch` (`lib/repo/matching.ts`), `recordPdfImport`, de OCR- en
leesroute-import, en `decideReview`. Dat zijn een stuk of tien functies in vier bestanden,
plus de vraag of een matcher-run "bewerken" heet (hij verzet dan de datum van elk dossier
dat je alleen maar opnieuw laat rekenen). Twee vormen die op tafel liggen: (a) één
`touchDossier(db, dossierId)`-helper die elk van die paden aanroept, expliciet en te lezen;
(b) een trigger of `$onUpdate`-achtige haak op DB-niveau, minder code maar onzichtbaar in
de repo-laag. **Bewust niet gedaan in deze ronde**: het is een gedragswijziging op de
sorteervolgorde van de lijst, geen bugfix, en dat hoort een besluit van Timo te zijn.

**2. Een statuschip wiste de zoekterm — dicht.** `components/dossier/status-filter.tsx`
bouwde zijn hrefs als `basePath + "?filter=…"` en kon er geen tweede parameter bij dragen;
wie eerst `?q=` zocht en dáárna op een status klikte, was zijn zoekterm kwijt zonder
melding. `StatusFilter` heeft nu een optionele `params`-prop (`{ q }` vanaf
`app/projects/page.tsx`) en bouwt de href via `URLSearchParams`: `filter` eerst, de rest
alfabetisch, lege waarden vallen weg. Zonder `params` is de href byte-identiek aan
voorheen — `project-status.test.tsx` pint dat vast (`/projects?filter=niet_gegund`). Het
uiterlijk is niet aangeraakt; de audit noemt deze rij het beste filter-idioom van de app.

**3. De commit shipte twee rode tests, met een groene claim in het bericht.**
`projectlijst-ux.test.tsx` las de hover-ring één keer uit vlák na de `expect.poll` op de
achtergrondkleur. Vlak en ring hebben dezelfde 150ms-transitie, maar de achtergrond rondt
eerder op zijn eindwaarde af; de ring stond dan nog één stap voor het einde en Chromium
serialiseert dat als `oklab(…)` in plaats van `rgb(…)`. De assertie viel dus over de vórm
van de string terwijl de kleur klopte. Nu een `expect.poll` op de box-shadow. De hover
zelf is nagemeten en klopt: vlak 1,1215:1 (light) en 1,2480:1 (dark), en de ring 6,34:1
(light) resp. **4,38:1 op de navy kaart in dark** — de ring is inderdaad de drager. De
`focus-visible`-outline op de omhullende `<a>` werkt met een echte Tab-toets (solid, 2px,
offset 2px, `--ring` in beide standen) en wordt niet mee-getransitioneerd: de `<a>` heeft
geen `transition`-declaratie, alleen de `Card` eronder.

**4. Lege staat vertelt nu wélke lege staat het is.** `/projects?filter=archief` zonder
gearchiveerde projecten zei "No projects yet. Use "New project" to create one." terwijl er
tien projecten zijn. Drie takken nu: geen zoekresultaat, geen projecten in dít filter, of
echt nog geen projecten. De regel boven de lijst telt binnen het actieve statusfilter en
zegt dat er nu bij ("Showing 2 of 7 projects under "Won" matching …").

**Blijft staan, bewust:** een gearchiveerd project is via het zoekveld niet te vinden zolang
"All" actief is (dat filter sluit archief uit, B6) — de lege staat zegt dan "No project
matches …" terwijl het project bestaat. Dat is het bestaande archief-besluit, geen nieuwe
regressie; als het hindert is de goedkoopste vorm een regel "…also search Archived" onder
het lege resultaat.

## 2026-07-30 — Eén lege toestand voor de hele app (UX-audit A6 + A7)

**Wat er stond.** Vijf visuele dialecten voor "hier staat niets", over ~vijftien plekken,
zonder gedeeld component. Op twee schermen stond het aanmaak-formulier bovendien bóven de
lege toestand die naar dat formulier terugwees ("Create one above").

**Wat er nu staat.** `components/ui/empty-state.tsx` — dialect 1 (gecentreerd gestreept
kader, titel + gemaximeerde uitleg) gepromoveerd tot het enige component. API bewust smal:

- **geen `className`.** De aanroeper mag zijn eigen kader niet meer tekenen; dat is precies
  hoe de vijf dialecten zijn ontstaan.
- **`variant` is een gesloten unie van twee**, en de grens is één vraag: wie tekent het
  vlak. `"framed"` (default) tekent zelf een kader op het kale canvas; `"inline"` tekent
  níets omdat de aanroeper al ín een `<Card>` zit. Dat was de echte reden dat dialect 4
  bestond: een kader in een kader wilde niemand, dus werd het maar een kale grijze regel.
- **`action` is verplicht, óók als er geen actie is** — dan schrijf je `action={null}`.
  De audit's klacht bij dialect 2 en 4 was "de actie mist altijd"; een lege toestand zonder
  uitweg is soms terecht (alleen-lezen logboek, alleen-lezen adminlijst) maar mag nooit per
  ongeluk ontstaan. `action={null}` is greppable bewijs dat het bewust was.

**A7 — de volgordebug.** `VersionHistory` en `OrgList` renderen bij leeg **alleen** de lege
toestand, met het formulier erín; het formulier keert terug op zijn oude plek zodra er één
item is. `"No organizations yet. Create one above."` werd onwaar en is vervangen door de
zin die al bij het formulier hoorde ("A customer organization with its own members, roles
and branding") — geen nieuwe copy verzonnen. Vastgepind in
`components/org/org.test.tsx` en `components/dossier/version-history.test.tsx`: precies één
aanmaak-formulier op het scherm, en dat zit in de lege toestand (`empty.contains(form)`);
in de gevulde stand géén `[data-slot="empty-state"]` en het formulier in zijn kaart.

**Bewust niet gemigreerd — vraag aan Timo.** Dialect 5, de drie kale nullen op
`/brand/dashboard` (Considered 0 / Chosen 0 / Choice rate —). Een KPI-tegel met een nul is
een dátastand, geen lege lijst, en er is geen bestaande zin om als uitleg te gebruiken.
Migreren vraagt dus nieuwe copy; die moet van Timo komen, niet van een bouwsessie.

**Ook niet aangeraakt:** `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` delen
het gestreepte kader maar zijn foutschermen, geen lege toestanden. En een handvol lege
regels buiten de audit-lijst (`spec-line-table`, `werkvoorbereider-view`,
`enrichment-panels`, `deviation-table`, `price-list-status`, `custom-fields-table`,
`analytics-*`) staan nog op hun eigen zin — kandidaat voor een volgende veegbeurt.

---

## Bak 2, item 7 — één primary per scherm (2026-07-30)

**De regel staat in `docs/DESIGN.md` §6, onder "Knophiërarchie — huisregel, geen afwijking",
met een korte kopie bovenaan `components/ui/button.tsx`.** Bewust als *huisregel* gelabeld en
niet als afwijking: kit §7 zegt wél hóé een primaire/secundaire/tertiaire knop eruitziet, maar
nergens wannéér je welke kiest. Er is dus niets van de kit afgeweken (harde regel 2 blijft
onaangeroerd) — er is een gat gevuld dat de kit openlaat. Komt er ooit een kit-uitspraak over
knophiërarchie, dan wint die.

Kern: `default` (navy) = **precies één per scherm**, de actie met het zwaarste gevolg.
`outline` = elke andere échte actie. `ghost` = wegwerpactie. **`secondary` is geen
actiegewicht** — het is de aan/uit-stand van een schakelaar of filterchip en de inerte
navigatie eromheen, en hoort nooit op een `type="submit"`. "Scherm" telt per beslissing: een
dialoog is een eigen scherm, een herhaalde beslis-kaart heeft één primary per item, en een
filterchip die `default` gebruikt toont een stand.

**`components/knophierarchie.test.tsx`** pint het vast: een bronscan over de .tsx-importgraaf
vanaf elke `page`/`layout` (één primary per scherm, met een becommentarieerde allowlist voor
de drie uitzonderingscategorieën), een tweede scan die `variant="secondary"` op een
`type="submit"` verbiedt (nul uitzonderingen), plus gerenderde metingen van de
disabled-behandeling. Zestien aanroepplekken zijn omgezet; het aantal `<Button>`-plekken bleef
gelijk (99) en er is geen label gewijzigd.

**Disabled.** Kit §6's 50 % opacity blijft ongewijzigd. Wat erbij kwam is
`disabled:cursor-not-allowed` — en daarvoor moest `disabled:pointer-events-none` uit
`button.tsx`. Met `pointer-events: none` is de knop geen muis-doelwit, dus de cursorregel deed
nooit iets **én** de `title` met de reden was onbereikbaar (de tooltip "Your own address — ask
a colleague to remove it" in `allowed-emails-block` verscheen nooit). Een `disabled`-knop vuurt
van zichzelf al geen click of submit, dus er verdwijnt geen bescherming; alleen de hover-stijlen
moesten expliciet uit, en dat gebeurt nu per variant met `not-disabled:hover:…`. De testsuite
controleert dat die guard ook echt als `:not(:disabled)` in de CSS terechtkomt — een typefout in
een variantnaam levert stilzwijgend géén regel op.

**Aannames die Timo mag terugdraaien:**
- Op `/settings` is de **XIS-`Save`** de primary geworden (de sleutel is daarna nooit meer te
  zien én de keuze sandbox/productie bepaalt waar een echte offerte landt), en `Add address` is
  naar `outline` gegaan. Wie "een adres toevoegen = toegang verlenen" zwaarder vindt dan de
  sleutel, draait die twee om — één van de twee moet outline zijn.
- Op `/projects/[id]/quote` is **`Generate / Refresh estimate`** de primary; `Save header` ging
  naar `outline`. "Send to XIS" is zwaarder, maar staat ín de dialoog en heeft daar zijn eigen
  primary.
- **Niet aangeraakt:** de filterchips die `default` als actieve stand gebruiken
  (`status-filter`, `brand-relations-controls`). Ze staan op schermen die óók een echte primary
  hebben, dus navy betekent daar twee dingen. Dat is A14-terrein (filter-idiomen) en raakt een
  recent verbeterd scherm — bewust laten liggen.
- **Grootte niet meegenomen:** `Run parser` op `/data/enrichment` draait over 539 producten maar
  staat op `size="sm"` (28 px) in een gewoon paneel, niet in een dense tabel. Dat is niet wat
  besluit O9 dekt. Dit item ging over gewicht, niet over maat — kandidaat voor een volgende ronde.

**Pre-existing lint, niet van deze wijziging:** `components/dossier/review-queue.tsx:331`
`react/no-unescaped-entities` op "line's". Stond er al vóór deze sessie.

## 2026-07-31 — Reviewzwerm 2.5a blok 2 (matcher & review): A1, A2, A9 + één vraag voor Timo

Drie bevindingen uit `docs/reviewzwerm-2.5a.md` gerepareerd, elk met een test die de oude
situatie zou hebben gevangen (alle drie geverifieerd: rood op de oude code, groen op de nieuwe).

- **A1** (`lib/repo/review.ts`) — `decideReview` en `linkManualProduct` lieten
  `spec_lines.deviations` staan zoals `runMatcher` hem vulde: met de verdicts van de
  **rank-1**-kandidaat. Koos de mens een ánder product, dan droeg de regel de cijfers van een
  product dat niemand koos — tot en met een handmatig gelinkt, correct product met de **rode**
  afwijking van een afgekeurde kandidaat, groen afgedrukt op scherm én PDF. Beide functies nemen
  nu de verdicts van de daadwerkelijk gekozen kandidaat (helper `verdictsOfChosen`); een nooit
  getoetst product levert een **lege** lijst. De status blijft groen — dat is het besluit.
- **A2** (`lib/matching/engine.ts`) — `pickUnambiguousYellow` las álle kandidaten en kende de
  Gat-B-vlag `unconfirmed` niet: "geen onbekend veld" ving de ontbrekende waarde af, niet de
  **onbevestigde**. Een kandidaat die op onze eigen optiekcode-tabel leunt (WF ≈ 57°) werd
  daardoor automatisch geaccepteerd terwijl Gat B "de mens kiest met reden" belooft. Het
  predicaat eist nu dat de enige schoon-gele kandidaat op **lijst 1** staat; de
  ondubbelzinnigheidstelling loopt bewust nog steeds over álle kandidaten.
- **A9** (`lib/repo/imports.ts`) — de run gaat op `bevestigd` direct ná `addSpecLines`, vóór de
  matcher-lus. Crashte de matcher halverwege, dan bleef de run op `voorstel` terwijl de regels er
  al stonden: een tweede klik op Bevestigen verdubbelde het dossier. Een matcher-fout laat de
  actie nog steeds klappen; de regels staan er dan één keer, met status `open`, en zijn opnieuw
  te matchen vanaf het regel-detail.

**Open vraag voor Timo — twee plekken doen het tegenovergestelde met dezelfde toestand.**
A3 (kiezen uit lijst 2 → groen) is grotendeels afgedaan met het besluit *"een menskeuze mag
altijd groen opleveren"*. Nagemeten en bevestigd: óók de specloze Gat-A-variant (`deviations: []`,
nul getoetste velden, groen mét bedrag in het totaal) is **alleen via een menskeuze** bereikbaar —
`statusFromDeviations` heeft precies één aanroeper, `chooseCandidate`, en die heeft precies één
aanroeper in de app: `chooseCandidateAction` (formulier-submit vanaf het regel-detail). De
seed-scripts (`scripts/seed-demo.ts`, `scripts/seed-scenario.ts`) simuleren dezelfde
menshandeling. Het systeem maakt zichzelf nergens groen zonder iets te toetsen: `anyGreen` leest
alleen `provable`, en `provable` is bij een specloze regel per definitie leeg. **Geen defect,
niets gerepareerd.**

Wat wél blijft staan is de tegenstrijdigheid die het rapport signaleert. Bij dezelfde toestand
— een mens kiest een product dat niet (volledig) getoetst is — doen twee functies het omgekeerde:
- `lib/repo/matching.ts:246` (`chooseCandidate`) → `statusFromDeviations([])` = **groen**;
- `lib/repo/review.ts` (`markChosenCandidate`) → kandidaat in lijst `onvolledig` met **lege**
  verdicts, expliciet beargumenteerd: *"het is niet door de tolerantietabel getoetst, dus
  'aantoonbaar' zou liegen (C-08)"*.

De A1-fix hierboven maakt die spanning zichtbaarder, want een handmatig gelinkt product houdt nu
een lege afwijkingenlijst op een groene regel: "groen" en "niets vergeleken" staan naast elkaar
op één regel. Dat is eerlijker dan het cijfer van een ander product, maar het is niet hetzelfde
"groen" als `components/dossier/status.ts:49` belooft (*"all specs within the green margin"*).
**Vraag: mag een menskeuze op ongetoetste data dezelfde groene stand dragen als een bewezen
match, of hoort daar een eigen merkteken/stand bij?** Bewust niet zelf beslist — dit raakt de
bevroren statuskleuren (besluit O13).
---

## Reviewzwerm 2.5a — blok 1 (veiligheid & invoer)

_2026-07-31. Tien bevindingen uit `docs/reviewzwerm-2.5a.md` gerepareerd: A13, A14, A5,
B18+C5, A10, C3, C4, B6, C10, B17. Eén commit per bevinding, in die volgorde. Blok 2
(matcher & review: A1, A2, A3, A9) liep parallel in een andere sessie — `lib/matching/`,
`lib/repo/review.ts`, `lib/repo/matching.ts` en `lib/repo/imports.ts` zijn hier niet
aangeraakt._

### Nieuwe conventie die volgende sessies moeten volgen

**Elke server action begint met een schema-parse** (zod, `lib/validation.ts`). De volledige
conventie staat in `docs/INVOERVALIDATIE.md`, met een pointer in `CLAUDE.md`. Volgorde:
`requireSession()` → `parseForm()` → repo. De 68 bestaande actions zijn **niet** en masse
omgezet — dat is een grote diff zonder dekking. De regel die ervoor in de plaats komt: een
action die je aanraakt, zet je om; nieuwe actions beginnen met een schema.

⚠️ Een `"use server"`-module mag **uitsluitend async functies exporteren**. Een geëxporteerde
const laat `registerServerReference` klappen met "Object.defineProperties called on
non-object" (gemeten, niet beredeneerd). Daarom staat `SPEC_CSV_MAX_LINES` in
`lib/repo/dossiers.ts` en niet in de action ernaast.

### Aannames die Timo mag terugdraaien

- **De J-03-prijsaanvraag is in de praktijk onbereikbaar geworden.** `/products/[id]` staat
  nu achter `requireSession()` (A5) en `requestPriceAction` ook (B18). Omdat élke sessie
  vandaag intern is (`internal: Boolean(session)`, allowlist van 2–5 adressen), krijgt geen
  enkele kijker de gate "Request price via Brink" nog te zien. De code werkt en is getest;
  hij wacht op een kijker die ingelogd maar níet intern is (rollenmodel L-03/04). Dat is een
  bewuste ruil: ijzeren regel 1 boven een feature die vandaag geen gebruiker heeft. Wil je de
  externe productpagina terug vóór het rollenmodel er is, dan moet er iets anders voor in de
  plaats komen dan "de tier-gating doet het werk" — dat was precies de redenering die faalde.
- **De merkvergrendeling in tender is nu gelijkheid** (A14). Een bestek dat `Delta` vraagt
  krijgt geen enkel product van `Delta Light`. Blijkt uit de echte catalogus dat moeder- en
  submerken dáár als één merk bedoeld zijn, dan is de juiste oplossing een expliciete
  merk-alias-tabel — níet de operator weer verruimen. Vergrendelen is gelijkheid, zoeken is
  bevatten; `lib/repo/products.ts#searchProducts` blijft daarom bewust fuzzy.
- **`SPEC_CSV_MAX_LINES = 500`** (B6) is een keuze, geen meting. Het gemeten kappunt ligt op
  2978 regels (Postgres' bind-parameterlimiet) en een echt armaturenboek heeft er tientallen.
  Alles-of-niets bij overschrijding, want half inlezen geeft het half gematchte dossier dat
  we juist voorkomen.
- **`OCR_MAX_TILES = 16`, `OCR_MAX_DIMENSION = 20.000`, `MAX_DOC_FIELD_CHARS = 200`** zijn
  ruime, statische grenzen — gekozen op "ruim boven elk echt geval", niet gemeten.

### Open eindes

- **`brands.disclosure_tier` staat nog steeds standaard op `tier1`.** De briefing is
  expliciet — "Tier 1: volledige data + adviesprijs (**merk expliciet akkoord**)" — en een
  default die voor elk merk toestemming aanneemt die nooit gegeven is, blijft onwenselijk.
  Niet gewijzigd omdat het een migratie vraagt; de scherpe kant is eraf doordat tier1 nu de
  kijkercontext respecteert, dus tier1 betekent niet langer "publieke prijs". De nullable
  variant (`visible_specs.disclosure_tier` → `?? "tier1"`) is wél omgezet naar `tier2`.
- **Er is nergens rate limiting** (nul treffers op `rateLimit|throttle` in de hele repo).
  Voor `requestPriceAction` is de sessiepoort nu de rem, maar dat is geen rate limiting.
  Hoort een aparte, bewuste bouwstap te zijn — niet een half laagje in één action.
- **`leads` kan onopgemerkt volgroeien.** `listLeads` heeft repo-breed nul aanroepers: geen
  route, geen scherm, geen test. De tabel heeft buiten de PK geen index en geen dedup, en
  de twee rijen per aanvraag (`leads` + `events`) gaan niet in één transactie. Leads zijn de
  commerciële opbrengst van de tier-2-gate; loopt die tabel vol met ruis, dan is er geen
  manier om de echte aanvragen eruit te vissen.
- **De AI-budgetstop staat tussen regels, niet tussen turns** (`lib/ai/vangnet.ts`, de
  budgetcheck in de regel-lus). Eén regel gaat tot zes keer opnieuw de leiding in. De cap op
  `productText` (B17) verkleint de kosten daarvan sterk maar heft het niet op.
- **`sharp` blijft op een kwetsbare versie** na de next-bump (A13): 16.2.10, .11 én .12
  pinnen alle drie `sharp: ^0.34.5` terwijl de libvips-advisory `>= 0.35.0` eist. Vraagt een
  expliciete override. Lage prioriteit — `sharp` wordt nergens geïmporteerd en Vercel doet
  beeldoptimalisatie buiten de function om. `bun audit` staat na de bump op 11 advisories
  (was 20); wat overblijft is transitief (postcss, brace-expansion) of dev-only
  (`@vitest/browser`). `shadcn` staat nog in `dependencies` terwijl het nergens geïmporteerd
  wordt en daardoor twee advisories als "productie" laat rapporteren.
- **`createCsvProposalAction` is nog steeds dode code.** Het ontwerp wil >10 CSV-regels via
  een controlescherm (`CSV_PROPOSAL_THRESHOLD = 10`), maar niets roept die action aan. De cap
  uit B6 is de afdwinging tót dat scherm er is, geen vervanging ervan.

### Bewust niet gedaan

- **C2 (AI-maandplafond) blijft uit** — vastgelegd besluit.
- **B1 (eigendomsmodel) en B15 (RLS)** vielen buiten de opdracht.
- **`setQuantityAction`** (de tweede helft van de C4-claim) is niet omgezet: het is dode
  code — geen component importeert hem. Hem nu valideren zou een pad hardmaken dat er niet is.
- **`lib/repo/products.ts:113`** blijft een `like`-match. Dat is de catalogus-zoekopdracht
  van een ingelogde gebruiker, geen fase-vergrendeling; fuzzy is daar de bedoeling.
- **Het label "Tier 1 · everything + price"** in `components/data/brand-visibility-block.tsx`
  is niet aangepast. Voor de enige kijker die vandaag bestaat (intern) klopt het nog; zodra
  er niet-interne sessies zijn, dekt het de lading niet meer.

## 2026-08-03 — Sprint 2.5b: snelheid (eerst meten, dan pas optimaliseren)

Volledig rapport met alle plannen en cijfers: **`docs/2.5b-snelheid.md`**. Hieronder alleen de
aannames, de open eindes en wat een volgende sessie moet weten.

### Wat er staat (4 commits, nog niet gepusht, migratie nog niet toegepast)

Zes expressie-indexen (migraties `0017`, `0018`) plus drie querywijzigingen zonder schema-impact.
Serverzijdig gemeten op de echte productiedatabase met `EXPLAIN (ANALYZE, BUFFERS)`, vóór én ná:
exacte SKU-match in de matcher 276 → 0,10 ms (draait **per spec-regel**), exacte SKU in
`searchProducts` 55 → 0,11 ms, merk-alleen 185–660 → 60–307 ms, merk+tekst 230 → 117 ms,
compleetheid zwaarste merkrelaties-pagina 318 → 209 ms, `listPriceListStatus` 220 → 51 ms,
merkgat-tegel op `/analytics` 103 → 0,54 ms.

### ⚠️ Openstaande bug, gevonden tijdens het meten, NIET gerepareerd

**`/catalog` crasht als je een merk kiest zonder zoektekst.** `lib/repo/products.ts:121/144` zet
de sorteertermen op de constante `sql\`0\``; drizzle rendert dat als `order by 0 desc`, en dat is
voor Postgres een positieverwijzing naar de select-lijst. Positie 0 bestaat niet:
`ERROR: ORDER BY position 0 is not in select list`. Geverifieerd tegen de echte
productiedatabase. Raakt twee gevallen: (1) een merk uit de keuzelijst met leeg zoekveld —
precies waarvoor die lijst er staat; (2) een zoektekst zonder enig token van ≥2 tekens (bijv.
`X`). Dezelfde bug is één laag verderop al herkend en met een poort afgevangen
(`lib/matching/engine.ts:437-441`, mét toelichting in de code); `products.ts` heeft die poort
niet, en zou hem daar ook niet moeten krijgen — merk-zonder-tekst is dáár een geldige
zoekopdracht. Er is geen test die de merk-alleen-tak uitvoert (`lib/repo/rules.test.ts:37` zoekt
met merk **én** tekst); die hoort bij de reparatie. Buiten scope gelaten conform de opdracht
("bug melden met bewijs, niet repareren").

**Gevolg voor de B5-cijfers:** de merk-alleen-tak was met de echt gegenereerde SQL niet te meten.
De cijfers zijn gemeten op een surrogaat waarin de twee constante sorteertermen (`0 desc, 0 desc`)
zijn weggelaten — die sorteren per definitie niets, dus `WHERE`, plan en sorteerkosten zijn
identiek. De index-reparatie is onafhankelijk geldig (ze raakt de `WHERE`) en helpt óók de
merk+tekst-tak, die wél draait. Maar zolang de bug er is, is er op `/catalog` niets van te zien.

### Aannames

- **De Neon-branch `enrichment-serien` is representatief voor productie.** Schrijvende
  experimenten (indexen aanmaken en weer weghalen) zijn daar gedaan; rijaantallen zijn identiek
  (211.317 producten / 210.121 prijzen). Absolute cijfers lopen soms uiteen (koudere cache); de
  verhoudingen zijn consistent, en alles wat zonder schemawijziging kon is gewoon op productie
  gemeten. De branch is **niet** gemerged en er staat niets van dit werk op.
- **`prices.price_list_id` blijft `NOT NULL` met een gevalideerde FK.** Daarop leunt het weghalen
  van de `join price_lists` uit de compleetheidsmeting. Staat nu als test in
  `lib/repo/brand-relations.test.ts` — verandert het schema, dan wordt die test rood in plaats van
  het cijfer stil.
- **Wandkloktijd vanaf een werkplek in NL is geen maatstaf.** De round-trip naar `us-east-1` is
  hier 114 ms; Vercel draait in dezelfde regio als Neon. Alle cijfers in het rapport zijn
  serverzijdige `Execution Time`.

### Open eindes

- **`/catalog`'s merken-keuzelijst kost nog steeds ~250 ms, onvoorwaardelijk.** Nagemeten dat de
  B4-reparatie (`lib/repo/catalog.ts`) **geen meetbare winst opleverde**: 246–275 ms nu tegen
  235–248 ms voor de query die hij verving. Beide scannen `products` volledig. Drie alternatieven
  gemeten en afgewezen (btree op `brand_name`: geen verschil; recursieve loose index scan: 220 ms;
  merknamenlijst + `EXISTS` per merk: 146 ms maar wisselvallig). Er zijn maar 32 distinct
  `brand_name`-waarden onder 211k producten; zonder gematerialiseerde vorm of cache is dit niet
  structureel sneller te maken, en de code wijst caching hier expliciet af omdat ijzeren regel 3
  geen TTL verdraagt. Die afweging deel ik — maar de 250 ms staat er dus nog.
- **`app/projects/[id]/work-prep/page.tsx:61` doet `await` in een `for`-lus**, één
  `getEquivalentAlternatives` per gematchte spec-regel (360–680 ms per aanroep, gemeten). Vandaag
  geen probleem: geen enkel dossier staat op `awarded` en het zwaarste heeft 3 gematchte regels.
  Bij 40 regels is dat 15–25 s serieel. Niet triviaal te parallelliseren: de functie schrijft een
  event per aanroep, dus `Promise.all` verandert de volgorde in het event-log.
- **`app/projects/[id]/page.tsx:57,59,62` doet drie onafhankelijke `await`s serieel.** Samen te
  voegen tot één `Promise.all`; winst = twee round-trips, vanaf Vercel ~4–10 ms. Bewust niet
  gedaan — een wijziging zonder meetbare winst is precies wat besluit G25 verbiedt.
- **De resterende tijd in de merk-alleen-tak zit in de sortering, niet in de scan.**
  `ORDER BY similarity(name, '') DESC` sorteert alle matchende rijen op een sleutel die voor een
  lege zoektekst aantoonbaar constant 0 is. Vereenvoudigen kan, maar dat is rangschikkingscode
  (ijzeren regel 2 woont daar) en hoort niet bij een snelheidsopdracht.
- **`searchProducts` en de matcher normaliseren artikelnummers verschillend** —
  `lower(x) = lower($1)` tegenover `regexp_replace(lower(x), '[^a-z0-9]','','g') = $1`. Daarom
  hebben ze elk een eigen index. Bestaand gedrag, niet gelijkgetrokken (dat is een
  gedragswijziging); wel de moeite waard om ooit te bekijken, want de twee paden vinden nu niet
  dezelfde dingen.
- **C6 (FK-indexen) blijft liggen**, conform opdracht: `spec_lines` heeft 204 rijen, `events`
  1.481. Houdbaarheidsnotitie voor zodra die tabellen zes cijfers naderen.

### Nog te doen bij het pushen

De migraties zijn **nog niet op productie toegepast**. `bun run db:migrate` hoort bij dit blok en
mag zowel vóór als ná de push: `0017` en `0018` voegen uitsluitend indexen toe, dus de code werkt
identiek mét en zonder — alleen langzamer zonder. Bouwtijd 3,7 s op 211k rijen; `CREATE INDEX`
zonder `CONCURRENTLY` houdt in die seconden een `SHARE`-lock op `products` (lezen kan door,
schrijven wacht).

### Testrun

`bun vitest run`: 1494 groen, 1 overgeslagen. Vijf tests vielen om onder volle belasting
(`huisstijl` 2×, `project-status` 2×, `custom-fields` 1× — allemaal `oklab()` vs `rgb()` op
berekende kleuren); geïsoleerd hertest zijn ze alle 70 groen. Bekende suite-conditie, geen
codefout, en geen van de vijf raakt iets uit dit blok.
