# Sprint 1.6 — de scorecard vertelt de waarheid over merkdata

*Zelfvoorzienende briefing. Je hoeft geen enkele eerdere sessie gelezen te hebben.*

## Het probleem, in één zin

De compleetheids-scorecard zegt "prijs 0%" bij een merk dat wél prijzen heeft aangeleverd, puur
omdat de prijslijst verlopen is.

## Hoe het nu werkt

In `lib/repo/brand-relations.ts`, functie `completenessSelection()`, staat dit fragment
(rond regel 169):

```sql
count(*) filter (where exists (
  select 1 from prices pr
  join price_lists pl on pl.id = pr.price_list_id
  where pr.product_id = "products"."id" and pl.valid_until >= current_date
))
```

Alle andere velden in diezelfde selectie meten simpelweg
`count(*) filter (where <kolom> is not null)` op de producttabel. **Alleen het prijsveld eist
een geldige lijst.** Dat is de asymmetrie.

## Waarom dat fout is

Dit scherm is de **outreach-werklijst**: 405 van de 437 merken hebben nog geen data, en dit is
waar je ziet wie je moet benaderen. Verloopt de prijslijst van een merk, dan zakt de balk naar
0% en dat leest als *"dit merk heeft ons nooit prijzen gegeven"*. Je stuurt dan de verkeerde
mail — het merk hééft geleverd; wat je nodig hebt is een **verlenging**, en dat is een ander
gesprek.

Compleetheid hoort te meten **wat het merk heeft aangeleverd**. Zichtbaarheid meet **wat de
matcher mag zien**. Nu beantwoordt één balk beide vragen, en daardoor geen van beide goed.

**Live waargenomen (21 jul).** Timo maakte bewust een prijslijst met een verkeerd jaartal
(1-8-2006 t/m 1-8-2007). Resultaat: `Gross list price excl. VAT — MUST — 0%`, terwijl artikelcode,
naam, categorie en EAN alle vier op 100% stonden en de prijzen gewoon in de `prices`-tabel
zaten. Niets in het scherm verklaarde het verschil.

## Wat je verandert

**Haal de voorwaarde `pl.valid_until >= current_date` uit de compleetheidsmeting.** De meting
wordt daarmee: heeft dit product een aangeleverde prijs, ja of nee.

Dat is de hele functionele wijziging. Hij zit in één SQL-fragment in één functie.

## Wat je expliciet NIET doet

- **`visible_products` blijft ongemoeid.** Die view is ijzeren regel 3 en drijft de catalogus,
  de matcher en alle zoekresultaten. Er verandert niets aan wat zichtbaar is.
- **Je leest het bedrag niet.** De meting blijft een `EXISTS` — ijzeren regel 2 (geld nooit in
  de ranking, bedragen nooit in een meting) blijft precies zoals hij is.

## Tweede helft: het verloop-signaal (besluit G8, Timo 21 jul)

Zodra de datumvoorwaarde uit de meting is, moet het scherm zélf vertellen dat de prijslijst
verlopen is — anders toont het 67% zonder dat iets verklaart waarom de catalogus leeg is. Timo
koos daarbij expliciet voor **overal waar het merk voorkomt**, niet alleen bij de scorecard.

**"Overal" betekent hier: één gedeelde component, op elk intern scherm waar het merk als rij of
als pagina voorkomt.** Niet vier keer dezelfde luide banner — hetzelfde signaal, in het gewicht
dat bij dat scherm past. Bouw het als één component en hergebruik hem; twee implementaties gaan
uit elkaar lopen (zie hoe `field-catalog.measure` vijf weken achterliep).

| Scherm | Nu | Wat erbij moet |
|---|---|---|
| Merkpagina `/data/brand-relations/[brandId]` | **niets** — geverifieerd, dit scherm draagt geen enkel prijslijst-signaal | De waarschuwing, bij `Completeness` |
| Merkenlijst `/data/brand-relations` | `Price list`-badge (Valid / verlopen) | Nakijken dat hij consistent is met de nieuwe component |
| `/data/price-lists` | telling "1 expired (coverage gap)" | Idem |
| `/admin/brands` | niets | De waarschuwing, of op z'n minst een verwijzing |

