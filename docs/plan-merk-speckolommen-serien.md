# Plan: Serien's eigen spec-kolommen naar de catalogus

> Fase 2 (plan na sparren), 30 jul 2026. Twee plan-agents met tegengestelde uitgangsposities
> hebben onafhankelijk van elkaar hetzelfde probleemdoc en dezelfde code gelezen
> (`docs/probleem-merk-speckolommen-serien.md`). Agent A: "minimale ingreep, snel bewijs, de
> branch is het vangnet". Agent B: "de poort eerst, en toets de premisse". Beide leverden
> leesverantwoording; beide lazen `lib/repo/enrichment.ts` volledig (748 regels).
>
> Wat hieronder als **gemeten** staat, heb ik zelf nagerekend over
> `data/source/brink_products.csv` met de échte parser — inclusief de cijfers die agent B zelf
> aandroeg. Die controle staat in "Ijking" onderaan.

## Waar beide agents het over eens zijn — dit is de kern van het plan

Zeven punten, onafhankelijk tot dezelfde conclusie gekomen. Deze staan niet meer ter discussie.

### 1. Er gaat een blokkade vooraf die niemand had zien staan: dit spoor kan vandaag niet draaien

Beide agents vonden het los van elkaar. `createRun` doet **één** bulk-insert van álle voorstellen
([enrichment.ts:293–305](lib/repo/enrichment.ts:293)). De XAL-branch heeft dat gerepareerd (commit
`fc049f9`, `INSERT_CHUNK = 1000`) met een **gemeten** grens op de neon-http-driver: 1.000 rijen
gaat goed, 5.000 faalt. Een Serien-run op alleen kelvin is ~1.283 voorstellen — precies in de
ongeteste band daarboven. Een Prado-run (23.432) zit er ruim boven.

Chunking is dus geen verbetering maar een **voorwaarde**. Hetzelfde geldt voor het veldfilter: in
deze worktree is de signatuur nog `startEnrichmentRun(db, brandId, actor?)`
([:178](lib/repo/enrichment.ts:178)) en draait onvoorwaardelijk over alle zeven velden; de
XAL-branch heeft `fields` toegevoegd (commit `7e0b94a`).

**Gevolg:** stap 0 is drie XAL-commits overhalen — `branch-guard` (+ test), `7e0b94a` veldfilter,
`fc049f9` chunking. Geen nieuwe code, wél gedeelde code. Voorkeur: de XAL-branch eerst op `main`
laten landen; anders cherry-pick. En géén tweede guard bouwen.

### 2. De kolom→veld-toewijzing wordt een gecureerde tabel in code

Nieuw bestand `lib/enrichment/supplier-columns.ts`, naar het model van
`lib/enrichment/optic-code.ts` — in deze codebase al de geaccepteerde vorm voor "een menselijke
beoordeling die geen afgeleide is" (dat bestand scheidt kennis van wat we durven voorstellen via
`CONFIRMED_CODES`, draagt zijn twijfel in commentaar, en heeft een eigen herkomst-label).

Per ingang verplicht: rauwe kolomnaam letterlijk, doelveld (een `FIELDS`-naam), **`beschrijft:
"armatuur" | "lichtbron" | "accessoire" | "onbekend"`**, motivatie, en de waardevorm-allowlist.
**Alleen `"armatuur"` levert een voorstel.**

Drie eigenschappen maken dit de val-2-poort:
- **Fail-closed.** De run kijkt nóóit naar een kolomnaam; een kolom die niet in de tabel staat
  levert nul voorstellen. Fuzzy matchen op kolomnaam is precies de fout die val 2 beschrijft.
- **Muuto's `BULB SPECIFICATION - KELVIN` staat er wél in**, met `beschrijft: "lichtbron"` en
  doelveld `null`. Vastleggen dát we die kolom gezien en afgewezen hebben is het halve punt: een
  kolom die er niet in staat, is niet te onderscheiden van een kolom die we vergeten zijn. Agent B
  voegde toe dat er ook geen bestemming ís — `products` heeft `lightSource`
  ([schema.ts:282](db/schema.ts:282)), `lightSourceIncluded`, `lampFoot`, `lampCategory`
  ([:320–322](db/schema.ts:320)) maar geen lamp-kelvin.
