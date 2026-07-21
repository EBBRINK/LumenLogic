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