**De tekst moet zeggen wat je moet dóén.** Het verschil dat ertoe doet is: *het merk heeft wél
geleverd, maar de lijst is verlopen* → je hebt een **verlenging** nodig, geen nieuwe aanlevering.
Noem de einddatum. Toon **nooit een bedrag** (ijzeren regel 2).

**De catalogus is de uitzondering, en dat moet je melden in plaats van oplossen.** Daar
verdwijnt het merk volledig — verlopen prijslijst betekent geen rijen in `visible_products`, dus
er is geen merk-rij om een waarschuwing aan te hangen. Precies op de plek waar iemand het effect
merkt, kun je het niet uitleggen. **Bouw daar niets** (dat raakt ijzeren regel 3 en is een eigen
ontwerpvraag); noteer het als opvolgtaak.

## Waarom dit ijzeren regel 3 niet schendt

Regel 3 luidt: *verlopen prijslijst = product onzichtbaar in álle zoekresultaten*. De scorecard
is geen zoekresultaat — hij is een interne meting over aanlevering, hij staat achter de login op
een admin-scherm, en hij toont geen prijzen. Er lekt niets naar een offerte, een catalogus of de
matcher. **Twijfel je hierover, meld het dan vóór je bouwt in plaats van halverwege te
improviseren.**

## Vallen

**1. Er zijn twee codepaden en ze moeten identiek blijven.** `getBrandCompleteness` (één merk)
en `getAllBrandCompleteness` (de lijst) delen bewust `completenessSelection()` "zodat beide
codepaden per definitie identieke cijfers geven" — dat staat als commentaar boven de functie.
Wijzig het fragment op één plek; als je merkt dat je het twee keer aanpast, doe je het fout.

**2. Het commentaar liegt straks.** Boven de functie staat: *"dat meten we via EXISTS op prices ⨝
price_lists met valid_until >= current_date"* (rond regel 137), en in `lib/field-catalog.ts`
staat op regel 14 en 34 hetzelfde: *"EXISTS op prices mét geldige prijslijst"*. **Drie plekken.**
Een scorecard die niet meer doet wat het commentaar belooft, is precies hoe `field-catalog.measure`
vijf weken achterliep op het schema. Werk ze alle drie bij.

**3. `hasProducts` blijft de randgeval-schakelaar.** Een merk zonder producten toont "n/a" in
plaats van 0% rood. Raak dat niet aan — 405 merken hangen ervan af.

**4. `getAllBrandCompleteness` duurt nu 3–4,6 s warm** op een scherm dat sinds 1.3 hoofdingang
is. Je maakt de query niet zwaarder (je haalt een JOIN-voorwaarde weg), maar **meet het even** en
meld het als het wél trager wordt.

## Derde helft: de scorecard zelf (besluiten G9–G12, Timo 21 jul)

Timo wil per categorie een percentage, en onderaan een percentage per MUST / WANNA / NICE.
Tijdens de grill werd de opdracht scherper dan dat.

**G9 — categorie 1 t/m 10 gaan uitsluitend over wat we in het Excel-template hebben gevraagd.**
Timo's woorden: *"ik wil ook dat 1 tot en met 10 eigenlijk alleen maar gaat over de informatie
die we daadwerkelijk in het Excel-sheet hebben gevraagd."* Een scorecard die meet wat het merk
aanleverde, mag het merk niet aanrekenen dat het ónze voorraadstand niet invulde.

**G10 — de zes interne velden verhuizen naar een eigen categorie "11. Internal".** Niet
verbergen: Timo wil ze kunnen zien, alleen niet meegewogen. *"Al die andere dingen mogen bij
internal staan."*

**G11 — de totalen onderaan gaan over 1 t/m 10, niet over 11.**

**G12 — de weging is per veld, niet per categorie.** Elk veld telt even zwaar. Dit is niet
vrijblijvend: Commercial houdt na de verhuizing **één** veld over, terwijl Photometrics en
Electrical er elk elf hebben. Zou je categorieën even zwaar wegen, dan levert één prijs invullen
evenveel op als elf lichtmetingen.

