# Een eigen veld toevoegen (bijvoorbeeld een milieuveld)

*Voor Stefan. Sprint 1.8. Alles hieronder gaat over **productvelden**: dingen die we per
product aan een merk vragen. Merkvelden (fabriekslocatie, afstand tot Brink) zijn iets
anders — zie "Waar dit niet over gaat".*

---

## In het kort

Ga naar **Data → Fields** (`/data/fields`). Bovenaan staat alles wat we al vragen
(vandaag 66 kolommen), daaronder de velden die je zelf hebt toegevoegd, en daaronder het
formulier. Een veld dat je hier toevoegt:

- wordt een **extra kolom in het merk-Excel**, in de categorie die je kiest;
- wordt een **regel in de scorecard** van elk merk, met het gewicht van het niveau dat je
  kiest;
- **wordt nooit door de matcher gelezen.** Dat is geen afspraak maar een structurele
  grens, en het is de belangrijkste zin van dit document. Zie "Wanneer een eigen veld niet
  volstaat".

---

## Stap voor stap, met een echt voorbeeld

We voegen *Gerecycled materiaal (%)* toe.

1. **Kijk eerst in het overzicht bovenaan** ("Fields we already ask for"). Klap het open en
   zoek in categorie 10 (Sustainability / environment). Staat er al iets wat hetzelfde
   betekent? Gebruik dan dát veld. Dit is geen nettigheid: twee kolommen met dezelfde
   kolomkop maken **élk ingevuld merkbestand onleesbaar** — niet alleen het nieuwe, maar
   alle bestanden van alle merken, tot iemand het veld hernoemt. Het scherm vangt de
   botsing af bij het opslaan, maar alleen het overzicht laat je zien wat er al is.
2. Vul in het formulier alle vier de tekstvelden in. Ze zijn **allemaal verplicht**:
   - **Label (NL)** — `Gerecycled materiaal (%)`. Wat jij en de scorecard zien.
   - **Label (EN)** — `Recycled content (%)`. De kolomkop die het merk ziet (rij 2 van het
     Excel). Het merk-Excel is volledig Engelstalig.
   - **Instruction (NL)** — `Aandeel gerecycled materiaal in procenten, bv. 35.`
   - **Instruction (EN)** — `Share of recycled material in percent, e.g. 35.` Dit is rij 3
     van het Excel: letterlijk wat het merk leest voordat het iets invult. Een kolom
     zónder instructie is een kolom die niemand invult — dáárom kun je dit veld niet
     leeglaten.
3. Kies een **niveau**. Default is `wanna`. Wat de drie betekenen staat hieronder.
4. Kies een **categorie**. Dat zijn de tien categorieën van het merk-Excel en van de
   scorecard; "Internal" (categorie 11) staat er bewust niet bij — dat is juist wat we
   *niet* aan merken vragen.
5. **Add field.** Vanaf dat moment bevat elk nieuw gedownload merk-Excel de kolom, en
   staat het veld in de scorecard van elk merk (op 0%, want niemand heeft het geleverd).
   De teller bovenaan gaat van `66 + 0` naar `66 + 1`.

Alles is tekst. Er is geen keuze tussen "getal" en "ja/nee": een merk dat `ongeveer 35%`
invult, levert dan geen onverwerkbare cel op maar gewoon die tekst.

---

## Wat must / wanna / nice betekenen

Voor de **scorecard** — en dus voor je outreach, want de scorecard is wat je aan een merk
laat zien:

| Niveau | Gewicht in de scorecard | Effect op een ingevuld merkbestand |
|---|---|---|
| `must` | zwaarst | **geen afwijzing** — wel een rijwaarschuwing "must-veld leeg" als de kolom er is en de cel leeg |
| `wanna` | midden | geen |
| `nice` | licht | geen |

⚠️ **Hier wijkt een eigen veld af van een catalogusveld, en dat is bewust.** Bij de 66
catalogusvelden betekent een ontbrekende `must`-kolom dat het **hele bestand wordt
afgewezen**. Dat kan daar ook niet anders: zonder `Supplier article code` is er geen
sleutel om een rij aan een product te koppelen — zo'n veld is dragend voor de verwerking
zelf.

Een veld dat jij toevoegt kan dat per definitie nooit zijn. En als een eigen `must` wél
tot afwijzing zou leiden, dan zou één klik van jou elk merkbestand dat op dit moment
onderweg is onbruikbaar maken — bestanden die verstuurd zijn vóórdat het veld bestond, en
die dus geen enkel merk had kúnnen invullen. Daarom: **een eigen `must` is een gewicht,
nooit een afkeuring.** Je mag `must` dus rustig gebruiken om te zeggen "dit vind ik echt
belangrijk".

---

## Wanneer een eigen veld NIET volstaat

**Zodra de matcher het veld moet lezen.** Dan is dit scherm de verkeerde weg en heb je een
programmeur nodig.

