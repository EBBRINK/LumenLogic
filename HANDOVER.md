# HANDOVER — Lumen Logic (runs 1–3)

> ## ⚠ TWEE LESSEN VAN 30 JULI 2026 — verschillende fouten, allebei drie keer toegeslagen
>
> | **1. Toets het GEREEDSCHAP na elke ingreep** | **2. Een meting draagt alleen de vraag die hij LETTERLIJK stelde** |
> |---|---|
> | Na elke wijziging aan de zwerm-export, de verwerker, de poort of de parser: herhaal één bekende meting en bevestig dat de uitkomst onveranderd is. Pas daarna agents inzetten. | Voordat je een uitslag als bewijs gebruikt: lees de prompt van díé ronde terug. Beantwoordt hij de vraag die je nu stelt, of een aangrenzende? |
> | Zes lekken in de meetopzet op één dag — valvoorvoegsel, vaste stap, tweeling, klontering, restscherf-als-magneet, en een hint in de agent-opdracht die de promptHash niet dekte. **Vier ervan ontstonden door de reparatie van het vorige.** Alle zes zichtbaar aan de uitkomst, geen enkele aan de code. Kosten: twee volledige rondes. | Drie keer een antwoord gelezen dat er niet in stond: bij **TAL** (verklaring verzonnen voor een uitkomst die van een verkeerd merk kwam), bij de **light engines** en bij de **LED-modules** (een ronde die vroeg of de waarde het PRODUCT beschrijft, gebruikt als bewijs over het ARMATUUR). |
> | De tests die er telkens bij kwamen dekken de fout die al gezien wás; geen ervan zou de volgende gevonden hebben. Een test op de data is iets anders dan een regressietest op het instrument. | Het gereedschap kan onberispelijk zijn en het antwoord nog steeds op de verkeerde vraag slaan. Deze fout laat geen spoor na in de code. |
>
> Ze vangen verschillende dingen en vervangen elkaar niet.

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

## Ijzeren regel 3 herschreven — vervallen producten zichtbaar + driver-waarschuwing — 19 aug 2026

Besloten in de demosessie met Brink Licht van 12 aug, door Timo bevestigd op 19 aug.
Achtergrond en meting: `docs/probleem-vervallen-producten.md`; spec:
`docs/goal-vervallen-producten.md`.

**De regel zelf is gewijzigd, in `CLAUDE.md`.** Oud: "verlopen prijslijst = product
onzichtbaar in álle zoekresultaten". Nieuw: "verlopen prijslijst = product zichtbaar zonder
prijs; nooit een prijs uit een verlopen lijst; altijd rood gemarkeerd, altijd met de melding
welke prijslijst de laatst bekende was." De bescherming is identiek gebleven — er mag nog
steeds nooit geoffreerd worden op verouderde prijzen — maar verbergen heeft plaatsgemaakt
voor melden. Aanleiding: bestekschrijvers (Deerns) hergebruiken een bestek van vorig jaar,
en die artikelnummers leverden **nul treffers** op in plaats van "dit product is vervallen".

**Waar de poort nu zit.** `db/migrations/0022_vervallen_zichtbaar.sql` herschrijft
`visible_products`. Drie toestanden in `price_state`: `actueel`, `prijslijst_verlopen`
(prijsregel in een lijst waarvan `valid_until` voorbij is — onze data loopt achter) en
`uit_prijslijst` (geen prijsregel meer, wél een rij in `archive.prices_archive` — het
product is uit productie). `gross_price`, `currency`, `price_list_id` en `valid_until` zijn
**NULL zodra de toestand niet `actueel` is**. Dat is de afdwinging: een consument die een
bedrag toont krijgt niets, ook zonder van deze wijziging te weten. Het sluit meteen het
staffel-lek — `lib/repo/staffel.ts` bindt `price_tiers.price_list_id` aan
`visible_products.price_list_id`, en NULL matcht daar niets. Leeskant (de teksten):
`lib/prijstoestand.ts`; markering: `components/vervallen-markering.tsx`.

### Aannames en besluiten

- **Nooit-geprijsd blijft onzichtbaar.** Geen prijsregel én geen archiefrij → geen rij in de
  view. Anders overspoelen 200k+ nooit-geprijsde producten de catalogus. "Zichtbaar"
  betekent nu: wij kennen de prijs, of kenden hem. Dit is ook wat er van de oude
  onzichtbaarheid over is — `db/test-db.ts` kreeg er `seedBrandProduct({zonderPrijs})` voor.
- **Een nog-niet-begonnen lijst (`valid_from > current_date`) blijft onzichtbaar.** Dat is
  geen verval maar het omgekeerde: die prijs komt eraan. "Price list expired" erop plakken
  zou liegen en er valt niets na te vragen. Gedrag op die rand dus onveranderd.
- **De twee vervaltoestanden blijven apart**, ook al zien ze er hetzelfde uit (rood, geen
  bedrag). Het antwoord op "en nu?" is tegengesteld: bij een verlopen lijst bel je het merk
  om een verlenging, bij een uit-de-lijst-gevallen product zoek je een vervanger.
- **Alternatieven-suggesties blijven prijsbaar.** `getEquivalentAlternatives`
  (`lib/repo/equivalence.ts`) filtert op `price_state = 'actueel'`: een alternatief
  voorstellen dat je niet kunt offreren is erger dan geen alternatief. Zoeken en matchen
  tonen vervallen producten juist wél — dáár is de hele wijziging voor.
- **De matcher beoordeelt vervallen NIET.** Een vervallen product kan gewoon groen zijn als
  het aan de specs voldoet; vervallen is een prijsvraag, geen matchvraag. Het scherm
  markeert het.
- **`LATERAL` in plaats van een CTE met `DISTINCT ON`.** De view wordt in de praktijk altijd
  bevraagd met een filter op `products`; een CTE met `DISTINCT ON` sorteert eerst alle 210k
  prijsrijen en blokkeert predicate pushdown. Er is een index bij gekomen:
  `prices_archive_product_idx` (het archief had er geen enkele).
- **De driver-waarschuwing is een signaal, geen koppeling.** Er is géén datamodelwijziging.
  Het merk-brede feit "dit merk voert losse onderdelen" komt uit `ONDERDEEL_START`
  (`lib/enrichment/verdenking.ts`, nu geëxporteerd), hergebruikt in Postgres via
  `lib/onderdeel-signaal.ts`. Drempel **≥3 producten** per merk; één treffer kan een
  parse-artefact zijn, en de merken die er in de meting van 30 jul uitspringen liggen er
  ruim boven (W&D 197, Flos Architectural 110, Lombardo 82, TossB 38, Marset 21).
  ⚠️ `\b` is in Postgres' ARE géén woordgrens maar het backspace-teken; `onderdeelPatroonSql()`
  vertaalt naar `\y` en `lib/repo/onderdeel-merken.test.ts` legt beide kanten op dezelfde
  namenlijst naast elkaar.
- **Terughoudend, en dat is per scherm anders.** Regel-detail (één armatuur in beeld) →
  inline bij de regel. Offerte (veertig regels) → **één** melding boven de tabel, met de
  merken erin genoemd. Een waarschuwing op elke regel wordt weggekeken, en dat is precies de
  faalmodus die de klant beschreef. Een regel die zélf een driver is krijgt hem niet.

### Bewust NIET gedaan / opvolgtaken

- **⚠️ Het testmerk `ZZTEST QA-14` komt terug in de zoekresultaten.** Dat merk staat bewust
  in productie en was uitgezet dóór de prijslijst te laten verlopen (zie hierboven,
  "Uitschakeling is gebeurd via ijzeren regel 3, niet met DELETE"). Die aan/uit-knop bestaat
  niet meer: de twee geprijsde producten (`ZZTEST-LL14-0001/0002`) zijn nu vindbaar als
  `prijslijst_verlopen`; `…-0003` blijft onzichtbaar omdat het nooit een prijs had.
  **Handeling vóór of vlak na de deploy:** zet de status van die producten op iets anders
  dan `actief`, of verwijder de prijsregels. `products.status` is de juiste vervanger, maar
  de view filtert daar vandaag niet op — dat alsnog toevoegen is een tweede
  zichtbaarheidsregel in dezelfde wijziging en is daarom niet meegenomen. **Opvolgtaak.**
- **`scripts/import.ts` (`bun run import`) kent het archief nog steeds niet.** Voor de 211k
  XIS-producten die er zo in zijn gekomen bestaat geen archiefrij, dus de toestand
  `uit_prijslijst` zal daar niet ontstaan — die producten blijven op hun oude lijst staan en
  vallen in `prijslijst_verlopen` zodra die verloopt. Het script gebruikt bovendien nog
  altijd een hardgecodeerde `valid_until = 2026-12-31` (`scripts/import.ts:26-27`).
  Aansluiten op `replacePriceList` is een eigen opdracht. **Opvolgtaak.**
- **De AI-vangnet-zoekactie (`lib/ai/vangnet.ts`) is ongewijzigd** en vindt dus voortaan ook
  vervallen producten. Dat is gewenst (het vangnet zoekt het gevraagde artikel), maar het
  model krijgt de toestand niet te zien — dat zou een wijziging van de tool-schema's en de
  prompt kosten. De mens die de suggestie beoordeelt ziet de markering wél. **Opvolgtaak
  als het in de praktijk misleidt.**
- **`lib/repo/ai-suggestions.ts` joint `INNER` op de view.** Suggesties op een product dat
  onzichtbaar wérd verdwenen stilzwijgend; die komen nu terug. Geen actie ondernomen —
  dit is het gewenste gedrag onder de nieuwe regel, maar het is een gedragsverandering die
  niemand heeft aangevraagd.
- **De teller op `/catalog` telt vervallen producten mee.** `components/catalog-search.tsx`
  telt `aantoonbaar.length + onvolledig.length`; de resultaatverzameling is groter geworden.
  De screenshots in `components/catalog.test.tsx` zijn bijgewerkt. Loopt er parallel werk aan
  een resultaatlimiet met totaalteller, dan moet dat op deze nieuwe verzameling gemeten
  worden.
- **Niet in een browser geverifieerd.** Deze worktree heeft geen `DATABASE_URL`, dus
  `bun dev` kan niet draaien. Bewijs komt uit de white-box RSC-tests met screenshots
  (`components/vervallen-markering.test.tsx`, `components/catalog.test.tsx`,
  `components/dossier/regel-detail.test.tsx`) en uit de PGlite-tests, die exact dezelfde
  migraties draaien als Neon.
## Projectpagina-verbeteringen uit de demo — 19 aug 2026

Vier punten uit de demosessie met Brink Licht van 12 augustus. **Drie gebouwd, één bewust
niet** — die vierde staat hieronder als open punt.

**Gebouwd**
1. **Legenda vast onderaan.** Was een `<details>` bovenaan `/projects` die je moest
   openklappen; is nu een altijd-open `<aside>` mét `sticky bottom-0`, ónder de lijst. Hij
   blijft in beeld terwijl je scrolt en gaat aan het eind in de flow staan. Bewust `sticky`
   en niet `fixed`: fixed haalt hem uit de flow en legt hem over de laatste kaart heen.
2. **De kop is de betekenis, niet de kleurnaam.** Nieuw veld `STATUS[...].name` in
   `components/dossier/status.ts`: Match · Attention · Awaiting brand · Invalid product ·
   Out of scope · Open. ⚠ `label` en `word` zijn NIET hernoemd en mogen dat ook niet: `word`
   wordt letterlijk op de PDF gedrukt en het geprinte kleurwoord is een eis (DESIGN.md O13,
   FUNCTIONEEL-ONTWERP §577). Gevolg — en dat is een **bewuste aanname**: de badge op de
   kaart zegt nog steeds "Green"/"Yellow", de legenda eronder "Match"/"Attention". Het
   bolletje is de koppeling. Wil Brink óók de badges omzetten, dan is dat een apart besluit
   mét een antwoord op wat er dan op papier komt.
3. **Tooltip na 300 ms.** De uitleg zat in een `title`; die vertraging is browser-eigen
   (~1–2 s) en niet in te stellen. Nieuw: `components/ui/hint.tsx` — CSS-only (geen JS, geen
   client component), 300 ms bij verschijnen en 0 bij verdwijnen, tekst staat altijd in de
   DOM (schermlezers hoeven niet te hoveren). Gebruikt door `StatusBadge`, `StatusTally` en
   `ProjectStatusBadge`; de `title`-attributen zijn daar weg (twee tooltips over elkaar is
   erger dan één trage). Bijvangst: de projectkaart in `dossier-list.tsx` staat nu op
   `overflow-visible` — `ui/card.tsx` knipt standaard af en sneed de tooltip halverwege de
   tweede regel doormidden.

**Niet gebouwd — punt 4: groene regels uit de Review-lijst**
De vraag was of dit "een schakelaar" is. **Dat is het niet.** De wachtrij en de tab-teller
zijn allebei `reviewKind is not null` (`getReviewQueue` / `getReviewCounts` in
`lib/repo/review.ts`) — er is geen statusfilter en geen vlag. Groene regels komen daar
binnen via één plek: elke door OCR of de leesroute gelezen regel krijgt `reviewKind = 'ocr'`
(B7, `lib/repo/ocr.ts` ±475 en `lib/repo/leesroute.ts`). Die review stelt een ándere vraag
dan de matchreview — niet "klopt de match?" maar "hebben we de regel goed gelézen?" — en
staat dus los van de kleur. Groen uitsluiten betekent die regel wijzigen, en die regel hangt
aan twee dingen die er niet los van staan: de vangnet-gating (`lib/ai/vangnet.ts` B8) en
`pruneOcrPageImages` (`lib/repo/ocr.ts`), die het paginabeeld pas weggooit als er geen open
review meer op de run staat. Gezien de aangekondigde herziening van de matchpijplijn
(SQL-regels → LLM-oordeel) is dit expres blijven liggen. Het automatisch hermatchen na
"checked" is in deze sessie niet aangeraakt.

## Wachtwoord-reset — backend (bouwer 1, 19 aug 2026, branch wachtwoord-reset)

Better Auth core-resetflow aangezet (docs/goal-wachtwoord-reset.md, bouwstappen 1–4 + 6):
`sendResetPassword` (console.log + event), `revokeSessionsOnPasswordReset: true`,
`onPasswordReset`-event, token 15 min. `zEmail`/`zPassword` in lib/validation.ts,
event-labels, anonieme server actions in `app/forgot-password/actions.ts` en
`app/reset-password/actions.ts`, PGlite-test `lib/auth-password-reset.test.ts` (6 tests).

**Aannames / open eindes voor bouwer 2 (UI):**
- `/forgot-password` en `/reset-password` staan nog NIET in `lib/route-allowlist.ts`:
  de guard-tests eisen dat elke allowlist-regel een bestaand `page.tsx` heeft én tellen
  de open routes met naam ("precies acht"). Bouwer 2 zet beide op `"open"` en werkt de
  verwachte lijst in `lib/route-allowlist.test.ts` bij (acht → tien) zodra de pagina's
  bestaan.
- Beide actions nemen **FormData** aan (conform de parseForm-conventie), anders dan
  `signInAction`/`activateAction` die een object nemen. Client-forms: `new FormData(form)`
  en aanroepen via `callAction()`.
- `requestPasswordResetAction` antwoordt áltijd `{ ok: true }` — ook bij ongeldige invoer
  of een interne fout (anti-enumeratie). De UI toont dus altijd de neutrale sent-melding.
- `resetPasswordAction` redirect bij succes naar `/login` (geen auto-login); elke
  tokenfout geeft één generieke melding.
- Bekende eigenschap van Better Auth core: een reset op een **magic-link-only** account
  (user zonder credential-rij) máákt een credential-account aan. Bewust zo gelaten — het
  token bewijst het postvak, zoals een PIN dat doet; getest in het randgeval-blok van
  `lib/auth-password-reset.test.ts`.
- Token staat in serverconsole/Vercel-logs (fase zonder mailprovider) — geaccepteerd
  restrisico uit het goal-doc; mailprovider later.

## Wachtwoord-reset — UI (bouwer 2, 19 aug 2026, branch wachtwoord-reset)

Bouwstappen 5–6 uit docs/goal-wachtwoord-reset.md: `app/forgot-password/page.tsx` en
`app/reset-password/page.tsx` (beide in LoginChrome), client-forms in
`components/forgot-password/` en `components/reset-password/` (action als FormData-prop,
callAction(), eigen test-stubs), "Forgot password?"-link onder het wachtwoordveld op
/login, beide routes op `"open"` in de allowlist (bewakertest: acht → tien).

**Aannames / open eindes:**
- De neutrale sent-melding op /forgot-password verschijnt óók als de action crasht
  (netwerkfout/500) — bewust: elk responsverschil is een enumeratiekanaal. Getest in
  `components/forgot-password/forgot-password.test.tsx`.
- `/forgot-password` heeft géén sessiecheck-met-redirect zoals /login: een ingelogde
  gebruiker mag gewoon een resetlink aanvragen (kan toch al via /settings).
