# Goal: de juiste variant komt bovenaan

> **Fase 2 af — klaar om uit te voeren, nog niet uitgevoerd.** Opgesteld 20 jul 2026 door de
> sprintmaster na fase 1 (`docs/probleem-variant-ranking.md`, **inclusief de correctie onderaan
> dat document — lees die eerst**) en twee plan-agents die vanuit verschillende hoeken sparden.
> Dit document is de synthese; werk 'm stap voor stap af.

## De kern, in één alinea

Dit is **geen ranking-probleem met een data-bijsmaak, maar een dataprobleem met een
ranking-symptoom.** Waar het onderscheidende signaal in een gevulde kolom zit (`max_wattage`
bij Lw001/Lw002: 13 vs 19,5 W) werkt de ranking al — die twee staan op **rang 3**. Waar het
alleen als tekst in de naam staat (XAL's optiekcode `FL`/`WF` voor Lr301/Lr303, `beam_angle`
**0 van 131** gevuld) faalt hij volledig: bij `limit=300` staat Jayden's artikel er nog steeds
niet in.

De grootste hefboom is daarom geen algoritme maar **een knop die al bestaat en nooit is
ingedrukt**: de verrijkingspijplijn (`lib/repo/enrichment.ts`, UI op `/data/enrichment`) is
compleet gebouwd, heeft 3 runs, en **0 producten met `tier2_source`**.

## De meetlat — expliciet herzien

**"Top-1 == Jayden's exacte artikelcode" is een foute KPI en wordt niet gebruikt.**
`L360048-2413537F` en `…38F` hebben identieke naam, kelvin, wattage én prijs (€349); `color_1`
is leeg. Jayden koos 37F, maar 38F was even goed — de regelset zegt zelf dat Brink bij gelijke
prijs cosmetische varianten zelf mag kiezen.

**De lat is: staat de equivalentieklasse (naam + prijs identiek) op rang 1–2.**

**En wees eerlijk over wat er níét komt:** `provable` blijft **leeg** voor alle vier de regels,
ook na de volledige fix — Lr301 vraagt lumen 2810 en beam 39°, die blijven onbekend. Er komt
hier geen groen uit. Wat verbetert is de rang en het aantal onbekende velden per kandidaat.

## Stappen

**Stap 0 — herijken (0,5 u).** Draai `scripts/eval-testset.ts --case=raadhuis --rank-limit=50`
(en één keer `--rank-limit=300`), leg de vier rangen + `provable`-lengte vast als nulpunt.
*Doet NIET:* code aanraken, de `--assert-nulmeting` bijstellen.

**Stap 1 — verrijkingsrun voor XAL (2–3 u, nauwelijks nieuwe code).** ⚠️ **Eerst de
steekproefpoort repareren.** `inSampleAt(i) = i % 3 === 0` levert bij ~13.400 items ~4.500
reviewrijen; ongereviewde items publiceren gewoon mee (alleen expliciet `'fout'` blokkeert).
Dat is een menselijke poort die alleen op papier bestaat — erger dan geen poort, want hij wekt
vertrouwen dat er niet is. Maak er eerst een begrensde, gestratificeerde steekproef van
(bv. 100 items verdeeld over distinct naamvormen, ~1 u). **Dán** pas: `/data/enrichment` → XAL
→ steekproef → publiceren; `publishRun` hermatcht zelf.
*Meet:* CRI gevuld op ≥11.000 XAL-producten (geverifieerd: 11.379 hebben CRI in de naam en een
lege kolom); Lw001/Lw002 verliezen elk twee `onbekend`-deviations; de vier rangen mogen niet
verslechteren.
*Doet NIET:* de parser uitbreiden, bestaande waarden overschrijven (`fieldIsEmpty` bewaakt dat),
andere merken draaien.