- **Een converse-test met tanden**, naar het model van `lib/field-catalog.test.ts` — dat heeft
  precies deze vorm al: *"meetbare velden: elke `measure.column` bestaat als échte drizzle-kolom"*
  ([:64](lib/field-catalog.test.ts:64)) plus de omgekeerde richting *"REGRESSIE: bestaat
  `products.<key>`, dan meet het veld die kolom ook écht"* ([:100](lib/field-catalog.test.ts:100)).
  Onze variant faalt als
  een doelveld geen `FIELDS`-lid is, als `beschrijft` ontbreekt, als de motivatie leeg is, of als
  een `"armatuur"`-regel geen normalisator noemt.

Niet in de database: een DB-tabel is niet diffbaar, niet reviewbaar in een commit, en de
bouw-/controleagents krijgen per vangrail geen verbinding — een tabel in code kunnen ze lezen.

### 3. De scheiding bruikbaar/plaatshouder/bereik gebeurt vóór de voorstel-lijst

In een pure module (`lib/enrichment/supplier-cell.ts`), niet in `toColumnValue`. Alleen `exact` en
`genormaliseerd` worden een voorstel. Plaatshouders (`"-"`, `"OHNE LM"`, `"LM"`) worden in **geen
enkele** stap een voorstel: ze zijn geen normalisatiegeval maar een "geen data"-geval — besluit 4,
grijze vlag, en ze horen in het runrapport met aantal en reden, niet in de items.

### 4. Het bereik wordt overgeslagen, en de prijs wordt geteld

`"TUNABLE WHITE 2200-5000"` (44 rijen) krijgt **geen** `kelvin`. Beide agents kozen dit, om exact
dezelfde reden uit de code: `judgeKelvin` is `delivered === requested ? "groen" : "rood"`
([tolerances.ts:77](lib/matching/tolerances.ts:77)) — geen geel, geen band. Vul je 3000 als
representant, dan krijgt een bestek dat 4000 vraagt **rood** op een product dat 4000 aantoonbaar
kan leveren; de kandidaat valt uit `aantoonbaar` én telt niet meer mee voor `geel` (`anyYellow`
eist geen rood), en de rangterm gaat van 0 naar −0,15 ([engine.ts:358](lib/matching/engine.ts:358))
terwijl 0,05 eerder top-1 besliste. Overslaan is neutraal (`null` → term 0, besluit 4); een
representant is actief schadelijk, en `publishRun` is onomkeerbaar.

De prijs — 44 van 1.955 producten (2,3 %) blijven onvindbaar op kelvin, en tunable white is juist
iets wat een bestek vaak vráágt — komt in het runrapport én in het `logEvent`-payload met kolom,
rauwe cel, aantal en reden. Bereik écht modelleren (`kelvinMin`/`kelvinMax` + `judgeKelvin` met een
band + `specScoreSql` + de aanvraagkant) raakt de matcher voor alle 211.310 producten en is geen
kolom-overzetting meer: op tafel leggen, niet nu doen.

### 5. Stap 1 en stap 2 zijn twee runs, en per veld

Niet omdat de code het vraagt (het verschil is een allowlist van celklassen), maar om drie redenen:
- **Attribueerbaarheid.** In run 1 moet de rauwe cel byte-voor-byte gelijk zijn aan de voorgestelde
  waarde. Elk verschil is per definitie een bug — een gratis zelftest van de hele keten. Run 2 is
  de eerste run met normalisatie, dus elke afwijking in de nameting is dááraan toe te schrijven.
- **De review wordt kleiner.** `fieldIsEmpty` ([:429](lib/repo/enrichment.ts:429)) laat wat run 1
  vulde ongemoeid, dus run 2 toont alleen de vormen die run 1 niet had.
- **De ordening is veilig:** run 1 vult de zekere gevallen, run 2 kan die nooit overschrijven.

Agent A scherpte dat aan met een observatie die de vraag grotendeels laat wegvallen: stap 2 is
inhoudelijk **één** transformatie die nieuwe waarden oplevert — een vergelijkingsoperator strippen
(`">97"` → 97). En die is per veld ongelijk verdedigbaar: `judgeCri` is `delivered >= requested`
([tolerances.ts:85](lib/matching/tolerances.ts:85)), dus 97 invullen bij "minstens 97" is
semantisch sound; bij `judgeKelvin` (exacte gelijkheid) is strippen **verboden**. Dus: run 1 =
kelvin (schone enkelwaarden), run 2 = cri (met operator-strip). Twee inhoudelijk verschillende
besluiten, apart te beoordelen.

