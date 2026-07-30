# Probleem: de specs die Serien zelf als kolom aanlevert, staan nergens in de catalogus

> Fase 1 (probleem uitschrijven), 30 jul 2026. Elk getal hieronder is óf uit de code afgeleid met
> bestandsverwijzing, óf gemeten met de échte functies over de échte import-bron
> (`data/source/brink_products.csv`, 211.310 rijen) via `scripts/merk-kolom-inventarisatie.ts` en
> `scripts/serien-steekproefvorm.ts`. Beide scripts lezen `iterRecords` (`scripts/csv.ts`),
> `parseProductName` (`lib/enrichment/parser.ts`) en `pickSampleIndices`/`nameShape`
> (`lib/repo/enrichment.ts`) — geen nagebouwde parse en geen nagebouwde query; die les kostte
> deze week vijf metingen (`docs/probleem-variant-ranking.md`).
>
> Getallen die van de sprintmaster komen (de rauwe Supabase-kolommen) zijn overal expliciet als
> **overgenomen** gelabeld. Ik heb ze **niet** kunnen verifiëren — zie "Blokkade 1".

## Het probleem in één regel

Serien Lighting levert CRI, kelvin, IP-klasse en wattage aan als **eigen kolommen** in zijn rauwe
prijslijsttabel, maar in de catalogus staan alle zeven matchvelden op **0 %** — en de bestaande
verrijkingsroute (naam parsen) kan er bij dit merk niets aan doen, want de namen bevatten geen
specs.

## Waarom Serien en niet een groter merk

De opdracht kiest Serien "klein genoeg om te overzien, compleet genoeg om iets te bewijzen". De
meting maakt die keuze sterker dan hij op papier was, en om een andere reden dan grootte: **bij
Serien is de kolomroute niet de betere route maar de enige route.**

Gemeten over de import-bron (`scripts/merk-kolom-inventarisatie.ts`), 1.955 Serien-producten:

| veld | kolom gevuld | wat de naam-parser vindt |
|---|---|---|
| maxWattage | 0 (0,0 %) | **0** |
| kelvin | 0 (0,0 %) | **0** |
| cri | 0 (0,0 %) | **0** |
| ipValue | 0 (0,0 %) | 12 (0,6 %) |
| beamAngle | 0 (0,0 %) | 24 (1,2 %) |
| lumenOutput | 0 (0,0 %) | **0** |
| dimmable | 0 (0,0 %) | **0** |

**98,2 % van de Serien-producten krijgt via de naam nul velden.** De resterende 1,8 % (36
producten) krijgt er precies één. Zo zien die namen eruit: `"ANNEX Ceiling S - Reflektor opal"`,
`"BLACK BOX 2025 - Standard"`, `"ANNEX Ceiling M - Reflektor Kristall"`. Decoratieve namen, geen
enkele spec-token.

Daarmee is stap 3 (naam parsen) voor dit merk **geen vangnet**. Wat de kolomroute hier niet
oplevert, levert niets op. Dat maakt Serien de zuiverste proef die er is: elk veld dat groen wordt,
is aantoonbaar door de kolomroute groen geworden.

### En dat legt een aanname onder de scope bloot — Prado zit precies andersom

Zelfde meting, 7.321 Prado-producten:

| veld | kolom gevuld | naam-parser vindt | landt op lege kolom |
|---|---|---|---|
| kelvin | 0 | **7.180 (98,1 %)** | 7.180 |
| cri | 0 | **6.826 (93,2 %)** | 6.826 |
| beamAngle | 0 | **6.938 (94,8 %)** | 6.938 |
| dimmable | 0 | 2.448 (33,4 %) | 2.448 |
| maxWattage / ipValue / lumenOutput | 0 | 29 / 11 / 0 | 29 / 11 / 0 |

Prado's productnamen dragen de specs zélf: `"acrotrack mini long black ano 0-10V 2700K 60°pc
CRI97 - black adapter"`. De sprintmaster meldt voor Prado's rauwe kolommen kelvin 98 % en
beamangle 95 % — **exact de dekking die de naam-parser vandaag al haalt, met code die er al
staat en die op 73.804 XAL-producten onafhankelijk gevalideerd is**
(`docs/probleem-lege-speckolommen-xal.md`).