**Stap 2 — producttekst-hygiëne (2–3 u).** `lib/pdf/armaturenboek.ts`, `parseTocText`. Lr301's
`productText` is ~90 tokens inclusief de complete paginakop ("Blad 1 van 4 · Referentie Locatie
Montagewijze Vorm Fabricaat …"); Lr303's is schoon. Het record loopt door tot de volgende
CODE-token en slurpt de paginarand op. Begrens de recordlengte en/of knip op de bekende
kolomkop-markers.
*Meet:* Lr301 `productText` < 25 tokens. **`--assert-nulmeting` breekt hier by design** —
herijken in dezelfde commit, mét motivering.
*Doet NIET:* de segmentatie herontwerpen, de AI-leesroute raken.

**Stap 3 — spec-bewuste ordening (3–4 u).** `lib/matching/engine.ts`, `fetchCandidates`,
**uitsluitend** de `orderTerms`. Ontwerpkeuze uit de plan-fase: **specScore is een tiebreak, geen
gewogen som** — anders kan een product dat één zwak token deelt maar toevallig 3000K is boven de
echte SASSO uitkomen. De volgorde wordt:
`tekstrelevantie → specScore → prefixBonus → similarity → naam`.
Termen elk NULL-neutraal (`req is null OR kolom is null → 0`): kelvin exact +3 / anders −3;
watt binnen 10% +2, binnen 40% +1, daarbuiten −2; beam ≤10° +2, ≤25° +1, daarbuiten −2;
IP ≥ gevraagd +1, lager −3; lumen binnen 15% +1, daarbuiten −1. **CRI krijgt géén term** zolang
de kolom leeg is (dode SQL is oneerlijker dan hem weglaten) — herzien ná stap 1.
Guard: is er geen enkele gevraagde spec, dan is de query **byte-identiek aan vandaag** —
dat is de garantie waarmee `inv2`/`inv7b` overeind blijven (die draaien met `specs: {}`).
Let op de `ORDER BY 0`-valkuil die eerder een crash gaf.
*Meet:* Lr301 en Lr303 in de top-10 (SQL-simulatie van de plan-agent zegt rang 7 met alleen
kelvin+watt); Lw001/Lw002 blijven ≤3; `provable` blijft leeg; nieuwe test **"spec-boost
verplaatst nooit een kandidaat van lijst 2 naar lijst 1"**.
*Doet NIET:* de `list`-toekenning (`engine.ts:460-461`) of `judgeCandidate` raken, filteren,
iets in de `WHERE` zetten, een prijsterm toevoegen.

**Stap 4 — tokenselectiviteit (2–3 u).** `WALL` komt **16.959×** voor, `STRETTA` **36×** — en
`matchCount` weegt ze gelijk. Bovendien matcht `%100%` op "1008" en "1171". Woordgrens-matching
plus een zeldzaamheidsgewicht (`1 / ln(1 + df)`, df over de kandidatenset zelf, via één CTE met
window-functie — geen extra roundtrip, geen precompute).
*Meet:* **op KvK/TNO**, want Raadhuis is hier al genezen. Regressie-eis: Raadhuis-rangen
onveranderd; acceptatietest groen **zonder verwachtingen bij te stellen** — schuift er een
verwachting, dan is dat een stopmoment, geen update.
*Doet NIET:* tsvector/`ts_rank`, embeddings, stopwoordenlijsten, synoniemen.

**Stap 5 — optiekcode → beam angle voor XAL (2–3 u).** Gecureerde tabel (`FL`→39, `WF`→57,
`ME`→25, `SP`→15) als bron `'optic-code'` binnen dezelfde verrijkingspoort, met eigen
`tier2_source`-label zodat de herkomst zichtbaar blijft. Stopgap: laat de waarden bevestigen via
het net gebouwde 1.2-retourpad.
*Meet:* Lr301 en Lr303 op rang 1–2 (equivalentieklasse), en — **de enige echte test** — Lr301 en
Lr303 leveren **verschillende** topkandidaten op. Vandaag zijn die twee regels voor de engine
identiek.
*Doet NIET:* andere merken, een generieke optiek-ontologie, ETIM.

**Stap 6 — equivalentieklassen tonen (3–4 u, optioneel).** `37F`/`38F` als één rij met een
afwerkingskeuze in plaats van twee die om rang 1 vechten. Sluit aan op `lib/repo/variants.ts`.
Dit is waar het systeem hoort te zeggen: *hier houdt de data op, hier kiest de mens.*
*Doet NIET:* automatisch kiezen; `pickUnambiguousYellow` blijft ongemoeid.

**Totaal 15–21 u. Stap 0–1 is >50% van de winst in <20% van de tijd.**

## Wat expliciet géén goed idee is (uit beide plannen)

1. **Hard filteren op specs in de `WHERE`** — vaagt de catalogus weg (CRI 0 gevuld) en schendt
   besluit 4 frontaal. Ook niet met een `OR NULL`-tak: dat laat 67% staan, filtert dus vrijwel
   niets, maar introduceert wél een constructie die bij het volgende veld vergeten wordt.
2. **"Matcht op kelvin" genoeg maken voor lijst 1** — breekt `872597b`. Dit is de verleiding die
   de metriek mooi maakt en het product waardeloos.
3. **Embeddings of vectorzoeken** — dit zijn codes, geen proza. Vier `case`-expressies zetten het
   juiste artikel op rang 1; vectoren voegen infra, latency en on-uitlegbaarheid toe aan een
   matcher die aan Eduard uitgelegd moet kunnen worden.
4. **LLM in de kandidatenstap** — de modulekop verbiedt het expliciet. Niet stilletjes oprekken.
5. **Merkbrede spec-aannames** ("XAL is altijd CRI90") — dat is specs verzinnen.
6. **De limiet verhogen als "de fix"** — gemeten: bij 300 zit het artikel er nog steeds niet in.
7. **De tolerantietabel oprekken** (2700K als geel accepteren) — dat is de meetlat verbuigen tot
   de meting slaagt.
8. **Publiceren in stap 1 zonder de steekproef eerst hanteerbaar te maken.**

## Vangrails

IJzeren regels 1–5 onaangetast, m.n. **regel 2** (geen prijs in enige sorteersleutel;
`inv2`/`inv7b` groen) en **regel 3** (kandidaten alleen uit `visible_products`). **Besluit 4**:
geen-data is neutraal — nooit uitgesloten, alleen niet gepromoveerd. **"Groen is groen"**
(`872597b`): de `list`-toekenning wordt niet aangeraakt; de ranking bepaalt *wie* beoordeeld
wordt, nooit *hoe*. Statussen-semantiek uit `docs/matching-regelset.md` wordt niet
geherdefinieerd. Acceptatietest blijft het regressie-anker. Testset in
`~/Downloads/lumenlogic-testset/` nooit in git.

**Eén bewuste verschuiving die als besluit moet worden vastgelegd:** de volgorde *binnen lijst 2*
verandert van ruwe fetch-volgorde naar "meest aantoonbaar juist, minst onbekend, bovenaan". Dat
is presentatie, geen semantiek — mét de regel dat *minder onbekend* nooit *onbekend telt als
geslaagd* wordt.

## Modeladvies (beide plan-agents, onafhankelijk tot hetzelfde gekomen)

- **Sonnet 5** voor stap 1, 3 en 4: scherp omschreven, numeriek meetbaar, ontwerpruimte ≈ 0.
- **Fable 5** voor stap 0, 2, 5 en 6: daar breekt de nulmeting-assertie by design (stap 2), en
  daar ligt de grens tussen "wat het systeem mag afleiden" en "wat de mens kiest" (stap 5–6).
- **Moet het één model zijn: Fable 5.** De twee stappen met het hoogste risico op onherstelbare
  schade — de statussemantiek stilzwijgend verschuiven, en de menselijke poort in de verrijking
  tot theater reduceren — zijn allebei semantisch, niet technisch. Beide zien er in een diff
  volstrekt onschuldig uit.

## Werkwijze

Per stap: probleem kort uitschrijven → plannen met 2 agents waar het echt bouwwerk is → bouwen.
`bun vitest run` groen · `bunx tsc --noEmit` schoon · meetscript draaien en het delta rapporteren
· kleine commit + push · `HANDOVER.md` bij. **Push = productie hier: akkoord vragen vóór de push.**
Er draaien parallelle sessies — altijd eerst `git fetch origin`.

---

## ⚠️ Correctie op dit document (20 jul, ná stap 0)

Stap 0 is gedraaid. De nulmeting staat, en hij **herordent de stappen**: de keten die de rang
beweegt is **2 → 3 → 5**, niet 1 → 2 → 3. Hieronder eerst de meting, dan wat eruit volgt.

### Nulmeting (rev `091241d`, `--case=raadhuis`, echt codepad)

| regel | status | rang @50 | rang @300 | `provable` | `incomplete` |
|---|---|---|---|---|---|
| Lr301 | geel | >50 | >300 | **0** | 19 |
| Lr303 | geel | >50 | >300 | **0** | 31 |
| Lw001 | open | 1 | 3 | **0** | 10 |
| Lw002 | geel | 3 | 3 | **0** | 19 |

`provable` is leeg op alle vier — zoals beloofd, en dat blijft zo.

**De rang is limietafhankelijk** (Lw001 staat op 1 bij limit 50 en op 3 bij limit 300: een ruimere
fetch schuift meer kandidaten vóór hem). Een rang zonder zijn limiet erbij is dus betekenisloos —
noteer voortaan altijd `rang@limit`.

### Correctie 1 — Lw001/Lw002 zijn al klaar, niet "rang 3, kan beter"

Hun top-3 is drie keer dezelfde equivalentieklasse (`STRETTA 600 …37H/38H/32H`, identieke naam).
Jayden's exacte code staat op 3 puur door het alfabet tussen identieke broers. Tegen de herziene
meetlat (equivalentieklasse op rang 1–2) **halen deze twee de lat al**. Ze zijn vanaf hier een
regressie-anker, geen werkpost.

### Correctie 2 — de oorzaak bij Lr301/Lr303 is een andere dan het probleemdoc zegt

Het probleemdoc zegt: 131 SASSO-varianten delen de topscore en het alfabet beslist. Gemeten klopt
dat niet — **de SASSO's halen de lijst niet eens.** Jayden's artikel bestaat onder exact de naam
die het boek noemt (`SASSO PRO 100 FL ADJ DALI 27W HO cob LED 3000K 220-240V`), maar scoort
`matchCount = 6`, terwijl `INS 100 1171 CRI90 HIGH LUMEN DALI INCL.REFLECTOR 27,5W` **9** scoort.

De winnaar wint op *generieke* tokens uit de vervuilde producttekst — `CRI` (13.407 XAL-producten),
`90` (10.048), `LED` (22.621), `3000K` (10.607), `reflector` (286) — terwijl het juiste product de
*onderscheidende* tokens draagt: `SASSO` (4.846) en `PRO` (1.323). De vervuiling is dus geen
schoonheidsfoutje in stap 2, maar **de oorzaak dat de hele SASSO-familie buiten beeld valt**.

### De hefboommeting — INGETROKKEN, zie de hermeting hieronder

> ⚠️ **Deze tabel was fout en is vervangen.** Hij is gebouwd op handgetypte invoer in plaats
> van de echte geparste producttekst: wat "huidig (vuile tekst)" heette was Lr303's tekst, en
> wat "schone producttekst (stap 2)" heette was de kále typeaanduiding `SASSO PRO 100` (3
> tokens) — een tekst die stap 2 helemaal niet oplevert. Precies de fout waar het probleemdoc
> voor waarschuwt: meten met een nagebouwde invoer in plaats van het echte codepad. De
> conclusies die eruit volgden ("stap 2 is de eerste hefboom", "stap 3+5 brengt het naar 4")
> zijn daarmee ongeldig. Bewaard als waarschuwing, niet als meting.

### De hefboommeting, hermeten op de ECHTE geparste producttekst

Rang van Jayden's artikel binnen de XAL-kandidatenset, met `productText` zoals
`parseSpecLinesFromPages` hem vandaag levert. Cumulatief op de bestaande ordening.

| ordening | Lr301 (134 tok) | Lr303 (55 tok) |
|---|---|---|
| 1 · huidig | **2676** | **2023** |
| 2 · + spec-tiebreak (kelvin/watt) | 2464 | 2019 |
| 3 · + beam uit optiekcode FL/WF | 2453 | 2017 |
| 4 · + dim-term | 2453 | 2017 |
| 5 · + continue wattafstand | **2452** | **2020** |

**De hele termenstapel uit stap 3 en 5 beweegt vrijwel niets: 2676 → 2452.**

### Waarom — en waarom dat stap 3 als ontwerp onderuithaalt

`matchCount` is de **primaire** sorteersleutel. Jayden's artikel scoort `mc = 6`; ruim 2400
XAL-producten scoren hoger. Een tiebreak kan per definitie alleen hérordenen *binnen* een
gelijke matchCount — hij kan een product dat op de primaire sleutel verliest nooit inhalen.

Het goal-doc kiest expliciet "specScore is een tiebreak, geen gewogen som", met een goede
reden (anders kan een product dat één zwak token deelt maar toevallig 3000K is boven de echte
SASSO uitkomen). Maar díe keuze maakt de fix structureel onmogelijk. Het is geen
afstelprobleem — het is de ontwerpkeuze zelf.

**En stap 2 is niet de oorzaak.** Lr303's producttekst is vandaag al schoon (55 tokens, geen
paginarand) en zijn artikel staat op **2023**. De al-schone regel is even stuk als de vuile.
Hygiëne is nog steeds de moeite waard — 134 tokens met de complete paginakop hoort niemand in
een matcher te willen — maar het is een *opruimstap*, geen hefboom voor de rang.