### 6. Publiceren gaat nooit via de UI

`app/data/actions.ts` gebruikt de kale client uit `db/client.ts`, zonder enige env-check — één
vergeten variabele en de publiceerknop schrijft naar productie. Bovendien duurt publiceren bij 139
ms per round-trip te lang voor een request (Serien ≈ 1.300 producten × 2 round-trips ≈ **6
minuten**). De reviewroute is de commandoregel, achter de guard.

### 7. De eerste meting zodra er een branch is, kan de scope doden

**Dragen `raadhuis` en `tno` überhaupt Serien-kandidaten?** Bij XAL bleken maar 4 van de 31
raadhuis-regels een XAL-kandidaat te hebben, en dát bepaalde wat de nameting kon zien. Is het
antwoord 0, dan is `scripts/eval-testset.ts` geen meetlat voor Serien en moet er vóór de bouw een
andere komen. Goedkope query, dure ontdekking om laat te doen.

## Twee bugs die de sparring opleverde en die geen mening zijn

Agent B vond ze in de code; ik heb ze nagelezen en ze staan er. Ze raken **elke** bron, niet alleen
de kolomroute, en de tweede is onomkeerbaar.

### Bug 1 — `toColumnValue` is asymmetrisch en breekt de publish halverwege

`INTEGER_FIELDS` is `{kelvin, cri, lumenOutput}` ([enrichment.ts:50](lib/repo/enrichment.ts:50)).
Voor die drie geeft `parseInt` bij onzin `NaN → null` en slaat `publishRun` het item over. Maar
`maxWattage` en `beamAngle` zijn `numeric`-kolommen ([schema.ts:275,279](db/schema.ts:275)) en
`toColumnValue` geeft de string **ongewijzigd** terug ([:159](lib/repo/enrichment.ts:159)). Een cel
`"OHNE LM"` op een wattage-kolom belandt dus in `db.update(products).set({maxWattage: "OHNE LM"})`
([:440](lib/repo/enrichment.ts:440)) → Postgres weigert → en `publishRun` heeft **geen transactie**
en doet per product een losse update, dus de lus breekt **halverwege** af: een deel toegepast,
status nog `steekproef`, `counts` ongeschreven, en `applied` telt bij een tweede poging dubbel.

Serien's `CCT K` bevat volgens de sprintmaster 237× `"-"`, 70× `"OHNE LM"` en 24× `"LM"`. Reparatie:
`Number.isFinite`-toets voor de numeric-velden, 4 regels — plus de scheiding vóór de voorstellijst
(punt 3), zodat zo'n cel nooit een item wordt. Beide, want de eerste is een vangnet voor álle
bronnen en de tweede is het ontwerp.

### Bug 2 — een plaatshouder op een tekstkolom is permanent

`ipValue` en `dimmable` zijn `text` ([schema.ts:278,280](db/schema.ts:278)), en `fieldIsEmpty` telt
alleen `null` en `""` als leeg ([:163–169](lib/repo/enrichment.ts:163)). Publiceer je `"-"` naar
`ip_value`, dan is die kolom **voor altijd** "gevuld": geen enkele latere run — stap 2, stap 3, of
een echte aanlevering van het merk via het retourpad — mag hem nog aanraken. En `parseIp("-")` geeft
`null` ([tolerances.ts:62](lib/matching/tolerances.ts:62)), dus de matcher zegt `onbekend`. De kolom
draagt dan een waarde die niets betekent en die de weg blokkeert voor de waarde die wél iets
betekent. `publishRun` is onomkeerbaar (`rejectRun` werkt alleen op status `steekproef`,
[:495](lib/repo/enrichment.ts:495)).

Dit is het scherpste argument tegen "de branch is het vangnet": de branch beschermt de database,
niet de beslissing.

## Waar de agents het oneens zijn — één as, en die is voor Timo

**Wordt de steekproefpoort gerepareerd vóórdat er één kolomwaarde landt?**

De gemeten aanleiding: van 100 reviewrijen kan de beoordelaar **0** toetsen, en de steekproef ziet
3 distincte waarden verspreid over 100 naamvormen (`scripts/serien-steekproefvorm.ts`).

**Agent A — nee.** `pickSampleIndices` blijft byte-identiek. Drie argumenten:
1. De blindheid zit in wat op het scherm staat, niet in welke rijen gekozen worden. Verander je de
   stratum-sleutel naar celvorm, dan lost dat de *redundantie* op en de *blindheid* niet:
   `"ANNEX Ceiling M · kelvin · 3000"` is even onbeoordeelbaar uit welk stratum hij ook komt.