### Gemeten uitgangspunt (21 jul, zelf nagerekend — verifieer opnieuw)

| | |
|---|---|
| Velden totaal | **72** |
| Waarvan in het Excel-template (`inExcel`) | **66** |
| Niet in het template | **6** — en dat zijn exact de zes `internalOnly`-velden |
| `excelColumns().length` | **66** — identiek |

Alle zes zitten in **2. Commercial**: Purchase price excl. VAT, Brand discount, Stock, Stock
reserved, Show on web, Show price on web.

**Twee gevolgen die het werk makkelijker maken:**
1. **Na de verhuizing zijn alle 66 velden meetbaar.** De twee grijze "not measurable"-velden
   waren allebei intern. Het hele randgeval "100% betekent 100% van de helft" verdwijnt uit
   1 t/m 10 — je hoeft er dus geen weergave voor te verzinnen. In "11. Internal" blijft het wél
   bestaan; daar zijn 2 van de 6 onmeetbaar.
2. **Commercial gaat van 7 naar 1 veld.** Alle andere categorieën blijven ongewijzigd (8, 8, 4,
   6, 11, 11, 8, 5, 4 velden — alle 100% in Excel en 100% meetbaar).

### Hoe je het bouwt

**Gebruik `excelColumns()` als bron, niet een eigen lijst.** Die functie bouwt het merk-Excel
(`lib/excel-template.ts:31`). Voedt hij ook de scorecard, dan zijn "wat we vragen" en "wat we
scoren" per constructie dezelfde verzameling en kunnen ze nooit uit elkaar lopen. Een tweede
lijst met veldnamen is precies hoe `field-catalog.measure` vijf weken achterliep op het schema.

**Het rekenwerk bestaat al.** `bucketScore()` (`lib/field-catalog.ts:270`) geeft per categorie
`must`, `wanna` en `nice` terug, elk met `{ filled, total, ratio }`, waarbij `ratio` de
gemiddelde dekking over de velden van dat niveau is. De component krijgt dat al binnen en
gebruikt het nu alleen om te bepalen of de balk donkergroen mag zijn
(`components/data/brand-scorecard.tsx:57`). **Er is geen extra databasevraag nodig** — dit is
aggregatie en weergave.

Wat er bij moet:
- **Percentage per categorie** — veldgewogen over de meetbare velden van die categorie, dezelfde
  rekenwijze als `bucketScore` per niveau al hanteert. Ga niet het gemiddelde van de drie
  niveau-ratio's nemen: dat is categoriegewogen door de achterdeur en botst met G12.
- **Drie totalen onderaan** — per niveau de gemiddelde dekking over álle velden van dat niveau
  in categorie 1 t/m 10.
- Reken de totalen uit **naast** `bucketScore`, niet erin: die functie hoort bij één bucket.

## Definition of Done

Meet met echte cijfers, niet met een redenering:

1. **Vóór/ná op één merk met een verlopen prijslijst.** Neem een merk waarvan de prijslijst
   verlopen is; de prijsbalk gaat van 0% naar het aandeel producten met een aangeleverde prijs.
   Alle andere velden blijven exact gelijk.
2. **De catalogus verandert niet.** Tel `visible_products` vóór en ná — zelfde getal. Dit is de
   belangrijkste check van dit item: compleetheid beweegt, zichtbaarheid niet.
3. **Een merk met een gelde prijslijst verandert niet.** Regressiecheck: bij een merk waar de
   lijst gewoon geldig is, blijft het cijfer identiek.
4. **De drie commentaarplekken kloppen weer** (zie val 2).
4c. **De zes interne velden staan onder "11. Internal"** en nergens anders; Commercial toont nog
   precies één veld. Categorie 1 t/m 10 telt samen 66 velden, gelijk aan `excelColumns().length`
   — laat die twee getallen naast elkaar zien.
