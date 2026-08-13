# Goal: groen betekent "dit is hét product", en het systeem zet dat zelf vast

> Probleem met alle metingen: `docs/probleem-groen-betekent-zeker.md` (12 aug 2026).
> Aanleiding: punt 3 uit de Brink-demo van 12 aug — *"Groen = klaar. Geen handmatige
> check op groene regels."* Besluit Timo: **route B** (aanscherpen zonder LLM).
>
> **Gebouwd op 12 aug 2026** — zie "Gebouwd" hieronder voor de uitkomst en de metingen.

## ✅ Gebouwd (12 aug)

Drie bestanden geraakt: de statusbepaling in de matchmotor, het wegschrijven in de
repolaag, en het event-label. Wat de meetlat opleverde:

| | uitkomst |
|---|---|
| Precies één groene kandidaat | **groen**, kandidaat aangewezen |
| Twee even groene kandidaten | **geel** — Brink kiest, systeem zet niets vast |
| Eén groene naast een gele kandidaat | blijft **groen** (besluit 2) |
| Codetreffer op één product | **groen**, ook mét afwijking (B7 ongemoeid) |
| Eén code op twéé zichtbare producten | **geel** — het open punt uit het probleemdocument |
| Degradatie-slot | twee groene + één schoon-gele → geen automatische keuze |
| Groene regel in de repolaag | `matchedProductId` gezet, `chosenBy: "system:auto"`, event |
| Groene regel met open OCR-leescheck | flag blijft, vastzetten **geblokkeerd** |
| Alleen onvolledige kandidaten | ongewijzigd (`open`) |

**De acceptatieketen verschoof precies zoals bedoeld.** In het test-armaturenboek (20
regels) is er exact één regel die van groen naar geel zakt: **Lw101**, met twee even
groene NEST-kandidaten (wit en zwart). Dat is letterlijk het geval dat Brink in de demo
aanwees. De vier overgebleven groene regels zet het systeem nu zélf vast.

Het zichtbare gevolg staat in de offerte:

| | vóór | ná |
|---|---|---|
| Regels op de offerte | 6 | **11** |
| Totaal groen | € 660 | **€ 1.670** |
| Totaal geel (auto-door) | € 490 | € 490 |
| Samen | € 1.150 | **€ 2.160** |
| p.m.-posten | 9 | 9 |

De vier systeem-groene regels (€ 830) vielen tot nu toe uit de offerte omdat ze geen
gekozen product hadden. Dát was punt 3. De eindverdeling ná review is onveranderd
(8 groen · 4 open · 3 geel · 1 rood · 2 blauw · 2 paars) — alleen heeft het systeem vier
van die acht groene regels zelf vastgezet in plaats van een mens.

## Probleemstelling

Brink leest "groen" als een uitspraak over **identiteit**: dit is hét product dat gevraagd
werd, één stuk, klaar. De code bedoelt er iets anders mee — "er is minstens één kandidaat
die geen enkele gevraagde spec tegenspreekt", een uitspraak over **specs** die over acht
kandidaten tegelijk waar kan zijn.

Daardoor gebeuren er twee dingen die Brink als onnodig handwerk ervaart:

1. een groene regel heeft géén gekozen product (`matchedProductId` blijft leeg) en valt
   dus uit de offerte tot een mens op "Choose" klikt;
2. de zekerdere uitkomst vraagt vandaag méér handwerk dan de minder zekere — voor geel
   bestaat auto-door (B3) wél, voor groen niet.

De handelingen weghalen zonder de definitie aan te scherpen zou het omgekeerde van veilig
zijn: dan gaat een willekeurige van acht kandidaten ongezien het klantdocument in.

## Oplossing

Groen wordt een identiteitsuitspraak, en wat groen is zet het systeem zelf vast.

- **Groen** = het systeem wijst één product aan en zegt "dit is hem". Dat is precies één
  aantoonbare kandidaat waarvan elk beoordeeld veld groen is, óf een exacte
  artikelnummertreffer op precies één zichtbaar product.
- **Twee of meer** kandidaten die allebei kunnen → **geel**: Brink kiest, met de bestaande
  "welke van deze N"-kaart.
- Wat groen is, krijgt direct een gekozen product, met het systeem als kiezer en een event
  in het audittrail. Geen klik meer.

Dit levert **minder** groen dan vandaag. Dat is de bedoeling: het groen dat overblijft
betekent wat Brink denkt dat het betekent.