2. Bij een kolom-bron met een gesloten allowlist is de transformatie per celvorm **identiek en
   enumereerbaar** — drie gevallen, volledig gedekt door een unit-test, niet door 100
   steekproefrijen. Het XAL-spoor gebruikte exact dit argument al: alle 13.407 CRI-voorstellen
   kwamen uit vijf letterlijke tokens, "de valse-positief-ruimte is bij inspectie leeg".
3. `pickSampleIndices` wordt gedeeld door beide bestaande bronnen, en de code zegt zelf dat dit de
   plek is "waar een nieuwe bron de poort niet per ongeluk kan omzeilen"
   ([:265–267](lib/repo/enrichment.ts:265)). Per bron instelbaar maken vergroot het aantal paden
   door die poort van één naar drie.

A's concessies, die niets kosten: de rauwe cel in de **scriptuitdraai** (Timo beoordeelt op de
commandoregel — dat is geen voorkeur maar noodzaak, zie punt 6 — dus dit haalt meetlat 3 letterlijk
zonder migratie); een dekkingsassertie die `start` laat falen als niet elke celvorm in de
steekproef zit; en een samengesteld `source`-label `supplier-column:CCT K`, dat geen migratie vergt
(`source` is `text`, `tier2_source` is `jsonb`) en per gevuld veld permanent herleidbaar maakt uít
welke kolom het komt.

A gaf zijn zwakste plek zelf toe: zijn plan levert 100 rijen die elk hetzelfde niets zeggen, en de
praktische afhandeling wordt `keur <runId> goed alles` — precies de gewoonte die de
poort-reparatie van 20 juli wilde uitroeien. Op deze branch schadeloos; de *gewoonte* is niet
branch-lokaal.

**Agent B — ja, minimaal, en het venster is gratis.** B's planningsargument is het sterkste dat er
ligt: er is vandaag **geen kolomwaarde om over te zetten** (blokkade 1), dus het kritieke pad is
Timo's credential en niet onze code. Alles wat in dat venster aan de poort gebeurt, kost **nul
kalenderdagen**. Arriveert de credential morgen, dan kost B's positie 1–2 dagen extra.

B's vier ingrepen, in volgorde van hardheid:
- **G1 — het item draagt zijn bewijs.** `evidence jsonb` op `enrichment_items` (migratie 0017), en
  een **invariant in `createRun`**: elke `source` buiten `{"parsed-from-name"}` (daar *is* de naam
  het bewijs, en die staat al op het item) **moet** evidence dragen, anders gooit `createRun`. Dat
  is B's kern: een volgende bron kan dan niet blind worden toegevoegd.
- **G5 — de validerende normalisator + `toColumnValue` dichtzetten** (bug 1). Niet-onderhandelbaar.
- **G3 — de rauwe cel op het reviewscherm.** `getSampleItems` doet `select()`, dus de kolom komt mee;
  de kolom rendert alleen als minstens één item evidence draagt, dus het naam-route-scherm
  verandert geen pixel.
- **G2 — stratificeren op waardevorm**, via een derde parameter `keyOf` met exact de huidige
  uitdrukking als default. Voor `supplier-column` is de sleutel de **ongenormaliseerde** cel, dus
  `"> 95"` mét spatie kan niet meer buiten de steekproef vallen — wat vandaag wél kan.
- **G4 — groepsverwerping op `field|kolom|cel`** als vangnet. Op het XAL-spoor sneuvelde dit voorstel
  omdat `nameShape` de beoordeelde cijfers wegpoetst (104 van 676 CRI-naamvormen droegen twee
  CRI-waarden). Bij een kolom-bron is dat bezwaar weg: de waarde zit ín de sleutel en de
  normalisatie is een pure functie daarvan.

B's antwoord op A's punt 3 is het scherpste van de ronde: A's dekkingsassertie zit in een script en
is dus te omzeilen door het script niet te gebruiken — `publishRun` eist alleen dat elke
steekproefrij *een* oordeel heeft ([:132–150](lib/repo/enrichment.ts:132)), niet dat de rijen iets
betekenen. B's ingreep zit in gedeelde code en is niet te omzeilen.