### Wat de meting wél aanwijst

De enige invoer die het juiste artikel omhoog kreeg was de kále typeaanduiding `SASSO PRO 100`
(3 tokens → rang 105, met spec-tiebreaks → 4). Daar tellen alleen `SASSO`/`PRO`/`100` mee, en
verdwijnt het gewicht van `CRI`/`90`/`LED`/`3000K`/`reflector` — tokens uit Lr301's **eigen
legitieme regeltekst**, niet uit de paginarand.

Dat wijst allemaal één kant op: **het probleem zit in de tekstrelevantie-term zelf.** Zolang
50–130 beschrijvingstokens elk even zwaar tellen, wint een product dat toevallig veel generieke
spec-woorden in zijn naam heeft (`INS 100 1171 CRI90 HIGH LUMEN DALI …`, mc = 9) van het
product dat de typeaanduiding draagt (mc = 6). Dat is stap 4-terrein (tokenselectiviteit), niet
stap 3.

**Maar let op de eerdere meting:** naïeve idf-weging op de volle beschrijving maakte het
juist slechter. Zeldzame maar betekenisloze tokens (`Gefacetteerde`, `SDCM`, `112x106mm`,
`104`) krijgen dan het hoogste gewicht. "Zeldzaam" is niet hetzelfde als "onderscheidend".