4d. **Percentage per categorie en de drie totalen kloppen met de hand na.** Neem `ZZTEST QA-15`
   (3 producten, ongelijk gevuld: EAN 3/3, UGR 2/3, IK 1/3, prijs 2/3) en reken één categorie en
   één niveau met de hand uit. Komt het cijfer niet overeen, dan is de weging fout — niet de
   afronding.
4e. **De totalen veranderen niet als je een intern veld vult.** Zet bij één product `stock` en
   controleer dat MUST/WANNA/NICE gelijk blijven (G11).
4b. **De waarschuwing staat op de merkpagina en op `/admin/brands`**, komt uit één gedeelde
   component, noemt de einddatum, zegt "verlenging" en toont geen bedrag. Bij een merk met een
   geldige lijst is hij afwezig — laat beide gevallen op een screenshot zien.
5. Bestaande tests groen; een test die de oude datumvoorwaarde vastlegde moet je aanpassen —
   **beschrijf in je rapport welke test je hebt gewijzigd en waarom**, want een test aanpassen om
   groen te worden is precies hoe een echte regressie ongemerkt doorglipt.
6. White-box RSC-test met screenshots (light/dark × mobile/desktop). Bekijk de PNG's zelf.
7. `bunx tsc --noEmit` schoon en `bun vitest run` groen.

## Modelverdeling per fase

| Fase | Model | Wat |
|---|---|---|
| **1. Probleem** | het lichtere model | Reproduceer het zelf tegen de live database: zoek een merk met verlopen prijslijst en laat met een query zien dat de prijzen er wél zijn terwijl de meting 0 teruggeeft. Nog geen code |
| **2. Plan** | **het scherpste model, twee agents parallel** | Twee onafhankelijke plannen. De interessante vraag is niet *of* de voorwaarde weg moet, maar of de scorecard daarnaast iets moet tónen over verlopen prijzen — of dat de bestaande badge dat al afdekt. Laat ze botsen |
| **3. Bouwen** | het lichtere model, **twee agents** | Agent 1: de meting — het SQL-fragment (deel A), de drie commentaarplekken, de `excelColumns()`-afbakening en de aggregatie voor categorie- en niveaupercentages (deel C, rekenkant). Agent 2: de weergave — `brand-scorecard.tsx`, de nieuwe categorie "11. Internal", de waarschuwingscomponent (deel B) en de screenshots. Ze delen de vorm van het aggregatie-resultaat: **leg die vóór de start vast**, anders bouwt agent 2 tegen een type dat nog verandert |

**Volgorde binnen de bouwfase:** eerst C (de afbakening verandert welke velden meetellen), dan A
(de prijsmeting verandert één cijfer), dan B (de waarschuwing verklaart het gevolg). Andersom
meet je deel A tegen een noemer die daarna alsnog verschuift.

## Harde grenzen

- **Stop vóór de push.** Committen mag; pushen doet alleen de sprintmaster (besluit W4 — een
  `git push` stuurt élke commit op lokale `main` mee, ook die van een parallelle sessie).
- **`git add` met expliciete bestandsnamen**, nooit `-A`: er draaien parallelle sessies in
  dezelfde werkdirectory (op dit moment onder meer sprint 1.5, die aan `db/schema.ts` werkt).
- **Raak `db/schema.ts` niet aan.** Dit item heeft geen migratie nodig. Doet het dat in jouw
  ogen wél, dan heb je een ander probleem gevonden — meld het.
- Vind je een bug in bestaande code: **meld hem met bewijs, repareer hem niet.**

## Bekend, dus géén nieuwe vondst

Deze staan al als opvolgtaak in `docs/lumenlogic-sprintplan-augustus.md`:
`appliedFields` telt nieuwe producten niet mee · er is geen validatie dat `valid_from` niet in de
toekomst ligt · er is geen CHECK-constraint op `valid_until >= valid_from`.

Dat laatste kreeg op 21 juli een tweede live bevestiging: een gebruiker maakte in één poging een
prijslijst aan die al negentien jaar verlopen was, zonder één waarschuwing. **Dat is een apart
item, geen onderdeel van 1.6** — maar noteer het als je het tegenkomt.