En B gaf zijn zwakste plek even eerlijk toe: als de rauwe kolom werkelijk maar 3 waarden en 4
plaatshouders kent, was een uitdraai van 7 regels hetzelfde bewijs geweest als G1–G4 samen. B's
eigen beslisregel daarvoor: blijkt na de eerste echte meting de celvorm-ruimte per kolom onder ~10
te liggen, dan is G4 overbodig en G2 luxe — G1, G3 en G5 blijven staan, want die gaan over
toetsbaarheid en onomkeerbare schade, niet over volume.

**Waar ze elkaar vonden:** één 'fout'-oordeel op een landende steekproefrij ⇒ `rejectRun`, de hele
run weg, terug naar analyse. Bij een deterministische kolomroute is de verwachte foutratio 0; één
fout betekent dat het foutmodel niet klopt, en dan is doorpubliceren met een uitzondering het
verkeerde antwoord. Dat maakt groepsverwerping een vangnet en geen dragende balk.

## De premisse-toets: wat de naam-route catalogusbreed al kan

Beide agents toetsten de opdracht zelf. Agent B deed daarvoor eigen metingen; ik heb ze
onafhankelijk nagerekend en ze kloppen (zie "Ijking"). Dit zijn veldvullingen die de **bestaande**
`parseProductName` op een **lege** kolom legt:

| merk | producten | veldvullingen op lege kolom | producten met winst | spec-velden vandaag gevuld |
|---|---|---|---|---|
| Lombardo | 65.096 | **64.558** | 60.452 | **0** |
| Prado | 7.321 | **23.432** | 7.212 | **0** |
| Wever & Ducré | 8.120 | **21.936** | 7.051 | **0** |
| XAL | 31.420 | 16.856 | 16.504 | 28.895 |
| Kreon | 13.998 | 11.944 | 11.648 | 13.111 |
| Sylvania | 3.914 | 7.164 | 3.111 | **0** |
| TossB | 2.934 | 6.442 | 2.727 | **0** |
| Flos Architectural | 18.263 | 1.824 | 1.774 | 0 |
| TAL | 6.481 | 1.330 | 1.330 | 5.392 |
| **Serien Lighting** | **1.955** | **36** | **36** | **0** |

Catalogusbreed: **157.676** veldvullingen over **113.555** producten (53,7 % van 211.310), met code
die al bestaat en die op XAL tegen 73.804 gevulde kolommen is getoetst met 1 afwijking.

**Maar de naam-route is niet gratis, en dat is de andere helft van de toets.** Drie gemeten
defecten, allemaal in de bestaande parser:

| | gemeten |
|---|---|
| Lombardo-namen met kelvin als `"2.7K"` | **26.617** — de parser leest er **0** (`KELVIN_RE` eist `\d{3,5}`, [parser.ts:43](lib/enrichment/parser.ts:43)) |
| namen die letterlijk niet-dimbaar zeggen | **3.387** — waarvan **3.386** tóch een `dimmable`-voorstel krijgen ([parser.ts:120–128](lib/enrichment/parser.ts:120)) |
| namen die zelf een driver/converter/trafo zijn | **4.000** — waarvan **3.106** een `maxWattage`-voorstel krijgen |

Dus: **val 2 ("beschrijft dit het armatuur?") bestaat óók op de naam-route**, en de omgekeerde
dimbaarheid is geen onzekerheid maar een verkeerde waarde. De grootste enkele kelvin-winst in de
hele catalogus (26.617) zit niet achter een kolomroute maar achter één regex — met een eigen
meting, want `parseProductName` voedt óók de aanvraagkant
([armaturenboek.ts:131](lib/pdf/armaturenboek.ts:131)).

En bij Lombardo bestaat dezelfde epistemische leegte als bij Serien, 33× groter in volume: nul
gevulde spec-kolommen, dus de XAL-truc (parser tegen de al-gevulde kolom leggen) werkt daar niet.

### Wat dat betekent voor de merkvolgorde

Beide agents komen bij hetzelfde uit, langs verschillende wegen: **de volgorde van de kolomroute
blijft Serien-eerst** (het is het enige merk waar een groen veld aantoonbaar uit de kolomroute
komt), en **Prado is de ijking**.

Prado is daarvoor het juiste merk en niet Lombardo, ondanks dat Lombardo groter is: de
sprintmaster meet voor Prado's rauwe kolommen kelvin 98 % en beamangle 95 %, en de naam-parser
haalt vandaag 98,1 % en 94,8 %. **Prado is het enige merk waar de twee routes tegen elkaar te
leggen zijn.** Zeggen ze hetzelfde, dan is de kolomroute op Serien geloofwaardiger dan honderd
blinde reviewrijen — dat is de onafhankelijke tweede toets die Serien zelf niet heeft.