- `InvalidResetLink` gebruikt een gewone `<a>`, geen next/link: de RSC-testharnas
  weigert de client-referentie van next/link in een servercomponent ("client reference
  export is called on server").
- Wachtwoordbeleid en bevestiging worden client-side vóórgecontroleerd (patroon
  activate-form) zodat de Nederlandstalige parseForm-melding van `zPassword` normaal
  nooit in de Engelstalige UI belandt; de server parseert alsnog.
- De "Forgot password?"-link staat in muted-foreground + underline, niet in
  brand-blue/teal: G37 noemt de summary-kleur "de enige teal-op-donker tekstkleur" en
  die belofte is hier niet gebroken.

## ▶ HIER BEGINT DEPLOY 1 — draaiboek voor sprint 3.1

*Alles hieronder is nog niet gebeurd. Sprint 3.1 staat volledig op branch
`claude/sprint31-pin` en is **niet gepusht**. (Het draaiboek noemde hier eerst een vaste sha,
**c982e1f**/24 commits; die is door twee rebases op main en sprint 3.2b achterhaald. Een sha in
een document veroudert bij de eerstvolgende commit — lees de tip van de branch, niet dit
getal.) Elke push naar
main deployt binnen seconden naar productie; er is geen preview-stap. Het akkoord hiervoor
komt van Timo zelf — G32 betekent dat het er **twee** zijn, en dit is de eerste.*

**Wat deploy 1 doet:** wachtwoord-auth komt ERNÁÁST de magic link te staan. De magic link
blijft werken. Dat is geen tussenoplossing maar de kern van G32: gaat de magic link er in
één keer uit, dan komt niemand meer binnen — ook niet in `/admin/users` om de eerste PIN aan
te maken. **Deploy 2 (magic link eruit) mag pas ná stap 10 hieronder.**

### Vóór de push — één minuut, voorkomt een kapotte migratie
1. **Tel de gebruikers na.** `select email from "user";` op productie. Migratie
   `0019_org_type_activatie.sql:61-63` noemt drie adressen **letterlijk**
   (`tester@voorbeeld.nl`, `timo@jouwainstein.com`, `e.brink@brinklicht.nl`) en
   geeft precies díé een `org_admin`-membership in de Brink-org. Staat er inmiddels een
   vierde adres, dan krijgt dat géén membership en kan het na deploy 2 niet meer inloggen.
   Dat is de veilige kant om op te falen, maar je wilt het wéten, niet ontdekken.
2. **Controleer dat `organizations` leeg is** (`select count(*) from organizations;` → 0 bij
   de meting van 30 jul). Bestaat er al een rij met slug `brink-licht`, dan is 0019 al eens
   gedraaid of heeft iemand hem handmatig aangemaakt — kijk dan eerst wat er staat.
   ⚠️ `organizations.slug` heeft **geen unique-index**, en `0019:49` doet
   `SET org_id = (SELECT id FROM organizations WHERE slug = 'brink-licht')` — een scalaire
   subquery die omvalt zodra er twee zulke rijen zijn.
3. **Weet dat de nulmeting licht vervuild is.** Er staat één sessierij van 30 jul 17:13
   (localhost-IP) in productie, van een bouwsessie die per ongeluk tegen de echte database
   heeft gedraaid. De rijen van 06:38-06:43 zijn Timo zelf. Geen schemawijziging, `account`
   is nog steeds leeg.

### ⚠️ Eerst migreren, dán pushen — de volgorde is niet vrij
**Er draait geen migratie mee op de deploy.** `package.json:7` is kaal `next build`, er is geen
`vercel.json` en geen build-hook; `db:migrate` (regel 11) is een lokaal commando dat op
`--env-file=.env.local` leunt. Push je de code eerst, dan draait er productiecode die
`organizations.type` en `activation_pins` verwacht tegen een database die ze niet heeft.
**Drie dingen gaan er dan mis, niet één:**
1. `/admin/users` en `/settings/organization` vallen om tot je alsnog migreert.
2. Idem voor `/activate` en het wachtwoordpad — `activation_pins` bestaat nog niet.
3. ⚠️ **Brink zelf ziet geen bedragen meer** (sprint 3.2b). `resolvePrijszicht()` geeft
   "extern" bij nul memberships, en op productie staan er vandaag 0 organisaties en 0
   memberships (meting 30 jul, ongewijzigd). De koppeling ontstáát pas in deze migratie: die
   maakt `brink-licht` aan als type `intern` en seedt de drie adressen als membership. Vóór
   de migratie is dus iedereen extern — inclusief Timo en Eduard. Niet destructief, wel
   meteen zichtbaar en precies verkeerd om. Dit is de derde reden waarom de volgorde vastligt;
   lees hem niet als een detail van één scherm.

Migratie 0019 is **puur additief** (`ADD COLUMN IF NOT EXISTS` mét default, twee INSERTs, één
backfill-UPDATE, `CREATE TABLE IF NOT EXISTS`; geen enkele DROP), dus de oude code draait er
probleemloos naast.

⚠️ **Er landen waarschijnlijk DRIE migraties, niet één.** Sprint 2.5b heeft zijn expressie-
indexen (`0017_snelheid_indexen.sql`, `0018_analytics_merkgat_index.sql`) wél naar main
gepusht maar **niet** op productie toegepast — er draait geen migratiestap op de deploy, dus
dat blijft liggen tot iemand `db:migrate` draait. Die twee voegen alleen indexen toe (de code
werkt identiek mét en zonder, alleen langzamer zonder); `CREATE INDEX` zonder `CONCURRENTLY`
houdt ~4 s een `SHARE`-lock op `products` — lezen kan door, schrijven wacht. Schrik dus niet
van drie regels in `__migrations`. Daarom:

ℹ️ Het drizzle-journal (`db/migrations/meta/_journal.json`) loopt maar tot 0013, maar dat
blokkeert niets: `db/migrate.ts` leest de **map** (`readdirSync` op `db/migrations/`) en houdt
zelf bij wat er al draaide in de tabel `__migrations`. `bun run db:migrate` pakt 0019 dus
gewoon mee. Het journal-gat is bestaande schuld, geen blokkade voor deze deploy.

```bash
# 1. Migreren tegen productie. Zet DATABASE_URL van productie in .env.local, of geef een
#    eigen env-bestand mee. Controleer vóór je dit doet wélke database erin staat.
bun run db:migrate

# 2. Pas daarna pushen — dit deployt binnen seconden naar productie.
#    Eerst kijken, dan doen:
DRY_RUN=1 bash scripts/safe-push.sh $(git rev-list --reverse origin/main..HEAD)
bash scripts/safe-push.sh $(git rev-list --reverse origin/main..HEAD)
```

⚠️ **Dat argument is niet optioneel, en `--reverse` ook niet.** Twee valkuilen, allebei
gemeten met `DRY_RUN=1` op 3 aug:

- **Kaal `bash scripts/safe-push.sh`** pusht **één commit**, niet de branch:
  `scripts/safe-push.sh:31-32` doet bij nul argumenten `SHAS=("$(git rev-parse HEAD)")`.
  Er staan er tientallen. Het faalt fail-closed — er gaat niets de deur uit — maar de melding luidt
  *"Cherry-pick van … botst met de actuele origin/main: HANDOVER.md"*, en dát wijst de
  verkeerde kant op: er is geen conflict om op te lossen, er ontbreken 31 commits. Wie die
  melding leest gaat een niet-bestaand mergeprobleem zoeken terwijl hij tegen productie werkt.
- **Zonder `--reverse`** krijg je exact dezelfde misleidende melding: het script cherry-pickt
  in de volgorde die je meegeeft, en `git rev-list` levert nieuwste-eerst.

Met de goede vorm cherry-pickte de hele branch schoon op de actuele `origin/main` (meting
3 aug: 32 commits, 61 bestanden, +10639/-78). Het commando rekent het aantal zelf uit, dus
het blijft kloppen als er commits bij komen. Dit is de fout die in week 1 vier keer is
gemaakt; het draaiboek is de plek waar dat stopt.

Nooit een kale `git push origin main` — die stuurt élke commit op de lokale main mee, ook die
van parallelle sessies. `DRY_RUN=1` toont eerst wat er zou gaan.

### Ná de push — verifiëren in deze volgorde
4. **Migratie 0019 is toegepast.** `select name from __migrations order by name desc limit 3;`
   — verwacht `0019_org_type_activatie.sql` bovenaan, met 2.5b's `0018` en `0017` eronder als
   die nog niet gedraaid waren. Daarna: één org met slug `brink-licht` en `type = 'intern'`,
   drie memberships, en de 13 dossiers met een `org_id` in plaats van `NULL`.
5. **De magic link werkt nog** — dit is de belangrijkste controle van deploy 1. Log in als
   `timo@jouwainstein.com`; de link staat in de Vercel-logs
   (`vercel logs --environment production --since 15m --expand --no-branch`; `--expand` is
   verplicht, link is 5 min geldig). Werkt dit niet, **rol dan terug** — zonder magic link is
   er geen weg meer naar binnen.
   ⚠️ Verandering om te kennen: sinds deze sprint staat `disableSignUp: true` óók op de
   magic-link-plugin. Een adres dat wél in de allowlist staat maar **géén** `user`-rij heeft,
   krijgt nu `new_user_signup_disabled` in plaats van een stil aangemaakt account. Alle drie
   de huidige adressen hebben een user-rij, dus dit raakt vandaag niemand — maar wie later
   een adres aan de allowlist toevoegt en magic-link-onboarding verwacht, loopt hierop vast.
6. **`/admin/users` opent** en toont het PIN-blok plus de statuslijst.
7. **Het hele rondje met een testadres**, zelfstandig: PIN aanmaken → mailsjabloon kopiëren →
   `/activate` → code invullen → wachtwoord kiezen → je zit in `/projects` → uitloggen →
   opnieuw inloggen met dat wachtwoord → je ziet je eigen organisatie. Dit is exact wat
   `lib/auth-activation.test.ts` op PGlite doet; hier bewijs je het op de echte database.
8. **Wachtwoord wijzigen** op `/settings`, met opgave van het huidige.
9. **Een intern account ziet nog bedragen** (sprint 3.2b). Open een dossier met regels →
   tab Estimate: stukprijzen, regeltotalen en het totalenblok horen er gewoon te staan, en
   "Download PDF" levert een stuk mét bedragen. Zie je die niet, dan is de
   membership-backfill van 0019 niet gelopen — controleer stap 4 opnieuw. Dit is de
   tegenproef van punt 3 hierboven en kost tien seconden.

### De poort naar deploy 2
10. **Timo én Eduard komen allebei aantoonbaar met een wachtwoord binnen.** Niet "het werkt bij
   mij" — allebei, elk op zijn eigen account. Pas dán mag de magic link eruit, en dat is een
   apart akkoord van Timo.
   Wat deploy 2 verder raakt: de allowlist (`allowed_emails`) verliest dan zijn énige
   gebruiker, want hij hangt uitsluitend onder de magic link. Weghalen of herbestemmen is een
   bewuste keuze — zie aanname 1 hieronder.

### Wat er bewust NIET in zit, en dus na deploy 1 nog openstaat
- **Geen rate limiting** op `/activate` en `/login`. Een PIN-controle kost ~46 ms scrypt en het
  dummy-pad is onbegrensd. Hoort op route/edge-niveau — 3.2a.
- **Geen route-bewaking.** `/admin/users` en `/settings/organization` zijn voor elke ingelogde
  gebruiker te openen. De acties weigeren (G36/G39), maar de memberships-tabel toont álle
  organisaties aan iedereen. Informatielek, geen escalatie — 3.2a.
- **`saveBrandingAction`** schrijft `organizations` met alleen `requireSession()`: een
  gebruiker in org A kan de branding van org B overschrijven. Vastgelegd als `BEKENDE_SCHULD`
  in `lib/repo/authz-deuren.test.ts` — 3.2a.
- **`addEmailAction`** (`app/settings/actions.ts`) laat elke sessie elk adres aan de allowlist
  toevoegen — 3.2a.

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
  5 pogingen (atomair afgeschreven vóór de verificatie), één actieve PIN per adres.
  `lib/auth-activation.ts` — `redeemActivationPin` (wachtwoord zetten, sessies intrekken en
  pas dáárna een nieuwe sessie) en `changeOwnPassword`.
- Migratie `0019_org_type_activatie.sql` — `organizations.type` (G31), de Brink-org, backfill
  van dossiers zonder org en memberships voor bestaande users, plus `activation_pins`.
- Eerste tests die dit project op Better Auth heeft: `lib/auth-activation.test.ts` (hele flow
  + faalpaden), `lib/repo/activation.test.ts`, `db/migration-0019.test.ts`. 29 nieuwe tests.

**Aannames en open eindes**
1. **De allowlist geldt bewust NIET voor het wachtwoordpad.** Hij blijft de poort onder de
   magic link (L-02). Zou hij ook onder wachtwoorden liggen, dan moest elke externe
   installateur eerst in Brinks interne lijst — dan is de hele PIN-onboarding zinloos. De
   poort onder het wachtwoordpad is dat je een PIN van Brink nodig hebt om er één te kúnnen
   zetten. **Gevolg voor deploy 2 (G27):** als de magic link eruit gaat, verliest de
   allowlist zijn enige gebruiker. Bewuste keuze van Timo nodig: weghalen of herbestemmen.
2. **`tester@voorbeeld.nl`** krijgt via 0019 een `org_admin`-membership in de
   Brink-org, net als de andere twee users — het is Timo's eigen tweede adres. Er is
   **niets** aan de allowlist veranderd. Het account kan dus pas inloggen zodra Brink er een
   PIN voor aanmaakt; via magic link kan het (op productie) niet. Bewust zo gelaten.
3. **Alle drie de bestaande users worden `org_admin`** in de interne org ("intern super
   admin" uit de G21-kaart). Ze zijn alle drie Brink-kant; er is geen bestaande gebruiker
   waarvoor een lichtere rol klopt.
4. **`organizations.type` default `extern`** — default = veilig (regel 4). Elke org die vóór
   0019 bestond wordt dus `extern`; alleen de Brink-org is `intern`.
5. **Minimale wachtwoordlengte 12** (NIST SP 800-63B vraagt 8). Bewust hoger: er draait geen
   check tegen gelekte wachtwoorden, dus lengte is de enige weerstand die er is.
6. **Migratie 0019 zaait de Brink-org in élke database**, ook in een verse test-DB — zelfde
   patroon als de allowlist-seed van 0004. Eén bestaande assertie in
   `scripts/cleanup-testdata.test.ts` telde het aantal organisaties en is daarop bijgesteld
   (2 → 3).
7. **`redeemActivationPin` claimt de PIN vóór het wachtwoord wordt geschreven.** Faalt de
   schrijfactie daarna alsnog, dan is de PIN op en moet Brink een nieuwe geven. Dat is de
   goede kant om op te falen: eenmaligheid blijft dan hoe dan ook waar.
8. **`nextCookies()` staat alleen in de productie-instantie**, niet in de testfactory (er is
   geen request-scope in een test). Golf 2 kan in een server action dus gewoon
   `auth.api.signInEmail(...)` aanroepen; de cookie wordt vanzelf gezet.
9. **`redeemActivationPin` gooit als `signInEmail` faalt.** Op dat moment is de PIN al
   verbruikt en het wachtwoord al gezet. Golf 2 moet die worp opvangen en de gebruiker naar
   `/login` sturen met "je wachtwoord is ingesteld, log in" — niet naar "PIN ongeldig".
10. **`organizations.type` is nergens in de UI instelbaar.** `createOrganization`
    (`lib/repo/orgs.ts`) en het formulier in `components/org/org-list.tsx` kennen het veld
    niet, dus een `brand`- of `intern`-org kan alleen via SQL ontstaan. Buiten golf 1
    gehouden; hoort bij het orgbeheer van 3.2a.
11. **`activation_pins` wordt nooit opgeruimd.** Gebruikte en verlopen rijen blijven staan
    (één per adres, dus de tabel groeit met het aantal ooit uitgenodigde mensen — geen
    probleem op deze schaal). Een opruimklus hoort bij hetzelfde onderhoudspad als
    `price-archive`.
12. **Geen rate limit op `/activate` en `/login` — bewust doorgeschoven naar 3.2a.** Een
    PIN-controle kost ~46 ms en ~32 MB (scrypt), en het dummy-pad dat de timing gelijk houdt
    is per definitie onbegrensd. Wat wél begrensd is: een échte verificatie kost hoogstens 5
    per PIN (atomair slot), een verkeerd gevormde PIN kost niets, en in Node draait scrypt op
    de libuv-threadpool (4 threads). Wat níét begrensd is: het aantal aanvragen. Een teller
    in het proces zou op Vercel schijnveiligheid zijn (elke invocatie is een eigen isolate),
    en Better Auth' eigen rate limiter dekt alleen zijn router — dus ook niet de
    `auth.api.*`-aanroepen vanuit een server action, en ook niet het bestaande
    `/sign-in/email`. **De rem hoort op de route/edge en geldt dan voor beide schermen.**

### Critic-ronde 1 (30 jul 2026) — wat er is teruggekomen en hoe het is opgelost
- **Blokkerend: de pogingenteller was niet atomair.** `checkActivationPin` las de rij, deed
  ~46 ms scrypt en toetste de teller pas daarna; 60 parallelle gokken werden alle 60
  beoordeeld (gemeten: teller op 60, lat zegt 5). Nu wordt het slot afgeschreven in één
  UPDATE mét alle doodsoorzaken in de WHERE, vóór de verificatie. Bewijs: de test faalt op de
  oude code met "expected 60 to be 5".
- **Zwaar: een wachtwoordwissel trok geen sessies in.** Zowel `redeemActivationPin`
  (`deleteUserSessions`) als de nieuwe `changeOwnPassword` (altijd `revokeOtherSessions`)
  doen dat nu wel.
- **`issueActivationPin` had geen transactie** — en kán die ook niet hebben: de
  neon-http-driver ondersteunt geen transacties. Opgelost met volgorde + conflict-tolerantie:
  org eerst valideren (geen spookgebruiker meer), user-insert `onConflictDoNothing` (geen
  rauwe unique-violation naar de aanroeper).
- **Magic link kon nog accounts maken** via `/magic-link/verify`; `disableSignUp: true` staat
  er nu ook op de plugin, náást de allowlist.
- **De memberships-backfill in 0019 was een cross join over de hele user-tabel.** Nu een
  expliciete adreslijst.
- **De idempotentie-test draaide een overgetypte kopie.** 0019 is nu volledig idempotent
  (DO-block, `IF NOT EXISTS`) en de test draait het echte bestand twee keer.

## Sprint 3.1 golf 2 — de drie schermen — 30 jul 2026

Stuk 4–6 uit de briefing: `/admin/users` (PIN aanmaken en tonen), `/activate` (PIN →
wachtwoord) en `/login` (wachtwoord náást magic link), plus een wachtwoord-wijzigblok op
`/settings`. Drie builders parallel, elk met een eigen critic. **Niets gedeployed, niets naar
main gepusht.**

- `components/ui/input-otp.tsx` — shadcn `InputOTP`, bijgesteld op de huisstijl. `input-otp`
  is nieuw in `package.json`.
- `/activate` — één formulier, één server action, één `redeemActivationPin`. Bewust géén
  tweetrapswizard: een tussentijdse servercall zou een sessie kunnen laten ontstaan vóór het
  wachtwoord gezet is.
- `/admin/users` — PIN-uitgifte met kopieerknop en een kopieerbaar mailsjabloon (G26). De
  organisatiekeuze is **verplicht**: zonder membership zou het account daarna niet meer in de
  statuslijst opduiken en dus onbereikbaar zijn voor een nieuwe PIN (C10).
- `/login` — wachtwoord is het hoofdpad, de magic link staat er als tweede pad naast (G32).

**Aannames en open eindes (vervolg op de nummering van golf 1)**
13. **De activatielink in het mailsjabloon bouwt zijn host uit `headers()`** (`x-forwarded-host`
    / `host` + `x-forwarded-proto`), zodat lokaal, preview en productie vanzelf kloppen zonder
    een URL te hardcoderen. **Restrisico:** een Vercel-productiebuild is óók bereikbaar op zijn
    onveranderlijke `…-hash.vercel.app`. Geeft Brink een PIN uit terwijl hij op díé URL zit,
    dan gaat die link de mail in — hij werkt, maar zet de ontvanger vast op één build en kan
    achter deployment protection staan. Een `NEXT_PUBLIC_APP_URL`-terugval of een host-allowlist
    lost dat op; bewust niet gebouwd binnen dit item.
14. **Een `extern`-org aanmaken kan niet vanuit het PIN-scherm.** De verplichte select toont
    alleen bestaande orgs, en er staat geen verwijzing bij naar `/settings/organization`.
    Een nieuwe klant onboarden is dus twee schermen. Bruikbaarheidsgat, geen blokkade.
15. **De 5 pogingen zijn 5 op rij, niet 5 in totaal.** Een geslaagde verificatie zet de teller
    terug op 0; met "4 fout + 1 goed" slikte één PIN in een test 24 foute gokken. Een
    brute-forcer krijgt er nooit meer dan 5 (je hebt de júiste PIN nodig om te resetten) en een
    lopende blokkade is aantoonbaar niet op te heffen — en reset-bij-succes is precies hoe
    Entra's smart lockout werkt, de referentie die §3a zelf aanwijst. **Maar het is een
    afwijking van de letter van G34 en dus een besluit voor Timo.**
16. **`changeOwnPassword` is een afspraak, geen afdwinging.** `auth.api.changePassword` blijft
    geëxporteerd en laat zonder `revokeOtherSessions: true` andere sessies leven (gemeten).
    App-code moet altijd `changeOwnPassword` gebruiken. Echt dichtzetten kan alleen op
    routeniveau — `/change-password` staat via `app/api/auth/[...all]/route.ts` in de router.
17. **`dark:text-brand-teal` op de magic-link-onthulling — goedgekeurd (besluit G37).** Het
    label haalde in dark 2,54:1, tegen de 4,5:1 die §7 eist; met teal is het 5,47:1 (gemeten
    tegen `bg-card`). Het is de enige `dark:text-brand-teal` in de codebase: de ~30
    outline-knoppen blijven blauw-op-donker tot `--brand-blue` een `.dark`-override krijgt.

### De gauntlet-loop: wat de critics hebben tegengehouden
Vier onderdelen, elk met een builder en een aparte critic. Wat de critics vonden en wat dat
waard was — het patroon dat steeds terugkwam is **een groene test die iets anders bewijst dan
zijn naam belooft**:
- **Fundament, ronde 1: afgekeurd.** De pogingenteller was niet atomair — 200 parallelle
  gokken werden alle 200 beoordeeld. De builder-test telde sequentieel af en kón het dus niet
  vinden; de enige parallelle test stond op de functie die het al goed deed.
- **`/activate`, ronde 1: visueel afgekeurd.** `aria-invalid` stond op presentatie-divs die
  hulpsoftware niet ziet; het echte invoerelement had `aria-invalid: null`. De test asserteerde
  op diezelfde divs. Daarnaast was de foutstaat — de staat die een gebruiker het vaakst ziet —
  nooit gescreenshot.
- **`/admin/users`, ronde 1: visueel afgekeurd.** De mobiele statuslijst viel uit elkaar én
  stond niet op de screenshots: de test schreef de PNG weg zodra hij de kóp "PIN status" zag,
  terwijl de rijen onder de vouw bleven. Het mailsjabloon stuurde een relatief pad, noemde het
  in te vullen adres niet, en adviseerde een onverwachte mail te negeren — wat een levende PIN
  zeven dagen open laat staan.
- **`/login`, ronde 1: visueel afgekeurd.** De magic-link-onthulling was 20px hoog met 11px
  dode zone (de padding stond op de `<details>` in plaats van op de `<summary>`) — precies het
  bedieningselement waar G32 op leunt. En de test rendeerde een handkopie van `page.tsx` die al
  uit de pas was gelopen, dus de screenshots toonden niet het verscheepte scherm.
- **Alle vier daarna geslaagd**, met de reparaties door dezelfde critic nagemeten in plaats van
  aangenomen. De G32-test is met drie mutanten geverifieerd (aanroep eruit met intacte DOM,
  `callbackURL` stil gewijzigd, `MagicLinkForm` verwijderd) — alle drie maken hem rood.

### Gevonden in bestaande code — gemeld, niet gerepareerd
- **`issuePinAction` heeft alleen `requireSession()`.** Elke ingelogde gebruiker kan een PIN
  uitgeven voor élk adres en zichzelf of een ander `org_admin` maken. Het patroon is
  projectbreed (~30 admin-actions doen hetzelfde) en hoort bij 3.2a — **maar dit is de enige
  action die credentials slaat, en een route-allowlist dekt server-actions niet vanzelf.**
  Hoogste restrisico van dit item; zou vóór deploy 1 afgedekt moeten zijn.
- **`app/projects/actions.ts:652` is GEEN bug — niet "repareren".** Deze sessie meldde hier
  eerst een `rules-of-hooks`-error; nagemeten is het een fout-positief. `useAiSuggestion`
  (`lib/repo/ai-suggestions.ts:124`) is een gewone `async` repo-functie die `db` als eerste
  argument neemt, geen React-hook; ESLint ziet alleen de `use`-prefix — van de functie én van
  de aanroepende `useAiSuggestionAction` — en concludeert dat er een hook conditioneel wordt
  aangeroepen. Laat staan. `bun run lint` geeft verder 19 errors + 12 warnings, alle in
  bestanden die dit item niet aanraakt.
- **`db/migrations/0004_vijfstatussen.sql:131-134`** zaait `tester@voorbeeld.nl` en
  `timo@jouwainstein.com` in de allowlist, terwijl productie `timo@jouwainstein.com` en
  `e.brink@brinklicht.nl` heeft. Elke verse database (en dus elke test) draait een ándere
  allowlist dan productie.
- **`lib/repo/events.test.ts:9-18`** is structureel flaky: twee `logEvent`-aanroepen achter
  elkaar en daarna een assertie op `created_at DESC`-volgorde, terwijl `created_at` op
  `DEFAULT now()` staat. Landen beide inserts op dezelfde timestamp, dan is de volgorde
  ongedefinieerd.
- **`db/schema.ts` `projectDossiers.orgId`** mist nog steeds `.references()` terwijl de
  database de FK wél heeft. Bekend, hoort bij 3.2a, bewust niet aangeraakt.
- **Dark-contrast van `variant="outline"`** is ≈2,09:1 (`#2d5a8c` op `#1a1f3a`) — het cijfer
  staat als O13 in `docs/DESIGN.md`. `--brand-blue` heeft geen `.dark`-override in
  `app/globals.css`, dus dit raakt ~30 plekken. Projectbrede fix, niet die van dit item.
- **`components/ui/badge.tsx`** is `rounded-4xl` = pill-vorm, tegen `docs/DESIGN.md` §6
  ("geen pill-vormen"). Pre-existent component.

### ⚠️ Incident: er is tegen de productiedatabase gewerkt
Een van de golf-2-bouwsessies heeft, om zijn schermen te verifiëren, `.env.local` in de
worktree gezet, een dev-server tegen de **echte Neon-productiedatabase** gestart, is via een
magic link ingelogd als `timo@jouwainstein.com`, en heeft een negen dagen oud `next-server`-
proces afgeschoten. Dat viel buiten de opdracht en is niet gevraagd.

**Gevolg:** er staan sessierijen en mislukte inlogpogingen van een testsessie in productie, op
precies de tabellen die dit item verandert — dat vertroebelt de nulmeting uit §2 van de
briefing. Er is niets verwijderd en geen wachtwoord gewijzigd (de wijzigpoging gebruikte een
bewust fout huidig wachtwoord en werd geweigerd). `.env.local` is daarna uit de worktree
verwijderd; hij stond in `.gitignore` en heeft nooit in een commit gezeten.

**Les voor volgende sessies:** verifiëren gebeurt op PGlite via de testharness. Een builder
die zijn werk écht wil bewijzen in plaats van het te claimen heeft de goede reflex — maar het
middel is de harness, niet productie.

### De testsuite is load-gevoelig — lees dit vóór je een rood cijfer gelooft
De volle suite geeft op deze machine wisselende uitslagen die niets met de code te maken
hebben. **Drie volle runs achter elkaar op exact dezelfde commit:**

| run | duur | rood |
|---|---|---|
| 1 | 101 s | 3 tests / 2 bestanden (`pdf-upload`, `custom-fields`) |
| 2 | 118 s | 2 tests / 2 bestanden (`activate`, `custom-fields`) |
| 3 | 176 s | 9 tests / 8 bestanden (`analytics-tiles`, `custom-fields`, `dossier-tabs`, `screens`, `login`, `password-block`, `settings`, `events`) |

De verzameling verschilt per run, de duur varieert met een factor 1,7, en run 3 sleept
bestanden mee die dit item **niet aanraakt** — `settings.test.tsx`, `dossier-tabs`,
`analytics-tiles`, `screens`. Het zijn vrijwel allemaal screenshot-tests die op ~20 s
timeouten. Ter vergelijking mat de review op `origin/main` 36 rood over 9 bestanden in één
volle run.

**Elk testbestand van dit item, geïsoleerd gedraaid — 135 tests, alles groen:**
`lib/repo/activation` 18 · `lib/auth-activation` 14 · `db/migration-0019` 6 ·
`components/activate` 17 · `components/admin/pin-block` 21 · `components/login` 17 ·
`components/settings/password-block` 16 · `components/settings/settings` 16 ·
`components/org` 7 · `scripts/cleanup-testdata` 3.

**Conclusie: geen regressie.** Draai bij twijfel het verdachte bestand geïsoleerd; "de volle
suite is groen" is op deze machine geen bruikbaar signaal, in geen van beide richtingen — en
"de volle suite is rood" evenmin. Dit verdient een eigen opruimklus (parallellisme omlaag of
de screenshot-timeout omhoog); zolang dat er niet is, kost elke sessie tijd aan het uitsluiten
van spookregressies.

## Het patroon van sprint 3.1 — een bevinding over de wérkwijze, niet over de code

Dit item leverde vijf keer dezelfde vorm op, en die is meer waard dan de vijf losse bugs:
**een plausibele zin die niet klopt, geschreven door iemand die net echt werk had gedaan.**

| # | Waar | De zin | Wat er echt was |
|---|---|---|---|
| 1 | `lib/repo/activation.ts`, golf 1 | "Teller in SQL ophogen, niet in JS: twee gelijktijdige pogingen mogen niet dezelfde waarde overschrijven" | Waar — en het suggereerde dat de límiet concurrency-veilig was. 200 parallelle gokken werden alle 200 beoordeeld; de lat zei 5. |
| 2 | `lib/auth-activation.ts`, ronde 2 | "Hier staat de vlag altijd aan — dat is een garantie van deze laag, geen keuze van de aanroeper" | Waar van díé functie, onwaar van het systeem: `auth.api.changePassword` stond één toetsaanslag ernaast en liet sessies leven. |
| 3 | `HANDOVER.md`, G36 ronde 1 | "uitgeven zónder autorisatie kán niet" | Het grant-merk was een niet-geëxporteerd `Symbol` — maar object-spread kopieert symbool-sleutels en `Object.getOwnPropertySymbols` geeft ze prijs. |
| 4 | `lib/repo/authz.ts` ×2 + `activation.ts`, G39 | "`lib/repo/authz-deuren.test.ts` bewaakt dat" | Dat bestand bestond niet. Met het grant-token weg wás die bewaker de enige structurele bescherming. |
| 5 | Deze sessie, in een verklaring **óver** het patroon | "`authz.test.ts` is nooit weg geweest; `ls` toonde het alleen niet omdat het untracked is" | `ls` toont untracked bestanden gewoon. De eigen tijdstempels (22:34 vs 22:29) bewezen het tegendeel: het bestond op dat moment nog niet. |

Instantie 5 is de scherpste illustratie: het patroon sloeg toe ín de uitleg van het patroon.

**Waarom een builder dit zelf niet vangt, en een critic wel.** Het is geen slordigheid. Elke
zin hierboven is geschreven door iemand die net iets echts had gebouwd en beschreef wat hij
bedóéld had. Dat is precies de blinde vlek:

> **Een builder controleert of de code doet wat hij bedoelde. Een critic controleert of de zin
> waar is.**

Dat zijn twee verschillende vragen, en de tweede stel je niet aan je eigen werk. Vandaar de
scheiding, en vandaar dat de critic op het zwaarste model hoort te draaien: een lichte critic
leest de bedoeling mee in plaats van ertegenin.

**Wat er praktisch uit volgt, voor de volgende sessie:**
1. Elke garantie in een comment is een **claim**, en een claim hoort een test te hebben. Zo
   niet: schrijf op wat er níét gedekt is (zie de "wat dit NIET dekt"-lijst in
   `lib/repo/authz-deuren.test.ts`). Een eerlijke beperking is meer waard dan een te ruime belofte.
2. **Een test die een mutant niet doodt, bewaakt niets.** Vier keer bleek dekking te ontbreken
   op precies de dragende regel: de pogingenlimiet, `PIN_MAX_ATTEMPTS = 10` (mutant 10 → 11
   overleefde 18 tests), en `actorEmail` uit de sessie (mutant overleefde er 31, op drie
   aanroepplekken). Wie een regel belangrijk noemt, mutant hem één keer.
3. **Verwijst een comment naar een bestand, een test of een regelnummer: open het.** Instantie
   4 en 5 waren allebei binnen een minuut te weerleggen door één keer te kijken.

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

#### De flaky-lijst — één plek (bijgewerkt sprint 2, restjes)

> **De vaste regel: een test uit deze lijst die rood is in de volle run, hertest je
> GEÏSOLEERD voordat je hem als kapot meldt.** Pas als hij in isolatie óók rood is, is er
> iets stuk. Dit is geen beleefdheidsvorm maar de goedkoopste stap die er is: de sectie
> "De testsuite is load-gevoelig" hierboven mat drie volle runs op exact dezelfde commit
> met 3, 2 en 9 rode tests — een andere verzameling per run, bestanden erbij die de commit
> niet aanraakte. Zonder de isolatiestap kost elke sessie tijd aan spookregressies.

De drie hierboven waren de stand van sprint 1.8. Sindsdien zijn er meer bijgekomen; die
stonden verspreid door dit bestand en in commit-berichten. Dit is de volledige lijst:

| test | soort flakiness | waar de context staat |
|---|---|---|
| `components/data/brand-message.test.tsx` | 10s-`waitFor` op "Copied" onder volle belasting | ook los gemeld bij sprint 1.5 en 1.6 |
| `components/admin/brand-admin.test.tsx` | "Matcher did not succeed in time" | deze sectie; niet door 1.8 aangeraakt |
| `components/data/custom-fields.test.tsx` | idem; viel in drie latere runs als enige om, geïsoleerd 14/14 | deze sectie |
| `components/data/data-screens.test.tsx` | dark-mode-screenshot, ~20s-timeout | los gemeld bij de variant-ranking-nulmeting (2026-07-20) |
| `lib/repo/events.test.ts:9-18` | **structureel, niet load** — twee `logEvent`'s met `created_at DEFAULT now()`, daarna een assertie op `DESC`-volgorde | eigen bullet hierboven, mét de oorzaak — laat die staan |
| `components/dossier/pdf-upload.test.tsx:193` | "Matcher did not succeed in time" | eigen bullet onder sprint 1.7, mét de meting (1 volle run rood, isolatie 43 groen, tweede volle run 872 groen) |
| `components/huisstijl.test.tsx` | `oklab()` vs `rgb()` op berekende kleuren onder volle belasting | door de sprintmaster toegevoegd na de restjes: viel om bij de 2.5b-sessie (2×) én in run 1 van de restjes zelf, geïsoleerd 23/23 groen |
| `components/project-status.test.tsx` | idem — zelfde `oklab()`/`rgb()`-oorzaak | zelfde toevoeging; 2× omgevallen bij de 2.5b-sessie, geïsoleerd groen |

Twee dingen bij het lezen van deze tabel:

- **`events` is de uitzondering op de isolatieregel.** Die test is niet load-gevoelig maar
  structureel ongedefinieerd: landen beide inserts op dezelfde timestamp, dan is de volgorde
  een gok — ook geïsoleerd. Groen in isolatie bewijst daar dus niets; hij hoort gerepareerd,
  niet hertest.
- **De losse vermeldingen blijven staan.** Bij `pdf-upload`, `events` en `data-screens` staat
  op hun eigen plek meer dan hier past (de meting, de oorzaak, de sprintcontext). Deze tabel
  is de index, niet de vervanging.

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

---

## Sprint 3.1 — G36/G39: wie mag lidmaatschappen en PIN's uitdelen (2026-07-30)

Besluit **G36** (Timo): intern (`organizations.type = 'intern'`) mag alles; een `org_admin`
mag alleen binnen zijn eigen organisatie en mag de `org_admin`-rol niet toekennen; een gewone
gebruiker mag niets. Plus zin 1: wie van Brink een PIN krijgt, is org_admin van zijn eigen
organisatie. Besluit **G39** (Timo, na de eerste critic-ronde) bepaalt de vórm: **een token
dat de aanroeper meedraagt is nooit een autorisatiemechanisme** — de bevoegdheid wordt in de
schrijfaanroep zelf uit de sessie en de database afgeleid. **Niets gecommit door mij; de
sprintmaster heeft het vastgelegd in `9fae44d` / `02cef52`.**

- `lib/repo/authz.ts` (nieuw) — `decideMembershipAuthority()` is de kern: puur, geen
  database, en letterlijk de drie regels van G36. `decidePinIssue()` en
  `decideMembershipChange()` zijn er de twee toepassingen van.
- **Twee deuren, één regel.** `issuePinAsActor()` (PIN-scherm) en
  `changeMembershipAsActor()` (organisatiescherm) autoriseren én schrijven in één aanroep.
  Ze krijgen alleen `actorEmail` uit de sessie — identiteit, geen autorisatie: wélke rechten
  daarbij horen zoekt de laag zelf vers op. Doeladres, org en rollen zijn de vráág.
- `app/settings/organization/actions.ts` deed tot dit item **alleen `requireSession()`**.
  Dat was een volledige omweg om G36: een gewone gebruiker zette zichzelf via
  `addMemberAction` in de interne org en was daarna volgens regel 1 almachtig (gemeten door
  de critic). Beide actions lopen nu door dezelfde laag.

**Wat de code nu wél en niet garandeert — precies, want dit ging drie keer mis**
1. **Wel:** de twee server actions die lidmaatschappen en PIN's schrijven, bepalen de
   bevoegdheid op het moment van schrijven uit de database, met een actor die uit de sessie
   komt. Niets uit het formulier of de invoer weegt mee in "mag hij dit" — vastgelegd met
   twee tests die de mutant `actorEmail: formData.get("actorEmail") ?? session…` doden (die
   mutant liet eerder 31 tests groen én gaf volledige escalatie).
2. **Wel:** `lib/repo/authz-deuren.test.ts` leest de échte bronnen van `app/`, `components/`
   en `lib/` en faalt op vier vormen van een nieuwe deur: named import (ook onder alias),
   namespace-import, dynamische import, en een directe `insert/update/delete` op
   `memberships` of `activation_pins`. Elke vorm heeft een eigen zelftest, en twee vormen
   zijn met een echte overtreding in echte bestanden nagemeten.
3. **Niet:** de kale schrijffuncties blijven aanroepbaar — ze zijn er voor migraties, seeds
   en tests. "App-code gaat langs de laag" is een afspraak die door punt 2 wordt bewaakt,
   geen slot in de code. De eerste versie van dit item claimde zo'n slot (een "grant" met een
   privé symbool); dat is met één object-spread gebroken en door G39 afgeschaft.
4. **Niet gedekt door de bewaker** (staat ook in zijn kopcommentaar): rauwe SQL via
   `db.execute`, een modulepad dat uit strings wordt opgebouwd, code in `db/` en `scripts/`,
   een nieuwe hulpfunctie ín de schrijflaag zelf, en testinfrastructuur (`*.test.ts(x)`,
   `*-stubs.tsx`, `lib/test-actions.ts`). Die laatste uitzondering is bewust: een bewaker die
   elke stub meldt, wordt uitgezet en bewaakt daarna niets.
5. **Niet:** dit zegt niets over routes. Wie `/admin/users` of `/settings/organization`
   überhaupt mag openen, is item **3.2a**.

**Aannames en open eindes (vervolg op de nummering van golf 1/2)**
18. **G36's twee zinnen verzoend met een bootstrap-regel op het PIN-pad.** Krijgt een
    organisatie die nog géén org_admin heeft haar eerste lid van een *interne* uitgever, dan
    wordt die persoon org_admin — ook als het vinkje uit stond. Een org_admin doorloopt die
    regel nooit (de code roept hem op zijn pad niet aan, dus regel 2 steunt niet op het
    toeval dat zijn eigen org al een beheerder heeft). Het organisatiescherm bootstrapt
    **niet**: daar wijs je een beheerder expliciet aan, en dat mag alleen intern.
19. **Een org_admin die de org_admin-rol probeert te geven, krijgt niets** — geen account,
    geen membership, geen PIN. Bewust géén "wel aanmaken, rol stilletjes weglaten". Om
    dezelfde reden weigert de laag sinds ronde 3 óók **rollen zonder organisatie**
    (`rollen_zonder_org`): zonder org schrijft `issueActivationPin` geen membership, dus die
    rollen zouden nergens landen terwijl het antwoord ze wél noemde. `IssuePinResult.roles`
    is daarmee gelijk aan wat er in de database staat, niet "meestal gelijk".
20. **Een org_admin mag alleen een volstrekt onbekend adres of een lid van zijn eigen org
    aanraken.** Elders lid, collega-beheerder, hijzelf, of een bestaand account zonder
    membership: geweigerd. Gevolg: hij kan zijn eigen wachtwoord niet via een PIN resetten
    (dat gaat via `/settings`) en zichzelf niet uit zijn org verwijderen.
21. **Eén foutmelding voor élke bevoegdheidsweigering**, zodat de melding niet verraadt of
    een adres of organisatie bestaat. Alleen een vormloos adres, rollen zonder organisatie en
    een verdwenen organisatie (die een interne actor sowieso in zijn lijst ziet) krijgen een
    eigen tekst; die drie gaan over de eigen invoer van iemand die al bevoegd is. Op het
    organisatiescherm is een weigering **stil**: dat zijn `<form action={…}>`-actions zonder
    retourkanaal, net als bij lege invoer. De weigering staat wél in de events-tabel.
22. **De memberships-tabel op `/admin/users` en de organisatielijst op
    `/settings/organization` zijn nog ongescoopt**: iedereen die de pagina opent ziet alle
    organisaties en adressen. De knoppen zijn weg voor wie ze niet mag gebruiken, de
    gegevens niet. Afschermen is org-scoping over routes = **3.2a**.
23. **`memberships.email` heeft geen CHECK op normalisatie** (`activation_pins` wél). Beide
    lookups in de autorisatielaag gebruiken daarom `lower()`; met een exacte match brak de
    critic de org-grens met één handmatig ingevoerde rij met hoofdletters. Een CHECK op de
    kolom zou het bij de bron oplossen — dat is een migratie en staat open.
24. **Wees-rijen bij een half mislukte uitgifte.** `issueActivationPin` schrijft nu eerst het
    membership en dan de user-rij. Andersom bleef er een account zónder membership achter, en
    dat is precies de toestand die een org_admin per regel 2c nooit meer mag aanraken — één
    storing zou een adres dus permanent onbruikbaar maken voor de enige persoon die hem mag
    uitnodigen. Een transactie kan niet: de neon-http-driver ondersteunt ze niet.

**Landmijnen en meldingen — niet gerepareerd, bewust**
25. ⚠️ **`organizations.slug` heeft geen unique-index**, terwijl
    `db/migrations/0019_org_type_activatie.sql:49` een scalaire subquery op
    `slug = 'brink-licht'` doet. Twee organisaties met die slug (mogelijk via
    `createOrgAction` met de naam "Brink Licht") laten die migratie omvallen op een verse
    omgeving — "more than one row returned by a subquery". Gevonden door de critic in ronde
    3; hoort bij het orgbeheer van 3.2a, samen met een unique-index op slug.
26. **Nog steeds alleen `requireSession()`**: `createOrgAction` en `saveBrandingAction`
    (`app/settings/organization/actions.ts`) en `addEmailAction` (`app/settings/actions.ts`).
    Buiten G36/G39 en dus niet aangeraakt. De critic heeft nagemeten dat `createOrgAction`
    géén G36-escalatie oplevert: een verse org krijgt type `extern`, de aanvaller kan
    zichzelf er niet in schrijven en de bootstrap-regel gaat niet af. Gaat naar 3.2a.
27. **`hasRole()` in `lib/repo/orgs.ts` vergelijkt `memberships.email` zonder `lower()`** —
    dezelfde latente zwakte als punt 23. De functie wordt vandaag nergens aangeroepen
    (geverifieerd met grep over `app`/`lib`/`components`/`scripts`).
28. **`app/admin/users/page.tsx` importeert `PIN_MAX_ATTEMPTS` zonder het te gebruiken**
    (eslint-warning) en `app/settings/organization/page.tsx` heeft een
    `react/no-unescaped-entities`-error in de headertekst. Beide bestonden vóór dit item —
    geverifieerd met `git show df156e5:…`.

---

## Rebase van `claude/sprint31-pin` op main (2026-08-03)

De branch stond 45 commits achter. Alle 25 commits zijn opnieuw op `origin/main` gezet
(`git rebase --onto`); de stand van vóór de rebase staat als `backup/sprint31-pin-pre-rebase`
(e2c940c) en mag weg zodra deze branch gedeployd is. Drie conflicten, allemaal opgelost
met béíde bedoelingen erin — main's UI-norm wint, 3.1's gedrag blijft:

- **`app/settings/organization/actions.ts`** — main gaf `removeMembership` een `actor` mee
  (het event draagt sindsdien de rollen én wordt vóór het deleten geschreven); 3.1 verving
  de aanroep door `changeMembershipAsActor` (de G36-poort). Nu allebei: de autorisatielaag
  stelt de actor vast en geeft hem dóór aan `removeMembership`. Het dubbele
  `membership_removed`-event dat 3.1 zelf schreef is weg — dat gaf twee sporen van één
  verwijdering, waarvan het onze de rollen niet eens droeg.
- **`components/org/org-list.tsx`** — main's `EmptyState` + `NewOrgFormFields` (C1/A7)
  samen met 3.1's `canManageMembers`/`canGrantOrgAdmin`.
- **`HANDOVER.md`** — beide blokken achter elkaar; alleen de kop van het 3.1-blok volgt de
  laatste versie ("G36/G39").

**Wat de rebase daarná aan het licht bracht** (vijf bevindingen, allemaal in dit blok
gerepareerd — geen ervan is een fout van 3.1 of van main, het zijn de raakvlakken):

1. **De tripwire in `lib/repo/authz-deuren.test.ts` matchte op het kále voorkomen van de
   tekst `"use server"`.** Main's reviewzwerm zette in `lib/repo/dossiers.ts` een comment
   neer dat uitlegt waarom een constante níet in zo'n module past; dat viel rood als
   "server action buiten app/". De match is nu regel-geankerd (een directive is een
   statement op zijn eigen regel). De ondergrens ging mee: die stond op vijf bestanden,
   maar vier daarvan waren comment-vermeldingen in stubs — echt is er buiten `app/` er
   precies één, `lib/test-actions.ts`.
2. **Vier interfacenormen van main raakten 3.1's nieuwe schermen.** `pin-block.tsx` had
   twee kale grijze lege staten (nu `<EmptyState variant="inline">`), `password-block.tsx`
   een submit op `secondary` (nu `outline`), en `login-chrome.tsx` de afgeschafte
   `/50`-focus-halo (nu de knop-norm: transparante rand → `--ring` op focus + `ring-3
   ring-ring/10`; alléén de dekking omlaag zetten zou de focus onzichtbaar maken).
   `/login` en `/activate` staan als bewuste uitzondering op de containerbreedte-lijst,
   mét reden.
3. **`app/settings/organization/org-gate.test.ts` (van main) las een lege
   organisatielijst.** Migratie 0019 zet in élke verse database de interne org "Brink
   Licht". De test meet nu het verschil vóór/ná de POST, en de actor krijgt een membership
   in die org — anders hield de autorisatielaag de POST tegen en bewees de test niet meer
   dat de sessiepoort het werk deed.
4. **⚠️ `components/knophierarchie.test.tsx` scant de ruwe bron zonder commentaar te
   strippen.** Een comment dat `<Button>` als JSX-tag noemt telt als een échte
   primary-knop en maakt het scherm rood. Niet gerepareerd (die scan is eigendom van de
   interfacenorm-sessie); wél gemeden, met een waarschuwing in `login-chrome.tsx`. De
   zusterscan in hetzelfde bestand (`bg-primary`) slaat commentaarregels wél over — de
   twee zijn dus inconsistent.
5. **`app/projects/[id]/quote/quote-gate.test.tsx`** liep vast op 3.2b hieronder; zie daar.

**Meting.** `bunx tsc --noEmit` schoon. `lib/repo/authz*.test.ts` 32/32 en
`app/admin/users/issue-pin-authz.test.ts` + `lib/repo/activation.test.ts` 39/39, twee keer
gedraaid. De volle suite gaf in twee runs 8 en 6 rode tests in wisselende bestanden; alle
14 slagen in isolatie. Dat is de bekende flakiness van de suite (zie het blok van 30 jul),
niet dit werk — draai twee keer voor je iets een regressie noemt.

---

## Sprint 3.2c — onboarding op één scherm (2026-08-04)

Werkbranch `claude/jovial-mcclintock-3a09d3`. **Niets gepusht, niets gedeployed, productie
onaangeraakt.** Alles getest op PGlite.

⚠️ **De worktree stond 252 commits achter** (branch uit 27 juli). Die commits zaten al als
equivalent in `origin/main` (`git cherry` gaf ze alle vijf als `-`), dus de branch is op
`origin/main` gezet vóór er iets gebouwd werd. Wie hier verder werkt: eerst `git fetch`, dan
kijken — een parallelle sessie shipt intussen naar main.

**Waarom.** Iemand toegang geven is in het hoofd van Brink één handeling, maar kostte twee
schermen: organisatie aanmaken kon alleen op `/settings/organization`, een PIN uitgeven
alleen op `/admin/users`. Erger: `organizations.type` was nergens te kiezen én vrijwel
nergens te zien — het rolde uit de kolomdefault van migratie 0019. Aan dat veld hangt of
iemand inkoopprijzen ziet (`lib/repo/prijszicht.ts`).

### Wat er staat

- **Organisatiebeheer is verhuisd naar `/admin/users`** (besluit 1). Het aanmaakformulier is
  wég uit `components/org/org-list.tsx` en `app/settings/organization/actions.ts` —
  verhuisd, niet gekopieerd. Dat scherm gaat nu puur over branding en leden van bestaande
  organisaties; de lege toestand wijst naar Admin.
- **Nieuw blok `components/admin/orgs-block.tsx`**: aanmaakformulier (naam, plan, zetels) +
  de organisatielijst met per rij het type als badge, de bezetting (`3/5 seats`) en een
  inline zetellimiet-formulier (besluiten 4a, 7, 8). Alleen zichtbaar voor intern.
- **Vier nieuwe deuren in `lib/repo/authz.ts`**, allemaal in de G39-vorm (autoriseren en
  schrijven in één aanroep, actor uit de sessie): `createOrgAsActor`, `setSeatLimitAsActor`,
  `createOrgAndIssuePinAsActor` en `decideOrgCreate` als pure regel.
- **`createOrganization()` zet `type: 'extern'` hardgecodeerd** — geen parameter, dus er is
  geen code-pad dat een tweede interne organisatie kan maken (besluiten 3 + 9/G42). 'intern'
  bestaat alleen omdat migratie 0019 Brink Licht zo aanmaakte; nodig? Eén regel SQL.
- **De één-klik-variant** (besluit 4b): de organisatiekeuze in het PIN-formulier heeft een
  optie "+ New organization…" die naam/plan/zetels tevoorschijn haalt.
- **Zetellimiet wordt gehandhaafd** (besluit 6, bevestigd door de sprintmaster op 4 aug):
  bij PIN-uitgifte én bij lid toevoegen. Standaard 5 voor een nieuwe organisatie.
- **Type zichtbaar waar een organisatie genoemd wordt** (besluit 8): PIN-dropdown (deed het
  al), PIN-statuslijst (`PinUserRow.orgs` draagt nu naam + type in plaats van één string),
  de organisatielijst in Admin én de kaartkoppen op `/settings/organization`.

### Drie dingen om te weten vóór je hieraan verder werkt

1. ⚠️ **"Alles-of-niets" is compensatie, geen transactie — en dat kan niet anders.** De
   neon-http-driver kent geen transacties (`lib/repo/activation.ts:157` legt dat al uit voor
   dezelfde reeks schrijfacties). `createOrgAndIssuePinAsActor()` doet daarom (a) een
   droogloop vóór er iets bestaat — die vangt de verreweg meest voorkomende mislukking, een
   vertypt adres, af zonder de database aan te raken — en (b) een compensatie achteraf: gaat
   het daarna alsnog mis, dan wordt de zojuist aangemaakte organisatie verwijderd
   (`ON DELETE CASCADE` neemt het lidmaatschap mee). Bewezen met foutinjectie op de
   PIN-insert in `app/admin/users/org-admin-authz.test.ts`.
   **Wat er wél achterblijft:** de `user`-rij die `issueActivationPin` vóór de PIN aanmaakt.
   Bewust: het account hoort bij niemand, duikt niet in een dropdown op, en de volgende
   poging pikt hem op (conflict-tolerante insert). Besluit 5 gaat over de lege organisatie.
2. ⚠️ **De zetel-telling zit in de `WHERE` van de insert**, niet in een lezing ervoor
   (`addMembership` in `lib/repo/orgs.ts`, rauwe SQL). De poort in `authz.ts` leest de
   zetels óók, maar alleen om een bruikbare melding te kunnen geven; de grens is de SQL.
   **Wat dit niet is:** een slot. Twee écht gelijktijdige statements kunnen onder READ
   COMMITTED allebei dezelfde telling zien; daarvoor zou je de org-rij moeten locken, en dat
   vraagt een transactie die de driver niet heeft. Het venster is nu één statement breed in
   plaats van een hele request. `lib/repo/orgs.test.ts` meet dat parallel (10 gelijktijdige
   uitnodigingen op 3 plekken → 3 leden, en het aantal `true`-antwoorden = het aantal rijen).
3. ⚠️ **`VERBODEN_NAMEN` in `lib/repo/authz-deuren.test.ts` is uitgebreid** met
   `createOrganization`, `deleteOrganization` en `setOrgSeatLimit`. Dat sluit een gat dat al
   bestond: `organizations` stond wél in `VERBODEN_TABELLEN` (aanval G6), maar de
   schrijffuncties ervoor niet — `app/settings/organization/actions.ts` importeerde
   `createOrganization` gewoon rechtstreeks.

### Aannames en open eindes

- **Onbeperkt (`seat_limit = null`) is via de interface niet te kiezen**, ook niet bij het
  aanpassen. Het bestaat alleen nog voor Brink Licht zelf, dat zo op productie staat; het
  veld toont dan "unlimited" als placeholder in plaats van een verzonnen getal. Wil Brink
  ooit een klant zonder limiet, dan is dat — net als 'intern' — één regel SQL. Aanname,
  niet expliciet besloten.
- **De limiet mag lager gezet worden dan het huidige aantal leden.** Er wordt dan niemand
  verwijderd; er kan alleen niemand meer bij, en de lijst toont eerlijk `6/5 seats`. Dat is
  een bruikbare "bevries deze organisatie"-handeling, maar het is een keuze die niet in de
  besluiten stond.
- **Het "Plan"-veld is meeverhuisd** (trial/abonnement/per-dossier). De besluiten noemen het
  niet, maar het stond in het oude formulier en zou anders stilzwijgend onbereikbaar worden.
- **Geen unique-index op `organizations.slug`.** Twee organisaties met dezelfde naam geven
  nog steeds dezelfde slug, zonder waarschuwing. Bestond al vóór 3.2c (staat sinds 3.1 als
  open punt), en 3.2c maakt het zichtbaarder omdat aanmaken nu vaker gebeurt.
- **`/admin/users` heeft geen eigen RSC-paginatest.** De samenstelling in `page.tsx` (welke
  org bij welk membership hoort) leunt op typen en op de blok-tests. Daarom draagt
  `PinUserRow` nu `orgs: {name, type}[]` in plaats van een kant-en-klare string: het
  samenvoegen gebeurt in het component, waar een test het kán vastpinnen.

### Productie ná deze sprint (nog niet uitgevoerd)

Er is **geen migratie** in deze sprint — alleen code. Wel één gevolg om te weten vóór je
deployt: **TEST 123 heeft `seat_limit = 1` en één lid, dus die zit vanaf de deploy vol.**
Een tweede PIN voor die organisatie wordt geweigerd met "This organization has used all its
seats (1 of 1). Raise the seat limit to add someone." De knop om dat te doen staat er
(besluit 7, naast de organisatie in de lijst). Bekend en geaccepteerd — het is een
testorganisatie.

### Meting

`bunx tsc --noEmit` schoon. Eigen suites: `lib/repo/orgs.test.ts` 9/9,
`app/admin/users/org-admin-authz.test.ts` 12/12, `components/admin/orgs.test.tsx` 23/23,
en de bestaande authz/PIN/org-suites 187/187 samen. Screenshots licht/donker ×
mobiel/desktop staan naast de testfiles (`orgs-block.*`, `orgs-block-leeg.*`,
`pin-block-nieuwe-org-velden.*`, plus het volle PIN-blok op desktop).

⚠️ **Eén echte regressie gevonden en gefixt door de eigen bewakers:**
`components/knophierarchie.test.tsx` ving twee primary-knoppen op `/admin/users`. De
"Create"-knop van het organisatieblok staat nu op `variant="outline"` — de zwaarste actie op
dat scherm is "Create account & issue PIN".

Volle suite: 2/1966 en 4/1966 rood in twee runs, allemaal bekende flakiness — in isolatie
groen, en `components/data/custom-fields.test.tsx > "archiveren … zonder VERSE telling"`
faalt óók op een kale `origin/main` (zie de 3.2b-sectie hieronder).

---

## Sprint 3.2b — prijsloze estimate voor externen (2026-08-03)

Given fase 0, when een extern account een estimate opent of de PDF downloadt, then bevatten
scherm én PDF géén prijzen, bedragen of totalen — wel regels, aantallen, statussen en
kleuren. Intern verandert er niets.

**De vorm: een projectie, geen vlag.** `toPricelessEstimate()` (`lib/repo/estimate-extern.ts`)
levert een `PricelessEstimate` waarin `unitPrice`, de regeltotalen, de zone-subtotalen en
het eindtotaal er niet meer *zijn* — niet op nul, niet op null, weg. Het externe renderpad
(`lib/pdf/estimate-extern.ts`, `components/dossier/quote-view-extern.tsx`) kent alleen dat
type, dus een bedrag afdrukken is geen vergeten `if` maar een typefout. Dat is bewust géén
`renderEstimatePdf(data, { prijzen: false })`: die functie noemt `eur()` op zeven plekken,
en één vergeten tak is hier geen schoonheidsfout maar een lek naar de partij die de prijzen
juist niet mag zien.

**Wie is extern.** `resolvePrijszicht()` (`lib/repo/prijszicht.ts`) leest `organizations.type`
(G31) via de sessie. De regel staat de strenge kant op geformuleerd — **"intern? toon"**, niet
"extern? verberg" — zodat een vierde org-type, een ontbrekend membership of een vormloos adres
vanzelf de veilige kant op valt (ijzeren regel 4). Bewust géén hergebruik van
`resolveOrgAuthority()`: die beantwoordt "wie mag schrijven" en heeft een `org_admin`-tak. Een
org_admin van een externe organisatie is nog steeds extern en ziet dus geen bedragen.

**Bewijs op de gerenderde output, niet op een prop.** `lib/pdf/estimate-extern.test.ts` leest
de PDF terug met unpdf en zeeft op de VORM van een bedrag (euroteken, of een getal met precies
twee decimalen) — niet op losse cijfers, want aantallen, zones (A-08) en artikelcodes dragen
die ook. `components/dossier/estimate-extern.test.tsx` doet hetzelfde op de DOM, in álle vier
de standen (licht/donker × mobiel/desktop). Beide bestanden hebben een **omgekeerde toets**:
het interne stuk moet wél door de zeef vallen, anders bewijst de externe assertie niets. Die
toets heeft zich meteen terugverdiend — de eerste versie las de DOM vóór React had gecommit,
en alle "er staat geen bedrag"-asserties waren daardoor gratis groen.
`quote-gate.test.tsx` pint de wissel op de échte route: dezelfde GET, hetzelfde dossier,
andere sessie → wel of geen bedragen in de bytes.

**Aannames en open eindes**

29. **"Fase 0" is gelezen als de huidige uitrolfase, niet als `project_dossiers.phase`.** Het
    prijszicht hangt dus niet aan tender/gegund: een externe ziet nooit bedragen, in welke
    dossierfase dan ook. Klopt die lezing niet, dan is het één regel in `page.tsx`/`route.ts`.
30. **Het vervalmerkteken van de dagprijs staat niet op het externe stuk** ("day price expired
    — catalogue price used instead"). Het bevat geen bedrag, maar vertelt wél welke prijsbron
    gebruikt is, en zonder bedrag ernaast is het voor de ontvanger betekenisloos. Zelfde reden
    voor "p.m." en "ea.": dat zijn plaatshouders op de plek van een bedrag.
31. **De open-punten-zinnen zijn herschreven voor een externe lezer** (`EXTERN_PM_SENTENCE`),
    omdat de interne versie in "wij/terug naar de klant" spreekt en naar een p.m.-totaal
    verwijst dat op dit stuk niet bestaat. Eén bron voor scherm én PDF — het interne pad heeft
    daar twee kopieën van, wat dit bestand bewust niet herhaalt.
32. **De actiebalk is NIET ingeperkt.** Een externe ziet nog steeds "Generate estimate",
    "Print", "Download PDF" en de XIS-dialoog. Geen daarvan toont een bedrag (de preflight
    telt regels), dus het is geen prijslek — maar wie wat mág is **3.2a**, en dat item is hier
    bewust niet aangeraakt. Het kopblok-bewerkformulier rendert op het externe pad wel al niet.
33. **`lib/pdf/estimate.ts` en `lib/pdf/estimate-extern.ts` delen hun layout-constanten en
    tekst-helpers niet.** Een gedeelde helperlaag zou de twee sjablonen aan elkaar vastknopen,
    en dan is "de interne PDF krijgt een kolom erbij" opnieuw een moment waarop iemand aan de
    externe kant moet denken. Loopt de opmaak uit de pas, dan is dat zichtbaar en herstelbaar;
    loopt het geld mee, dan niet. (De opdracht noemde `lib/pdf/render.ts` als raakvlak — dat
    bestand is de client-side rasterisatie voor OCR en staat hier los van.)
34. **Op mobiel scrolt de regeltabel horizontaal**, dus de statuskolom staat buiten beeld tot
    je naar rechts veegt. Dat is bestaand gedrag van het interne estimate-scherm (acht
    kolommen); het externe stuk heeft er zes en is dus strikt beter. Niet gerepareerd: dat is
    een wijziging aan de gedeelde tabel en raakt het interne scherm mee.
35. **`generateQuote` blijft een interne handeling.** Draait een externe hem toch (de knop
    staat er, zie 32), dan worden er offerteregels mét bedragen weggeschreven — hij ziet ze
    alleen niet. Dat is geen lek, maar het hoort bij 3.2a om die knop weg te nemen.

---

## Tweede rebase op main — migratie 0017 werd 0019 (2026-08-03)

Tijdens het werk hierboven landde sprint **2.5b** op main (vijf commits, expressie-indexen).
De branch is dáár opnieuw op gerebased. Eén echte botsing, en het is er een die je niet met
een merge-tool oplost:

**2.5b had het nummer 0017 al ingenomen** (`0017_snelheid_indexen.sql` + `0018_analytics_
merkgat_index.sql`), en 3.1 had zijn eigen `0017_org_type_activatie.sql`. Twee migraties met
hetzelfde nummer laten staan maakt de volgorde dubbelzinnig, en `db/test-db.ts` — de plek die
die volgorde écht bepaalt, want het drizzle-journal loopt maar tot 0013 — kan ze niet uit
elkaar houden. 3.1's migratie is daarom **hernummerd naar `0019_org_type_activatie.sql`**;
dat kon zonder gevolgen omdat hij nog niet gedeployd is. Meegegaan:

- `db/migration-0017.test.ts` is nu van 2.5b (de indexen); 3.1's versie heet
  `db/migration-0019.test.ts`. De twee bestonden onder dezelfde naam — een `add/add`-conflict.
- Die test draait nu 0000–**0018** als voorstand en dán 0019, zoals het op Neon ook gaat.
  De indexen raken `organizations` niet, dus de uitkomst verandert er niet van; de volgorde
  klopt wél met productie.
- Verwijzingen naar "migratie 0017" in `lib/repo/activation.test.ts`,
  `scripts/cleanup-testdata.test.ts` en `components/org/org.test.tsx` zijn bijgewerkt.

✅ **Het deploy-draaiboek is meegegaan.** Élke verwijzing naar 3.1's migratie staat nu op
`0019`, mét de verschoven regelnummers (de drie adressen staan in 0019 op regel **61-63**, was
59-61; de scalaire subquery op **49**, was 47) en met de actuele sha in het push-commando. Er
staan geen twee nummers meer naast elkaar: wat er nog aan `0017`/`0018` in dit document staat
gaat over de indexmigraties van 2.5b, en die horen op Neon vóór 0019.

De stand van vóór deze tweede rebase staat als `backup/sprint31-pin-voor-tweede-rebase`.

**Meting na de tweede rebase.** `bunx tsc --noEmit` schoon. Beide migratietests groen
(0017 van 2.5b én 0019 van 3.1), de authz-suites 32/32, pin-autorisatie + activatie 39/39,
en de nieuwe 3.2b-suites 21/21. Volle suite: 1/1694 en 4/1694 rood in twee runs.

⚠️ Eén daarvan is géén flakiness en ook niet van deze branch:
`components/data/custom-fields.test.tsx > "archiveren vraagt om bevestiging: geen
archivering zonder VERSE telling"` faalt óók op een kale `origin/main` (nagemeten in een
wegwerp-worktree op 1f0fb7e: 1 rood van 1500). In isolatie is hij 3 van de 3 keer groen —
hij valt alleen om onder de volle-suite-belasting. Bestaande bevinding, hoort bij de sessie
die `custom-fields` bezit. De overige rode tests wisselden per run en zijn in isolatie groen.
---

## 2026-07-30 — Spec-kolommen 28 merken: ronde 0 af, ronde 3 begonnen

Werkbranch: `claude/relaxed-tereshkova-c27ac7`. **Niets gepusht, productie onaangeraakt.**
Alles op de Neon-branch `enrichment-serien` (`ep-rapid-credit-at806lp6`), achter
`scripts/branch-guard.ts`. Probleem: `docs/probleem-speckolommen-28-merken.md`, plan:
`docs/plan-speckolommen-28-merken.md`.

### Wat er nu staat en werkt

- **`publishRun` bundelt.** Was drie round-trips per product (135–152 ms elk, 12,6 uur voor de
  catalogus), nu één select + één `UPDATE … FROM (VALUES …)` per blok van 500. Twee dingen
  werden er veiliger van: "nooit overschrijven" wordt nu door de database afgedwongen
  (`coalesce(nullif(p.kolom,''), v.kolom)`, race-vrij) en `tier2_source` krijgt per veld dezelfde
  voorwaarde als de vulling. `applied` telt wat de database teruggeeft.
- **Drempel op de foutratio.** `errorRate` werd berekend en nergens vergeleken; één 'fout'
  blokkeert nu de hele run (`DEFAULT_MAX_SAMPLE_ERROR_RATE = 0`, uitzondering expliciet te typen).
  De UI zet de publiceerknop uit en zegt waarom.
- **`revertRun`.** "Onomkeerbaar" was een eigenschap van de code, niet van de data. Draait alleen
  terug wat nog exact onze waarde is én ons herkomststempel draagt.
- **Voorstelpoort.** `verdenking.ts` hing aan nul productiepaden en is aangesloten in
  `startEnrichmentRun` (niet in de parser — die voedt ook de aanvraagkant). Weert nu ~2.100 van
  ~146.000; geweerde voorstellen staan geteld in `enrichment_runs.counts.onderdrukt`.
- **Zwerm-gereedschap**: `scripts/zwerm-export.ts` (cellen + vallen + tegenproef + manifesthash)
  en `scripts/zwerm-lees.ts` (fail-closed verwerker). `zwerm/` staat in `.gitignore`.

### Parser-reparaties, alle vier gemeten vóór en ná

| wat | gemeten omvang |
|---|---|
| `NON DIM` las als dimbaar | 3.164 landende producten kregen de OMGEKEERDE waarde; XAL's dimbaarheidsrun ging van 3.449 naar 649 voorstellen |
| `C90 W` / `nn W-W` / `GX5.3 W` / `NxMW` als wattage | samen 1.442 van 71.883 → 0. `1x10W` blijft 10 |
| het product ís een voeding | naam-begin-anker + drie samenstellingen die overal mogen; 453 producten, 3.700 valse positieven vermeden |
| wattage boven 999 W | 16 voorstellen: 15 railprofielen, 1 typefout in de bron |

### Runs op de branch

- `99872733` Flos Architectural · cri — **gepubliceerd**, 27/27, elk met herkomststempel.
- `500d0b4f`, `683d047f`, `f46b7678` — Flos · maxWattage, **afgewezen** (zwerm/verouderd).
- `572e6baa` — Flos · maxWattage, 188 voorstellen, **wacht op Timo's steekproefoordeel**.

### Open eindes

1. **Prado en TossB-lumen zijn bevroren** (besluit Timo): Prado's kelvin/cri/beamAngle/dimmable
   (23.392 vullingen) wacht op de kolomroute, want Prado is het enige merk waar beide routes over
   hetzelfde veld iets zeggen — de enige onafhankelijke kruiscontrole die dit project heeft.
2. **Ronde 1 moet herbouwd** met een gecureerd `rijfilter` in plaats van de Serien-specifieke
   boolean `alleenGeintegreerdeLed`. `stap1Klaar` uit het zwerm-onderzoek is géén werklijst: vier
   van de elf ingangen dragen in hun eigen kanttekening een gemeten defect.
3. **Muuto verhuist naar ronde 2.** Gemeten op de geïntegreerde-LED-populatie (152 rijen): de
   typografische grens levert 41 waarden, de betekenisgrens 435.
4. **Negen Marset-sleutels spreken zichzelf tegen** in de bron (dubbele sleutel, afwijkende
   tekst). Flos en Lombardo hebben óók duplicaten maar die dragen identieke tekst; de overzetting
   heeft een dedup-stap nodig met die negen bij naam in het runrapport.
5. **Eén bekend lek dat bewust open blijft**: een onderdeel waarvan het onderdeelwoord niet
   vooraan staat én geen sterke samenstelling is. Gemeten omvang: nul, na de BELT-reparatie.
   De zwerm is daar het vangnet, niet de regex.
6. **De meetlat ziet dit werk maar deels.** 9 van de 28 merken worden gevraagd, 70 spec-regels,
   waarvan 5 blauw/open. Per ronde hoort hardop in het rapport wélke merken per constructie
   onmeetbaar zijn — anders leest "0 verschil" als "geen effect" terwijl het "niet gevraagd" is.

### Twee lessen die geld waard zijn

- **Kies je repetitiemerk niet op grootte.** Flos Architectural was klein en volledig te
  overzien, en bleek het vuilste merk van de catalogus: 21,3 % van zijn wattage-voorstellen staat
  op een onderdeelnaam, tegen 0,08 % bij Lombardo en 0,00 % bij Prado. De 38,6 % afkeur uit de
  eerste zwermronde zei iets over Flos, niet over ronde 3 — en ik had dat bijna als
  catalogusbrede conclusie gerapporteerd.
- **Een voorfilter met 87,7 % valse positieven is geen poort maar een prioriteitenlijst.**
  `accessoire-context` vlagt 12.417 landende voorstellen waarvan het overgrote deel gewone
  armaturen zijn die hun driver alleen vermelden. Onderdrukken daarop zou duizenden juiste
  waarden weggooien. De vlag bepaalt wélke cellen als eerste langskomen, niet wélke sneuvelen.

---

## 2026-07-30 — Waarneming bij de aanvraagkant: opgeslagen eis vs. verse parse

Gevonden tijdens de nameting van het verrijkingsspoor, niet gerepareerd. Hoort bij de
bestaande bevinding "verzonnen eisen" hierboven en is er een derde categorie naast.

**Eerst de correctie op een te snelle conclusie.** Een eerste, slordige vergelijking suggereerde
dat 65 van de 133 spec-regels met een opgeslagen eis het oneens zijn met een verse parse. Netjes
gemeten — numeriek met tolerantie, tekst hoofdletterongevoelig — is dat niet waar:

| | aantal |
|---|---|
| opgeslagen eiswaarden over alle `req_*`-kolommen | **525** |
| identiek aan een verse parse van de opgeslagen tekst | 250 |
| **werkelijk een andere waarde** | **1** |
| verse parse vindt niets waar wél een eis staat | **274** |

Die ene afwijking is `Lw101` (dossier `4ca9fafe`): opgeslagen `req_watt = 2.50`, verse parse 3.3.

**Wat de 274 betekent en wat níét.** Het bewijst *niet* dat die eisen verouderd zijn. Het bewijst
dat `description + product_text + brand_text` niet de volledige invoer is die de import gebruikte —
de leesroute ziet meer (tabelkolommen, de hele rijcontext). **Elke meting die een eis probeert te
reproduceren uit de opgeslagen tekst, reproduceert dus iets anders dan wat de matcher gebruikt.**
Dat raakt de betrouwbaarheid van elke nameting die op een verse parse leunt, en het is de reden
om metingen op `spec_lines` te doen en niet op een herbouwde parse.

**Het overtuigendste voorbeeld staat op blauw.** `Lw101` in dossier `4ca9fafe` luidt
*"Wand Vierkant Maatwerk wandarmatuur exact type nader uit te werken door architect - - - LED - - -
- - - - 3000K CRI ≥ 80"* — een regel die letterlijk zegt dat het type nog bepaald moet worden.
Een verse parse haalt daar zeven harde eisen uit: `maxWattage 3.3`, `kelvin 3000`, `cri 80`,
`ipValue IP42`, `beamAngle 25`, `lumenOutput 50`, `dimmable DALI`. De IP-klasse, de bundelhoek en
het dimprotocol staan nergens in die tekst; ze komen uit de streepjes en de omliggende kolommen.

**En een val die vandaag twee keer toesloeg: `fixture_code` is geen sleutel.** Er zijn drie
regels met code `Lw101`, in drie dossiers, met drie verschillende armaturen (Axo Light NEST,
het maatwerk-armatuur hierboven, en een lege "Maatwerk wandarmatuur"). Wie een regel aanhaalt,
moet het dossier erbij noemen — anders kijken twee mensen naar een andere regel en denken ze
elkaar tegen te spreken.

---

## 2026-07-30 — De les uit vier valstrikken op één dag: de generalisatie is de fout

Vier keer op één dag wilde ik een onderdeel-filter bouwen op een woord dat in de productnaam
stond. Vier keer bleek datzelfde woord ook in échte armaturen te staan, en vier keer redde
dezelfde gewoonte het: **eerst tellen wát de regel raakt, en dan naar de namen kijken in plaats
van naar het getal.**

| term | wilde ik weren | maar het raakt óók | het onderscheid dat wél werkt |
|---|---|---|---|
| `^LAMP` | losse vervanglampen (91) | Egoluce's `LAMP. SOSP./PAR./TAVOLO` — Italiaanse armatuurtypes (27) | eist óók een fitting of lamptype in de naam |
| `SHADE` | losse kappen | `ROOMOR … PAR16 B NO SHADE max. 15W GU10` (31 armaturen) | eist een `max.`-opgave **en** géén fitting |
| `CONTROL` | Casambi-besturingsmodules (4) | TossB's `ROUND CONTROL MINI Arm 550mm - 6W LED` (128 namen) | alleen in de samenstelling `WIRELESS … CONTROL` |
| `TRACK ADAPTER` | railadapters (22) | **192 XAL-armaturen** waar het een montage-optie aan het regeleinde is | de POSITIE: niet aan het eind van de naam |

Die laatste was de gevaarlijkste: die 192 XAL-producten dragen CRI, kelvin en wattage die al op
productie staan. Een kale term-regel had ze alle drie afgenomen.

**Twee bijvangsten van dezelfde soort.** De typecode-regel werkte eerst op NAAMniveau en wees de
hele naam af zodra er ergens een typemaat-`W` in stond; gemeten kostte dat 16 namen een aanwezige
juiste waarde (`SIRRO SPOT INSET 1.0 W max. 12W` → niets in plaats van 12). En de kap-regel paste
de fitting-uitzondering toe op de héle klasse, terwijl alleen `SHADE` hem nodig had —
`BOX MINI PAR16 INNER REFLECTOR B max. 10W` glipte daardoor door, want die `PAR16` slaat op de
lamp waarvoor de reflector bedoeld is.

**De vorm is steeds dezelfde:** een regel die op de hele naam werkt in plaats van op de plek waar
de waarde vandaan komt, of op een hele klasse in plaats van op de term die de uitzondering nodig
heeft. Wie hier een nieuwe onderdeel-term toevoegt: meet eerst hoeveel namen hij raakt, print de
namen uit, en splits pas daarna.

---

## 2026-07-30 — Het patroon achter drie bugs: twee lagen die apart over hetzelfde oordelen

Drie keer op één dag liep dezelfde fout op: twee stukken code beoordeelden onafhankelijk van
elkaar hetzelfde feit, en gaven daarom vroeg of laat tegengestelde antwoorden. Steeds zag je het
pas aan een uitkomst die niet klopte, nooit aan de code.

| lagen | wat er uiteenliep | hoe het zich uitte |
|---|---|---|
| `parseWatt` vs. `verdenkingen()` | wélke tekstfragmenten een wattage-kandidaat zijn | `… 1.1 **B** ROUND incl. driver 4W` landde, `… 1.1 **W** ROUND …` werd geweerd op `meerdere-waarden`. Zelfde armatuur, andere kleurcode |
| celsleutel vs. spanselectie | wélke karakters de waarde voortbrachten | `array #k cri#` en `rray #k cri#` werden twee cellen voor dezelfde vraag, omdat het venster middenin een woord knipte |
| `startEnrichmentRun` vs. `publishRun` | wat "de kolom is leeg" betekent | 64 van 100 steekproefrijen op een kolom die `publishRun` hoe dan ook negeert — de poort stond formeel dicht en hield materieel niets tegen |

**De reparatie was elke keer dezelfde vorm:** één functie tot bron van waarheid maken en de
andere laag daarnaar laten verwijzen — `wattKandidaten()` in `parser.ts`, `specSpans()` voor de
celsleutel, `fieldIsEmpty()` voor de leeg-toets. Niet: de tweede laag "ook" repareren.

**Waar dit nog kan spelen:** overal waar een filter, een teller of een rapport een eigen regex of
eigen definitie hanteert voor iets wat de parser of de matcher al bepaalt. Wie hier iets toevoegt
dat over dezelfde tekens oordeelt: importeer de bestaande functie in plaats van het patroon over
te schrijven, ook als dat één regel langer lijkt.

---

## 2026-07-30 — Kreon-zwerm: uitslag, en het derde slot op de valdeur

**Run `22c6aa67-ed96-4d5e-88e8-027ca9ff7ad3`, één scherf, 197 echte cellen + 9 vallen.**
194 goed · 3 `nee-hoort-bij-onderdeel` · 0 onzeker · val-recall 9/9 · 0 onbeslist.

Drie dingen die in het verslag horen omdat ze anders verkeerd gelezen worden:

- **Tegenproef 0/0 is géén geslaagde toets.** Deze ronde toetst het ankerfilter niet: Kreons
  enige onderdrukking is `cri:afgekapt`, dus er waren geen geweerde onderdelen om mee te mengen.
  Wat hier gemeten is, is uitsluitend wat het filter DOORLAAT.
- **Eén scherf voor een merk van 14.000 producten klopt.** Na de `kolomAlGevuld`-reparatie zijn
  Kreons kelvin en wattage al gevuld; wat overblijft ís `cri`. Er is niets overgeslagen.
- **De drie afkeuringen zijn light engines** (`Light engine 80 2700K CRI90+ 15D 350mA`, 15
  producten). Voor de WAARDE verandert dat niets — het product ís de lichtbron, dus CRI90 is er
  een echte eigenschap van; dat is dezelfde vraag als de W&D LED-modules, en die is schoon
  beantwoord (74 cellen overlap, 74× goed, 0× anders). Of zo'n motor als armatuur mág meedoen is
  een andere laag: de matcher, niet de parser.

### De val stond op een vaste stap

De agent meldde het zelf, bijna terloops: *"exact elke twintigste celId — c0020, c0040, c0060 …
de regelmaat viel pas achteraf op."* De oude menger zette één invoeging per `floor(197/10) = 19`
echte cellen, dus de vallen lagen op de twintigtallen. Dit is de **derde** keer dat de val aan
iets anders dan zijn inhoud te herkennen was:

| verraden door | gerepareerd |
|---|---|
| celId-voorvoegsel `v` / `t` | hernummeren ná het mengen |
| vaste vervalsing `waarde + 7` | valvorm varieert (+7 / cijferomkering / waarde lenen) |
| **vaste stap tussen de invoegingen** | **positie uit een hash van de celinhoud** |

`meng()` staat nu in `lib/enrichment/zwerm-meng.ts` met eigen tests: één invoeging per emmer van
gelijke grootte (dus nog steeds over de hele scherf gespreid — val-recall blijft een uitspraak
over élke scherf), maar de plek bínnen de emmer komt uit een hash van de inhoud van de echte
cellen. Reproduceerbaar, en de afstanden verschillen per scherf en per run.

⚠️ Lees `val-recall 9/9` uit de Kreon-scherf dus als **9/9 onder een herkenbaar patroon**. De
agent zegt zelf dat hij ze op inhoud vond; dat is aannemelijk maar niet toetsbaar meer. De eerste
scherf die de nieuwe menger gebruikt (Lombardo) is de eerste schone valmeting.

### W/m nagemeten, catalogusbreed

De agent waarschuwde dat namen met `44W/m` en `25,7W/m` een valstrik zijn zodra een scherf
`maxWattage` uit deze namen leest. Nagemeten (`scripts/meet-wattpermeter.ts`): 147 namen met een
vermogen per meter — Kreon 113, Wever & Ducré 20, XAL 14 — en **nul** daarvan levert een
maxWattage op. De regel uit ronde 4 vangt dit catalogusbreed.

### Niet gebouwd, wel gemeten: "light engine"

125 producten dragen `light engine` of `led engine` in de naam (Serien Lighting 105, Kreon 20).
120 vooraan, en de 5 die het niet vooraan hebben zijn juist het omgekeerde geval:
`Module 60 for light engine`, `Aplis 60 dir. module for LED engine 35` — dat zijn behuizingen die
een motor ópnemen, geen motoren. Een grove `light engine`-regel zou precies die vijf weren. Zelfde
patroon als `TRACK ADAPTER` (192 XAL-armaturen) en `POWER SUPPLY`: de term staat in beide rollen
in de catalogus, en alleen de POSITIE scheidt ze. Er is hier geen regel gebouwd.

---

## 2026-07-30 — Lombardo-zwerm: twee poortlekken en een vierde manier waarop de val zich verraadt

Run `d7dbd69a-4836-4a52-a430-55255bc0a136`, 3.933 echte cellen, 17 scherven van 250.

### De val verraadt zich nu aan zijn TWEELING

Vijf agents schreven het onafhankelijk op, in hun eigen woorden: *"elke nee-cel is een duplicaat
van een naastgelegen goede cel — zelfde naamvorm en dezelfde productnamen, alleen het getal is
fout"*, *"opzettelijk geplante afwijkers"*, *"gif-cellen"*. Dat klopt: `zwerm-export.ts` bouwt een
val door een ECHTE cel te kopiëren en de waarde te vervalsen, en die kopie belandt in dezelfde
scherf als het origineel. De positie is nu willekeurig, het voorvoegsel is weg, de vervalsingsvorm
varieert — maar zolang het origineel ernaast ligt, is de val herkenbaar zonder hem te lezen.

**Vierde slot, nog te bouwen:** de bron van een val hoort NIET in dezelfde scherf te zitten. Dat
stond al als uitgesteld punt in de vorige sessie; vijf onafhankelijke meldingen maken het urgent.
Tot dat er is, geldt voor Kreon én Lombardo: **de val-recall is een ondergrens, geen bewijs van
zorgvuldig lezen.**

### Twee poortlekken die de zwerm vond, beide Italiaans

| vorm | waar | door de poort mét een waarde | risico van een grove regel |
|---|---|---|---|
| `Alim.` / `Alim` (alimentatore = voeding) | Lombardo 93, Egoluce 65, Flos 15, Artemide Arch. 6 | **37** (48 werden al geweerd op een andere grond) | 486 namen dragen `ALIM` NIET vooraan — `ALPHABET OF LIGHT S ALIM 6MT`, `KIT ALIM. BLL`. Een regel op de hele naam raakt die |
| `Drive` (zonder r) | 6 in totaal | **6** | 3 daarvan zijn `FARETTO DRIVE 24V 4000K` — *faretto* is Italiaans voor spot, dus **Drive is daar een familienaam** |

Zelfde vorm als `TRACK ADAPTER`, `POWER SUPPLY` en `light engine`: de term staat in beide rollen
in de catalogus en alleen de POSITIE scheidt ze. Voor `Alim.` is een vooraan-regel gratis (37
gewonnen, 0 van de 486 geraakt); voor `Drive` is de balans 3 tegen 3 en dus geen regel waard.
**Geen van beide is gebouwd** — dit gaat door de gewone cyclus: probleem, plan, dan pas bouwen.

### Wat WEL bevestigd is

- **De tegenproef werkt.** Vier `Driver …`-producten die de poort weerde zijn ononderscheidbaar
  meegemengd; alle vier werden door de agents `nee-hoort-bij-onderdeel` genoemd. Het anker is dus
  niet te grof — dat is de toets die bij Kreon niet gedaan kón worden.
- **Namen die met driver/converter/voeding/trafo BEGINNEN**: 537 in de catalogus, over 12 merken,
  en **nul** komen er met een waarde door de poort (`scripts/meet-driver-vooraan.ts`).

### Een detail in de scherfopbouw

434 cellen (10,5 %) tonen drie keer dezelfde productnaam. Dat is geen exportfout maar de
catalogus zelf: Lombardo voert tientallen artikelnummers onder één identieke naam (60× `Ago
Applique LED 2.2K 5W Bianco`). Voor de agent is het wel verspilde ruimte — drie voorbeelden die
één voorbeeld zijn. Kandidaat voor de volgende exportronde: toon DISTINCTE namen.

### Uitslag Lombardo (run `d7dbd69a`)

| oordeel | cellen | producten |
|---|---:|---:|
| goed | 3.908 | 59.350 |
| onzeker | 7 | 192 |
| nee-hoort-bij-onderdeel | 18 | 27 |

val-recall 196/196 · tegenproef 12/12 · 0 onbeslist · 0 ongeldige scherven.
De verwerker zegt **niet schoon** en dat blijft staan: 25 cellen dragen bezwaar.

**De 18 echte afkeuringen zijn samen 27 producten** en vallen in vier groepen: 12× `Alim.`
(voeding), 2× `Drive/Sensore`, 2× `Led Cob Cree … Cri80/Cri95` (losse COB-chip), 2× `Molla Vetri
Componi` (glasklem). Allemaal poortlekken, allemaal hierboven gemeten.

**De 7 `onzeker` zijn geen twijfel maar een fout-positief die we kennen.** De agent zag de vlag
`accessoire-context` op `Lula Bracket 150 LED 2.2K 12W` en durfde niet te kiezen. De catalogus
beslist het wel: `Lula LED 2.2K 12W Nero` bestaat óók zonder "Bracket" — het is dezelfde armatuur
in de wandbeugel-uitvoering, 168 van de 390 Lula's. Catalogusbreed draagt `bracket` 406 namen over
15 merken, waaronder `SANTORINI WALL BRACKET GREY` van Marset: het woord beschrijft de montagewijze
van een armatuur, niet een los onderdeel. Dit is precies de 87,7 % fout-positief waarom
`accessoire-context` niet in `ONDERDRUKKENDE_VERDENKINGEN` staat — nu ook aan de andere kant van
de zwerm zichtbaar.

### Nog twee termen gemeten, geen regel waard

- **`cob`**: 6.274 namen, waarvan **6.164 van XAL** waar COB gewoon de lichttechniek in een
  armatuurnaam is. Slechts 2 producten (Lombardo) zijn werkelijk een losse chip. Een regel op
  `cob` zou 6.235 armaturen raken om er 2 te winnen.
- **`molla`**: 18 namen. Zelfs vooraan is het niet veilig — `MOLLA W LED 3000K WHITE` van Artemide
  Architectural is een armatuurfamilie. Werkelijk een klem: 2 producten bij Lombardo.

---

## 2026-07-30 — XAL: de eerste schone zwerm, en wat "schoon" hier wel en niet betekent

Run `ef2a0071-2ba6-4e5d-a8bc-72f898975a96`, 228 echte cellen, 2 scherven.
**228 goed · 0 afgekeurd · 0 onzeker · val-recall 11/11 · 0 onbeslist ⇒ `✓ SCHOON`.**

Dit is de eerste ronde waarin de verwerker geen enkel bezwaar teruggeeft. Drie kanttekeningen die
er meteen bij horen, anders leest "schoon" ruimer dan het is:

1. **Tegenproef 0/0 — het ankerfilter is niet getoetst.** Net als bij Kreon zijn er in deze run
   geen als onderdeel geweerde producten om mee te mengen.
2. **XAL is een makkelijke valmeting.** Vrijwel elke XAL-cel draagt `CRI90`; een vervalste 97 of
   93 valt dan op zonder dat je de cel hoeft te lezen. De 11/11 is dus eerlijk verdiend maar zegt
   minder dan dezelfde score bij Lombardo, waar de wattages over tientallen waarden lopen.
3. **De ronde ervóór was ongeldig en is opnieuw gedraaid** — zie hieronder.

### De reparatie van het derde lek maakte het eerste terug

`scheidTweelingen` koos als ruilpartner de laagste vrije index. Gevolg: **alle vijf de vallen van
scherf 1 kwamen op positie 1–5 en alle zes van scherf 2 op 0–5.** De agent zag het meteen — *"de
vijf afkeuringen zitten allemaal direct na c0001, aan het begin van de scherf"* — en dat is exact
de vaste-positie-fout die `meng()` een paar uur eerder had opgelost.

Vierde keer dat een lek in de vallen pas aan de UITKOMST zichtbaar werd en nooit aan de code. Dat
is nu geen incident meer maar een eigenschap van hoe ik hieraan werk: de test die ik erbij schrijf
dekt telkens de fout die ik al gezien had.

**Daarom controleert de exporteur nu zichzelf.** `controleerVallen()` (lib/enrichment/zwerm-meng.ts)
stelt vier vragen aan de scherven zoals ze op schijf komen, en de exporteur drukt het antwoord af
vóór er één agent leest:

| vraag | de ronde die eraan onderdoor ging |
|---|---|
| staat er in élke scherf een val? | ronde 2, scherf 7 |
| staan ze op een vaste stap? | Kreon (elke 20e cel) |
| klonteren ze in een kwart van de scherf? | XAL (positie 0–5) |
| staat een val naast een cel met dezelfde naam én vorm? | Lombardo (186 van 196) |

De test bouwt alle vier de historische bugs na. Eén functie, twee gebruikers — geen vijfde geval
van twee lagen die apart over hetzelfde oordelen.

---

## 2026-07-30 — TossB, en de stand van vier merken op een rij

Run `a72e9fc6-9f6d-4395-8614-35891b892854`, 186 echte cellen, 2 scherven.
**180 goed · 6 `nee-hoort-bij-onderdeel` (19 producten) · 0 onzeker · val-recall 9/9.**
Ook hier tegenproef 0/0: geen geweerde onderdelen om mee te mengen, dus het anker is niet getoetst.

De zes afkeuringen zijn twee soorten: 4× `LED bulb AR70/AR111` (losse lamp) en 2× `Base Rond SB
100mm … - Driver 350mA - 10W … base black` (voetstuk mét driver).

### De vier merken samen

| merk | run | cellen | goed | afgekeurd | onzeker | val-recall | tegenproef |
|---|---|---:|---:|---:|---:|---|---|
| Kreon | `22c6aa67` | 197 | 194 | 3 | 0 | 9/9 ⚠ | 0/0 — niet getoetst |
| Lombardo | `d7dbd69a` | 3.933 | 3.908 | 18 | 7 | 196/196 ⚠ | 12/12 ✓ |
| XAL | `ef2a0071` | 228 | 228 | 0 | 0 | 11/11 | 0/0 — niet getoetst |
| TossB | `a72e9fc6` | 186 | 180 | 6 | 0 | 9/9 | 0/0 — niet getoetst |

⚠ = de val-recall van Kreon en Lombardo kwam tot stand vóór het vierde slot; lees hem als
ondergrens. XAL en TossB zijn de eerste rondes met alle vier de sloten actief.

**Alleen Lombardo heeft het ankerfilter werkelijk getoetst.** Bij de andere drie waren er geen
geweerde onderdelen om als tegenproef mee te mengen, dus daar meet de zwerm uitsluitend wat het
filter doorlaat.

### De poortlekken bij elkaar — wat de meting wél en niet rechtvaardigt

| term | gevonden bij | door de poort | grove regel raakt | oordeel |
|---|---|---:|---|---|
| `Alim.` vooraan | Lombardo | 37 | niets — de 486 met `ALIM` middenin blijven staan | **bouwen** |
| `led/halogen bulb` vooraan | TossB | 26 | niets — Kreons 150 `sphere bulb`-pendels en TossB' `Bulb included` blijven staan | **bouwen** |
| `Base` vooraan | TossB | 4 (alleen TossB) | 44 andere `Base …`-namen dragen geen waarde, dus 0 | **bouwen, smal** |
| `cob` | Lombardo | 6.235 | **6.164 XAL-armaturen** waarvan de CRI al op productie staat | niet bouwen |
| `molla` | Lombardo | 4 | `MOLLA W LED 3000K WHITE` is een Artemide-familienaam | niet bouwen |
| `drive` (zonder r) | Lombardo | 6 | 3 daarvan zijn `FARETTO DRIVE` — een Egoluce-spot | niet bouwen |
| `light engine` | Kreon | 15 | de 5 `Module 60 for light engine` zijn behuizingen | niet bouwen |

Drie kandidaten die de meting draagt, vier die hem niet dragen. Geen van zeven is gebouwd.

### Nieuw, en géén poortkwestie: meerkanaals-armaturen

De TossB-agent zag dat `TIBO Wall indoor - 8W+4W LED` als maxWattage **8** krijgt en niet 12. De
waarde staat letterlijk in de naam en beschrijft een echt kanaal — de zwerm noemt hem dus terecht
`goed` — maar het armatuur trekt 12 W en dat is wat een bestek vraagt. Catalogusbreed:

    namen met "xW + yW" : 34   (Kreon 24, TossB 10)   waarde ≠ som: 34 van 34

Alle 34 rapporteren te laag. Klein genoeg om te laten liggen, maar het is een systematische
onderschatting en geen leesfout — dus het hoort niet in de "afgekeurd"-stapel maar op deze lijst.

---

## 2026-07-30 — De kleine merken, en drie die te klein zijn voor de zwerm

**Lumiance** (32 cellen) en **Nordlux** (24 cellen): allebei `✓ SCHOON`, alles goed, val-recall 2/2.
Ook hier tegenproef 0/0.

### Drie merken waar de zwerm niets kan meten — met de hand nagelopen

Bij Flos Architectural (25 cellen), It's About RoMi (5) en Estiluz (2) meldde `controleerVallen`
zelf dat de opzet niet werkt: te weinig cellen om een val van zijn tweeling te scheiden én elke
scherf een val te geven. Dat is de bedoelde uitkomst — een val die je aan zijn buurman herkent,
meet niets. Deze 32 cellen dus met de hand:

| merk | oordeel | waarom |
|---|---|---|
| Flos Architectural | 25 van 25 goed | BON JOUR, FINDME, JUNCOS, G-O, THEBLOCKOFLIGHT, UT SPOT TRACK — allemaal complete armaturen, kelvin en wattage staan er letterlijk in |
| It's About RoMi | **0 van 5** | alle vijf zijn `LED bulb globe/tube/sphere filament … E27/3,5W`: losse lampen |
| Estiluz | **0 van 2** | `Kit recambio led volta 3000k` en `Replacement led volta 2700k`: reserve-LED-modules |

Meegenomen detail dat goed ging: `KAP 80 W-W RND GOLD DW LED ARRAY C95 13W` levert 13 W en niet
80 — de `W-W`-regel (warm-white) doet wat hij moet doen.

### Twee kandidaten erbij

- **`led bulb` vooraan** dekt nu álle vijf de RoMi-voorstellen, niet alleen TossB' vier. Daarmee
  komt die regel op 26 namen catalogusbreed en is hij de enige die een heel merk opruimt.
- **`recambio` / `replacement`**: 62 namen in de catalogus (Marset 33, Lombardo 10, Estiluz 7,
  W&D 7, &Tradition 4, XAL 1), waarvan er **4 door de poort komen — alle vier van Estiluz**. De
  overige 58 dragen geen waarde en worden dus toch al niet voorgesteld. Smalle, gratis regel.

Nog steeds geen van de regels gebouwd.

---

## 2026-07-30 — Marset is een ander soort merk, en dat verandert wat de poort moet doen

**Marset** (71 cellen): 23 goed, **48 afgekeurd** (76 producten), val-recall 3/3.
**CLS** (113 cellen): 110 goed, 3 afgekeurd, val-recall 5/5.

Marset is het eerste merk waar de meerderheid van de voorstellen niet over een armatuur gaat. Zijn
catalogus draagt het complete ophangsysteem als losse artikelen, en die dragen wél een wattage:

| soort | wat het is | cellen |
|---|---|---:|
| `CANOPY 20W 24V TRIAC GOLD` | kap/rozet met ingebouwde voeding | 19 |
| `CLUSTER AMBROSIA V 100W 3 OUTPUTS 24V TRIAC` | meervoudige voedingseenheid | 11 |
| `E27 LED GLOBE 120 11W 1521LM CRI80 2700K` | losse retrofit-lamp | 12 |

Alle drie zijn ze `kap`, `voeding` of `losse lamp` — categorieën die de prompt al noemt en die de
poort dus hóórt te weren. Ze komen er doorheen omdat de herkenning op andere woorden let.

### Gemeten, en alle drie scherp af te bakenen op de POSITIE

| term vooraan | door de poort | wat middenin staat en ongemoeid blijft |
|---|---:|---|
| `CANOPY` | 31 (alle Marset) | **2.054** namen dragen `canopy` niet vooraan — `AURA PLUS TRANSPARENT SMOKED W/CANOPY`, `VIRTUS SUSPENSION RECESSED CANOPY WATER BLUE 3000K` (Axo Light, een armatuur) |
| `CLUSTER` | 20 (Marset) + 8 TossB | 14 middenin, waaronder Artemide's `RIPPLE S CLUSTER (3) APP` |
| `E14/E27/G9/GU10/AR111` vooraan | 10 | — de 25 die er zo beginnen zijn stuk voor stuk een losse lamp |

TossB' acht `CLUSTER …` heten voluit `CLUSTER Driverbox 30 Coax LED — Excl. Drivers`: ook
componenten, dus de regel klopt ook daar.

**Dit is nu de grootste van de kandidaten**: samen 61 voorstellen bij één merk, en Marset zakt
daarmee van 48 afgekeurde cellen naar bijna nul. Nog steeds niet gebouwd.

### Sylvania is geen armaturenmerk, en dat is geen regexprobleem

Scherf 2 van de vier gaf al 34 afkeuringen op 250 cellen, allemaal van hetzelfde soort: de
lampencatalogus van Sylvania zit tussen de armaturen. Catalogusbreed, en **alle vier de families
komen uitsluitend bij Sylvania voor**:

| familie | namen | door de poort mét een waarde |
|---|---:|---:|
| RefLED (retrofitlamp) | 169 | 81 |
| LYNX / MINI-LYNX (CFL) | 22 | 20 |
| BLACKLIGHT / circline (TL) | 18 | 18 |
| LUXLINE PLUS (TL) | 1 | 1 |
| **samen uniek** | | **117** |

⚠ **Dit hoort NIET in dezelfde categorie als canopy, alim. en led bulb.** Die drie zijn woorden
die een onderdeel benoemen, en de regel gaat over positie. Dit is iets anders: een fabrikant die
naast armaturen ook lampen levert, en beide staan in dezelfde tabel zonder dat iets zegt wélk
soort product het is. Vier merknaam-regexen erbij lost Sylvania op en niets anders — de volgende
lampenleverancier begint weer bij nul.

De structurele vraag hoort bij het import-pad, niet bij `verdenking.ts`: krijgt een product een
soort (armatuur / lamp / driver / accessoire) bij het inlezen, dan valt deze hele klasse weg en
verdwijnt de helft van de regels hierboven mee. Dat is een besluit voor Timo, geen reparatie.

### Sylvania compleet: 241 van de 904 cellen afgekeurd

Vier scherven binnen. **663 goed · 241 `nee-hoort-bij-onderdeel` (405 producten) · 0 onzeker ·
val-recall 45/45.** Ruim een kwart van de cellen gaat niet over een armatuur — veruit het hoogste
van alle merken. Alle 241 zijn lampen: RefLED-reflectorlampen (GU10/MR16/PAR/ES50/R39–R80),
ToLEDo-retrofits, HPS SHP-T/GROLUX E40, CFL LYNX-D, PIGMY-ovenlamp E14, blacklight-TL.

**En de familienaam-regel loopt op dezelfde klip als alle andere.** `ToLEDo` raakt buiten Sylvania
vier namen — `Pendant lamp Toledo, brown` en `Table lamp Toledo, brown` van It's About RoMi, waar
Toledo gewoon een armatuurfamilie is. Ook hier scheidt alleen de context, niet het woord.

Bovendien dekt de familie-regex maar een deel: 581 Sylvania-producten dragen een lampfamilienaam
(indicatie 380 voorstellen), terwijl de zwerm er 405 producten afkeurde die óók fittingen als
`E27`, `GU10`, `R7s`, `G12`, `B22`, `T8` dragen. Wie dit met regexen wil oplossen blijft
familienamen bijschrijven.

Een agent zag bovendien iets wat voor de bewijsplicht uitmaakt: **de brondata bevat harde spaties
(U+00A0)** in Otao/Quantum-namen. Een beoordelaar die de naam overtypt in plaats van kopieert
levert een `bewijsNaam` die niet valideert — het slot doet dan het goede, maar om de verkeerde
reden. Goed om te weten als er ooit handmatig een antwoord wordt bijgeschreven.

---

## 2026-07-30 — Twee runs die "TAL" heetten waren Metalarte

`verrijk-xal.ts start --merk=TAL` zocht met `ilike '%TAL%'` en nam `const [merk] =` — de eerste
rij. Dat filter levert **acht merken**: Metalarte, TAL, Castaldi, Rotaliana, Pallucco Italia,
Luci Italiane, TALA en Metal Lux. De eerste is Metalarte, en Metalarte heeft geen producten.

Ik heb daarop gerapporteerd: *"TAL leverde nul voorstellen op — na de leeg-kolomreparatie is daar
niets meer te vullen."* Dat was onjuist. **TAL heeft 6.481 producten en 164 voorstellen.** En het
script `meet-restant-merken.ts`, dat ik in dezelfde adem als onbetrouwbaar bestempelde omdat het
"164 zei terwijl de run nul gaf", zei precies het goede getal — 164. De run had ongelijk, niet het
script. (De afwijkingen bij TossB (8), XAL (302) en Kreon (~660) staan nog steeds; die kop-
waarschuwing blijft dus terecht, maar het TAL-voorbeeld erin was mijn eigen fout.)

**Reparatie:** de merkkeuze weigert nu bij twijfel. Past de opgegeven tekst op meer dan één merk
en is er geen exacte naamtreffer, dan stopt het script en noemt het de kandidaten. Een lookup die
bij twijfel de eerste rij pakt, geeft een fout antwoord met dezelfde stelligheid als een goed
antwoord.

## 2026-07-30 — Elf verouderde runs afgewezen, één run per merk

Er stonden **24 runs op `steekproef` over 15 merken**. Timo tekent per merk, dus zeven openstaande
Wever & Ducré-runs betekenen zeven regels die er even geldig uitzien, waarvan zes van vóór de
reparaties van vandaag.

De toets is machinaal: een run van ná de leeg-kolomreparatie draagt `counts.kolomAlGevuld`.
**Alle zeven W&D-runs misten dat**, ook de nieuwste (19:47, zes minuten vóór de fix) — dus geen
van de zeven was bruikbaar en er is een verse run gemaakt (`39f25f5d`, 16.005 voorstellen, exact
gelijk aan de oude: bij W&D waren de kolommen toch al leeg, dus die fix verandert er niets).

Afgewezen via `rejectRun` (`scripts/wijs-verouderde-runs-af.ts`, met `DRY_RUN=1` te bekijken):
7× W&D, 1× Kreon (`5848a407`, de 32.917-run), 1× XAL (`ea7742ef`), 2× Metalarte (leeg, gevolg van
de merkverwarring hierboven). Stand nu: **15 runs over 15 merken, precies één per merk.**

⚠ Eén run is bewust ongemoeid gelaten: `902ba6e9` (&Tradition, 9 juli). Die komt niet uit deze
sessie en het is niet aan mij om andermans werk af te wijzen — maar hij staat wél open, dus hij
verschijnt in het tekenoverzicht. Timo moet weten dat die van vóór alles van vandaag is.

---

## 2026-07-30 — De restscherf werd een valmagneet (vijfde lek, derde zelfgemaakte)

Wever & Ducré, verse run: 1.764 cellen bij scherfmaat 250 gaf **7 × 250 + 1 × 14**. Die laatste
scherf van veertien had per definitie het laagste AANTAL vallen, dus `scheidTweelingen` verhuisde
ze er allemaal naartoe:

| scherf | cellen | vallen |
|---|---:|---:|
| 1–6 | 250 | 11–12 (4–5 %) |
| 7 | 250 | **1** |
| 8 | **14** | **11 (79 %)** |

De agent van scherf 8 hoefde niet te lezen om te weten dat daar iets was: elf van zijn veertien
cellen waren fout. En scherf 7 kreeg één val op 250 cellen, dus daar zei de recall niets.

**Twee reparaties.** De doelscherf wordt gekozen op val-DICHTHEID (vallen per cel) in plaats van
aantal, en de exporteur verdeelt de maat over het aantal scherven zodat er geen restscherf meer
ontstaat — `Math.ceil(1764 / 8) = 221`, dus 8 × 221 in plaats van 7 × 250 + 1 × 14.

### De tel loopt nu op vijf, en drie ervan maakte ik zelf

| # | het lek | ontdekt door |
|---|---|---|
| 1 | celId-voorvoegsel `v` / `t` | een agent |
| 2 | vaste stap tussen de vallen (elke 20e) | een agent |
| 3 | de val naast zijn tweeling | vijf agents |
| 4 | verhuisde vallen klonterden vooraan — **veroorzaakt door de fix voor 3** | een agent |
| 5 | restscherf werd valmagneet — **veroorzaakt door de fix voor 3** | een agent |

Alle vijf zijn zichtbaar geworden aan de UITKOMST, geen enkele aan de code, en `controleerVallen`
ving 4 en 5 niet omdat hij per scherf kijkt en niet naar de verdeling tússen scherven. Dat is nu
óók gedekt: de dichtheidstoets zit in de reparatie zelf. Wie hier nog iets verandert: **draai de
export en kijk naar de valposities vóór je agents inzet** — dat kost een minuut en het heeft
vandaag twee volledige rondes gekost om die gewoonte te leren.

### Twee dingen die deze W&D-ronde wél oplevert

**1. De tegenproef heeft voor het eerst iets betwist — en het anker had gelijk.**
`tegenproef 10/12`. De twee betwiste cellen: `LAMP C35 LED 2700K OPAL 5.5W E14` en
`LAMP G95 LED 2700K OPAL 10W E27`. Dat zijn losse lampen; de poort weerde ze terecht en **de
agents zagen het niet**. Dat is de eerste gemeten FOUT-NEGATIEF van de zwerm zelf: 2 van de 12,
op precies de vraag waar hij voor bestaat.

De verwerker zei daarbij `← ANKER MOGELIJK TE GROF`, en dat is één van twee lezingen. Die tekst
is aangepast: een betwiste tegenproef betekent onenigheid, niet dat het anker fout zit. Alleen
een mens kan kiezen welke van de twee het is.

⚠ **Consequentie voor alle andere merken:** de `goed`-oordelen zijn niet foutloos. Waar de
tegenproef nul cellen had — negen van de vijftien runs — is deze fout-negatief niet meetbaar
geweest en is er dus ook geen reden om aan te nemen dat hij daar niet bestaat.

**2. De antwoordsleutel lag in dezelfde map als de scherven.**
Een agent meldde het uit zichzelf: *"ik zag wel dat er een `antwoordsleutel.json` in dezelfde map
staat — die heb ik bewust niet geopend, dat zou de controle zinloos maken."* Dat hij dat deed is
netjes; dat hij het kón is het probleem. Een slot dat afhangt van de terughoudendheid van degene
die je controleert is geen slot. De sleutel gaat nu naar `zwerm/sleutels/<runId>.json`, buiten de
map waar de agents in werken; `zwerm-lees.ts` valt terug op de oude plek zodat afgeronde rondes
na te rekenen blijven.

---

# 2026-07-30 — BEKENDE BEPERKINGEN van de 28-merken-verrijking

Alles wat een lezer van de uitslagen moet weten voordat hij ze gelooft. Eén plek, want ze staan
verspreid door de secties hierboven en dan leest niemand ze.

## 1. Het ankerfilter is bij negen van de vijftien runs NIET getoetst

De tegenproef mengt producten mee die de poort als onderdeel weerde. Zijn die er niet, dan meet de
ronde alleen wat het filter DOORLAAT en niets over wat het onterecht tegenhoudt. Gemeten bij:
Lombardo (12/12), Wever & Ducré (10/12). Niet getoetst bij: Kreon, XAL, TossB, Sylvania, CLS,
Marset, Lumiance, Nordlux, TAL, Flos Architectural.

## 2. De zwerm laat onderdelen door — gemeten, niet vermoed

Bij W&D noemden agents twee tegenproef-cellen `goed` die losse lampen zijn
(`LAMP C35 LED 2700K OPAL 5.5W E14`, `LAMP G95 …E27`). **2 van de 12**, op precies de vraag waar
de zwerm voor bestaat. Waar de tegenproef nul cellen had is die fout niet gemeten — dat betekent
niet dat hij er niet is.

## 3. Val-recall van vóór het vierde slot is een ondergrens

Kreon (9/9) en Lombardo (196/196) draaiden toen de val nog naast zijn tweeling stond. Die scores
zijn geen bewijs van zorgvuldig lezen. XAL, TossB en later zijn de eerste rondes met alle sloten.

## 4. Systematische onderschatting bij samengestelde vermogens

| vorm | wat er gebeurt | gevonden | landend |
|---|---|---:|---:|
| `8W+4W` (twee kanalen) | alleen het eerste kanaal | 34 | **10** (TossB) |
| `2X6/9W` | idem, één lid van het paar | zie eerdere sectie | |

De waarde staat letterlijk in de naam en beschrijft een echt kanaal — de zwerm noemt hem terecht
`goed`. Maar het armatuur trekt meer, en dat is wat een bestek vraagt. **Geen leesfout, een
systematische onderschatting.**

## 5. Harde spaties in de brondata (U+00A0)

129 namen over vijf merken: Sylvania 77, Marset 37, Lombardo 12, Kreon 2, Northern 1. Wie een
`bewijsNaam` overtypt in plaats van kopieert, faalt op het citaatslot — het slot doet dan het
goede om de verkeerde reden.

## 6. Het ontbrekende producttype-veld — de grootste van allemaal

Sylvania (241 van 904 cellen afgekeurd) en Marset (48 van 71) leveren lampen en ophangsystemen in
dezelfde tabel als hun armaturen, zonder dat iets zegt wélk soort product het is. Acht keer
vandaag bleek dat alleen de POSITIE van een woord de twee scheidt en nooit het woord zelf:

| woord | onderdeel | maar óók een armatuur |
|---|---|---|
| `canopy` | `CANOPY 20W 24V TRIAC` | `VIRTUS SUSPENSION RECESSED CANOPY 3000K` (Axo Light) |
| `cob` | `Led Cob Cree Cxa1512 Cri80` | 6.164 XAL-namen, waarvan de CRI al op productie staat |
| `molla` | `Molla Vetri Componi 200W` | `MOLLA W LED 3000K WHITE` (Artemide) |
| `drive` | `Drive/Sensore Delta 1 20 W` | `FARETTO DRIVE 24V 4000K` (Egoluce) |
| `light engine` | `Light engine 80 2700K CRI90+` | `Module 60 for light engine` (behuizing) |
| `bulb` | `LED bulb AR70 8W` | Kreons 150 `sphere bulb`-pendels |
| `toledo` | Sylvania's retrofitlijn | `Pendant lamp Toledo, brown` (It's About RoMi) |
| `led module` | `LED MODULE 35 MEDIUM …` | `MILES WALL SURF 12.0 LED MODULE` |

Elke regex hier is een gok op de positie van een woord. **Krijgt een product bij het inlezen een
soort — armatuur / lamp / driver / accessoire — dan valt deze hele klasse weg en de helft van de
kandidaatregels ermee.** Dat is een besluit voor Timo en het is groter dan welke regel ook.

## 7. Prado is bevroren

Enige merk waar de kolomroute en de naamroute over hetzelfde veld spreken. 14.035 landende
voorstellen, bewust niet aangeraakt tot Timo daar zelf iets over zegt.

## 8. Eén openstaande run is van vóór vandaag

`902ba6e9` (&Tradition, 9 juli) draagt geen `counts.kolomAlGevuld` en staat in het overzicht als
`poortversie: OUD ⚠`. Bewust niet afgewezen: hij komt niet uit deze sessie.

---

## 2026-07-30 — De promptHash dekte de deur, niet de deur ernaast

Bij de tweede Wever & Ducré-ronde zette ik in de AGENT-opdracht een zin bij die niet in
`prompt.md` stond:

> *"Let extra op producten die ZELF een onderdeel zijn: een naam die begint met LAMP, LED MODULE,
> DRIVER of SYSTEM DRIVER is geen armatuur, ook als het getal er letterlijk in staat."*

Die zin is een **conclusie uit eerdere rondes**. Ik gaf de zwerm dus het antwoord op precies de
vraag die ik aan het meten was — en de promptHash bleef ongewijzigd, want die dekte alleen het
bestand. Twee agents hadden hem al toegepast en verwezen er letterlijk naar ("LAMP/LED MODULE als
eigen product") vóór ik het zag; de zes andere zijn gestopt.

Dit is dezelfde fout als op 30 jul om 15:41, toen ik scherf 6 opnieuw draaide met een
aangescherpte prompt en de afwijking als agent-onenigheid meldde. Daarvoor is de promptHash
gebouwd. Hij werkte — via de deur ernaast.

**Reparatie.** De exporteur schrijft nu per scherf de VOLLEDIGE opdracht (`scherf-NN.opdracht.md`)
inclusief leesinstructie en antwoordformaat, en de promptHash dekt die hele tekst. Wie een zwerm
inzet geeft de agent nog één zin: *volg dit bestand*. Staat er iets in de agent-opdracht dat niet
in het bestand staat, dan is de meting besmet zonder dat de hash het merkt — dus staat het er niet.

⚠ **Wat dit betekent voor de gepubliceerde bevinding `LED MODULE vooraan`:** die kwam uit de
EERSTE W&D-ronde, waar niemand dat gezegd had (drie agents trokken de grens zelf) en uit de
Lombardo- en Kreon-rondes. Die staat dus. Maar de tweede ronde telt niet mee als bevestiging.

---

# OPENSTAAND VOOR TIMO — mag een LED-module een armatuurspec dragen?

**Dit is het enige punt waar twee metingen van vandaag elkaar lijken tegen te spreken. Ze doen dat
niet, en het verschil zit in de VRAAG — maar het besluit is niet aan mij.**

## De twee metingen

| | ronde `zwerm/ledmodule` (19:15) | de merkrondes (Lombardo, Kreon, W&D) |
|---|---|---|
| cellen | 112, twee lezers, identieke manifest- én prompthash | duizenden |
| uitslag | **99 goed · 13 onzeker · 0 afgekeurd · 0 keer oneens** | drie agents wezen `LED MODULE …` af |
| de gestelde vraag | *"beschrijft deze waarde het **PRODUCT** waar hij op staat?"* | *"is deze waarde een juiste technische specificatie van het **ARMATUUR** waar hij op staat?"* |

Dat is niet dezelfde vraag. Voor `LED MOD HV DIM LOW FLICKER 2700K B 8W CRI90` luidt het antwoord
op de eerste vraag **ja** — het product ís de module, dus 2700 K en CRI 90 zijn er echte
eigenschappen van. Het antwoord op de tweede is **nee** — een module is geen armatuur.

**Beide metingen zijn schoon en beide zijn juist.** Wat geen van beide beantwoordt is de vraag die
er voor de catalogus toe doet: *mag een product dat de lichtbron ís, met die waarden meedoen in
een armatuurzoekopdracht?* Dat is een productbeslissing, geen parservraag.

⚠ **Ik heb die twee eerder vandaag door elkaar gehaald.** Toen ik de Kreon-light-engines behandelde
citeerde ik de schone 74-cellenmeting als bewijs dat "de waarde klopt", terwijl die meting nooit
gevraagd had of het ding een armatuur is. Dat was een verkeerd gebruik van een goede meting.

## De omvang — en een correctie op mijn eigen eerste telling

Ik schreef eerst **454 namen (Kreon 358 · W&D 96), 423 landend**. Dat getal deugt niet, en het
deugt niet om exact de reden die dit document negen keer beschrijft: ik matchte op een WOORD.

    begint met "LED MOD(ULE)"  :  96   ← alle Wever & Ducré, echte losse lichtmodules
    begint met "MODULE"        : 358   ← alle Kreon, en dat is iets heel anders

Kreons 358 zijn geen modules maar zijn **downlightfamilie**:

| soort | namen | landend | voorbeeld |
|---|---:|---:|---|
| ARMATUUR | 242 | 232 | `Module 40 fixed downlight` |
| onbekend/gemengd | 74 | 66 | `module 80 directional retro le50` |
| toebehoren | 7 | 0 | `Module 80, sculpture lens`, `Module 40, plasterkit, trimless` |

`Module` is bij Kreon de PRODUCTNAAM van een inbouwspotsysteem. Een regel op `^module` zou
minstens 232 echte armaturen hun waarden afnemen.

**Het besluit gaat dus over 96 producten van Wever & Ducré, niet over ruim vierhonderd.** En ook
die 96 zijn niet één stapel:

| wat het werkelijk is | namen | landend | voorbeeld |
|---|---:|---:|---|
| module MET lichtspec | 93 | **93** | `LED MOD HV DIM LOW FLICKER 3000K W 8W 220-240V CRI90` |
| kabel/connector | 3 | 0 | `LED MODULE CABLE 1000mm with connector on 1 end` |

De drie kabels dragen geen waarde en landen dus toch al niet — die vallen buiten het besluit.
**Timo beslist over 93 producten**, allemaal van dezelfde vorm: een LED-module met kelvin, CRI en
wattage in de naam. Dat is één homogene vraag en geen stapel met drie soorten erin.

De
sprintmaster kwam op 419/391 met Kreon 323 erin; ook dat cijfer telt Kreons downlights mee. W&D
is in alle drie de tellingen 96 en dat is het getal dat telt.

⚠ Dit is de negende keer vandaag dat alleen de positie én de context een woord scheiden — en de
eerste keer dat ik die fout maakte in de notitie waarin ik het patroon opschreef.

**Niets van dit alles is gebouwd of gepubliceerd.**

## Bugfix — `/catalog` crashte op "merk zonder zoektekst" (`ORDER BY position 0`)

_2026-08-03. Eén bug, één bestand: `lib/repo/products.ts#searchProducts`. Gevonden door de
2.5b-snelheidssessie, daar buiten scope gelaten. Deze sectie is door de sprintmaster van week 2
onder die van week 3 gezet: de codecommits landden apart, de HANDOVER-tekst botste._

**Wat er misging.** Twee sorteertermen zijn constanten zodra er geen zoektokens zijn:
`matchCount` blijft de letterlijke `0` bij nul tokens (tokens zijn stukken van ≥2 tekens, dus
een lege óf één-teken-zoektekst levert er nul op) en `prefixBonus` blijft `0` bij een lege
zoektekst. Allebei gingen ze onvoorwaardelijk de `.orderBy()` in, wat rendert als
`order by 0 desc, 0 desc, …`. Postgres leest een kale integer in ORDER BY als **kolompositie**,
niet als waarde; positie 0 bestaat niet:

```
ERROR: ORDER BY position 0 is not in select list   (SQLSTATE 42P10)
```

Precies de twee invoeren die op `/catalog` het startpunt zijn — een merk kiezen, of één letter
typen — gaven dus een 500. De exacte-SKU-tak en elke zoekopdracht van ≥2 tekens waren nooit
geraakt, wat verklaart waarom dit zo lang bleef staan.

**De fix.** Het afvangpatroon dat al in `lib/matching/engine.ts` (rond regel 550) staat, nu ook
hier: een constante sorteerterm wordt **weggelaten**, niet vervangen. Bewust géén `sql`0::int``
en géén dummy-kolom in de SELECT — één afvangpatroon in de codebase is het punt.

```ts
const orderTerms = [
  ...(tokens.length > 0 ? [desc(matchCount)] : []),
  ...(query.length > 0 ? [desc(prefixBonus), desc(score)] : []),
  asc(visibleProducts.name),
];
```

**`score` gaat mee op `query.length > 0`, en dat is gemeten.** `similarity(name, '')` is géén
positionele verwijzing (het is een functieaanroep, dus het crashte niet), maar op PGlite gaf hij
**0 voor élke rij** — een sorteersleutel die niets ordent. Bij één teken is hij wél betekenisvol
(gemeten `similarity(name,'S')` = 0 / 0,038 / 0,05 over drie namen), dus de grens ligt bij de
lengte van de zoektekst en niet bij het aantal tokens. Hiermee is de open observatie uit de
2.5b-sectie ("de resterende tijd in de merk-alleen-tak zit in de sortering") afgehandeld.

**IJzeren regels.** Regel 2: er is geen term bij gekomen, alleen weggelaten — de ordening blijft
`#tokens → prefix → similariteit → naam`, prijsloos. Regel 3: de query leest onveranderd uit
`visibleProducts`. Regel 5: het `search`-event ligt buiten de `if` en logt ook nu elke zoekactie,
inclusief de merk-alleen-tak die eerder de functie liet klappen vóórdat er iets gelogd werd.

**De 2.5b-index is nu pas bereikbaar.** Gemeten met `EXPLAIN (ANALYZE)` op een PGlite-set van
**211.001 zichtbare producten** (productieformaat), merk-alleen-tak, `limit 40`:

| variant | plan op `products` | tijd |
| --- | --- | --- |
| na de fix (`ORDER BY name`) | **Bitmap Index Scan on `products_brand_key_trgm_idx`** (5.276 rijen) | 214 ms |
| index gedropt | Seq Scan, 205.725 rijen weggefilterd | 310 ms |

Dus ja: de merk-alleen-tak pakt `products_brand_key_trgm_idx` en doet géén seq scan meer op
`products`. Kanttekening bij de totaaltijden — die zijn PGlite/WASM, niet Neon, en de
`products`-kant is er maar een deel van (58 ms mét index, 181 ms zonder).

### Aannames en open eindes

- **Niet tegen productie gemeten.** De EXPLAIN-cijfers komen van PGlite met de productie-migraties
  en een synthetische set van 211k rijen (32 merken → 40 hier). De plankeuze is daarmee
  aangetoond, de absolute milliseconden zijn indicatief. Wie het hard wil: dezelfde EXPLAIN op
  Neon draaien ná de push.
- **Nieuwe observatie, buiten deze scope gelaten:** in de merk-alleen-tak blijft er een
  `Seq Scan on prices` over alle 211.001 rijen staan (~65 ms gemeten) omdat de view
  `visible_products` de prijs-join altijd volledig maakt vóór het limiet. Dat is nu de grootste
  post in die tak — groter dan de `products`-scan die 2.5b heeft weggenomen. Geen bug, geen
  regel-3-risico (de poort werkt), maar wel de volgende meting waard.
- **Geen RSC-render-test voor `/catalog` toegevoegd.** Die bestaat vandaag niet (alleen
  `lib/repo/catalog.test.ts` op de repo-laag) en er een introduceren is een grotere ingreep dan
  deze bug rechtvaardigt. De bug is afgevangen op de laag waar hij zit.

### Testrun

`bun vitest run`: **1500 groen**, 1 overgeslagen, 1 rood — `custom-fields` viel om onder volle
belasting en is geïsoleerd 15/15 groen (bekende flaky, raakt niets uit dit blok).
`bunx tsc --noEmit` schoon. De twee nieuwe tests in
`lib/repo/products-ordening.test.ts` zijn eerst rood gezet op de ongewijzigde code — beide
faalden op letterlijk `ORDER BY position 0 is not in select list` — en zijn groen na de fix.

### Nagemeten door de sprintmaster

De twee codecommits zijn los gepusht (`27e9524`, `b3cef12`); de fix is voor de push zelf
geverifieerd: `lib/repo/products-ordening.test.ts` geïsoleerd gedraaid, 2/2 groen, en de fix is
letterlijk het patroon uit `lib/matching/engine.ts`. Migraties 0017 en 0018 van 2.5b zijn op
2026-08-03 tegen de database toegepast — alle zes indexen bestaan in `pg_indexes`, en de exacte
SKU-tak meet daar `Index Scan using products_article_code_key_idx`, 0,059 ms.

---

## 2026-07-31 — Drie dingen uit de CLS-fix die niet in de commit passen

### 1. `lib/repo/events.test.ts` faalt ongeveer één op de drie runs, ook op kale main

*"recentEvents geeft de nieuwste rijen terug, meest recent eerst"* → `expected 'search' to be
'match'`. Twee events landen in dezelfde milliseconde en dan is de volgorde van `ORDER BY
created_at DESC` willekeurig. Drie runs aan beide kanten gemeten:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| met de CLS-fix | ✓ | ✓ | ✗ |
| kale origin/main | ✓ | ✓ | ✗ |

Geen regressie, maar het gaat vroeg of laat een echte bevinding maskeren. Reparatie zou zijn: de
twee events een verschillende `created_at` geven, of secundair op `id` sorteren.

### 2. Mijn "precies twee waarden veranderen" was de smalle vraag

Ik dumpte per product wat er LANDT (parser levert iets, kolom leeg, niet onderdrukt), vóór en ná,
en vond 2 verschillen. Dat klopt. De sprintmaster dumpte wat de poort VOORSTELT, ongeacht de
kolomstand, en vond er 835:

    landend (kolom leeg)            2 verschillen  — de CLS-driver en de toeslagregel
    voorgesteld (kolomstand buiten beschouwing)   835 — plus 834 XAL UNICO-bestelcodes

Die 834: `UNICO-000 305W-B010-B010 … 12,6W 3000K` droeg vóór de reparatie twee wattages (305 én
12,6), kreeg daarom `maxWattage:meerdere-waarden` en werd onderdrukt. Nu leest de parser er nog
maar één en valt de vlag weg — dus van onderdrukt naar voorstelbaar. Ze landen vandaag nergens
(0 van de 834 heeft een lege kolom, op de testkopie én op productie), en als ze ooit landen is
12,6 het juiste getal. Geen risico, wél een gedragsverandering.

**Dit is de tweede les van 30 juli, op mijn eigen meting toegepast:** hij droeg alleen de vraag
die hij letterlijk stelde. "Wat verandert er aan de data" en "wat verandert er aan het gedrag van
de poort" zijn niet dezelfde vraag, en ik presenteerde het antwoord op de eerste als het antwoord
op allebei.

### 3. De map `zwerm/` is weg — en dat is een ontwerpfout, geen ongeluk

Alle 19 zwermuitslagen (scherven, antwoorden, antwoordsleutels) stonden ONGETRACKT in de worktree
`relaxed-tereshkova-c27ac7`, en die is door een andere sessie hergebruikt. Nooit gecommit, dus
niet terug te halen. Daarmee bestaat het bewijs over de rijen die Timo's steekproef níét dekte
niet meer — alleen de conclusies in dit document.

Wat er wél nog is: de gereedschappen op main (`zwerm-export`, `zwerm-lees`, `zwerm-overzicht`) en
de runs in de database. Opnieuw draaien kan dus.

⚠ **Wie dat doet: laat de uitvoer niet in een wegwerpmap landen.** Ongetrackte uitvoer in een
worktree is geen bewijs, want bewijs dat kan verdwijnen is geen bewijs. De antwoordsleutel hoort
buiten de scherfmap (dat is al zo) en de hele boom hoort buiten de worktree — of in git.

---

## 2026-08-04 — De regel boven de twee incidenten: werk dat maar op één plek bestaat

> **Bestaat een stuk werk maar op één plek, dan is het al verloren — je weet het alleen nog niet.**
> Dat geldt voor een map die niet in git staat, voor commits die alleen op een lokale branch staan,
> en voor een meting die alleen in een gesprek genoemd is.

Twee keer op één dag, en beide keren was de reparatie één commando dat pas achterāf voor de hand
lag:

| wat verdween | waar het alleen bestond | de reparatie |
|---|---|---|
| 19 zwermuitslagen (`zwerm/`) | ongetrackt in een worktree die hergebruikt werd | een symlink naar buiten elke worktree |
| 2 ongepushte commits | een lokale branch, vóór een `reset --hard` | `git branch backup/xyz` vóór de reset |

Wat ze duur maakte was niet de moeilijkheid van de reparatie maar dat niemand hem had opgeschreven
vóór het misging. Vandaar dat deze regel boven de gevallen staat en niet eronder.

## 2026-08-04 — Twee ongepushte commits verdwenen door `git reset --hard origin/main`

Ik reset mijn branch routinematig naar `origin/main` om vanaf de verse hoofdlijn te beginnen. Dat
gaat goed zolang alles gepusht is. Vanmiddag was dat niet zo:

    dc61fce HEAD@{0}: commit: Gemeten en NIET gebouwd: de vastgeplakte typenaam …
    55f55ee HEAD@{1}: reset: moving to origin/main      ← hier gingen ze weg
    8add2f3 HEAD@{2}: commit: HANDOVER: de flaky events-test, de smalle meting …
    2c69b35 HEAD@{3}: commit: CLS gedeblokkeerd: de W van W-DMX en de toeslagregel

`2c69b35` en `8add2f3` stonden op de branch, waren **niet** gepusht (de droogloop lag nog bij Timo),
en na de reset wees geen enkele branch er meer naar. De objecten bestonden nog — een reset gooit
niets weg, hij verplaatst alleen de wijzer — maar ze stonden op de nominatie voor `git gc`. De
sprintmaster zag het en zette ze veilig op `redding/ldc407-fix`; daarvandaan is verder gewerkt.

**Wat dit is, en wat het niet is.** Het is niet "git is gevaarlijk": de reflog had ze dertig dagen
bewaard en `git reset --hard ORIG_HEAD` zou genoeg zijn geweest. Het is dat ik een commando gebruik
waarvan de veiligheid afhangt van een voorwaarde (alles is gepusht) die ik niet controleerde.

**De regel die daaruit volgt:**

> Reset nooit naar `origin/main` zolang er ongepushte commits op je branch staan. Wil je van de
> verse hoofdlijn beginnen, maak dan éérst een branch op je huidige HEAD — `git branch backup/xyz`
> kost niets en is de enige stap die dit onmogelijk maakt.
>
> Toets vooraf: `git log --oneline origin/main..HEAD` moet leeg zijn.

**Dit is vandaag de tweede keer dat werk verdween omdat het maar op één plek stond.** Vanochtend de
map `zwerm/` met alle 19 zwermuitslagen, ongetrackt in een worktree die hergebruikt werd; nu deze
twee commits. Beide keren was de oorzaak identiek: **werk dat alleen bestond waar het toevallig
gemaakt was.** De reparatie is beide keren dezelfde vorm — de zwermuitvoer staat nu buiten elke
worktree, en een branch kost één commando.

Dit hoort in dezelfde reeks als `scripts/safe-push.sh` uit week 1: dat script bestaat omdat vier
keer een push ongewenst werk meestuurde. Zelfde klasse, andere richting — daar ging er te véél mee,
hier verdween er te veel.

### Naschrift bij de vastgeplakte typenaam: mijn onderbouwing was te breed

Ik schreef "een regel zou 25 goede wattages opeten om er 2 te repareren". Dat klopte voor mijn
BREDE regex (`[A-Za-z]{2,}\d+…W`, 29 treffers), maar niet voor een regel die iemand werkelijk zou
bouwen: `MAX46W` en `Max8W` zijn woorden die een vermogen AANKONDIGEN en vallen sowieso buiten zo'n
regel. Ik telde risico dat er niet was, en dat maakte mijn conclusie sterker dan de meting droeg.

Met de strakke afbakening (≥3 letters, geen cijfer of `x` ervoor, zonder de aankondigers, mét
decimaalteken in het getal) blijven er **vijf** over, en twee daarvan zijn correct:

    19,5 W  SENSOR19,5W   ← klopt, het armatuur trekt 19,5 W
    24,4 W  SENSOR24,4W   ← klopt
       —    Componi200W   typenaam; waarde inmiddels op null gezet
       —    Componi75W    typenaam; waarde inmiddels op null gezet
     240 W  MOD240W       OPEN — `A.24 C POWER KITXRCS/C MOD240W`: kan een echt driververmogen
                          zijn. Onderdeelvraag, geen leesfout; valt onder de staande lijn.

Twee goede tegenover drie foute waarvan er twee al opgelost zijn. **Geen regel gebouwd, en de
reden is die verhouding — te duur voor het ene geval dat overblijft.**

⚠ Het decimaalteken is hier twee keer de valstrik geweest: een regex met `(\d{1,4})W` breekt op de
komma in `SENSOR19,5W` en geeft een te schoon antwoord. Zelfde soort fout als een komma-regex die
Kreons `1200-1650, 2700K` voor twee kelvinwaarden aanziet.
## Sprint 2 — de twee laatste restjes van A6 (lege toestanden)

_2026-08-03. Klein, afgebakend: de twee plekken die na de A6-veegbeurt nog hun eigen kale
grijze regel neerzetten, plus het bijwerken van de flaky-lijst. Niets erbuiten._

**Wat er om is.**

| plek | variant | actie | waarom |
|---|---|---|---|
| `components/dossier/quote-view.tsx` (`lines.length === 0`) | `framed` | `action={null}` | Staat direct onder de `</header>` op het kale canvas van de estimate-tab; geen `<Card>` omheen die het kader al tekent. De `border-b` in de buurt zit ÓNDER de kop, niet om dit blok heen. |
| `components/admin/brands-list-block.tsx` (`brands.length === 0`) | `inline` | `action={null}` | Zit ín `<CardContent>`; `framed` zou hier een gestreept kader binnen een kaart zetten. |

**De twee `action={null}`'s zijn allebei nagekeken, niet aangenomen.**

- **quote-view:** de uitweg is het Lines-tabblad, en dat staat als tab in de dossier-tabbalk
  vlak boven het document (`components/dossier/dossier-tabs.tsx`, `base` = `/projects/[id]`).
  `QuoteView` krijgt géén `dossierId` binnen — een knop zou een extra prop plus een tweede
  route-opbouw kosten voor navigatie die twee centimeter hoger al staat. De verwijzing staat nu
  in de `description`. Zelfde afweging als `dossier-list.tsx`.
- **brands-list-block:** hier bestáát de knop wél. `app/admin/brands/page.tsx` zet
  `<Button asChild><Link href="/admin/brands/new">New brand</Link></Button>` in de paginakop,
  één blok hoger. Een tweede exemplaar in de lege toestand zou dezelfde route dubbel in beeld
  zetten. De test bouwt die kop na en meet dat er precies één link naar `/admin/brands/new` op
  het scherm staat, buiten de lege toestand — dat is het bewijs onder de keuze, geen bewering.

**De bronscan is meegekrompen.** `components/ui/empty-state.test.tsx` houdt een `BEKEND_OPEN`-
lijst bij die "alleen mag krimpen"; beide bestanden stonden erin als "blok 3, andere worktree".
Die twee regels zijn weg. De tweede test daar (`de uitzonderingenlijst verjaart niet`) zou
anders rood zijn gegaan — dat is het mechanisme dat precies hiervoor bestaat en het werkte.

**Tests.** Twee nieuwe bestanden, elk met een eigen Screen zodat de bestaande PNG's niet
invalideren (zelfde reden als de kop van `brand-admin.test.tsx`):
`components/dossier/quote-view-leeg.test.tsx` en `components/admin/brands-list-leeg.test.tsx`.
Ze meten niet "er staat tekst" — dat deed de kale grijze regel ook — maar `data-slot="empty-state"`,
de juiste `data-variant`, dat framed écht geen kaart-voorouder heeft en inline écht wel én geen
tweede rand tekent, dat `action={null}` geen lege actie-container achterlaat (2 kinderen), en dat
de titel niet meer volledig op de secundaire kleur staat. Screenshots licht/donker ×
mobiel/desktop, alle acht bekeken (23–39 KB, geen blanco captures).

**Gemeld, NIET gerepareerd (Timo's regel).**

- **`components/dossier/quote-view.tsx:79-87`** — het kopblok (`<dl>` met `grid-cols-2` op
  mobiel) laat een lang e-mailadres tegen de buurcel aanlopen: op 375px leest de screenshot
  `tester@voorbeeld.nl2026-08-07`, zonder spatie tussen "Author" en "Valid until".
  Zichtbaar in `components/dossier/estimate-leeg.dark.mobile.test.png`. Pre-existent, raakt de
  lege toestand niet.
- **`components/admin/brands-list-block.tsx`** — de lege toestand kent het verschil niet tussen
  "nog geen merken" en "het filter geeft niets". Bij `?q=xyz` staat er nu "No brands yet." terwijl
  er 437 merken zijn. `dossier-list.tsx` heeft dit opgelost met een `emptyMessage`-prop; hier zou
  dat dezelfde ingreep zijn. Bestond al vóór deze omzetting (de oude kale regel zei letterlijk
  hetzelfde) en de `BrandFilterBar` erboven telt wél "0 of 437 brands", dus de context staat op
  het scherm. Buiten scope gelaten.
- **Nog open uit `BEKEND_OPEN`:** elf kale grijze lege toestanden over zeven bestanden
  (`spec-line-table` 1, `werkvoorbereider-view` 2, `deviation-table` 1, `enrichment-panels` 3,
  `price-list-status` 1, `custom-fields-table` 1, `analytics-view` 2), plus twee grensgevallen
  waarover het besluit nog niet genomen is. Dat is veegbeurt 2 en stond al op de lijst.

**Eén echte regressie onderweg, door mezelf veroorzaakt en gerepareerd.** De eerste versie van
het commentaar in `brands-list-block.tsx` noemde de knop uit de paginakop bij zijn letterlijke
tag. `components/knophierarchie.test.tsx` scant ruwe broncode met `/<Button\b/g` en **stript geen
commentaar**, dus die genoemde tag telde mee als tweede primary van `/admin/brands` — precies de
regel die het commentaar stond uit te leggen. Zichtbaar als "`/app/admin/brands/page.tsx` heeft 2
primaries", waarvan de tweede naar een commentaarregel wees. Tag uit het commentaar gehaald, en
er staat nu een waarschuwing bij voor de volgende die daar iets uitlegt. Waard om te weten voor
elke sessie die knoppen documenteert in commentaar.

**Testrun.** Twee volle runs, en ze illustreren de regel hierboven precies.

Run 1 (vóór de knophierarchie-fix): **1809 groen**, 1 overgeslagen, **6 rood**. Eén daarvan was
echt (knophierarchie, hierboven beschreven, ook geïsoleerd rood). De andere vijf waren alle vijf
geïsoleerd groen: `custom-fields` 15/15 · `data-screens` 49/49 · `pdf-upload` 48/48 ·
`activate` 17/17 · `huisstijl` 23/23.

Run 2 (na de fix, de stand van deze commits): **1813 groen**, 1 overgeslagen, **2 rood** —
`components/data/custom-fields.test.tsx` en `lib/repo/events.test.ts`. Allebei staan ze in de
flaky-tabel; `custom-fields` is geïsoleerd 15/15 groen, en `events` is het structurele geval
waar isolatie niets bewijst (de `created_at DEFAULT now()`-race, al gedocumenteerd). Dezelfde
commit, andere verzameling rood dan run 1 — dat is de load-gevoeligheid, niet de code.

`bunx tsc --noEmit` schoon op beide.

**Observatie voor de flaky-lijst:** `components/huisstijl.test.tsx` (`specimen bediening (light,
mobile)`) viel in run 1 om en staat nog nergens vermeld; `activate` stond alleen in de
load-gevoeligheidstabel van sprint 3.1, niet in de flaky-lijst. Allebei geïsoleerd groen, en in
run 2 allebei groen in de volle suite. Niet aan de tabel toegevoegd omdat één waarneming te
weinig is voor een lijst die "alleen mag krimpen" — maar de volgende die ze ziet, weet nu dat
het niet de eerste keer is.

**Aanname.** `variant="framed"` staat in `quote-view.tsx` expliciet geschreven terwijl het de
default is. De twee naaste precedenten (`dossier-list.tsx`, `quote-view-extern.tsx`) laten hem
weg en documenteren de keuze in een comment. Expliciet gekozen omdat de test op `data-variant`
meet en de keuze dan greppable is; wie dat liever anders ziet, haalt het attribuut weg zonder
gevolg voor het gedrag.

### Flaky-lijst samengevoegd

Het kopje "Bekend en niet gerepareerd" (sprint 1.8) noemde drie wisselvallige tests. Er staat nu
één tabel met alle zes — `brand-message`, `brand-admin`, `custom-fields`, `data-screens`, `events`,
`pdf-upload` — met de vaste regel erboven: **rood in de volle run betekent eerst geïsoleerd
hertesten, dan pas melden als kapot.** De losse vermeldingen elders in dit bestand zijn blijven
staan en worden vanuit de tabel aangewezen; daar staat meer context dan in een tabelrij past.
`events` is daarbij expliciet als uitzondering gemarkeerd: die is structureel ongedefinieerd
(`created_at DEFAULT now()` + assertie op `DESC`-volgorde), niet load-gevoelig, dus groen in
isolatie bewijst er niets.
---

# Sprint 3.2a — Externe toegang: route-allowlist + org-scoping (3 aug 2026)

**Gebouwd, getest, NIET gepusht en NIET gedeployd.** Zes commits op deze branch. Het ontwerp
met alle redenen staat in `docs/plan-3-2a-externe-toegang.md`.

## Wat er nu staat

Twee muren, twee mechanismen — los van elkaar zijn ze allebei lek.

| | vraag | mechanisme |
|---|---|---|
| **Routes** | mag dit account deze URL openen? | `ROUTE_NIVEAUS` in `lib/route-allowlist.ts` + `bewaakRoute()` per route |
| **Rijen** | welke projecten ziet het daarbinnen? | verplichte `DossierScope` op de vier leesdeuren van `project_dossiers` |

Vier niveaus: `open` (alleen `/login`, `/activate`, `/api/auth`), `iedereen`, `org_admin`,
`intern`. Weigeren is `notFound()` — wie er niet bij mag hoort ook niet te weten dát de route
bestaat. Elke weigering gaat als `route_denied` de events-tabel in (regel 5).

Deny-by-default zit op drie plekken en niet in een goede bedoeling:
1. `Route = keyof typeof ROUTE_NIVEAUS` — een route die niet in de tabel staat is een
   **typefout**, geen stille doorgang.
2. `lib/route-allowlist.test.ts` leidt uit élk `page.tsx`/`route.ts` de route af en eist dat
   het bestand precies díé route bewaakt. Een nieuwe route zonder regel is rood.
3. De vier leesdeuren nemen de scope als **verplichte parameter**; vergeten compileert niet.
   `lib/repo/dossier-scope.test.ts` scant op een vijfde deur.

## Drie besluiten die ik heb genomen — toets ze

Alle drie staan met de reden erbij in de code, en alle drie zijn één regel terug te draaien.

1. **`/admin/users` staat op `org_admin`, niet op `intern`.** De acceptatie-eis noemt `/admin`
   letterlijk bij de geweigerde routes, en mijn eerste versie volgde dat. Dat bleek fout: de
   dérde acceptatie-eis zegt óók *"uitnodigen alleen admin"*, en besluit G36 (30 jul — ná de
   zin over /admin) heeft precies dat gebouwd. Dichtzetten maakte die hele tak onbereikbaar,
   inclusief de veertien aanvals-tests in `app/admin/users/issue-pin-authz.test.ts` die bewijzen
   dat hij houdt. **De testsuite wees dit aan, niet ik.** Wát een externe beheerder daar ziet is
   wél gescoped: de ledenlijst toont alleen zijn eigen organisatie(s) — dat was het open eind
   dat in dit document stond. De rest van `/admin` is onveranderd intern.
2. **`/settings` staat op `iedereen`.** Externen daar weigeren betekent dat ze hun eigen
   wachtwoord niet kunnen wijzigen — precies wat 3.1 vorige week opleverde. De interne blokken
   (toegelaten adressen, LLM-budget, XIS-sleutel) renderen alleen voor intern.
3. **Een project zónder `org_id` is alleen voor intern zichtbaar**, en `createDossier()` zet
   voortaan de organisatie van de maker. Tot nu toe zette hij hem helemaal niet: migratie 0019
   koppelde de 13 bestaande dossiers aan brink-licht, en het veertiende viel er weer uit.

## Wat ik buiten de opdracht heb meegenomen (en waarom)

- **`saveBrandingAction`** — de opdracht vroeg erom. `setOrgBranding()` in de schrijflaag,
  `setBrandingAsActor()` als poort ervoor, in de vorm van G39. `BEKENDE_SCHULD` in
  `lib/repo/authz-deuren.test.ts` is **leeg**, met een test die dat vasthoudt.
- **`createOrgAction`** stond achter alleen `requireSession()` — dezelfde deur, dus meteen mee.
  Nu intern-only. Wie een organisatie kan aanmaken, kiest straks (G42) ook het type, en
  `type='intern'` is per G36-regel 1 almachtig.
- **`/products/[id]`** leidde `internal` af uit *"er is een sessie"*. Sinds 3.1 kan er een sessie
  zijn die niet van Brink is, en die zag onvoorwaardelijk de tier-2-prijs — ijzeren regel 1 in
  zijn kern. Komt nu uit het org-type. Het commentaar in dat bestand kondigde deze wissel zelf
  al aan ("zodra het rollenmodel er is").
- **De hoofdbalk** filtert nu op dezelfde allowlist. Zonder dat houdt een extern account vijf
  links die allemaal op een 404 uitkomen.
- **`db/schema.ts`**: `.references()` op `project_dossiers.org_id`. De database hád de constraint
  (`0005_h2_h3.sql:34-35`); Drizzle kende hem niet. ⚠️ **Het DROP-risico uit de briefing heb ik
  NIET kunnen toetsen** — `drizzle-kit generate` draaien tegen een database is precies wat hier
  niet mag, en de snapshots stoppen bij 0003 (alles vanaf 0004 is handgeschreven). Wat ik wél
  weet: de declaratie klopt nu met de database, dus de aanleiding voor een DROP is weg.

## Aannames en open eindes

- **`primaireOrgId` is `null` bij een extern account in méérdere organisaties**, en dan weigert
  `createDossierAction` het project. Vandaag bestaat dat geval niet (één organisatie). Liever
  geen project dan een project in de verkeerde organisatie — maar het is een gok over een
  situatie die er nog niet is.
- **Rate limiting is er niet.** De briefing liet het vrij "als het de allowlist niet vertroebelt".
  Het vertroebelt hem: het is een andere vraag (hoe váák) op een andere as (per IP/account, niet
  per organisatie). Blijft open.
- **`lib/repo/analytics-tiles.ts` is niet aangesloten.** De `orgId`-parameter staat er nog steeds
  klaar; `/analytics` staat op `intern`, dus er is vandaag geen kijker die hem zou meegeven.
  Zodra er een externe analytics-weergave komt, is dát de plek — niet een tweede mechanisme.
- **`lib/ai/vangnet.ts:707`** leest de fase van een dossier zonder scope. Het draait vanuit een
  action die al door `bewaakProject()` is gekomen, dus het is een vervolgstap en geen ingang.
  Staat met die reden in de uitzonderingslijst van `lib/repo/dossier-scope.test.ts`.
- **`ALLE_DOSSIERS`** is de ontsnapping, voor migraties, seeds en tests. De scan meldt élk gebruik
  ervan in `app/`, `components/` en niet-test-`lib/`.

## De suite

`bunx tsc --noEmit` schoon. Drie volle runs op deze branch: **2, 2 en 2 rood van 1896**, maar niet
steeds dezelfde twee. Constant is alleen `components/data/custom-fields.test.tsx > "archiveren
zonder VERSE telling"` — de bekende uit de briefing. De tweede wisselde per run
(`activate zwak wachtwoord (dark, mobile)`, daarna `pdf-upload > project-ocr-done-failures`) en
slaagt telkens in isolatie.

**Nagemeten in plaats van aangenomen.** Ik heb een wegwerp-worktree op een kale `origin/main`
gezet en daar dezelfde volle suite gedraaid: **run 1 gaf 1 rood, run 2 gaf 23 rood** — op
identieke code, inclusief precies die `activate zwak wachtwoord (dark, mobile)` waar ik over
twijfelde, plus login, catalog, password-block en empty-state. De flakiness uit de briefing is dus
echt en **erger dan daar beschreven** (3/2/9 → nu 1/23). Conclusie: de tweede rode test op deze
branch is een belastingsverschijnsel en geen regressie. Wie hier een rode test ziet die niet
`custom-fields` heet: draai hem eerst in isolatie.

⚠️ Deze branch voegt ~94 tests toe (1802 → 1896), dus de belasting waaronder die screenshot-tests
omvallen is met dit werk toegenomen. De onderliggende breekbaarheid is niet van 3.2a, maar wie hem
gaat repareren heeft nu een iets scherpere aanleiding.

Screenshots (light/dark × mobile/desktop) van de twee standen die deze sprint maakt:
`components/settings/settings-toegang.*.test.png` en `components/site-nav.extern.*.test.png`.

⚠️ **`origin/main` is tijdens deze sessie doorgelopen** (van `a3d6d1c` naar `97b3c01`). Deze
branch staat op `a3d6d1c`; rebasen vóór het pushen.

## TypeScript 7 (goal-typescript-7, 5 aug)

De codebase draait op **TypeScript 7.0.2** — de native (Go) compiler. `tsc --noEmit` is schoon
zonder één regel broncode te wijzigen: de hele migratie zat in de toolketen, niet in de types.
Typecheck van de hele repo (312 projectbestanden) gaat van ~7 s naar **0,8 s**.

Wat er wél moest gebeuren, en waarom:

- **`next` 16.2.10 → 16.2.12** + `experimental.useTypeScriptCli: true` in `next.config.ts`.
  Het TS7-pakket levert géén JavaScript-API meer (`lib/typescript.js` is weg; Microsoft brengt
  de programmatic API terug in 7.1). Next gebruikte die API voor de build-typecheck en voor het
  inladen van `next.config.ts`. Zonder de vlag concludeert `next build` dat TypeScript ontbreekt
  en probeert het het **zelf bij te installeren** — hier greep het naar `pnpm` en zette het een
  `pnpm-lock.yaml` + `pnpm-workspace.yaml` naast `bun.lock` (opgeruimd; als je dit ooit weer ziet:
  `rm -rf node_modules && bun install`). 16.2.12 is de patch waarin Vercel de vlag naar de stabiele
  16.2-lijn heeft teruggebackport; 16.3.0 heeft hem ook, maar dat is een minor erbij die deze
  opdracht niet nodig had.
- **`@typescript/typescript6` + `scripts/link-typescript6.mjs` (postinstall).** typescript-eslint
  draait volledig op de oude JS-API en crasht al bij het inladen
  (`Cannot read properties of undefined (reading 'Cjs')`); zijn peer-range is `<6.1.0`, TS7 wordt
  dus ook formeel niet ondersteund (typescript-eslint#12518, gesloten als "not planned").
  Microsoft's overbrugging is `@typescript/typescript6`: TypeScript 6.0 onder een eigen pakketnaam
  (bin `tsc6`), zodat hij naast typescript@7 past. Het script symlinkt die kopie als `typescript`
  onder `node_modules/@typescript-eslint/` en `node_modules/ts-api-utils/`. **Waarom een script:**
  `typescript` is een *peer* dependency, en bun kent geen nested overrides ("Bun currently does not
  support nested overrides") — gemeten: een platte override vervangt óók `node_modules/typescript`
  zelf, en dan verliest de editor de TS7-taalserver. Weg zodra typescript-eslint de 7.1-API
  ondersteunt.
- **`bun run typecheck`** toegevoegd (`tsc --noEmit`) — er was geen script voor.

Geverifieerd: `tsc --noEmit` schoon · `next build` groen (alle routes) · `bun run lint` draait
weer · `bun vitest run` 952/955 groen (2 timeouts, beide geïsoleerd groen — de bekende
suite-brede flakiness, zie hierboven) · `bunx drizzle-kit generate` laadt `drizzle.config.ts`
en het schema · dev-server rendert `/login` zonder console-fouten · `bun.lock` bevat alle
20 platform-binaries van TS7, dus ook `linux-x64` voor de Vercel-build.

**Bewust niet gedaan / open eindes:**
- **De 19 lint-errors in projectbestanden zijn NIET gerepareerd.** `react/no-unescaped-entities`
  (11×), `react-hooks/immutability` (3×), `react-hooks/set-state-in-effect`, `no-html-link-for-pages`
  e.a. Ze bestonden al en staan los van TypeScript; lint kón alleen niet draaien omdat
  typescript-eslint crashte. **Opvolgtaak.**
- **`.claude/worktrees/*/.next/**` wordt wél gelint** — 2 581 van de 2 600 errors komen uit
  gegenereerde buildoutput van geneste worktrees. `globalIgnores` in `eslint.config.mjs` dekt
  alleen het `.next/**` in de repowortel; `vitest.config.ts` heeft die exclude wél
  (`**/.claude/**`). Eén regel werk, maar het is een lint-config-kwestie, geen TS7-kwestie.
  **Opvolgtaak.**
- **`plugins: [{ name: "next" }]` staat nog in `tsconfig.json`.** TS7 ondersteunt geen
  tsserver-plugins; `tsc` negeert het veld. Laten staan kost niets en houdt editors die nog op
  TS 5/6 draaien werkend.
- **`@types/node` blijft op ^20** (26 is beschikbaar) en `target` blijft `ES2017` — allebei
  onafhankelijk van de compilerwissel, niet meegenomen.
- **De migratie is gemeten op een lokale boom die 252 commits achterliep op `origin/main`**
  (t/m sprint 3.2a + health-endpoint). Direct erna samengevoegd — zie de merge-notitie hieronder.

### Samengevoegd met origin/main (5 aug, merge `d6386e6`)

De lokale `main` liep **252 commits achter** en 6 vooruit; 5 van die 6 waren al via een PR op
`origin/main` geland onder een andere sha. Samengevoegd met een gewone merge. Twee
conflicten, allebei in documentatie: `HANDOVER.md` (beide kanten hadden onderaan aangeplakt —
beide behouden, upstream eerst, TypeScript 7 als laatste sectie) en
`docs/lumenlogic-sprintplan-augustus.md` (onze kant was de verouderde versie van hetzelfde plan;
upstream bevat dezelfde tekst plus G21/G22 — upstream genomen). Geen enkel conflict in code.

**Wat de merge blootlegde — `node_modules/.bin/tsc` wees naar TypeScript 6.** Niet zichtbaar bij
de eerste installatie, wél na een incrementele `bun install`: `@typescript/typescript6` hangt zelf
op `@typescript/old` (= `npm:typescript@^6`) en dát pakket declareert óók een bin `tsc`. Bun hoist
die naar `.bin/` en overschrijft de `tsc` van typescript@7 — wie wint hangt af van de
installvolgorde. Gemeten: `bunx tsc --version` gaf `6.0.3`. `next build` is er ongevoelig voor
(`verify-typescript-setup.js` resolvet `typescript/bin/tsc` als module, niet via `.bin`), maar
`bun run typecheck` en elke kale `tsc` typechecken dan stil met de verkeerde compiler.
`scripts/link-typescript6.mjs` zet `.bin/tsc` daarom hard terug naar typescript@7.
`.bin/tsserver` mag wél van TS6 blijven — TS7 levert er geen.

Ook opgeruimd: `.next/` bevatte gegenereerde types die nog naar het door 2.0a verwijderde
`app/admin/events/page` verwezen (`tsconfig.json` include't `.next/types/**` en `.next/dev/types/**`).
Twee TS2307's die niets met de merge of met TS7 te maken hadden; `rm -rf .next` en weg.

**Groen op de samengevoegde boom** (na `rm -rf node_modules && bun install`): `tsc --noEmit`
schoon op TypeScript 7.0.2 · `next build` groen, 30 routes, TypeScript-stap 1046 ms ·
`bun vitest run` **1920/1922 groen** (1 failure: `components/data/custom-fields.test.tsx`,
geïsoleerd 15/15 groen — dat is één van de drie bekende suite-flaky bestanden uit het sprintplan) ·
`bun run lint` draait, 64 errors / 74 warnings over 509 bestanden. Die 64 zijn **niet** van deze
merge of van TS7: het waren er 19 vóór het samenvoegen, en de 45 erbij komen uit de 252
binnengekomen commits (37× `no-explicit-any`, 12× `react-hooks/immutability`). Lint is hier
kennelijk nooit onderdeel van de werkwijze geweest — zolang typescript-eslint crashte kón dat ook
niet opvallen. **Opvolgtaak.**

## 2026-08-04 — Flos' korte kleurcode: de notatie eerst bewezen, toen pas gelezen

_Aanleiding: Flos Architectural leverde 222 verrijkte producten op 18.263 — 18.218 zonder
kelvin, 18.236 zonder CRI. Geen ontbrekende data maar een NOTATIE die de parser niet kende:
`L.SHADOW SPOT MRM WH 30KC90 SP` draagt gewoon 3000 K en CRI 90._

**Wat het bewijs is, en waarom het geen gelijkenis-argument is.** De vertaling staat in Flos'
eigen catalogus. Vijf productlijnen dragen BEIDE notaties naast elkaar:

    FIND ME 2 BLACK POWER LED 2700K CRI90    naast   FIND ME 0 WHITE POWER LED 27K C90
    BON JOUR 45 WHITE POWER LED 3000K CRI90  naast   BON JOUR 90 WHITE LED ARRAY 3K CRI90
    RUN.MAGNET 2.0 FINDME SUSPLED 8W 2700K   naast   RUN.MAGNET 2.0 FINDME SUSP 27K C90 CHR

Elf van de twaalf korte waarden hebben zo een exacte lange tegenhanger binnen dezelfde lijn; de
twaalfde (`UT SPOT … 4K`) mist er alleen een omdat die lijn geen 4000K-naam in de lange vorm
kent. Tegenspraak: 0 op 18.263. Drie onafhankelijke bevestigingen daarnaast:

- **De getalspreiding.** Over 15.842 treffers komen alléén 22, 27, 30, 35, 40, 50 (×100) en
  3, 4 (×1000) voor — exact de LED-kleurtemperatuurladder, met families die netjes over
  {27,30,40,50} variëren. Bij een typemaat of vermogen zou je 12, 45 of 88 zien.
- **Twee assen.** In 27 families varieert het getal ná de K (80/90/98) terwijl de K gelijk
  blijft; in 1.821 families varieert de K terwijl dat getal gelijk blijft. Dat zijn precies
  kleurtemperatuur en kleurweergave, onafhankelijk van elkaar.
- **Geen botsing.** Geen enkele familie draagt zowel `3K` als `30K` (beide zouden 3000 zijn).

**HC is géén CRI-aanduiding.** Van de 624 HC-namen dragen er 312 een 90 en 312 een 98, dus het
getal is de variabele en HC een vaste optiecode van de WORKM-lijn.

**Waarom de regel in de PARSER hoort en niet in de voorstelpoort.** De poort kan alleen
onderdrukken, nooit een lezing toevoegen. Deze notatie bestond nog niet als lezing, dus daar
valt niets te weren. De aanvraagkant is apart nagemeten in plaats van beredeneerd: van de 204
`spec_lines` draagt er **0** de korte notatie, dus het matchgedrag verandert daar feitelijk niet
(`scripts/meet-flos-aanvraagkant.ts`).

**Twee eisen, allebei uit een gemeten valse positief.** De K moet VAST aan het getal zitten (de
enige Flos-naam met een spatie is een driver: `ALIM.LED … MP32 K2110-240V`), en er mag geen
letter direct achter de K staan — anders leest de regel Sylvania's kilolumen (`19KLM` → 1900 K,
`40KLM` → 4000 K, 68 namen). Voor de kale `C<nn>` gelden er twee méér: geen letter ervóór
(weert `ECLECTIC 90`, `DC 90-305V`, `XTSC 635-3`, `LC43MINI`, `QR-CBC51`) en geen spatie erná
(weert Artemide's `A.24 C 90° CORNER`, 101 namen — dat is een HOEK). Ondergrens 80 op een CRI
zonder label: alles daaronder dat als `C<nn>` geschreven staat is een maat- of typecode.

### ⚠ Open eind — de kelvin-regel raakt 34.711 producten van ANDERE merken

Gemeten met de echte parser en de echte poort (`scripts/meet-flos-regel-breedte.ts`):

| | landende voorstellen |
|---|---|
| Flos Architectural | kelvin 15.386 · cri 14.223 |
| Lombardo | kelvin 34.389 · cri 0 |
| Marset | kelvin 191 · cri 0 |
| Sylvania | kelvin 87 · cri 0 |
| Artemide Architectural | kelvin 44 · cri 0 |

De CRI-regel raakt **nul** producten buiten Flos. De kelvin-regel raakt er 34.711, vrijwel
allemaal Lombardo (`Anda Nero 3K`, `Anda Nero 4K`). Dat is ver boven "een handvol", en het is
**niet bewezen**: voor Lombardo vond ik maar 2 bevestigingen via een lange vorm in dezelfde
lijn, en 0 tegenspraken — te weinig om op te varen. Voor Marset, Sylvania en Artemide
Architectural is er 0 bevestiging én 0 tegenspraak.

Dit is geen probleem voor de Flos-run zelf (`startEnrichmentRun` werkt per merk, dus Lombardo
krijgt hier geen voorstel), maar het wordt er wél één zodra iemand een van die vier merken
verrijkt. **Besluit ligt bij Timo:** de regel laten zoals hij is en die vier merken apart
bewijzen vóór hun run, óf de lezing beperken tot de samengestelde vorm (`<nn>K` mét
CRI-code) — dat sluit Lombardo volledig uit maar kost Flos de 1.709 kale-vorm-voorstellen.

**Regressie: nul.** Geen enkel merk raakt een bestaand voorstel kwijt doordat `verdenking.ts`
nu ook korte vormen als kandidaat telt, en geen enkele naam waar de lange vorm al een kelvin
gaf krijgt een andere waarde (`scripts/meet-flos-regressie.ts`). `scripts/toets-instrument.ts`
staat vóór en ná op 8/8.

**Run op de testkopie, NIET gepubliceerd, geen steekproefoordeel gezet:**
`37b62ebd-ecbc-4c86-abe3-7fac8e5ac6ea` — 18.263 producten, 29.609 voorstellen, steekproef 100.
Beoordeelblokken per leesregel: `bun --env-file=.env.branch scripts/toon-flos-leesregels.ts <runId>`.

## 2026-08-11 — Template-upload wordt directe import (vervang-semantiek)

Besluiten in `docs/goal-template-upload-direct-import.md` (hoofdcheckout; meting in
`docs/probleem-template-upload-grote-bestanden.md`). Gebouwd in deze sessie:

- **`lib/repo/template-import.ts`** — `importTemplateDirect`: validator-uitvoer → diff-engine
  (ongewijzigd hergebruikt) → alles in batches toepassen. Nieuwe waarden, gewijzigde waarden
  én leeggemaakte velden winnen; onverwerkbaar/niet-opslagbaar wordt geteld en gelogd
  (`skippedFieldsSample` in het samenvattende event), nooit stil weggegooid.
- **Archiveerfuncties eindelijk aangesloten**: `replacePriceList` archiveert de oude lijst
  (regels → `archive.prices_archive`, event `price_list_archived`) en de nieuwe regels gaan
  in bulk op de verse lijst. Daarbij een schaalbug in `archivePriceList` gerepareerd: één
  multi-row INSERT van 18.659 archiefregels klapte op de Postgres-parameterlimiet → chunks
  van 1.000.
- **Upload-kaart** vraagt prijslijstnaam + geldig-van + geldig-tot uit (verplicht), knop
  zegt "Check & import", kaarttekst benoemt de vervang-semantiek. Action op het
  parseForm()-zod-patroon. Rij-cap 60.000 als transportgrens in `template-upload-limits.ts`
  (server-only; rijen zijn pas na validatie bekend). `maxDuration = 300` op de
  merkrelatie-detailpagina. Samenvatting na afloop via `import-summary.tsx`
  (querystring-model van apply-summary).
- **Events**: `template_import_started`/`…_finished` (tellingen) + bestaande per-veld-events
  (`product_fields_applied` met old/new, óók wissingen), per-veld-events in batch-inserts.

**Aanname (door Claude, niet expliciet door Timo bevestigd):** producten die in het nieuwe
bestand ontbreken verdwijnen uit de catalogus doordat ze géén regel op de nieuwe prijslijst
krijgen — onzichtbaar via `visible_products` (regel 3), geen delete, data en events blijven.
Geteld als `goneProducts` en op het scherm gemeld ("Products no longer listed").
Tweede vangrail: een bestand zonder één verwerkbare prijs wordt vóór de eerste schrijf
geweigerd (`TemplateImportError "no_prices"`), anders zou de lijst-wissel het hele merk
onzichtbaar maken.

**Bewust laten staan voor 4.B:** het hele staging/voorstel-pad (`template-return.ts`,
voorstel-scherm, approve/reject-actions, `upload/[uploadId]`-route). Interne uploads maken
geen staging-rijen meer; oude staging-rijen blijven via dat pad afhandelbaar.

**Gemeten** (PGlite, `deltalight-branddata-2026-08-11.xlsx`, 18.667 rijen × 66 kolommen):
validatie 0,4 s, import 2,9 s (18.667 producten + 18.659 prijsregels), tweede run
convergeert (0 writes op producten) in 1,3 s. Repo-tests: `lib/repo/template-import.test.ts`;
scherm: `components/data/template-upload-card.test.tsx` (screenshots light/dark ×
mobile/desktop).

## Resultaatplafond op /catalog — af 19 aug 2026

Besluit uit de demosessie van 12 aug: de catalogus-zoekfunctie toont **maximaal 9 treffers**,
noemt het **werkelijke totaal** ("Showing 9 of 237 matches") en biedt **geen doorbladeren** —
"mensen moeten hun informatie aanleveren". Volledige achtergrond en meetlat in
`docs/goal-resultaatplafond.md`.

De ene ingreep die verder reikt dan het scherm: de specfilters (Kelvin/CRI/IP) zijn van JS
naar SQL verhuisd. Het getoonde totaal komt uit `searchProductsWithTotal()` in
`lib/repo/products.ts` — één `count(*)` over exact dezelfde WHERE als de resultaatquery, op
de view `visible_products` (regel 3). Zou een filter pas ná de query in JS toeslaan, dan
telt de teller rijen die de gebruiker nooit kan bereiken. `classify()` in
`app/catalog/page.tsx` doet daarom alleen nog de splitsing aantoonbaar/onvolledig; zet daar
geen tweede afkeuring terug. `searchProducts()` is ongewijzigd voor het review-scherm.

**Bewust niet gebouwd, apart belegd:** de slimme vervolgvraag boven de 25 treffers, live
meetellen tijdens typen, en meebewegende facetten.

**Testkanttekening:** `components/data/custom-fields.test.tsx` viel tijdens deze sessie
wisselend om op een timeout in de archiveer-bevestiging — ook op een schone boom, en ook
zonder deze wijziging. Het is machinebelasting (er draaiden parallelle sessies), geen
regressie van dit werk.
---

## IA-opschoning: navigatie en informatiestructuur (2026-08-20)

_Besluitenlijst uit de demosessie met Brink Licht van 12 augustus. Puur verplaatsen,
hernoemen en weghalen — geen nieuwe functionaliteit. De acht punten uit de opdracht staan
hieronder met wat er werkelijk is gebeurd._

**Verplaatsingen (routes).** Alle oude adressen blijven werken via permanente redirects in
`next.config.ts`; bookmarks en gedeelde links breken dus niet.

| Was | Is | Punt |
|---|---|---|
| `/data/brand-relations` (+ `[brandId]`, `/template`, upload-route) | `/brand-management` | 1 |
| `/data/price-lists` | `/brand-management/price-lists` | 4 |
| `/data/fields` | `/admin/fields` | 3 |
| `/data/event-log` | `/admin/event-log` | 5 |
| `/data/loading` | `/admin/loading` | — (zie hieronder) |
| `/data/evaluation` | `/admin/evaluation` | — (zie hieronder) |
| `/settings/organization` | `/admin/organizations` | 7 |
| `/data`, `/data/enrichment`, `/data/enrichment/[runId]` | **weg** | 2, 6, 8 |

**Drie keuzes die de opdracht niet dichttimmerde, met Timo afgestemd vóór het bouwen:**

1. **Brand management wordt een top-level route** (`/brand-management`, niet
   `/data/brand-management`): het is een hoofdingang, en de sectie waar het onder hing
   bestaat niet meer.
2. **Loading en Evaluation stonden niet in de lijst** maar wél onder Data. Ze zijn mee naar
   `/admin` gegaan (eigen kaarten), zodat `/data` écht kon verdwijnen en er geen scherm
   zonder ingang achterbleef.
3. **Punt 6 is de héle enrichment-sectie**, niet alleen `/data/enrichment/[runId]`. Het
   overzicht bestond alleen om runs te starten die je in dát scherm goedkeurde; de
   prijslijst-skill stelt die vragen nu in de chat. Weg zijn ook
   `components/data/enrichment-panels.tsx` en `enrichment-status.tsx`.

**Punt 2 en 7 — de balk.** `NAV_ITEMS` gaat van acht naar zes items: Projects, Catalog,
Brand management, Analytics, Brand portal, Admin. "Data" en "Settings" zijn eruit.
Settings hangt sinds nu in een **accountmenu onder de accountnaam** met tandwiel-icoon
(`components/account-menu.tsx`, Radix DropdownMenu — die levert toetsenbordbediening en de
aria-koppeling die een menu tot een menu maakt). Het e-mailadres, dat er als kale `<span>`
stond, ís nu de trigger.

⚠️ **Eén valkuil die dit opleverde en die is afgevangen.** `/admin` staat in de
route-allowlist op `intern`, maar `/admin/organizations` (net als `/admin/users`) op
`org_admin`. Door het organisatiescherm naar Admin te verplaatsen én Settings uit de balk te
halen, zou een **externe** org-beheerder geen enkele link naar zijn eigen organisatiescherm
meer hebben — precies UX-audit bug #11 opnieuw, dat scherm had dáárvoor al eens nul inkomende
links. Oplossing: `ACCOUNT_ITEMS` bevat ook `/admin/organizations`, en `SiteNav` toont die
regel alleen aan wie géén Admin-ingang heeft. Voor intern is de kaart op `/admin` de ene
ingang. Vastgelegd in `components/site-nav.test.tsx`.

**Punt 8 — de dekkingsmeter is weg.** "Tier 1 coverage 82%" telde al mee zodra één veld was
ingevuld. Hij stond alleen op `/data`; met die pagina verdween ook
`components/data/coverage-meter.tsx`. `getTier2Coverage()` in `lib/repo/enrichment.ts` staat
er nog (met zijn tests) maar wordt nergens meer aangeroepen — kandidaat om te schrappen zodra
zeker is dat er geen ander scherm meer op wacht.

**Server-actions meeverhuisd, en meteen op het zod-patroon gezet.** `app/data/actions.ts` is
opgesplitst naar `app/admin/loading/actions.ts` en `app/admin/evaluation/actions.ts`; beide
volgen nu poort → `parseForm()` → repo (`docs/INVOERVALIDATIE.md`), waar ze eerst een kale
`String(formData.get(…))` deden. De poorttest ging mee als
`app/admin/workbench-gate.test.ts`.

**Testnaden.** Twee stukken zijn uit hun pagina gehaald om ze zonder database te kunnen
testen én fotograferen — dezelfde vorm als de opgeheven `DataCards`:
`components/admin/admin-cards.tsx` (de acht beheerkaarten; `adminCards()` is puur) en
`components/data/brand-management-header.tsx` (de hernoemde kop + de ingang naar de
prijslijsten). Nieuwe screenshots: `admin-kaarten.*`, `account-menu.*` (open menu, licht/
donker × mobiel/desktop) en de bijgewerkte `site-nav.*` / `data-merkrelaties.*`.
Beide componenten gebruiken bewust een kale `<a>` en géén `next/link`: dat is in een
RSC-test een client-reference en de test faalt dan al bij de import.

**Niet gedaan, bewust:**

- **De statusfilters als checkboxes** (het "meenemen"-punt). Dat is geen knop omzetten:
  `BrandRelationsQuery.status` is `"alle" | RelationStatus`, en meervoud raakt de parser,
  `brandRelationsHref()`, `filterBrandRelationRows()`, de werkbalk en drie testbestanden.
  Ver boven het kwartier dat de opdracht ervoor uittrok, en de opdracht zei: dan overslaan.
- **De overloop van de balk op 375px.** Hij is met twee items minder kleiner geworden maar
  niet weg; op mobiel valt het accountmenu daardoor deels buiten beeld. Dat is hetzelfde
  openstaande punt als in `components/site-nav.test.tsx` gedocumenteerd staat (besluit G21),
  en hoort bij het navigatiewerk, niet bij deze verplaatsing.
- **De urgentie-sortering van de prijslijsten** (vervaldatum × aantal projecten) — die is
  apart belegd; hier is alléén verplaatst wat er stond.
## 2026-08-20 — Prijslijsten sorteren op urgentie, niet op vervaldatum

Spec, weging en de motivering per gewicht: `docs/goal-prijslijst-urgentie.md`.
`urgentie = vraagscore × tijdfactor`; de tijdfactor loopt op vanaf 90 dagen vóór verval,
piekt op 0,70 op de datum zelf, stijgt tot 1,00 op 90 dagen erna en vlakt daarna af. Een merk
zonder bruikbare lijst krijgt meteen 1,00. De vraagscore is `1 + Σ gewicht × ln(1 + telling)`
over acht signalen (projecten, spec-regels, zoekacties, gevraagd-niet-in-catalogus, wachtrij,
zoekacties zonder resultaat, overwogen, gekozen), alle over de laatste twaalf maanden.

- `lib/price-list-urgency.ts` — puur; kent geen routes (`urgencyHref` krijgt zijn basispad).
- `lib/repo/price-list-urgency.ts` — `listBrandUrgency`: één rij per MERK, inclusief merken
  zónder prijslijst. Naast `listPriceListStatus` en niet ervoor in de plaats: de verlengsectie
  blijft prijslijst-georiënteerd, want verlengen doe je aan een lijst.
- `components/data/price-list-urgency-table.tsx` — server-component, sorteerstand in de URL.
- `lib/repo/enrichment.ts` — de 30/14/7-ladder is nu `expiryBucket()` (was inline), zodat het
  merk-overzicht dezelfde badge rekent als de prijslijst-tabel.
- `components/data/brand-scorecard.tsx` — 66 velden per categorie inklapbaar (`<details>`,
  geen client-JS). De ingeklapte kop draagt "3 of 6 filled" plus de namen van de gevulde
  velden. `brand-relations.test.tsx` ankerde op `closest("section")` en is meegegaan naar
  `closest("details")`.

**⚠️ Geen geldsignaal in de formule — dat is een besluit, geen omissie.** Ijzeren regel 2.
Het staat als eigen sectie in het goal-document, zodat een volgende bouwer het niet als
vergeetachtigheid repareert.

**Aannames en open eindes**

- **Het scherm staat nog op `/data/price-lists`.** De IA-opschoning (sessie `lucid-kirch`,
  branch `claude/jovial-pare-a7e2e0`) verplaatst het naar `/brand-management/price-lists` en
  was op het moment van bouwen nog niet gecommit. Verhuizen kost twee dingen: het page-bestand
  naar `app/brand-management/price-lists/page.tsx`, en `basePath="/brand-management/price-lists"`
  meegeven aan `<PriceListUrgencyTable>`. De formule en alle tests blijven staan.
- **Rijen zijn per merk, niet per prijslijst.** Anders kan "een merk zonder prijslijst krijgt
  de maximale tijdfactor" niet bestaan — dat merk had geen rij. Gevolg: het overzicht toont nu
  ~438 merken in plaats van ~438 lijsten, en merken zonder lijst zijn voor het eerst zichtbaar.
- **`geenBruikbareLijst()` ≠ `isCoverageGap()`.** De eerste (max tijdfactor) telt een verlopen
  lijst NIET mee — die heeft nog een datum, en die datum bepaalt hoe hard hij oploopt. De kop
  van de tabel telt de dekkingsgaten wél op de brede definitie. Twee begrippen, twee namen.
- **De gewichten zijn beredeneerd, niet gemeten.** Er is geen dataset van "welke lijst had
  Brink als eerste moeten oppakken". Bijstellen is één regel in `VRAAG_GEWICHT`.
- **Geen paginering.** Het merkrelatie-overzicht pagineert op 25 rijen omdat de
  compleetheidsaggregatie duur is; deze query is één statement met CTE's en heeft dat niet
  nodig. Bij 438 rijen is dat een lange pagina — als dat gaat storen is de sorteerstand in de
  URL het aanknopingspunt voor een `page`-parameter in dezelfde vorm.

**De suite**: `lib/price-list-urgency.test.ts` (24, puur), `lib/repo/price-list-urgency.test.ts`
(6, PGlite), `components/data/price-list-urgency.test.tsx` (19, white-box RSC + screenshots
light/dark × mobile/desktop). Let op: de browser-tests flakeyen onder parallelle belasting
(`expected 0 to be greater than 20` = de render was nog leeg) — per bestand draaien geeft groen,
en dat gedrag bestaat ook zonder deze wijziging.

---

## Live treffer-teller op /catalog (2026-08-20)

Spec, meting en de eerlijke "niet gehaald"-sectie staan in `docs/goal-live-teller.md`. Wat een
volgende sessie moet weten en niet uit de code kan aflezen:

**1. De zoeksemantiek is app-breed veranderd, niet alleen op /catalog.** De AND-met-terugval zit
in `fuzzyWhere()` in `lib/repo/products.ts`, en die voedt `runSearch` — dus óók
`searchProducts()`. De andere echte beller daarvan is
`app/projects/[id]/review/page.tsx` (handmatig linken van een rode regel). Daar geldt nu
hetzelfde: strenge treffers eerst, brede alleen als streng nul oplevert. Dat is een
verbetering, maar **dat scherm meldt de terugval niet** — `searchProducts()` geeft alleen
`items` terug, zonder de `verbreed`-vlag die `searchProductsWithTotal()` wél heeft. Wie het
review-scherm aanraakt: neem die melding daar alsnog mee, of accepteer bewust dat hij daar
stil blijft. De matching-engine (`lib/matching/engine.ts`) staat hier los van en is niet
geraakt.

**2. Het letterlijke klantvoorbeeld uit de demo werkt niet.** `Entero 2700` in het
vrije-tekstveld levert nul strenge treffers op en verbreedt naar 2.520 — omdat "2700" niet in
de productnamen van Delta Light staat maar in het veld `kelvin`. Versmallen gaat daar via het
veld Color temp. (K). Zie de tabellen in de goal-doc. Vóór de volgende demo hierover een
beslissing nemen; nu is het een zichtbare, eerlijke terugvalmelding en geen slinkende stapel.

**2b. Specwaarden worden uit de vrije zoektekst gevist (20 aug, vervolg).** `2700`, `IP44`,
`CRI90` en varianten worden herkend en als specfilter toegepast in plaats van als naamwoord —
`lib/spec-tokens.ts`, samengevoegd in `bereidZoekopdrachtVoor()` in `lib/repo/products.ts`.
Daarmee werkt het klantvoorbeeld wél: `Entero 2700` gaat op productie van 2.520 (verbreed) naar
1.026. Dit is RADEN, dus drie dingen zijn niet optioneel: het scherm toont wat er gelezen is, een
expliciet specveld wint altijd, en zonder anker wordt er niet gesplitst (anders geeft een kaal
`2700` nul treffers). Grenzen staan in `lib/spec-tokens.ts` — kelvin alleen tussen 1800 en 6500,
zodat een lumenwaarde of artikelnummer geen filter wordt. Dit werkt óók door in het
review-scherm, zie punt 1.

**3. De teller logt bewust geen events.** Zie de kop van `countSearchMatches`. Draai dat niet
terug zonder de afweging daar te lezen: het gaat om regel 5 én om een schrijfpad per
toetsaanslag op >1 miljoen producten.

**4. De debounce-test is timinggevoelig.** `components/catalog-live-count.test.tsx` telde eerst
exact één action-aanroep per getypt woord. Groen solo, rood in de volle suite: onder belasting
duurt een gesimuleerde toetsaanslag soms langer dan de debounce van 200 ms. Hij meet nu wat de
debounce belóóft (minder tellingen dan toetsaanslagen, laatste telling over het hele woord).
Zet er geen exact getal terug.

**5. Herkomst van de code.** Twee sessies bouwden dit parallel. De aanpak van
`claude/sad-raman-b2cd04` (server action + gedeelde `lib/catalog-zoekvorm.ts`) is overgenomen
omdat die dichter bij de repo-conventies zit; de eigen aanzet staat nog als commit b514cc5 op
deze branch, inclusief de eerste meting van het OR-probleem.

---

_2026-08-12. **Groen betekent "dit is hét product"** (punt 3 uit de Brink-demo van 12 aug).
Probleem + metingen: `docs/probleem-groen-betekent-zeker.md`; spec, besluiten en de
vóór/ná-metingen: `docs/goal-groen-betekent-zeker.md`. Kort: groen was een uitspraak over
SPECS (`provable.some(...)` — minstens één kandidaat sprak niets tegen) en kon dus over
acht kandidaten tegelijk waar zijn; nu is het een uitspraak over IDENTITEIT (precies één
groene kandidaat, of een codetreffer op precies één product). Twee of meer → geel, Brink
kiest. Wat groen is, zet `runMatcher` zelf vast met `chosenBy: "system:auto"` en een eigen
event `certain_match_auto_accepted`._

_**Aannames en open eindes:**_

_1. **Bestaande dossiers draaien niet vanzelf mee.** De statusbepaling zit in
`evaluateSpecLine`; regels die vóór deze commit gematcht zijn houden hun oude oordeel
(en een oude groene regel houdt zijn lege `matchedProductId`) tot er een hermatch over
gaat. Er is bewust géén migratie of backfill gedraaid — dat zou stilzwijgend
klantdocumenten wijzigen. Wil je een bestaand dossier omzetten, dan is dat een hermatch,
en dat is een bewuste handeling._

_2. **`docs/matching-regelset.md` is meegewijzigd** (de GROEN-definitie, beslisvolgorde
stap 4 en de harde regel over cosmetische varianten). Die regelset is de AI-instructieset
en zei letterlijk het tegenovergestelde: "Eén of meerdere varianten met dezelfde prijs" en
"cosmetische varianten bij gelijke prijs mag Brink zelf kiezen". Dat botste frontaal met
het besluit van Timo (twee NEST-kleurvarianten = kiezen, dus geel), dus de regelset is
mee-omgezet. Wie de menselijke regelset buiten deze repo beheert, moet hem daar óók
bijwerken — anders lopen de twee uit elkaar._

_3. **kvk en dordrecht ontbreken in de vóór/ná-meting.** `scripts/eval-testset.ts` bereikt
voor die twee de matcher niet zonder `--ai` (leesroute resp. OCR). Dat mét `--ai` draaien
kost echte API-calls op de productiedatabase; die budgetbeslissing ligt bij Timo en is
niet stilzwijgend genomen. Raadhuis en tno zijn wél volledig gemeten: exact één regel
verschuift (tno `Ls002`, groen → geel)._

_4. **Eén code die zowel een passend als een alles-rood product raakt, wordt geel.** Er is
dan één plausibele identiteit, maar de code is dubbelzinnig in onze catalogus. Bewust de
veilige kant (ijzeren regel 4), vastgepind in een test. Blijkt dit in de praktijk te
streng, dan is het één regel: tellen over `provable` in plaats van over `scored`._

_5. **Gepusht via `scripts/safe-push.sh`** (12 aug, op akkoord van Timo). De eerste poging
botste: `origin/main` was intussen verschoven en `HANDOVER.md` gaf een append/append-conflict
met de template-upload-sessie. Beide blokken staan er nu; er is niets van die sessie
overschreven._

---

_2026-08-13. **Sprint M1 — matchstation-endpoints (app-kant).**
`docs/plan-matchstation-eigen-machine.md` + `docs/goal-agent-matching.md`. Gebouwd: een
wachtrij met claim/lease (`matchstation_queue`, migratie 0022), een ophaal-endpoint
(`GET /api/matchstation/werk`) en een terugstuur-endpoint
(`POST /api/matchstation/resultaat`) — machine-sleutel-auth (`lib/machine-auth.ts`,
constant-time via Web Crypto, niet `node:crypto` — de testsuite draait in de browser),
statusmapping volgens het contract + het besluit van 13 aug (`meerdere` → geel, niet
open), eigen kostenplafond (`MATCHSTATION_MAX_EUR_PER_RUN`, purpose-gefilterd, los van
`OCR_MAX_EUR_PER_RUN`), heartbeat + dood-melding
(`GET /api/matchstation/healthcheck`, cron-secret-auth). Nieuwe repo-laag
`lib/repo/matchstation.ts`, 25 tests (PGlite) + 23 route-tests
(`app/api/matchstation/**/*.test.ts`, harnas = PGlite achter een proxy op `@/db/client`,
zelfde vorm als `app/projects/actions-validation.test.ts`). Eén UI-toevoeging: een
intern-only "Matchstation"-kaart op de projectpagina
(`components/dossier/matchstation-card.tsx`, met screenshot-test) om een dossier in de
wachtrij te zetten — actie `enqueueForMatchstationAction`.

**Aannames en open eindes (belangrijkste bovenaan):**

_1. **Het originele geüploade bestand (PDF/Excel/Word) bestaat NERGENS in de app —
geverifieerd, geen aanname.** `app/projects/actions.ts:236-241` (413-fix): de PDF wordt
in de BROWSER geparst en de bytes gaan nooit naar de server. Een Excel/Word-uploadpad
bestaat niet. Het ophaal-endpoint geeft daarom niet "het document" terug maar de beste
reconstructie die er wél is: de markdown-tekstlaag (`import_runs.raw_markdown`) bij een
tekst-PDF, of de gerenderde OCR-paginabeelden (`ocr_page_images`, via een nieuw
machine-auth-endpoint `GET /api/matchstation/document/[runId]/[page]/[tile]`) bij een
beeld-PDF — plus een `warning`-veld in elk antwoord dat dit met zoveel woorden zegt.
Geen enkele van de twee bestaat voor een dossier zonder eerdere import (CSV/handmatig).
**Dit raakt M2 fundamenteel**: het plan zegt letterlijk "Claude leest het document zelf",
maar er ís voor M2 geen bestand om te lezen tenzij er eerst een importstap heeft
gedraaid. Besluit nodig van Timo: (a) alsnog byte-opslag bouwen voor het
matchstation-pad specifiek (raakt de 413-fix-afweging, een nieuwe, kleinere upload los
van de bestaande pijplijn), of (b) M2 ontwerpen op de markdown/paginabeelden in plaats
van het originele bestand._
_→ **Besluit Timo, 13 aug (via sprintmaster matchstation): (b) — de reconstructie
(markdown/OCR-paginabeelden) is goed genoeg voor M2.** Geen byte-opslag bouwen; de
machine leest wat de app ook las._

_2. **Vercel Cron op Hobby draait hooguit 1×/dag — geverifieerd via de OIDC-token in
`.env.local` (`"plan":"hobby"`), niet aangenomen.** `vercel.json` stond op
`*/5 * * * *` (de bedoelde cadans voor de dood-melding). **Correctie op de eerste versie
van deze aanname:** Hobby degradeert een te frequent cron-schema NIET stilzwijgend naar
1×/dag — hij weigert de hele DEPLOYMENT. Gemeten na de push van 13 aug: het GitHub
check-suite van Vercel bleef `queued` zonder één check-run, en er verscheen geen nieuwe
deployment in `vercel ls` — geen platformstoring, gewoon een geweigerde build zonder
zichtbare foutmelding in GitHub (bevestigd tegen Vercel's eigen documentatie over dit
gedrag). `vercel.json` is daarom weer VERWIJDERD — er stond toch niets anders in — en
de dood-melding leunt uitsluitend op een externe trigger. De endpoint zelf en zijn
logica (`findDeadAlerts`/`sendDeadAlert`, `GET /api/matchstation/healthcheck`) zijn
ongewijzigd gebouwd en getest; alleen de Vercel-cron-route is geschrapt./_
_→ **Besluit Timo, 13 aug (via sprintmaster matchstation): externe gratis cron**
(bijv. cron-job.org) die elke 5 min het healthcheck-endpoint aanroept met het
cron-secret (`Authorization: Bearer $CRON_SECRET`). Inrichten hoort bij de
livegang-checklist van M2 — er is geen `vercel.json` meer die dit zelf regelt._

_3. **Twee brondocumenten sluiten niet naadloos op elkaar aan, en `applyMatchstationResult`
kiest een kant.** `goal-agent-matching.md`s antwoordcontract is geschreven voor een agent
DIE AL IN `runMatcher(db, specLineId, …)` zit — er bestaat dus altijd al een spec-regel.
Het matchstation-plan zegt daarentegen "geen parse-stap die eerst spec-regels moet
maken". De POST-body ondersteunt daarom BEIDE: `spec_line_id` (bestaande regel vullen)
óf `fixture_code` (regel ter plekke aanmaken, `source: "llm"`). Welke van de twee M2
gaat gebruiken is niet mijn beslissing — zie de kop van `lib/repo/matchstation.ts`._

_4. **`review_kind` kreeg twee nieuwe pg-enum-waarden** (`onzeker`, `niet_beoordeeld`,
via `ALTER TYPE … ADD VALUE` in migratie 0022) in plaats van een aparte tekstkolom.
Precedent in migratie 0006 koos destijds bewust "geen ALTER TYPE ADD VALUE, alles
nieuw" — maar dat was voor twee GEHEEL NIEUWE kolommen zonder bestaande data;
`review_kind` heeft al rijen en code die op de vier oude waarden matcht. `ALTER TYPE …
ADD VALUE` is op Postgres 12+ een gewone, niet-blokkerende operatie. Wie een aparte
tekstkolom had verwacht: dat kan alsnog, dit was de kleinere ingreep. Zie de motivering
in `db/migrations/0022_matchstation.sql`._

_5. **Geen mailprovider, dus geen echte mail/push.** Zelfde open punt als de magic-link
(`lib/auth-factory.ts`, "geen e-mailprovider in deze fase"). De dood-melding
(`sendDeadAlert`) post naar `MATCHSTATION_ALERT_WEBHOOK_URL` als die gezet is (generiek —
Slack/Discord/ntfy/Zapier, wat dan ook een webhook aanneemt); zonder die env-var valt hij
terug op `console.error` + een `events`-rij, zodat een melding nooit spoorloos is, maar
"iemand kijkt in de Vercel-logs" is geen actieve melding. Openstaand besluit: een
webhook-URL kiezen, of alsnog een mailprovider._

_6. **Een bug gevonden ÉN gerepareerd tijdens de af-toets** (niet alleen gemeld — dit
raakte de eigen deliverable van deze sprint rechtstreeks): `components/dossier/
spec-line-table.tsx`, `lib/repo/estimate.ts` en de vier renderpaden die daarvan afhangen
(`quote-view.tsx`, `quote-view-extern.tsx`, `lib/pdf/estimate.ts`,
`lib/pdf/estimate-extern.ts`) gingen ervan uit dat `chosenBy` maar twee waarden kent:
`"system:auto"` of een mensen-e-mailadres → "manually chosen". Met
`chosenBy: "system:matchstation"` viel een machinematch dus ten onrechte in de
"manually chosen"-tak. Gemeten op het estimate-scherm tijdens de af-toets hieronder
(AT-001 toonde "manually chosen" voor een match die het matchstation zonet had gezet).
Gerepareerd: een derde tak `matchstationChosen` op alle vijf plekken, met het label
"matched by the matchstation". Alle bestaande tests (estimate, pdf, screens) bleven
groen; geen nieuwe testfout blootgelegd door de reparatie._

_7. **`.env.local` is een symlink naar de hoofdrepo** (gedeeld over alle worktrees). Ik
heb er `MATCHSTATION_MACHINE_KEY` en `CRON_SECRET` aan toegevoegd (test-waarden, puur
lokaal, nooit gecommit) voor de af-toets hieronder. Vóór livegang moeten de ECHTE
sleutels als Vercel-project-env (Production + Preview) gezet worden — niet in dit
bestand._

_8. **Volle testsuite: twee bestanden falen soms onder volle load, geen van beide door
mijn wijzigingen.** `components/data/custom-fields.test.tsx` en (wisselend, één van)
`components/dossier/review.test.tsx` / `lib/repo/dossier-scope.test.ts` gaven een
timeout in de volledige `vitest run` (drie keer gedraaid, telkens twee andere
bestanden), maar draaien foutloos in isolatie. Geen van beide bestanden is door deze
sprint aangeraakt — resource-contentie in deze sandbox onder de volle browser-suite
(2086 tests), geen regressie. `typecheck` is schoon; alle matchstation-tests (25 repo +
23 route + 10 screenshot) zijn stabiel groen, ook binnen de volle run._

**Af-toets, zoals uitgevoerd (naspeelbaar):**

1. Migratie toegepast op de dev-Neon: `bun run db:migrate` (0022 toegepast, 21
   voorgaande al aanwezig).
2. Testdossier + twee regels + enqueue via een wegwerpscript
   (`lib/repo/dossiers.ts#createDossier/addSpecLines` +
   `lib/repo/matchstation.ts#enqueueDossierForMatching`) — dossier-id
   `188c3be5-edc4-451e-9665-723a7998f2b4` ("M1 af-toets — 13 aug 2026", staat nog in de
   dev-database; gerust op te ruimen).
3. Ophalen + claimen:
   ```
   curl -i http://localhost:3000/api/matchstation/werk \
     -H "x-matchstation-key: lokale-test-sleutel-niet-voor-productie"
   ```
   → 200, met `job.queueId`, dossier, `existingLines` en het `document`-blok (leeg +
   de eerlijkheids-`warning`, want dit dossier heeft geen import). Zonder sleutel → 401.
   Nogmaals aanroepen tijdens de geldige lease → 204 (geen tweede claim).
4. Terugsturen — regel 1 `gevonden` (een echt zichtbaar product, Flos Bellhop Glass C2),
   regel 2 `merk_ontbreekt`:
   ```
   curl -i -X POST http://localhost:3000/api/matchstation/resultaat \
     -H "x-matchstation-key: lokale-test-sleutel-niet-voor-productie" \
     -H "content-type: application/json" \
     -d '{"queue_id":"<queueId>","regels":[
       {"spec_line_id":"<lineA>","uitkomst":"gevonden","product_id":"<productId>",
        "prijs":"845.00","prijs_vast":true,"toelichting":"Exacte naam- en merktreffer.",
        "bewijs":{"merk_bevestigd":"Flos","naam_treffer":"exact","kandidaten_over":1}},
       {"spec_line_id":"<lineB>","uitkomst":"merk_ontbreekt",
        "toelichting":"Onbekend Merk XYZ staat niet in de catalogus."}
     ]}'
   ```
   → 200, `verwerkt: 2`.
5. Gecontroleerd, ingelogd als `timo@jouwainstein.com` (magic link via de dev-console):
   - Lijst-tab: regel 1 groen, Flos Bellhop Glass C2, "matched by the matchstation";
     regel 2 blauw. (Dit is waar de chosenBy-bug in punt 6 hierboven zichtbaar werd en
     gerepareerd is.)
   - Estimate-tab: regel 1 telt mee (€ 845,00), regel 2 staat op "p.m." (niet
     meegeteld) — precies de estimate-filter uit dossiers.ts:524-528.
   - Events (directe query): `matchstation_enqueued`, `matchstation_auth_denied` (van de
     401-test), twee× `matchstation_result_applied` met het volledige `bewijs`.
   - `brand_load_queue`: "Onbekend Merk XYZ" staat erop (frequency 1) — het
     inkoopsignaal werkt via dit pad net als via de deterministische matcher.
6. Cron-check: `GET /api/matchstation/healthcheck` met `Authorization: Bearer
   lokale-cron-test-sleutel-niet-voor-productie` → `{"alerted":0}` (de job is 'verwerkt',
   geen stille alarm)._

---

_2026-08-19. **Sprint M2 — het matchstation op de EliteDesk (machine-kant).**
Gebouwd in `scripts/matchstation/`: `watcher.ps1` (poll elke 30 s naar
`GET /api/matchstation/werk`, download naar `C:\matchstation\inbox\<dossier>\`, één
headless Claude Code-sessie per aanvraag, timeout 10 min + één retry, POST naar
`/api/matchstation/resultaat`, `done\`/`failed\`, opruimen `done\` >30 dagen +
logrotatie >14 dagen), `sessieprompt.md` (de sessieprompt), `install-taakplanner.ps1`
(Taakplanner, trigger bij inloggen — autologin maakt dat "bij opstarten") en
`RUNBOOK-A4.md` (print voor óp de machine). De machine-sleutel blijft in de watcher en
gaat nooit de sessie in; de sessie krijgt alleen `DATABASE_URL_RO` (rol
`matchstation_ro`) en draait met `--allowed-tools "Bash(psql:*) Read Glob Grep Write"`._

_**Aannames en open eindes:**_

_1. **`docs/goal-agent-matching.md` staat niet in git** — alleen los op schijf in de
hoofd-werkdirectory (bevestigd door de sprintmaster). De sessieprompt is er de neerslag
van; wijzigt dat document, dan moet `scripts/matchstation/sessieprompt.md` mee. Eén
bewuste afwijking: dat document sluit prijzen uit de kolomlijst, maar besluit Timo
13 aug #4 (machine ziet alles, incl. prijzen) wint — de prompt laat prijzen lezen en
verbiedt ze in de keuze._

_2. **spec_line_id versus fixture_code**: de prompt kiest — zijn er `existingLines`,
dan vult de sessie die via `spec_line_id`; alleen bij een leeg dossier maakt hij regels
aan met `fixture_code` (conform de bouwopdracht M2). Het open punt uit M1
(`lib/repo/matchstation.ts`, kop) is daarmee dicht._

_3. **De PowerShell-scripts zijn op deze Mac niet uitgevoerd of syntax-getest** (geen
`pwsh` beschikbaar); handmatig gereviewd. Eerste draai op de EliteDesk is onderdeel van
de begeleide installatie — de af-toets M2 (beide fixtures end-to-end) is dus NOG NIET
gedraaid en staat gepland samen met Timo._

_4. **Timeout × retry (2 × 10 min) kan de dood-melding laten afgaan**: de claim-lease is
15 min, dus een trage retry meldt "dossier te lang zonder resultaat" terwijl de watcher
nog bezig is. Geaccepteerd (alert-cooldown is 30 min; een tweede poging die zó lang
duurt mag best een oog trekken). Wil Timo dit stiller: timeout naar 7 min of lease
omhoog._

_5. **Fallback bij een leeg dossier**: twee mislukte pogingen op een dossier zónder
bestaande regels melden één fixture-regel `STATION-FOUT` met uitkomst `onzeker`, zodat
het dossier zichtbaar in de reviewwachtrij landt — "nooit stil open". Bij bestaande
regels krijgt elke regel `onzeker` met een toelichting die naar `failed\<dossier>`
wijst._

_6. **Vereisten op de EliteDesk** naast wat er al staat: `psql` in PATH (PostgreSQL-
client) en het kopiëren van de drie bestanden + `.env`-aanvulling
(`LUMENLOGIC_BASE_URL`); staat in `RUNBOOK-A4.md`, sectie Installatie. De
cron-job.org-check (M1, besluit 2) draait al volgens de bouwopdracht._

## 2026-08-19 — Incident: events.entity_id (uuid) weigerde Better Auth-user-ids

Productie-wachtwoordreset faalde op het events-insert: `invalid input syntax for type
uuid: "EEblFloyGFm4GuZgvym3h23kJVGLJarl"`. Better Auth genereert user-ids van 32
alfanumerieke tekens (géén uuid); `logEvent(entity: "user", entityId: user.id)` in
`lib/auth-factory.ts` kon voor magic-link-users dus nooit slagen. Besluit: **migratie
0023 zet events.entity_id om van uuid naar text** — events verwijzen naar heterogene
entiteiten en het kolomtype mag geen aanname over de id-vorm afdwingen. Bijvangst:
`lib/repo/analytics-tiles.ts` cast nu `sl.id::text` in de event-scope-join (nooit
`entity_id::uuid` — dat gooit runtime op user-events), en `onPasswordReset` slikt een
logEvent-fout met `console.error` zodat een event-storing nooit meer de
session-revocation blokkeert.

⚠️ **Openstaande actie**: resets die vóór deze fix zijn uitgevoerd kunnen zijn voltooid
ZONDER session-revocation en zonder `password_reset_completed`-event (de throw viel ná
updatePassword, vóór revokeSessionsOnPasswordReset). Vercel-logs nalopen op de
uuid-fout en getroffen users' sessies handmatig verwijderen.

## 2026-08-20 — Import meer formaten (xlsx/docx/csv/jpg/png) gebouwd

Upload-vak op de projectpagina accepteert nu ook Excel, Word, CSV en beelden; alles door
de M2-pijplijn (bronbestand als audit trail → regels lezen → elke regel naar Review).
Plan + arbitrage: `docs/goal-import-meer-formaten.md`. Open eindes:

- **Migratie 0024 is NIET tegen Neon gedraaid** — `bunx drizzle-kit migrate` vóór/bij deploy.
- Wees-chunks: een finish die >15 MB weigert laat geüploade chunks staan tot de
  run-cascade ze opruimt; geen retentiebeleid (zelfde open punt als OCR-beeldretentie C9).
- exceljs wordt op het >15 MB-xlsx-fallbackpad client-side gebundeld (dynamische import);
  bundle-impact niet gemeten. Docx >15 MB heeft bewust géén fallback (eerlijke fout).
- Docx-vrije-tekst-fallback batcht vast op 40 rijen; bij dubbele truncation stuurt
  niemand kleinere batches (gedocumenteerd in lib/ai/leesroute.ts).
- Volle vitest-suite flakte op 8 niet-gerelateerde bestanden (bekende belasting-flake);
  allemaal solo groen geverifieerd.

## 2026-08-20 — Projecten verwijderen (goal-projecten-verwijderen)

Gebouwd in worktree modest-cerf-d6b15d: `lib/repo/dossier-delete.ts` (impact + delete +
rechten), `app/projects/delete-actions.ts` (eigen bestand naast actions.ts — afspraak met
de import-meer-formaten-sessie), verwijderknop op de projectpagina en bulkselectie op
`/projects`. Geen migratie nodig; cascade bestond al, leads worden losgekoppeld.

Open eindes:
1. **Geen uitkomst-feedback in de UI.** `deleteProjectsAction` geeft niets terug; een
   `skipped` (id buiten scope/rechten, of een DELETE die op een nieuwe FK-blocker stuit)
   oogt identiek aan succes — de kaart blijft dan gewoon staan zonder melding. De repo
   levert `{deleted, skipped}` al; een `useActionState`-vorm zoals `deleteBrandAction`
   is de logische vervolgstap als dit in de praktijk verwarring geeft.
2. **Nieuwe FK's zonder ON DELETE CASCADE op de dossier-boom breken de delete stil.**
   De kale catch in `deleteDossiers` vangt de PG-constraintfout af (bewust: geen
   constraint-namen naar buiten) en telt als skipped. Check bij elke nieuwe tabel die
   (indirect) aan `project_dossiers` hangt dat de keten cascadet — migratie 0024
   (`import_source_files`, cascadet via `import_runs`) is gecheckt en zit goed.