93,2 % van Prado krijgt via de naam **3 of 4 velden** erbij (60,1 % drie, 33,1 % vier). Voor Prado
is de bestaande `startEnrichmentRun` dus vermoedelijk een goedkopere weg naar dezelfde data dan een
nieuwe kolomroute — en hij is nú al te draaien.

> Dit heropent het stappenplan niet: de drie stappen blijven staan. Het zegt iets anders, namelijk
> dat **de stap-per-merk-toewijzing een meting is en geen eigenschap van de stap**. Serien hoort
> bij stap 1/2 omdat het geen andere route heeft. Prado staat in de opdracht als "daarna, grootste
> aantal", maar de meting wijst voor Prado naar stap 3 — waar geen nieuwe code voor nodig is. Dat
> is een beslissing voor Timo, niet voor mij; ik leg hem alleen op tafel met het cijfer eronder.

Ter volledigheid, de andere drie merken uit de sprintmaster-lijst: **TAL** heeft zijn kolommen al
gevuld (kelvin 5.232 = 80,7 %; wattage, IP, beam, lumen ook) en de naam-parser vindt daar exact
dezelfde aantallen met **0** die op een lege kolom landen — behalve `dimmable`, waar 1.160
voorstellen (17,9 %) wél op een lege kolom vallen. **Muuto** (276) en **Northern** (309) staan
overal op 0 en krijgen via de naam ook vrijwel niets (7 resp. 10 producten, één veld).

## Blokkade 1: de bron waar dit hele traject over gaat, is vanuit deze sessie niet te bereiken

Dit is het harde punt en het staat vooraan omdat het stap 1 en stap 2 volledig tegenhoudt.

De rauwe per-merk-tabellen met kolommen als `CCT K`, `CRI Ra`, `Colour temp` en `lightcolour`
zitten **niet** in de brondata die dit project heeft:

- `data/source/` bevat vier bestanden: `brink_products.csv`, `brink_brands.csv`,
  `brink_categories.csv`, `brink_suppliers.csv`. Meer niet.
- `data/source/README.md` documenteert exact die vier tabellen (introspectie 2 jul via de
  Supabase MCP). De rauwe per-merk-tabellen staan er niet in — ze zijn ná die introspectie
  ontstaan of ze vielen buiten de export.
- `brink_products.csv` heeft 45 kolommen (header nagekeken); geen daarvan draagt de rauwe
  leverancierscel. De 44 spec-kolommen die er wél zijn, zijn ónze genormaliseerde kolommen —
  precies de kolommen die bij Serien op 0 staan.
- Er is in deze sessie **geen Supabase-toegang**: geen Supabase-MCP-tool, en geen enkele
  Supabase-credential in `.env.local` (die file bevat uitsluitend Neon-, Vercel-, Better-Auth- en
  Anthropic-sleutels). `grep` over de hele repo op `SUPABASE` levert alleen docs-verwijzingen.

Gevolg: ik kan de waardeverdeling per rauwe kolom **niet zelf meten**, en dat is precies wat val 1
uit de opdracht eist ("meet dus per kolom de WAARDEVERDELING, nooit alleen `count(*)`"). Alles wat
dit doc over `CCT K` en `CRI Ra` zegt, is overgenomen van de sprintmaster.

**Wat ik van die overgenomen cijfers wél kon controleren:** ze zijn intern consistent. De
opgegeven `CCT K`-verdeling telt op tot 1.658 van 1.955 rijen (84,8 %), de opgegeven bruikbare
waarden tot 1.283 (65,6 %) — wat de "echte bruikbaarheid rond 65-70 %, niet 91 %" uit de opdracht
bevestigt. En het Serien-productaantal klopt exact: **1.955** rijen in de CSV, hetzelfde getal als
de sprintmaster noemt. Dat is een goed teken over de bron, geen vervanging van de meting.

**Wat dit blokkeert en wat niet.** Stap 1 en 2 zijn niet te bouwen zonder deze tabellen — er is
geen kolom om over te zetten. Fase 1 en fase 2 (dit doc en het plan) zijn wél af te maken, want de
ontwerpvragen hieronder volgen uit *ónze* code en niet uit de bronwaarden.