De OCR-leescheck blijft ongemoeid. Die gaat over de bron ("heeft de AI deze regel goed
overgenomen?"), niet over de match, en het AI-vangnet hangt eraan.

## User stories

1. Als calculator bij Brink wil ik dat een groene regel al een product heeft, zodat ik hem
   niet eerst hoef aan te klikken voordat hij in de offerte meetelt.
2. Als calculator wil ik dat een groene regel meteen een naam en een prijs toont, zodat ik
   aan de regel zelf zie wat er is gekozen.
3. Als calculator wil ik dat een groene regel zonder mijn tussenkomst op de offerte staat,
   zodat "groen = klaar" ook echt klaar betekent.
4. Als calculator wil ik dat er bij een groene regel nooit meerdere even goede kandidaten
   zijn, zodat "groen" een keuze is en geen greep uit een lijst.
5. Als calculator wil ik dat twee kandidaten die allebei aan de eisen voldoen mij de keuze
   geven, zodat het systeem nooit ongezien voor mij kiest tussen twee gelijkwaardige producten.
6. Als calculator wil ik dat een keuze tussen twee gelijkwaardige kandidaten geel is en in
   mijn wachtrij staat, zodat ik hem niet hoef op te sporen.
7. Als calculator wil ik dat een gevraagd artikelnummer dat wij exact in huis hebben groen
   is, ook als er één afwijking op staat, zodat de code zijn bewijskracht houdt.
8. Als calculator wil ik dat een artikelnummer dat op twéé van onze producten past aan mij
   wordt voorgelegd, zodat ik bepaal welk product de klant bedoelde.
9. Als calculator wil ik de afwijkingen blijven zien op een automatisch vastgezette groene
   regel, zodat het vastzetten niets voor mij verbergt (C-07).
10. Als calculator wil ik dat een geïmporteerde regel zijn leescheck houdt, ook als hij
    groen is, zodat ik blijf zien of de AI de brontekst goed heeft overgenomen.
11. Als calculator wil ik dat een regel met een openstaande leescheck nog niet automatisch
    wordt vastgezet, zodat een verkeerd gelezen merk nooit stil een product kiest.
12. Als Brink-directie wil ik dat elk automatisch vastzetten in het audittrail staat, zodat
    achteraf te reconstrueren is wie of wat welke regel heeft gekozen (IJzeren regel 5).
13. Als Brink-directie wil ik in dat audittrail kunnen zien of het systeem zéker was of
    alleen een bijna-match afrondde, zodat de twee soorten automatisme te scheiden zijn.
14. Als calculator wil ik dat twijfel altijd naar mij gaat en nooit stil de offerte in,
    zodat de veilige kant de default blijft (IJzeren regel 4).
15. Als calculator wil ik dat een regel zonder kandidaten of met alleen onvolledige
    kandidaten zich precies zo gedraagt als vandaag, zodat deze ingreep niets anders raakt.
16. Als bouwer wil ik dat het "precies één"-oordeel op één plek in de code staat, zodat de
    regel voor groen en de regel voor geel niet uit elkaar kunnen lopen.

## Implementatiebesluiten

### 1. Groen is een oordeel over één aanwijsbare kandidaat

De matchmotor krijgt naast de bestaande "ondubbelzinnige bijna-match" (geel, B3) een
tweede aanwijzing: **de zekere kandidaat**. De motor zet die alleen als de regel groen is,
en groen ontstaat nog maar op twee manieren:

- **exacte codetreffer op precies één zichtbaar product**, en dat product staat op lijst 1
  (aantoonbaar). Blijft groen mét een afwijking (B7 ongewijzigd). Is élk beoordeeld veld
  van die treffer rood, dan blijft het `open` — bestaand gedrag.
- **precies één aantoonbare kandidaat waarvan elk beoordeeld veld groen is.**

Alles daarboven wordt geel.

### 2. Het aantal groene kandidaten is wat telt, niet het totale aantal kandidaten

Er is precies één groene kandidaat nodig; dat er daarnaast gele of onvolledige kandidaten
staan verandert niets. Dat is de letterlijke opdracht ("twee of meer groene kandidaten →
geel") en het is ook het juiste oordeel: van al het gevondene voldoet er dan maar één aan
álles wat gevraagd is, en de rest wijkt aantoonbaar ergens af. Brink ziet die alternatieven
onverminderd op het regeldetail.

Twee kandidaten die állebei aan alles voldoen zijn wél gelijkwaardig — daar kiest een mens.

### 3. Eén code op twee producten is geel

`article_code` is niet uniek; alleen `brand_id + supplier_article_code` is dat. De
kandidatenstap begrenst de codetreffers wel (`limit`) maar dedupliceert ze niet. Raakt de
gevraagde code twee of meer **verschillende zichtbare producten**, dan is er wel een
codetreffer maar geen enkelvoudige identiteit → **geel**, dezelfde regel als twee groene
kandidaten. Dit was het open punt uit het probleemdocument; hiermee is het beantwoord.

### 4. Degradatie-slot op het geel-auto-door

Het bestaande auto-door voor geel (B3) zet de enige schoon-gele kandidaat automatisch vast.
Dat mag **niet** meeliften op geel dat is ontstaan uit een groen-degradatie. Anders zou een
regel met twee groene kandidaten én één schoon-gele kandidaat automatisch die gele kiezen —
terwijl er twee bétere kandidaten liggen waarover Brink juist moet beslissen.

Regel: is er meer dan één kandidaat die de groen-drempel haalt (of raakt de code meer dan
één product), dan gaat de regel altijd naar de mens en zet het systeem niets vast.

### 5. Vastzetten loopt via één pad in de repolaag

De repolaag zet vandaag de auto-geaccepteerde gele kandidaat vast: `matchedProductId` op de
regel, `chosen` + `chosenBy: "system:auto"` op de kandidaat, en een event. De zekere groene
kandidaat gaat door datzelfde pad. Daarmee gelden alle bestaande waarborgen automatisch ook
voor groen — met name: **een bewaarde review-flag (ocr, variant, onvolledig) blokkeert het
vastzetten**, zodat een regel met een openstaande leescheck eerst langs de mens gaat.

`reviewKind` blijft bij een groene regel wat hij is: de matcher zet er geen nieuwe vlag op,
en een bewaarde bronvlag blijft staan.

### 6. Eigen event-actie voor het zekere groen

Het automatisch vastzetten van groen logt onder een **eigen actie**
(`certain_match_auto_accepted`), naast de bestaande `near_match_auto_accepted` voor de gele
bijna-match. Zo is in het audittrail en in de analytics te scheiden of het systeem zeker was
of alleen afrondde. Payload in dezelfde vorm: het gekozen product plus de afwijkingen.

### 7. Wat niet verandert

- De leescheck (`reviewKind: "ocr"`) blijft onvoorwaardelijk op elke gelezen regel staan, en
  het AI-vangnet blijft eraan hangen.
- De kandidatenlijsten (aantoonbaar / onvolledig), de ordening, de tekstscore en de
  spec-toetsing blijven ongemoeid; alleen de **statusbepaling** en het **vastzetten**
  veranderen.
- De offerteregel-filter (status groen/geel + geldige stuksprijs) blijft zoals hij is — hij
  gaat vanzelf goed zodra een groene regel een product heeft.
- Blauw, paars, rood en open veranderen niet.

## Testbesluiten

Een goede test hier toetst de **uitkomst van een regel** — welke status, welk product
vastgezet, welk event — nooit hoe de motor daar intern komt. Drie bestaande naden, geen
nieuwe. De naden zijn vooraf met Timo afgestemd.

### Naad 1 — de matchmotor (`evaluateSpecLine`)

Prior art: `lib/matching/engine.test.ts`, echte mini-catalogus via `createTestDb` +
`seedBrandProduct`. Dit is de hoofdnaad; de hele definitiewijziging is hier waarneembaar.

- precies één aantoonbare kandidaat, elk veld groen → **groen**, met die kandidaat als de
  zekere;
- twee groene kandidaten → **geel**, geen zekere kandidaat;
- één groene kandidaat naast een gele kandidaat → blijft **groen** (besluit 2);
- exacte codetreffer op één product → **groen**, ook met één afwijking (B7);
- exacte codetreffer op twee zichtbare producten → **geel** (besluit 3);
- codetreffer waarvan élk beoordeeld veld rood is → **open** (ongewijzigd);
- geen kandidaten / alleen onvolledige kandidaten → ongewijzigd;
- degradatie-slot: twee groene kandidaten plus één schoon-gele → geel, en géén
  automatische keuze (besluit 4).

De bestaande invarianten inv1–inv7b, de gat-A/gat-B-tests en de B3/B7-tests blijven staan;
waar ze een aanname over groen bevatten die met deze ingreep verschuift, verschuift de
verwachting mee — met een regel uitleg waarom.

### Naad 2 — het wegschrijven (`runMatcher`)

Prior art: `lib/repo/matching.test.ts:73` ("b3 auto-door: matched gezet, kandidaat chosen
system:auto, reviewKind null, event gelogd") — de groene variant is daarvan de spiegel.

- groene regel → `matchedProductId` gezet, kandidaat `chosen` met `chosenBy: "system:auto"`,
  event `certain_match_auto_accepted` gelogd, geen geel-reviewvlag;
- groene regel met een bewaarde `ocr`-flag → flag blijft staan én blokkeert het vastzetten;
- hermatch is idempotent: dezelfde uitkomst geeft dezelfde keuze, geen dubbele events.

### Naad 3 — end-to-end tot in de offerte

Prior art: `tests/acceptatie-aanvraag-estimate.test.ts` (matcher-statusverdeling, review,
estimate, events-audittrail) inclusief de screenshots light/dark × mobile/desktop die de
Werkwijze eist.

Dit is de naad die het punt van Brink bewijst: een groene regel gaat **zonder klik** de
offerte in. ⚠️ Deze test verschuift met opzet — de statusverdeling in de testnaam én de
offertetotalen bewegen mee. De nieuwe waarden worden vastgelegd als de nieuwe waarheid, met
de reden erbij; het audittrail-scenario krijgt de nieuwe event-actie erbij.

### Meting (geen test): de eval-testset

`scripts/eval-testset.ts` zonder `--ai` (read-only) over raadhuis + kvk + tno + dordrecht,
vóór en ná, per status. Deze ingreep verschuift die uitkomsten met opzet — de tabel hieronder
is het regressie-anker, niet een "ongewijzigd"-belofte.

### Meetlat

- `bun run typecheck` schoon;
- `bun vitest run` groen, inclusief de bijgewerkte screenshots;
- vóór/ná-tabel van de eval-testset ingevuld in dit document;
- elke verschuiving in de eval-tabel is te verklaren uit besluit 1, 2 of 3 — een verschuiving
  die dat niet is, is een bug.

## Buiten scope

- **De LLM-matchmotor** (route A uit het probleemdocument): "het model wijst één product aan
  met hoge zekerheid" wacht op meer ingeladen prijslijsten en is een eigen traject.
- **De OCR-leescheck losmaken van groene regels.** Dat is een apart besluit met een eigen
  risico (het AI-vangnet hangt eraan) en staat expliciet niet in deze ingreep.
- **De review-UI.** De "welke van deze N"-kaart bestaat al en wordt hergebruikt; er komt geen
  nieuw scherm en geen nieuwe knop bij.
- **De kandidaten-`limit`** (nu 8) en de ordening blijven zoals ze zijn.
- **Deduplicatie in de kandidatenstap.** Twee producten met dezelfde `article_code` blijven
  twee kandidaten; ze worden geel, niet samengevoegd.

## Vóór/ná-meting eval-testset

> `bun --env-file=.env.local scripts/eval-testset.ts --json`, **zonder `--ai`** (strikt
> read-only). Basis `896e450`; de ná-run draaide op dezelfde commit mét de wijziging in de
> werkdirectory, dus `meta.gitRev` staat in beide runs op `896e450`.

| case | status | vóór | ná |
|---|---|---:|---:|
| raadhuis (31 regels) | paars | 1 | 1 |
| | open | 11 | 11 |
| | blauw | 10 | 10 |
| | rood | 2 | 2 |
| | geel | 7 | 7 |
| | **groen** | **0** | **0** |
| tno (15 regels) | open | 11 | 11 |
| | blauw | 2 | 2 |
| | geel | 1 | **2** |
| | **groen** | **1** | **0** |
| kvk | — | *AI-leesroute nodig (router: geen_regels)* | idem |
| dordrecht | — | *geen tekstlaag; OCR-route (`--ai`)* | idem |

**Eén regel verschuift in de hele testset: `Ls002` in tno, van groen naar geel.** Dat is
exact besluit 1 — die regel had meer dan één kandidaat die aan alles voldeed en heette
daarom groen. Er is geen enkele andere verschuiving, in geen van de statussen; de meetlat
("elke verschuiving is te verklaren uit besluit 1, 2 of 3") is daarmee gehaald.

Dat het er maar één is, is geen anticlimax maar de honest meting: in raadhuis stond
sowieso al **nul** groen, en de winst van deze ingreep zit niet in het aantal groene
regels maar erin dat wat groen heet nu ook een gekozen product draagt (zie de
offertetabel hierboven).

⚠️ **kvk en dordrecht meten hier niets.** Zonder `--ai` bereikt kvk de matcher niet
(router: geen_regels → AI-leesroute) en heeft dordrecht geen tekstlaag (OCR-route). Ze
mét `--ai` draaien kost echte API-calls op de productiedatabase en is dus een
budgetbeslissing — niet stilzwijgend genomen.

## Verdere notities

- De scheefstand die dit rechtzet: vandaag vraagt de zékerdere uitkomst (groen) méér
  handwerk dan de minder zekere (geel auto-door). Na deze ingreep is dat andersom, zoals het
  hoort.
- Het aantal groene regels daalt. Dat is het doel en geen regressie — maar het is wel het
  eerste wat opvalt bij de demo, dus de vóór/ná-tabel hoort in het gesprek met Brink.
- Besluit 2 (één groene naast gele kandidaten blijft groen) is de enige plek waar deze spec
  ruimer is dan de strengst mogelijke lezing van "precies één kandidaat". De reden staat bij
  het besluit; wordt dat later te ruim bevonden, dan is het één regel in de motor.
