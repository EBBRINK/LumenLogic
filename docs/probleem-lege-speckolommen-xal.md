# Probleem: XAL's eigen specs staan in de naam, maar niet in de kolommen

> Fase 1 (probleem uitschrijven), 29 jul 2026. Alles hieronder is óf uit de code afgeleid met
> bestandsverwijzing, óf gemeten op de Neon-branch `enrichment-xal` (endpoint
> `ep-broad-term-atw1a95t`, geforkt van productie met data tot 29 jul). Geen enkel getal komt uit
> een nagebouwde SQL-query — die les is deze week vijf keer gesneuveld
> (`docs/probleem-variant-ranking.md`); de tellingen draaien via `scripts/xal-inventarisatie.ts`
> met de échte parser- en steekproeffuncties, de statusmetingen via `scripts/eval-testset.ts`
> met verse parse.

## Het probleem in één regel

De fabrikant zet zijn eigen CRI, kelvin, wattage en IP-klasse ín de productnaam
("SASSO 100 RD FL SUSP 1500 DALI 17,9W 3000K"), maar de bijbehorende kolommen op `products`
staan leeg — en de matcher kan alleen kolommen lezen, geen namen.

## Waarom dit erger is dan "een veld dat toevallig leeg is"

Een lege kolom is niet neutraal. Hij is een muur.

`judgeCri` ([tolerances.ts:86](lib/matching/tolerances.ts:86)) geeft bij een lege kolom het
oordeel `onbekend`. In `evaluateSpecLine` bepaalt dat oordeel vervolgens in welke lijst de
kandidaat valt ([engine.ts:703](lib/matching/engine.ts:703)):

```
list = !specless && !red && !unknown && !unconfirmed ? "aantoonbaar" : "onvolledig"
```

`anyGreen` kijkt vervolgens uitsluitend naar **aantoonbare** kandidaten
([engine.ts:736](lib/matching/engine.ts:736)), en `worstVerdict` zet één `onbekend` al boven
`groen` ([tolerances.ts:231](lib/matching/tolerances.ts:231)).

Daaruit volgt een harde uitspraak, puur uit de code, zonder meting:

> **Vraagt een spec-regel om CRI, en is `cri` leeg bij álle kandidaten, dan kan die regel nooit
> groen worden.**

Datzelfde geldt veld voor veld voor kelvin, IP, wattage, lumen en beam. De lege kolom
diskwalificeert niet de kandidaat maar de hele belofte "aantoonbaar". Met CRI gevuld op 3 van de
211.000 producten (briefing-getal, **nog niet geverifieerd**) is elke CRI-vragende regel in de
hele database dus structureel niet-groen.

**Geel blijft wél bereikbaar** — dit is nauwer dan het lijkt. `anyYellow`
([engine.ts:739](lib/matching/engine.ts:739)) leest álle kandidaten, niet alleen de
aantoonbare, en eist alleen `worstVerdict === "geel"` zonder rood. En `worstVerdict` toetst
geel vóór onbekend. Een kandidaat met `[cri: onbekend, watt: geel]` levert dus gewoon een
**gele** regel op. `open` is de uitkomst alleen als geen enkele kandidaat een geel veld heeft —
dus als CRI het enige gevraagde veld is, of als alle andere gevraagde velden groen of onbekend
uitvallen.

De ranking heeft hetzelfde gat, maar zachter: `specScoreSql` telt een lege kolom als `0`
([engine.ts:361](lib/matching/engine.ts:361)) — bewust, want geen-data mag een product nooit
omlaag duwen (besluit 4). De commentaarregel erboven zegt het zelf al: cri en beam_angle
"dragen nu dus ~niets bij, maar zijn correct bedraad voor zodra verrijking ze vult". Dit doc gaat
over dat "zodra".

## Wat vullen precies verandert — twee kanten op

Dit is de kern van de meetdiscussie, en het is géén monotone verbetering.

| situatie | vandaag (kolom leeg) | na vullen, product voldoet | na vullen, product voldoet niet |
|---|---|---|---|
| veld-oordeel | `onbekend` | `groen` | **`rood`** |
| lijst | altijd `onvolledig` | kan `aantoonbaar` | uit beide lijsten (C-08) |
| regelstatus | nooit `groen`; `geel` als een ánder gevraagd veld geel is, anders `open` | kan `groen` | kan `rood` — en de kandidaat telt niet langer mee voor `geel` (`anyYellow` eist geen rood) |
| specScore-term | `0` | `+1` | `−1` |

