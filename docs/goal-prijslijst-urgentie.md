# Goal: urgentiesortering voor prijslijsten (Brand Management)

Besloten in de demosessie met Brink Licht op 12 augustus 2026; de formule op 19 augustus 2026
met Timo vastgesteld. Er is geen apart `probleem-`document: de aanleiding staat hieronder en
komt rechtstreeks uit die sessie.

## Aanleiding

Het prijslijst-overzicht sorteert op vervaldatum (`order by valid_until asc` in
`listPriceListStatus`). Dat geeft de verkeerde volgorde. De klant lichtte het zelf toe: een
prijslijst van Vesoi die een jaar verlopen is staat bovenaan, maar niemand vraagt ooit naar dat
merk. Een merk dat over twee weken verloopt en in 28 projecten zit is veel urgenter en zakt weg.

Tijd alleen is dus fout. Vraag alleen ook — een druk merk met een lijst die nog een half jaar
geldig is hoeft vandaag niets.

## De formule

```
urgentie = vraagscore × tijdfactor
```

Beide factoren zijn dimensieloos. De uitkomst is een werkvolgorde, geen cijfer dat iets
betekent buiten deze lijst om.

### Tijdfactor — 0,1 … 1,0

Stijgt richting de vervaldatum en vlakt daarna af:

| stand | tijdfactor |
|---|---|
| meer dan 90 dagen geldig | 0,10 (vlak) |
| 90 → 0 dagen tot verval | lineair 0,10 → 0,70 |
| 0 → 90 dagen verlopen | lineair 0,70 → 1,00 |
| langer dan 90 dagen verlopen | 1,00 (vlak) |
| géén prijslijst, of een lijst zonder prijsregels | 1,00 |

**Waarom aftoppen.** Een jaar verlopen is niet zesentwintig keer erger dan twee weken verlopen.
Voorbij een bepaald punt is de lijst gewoon kapot; wat er dan nog toe doet is of iemand naar het
merk vraagt. Zonder dat plafond zou de vervaldatum via een achterdeur alsnog de enige sorteersleutel
zijn — precies het probleem dat we oplossen.

**Waarom 90 dagen.** Dezelfde orde van grootte als de bestaande waarschuwingshorizon van het
scherm (30/14/7 dagen) maar één slag ruimer: een merk aanschrijven, een lijst ontvangen en
inladen duurt weken, dus de lijst moet gaan oplopen ruim vóórdat de datum verstrijkt.

**Waarom de knik op 0,70 bij de vervaldatum.** De vervaldatum is het scharnierpunt, niet het
eindpunt: op de dag zelf valt het merk uit de matcher (ijzeren regel 3) en dat is al bijna het
maximum. Daarna is er nog wel groei — een gat dat blijft liggen wordt erger — maar geen sprong.

**Waarom een merk zonder lijst het maximum krijgt.** Dat is het grootste dekkingsgat dat er is:
niet één product van dat merk is zichtbaar. Een lijst met een prima datum maar nul prijsregels
is voor de matcher exact hetzelfde (dat oordeel bestond al als `isCoverageGap`) en krijgt daarom
dezelfde 1,00.

**Waarom een bodem van 0,10 en geen 0.** Bij 0 zou de hele staart van rustige merken op urgentie
0 uitkomen en willekeurig door elkaar staan. Met een bodem blijft de vraagscore ook onderin de
lijst de volgorde bepalen.

### Vraagscore — 1 + Σ gewicht × ln(1 + signaal)

Alle signalen logaritmisch: één enorm project mag de lijst niet overheersen (expliciete
instructie), en het verschil tussen 1 en 5 projecten hoort groter te zijn dan tussen 40 en 44.

| signaal | gewicht | bron |
|---|---|---|
| projecten met dit merk, laatste 12 maanden | 3,0 | `spec_lines` ⨝ `project_dossiers`, distinct dossier |
| productregels met dit merk, laatste 12 maanden | 1,0 | `spec_lines` |
| zoekopdrachten op dit merk | 0,75 | `events`, `action='search'`, `payload->>'brand'` |
| gevraagd maar niet in de catalogus | 1,5 | `spec_lines.brand_text` zonder producten bij het merk |
| inlaadwachtrij op vraag | 1,0 | `brand_load_queue.frequency` |
| productvraag zonder resultaat | 0,5 | `events`, `action='search'`, `resultCount = 0` |
| overwogen (`product_considered`) | 0,5 | `events` ⨝ `products` |
| gekozen (`matched_product_id`) | 0,5 | `spec_lines` |