**Er ligt hier dus geen uitgewerkt plan meer.** De vervolgvraag is een ontwerpvraag die opnieuw
gesteld moet worden: hoe bepaal je de typeaanduiding binnen een beschrijving, en hoe weeg je die
zwaarder dan de spec-prozaregels eromheen? Dat is stap 3 en 4 samen, en het is meer werk dan
het goal-doc ervoor uittrekt.

### Wat daaruit volgt — vier bijstellingen

**1. Stap 1 geeft nul rangwinst.** Verrijking vult kolommen, niet namen; `matchCount` verandert er
niet van. De claim "stap 0–1 is >50% van de winst" klopt niet voor dít doel. Stap 1 blijft wél de
moeite waard — het haalt `onbekend`-deviations weg bij de beoordeling en dicht de CRI-kolom — maar
het is een *beoordelings*-stap, geen *rangschikkings*-stap, en het hoort niet vooraan.

**2. Naïeve idf-weging op de volle beschrijving maakt het slechter, niet beter.** Gemeten op de
handgetypte invoer werd het 448 → 504, doordat zeldzame maar betekenisloze tokens
(`Gefacetteerde`, `pasring`, `SDCM`, `112x106mm`, `104`) het hoogste gewicht kregen en een
`PENDANT SHEET METAL CLIP` naar rang 1 tilden. Dit getal komt uit de ingetrokken meetreeks en
is dus indicatief, maar het mechanisme staat los van die fout: **zeldzaam ≠ onderscheidend.**
Stap 4 is daarmee niet "een gewicht toevoegen"; het vergt een begrip van wélke tokens de
typeaanduiding vormen.

