# Sprint 1.6 — compleetheid meet aanlevering, niet geldigheid

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
| **3. Bouwen** | het lichtere model, één agent | De wijziging is één SQL-fragment plus commentaar plus tests. Twee agents zouden elkaar hier in de weg zitten |

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