Twee eerlijke kosten aan Prado: de rangverschuiving is **groter** dan bij Serien (93,2 % krijgt 3
of 4 velden erbij, tot **+0,60** in de sorteersleutel — twee keer de XAL-uitschieter, twaalf keer
de 0,05-marge die eerder top-1 besliste), dus veldgefilterd en één veld per run. En het is onbekend
of `raadhuis`/`tno` Prado-kandidaten dragen, dus de repetitie bewijst machinerie en duur, niet
noodzakelijk statuswinst.

## Wat Timo moet beslissen

Beide agents kwamen onafhankelijk bij dezelfde hoofdvraag uit, in andere woorden:

> **Is het doel van dit spoor de kolomroute bewíjzen, of de catalogus vúllen?**

- **Bewijzen** → Serien, zoals de opdracht zegt. Het is het enige merk waar een groen veld
  aantoonbaar uit de kolomroute komt. Prijs: 2,3 % tunable-white-verlies, en nul onafhankelijke
  tweede toets op de waarden.
- **Vullen** → dan liggen 109.926 veldvullingen (Lombardo + Prado + Wever & Ducré) achter code die
  er al staat — maar bij twee van die drie merken zonder onafhankelijke toets, en met drie gemeten
  parserdefecten die eerst gerepareerd moeten worden.

Het antwoord is niet uit een meting te halen; het is een risicokeuze over de catalogus die de klant
straks gebruikt. **Mijn advies: beide, in deze volgorde** — de voorwaarden die de kolomroute nodig
heeft (branch-guard, chunking, veldfilter, publiceerscript) zijn *exact* de voorwaarden die de
naam-route voor Prado nodig heeft. Bouw ze één keer, draai Prado erop als repetitie én ijking, en
er ligt binnen hetzelfde venster een zichtbaar resultaat zonder één regel nieuwe bron-code. Serien
daarna, met de poort op sterkte.

Drie kleinere beslissingen die hieronder hangen:

1. **De poort-as** (A of B, hierboven). Mijn advies: **B's G1, G3 en G5** (evidence op het item +
   `createRun`-invariant, rauwe cel op het scherm, `toColumnValue` dichtzetten) — die gaan over
   toetsbaarheid en over de twee onomkeerbare bugs, en het venster is gratis omdat we op de
   credential wachten. **G2 en G4 pas ná de eerste echte kolommeting**, precies zoals B's eigen
   beslisregel voorschrijft: zijn er minder dan ~10 celvormen per kolom, dan zijn ze luxe.
2. **Tunable white:** 44 producten onvindbaar op kelvin laten (advies van beide agents), of de
   matcher openbreken voor een kelvin-band (raakt alle 211.310 producten).
3. **Waar Timo de steekproef beoordeelt:** terminal achter de guard (nu de enige veilige route), of
   in de UI — maar dan moet eerst het guard-gat in `app/data/actions.ts` dicht.

## Ijking van de cijfers in dit doc

Agent B's metingen zijn niet op gezag overgenomen. Ik heb ze nagerekend met een eigen script over
dezelfde CSV en de échte `parseProductName`:

- **157.676** veldvullingen / **113.555** producten: identiek.
- Alle tien merkregels in de tabel: identiek.
- **XAL 16.856** komt exact overeen met het onafhankelijk gepubliceerde getal in
  `docs/probleem-lege-speckolommen-xal.md` — dat is de sterkste ijking die er is, want dat getal is
  op de Neon-branch gemeten en niet uit de CSV.
- De drie parserdefecten: in **substantie** bevestigd, met kleine afwijkingen die uit de
  regex-definitie komen en niet uit een fout. B mat 3.635/3.376 niet-dimbaar, ik 3.387/3.386; B mat
  1.916/903 drivers, ik 4.000/3.106 (bredere term-lijst). B mat dat de parser 28 van de `"2.7K"`
  vormen leest, ik 0. De richting en de orde van grootte staan in alle drie de gevallen.

Wat **niet** geijkt is en dat ook niet kan: elk getal over de rauwe Supabase-kolommen. Dat blijft
overgenomen van de sprintmaster tot blokkade 1 open is.