**Wat er nodig is,** in volgorde van voorkeur:
1. Een read-only Supabase-connectiestring of service-key voor project `uvmeytxejlzvdgjgthmr` in
   een `.env.bron` (niet in `.env.local` — die is de productie-Neon).
2. Of: een CSV-export van de rauwe Serien-tabel in `data/source/`, zoals de vier bestaande.
3. Of: Timo draait de meetquery zelf en plakt de uitvoer; dan blijft dit doc leunen op
   overgenomen cijfers, wat voor het *plan* genoeg is maar voor de *bouw* niet.

## Blokkade 2: er is geen Neon-branch voor dit spoor

De vangrail is "alles op een Neon-branch, productie onaangeraakt". De guard daarvoor bestaat en is
goed (`scripts/branch-guard.ts`, fail-closed op `LUMENLOGIC_DB=branch` + endpoint-vergelijking als
tweede slot) — maar hij staat op de **XAL-branch** `claude/optimistic-wing-334c41`, die nog niet
naar `origin` is gepusht. In déze worktree bestaat hij niet.

Twee dingen zijn dus nodig vóór er één schrijfactie plaatsvindt:
- de guard hierheen halen (cherry-pick van de XAL-commits, of ze eerst laten landen op `main`) —
  **niet** een tweede guard bouwen;
- een eigen Neon-branch voor dit spoor, met de connectiestring in `.env.branch`. Ik kan die niet
  zelf maken: er is geen Neon-API-key en geen `neonctl` op deze machine. De XAL-worktree heeft een
  werkende `.env.branch` naar `enrichment-xal`, maar dat is de werkbranch van een andere sessie en
  daar horen mijn schrijfacties niet.

Zolang beide ontbreken, is elk script in dit spoor read-only — wat de twee meetscripts in dit doc
ook zijn: die raken geen database, ze lezen de CSV.

## Wat de bestaande pijplijn wél goed doet

Het goede nieuws eerst, want het bepaalt de omvang van de bouw. `createRun`
([enrichment.ts:268](lib/repo/enrichment.ts:268)) is **bron-agnostisch**: het krijgt een lijst
`Proposal{productId, productName, field, value}` plus een `source`-label, en regelt run-rij, items,
steekproef en event. Er zijn al twee aanroepers met verschillende bronnen:

| aanroeper | bron | source-label |
|---|---|---|
| `startEnrichmentRun` ([:178](lib/repo/enrichment.ts:178)) | `parseProductName` over de naam | `parsed-from-name` |
| `startOpticCodeRun` ([:225](lib/repo/enrichment.ts:225)) | gecureerde vertaaltabel | `optic-code` |

De commentaarregel bij `createRun` zegt het zelf: "Eén plek waar de steekproefpoort wordt
toegepast, zodat een nieuwe bron hem niet per ongeluk kan omzeilen." Een derde aanroeper —
`startSupplierColumnRun` met source bijvoorbeeld `supplier-column` — past dus in het ontwerp zoals
het bedoeld is. Ook de rest van het pad draagt het al: `publishRun` vult uitsluitend lege kolommen
([:429](lib/repo/enrichment.ts:429)) en stempelt `products.tier2_source[veld]` per veld
([:424](lib/repo/enrichment.ts:424)), dat is een `jsonb`-map dus een nieuwe waarde vergt geen
migratie ([schema.ts:296](db/schema.ts:296)).

Eén ding vergt een expliciete keuze: `UNCONFIRMED_TIER2_SOURCES` bevat alleen `optic-code`
([engine.ts:197](lib/matching/engine.ts:197)). Een leverancierskolom is de fabrikant zijn eigen
opgave — net als de naam — dus die hoort er **niet** in, en de data is groen-waardig. Dat is een
bewuste uitspraak, geen verzuim: zet je hem er wél in, dan kan geen enkele Serien-regel groen
worden en is de hele exercitie zinloos.

## Kern van het probleem: de menselijke poort is bij een kolom-bron blind