**3. Twee termen die stap 3 mist — bewaard voor later, want nu niet doorslaggevend.** Het boek
eist DALI-2 en 62 van de 131 SASSO PRO 100-varianten hebben `dimmable` gevuld; en de
watt-emmers scheiden 26,5 W niet van 27 W (beide binnen 10% → zelfde +2, daarna beslist het
alfabet). Een `dimmable`-term (+2 / −2 / NULL 0) en een continue `abs(max_wattage − gevraagd)`
ná de emmers lossen dat op. **Op de echte tekst gemeten leveren ze samen 1 plaats op** (2453 →
2452) — ze zijn pas zinvol als de tekstrelevantie eerst gerepareerd is. Niet weggooien, wel
achteraan zetten.

**4. Stap 2 is geen hefboom maar wel terecht.** Zie hierboven: de al-schone Lr303 staat op 2023.
Doe de hygiëne omdat 134 tokens paginakop in een matcher niet hoort, niet omdat het de rang
redt. En bijstelling van de meetlat: **`Lr301 < 25 tokens` is niet haalbaar.** Lr301's schone
body is ~57 tokens en zijn tweelingregel Lr303 is 55 en geldt als gezond; er bestaat geen knip
die de één op 24 zet en de ander op 55 laat. Onder de 25 komen betekent `IP20`, `27 W`,
`3000K`, `(39°)` en `2810 lm` weggooien — precies de `req*`-velden die stap 3 en 5 nodig hebben.
Nieuwe lat: **Lr301 ≤ 65 tokens én `reqKelvin`/`reqWatt`/`reqBeamAngle` blijven gevuld.**