De basis is 1, niet 0: zonder basis zou een merk zonder enig vraagsignaal urgentie 0 krijgen en
zou de tijdfactor er niet meer toe doen — ook een stil merk met een verlopen lijst hoort boven
een stil merk met een geldige lijst te staan.

**Waarom projecten drie keer zo zwaar wegen als productregels.** Een project is een klant die
iets wil; productregels zijn een gevolg van hoe groot dat project toevallig is. Twee projecten
van elk vijf regels zijn urgenter dan één project van tien.

**De laatste twaalf maanden, niet de hele historie** (expliciete instructie): een merk dat in
2023 populair was zegt niets over het werk van vandaag. De vensterloze signalen zijn de
wachtrij (die is per definitie actueel) en de gevraagd-niet-in-catalogus-telling (te dun om
verder te versmallen; genoteerd als open eind).

### Wat er NIET in zit

**Geen marge, geen omzet, geen inkoopvoordeel, geen enkel geldsignaal.** IJzeren regel 2 houdt
geld en ranking strikt gescheiden. Dit is een interne werklijst en geen productranking, dus de
regel raakt hem niet rechtstreeks — maar de grens laten we niet vervagen. Dit is **niet
vergeten**: het is een besluit. Wie er later een omzetgewicht in wil hangen, verandert daarmee
wat "urgent" in dit product betekent en moet dat expliciet met Timo bespreken.

## Weergave

- Eén rij per **merk**, niet per prijslijst. Anders kan de regel "een merk zonder prijslijst
  krijgt de maximale tijdfactor" niet bestaan: dat merk heeft geen rij om op te staan.
- Default-sortering op urgentie. Regel 1 is wat als eerste actie nodig heeft.
- De losse kolommen blijven zichtbaar en apart sorteerbaar: dagen tot/na verlopen, projecten,
  productregels. Zonder dat is de sortering een orakel.
- Per rij een korte reden: "expires in 12 days · 28 projects". Een kaal urgentiegetal
  vertrouwt niemand, en terecht.
- De sorteerstand staat in de URL (`?sort=…&dir=…`), zoals overal in dit scherm: deelbaar en
  terugknop-bestendig, en geen client-state.

## Meegenomen: completeness check inklapbaar

Op de merkdetailpagina stonden 66 velden met vulpercentages onder elkaar. Per categorie nu
inklapbaar (`<details>`/`<summary>`, geen client-JS — de scorecard is een server-component):

- teller in de kop: "1 of 6 filled";
- categorieën zonder enige vulling blijven dicht en tonen niets;
- is er wél vulling, dan staan de gevulde veldnamen al in de ingeklapte kop;
- de totalen per niveau (required / requested / optional) blijven onderaan staan.

## Meetlat

1. Een merk zonder prijslijst staat boven elk merk mét lijst bij gelijke vraag.
2. Een merk met een lijst die over 12 dagen verloopt en 28 projecten heeft, staat boven een merk
   met een lijst die een jaar verlopen is en nul projecten (het Vesoi-geval uit de sessie).
3. Klikken op "Days" sorteert weer puur op tijd — de oude volgorde is één klik weg.
4. Elke rij draagt zijn eigen reden.

## Wat er niet gehaald is

- **Het scherm staat nog op `/data/price-lists`.** De taak "Ruim hoofdnavigatie en Data-menu op"
  (Brand relations → Brand Management, prijslijsten mee) was op het moment van bouwen nergens in
  de repo aanwezig: geen commit, geen branch, geen enkele treffer op "Brand Management". De
  formule zit daarom in een pure module (`lib/price-list-urgency.ts`) plus één repo-query, zodat
  de verhuizing later één page-bestand kost en de logica en de tests blijven staan.
- **"Gevraagd maar niet in de catalogus" heeft geen tijdvenster.** De telling is vandaag te dun
  om over twaalf maanden te versmallen zonder hem op nul te zetten. Zodra er meer projectdata is,
  hoort dit signaal hetzelfde venster te krijgen als de andere twee spec-signalen.
- **De gewichten zijn beredeneerd, niet gemeten.** Er is geen dataset van "welke lijst had
  Brink als eerste moeten oppakken" om ze tegen af te zetten. De formule is bewust vlak en
  uitlegbaar gehouden zodat een gewicht bijstellen één regel is.