Dit is de zwaarste bevinding, hij is nieuw ten opzichte van het XAL-spoor, en hij zit in de poort
die de vangrails juist moet dragen.

### Gemeten, met de échte poortfunctie

`pickSampleIndices` stratificeert op `field|nameShape(productName)`
([enrichment.ts:94](lib/repo/enrichment.ts:94)). Bij de naam-route is dat precies goed: de waarde
*stáát* in de naam, dus een nieuwe naamvorm is een nieuw leespatroon. Bij een kolom-bron staat de
waarde niet in de naam — dan is de naam geen signaal over de waarde maar ruis.

`scripts/serien-steekproefvorm.ts` draait de échte `pickSampleIndices` over de échte 1.955
Serien-namen, met de overgenomen `CCT K`-verdeling als waarden (structuurmeting; de koppeling
product↔waarde is een stand-in en de uitkomst hangt er niet van af):

```
Serien: 1955 producten · 526 distincte naamvormen
Voorstellen (alleen bruikbare CCT K): 1283
Steekproef: 100 rijen
  distincte naamvormen erin : 100
  distincte WAARDEN erin    : 3 — 2700 (45×) · 3000 (51×) · 4000 (4×)
  steekproefrijen waarvan de naam de waarde bevestigt: 0/100
```

Drie uitspraken volgen daaruit:

1. **De steekproef koopt breedte in een richting zonder informatie.** 100 reviewplekken, 100
   verschillende naamvormen — en 3 verschillende waarden, die je met 3 rijen ook had gezien. De
   overige 97 plekken tonen hetzelfde feit opnieuw.
2. **De beoordelaar kan niets toetsen. 0 van de 100.** Het reviewscherm toont exact drie kolommen:
   productnaam, veld, waarde ([enrichment-panels.tsx:192–197](components/data/enrichment-panels.tsx:192)).
   Voor Serien wordt dat `"ANNEX Ceiling M - Reflektor opal" · kelvin · 3000` — en er is geen
   3000 in die naam. Bij XAL kon de mens de waarde in de naam terúglezen (`… 17,9W 3000K`); dat
   was de hele reden dat een steekproef van 100 iets betekende. Hier is het bewijs de rauwe cel,
   en die staat nergens in de database. **De poort staat open maar kijkt naar een lege muur** —
   precies de faalvorm die de code-commentaar bij `SAMPLE_MAX` beschrijft: "erger dan geen poort,
   want hij wekt vertrouwen dat er niet is" ([enrichment.ts:60](lib/repo/enrichment.ts:60)).
3. **Er is bij Serien géén onafhankelijke tweede toets.** Bij XAL kon de parser op 73.804
   producten tegen de al-gevulde kolom worden gelegd. Serien staat op alle zeven velden op 0: er
   is **niets** om tegen te vergelijken. Het XAL-argument "de machinerie is bewezen" geldt hier
   dus niet voor de waarden.

Wat de mens bij een kolom-bron überhaupt kan beoordelen, is daarmee scherper begrensd dan bij de
naam-route: **niet of de waarde waar is, maar of wij de cel goed hebben overgezet.** De waarheid
is de opgave van de fabrikant en die accepteren we (daarom hoort `supplier-column` niet in
`UNCONFIRMED_TIER2_SOURCES`). Dat is een verdedigbare positie — maar dan moet de rauwe cel wél
op het reviewscherm staan, anders beoordeelt de mens ook de overzetting niet.

### Twee ontwerpvragen die hieruit volgen

**(a) Draagt een item zijn bewijs mee?** `enrichment_items` heeft `productName`, `field`, `value`,
`source` en verder alleen run-/steekproefadministratie
([schema.ts:838](db/schema.ts:838)). Voor een kolom-bron mist de kolomnaam en de rauwe celtekst. Zonder die twee is `"…" · cri · 97` niet te beoordelen; mét (`CRI Ra: ">97"` →
`97`) is het in één oogopslag te doen — en dan controleert de mens exact de bewerking die stap 2
uitvoert. Dit raakt de schema-, de repo- en de UI-laag.