De rangkant: `SPEC_COEFF` is 0,15 ([engine.ts:346](lib/matching/engine.ts:346)), dus het verschil
tussen een voldoende en een onvoldoende kandidaat op één veld is 0,30 in de gecombineerde
sorteersleutel. Ter kalibratie: in `docs/probleem-wattage-dubbeltelling.md` besliste een marge van
**0,05** welke kandidaat top-1 werd. Eén nieuw gevuld veld is dus ruim genoeg om de volgorde om te
gooien — in beide richtingen.

Daarom moet "regressie" scherp gedefinieerd zijn, en de grill heeft dat al gedaan:

- **Echte regressie** = de juiste kandidaat (Jayden's artikelcode) zakt in rang, of een regel
  verslechtert doordat we een *verkeerde* waarde hebben ingelezen.
- **Geen regressie, maar eerlijker** = een regel gaat van `open` naar `rood` omdat het product
  aantoonbaar CRI 80 heeft terwijl het bestek 90 vraagt. Dat is precies wat de tool hoort te
  zeggen. Meetpunt 3 uit de grill: vullen maakt de status eerlijker, niet automatisch groener.
- **Geen regressie, gewoon winst** = een regel gaat van `open` naar `groen` (alle gevraagde
  velden nu bekend én in orde), of naar `geel`. Dat laatste is óók een correcte uitkomst en geen
  anomalie — al komt het nooit van CRI zelf; zie de veldtabel hieronder.

### Welke velden kunnen welk oordeel geven

Dit bepaalt wat de vulling überhaupt kán doen, en het is per veld anders:

| veld | groen | geel | rood | bron |
|---|---|---|---|---|
| `cri`, `kelvin`, `ipValue` | ja | **nee** | ja | [tolerances.ts:68–88](lib/matching/tolerances.ts:68) |
| `maxWattage`, `lumenOutput`, `beamAngle` | ja | ja | ja | [tolerances.ts:40–58](lib/matching/tolerances.ts:40) |
| `dimmable` | ja | ja | **nee** | [tolerances.ts:119](lib/matching/tolerances.ts:119) |

Twee gevolgen:

- **Vier** velden kunnen een gele regel opleveren, niet drie: watt, lumen, beam én dimbaarheid.
  Alle vier zitten in `FIELDS` ([parser.ts:27](lib/enrichment/parser.ts:27)) en draaien dus mee
  in de volledige run.
- `dimmable` kan een regel **nooit** naar rood duwen — een ander protocol is altijd geel. Van de
  zeven velden is dat het enige dat alleen maar kan verbeteren of neutraal blijven.

Daarmee is het contrast tussen de twee fase-2-varianten scherper dan een kwestie van
steekproefdichtheid: bij **alleen CRI** is `open → geel` onmogelijk en bestaat de hele winst uit
`open → groen`, met rood als enige neerwaartse richting. Bij de **volledige run** komt de winst
via vier velden binnen, waarvan er één (dimbaarheid) geen enkel neerwaarts risico draagt.

- **Rangverschuiving door ongelijke naamdekking** = de vierde categorie, en de lastigste, want
  hij lijkt op regressie en is het niet. Zie hieronder.

Een meting die deze gevallen niet uit elkaar houdt, keurt het goede resultaat af — of viert een
verkeerde waarde als vooruitgang.

### Rangverschuiving door ongelijke naamdekking

Verrijken verschuift de ranking systematisch ten gunste van producten die hun specs in de naam
zetten. `specScoreSql` geeft een lege kolom `0` en een kloppende waarde `+1`
([engine.ts:361](lib/matching/engine.ts:361)); vullen tilt een product dus van 0 naar 1, maal
`SPEC_COEFF` 0,15. Eén veld is daarmee **drie keer** de marge van 0,05 die in
`docs/probleem-wattage-dubbeltelling.md` besliste wie top-1 werd.

En de termen worden **opgeteld**, niet gemiddeld ([engine.ts:392](lib/matching/engine.ts:392)):

```
return sql`(${sql.join(terms, sql` + `)})`
```

Bij een regel die alle zeven velden vraagt loopt specScore dus van −7 tot +7. Het verschil tussen
een volledig gedekt en een volledig ongedekt product is dan tot **7 × 0,15 = 1,05** — een
veelvoud van elke marge die we tot nu toe hebben gemeten.

> **Gemeten (29 jul):** die bovengrens treedt bij XAL niet op. Geen enkel product krijgt meer dan
> **twee** velden erbij, dus de verschuiving is maximaal **+0,30**. De scheefheid is wel reëel:
> 47,5 % krijgt niets en 51,4 % krijgt +0,15 — nog altijd drie keer de 0,05-marge uit de
> wattage-zaak. Zie "Gemeten op de branch".

Dat is op zichzelf niet fout: een bewezen CRI 90 hóórt boven een onbekende te staan. Het venijn
zit in de dekking. De parser raakt alleen producten die de spec in hun naam zetten, en dat is een
schrijfconventie van de fabrikant, geen producteigenschap. **Een product dat CRI 90 heeft maar
het niet in zijn naam vermeldt, zakt onder een product dat het wél vermeldt.** Bij XAL loopt die
conventie vermoedelijk per productfamilie uiteen, dus het effect is niet toevallig verdeeld maar
systematisch — precies het soort verschuiving dat in de nameting als "regressie" opduikt terwijl
het een artefact van naamdekking is.

Hoe de nameting hem herkent, aan de signatuur: de gezakte kandidaat heeft géén verse
`tier2_source`-stempel op het veld in kwestie (kolom nog leeg → term 0), de gestegen kandidaat
wél (`parsed-from-name` → term +1), en beide kandidaten hebben verder dezelfde tekstscore. Is dat
het patroon, dan is het deze categorie en niet een verkeerd ingelezen waarde. Het onderscheid met
échte regressie blijft: dáár klopt de nieuwe waarde zelf niet.

**Voor de plan-agents:** weegt dit mee in alleen-CRI versus de volledige run? Alleen CRI is één
veld, dus hooguit 0,15 verschuiving. De volledige run stapelt tot zeven velden op hetzelfde
product en verschuift daarmee tot 1,05 — wat de winst vergroot én dit artefact. De vraag is niet
alleen "hoeveel data winnen we" maar "hoeveel rangverschuiving durven we in één stap te nemen,
gegeven dat we hem maar op vier testcases kunnen zien".

## Zwakke plek 1: publiceren is een eenrichtingsdeur

`rejectRun` werkt alleen zolang de status `steekproef` is
([enrichment.ts:495](lib/repo/enrichment.ts:495)). Ná `publishRun` bestaat er geen
terugdraai-functie — niet in de repo, niet in de UI.

Wat er wél is, en wat een gerichte terugdraai in principe mogelijk maakt:

- `enrichment_items.applied = true` per toegepast item ([enrichment.ts:441](lib/repo/enrichment.ts:441)) — het exacte spoor van wat er veranderd is;
- `products.tier2_source[field] = 'parsed-from-name'` ([enrichment.ts:433](lib/repo/enrichment.ts:433)) — per veld herleidbaar;
- `publishRun` vult **uitsluitend lege kolommen** ([enrichment.ts:429](lib/repo/enrichment.ts:429)), dus er is nooit een oudere waarde overschreven die je zou moeten herstellen. Terugdraaien = terug naar `NULL`, en dat is een verliesloze operatie.

De knop bestaat alleen niet. Op de branch is dat irrelevant (Reset from parent). Voor de latere
productie-run is het een expliciete afweging voor fase 2: bouwen we die knop, of leunen we op
branch-bewijs plus het feit dat terugdraaien technisch triviaal is?

## Zwakke plek 2: de steekproef ziet één rij per naamvorm, en een 'fout' verwerpt alleen díé rij

Dit is de ernstigste van de twee, en de rekensom maakt het pas zichtbaar.

`pickSampleIndices` stratificeert op `field|nameShape`
([enrichment.ts:88](lib/repo/enrichment.ts:88)). Zijn er méér naamvormen dan reviewplekken —
bij XAL vrijwel zeker, `SAMPLE_MAX` is 100 — dan loopt hij door dit pad
([enrichment.ts:108](lib/repo/enrichment.ts:108)):

```js
for (let s = 0; s < max; s++) chosen.add(strata.get(keys[...])![0]);
```

`[0]`: van elk gekozen stratum precies de **eerste** rij. De steekproef is dus 100 rijen, elk uit
een andere naamvorm — en dat is een goed ontwerp voor het *vinden* van een systematische
leesfout. Voor het *tegenhouden* ervan deugt hij niet, want `publishRun` past alles toe behalve
expliciet fout bevonden steekproef-items ([enrichment.ts:401](lib/repo/enrichment.ts:401)):

```js
const toApply = items.filter((i) => !(i.inSample && i.sampleVerdict === "fout"));
```

Zie je dat de parser bij naamvorm `sasso # rd fl susp # dali #,#w #k` de verkeerde waarde pakt,
dan markeer je die ene rij als fout — en alle andere producten met exact diezelfde vorm krijgen de
fout alsnog toegepast. De mens ziet het gat en kan het niet dichten.

Er is vandaag maar één middenweg-loze uitweg: `rejectRun`, de hele run weg. Dat is alles-of-niets
op een run van 90.660 items, dus in de praktijk kiest niemand hem voor één verkeerde naamvorm.

**Gemeten is het nog schever dan de redenering suggereerde.** Voor XAL levert de run 9.497
`field|nameShape`-strata op; de steekproef ziet er **100** van, oftewel **1,1 %**. Maar het
ergste zit in de samenstelling:

> **85 van de 100 reviewplekken bewaken niets.** Ze vallen op een item waarvan de kolom al
> gevuld is, en dat item wordt door `publishRun` sowieso genegeerd
> ([enrichment.ts:429](lib/repo/enrichment.ts:429)). Slechts **15** rijen gaan over data die
> daadwerkelijk landt — waarvan **7** over CRI, het veld met 13.407 voorstellen.

De oorzaak: `createRun` sampleert over álle voorstellen
([enrichment.ts:276](lib/repo/enrichment.ts:276)), niet over de toepasbare. De verdeling over de
velden laat dat direct zien — `maxWattage: 32 · kelvin: 31 · dimmable: 26 · cri: 7 · beamAngle: 2
· ipValue: 2` — terwijl wattage, kelvin, beam en IP samen **nul** nieuwe waarden opleveren. Twee
derde van de menselijke aandacht gaat naar velden waar niets verandert.

Dat is een tweede, onafhankelijke fase-2-ingreep, en waarschijnlijk een goedkopere dan de
groepsverwerping: filter de voorstellen op "landt op een lege kolom" vóórdat `pickSampleIndices`
eroverheen gaat. Dan gaan alle 100 plekken over data die echt gepubliceerd wordt, en stijgt de
CRI-dekking van 7 naar iets in de orde van 80 rijen.

**Ontwerpvraag voor fase 2:** moet een 'fout'-oordeel de hele `field|nameShape`-groep verwerpen in
plaats van één rij? Dat is een kleine, goed testbare wijziging in `publishRun` (groepeer de fout
bevonden items op `field|nameShape`, filter alle items met diezelfde sleutel weg), en het maakt de
steekproef pas echt een poort: wat je één keer ziet en afkeurt, geldt voor alles wat er hetzelfde
uitziet. De twee plan-agents moeten dit wegen — inclusief het tegenargument dat een te grove
`nameShape` (cijfers → `#`) hele families onterecht kan wegvegen.

## Wat de run méér doet dan CRI

`startEnrichmentRun` draait per merk en over **alle zeven velden tegelijk**
([enrichment.ts:203](lib/repo/enrichment.ts:203)); er is geen veld-filter. CRI is de aanleiding,
maar de run stelt ook kelvin, wattage, lumen, IP, beam en dimbaarheid voor.

De meting maakt die keuze een stuk kleiner dan hij op papier was. Van de zeven velden leveren er
maar **twee** iets op: CRI (13.407) en dimbaarheid (3.449). De andere vijf produceren samen 73.804
voorstellen die allemaal op een reeds gevulde kolom vallen en dus genegeerd worden. "Alleen CRI"
versus "de volledige run" is dus geen 1-tegen-7 maar **1 tegen 2**.

Wat dan nog verschilt:

- **Dimbaarheid is het enige veld dat `open → geel` kan opleveren** (`judgeDimmable` kent geel,
  `judgeCri` niet). Laat je dimbaarheid weg, dan is elke statuswinst een `open → groen`.
- **Dimbaarheid kan nooit rood worden** — `judgeDimmable` geeft groen bij overeenkomst en geel
  bij een ander protocol, nooit rood ([engine.ts:385](lib/matching/engine.ts:385)). Het kan een
  regel dus niet verslechteren, alleen de rangorde beïnvloeden.
- Voor de rangverschuiving zit het verschil in de 352 producten (1,1 %) die twee velden erbij
  krijgen: die stijgen +0,30 in plaats van +0,15.

Bouwen kost in beide gevallen ongeveer hetzelfde, want een veld-filter is één `if` in de
parse-lus.

Wat de poort betreft zit het goed: `parsed-from-name` staat **niet** in
`UNCONFIRMED_TIER2_SOURCES` — die set bevat alleen `optic-code`
([engine.ts:197](lib/matching/engine.ts:197)). Deze data is dus groen-waardig, anders dan onze
optiekcode-gok. Terecht: het is de fabrikant zijn eigen opgave.

## Gemeten op de branch (29 jul)

XAL heeft **31.420** producten; de database 211.317. De briefing sprak van ~11.000 XAL-producten
met CRI in de naam — het zijn er **13.407**. Het getal "3 gevulde `cri` op 211k" klopt exact.

| veld | kolom gevuld | parser vindt | landt op lege kolom | parser = bron |
|---|---|---|---|---|
| maxWattage | 28.322 | 28.322 | **0** | 28.322/28.322 |
| kelvin | 27.850 | 27.850 | **0** | 27.849/27.850 |
| **cri** | **0** | **13.407** | **13.407** | — |
| ipValue | 2.090 | 2.087 | **0** | 2.087/2.087 |
| beamAngle | 5.284 | 1.295 | **0** | 1.295/1.295 |
| lumenOutput | 0 | 0 | **0** | — |
| **dimmable** | 14.267 | 17.699 | **3.449** | 14.250/14.250 |

Drie dingen die het plan veranderen:

**1. De vulling raakt maar twee velden.** Van de 90.660 voorstellen landen er **16.856**: 13.407
CRI en 3.449 dimbaarheid. De overige vijf velden leveren nul op — waar de naam iets zegt, staat
de kolom al gevuld. De fase-2-keuze "alleen CRI of de volledige run" is in werkelijkheid dus
"CRI, of CRI plus dimbaarheid". Veel kleiner dan hij leek. (`lumenOutput` levert niets omdat XAL
nooit `lm` in de naam zet en de parser bewust geen kaal getal als lumen leest —
[parser.ts:108](lib/enrichment/parser.ts:108).)

**2. De parser is onafhankelijk gevalideerd op 73.804 producten — 1 afwijking.** Waar de kolom
al gevuld ís, kunnen we de parser toetsen zonder mens. Dat is geen cirkelredenering: de
`tier2_source`-uitdraai laat zien dat álle bestaande waarden `import (geen stempel)` dragen (op
3.989 beam-graden uit de optiekcode-run na), en `scripts/import.ts` leest losse CSV-kolommen
(`r.max_wattage`, `r.kelvin`, `r.cri` — [import.ts:224](scripts/import.ts:224)) en roept
`parseProductName` nergens aan. Naam en kolom zijn dus twee onafhankelijke opgaven van dezelfde
fabrikant, en ze komen 73.803 van de 73.804 keer overeen.

De enige afwijking is bovendien geen parserfout maar een tegenspraak in de brondata:

```
[kelvin] parser 3000 vs kolom 2700 — SASSO 100 SQ SP CEIL 17,9W cob LED 3000K 220-240V
```

De naam zegt 3000K, de prijslijstkolom 2700. De parser leest de naam correct. (Dit raakt de
vulling niet — `kelvin` is hier al gevuld en wordt nooit overschreven — maar het is wél een
XAL-datafout in precies de SASSO-familie waar de testcases op leunen.)

Dit bewijs is een orde sterker dan de steekproef van 100 die de pijplijn zelf eist: 73.804
controles tegen een onafhankelijke bron, versus 100 rijen die een mens beoordeelt.

> ⚠️ **Maar het dekt CRI niet.** Die validatie werkt alleen waar de kolom al gevuld is, en bij
> XAL staat `cri` op **nul**. Er zijn dus nul onafhankelijke toetsen op precies het veld dat
> 13.407 waarden gaat leveren. De 73.804 bewijzen de *machinerie* (en dimbaarheid: 14.250/14.250),
> niet het veld waar het om gaat. Wie "de parser is al bewezen" als argument gebruikt om de
> menselijke poort over te slaan, gebruikt bewijs dat structureel langs het onderwerp heen valt.

**Wat CRI wél dicht.** Alle 13.407 voorstellen komen uit exact **vijf letterlijke tokens**
(`scripts/xal-cri-tokens.ts`):

| token | aantal |
|---|---|
| `CRI90` | 9.143 |
| `CRI80` | 2.028 |
| `CRI97` | 1.296 |
| `CRI95` | 924 |
| `CRI98` | 16 |

Geen enkele `Ra`-variant, geen `≥`, geen spatie, geen waarde buiten 80–98. De valse-positief-ruimte
is hier niet *klein* maar bij inspectie **leeg**: er is geen naamvorm waarin de parser iets anders
dan een CRI-label als CRI kan lezen. Dat is een vollediger dekking van dit ene veld dan 100
steekproefrijen ooit geven — maar het is een aparte meting, geen poort in de pijplijn.

**3. De rangverschuiving is begrensd — maar scheef.** De spreiding van de winst:

| velden erbij | producten | aandeel | verschuiving |
|---|---|---|---|
| 0 | 14.916 | 47,5 % | +0,00 |
| 1 | 16.152 | 51,4 % | +0,15 |
| 2 | 352 | 1,1 % | +0,30 |

Geen enkel product krijgt er zeven bij, dus de gevreesde 1,05 treedt niet op; het maximum is
**+0,30**. Maar de scheefheid is bijna 50/50: de helft van XAL stijgt 0,15 ten opzichte van de
andere helft, en dat is nog altijd drie keer de marge die in de wattage-zaak top-1 bepaalde. De
vierde regressie-categorie blijft dus reëel, alleen begrensd.

### Wélke specs de testcases vragen — en waarom dat het meetontwerp bepaalt

Gemeten via `scripts/spec-eisen-testset.ts`, met exact het parse-pad van de eval
(`extractPagesFromPdf` → `parseSpecLinesFromPages`, mét de echte merknamenlijst — zonder die
lijst leest raadhuis 0 regels in plaats van 31):

| case | regels | CRI | kelvin | watt | lumen | IP | beam | dimbaar |
|---|---|---|---|---|---|---|---|---|
| raadhuis | 31 | **31** | 31 | 22 | 22 | 22 | 30 | 29 |
| tno | 15 | **0** | 0 | 1 | 1 | 0 | 11 | 15 |

**Elke raadhuis-regel vraagt om CRI** — 19× ≥80, 11× ≥90, en één ≥92 (Lr302). **Geen enkele
tno-regel doet dat**, terwijl tno wél op alle 15 regels dimbaarheid vraagt.

### Twee populaties, twee rollen — verwar ze niet

De tabel hierboven is de **verse parse**: wat `parseSpecLinesFromPages` uit de PDF haalt, en dus
precies wat `scripts/eval-testset.ts` meet. Daarnaast staan er **opgeslagen** `spec_lines` in de
database, ontstaan via de AI-route of met de hand aangepast. Die twee lopen uiteen
(`scripts/tno-raadhuis-cri.ts`):

| case | verse parse | met CRI-eis | opgeslagen | met CRI-eis | dimbaar (opgeslagen) |
|---|---|---|---|---|---|
| raadhuis | 31 | 31 (100 %) | 42 | 39 (93 %) | 30 |
| tno | 15 | **0** | 20 | **2** | **20** |

De twee tno-regels mét CRI-eis zijn `Lr001` (rood) en `Lr302` (open). Ze bestaan óók in de verse
parse, maar dáár zonder CRI-eis — de opgeslagen versie draagt meer dan de deterministische parse
leest.

**Welke telt waarvoor:**

- **De nameting** draait `eval-testset.ts`, dat de PDF vers parseert en `evaluateSpecLine`
  aanroept. Het raakt de opgeslagen regels niet. Voor de vraag "beweegt tno?" geldt dus de verse
  parse: **0 CRI-eisen, tno moet stilstaan.**
- **De publish** hermatcht wél opgeslagen regels — maar alleen blauwe/open van XAL, en dat zijn
  er vier (zie zwakke plek 3). `Lr001` is rood en wordt niet hermatcht; `Lr302` is open en kan
  bewegen.

Meetnoot bij dit cijfer: filter opgeslagen regels op **dossier**, niet op `fixtureCode`. Codes als
`Lr301` komen in tien dossiers voor; een filter op code alleen gaf 76 "tno-regels" in plaats van
20. Dat is dezelfde nagebouwde-query-val als altijd, nu in mijn eigen meetscript.

> ⚠️ **Een armatuurcode identificeert geen regel — alleen een dossier + code doet dat.** `Lr302`
> is in raadhuis een **Exenia**-regel (`blauw`, CRI≥92) en in tno een **XAL**-regel (`open`).
> Zelfde code, ander dossier, ander merk. Deze val heeft in dit traject al twee keer toegeslagen:
> in de spec_lines-telling hierboven, en in de eerste voorspelling voor de nameting. Elke query
> en elke vergelijking indexeert daarom per case/dossier én code.

Dat geeft een meetontwerp dat we niet hoefden te bedenken:

> Vullen we **alleen CRI**, dan kan uitsluitend `raadhuis` bewegen. `tno` moet per constructie
> exact gelijk blijven — het vraagt het veld niet, dus het telt niet mee in `specScoreSql` en niet
> in `judgeCandidate`. **Beweegt tno tóch, dan klopt de meting niet of klopt de aanname niet.**
> Een ingebouwde controlegroep, gratis.

Nemen we dimbaarheid mee, dan vervalt die controle: tno vraagt dimbaarheid op alle 15 regels en
gaat dus meebewegen. Dat is een concreet argument voor gefaseerd vullen dat vóór deze meting niet
op tafel lag.

**De voorspelling voor de nameting — herzien op 30 jul.** Een CRI-eis is niet genoeg; er moet ook
een XAL-kandidaat zijn. Uit de nulmeting-JSON blijkt dat maar **vier** raadhuis-regels merk XAL
dragen:

| regel | status | rang | vraagt |
|---|---|---|---|
| Lr301 | geel | 1 | CRI≥90 |
| Lr303 | geel | 1 | CRI≥90 |
| Lw001 | open | 2 | CRI≥90 |
| Lw002 | geel | 2 | CRI≥90 |

De overige 27 raadhuis-regels zijn Bega (8), Exenia, Etap of merkloos (17). Die kunnen door een
XAL-vulling niet bewegen, hoeveel CRI ze ook vragen.

Rood is bij deze vier **niet** de verwachting: ze vragen alle CRI≥90 en XAL draagt 90, 95, 97 of
98. Rood kan alleen als de best passende kandidaat CRI80 blijkt te dragen.

> ⚠️ **Eerder fout voorspeld, hier vastgelegd zodat het niet terugkomt.** Ik schreef dat `Lr302`
> rood zou worden omdat die CRI≥92 vraagt terwijl XAL 90 levert. `Lr302` is een **Exenia**-regel
> en staat op `blauw` — dat merk is niet ingeladen. Ik nam aan dat de hele `Lr3xx`-serie XAL was
> omdat `Lr301` en `Lr303` dat zijn. Een XAL-vulling raakt die regel niet.

**De controlegroep is sterker dan gedacht.** `tno` heeft óók vier XAL-regels (`Lr302`–`Lr305`,
alle `open`, alle met een XAL top-1 kandidaat) — maar geen enkele tno-regel vraagt CRI. Dan telt
`cri` niet mee in `judgeCandidate` en niet in `specScoreSql`. Juist omdát er XAL-kandidaten zijn,
is stilstand een echte toets: het bewijst dat de vulling alleen werkt via het gevraagde veld.

Meetnoot: `kvk` (0/48) en `dordrecht` (0/18) lezen zonder `--ai` geen enkele regel — die hebben
de leesroute respectievelijk OCR nodig, met echte betaalde calls
([eval-testset.ts:19](scripts/eval-testset.ts:19)). De nul- en nameting steunen daarom op
`raadhuis` en `tno`; de andere twee alleen als Timo daar apart go voor geeft.

## Nulmeting op de branch (29 jul, zonder `--ai`)

| case | import | merk best/fout/leeg | statusverdeling | rang≤50 | auto-keuze | top-1 |
|---|---|---|---|---|---|---|
| raadhuis | 31/31 | 14/0/17 | open:12 blauw:10 geel:6 rood:2 paars:1 | 4/4 | 0/4 | 2/4 |
| tno | 15/20 | 7/0/8 | open:11 blauw:2 groen:1 geel:1 | – | – | – |
| kvk | 0/48 | – | – (vergt `--ai`) | – | – | – |
| dordrecht | 0/18 | – | – (vergt `--ai`) | – | – | – |

Dit is de lat: hier moet de nameting tegenaan. Let op `raadhuis rang≤50 = 4/4` — die staat al
maximaal, dus daar valt niets te winnen en alles te verliezen. `top-1 2/4` is de enige rangmaat
met ruimte omhoog én omlaag.

Meetnoot: `dordrecht` heeft geen tekstlaag en vergt `--ai` met echte, betaalde calls
([eval-testset.ts:19](scripts/eval-testset.ts:19)). De nul- en nameting draaien daarom zonder
`--ai` op `raadhuis`, `kvk` en `tno`; `dordrecht` alleen als Timo daar apart go voor geeft.

## Zwakke plek 3: publiceren is mechanisch te zwaar voor deze run

Niet epistemisch maar praktisch, en gemeten. `publishRun` doet **per product** één select en één
update ([enrichment.ts:414–447](lib/repo/enrichment.ts:414)), en `db/client.ts` gebruikt de
neon-**http**-driver: elke query is een losse HTTP-round-trip, en er is geen transactie.

Gemeten vanaf deze machine tegen de branch: **139 ms per round-trip** (25 metingen, warm).

| run | producten | round-trips | geschatte duur |
|---|---|---|---|
| alleen CRI | 13.407 | ~26.800 | **~62 min** |
| volledige run | ~31.000 | ~62.000 | **~144 min** |

Daar komt `rematchBrandLines` nog bovenop, dat per blauwe/open spec-regel een `runMatcher` draait.

Twee gevolgen. Ten eerste kan dit niet via de server-action/UI: dat loopt tegen elke redelijke
requesttimeout aan. Publiceren moet vanaf een script. Ten tweede is een crash halverwege reëel —
maar niet fataal: de run blijft op status `steekproef` staan (de statuswissel gebeurt ná de lus)
en `fieldIsEmpty` maakt een tweede poging idempotent. Wél telt `applied` dan dubbel op in de
counts.

Noot bij het getal: 139 ms is de latency vanaf hier naar de branch. Op Vercel draait de app naast
de database en is het een fractie daarvan — dit cijfer zegt iets over *onze* publish-run vanaf een
script, niet over de app in productie.

## Vangrails die niet mogen sneuvelen

- **Alles op de Neon-branch.** Guard is fail-closed op een positief signaal: `LUMENLOGIC_DB=branch`
  moet aanwezig zijn, anders breekt het script af. Reden: `bun --env-file=…` faalt níét op een
  ontbrekend bestand (geverifieerd door de sprintmaster) en pakt dan stil de shell-omgeving —
  mogelijk productie. De host-vergelijking met de productie-host is het tweede slot, niet het eerste.
- **Nulmeting én nameting op de branch.** Nooit branch-na tegen productie-vóór; dat vergelijkt
  twee databases in plaats van één verandering.
- Geld nooit in de ranking; `visible_products` blijft de kandidatenbron (het is een view over
  `products`, dus gevulde kolommen werken automatisch door).
- Besluit 4: geen-data blijft een grijze vlag, nooit stil wegfilteren.
- Buiten scope: de rauwe Supabase-tabellen, en elk merk behalve XAL tot XAL bewezen is.

## Meetlat voor fase 3

1. De vier testcases gaan niet achteruit, gemeten via `scripts/eval-testset.ts` met verse parse —
   nulmeting en nameting allebei op de branch. Elke verslechtering wordt teruggevoerd op een
   oorzaak en beoordeeld als *fout ingelezen* (regressie, blokkeert) of *eerlijker geworden*
   (geen regressie, wordt vastgelegd).
2. De steekproef van 100 is menselijk beoordeeld en goedgekeurd door Timo — niet doorgeklikt.
3. Geen enkele schrijfactie op productie zonder expliciete go per run.