Waarom dat een harde grens is, en niet een kwestie van "we hebben het nog niet
aangesloten": de match-engine leest productgegevens uitsluitend via de database-view
`visible_products`, en die view heeft een **expliciete kolomlijst** — geen `select *`, geen
loop over "alle kolommen". Waarden van eigen velden staan in een aparte kolom
(`products.custom_values`) die in die lijst niet voorkomt en er ook niet in mag komen. Er
is dus geen pad waarlangs een eigen veld per ongeluk tóch de ranking beïnvloedt, en ook
geen knop die dat aanzet. Een matcher-veld vraagt een databasemigratie plus werk in de
match-regels; dat is een sprintitem, geen beheertaak.

Praktisch: gebruik een eigen veld om **te vragen, te meten en te tonen** (scorecard,
onderhandeling, onderzoek). Wil je erop **filteren of ranken** in de zoekresultaten, meld
het dan als wens — dan wordt het een echt catalogusveld.

---

## Waar dit niet over gaat

**Merkvelden.** Sprint 1.7 voegde *fabriekslocatie* en *afstand tot Brink* toe aan een
merk. Dat zijn eigenschappen van het mérk, niet van een product, en ze staan daarom niet in
de veldcatalogus (`lib/field-catalog.ts` beschrijft uitsluitend PRODUCTkolommen — dat wil
zeggen: wat we in het merk-Excel vragen). Je kunt hier dus **geen merkveld toevoegen**; dat
blijft programmeerwerk. Dit document gaat alleen over productvelden.

**`brand_field_visibility`.** Er bestaat een tabel met die naam en die klinkt alsof hij
hierover gaat. Dat is niet zo: hij regelt **per merk de zichtbaarheid van bestáánde
velden**, niet welke velden er zijn. Verwar de twee niet — "veld zichtbaar voor merk X" en
"veld bestaat" zijn verschillende vragen.

---

## Waarom een veld dat nergens gevraagd wordt altijd leeg blijft

Er is vandaag precies één kanaal waarlangs productgegevens binnenkomen: **het merk-Excel**,
ingevuld door het merk, terug via het retour-pad. Er is (nog) geen merkportaal waarin een
merk losse velden invult.

Een veld dat niet in dat Excel staat, kan dus door niemand worden ingevuld — het zou
gegarandeerd voor altijd op 0% blijven staan en je scorecard omlaag trekken zonder dat
iemand er iets aan kan doen. Daarom staat élk eigen veld automatisch in het merk-Excel en
is er bewust géén vinkje "niet in het Excel". Zodra er een tweede invoerkanaal is, kan dat
vinkje er alsnog bij.

Gevolg voor je verwachtingen: **na het toevoegen is het veld overal 0%**, en dat blijft zo
tot merken een *nieuw* Excel downloaden, invullen en terugsturen. Bestanden die al bij een
merk liggen bevatten de kolom niet. Dat is geen fout en het levert ook geen afwijzing op —
een ontbrekende optionele kolom wordt gemeld als "ontbrekende optionele kolom".

---

## Hernoemen en archiveren

**Hernoemen** mag, ook het Engelse label. De sleutel van het veld is een uuid en verandert
niet, dus de al opgeslagen waarden blijven aan het veld hangen. Twee dingen om te weten:

- Een merkbestand dat is **gedownload vóór de hernoeming** heeft nog de oude kolomkop. Die
  kop matcht dan op geen enkel bekend veld en wordt gemeld als **onbekende kolom**:
  zichtbaar in de terugkoppeling op het bestand, niet stil weggelaten. De waarden in die
  kolom worden niet opgeslagen — vraag het merk om een verse download. Hernoem dus liever
  niet terwijl er bestanden onderweg zijn.
- Hernoemen naar een label dat al bestaat wordt geweigerd, om dezelfde reden als bij
  aanmaken.

**Archiveren** haalt het veld uit het Excel en uit de scorecard. De bevestiging telt eerst
opnieuw hoeveel producten een waarde hebben en noemt dat getal — niet het getal uit de
tabel, dat kan van een paar minuten geleden zijn. En dan het belangrijkste: **de waarden
worden niet gewist.** Ze blijven staan, ze tellen alleen nergens meer mee. Een gearchiveerd
veld blijft onderaan het scherm zichtbaar, met het aantal producten dat nog een waarde
draagt. Verwijderen bestaat niet; er is dus geen knop die stil data vernietigt.

---

## Elke wijziging staat in de events-tabel

Aanmaken, wijzigen en archiveren loggen elk hun eigen event (`custom_field_created`,
`custom_field_updated`, `custom_field_archived`) met wie het deed en wat er veranderde. Als
iemand zich later afvraagt sinds wanneer we iets vragen, of waarom een kolom uit het Excel
verdween, staat dat antwoord in de log.