**(b) Waarop moet de steekproef stratificeren?** Voor een kolom-bron is de informatieve as de
**vorm van de rauwe waarde**, niet de naamvorm: één rij per distincte celvorm (`"2700"`, `">97"`,
`"> 95"`, `"-"`, `"OHNE LM"`, `"TUNABLE WHITE 2200-5000"`) dekt de hele normalisatie af, en dat
zijn er weinig. Het stratum-sleutelrecept zit vast in `pickSampleIndices`
([enrichment.ts:94](lib/repo/enrichment.ts:94)) en wordt door beide bestaande bronnen gedeeld —
dus of het per bron instelbaar wordt (met `nameShape` als default, zodat de naam-route
byte-identiek blijft) is een ontwerpkeuze met een testbare grens.

## De val die de opdracht noemt, in onze termen

**Val 2 — een kolomnaam zegt niet waar hij over gaat.** Muuto's kolommen heten
`BULB SPECIFICATION - KELVIN/WATT/LUMEN`: 100 % gevuld, over de aanbevolen *lamp* en niet over het
armatuur. Onze kolommen zijn ondubbelzinnig armatuurvelden — de matcher beoordeelt er het armatuur
mee ([tolerances.ts](lib/matching/tolerances.ts)) — en het schema heeft aparte velden voor de
lichtbron: `lightSource` ([schema.ts:282](db/schema.ts:282)), `lightSourceIncluded`, `lampFoot`,
`lampCategory` ([schema.ts:320–322](db/schema.ts:320)). Een lampwaarde in `kelvin` schrijven is
dus niet "ongeveer goed": het is een verkeerd feit op een veld waar de matcher hard op oordeelt.
`judgeKelvin` eist **exacte** gelijkheid en kent geen geel — `delivered === requested ? "groen" :
"rood"` ([tolerances.ts:77](lib/matching/tolerances.ts:77)); `judgeCri` en `judgeIp` zijn
hetzelfde verhaal met een minimumgrens ([:85](lib/matching/tolerances.ts:85),
[:67](lib/matching/tolerances.ts:67)). Een verkeerd overgezette lampkelvin maakt regels dus
**rood**, niet vaag.

Daaruit volgt een eis aan de vorm van de oplossing, los van welk plan er komt: de
kolom→veld-toewijzing is een **beoordeling per merk per kolom** en moet als reviewbaar artefact
vastliggen (tabel in code, met per kolom de expliciete uitspraak "dit beschrijft het armatuur" en
waarom), niet als iets dat op runtime uit een kolomnaam wordt afgeleid. Fuzzy matchen op
kolomnamen is precies de fout die val 2 beschrijft.

**Val 1 — gevuld is niet bruikbaar.** Overgenomen: `CCT K` is 91 % niet-leeg maar ~65 % bruikbaar;
`CRI Ra` bevat `">97"`, `">90"`, `"> 95"` (met én zonder spatie) plus 316× `"-"`. In onze termen:
`kelvin` en `cri` zijn `integer`/`smallint` ([schema.ts:276-277](db/schema.ts:276)) en
`toColumnValue` doet niets meer dan `parseInt` ([enrichment.ts:154](lib/repo/enrichment.ts:154)).
`parseInt(">97")` is `NaN` → `null`; `parseInt("2200-5000")` is stil **2200**. Een
plaatshouder-cel die per ongeluk als voorstel doorgaat, wordt dus óf niets óf een verkeerd getal,
en het tweede is erger. De scheiding "bruikbaar / plaatshouder / bereik" hoort daarom vóór de
voorstel-lijst te gebeuren, niet in `toColumnValue`.

**De bereik-ontwerpvraag** (`"TUNABLE WHITE 2200-5000"`, 44 rijen) is echt en Timo noemt hem zelf:
onze `kelvin` is één `integer`. Drie uitwegen, elk met een prijs — dit is expliciet een vraag voor
de plan-agents, niet iets om nu te beslissen:
- **overslaan** (44 rijen leeg laten): veilig, verliest een echte eigenschap, en tunable white is
  juist wat een bestek vaak vráágt;