### Herziene volgorde — VERVALLEN

De volgorde uit de vorige correctie (2 → 3 → 5 → 1 → 4 → 6) berustte op de ingetrokken
meetreeks en geldt niet meer. Wat de hermeting overlaat:

- **Stap 3 en 5 zijn als tiebreak-ontwerp weerlegd** — ze kunnen niet werken zolang `matchCount`
  de primaire sleutel is. Ze moeten opnieuw ontworpen worden, samen met stap 4, als één
  ingreep op de tekstrelevantie-term. Dat is een nieuwe plan-fase, geen uitvoering.
- **Stap 2** blijft nuttig als opruiming, met de herziene meetlat. Los uitvoerbaar.
- **Stap 1** blijft nuttig voor de beoordeling (niet de rang). Los uitvoerbaar, poort eerst.
- **Stap 6** ongewijzigd, optioneel.

De acht punten onder "Wat expliciet géén goed idee is" blijven onverkort gelden — met één
aantekening bij punt 3 (embeddings): de reden om ze af te wijzen was "vier `case`-expressies
zetten het juiste artikel op rang 1". Die aanname is nu weerlegd. Dat máákt embeddings nog geen
goed idee (de bezwaren over infra, latency en uitlegbaarheid staan los), maar de motivering moet
opnieuw geschreven worden op iets dat wél klopt.

### Les voor de volgende sessie

Dit is binnen één sessie **twee keer** misgegaan op dezelfde manier: een meting gebouwd op
handgetypte of nagebouwde invoer in plaats van op het echte codepad. Eerst de sprintmaster met
een SQL-reproductie van `fetchCandidates` (zie het probleemdoc), daarna deze sessie met een
handgetypte `productText`. Beide keren zag de uitkomst er plausibel uit en wees hij de verkeerde
kant op. **Regel: elke rangmeting begint bij `parseSpecLinesFromPages` op het echte PDF, nooit
bij een string in een script.**

### Nog vast te leggen bij stap 1

`--assert-nulmeting` toetst het 16 jul-ijkpunt (raadhuis `merk-fout 31`, `status {blauw:30,
paars:1}`) en dat is sinds `38ef337` achterhaald — de meting geeft nu `merk-bestaand 14`,
`fout 0`, `status {open:13, blauw:10, geel:5, rood:2, paars:1}`. De assertie is dus al rood vóór
stap 2 hem "by design" breekt. Herijk hem in dezelfde commit als stap 2, mét motivering.