- **representant kiezen** (bv. 3000): vult een getal dat het product niet uniek heeft, en
  `judgeKelvin` kent geen geel — dus een bestek dat 4000 vraagt krijgt **rood** op een product dat
  4000 wél kan. Dat is een verkeerd feit, geen benadering;
- **bereik modelleren** (extra kolom(men) + `judgeKelvin` erop): correct, maar het raakt de
  matcher en dat is geen "kolom overzetten" meer.

## Wat er nog niet gemeten is, en waarom niet

Eerlijk over de gaten, zodat het plan er niet omheen rekent:

- **De rauwe kolommen zelf** — blokkade 1. Alle bronwaarden in dit doc zijn overgenomen.
- **De nulmeting op een branch** (`scripts/eval-testset.ts`, verse parse) — blokkade 2. Onbekend
  is dus ook: **dragen `raadhuis` en `tno` überhaupt Serien-kandidaten?** Bij XAL bleken maar 4
  van de 31 raadhuis-regels een XAL-kandidaat te hebben, en dát bepaalde wat de nameting kon
  zien. Zonder die telling weet niemand of een geslaagde Serien-vulling op de testcases
  *zichtbaar* is. Dit is de eerste meting zodra er een branch is, en hij kan de hele
  bewijsvoering van scope veranderen.
- **De rangverschuiving.** De mechaniek is bekend uit het XAL-doc (`SPEC_COEFF` 0,15 per veld,
  termen worden opgeteld, marges van 0,05 beslisten eerder top-1). Serien zou 4 velden tegelijk
  vullen op één product, dus tot **+0,60** — twee keer de XAL-uitschieter. Te kwantificeren pas
  met de echte dekking per product, dus na blokkade 1.
- **De publiceer-duur.** `publishRun` doet per product één select en één update over de
  neon-http-driver, bij XAL gemeten op 139 ms per round-trip. Serien is klein: ~1.300 producten ×
  2 round-trips ≈ **6 minuten**. Dat past ruim binnen een script; de UI-route blijft ongeschikt.

## Vangrails die niet mogen sneuvelen

Overgenomen uit het XAL-spoor en hier onverkort van kracht:

- **Alles op een Neon-branch**, productie onaangeraakt tot Timo per run apart go geeft. Hergebruik
  `scripts/branch-guard.ts`; bouw geen tweede guard.
- **Agents krijgen geen databaseverbinding.** Ze lezen een bestand en schrijven JSON terug — een
  agent die in `sampleVerdict` kan schrijven, maakt de menselijke poort automatisch tevreden.
- **Zwerm-data via een bestand**, nooit inline in de prompt; elke agent meldt terug hoeveel regels
  hij werkelijk gelezen heeft, anders leest een leeg antwoord als "alles goedgekeurd".
- **`publishRun` is onomkeerbaar** (`rejectRun` werkt alleen op status `steekproef`,
  [enrichment.ts:495](lib/repo/enrichment.ts:495)). Op een branch is dat geen probleem — gooi de
  branch weg.
- **Metingen via `scripts/eval-testset.ts`**, verse parse, nooit een nagebouwde query.
- **Geld nooit in de ranking**; besluit 4: geen-data blijft een grijze vlag, nooit stil
  wegfilteren.
- Ik push niet (besluit W4). Commits blijven bij mijn eigen bestanden; er draaien parallelle
  sessies in dezelfde repo.

## Meetlat voor fase 3

1. De rauwe waardeverdeling per Serien-kolom is **zelf gemeten**, niet overgenomen, en de
   scheiding bruikbaar/plaatshouder/bereik is per waardevorm expliciet.
2. Per overgezette kolom staat vast — en op papier — dat hij het **armatuur** beschrijft en niet
   de lichtbron (val 2).
3. De steekproef die Timo beoordeelt, toont per rij de **rauwe cel** naast de genormaliseerde
   waarde, en dekt elke distincte celvorm minstens één keer.
4. Nulmeting én nameting op dezelfde branch via `scripts/eval-testset.ts`; elke verslechtering
   wordt herleid tot *fout overgezet* (regressie, blokkeert) of *eerlijker geworden* (geen
   regressie, wordt vastgelegd).
5. Geen enkele schrijfactie op productie zonder expliciete go per run.
