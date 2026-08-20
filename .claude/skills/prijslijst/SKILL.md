---
name: prijslijst
description: Verwerkt een leveranciers-prijslijst (Excel/CSV/PDF van een verlichtingsmerk, hoe rommelig ook) naar het ingevulde brand-Excel (66 velden) voor de Lumen Logic-brandportal, via drie fasen (leverancierskolommen kopiëren → productnamen parsen → AI voor de rest) met een korte steekproef in de chat en een dekkings-scorekaart als rapport. Gebruik deze skill zodra iemand een prijslijst, pricelist, artikellijst of productlijst van een merk/leverancier wil verwerken, omzetten, importeren of "naar ons Excel" wil krijgen — ook als ze alleen zeggen "hier is de lijst van <merk>, maak er ons formaat van" of een bestand droppen met producten en prijzen erin.
---

# /prijslijst — leveranciers-prijslijst → Lumen Logic brand-Excel

Je vertaalt het bestand dat een verlichtingsmerk óns stuurde naar het officiële brand-Excel
dat via de brandportal geüpload wordt. Je schrijft **nooit** zelf naar een database — het
Excel is het eindproduct; de portal-upload met diff is de poort daarna.

De kernhouding, uit twee maanden verrijkingswerk: **ontbrekend ≠ fout, maar een verkeerde
waarde is duur.** Liever een leeg veld dan een gok. Elke waarde in het eind-Excel moet
herleidbaar zijn tot het bronbestand; internet gebruik je niet.

## Stap 0 — invoer beoordelen

Vraag eerst het merk (voor de bestandsnaam) als dat niet uit het bestand blijkt.

**Gereedschap dat je nodig hebt:** `bun` voor de scripts in `scripts/`, en Python met `openpyxl`
(Excel schrijven), `pdfplumber` (PDF lezen én de stempeldetectie hieronder), `pyxlsb` bij een
xlsb-bron, en `pypdfium2` zodra een PDF gestempeld blijkt — dat is de enige van de drie
PDF-bibliotheken die clipping respecteert en dus laat zien wat een mens ziet. Installeer wat
ontbreekt vóór je begint en meld het in het rapport.

**Vertrouw de extensie niet.** Draai `file` op de bron: een `.xls` die xlsb blijkt weigert zowel
openpyxl als xlrd (iGuzzini, 51.758 rijen) — installeer dan `pyxlsb`. Een échte oude `.xls`
(`Composite Document File V2, Excel 5.1`) lees je juist met `xlrd`; openpyxl kan dat formaat
niet. Meld wat je aantrof.

### Drie toetsen op het bestand zelf, vóór je één waarde leest

**1 · Hoe oud is deze lijst?** In de nachtrun van 12 aug 2026 droeg meer dan de helft van de
vijftig merken een datering, en bij ruim twintig was die verouderd: Krea `LISTINO PREZZI
09.2011`, Prandina `maillijst_2012` (veertien jaar; bevestigd door de inhoud — 169 FLUO-tokens
tegen 2 rijen LED), Oligo `Status: 28.11.2014`, Philips `Prijslijst_Lampen_2014_III`, Osram
`PRIJSLIJST_V_12-12-2017`, Decor Walther een prijskolom `Price 2022 inc. 10 % price surcharge`.
Prijs is een must-veld, en een prijs uit 2012 is precies wat deze skill duur noemt: geen
ontbrekende waarde maar een fóute, die elke bestaande controle geruisloos passeert. Kijk op vier
vaste plekken — **bestandsnaam, de eerste kopregels, de kolomkop van de prijs, en de
documenteigenschappen** (`openpyxl` geeft `docProps`) — en meld de geldigheidsdatum als eerste
regel van het rapport. Ouder dan ongeveer een jaar: waarschuw expliciet en adviseer de actuele
lijst op te vragen. Een prijskolomkop kan bovendien al een toeslag dragen; dan is het geen
zuivere adviesprijs.

**2 · Is dit bestand van dít merk, en van maar één merk?** Zes merken leverden hier een
verrassing: Zora stuurde `…NEKO_Lighting…Price_List.xlsx` met `dc:title = NEKO Quotation` en
**nul** voorkomens van "Zora" in het hele werkboek; Zumtobel leverde uitsluitend Thorn Eco;
Cini&Nils zat als 3.980 rijen in een Lombardo-lijst van 32.996 (28.847 rijen van het andere
merk); Osram had een tabblad `Nettopr. Philips Lampen`; Philips bleek een grossierslijst met een
kolom `merk` over vijf fabrikanten; Halla verkoopt 57 rijen Nordic Aluminium door. Tel de
merknaam in de gedeelde strings, lees `docProps/core.xml`, en cluster de artikelcode- en
EAN-prefixen — een afwijkend cluster is vermoedelijk een ander merk. Wat niet van dit merk is,
gaat er niet in; tel het en meld het. Zit er een andere fabrikant of een grossier tussen, dan is
de prijs ook niet aantoonbaar de adviesprijs van het merk — zeg dat erbij.

**3 · Wat zie je niet?** Inventariseer verborgen kolommen en verborgen tabbladen expliciet.
`openpyxl` geeft ze gewoon terug, dus ze verdwijnen alleen als jíj op zicht werkt. Bij Penta
staat kolom D (`STRUTTURA/STRUCTURE`) op `hidden=True` en is hij voor 1.512 rijen de énige
materiaalbron. Verborgen is niet leeg.

- **Excel/CSV**: altijd verwerken, ook rommelig — meerdere tabbladen, samengevoegde cellen,
  koppen halverwege, meertalige koppen. Inventariseer eerst álle tabbladen; prijslijsten
  mengen vaak Lighting met Furniture/Accessories/Spare parts. Alleen verlichting gaat mee;
  tel de rest voor het rapport.
  **Maar de scheiding loopt lang niet altijd langs een tabbladgrens.** Moooi levert één tabblad
  waarvan 1.228 van de 1.524 rijen meubel is, herkenbaar aan een productgroepkolom; Decor
  Walther heeft 3.383 niet-verlichte rijen (handdoekhouders, prullenbakken) tegen 835
  armaturen op hetzelfde blad; Kartell levert de complete catalogus zónder categoriekolom,
  zonder tabbladindeling en zonder één typewoord — daar liep de grens door de artikelcode
  (modelnummers met een 9 = 1.537 rijen, en 7.702 = 6.165 meubel + 77 bagno + 1.460
  verlichting, sluitend). Meet dus eerst de distinct-waarden van een productgroepkolom, en
  filter op exacte typefrases in plaats van op losse woorden: Decor Walther heeft 39 rijen met
  het woord "light" die geen verlichting zijn (`Rattan light`, `beech wood oiled light`).
  Tel de afgewezen rijen per grond.
  **Meerdere tabbladen zijn vaker een tweede lezing dan meer producten.** Nuudo levert drie
  taaltabbladen met dezelfde 1.940 artikelen (0 verschillen in artikelnummer én prijs) — ze
  blind achter elkaar plakken geeft 5.820 spookproducten. Krea heeft een printtabblad met
  dezelfde data. Meet daarom eerst de code-overlap tussen tabbladen: superset, join, taalvariant
  of werkelijk disjunct. Bij Brink sluiten `Price list` en `Technical specifications` 1-op-1 aan
  (854 codes, 0 aan één kant) en horen ze samengevoegd; bij Catellani is `Foglio 1` een superset
  van `Foglio1` — let op dat die twee tabbladnamen één spatie verschillen.
- **PDF met tekstlaag**: verwerken, maar eerst de twee toetsen hieronder, en waarschuw vooraf
  dat tabellen uit PDF's stiller rijen verliezen dan Excel — adviseer de Excel op te vragen en
  meld het aantal gelezen rijen expliciet in het rapport.
- **PDF als scan/afbeelding**: **weiger vriendelijk.** OCR op scans heeft ons meetbaar rijen
  gekost (import 0/18 op een A3). Vraag de gebruiker het merk om de Excel-versie te vragen.
  Dezelfde regel geldt voor een *kolom* die een afbeelding is: Luceplan zet kelvin/CRI/watt voor
  ±700 rijen als bitmap in een verder leesbare PDF — tel die als niet-leesbaar en vraag de Excel.

### Is deze PDF gestempeld? (doen vóór je één waarde overneemt)

Een herdruk-PDF heeft nieuwe prijzen over de oude heen gestempeld, maar **de oude staan nog
gewoon in de tekstlaag**. Bij Luceplan leverde een gewone extractie 1.264 "rijen" op waarvan ~40 %
spoken met plausibele maar verouderde prijzen — de tekstlaag gaf 1.101,00 waar zichtbaar 1.312,00
stond, en er waren 410 dubbele prijsposities.

Dit is de omkering van de waarschuwing hierboven, en daarom vangt de rijtelling het niet: je krijgt
te véél rijen, niet te weinig, en alle getallen zijn geldig.

**Het mechanisme**, nagemeten op dat bestand: de oude laag is niet weggehaald maar **weggesneden
met een clip path** — 214 clip-operatoren in dat ene document. Schermen en printers respecteren
die clipping, `pdfminer` en `pdfplumber` niet. Wat je uit de tekstlaag haalt bevat dus tekst die
niemand ooit ziet, en geen enkele tekstgebaseerde controle kan dat onderscheiden: alleen de
pixels zijn de waarheid. Draai daarom altijd eerst:

```bash
python3 scripts/pdf-gestempeld.py <bestand.pdf>
```

Die telt tekstfragmenten die elkaar ruimtelijk overlappen maar verschillende tekst dragen — het
directe bewijs van een stempel. Gemeten over de zes PDF's van de nachtrun: Luceplan 14.499 paren,
de andere vijf tussen 0 en 4. **Geef geen paginagrens mee**: bij Luceplan begonnen de stempels pas
op p15, dus de eerste pagina's zeggen niets.

Zegt het script GESTEMPELD, dan is de tekstlaag onbruikbaar als bron en werk je **per
tekstobject** met deze pixeltoets, die zich op Luceplan bewezen heeft:

1. render de omgeving van het object met een engine die clipping wél respecteert
   (`pypdfium2`) — dat is wat een mens ziet;
2. haal het object uit de pagina en render opnieuw;
3. **verandert er geen pixel, dan is het object een spook** en bestaat het alleen in de
   tekstlaag.

Op Luceplan was 63,8 % van de 20.135 tekstobjecten spook, en van de 2.948 prijs-vormige objecten
zelfs 2.136. Een naïeve extractie had daar ±2.480 "rijen" opgeleverd in plaats van 842.

**Zoek geen kortere weg via opmaakkenmerken.** Fontgrootte werkt aantoonbaar niet: op p15 zijn de
zichtbare prijzen 8,0 pt en de spoken 7,5 pt, op p60 precies andersom. Ook positie, fontnaam en
kleur zijn geen betrouwbaar onderscheid — alleen de pixels zijn het.

Reken er ook op dat er meer gestempeld is dan prijzen: op p60 van dat document is de **hele
pagina** vervangen (tekstlaag geeft 141 regels van een andere serie dan wat er staat), en ook
specregels dragen stempels. Objecten die maar deels zichtbaar zijn (dekking onder 50 %) gebruik
je niet.

Rijen die je niet kunt verifiëren gaan naar "controleren", niet in de datakolom. Meld het aantal
geverifieerde en weggelaten rijen, en het aandeel spookobjecten.

### Catalogus-PDF's: er zijn geen kolommen

Designmerken leveren geen tabel maar een ontwerpcatalogus, en dat is eerder regel dan uitzondering
(Hollands Licht, Lodes, Jacco Maris, Luceplan). Stap 1 hieronder ("meet eerst de celvormen per
kolom") is daar niet uitvoerbaar. Gebruik dan dit contextmodel:

- een **sectiekop** geldt tot de volgende kop;
- een **specblok** geldt voor de rijen vanaf de blok-top tot het volgende blok — ook over een
  paginagrens heen;
- een **specregel direct onder een artikelregel** geldt alleen voor díe rij;
- maat-annotaties uit technische tekeningen (`Ø 85cm`, `3,5cm`) lopen dwars door de speclijst en
  horen bij de tékening, niet bij het product.

Draagt een pagina twee halve pagina's naast elkaar (Lodes), verwerk die dan elk apart. Gebruik
`extract_tables()` **niet** — bij Astro gaf die 713 van de 1.427 rijen, zonder melding.

**De verliescontrole moet ONAFHANKELIJK zijn van je extractie.** Tel je artikelnummer-patronen
met dezelfde regex waarmee je de rijen leest, dan is de telling circulair: een rij waarvan de code
niet aan je patroon voldoet, ontbreekt in béíde tellingen en het verschil blijft nul. Bij Jacco
Maris moest het codepatroon twee keer verruimd worden (7-segment-codes, en segmenten met `-` of
`/` zoals `DRIVER.1-10V/0-10V`); dat kwam alleen aan het licht door een tweede telling op een
ánder kenmerk — regels die in de linkermarge beginnen én twee bedragen dragen. Zonder die tweede
telling waren 18 rijen stil weggevallen.

Kies je tweede maat dus bewust anders: tel prijsregels, of regels op een x-positie, of blokken —
iets wat niet van je codepatroon afhangt. Verschillen de twee tellingen, dan heb je een echte
vondst; zijn ze gelijk, dan heb je pas bewijs.

**Deze regel is niet PDF-eigen — hij geldt bij élke rijselectie, ook in Excel**, en niet alleen
tegen rijverlies maar tegen elke afbakening die je op één kenmerk baseert (rijtype, categorie,
merkgrens). Zeven merken van de nachtrun van 12 aug 2026 pasten hem toe en vonden er elke keer
iets echts mee: Brilumen telde op de type-kolom (15.905) én op code-afstamming (15.901), en dat
verschil van 6 waren 5 verkeerd gelabelde ouderrijen plus een brontypfout; Oligo zette codegroep
tegen een Duits zelfstandig naamwoord plus HS-code en vond 48 tegensprekende rijen; Prandina
toetste de typeletter in de naam tegen positie 4 van de artikelcode (822 van 824 gelijk).
De vruchtbaarste tweede maat in Excel is een **segment van het artikelnummer**, want dat hangt
per definitie niet van je naam- of kolomlezing af. Een print- of taaltabblad met dezelfde data
is een gratis derde maat.

Lees vroeg `references/woordenschat.md` — daar staan de leesregels, de PDF-artefacten en de
valkuilen die in alles hieronder terugkomen. Voor `category` is `references/categorieen.md` de
enige toegestane bron van paden — dat is de échte productietaxonomie (152 categorieën,
scheidingsteken ` >> `), niet het voorbeeld met één `>` dat in de instructierij van het template
staat. Dat voorbeeld is aantoonbaar fout; de portal valideert `category` niet, dus een verkeerd
pad wordt niet geweigerd maar landt stil in de database.

## Stap 1 — fase 1: leverancierskolommen 1-op-1

Herken welke kolommen van de leverancier direct op onze velden passen (IP, kelvin, watt,
lumen, CRI, dimprotocol, herkomstland, afmetingen, EAN, prijs, …). Werkwijze per kolom:

1. **Meet eerst de celvormen** (distinct-waarden met aantallen). Pas als je de vormen kent,
   besluit je de vertaling. Northern's IP-kolom had er precies twee (`IP20`/`IP44`);
   Serien's CRI-kolom schreef ondergrenzen (`>97`). Nooit vertalen op basis van één cel.
2. **Pas de LED-restrictie toe** op watt/kelvin/lumen/dimbaar: alleen overnemen waar de
   lichtbron-kolom een ingebouwde LED aantoont. Bij fitting-rijen (E27, G9…) beschrijft de
   cel de lámp of de maximale fittingbelasting — dat is de duurste bekende valkuil.
   **Maak er een telling van in plaats van een houding**: kruis één keer alle rijen met een
   fitting (E27/E14/GU10/G9/GU5.3/G53) tegen de rijen met een waarde in W/lm/K en zet het
   getal in het rapport. Bij prolicht en Global Trac was het nul — dan speelt de restrictie
   niet en is dat bewezen; bij Penta 1.407 rijen en bij Nosta 781, en dan weet je meteen wat
   het kost. Dezelfde valkuil met een ander apparaat is `max. load` / `output` op drivers,
   verdelers en railvoedingen (prolicht: 107 van de 236 parserwattages vals); zie de woordenschat.
3. Plaatshouders (`-`, `OHNE LM`, een numerieke `0`, `0x0x0`, `#N/A`, `see light source`,
   `N_…`, lege cel) zwijgen; tel "leeg" en "expliciet geen data" apart voor het rapport. De
   volle lijst met bewijs staat in de woordenschat. Let op: `ON/OFF` is géén plaatshouder maar
   positief bewijs voor `dimmable` = `no` — drie merken, 3.155 rijen.
4. **Kruis elke kolom die je overneemt met een tweede, onafhankelijke drager** van hetzelfde
   feit — het artikelnummer, een andere speckolom, of de vrije omschrijving. Tel over de héle
   lijst hoe vaak ze het eens zijn. Een tegenspraak is een bronfout, geen leesfout, en dan gaat
   geen van beide waarden het Excel in. Bij DCW éditions was dat de enige manier waarop een over
   de rijen verschoven omschrijvingskolom (22 artikelen, kleur én kelvin van een ándere variant)
   überhaupt zichtbaar werd. Werkwijze en de drie klassen bronfouten die je er zo mee vindt:
   zie "Kruis twee onafhankelijke dragers van hetzelfde feit" in `references/woordenschat.md`.
5. **Meet de lengteverdeling van tekstkolommen** terwijl je toch de celvormen meet: een piek
   tegen een rond getal (40, 43, 50, 255) is een hard afgekapte ERP-export, en die namen zien er
   compleet uit. Molto Luce verloor er 72.593 op, Cini&Nils 838. Ook dat staat in de woordenschat.

**De gestructureerde blob.** Sommige merken (RZB, en vermoedelijk elke BMECat-export) stoppen een
complete spectabel als `Label: waarde`-tekst in één omschrijvingskolom. Dat is fase 1, geen fase 3:
het is deterministisch te tokenizen op de labellijst en verdient dus dezelfde behandeling als een
echte kolom — inclusief het meten van de celvormen per label.

**Is elke regel een PRODUCT, of een onderdeel daarvan?** Een prijslijst kan een **stuklijst** zijn:
Foscarini levert 2.518 regels waarin `Item_Aggregated` het verkoopbare artikel is (eigen GTIN en
prijs) en `Item_Component` het glas, frame, canopy of de LED-module daarvan. Eén rij per regel
zou de prijs 2.518 keer tellen in plaats van 1.250 keer — een verdubbeling die nergens een
foutmelding geeft.

Herken het aan een kolom die het regeltype benoemt, aan een artikelnummer dat zich herhaalt over
opeenvolgende regels, of aan componentregels zonder eigen prijs. Neem dan **één rij per
verkoopbaar artikel** en gebruik de componentregels als bron voor fase 3 (het glas verraadt het
materiaal, de LED-module de kelvin en CRI). Meld het aantal ontdubbelde componentregels, en
controleer of prijs en naam binnen één artikel niet met elkaar in tegenspraak zijn. Let op dat
een componentregel de tékst van het moederartikel kan erven — bij KDLN droeg de FLOW-baldakijn
de FLOW-lamptekst (17 rijen) — en dat die erftekst geen spec van het onderdeel is.

De toets is **eigen artikelnummer plus eigen prijs**, niet het woord in de typekolom: Nuura's 52
rijen `Type = Itemlist` zijn complete kroonluchtersets met eigen nummer, EAN en prijs, en
ontdubbelen zou 52 verkoopbare artikelen wegvagen.

**Dezelfde fout komt in drie andere gedaanten voor:**
- **De ouderrij bóven zijn varianten.** Brilumen's kolom `Type:` onderscheidt `Aggregation Code`
  (2.899), `Order Code` (15.523) en `Single Order Code` (382); de aggregatierij draagt dezelfde
  prijs als zijn kleur- en kelvinvarianten (0 van de 2.899 families heeft meer dan één prijs).
  Bruikbaar detectiemiddel: **code-afstamming** — een rij is een ouder zodra een andere rij een
  code draagt die begint met deze code plus `.` of `-`.
- **De prijs-/kleurgroepkolom.** Brokis' `PRICE CATEGORY` (A/B/C/D) maakt van 259 producten 373
  regels; binnen één `PC ID` zijn alle overige kolommen identiek.
- **De configurator-matrix.** Zora levert 151.285 rijen die elke combinatie van module × trim ×
  CCT × hoek × twee kleuren als eigen artikelcode dragen; Intra 790.303. Herkenning: enkele
  kolommen met weinig distinct-waarden waarvan het product exact het rijtal geeft. Hier zijn
  alle rijen wél verkoopbaar — niet ontdubbelen, wél melden dat "één product" hier iets anders
  betekent.

**En de omkering: één bronregel kan méér dan één artikel zijn.** Lumina zet twee artikelcodes
naast elkaar (`ART. CODE 3000K` 346 gevuld, `ART. CODE 2700K` 221); alleen kolom A overnemen
had 221 echte artikelcodes stil laten wegvallen. Meet dus hoeveel kolommen artikelcode-vormige
waarden dragen. Zo'n kolomkop is meteen een geldige fase-1-bron voor kelvin — maar alléén voor
de rijen die zich ónder die kop onderscheiden: bij Lumina bleef kelvin leeg op de 125 artikelen
met alleen een A-code (rozetten, kappen, voedingen).

**Als de artikelcode pas uniek is ná samenvoeging met een variantkolom**, voeg dan samen. Bij
Seletti delen 16 van de 192 rijen hun `ITEM` met een kleurvariant; de code werd `ITEM + COL.`
(`07749BLU`), en het bestand bewijst die schrijfwijze zelf met `R99998` naast `R99998WHI`.
Zonder die samenvoeging overschrijven 16 rijen elkaar bij import.

**"Netto" betekent twee dingen — zoek uit wélke.** In de Nederlandse en Duitse handel is *netto*
vaak "excl. btw", en dan ís het de brutoprijs die wij willen. Elders is het "ná korting", en dan
mag hij er niet in. Beslis niet op het woord maar op bewijs uit het bestand zelf:

| aanwijzing | oordeel |
|---|---|
| een voetnoot die het definieert ("net price … without value-added tax", Häfele) | brutoprijs — overnemen |
| er is géén aparte korting-, inkoop- of margekolom | vermoedelijk brutoprijs |
| er staat wél een kortingskolom naast, of de bedragen zijn zichtbaar onder marktniveau (Osram: Parathom GU10 op € 2,25) | inkoopprijs — leeg laten |
| **twee prijskolommen verhouden zich als een exacte, over álle rijen constante factor** (Graypants ×1,21 op 207 bedragen; Kartell 1.460 van 1.460; Segula 229 van 229; Nuura 499 → 416; Oligo ÷1,19 op ronde bedragen) | dat is btw, geen korting — de hogere kolom is incl., de lagere is de brutoprijs die wij willen |
| **de ene kolom is rond, de andere heeft repeterende decimalen** (Normann: `Retail_EUR` 290/120/55/1310 tegen `Contract_EUR` = ÷1,2 en `Cost_EUR` = ×0,475) | de ronde kolom is de geauteurde prijs; de andere is eruit gerekend en dus een korting |
| **een percentagecel in de kop** (Nuudo `Netto` met cel E1 = 0 %; Lumiparts `Klant korting % = 0`) | ná-kortingskolom — niet overnemen, ook niet als de bedragen hier toevallig gelijk zijn |
| **een kolom `Price 2026` die als formule naar het vorige jaar wijst** (`=Price2025*1.03`, Global Trac) | geen tweede prijssóórt maar een prijsjáár — kies er één en meld welke |

Kun je het niet uitmaken, laat het veld dan leeg, bewaar de bedragen in je werkbestand en meld dat
één menselijk besluit ze alsnog vult. Dat is bij Häfele 1.298 rijen en het verschil tussen 73 %
en 98 % must-dekking — te veel om op een woord te gokken, in beide richtingen.

Zoek dat bewijs over **alle** tabbladen: bij Catellani stonden `Sconto_1`/`Sconto_2` op een
ánder blad dan de prijs. En de prijssoort kan per **rij** verschillen in plaats van per kolom —
Catellani heeft 12 regels met `NET PRICE` in de omschrijving, Trizo21 30 cellen `**NET PRICE**`
tussen 8.472 gewone bedragen. Een zoekactie over alle bladen op `netto/brutto/rabatt/sconto/
remise/VAT/MwSt/BTW` maakt de tak "er is géén aparte kortingskolom" aantoonbaar in plaats van
aangenomen (Buzzi telde zo 5.751 tekstwaarden met één treffer).

**Interne commerciële kolommen neem je nooit over — ook niet naar "controleren".** Kortings-,
inkoop-, marge- en dealerkolommen (Segula `Dealer -40 % pro piece`, prolicht `Discount Group`
7.798 cellen, Orbit `DISCOUNT GROUP` 41.411) horen niet in een merkbestand. Het template heeft
er een apart intern veld voor (`purchase_price_excl_vat`, `internalOnly`) en dat gaat het
merk-Excel niet in. Bewaar ze in je werkbestand als de gebruiker ze nodig heeft; "controleren"
is de verkeerde plek, want daar reizen ze mee naar wie het bestand ook opent.

**Prijs.** Vier regels, alle vier uit gemeten fouten:
- `Price on request` / `op aanvraag` (Bega 172, iGuzzini 11.902): laat het prijsveld **leeg** en
  zet de rij op "controleren". Een must-veld leeg is beter dan een verzonnen bedrag. Dezelfde
  betekenis dragen `Included`, `Included (please specify)` (Graypants) en — belangrijker — een
  **numerieke `0` of `0,00`**: Buzzi heeft 751 rijen met `Price` = 0 naast een vlagkolom
  `On Request`, Oty 147 rijen waar rij 1 zegt `* out of collection in red = € 0,00`. Nul passeert
  elke prijsvalidatie en landt als gratis product in de portal.
- **Dezelfde artikelcode met twee prijzen**, binnen één bestand (Hollands Licht: 6) of tussen twee
  bestanden van hetzelfde merk (Lodes: 1): beide prijzen naar "controleren", veld leeg.
- Anker een prijs-regex links op een **woordgrens** — Lodes schrijft `1460,00` zonder
  duizendtal-scheider en een te smalle regex leest daar stil `460,00`.
- Vlaggen als `Estimated Price` / `Approved Price` overnemen mag, maar meld ze in het rapport.
- **Staffelprijzen** (Philips' tabblad `TL-Protection`: 25-100 / 125-500 / 525+ stuks) zijn
  hoeveelheidsprijzen, geen adviesprijs — hele blok buiten de verwerking, geteld.
- **Valutakolommen.** Nuura levert er twaalf (DKK/NOK/SEK/CHF/GBP plus landvarianten in EUR) en
  de Duitse EUR-kolom wijkt ~1 % af van de generieke. Kies de neutrale EU-kolom, leg de keuze
  vast als aanname, en meld de afwijkende landvarianten. Nooit zelf omrekenen.

**Eenheden bij maten.** Staat er geen eenheid bij (Vibia levert meters), leid hem dan af uit het
waardenbereik: kies de eenheid die armaturen tussen ongeveer 1 cm en 5 m oplevert, en leg die
afleiding vast als aanname. Nooit een eenheid aannemen op grond van één cel. De *as* leid je
niet af: zonder label (`H`, `B`, `L`, `Ø`) vul je niets in, en een verpakkings- of pendellengte
is nooit een armatuurmaat — zie "Maten: alleen wat gelabeld is" in de woordenschat. Toets een
maatkolom bovendien tegen een gelabelde maat in de naam: bij Royal Botania heeft `DOME FLOOR
172CM` zijn 1,7 in de kolom `Length` terwijl de zusterrij `BEACON … 140CM` hem in `Height` zet.

**Een afkorting mag je alleen vertalen als het bestand hem zélf ergens uitschrijft.** Dat is
dezelfde bewijsvorm als de `gr`-regel in de woordenschat, en hij werkt in beide richtingen. SLV
gebruikte `CL`, `PD` en `WL` wél (die staan elders voluit naast het Nederlandse woord) en `DL`
níet — 2.104 rijen zonder categorie als prijs. Intra bewees `FO` = fixed output doordat een
zusterrij `fixed output` voluit schrijft, en dat legde vast dat 379.812 rijen níet dimbaar zijn.
Halla vertaalde zijn kleurcodes `B`/`S`/`W` via een tabblad dat op dezelfde positie black/white/
silver voluit schrijft (29.483 rijen). Vind je die appositie niet, dan laat je de code liggen —
Krea 30 kleurcodes over 2.886 rijen, Intra's montagecodes over 662.984 rijen, Foscarini 102
kleurafkortingen. Dat is dan meteen het goedkoopste advies voor het rapport: vraag de legenda.
Zoekvolgorde: zelfde kolom voluit → ander tabblad op dezelfde positie → voetnoot- of
legendatabblad → koprijen (Brink zet zijn legenda in koprij 2: `* = new item  P = premium item`).

**Een codesegment als speclegenda mag pas na een gekwantificeerde toets.** De verleiding is
groot — het artikelnummer is vaak een verborgen speckolom — maar Nemo laat zien hoe het misgaat:
het derde segment codeert het producttype met 238 bevestigingen en 0 tegenvoorbeelden, en tóch
is de legenda niet toegepast, omdat cijfer `5` 391 van de 530 lege rijen zou moeten vullen op 51
bevestigingen uit 6 families (extrapolatie 1 : 7,7) én omdat de accessoires die aantoonbaar géén
hanglamp zijn óók op `5` staan. Bij LTS verschilt de codegrammatica per serie (3- naast
4-cijferige segmenten), dus daar bewijst de positie niets. Toepassen mag als (a) de grammatica
over álle series gelijk is, (b) er nul tegenvoorbeelden zijn, (c) de extrapolatie klein is en
(d) er geen restcategorie op hetzelfde teken zit. Faalt er één, dan gaat de legenda naar
"aannames" mét de dekkingswinst die één bevestiging van de leverancier zou opleveren.

**Dubbele rijen.** Drie soorten, drie antwoorden: een artikelcode die per hoofdstuk **herhaald**
wordt (Jacco Maris: 92 driver-opties) ontdubbel je stil; dezelfde code in **twee bronbestanden**
van hetzelfde merk (Lodes: 8) neem je één keer over — eerste bron wint, tenzij de prijzen
verschillen, dan geldt de prijsregel hierboven; een code die door een **bron-typfout** twee
verschillende producten aanduidt gaat naar "controleren". Tel alle drie in het rapport.

Twee vormen erbij uit de nachtrun van 12 aug 2026. Dezelfde code met tegenstrijdige **specs**
(niet alleen prijs) los je **per veld** op: Tekna's `L060` draagt 425 lm op Nautic en 465 en 490
op Arton, en daar is alleen ingevuld waar álle omschrijvingen het eens waren, de rest leeg.
En de spiegelvorm — **dezelfde naam op twee unieke codes met twee prijzen** (LTS: 658458 € 272
en 658459 € 262, verschillende EAN's) — houd je allebéí, met beide op "controleren". Lopen twee
artikelen alleen uiteen in een cel die niet in de naam zit, voeg die cel dan als extra naamdeel
toe: Lumen Center loste 22 dubbele namen op met `Power` respectievelijk `Electronic Driver`.

**Negatief bewijs is geen positief bewijs.** `NO DRIVER` op 2.672 Vibia-rijen zegt iets over díe
rijen — over de andere 28.687 zegt het niets. Vul de tegenovergestelde waarde dus niet in bij de
rest; die blijft leeg.

## Stap 2 — fase 2: de naam-parser (deterministisch, gebundeld)

Voor velden die na fase 1 leeg zijn: draai de gebundelde parser — dezelfde die in productie
121.000+ producten foutloos door menselijke steekproeven kwam, hier met skill-lokale patches.

```bash
cd <skill-map> && bun run scripts/parse-namen.ts <werkmap>/<merk>-namen.ndjson \
  > <werkmap>/<merk>-parsed.ndjson
```

Drie dingen die misgaan als je ze niet weet:

- draai de scripts met een **pad naar de skill-map** (`bun run <skill-map>/scripts/…` werkt ook
  vanuit een andere cwd; alleen het relatieve voorbeeld hierboven vereist dat je er staat);
- werkbestanden krijgen **altijd een merk-prefix** — generieke namen als `namen.ndjson`
  overschreven elkaar toen drie merken parallel liepen;
- die werkbestanden staan **buiten de skill-map**, in je eigen werkmap bij de uitvoer. De skill
  is een gedeeld pakket, geen kladblok: twee runs hebben er ongevraagd 8,7 MB ndjson in
  achtergelaten, en die reisde mee in het gebundelde `.skill`-bestand.

**Invoer bouwen.** NDJSON met `{"naam": "...", ...}` per rij; extra velden (bv. `nr`) reizen
ongewijzigd mee, dus zet je artikelnummer erbij om de uitvoer terug te koppelen. Voed de parser
de naam **zoals je hem in `name_en` zet**: statustokens er al af, en bij meerdelige
omschrijvingskolommen de samengevoegde naam (zie de woordenschat). Een stukke regel breekt de run
niet af — het script meldt hem op stderr met regelnummer en telt aan het eind hoeveel er
overgeslagen zijn. **Neem dat aantal over in het rapport.**

De parser is bewust conservatief en geeft alleen af wat aantoonbaar met eenheid/label in de naam
staat. Negen verdenking-soorten zijn **onderdrukkend**: de waarde verdwijnt uit `parsed` en de rij
hoort op "controleren".

| onderdrukkend (waarde weg) | niet-onderdrukkend (waarde blijft, rij tóch naar "controleren") |
|---|---|
| `bereik` · `tunable-white` · `meerdere-waarden` · `buiten-bereik` · `kantelhoek` · `afgekapt` · `onbekende-klasse` · `product-is-onderdeel` · `vastgeplakt-wattage` | `accessoire-context` · `meerdere-protocollen` · `onderdeel-in-naam` · `ontkenning` |

Onderdelen mogen hun eigen specs dragen; ze moeten alleen zichtbaar zijn, zodat een zoekopdracht
naar "150 W armatuur" geen railvoeding oplevert. Let op `vastgeplakt-wattage`: die waarde is er
al uit gehaald, dus je hoeft het Componi75W-patroon niet meer zelf op te sporen — je hoeft alleen
te besluiten of je hem alsnog wilt invullen.

Het script schrijft zijn **parserversie naar stderr**; neem dát label over in het rapport in
plaats van een versienummer uit je hoofd. Draaien er meer merken tegelijk, pin het label dan één
keer voor de hele batch: op 12 aug liep de skill-parser tijdens de run van `skill1` naar
`skill2`, en drie merken rapporteerden een versie die niet was wat ze gedraaid hadden. Toets na
afloop de mtimes van `scripts/` tegen je starttijd; is er iets veranderd, draai opnieuw en meld
of de uitvoer identiek bleef (bij Catellani en Cini&Nils was hij dat, byte voor byte).

Vul nooit een fase-1-waarde ermee omver: wat de leverancier expliciet gaf wint van wat uit de
naam gelezen is. **En een fase-1-veld dat je bewust leeg liet, is óók een fase-1-waarde.** Dat is
de helft waar het misgaat, want juist de velden die fase 1 om een goede reden oversloeg —
fittingbelasting, per-element-specs, een bereik, aansluitvermogen — zijn de velden waar de
parser met een plausibel getal komt. Brink ving 13 zulke gevallen af (de parser wilde
`max_wattage` vullen bij dimmers met `0-75W` en bij schakelbare lampen met `24/27/36W`),
Catellani 195 retrofitregels, Nosta gaf `CANNES indoor 2W+2W LED` bijna een `max_wattage` van 2.
Markeer een leeg veld daarom in je werkbestand met de reden, en houd het gesloten voor fase 2
én fase 3.

De uitzondering, en alleen deze: **meet je dat de kolom en de naam systematisch uiteenlopen met
een herkenbaar patroon, dan meten ze iets anders** en mag de naam winnen. Bij Orbit is de kolom
`LUMEN (lm)` op 29.001 rijen gelijk aan de omschrijving en op 10.816 (27 %) hoger — een
familie-/modulemaximum, geen leveranciersfeit over dít artikel. Incidenteel verschil blijft
fase 1; per rij tegenstrijdig zonder patroon betekent leeg + controleren.

**Een onderdrukkende verdenking mag je weerleggen met bron-intern bewijs**, en dat is geen
uitzondering maar goed werk — mits je het telt. Trizo21 kon de vlag `kantelhoek` (1.964 rijen,
veroorzaakt door het woord *swivel* in een kleurenopsomming) terugdraaien omdat het codesuffix
1-op-1 met de graden correleert over 4.690 rijen zonder één afwijking; SLV deed hetzelfde met
`gr`. Voorwaarden: de correlatie is over de hele lijst geteld, er zijn nul afwijkingen, hij komt
op het aannames-tabblad, en de rijen gaan tóch naar "controleren".

**Wanneer fase 2 een steekproef mag zijn.** Dekt fase 1 de parser-velden (watt, kelvin, CRI, IP,
hoek, lumen, dimbaar) al ruim, dan levert de parser per definitie niets nieuws — bij Vibia kostte
hij een volle run over 31.000 namen voor nul velden. Draai hem dan over een steekproef van een paar
honderd namen als **kruiscontrole** op fase 1 en meld dat je dat zo gedaan hebt. Nul nieuwe velden
is dan geen fout maar de uitkomst: de parser bevestigt dat de kolommen kloppen.

## Stap 3 — de chat-steekproef (verplicht vóór fase 3)

Leg de gebruiker een korte steekproef voor: **alleen vragen over vormen die deze skill nog
niet kent** uit `references/woordenschat.md`, met een maximum van 15 — bekende vormen
(IP20→IP20, 2700K→2700) hoeven geen vraag, en een schone lijst mag dus nul vragen
opleveren; meld dan expliciet dát alles onder bekende regels viel. Elke vraag draagt concrete gevallen mét de letterlijke bron:

```
Kolom "Leistung" · cel "12,5 W" · product "AN3022 ANNEX Ceiling M"
→ max. vermogen wordt 12,5. Klopt dat? (raakt 431 rijen)
```

Toon altijd: de kolomnaam óf "uit de productnaam", de letterlijke cel, een echte
productomschrijving, de voorgestelde waarde, en hoeveel rijen de regel raakt. Eén "nee"
blokkeert die hele leesregel (alle rijen die eronder vallen), niet alleen dat ene geval —
één fout in een steekproef betekent dat de regel zelf niet deugt. Vraag ook expliciet naar
wattages die vastgeplakt aan een woord staan (het Componi75W-patroon) en naar alles wat de
woordenschat als twijfelgeval markeert.

**Draai je zonder gebruiker** (nachtrun, batch, geen chat beschikbaar), dan vervalt de steekproef
en beslis je zelf — maar dan geldt het volgende in plaats daarvan, en dat is geen formaliteit:
elk besluit dat je in de steekproef zou hebben voorgelegd, komt met de **letterlijke broncel, je
keuze, je reden en het aantal geraakte rijen** op het tabblad "aannames". Bij échte twijfel vul je
niets in en gaat de rij naar "controleren" — zonder menselijke poort is "liever leeg dan een gok"
strenger, niet losser.

Een regel die je niet aandurft, laat je dan niet vallen maar **leg je klaar**: formuleer hem,
meet de scheiding, en zet de dekkingswinst erbij. DARK deed dat met 45.448 rijen die een
kabellengte dragen — van die 45.448 draagt er nul een niet-hangend typewoord en van de 3.274
rijen mét zo'n typewoord draagt er nul een kabel, een perfecte scheiding — en paste hem tóch niet
toe, want een kabellengte-optie is geen categorie-uitspraak en fout zitten kost 45.448 stil
vervuilde rijen. Met goedkeuring springt `category` daar van 6,2 % naar 68,1 % en must van 75,3 %
naar 90,8 %. Zo'n blok is voor de gebruiker één beslissing in plaats van een tabblad nalopen.

## Stap 4 — fase 3: AI voor de rest, alleen uit het bestand

Voor velden die dan nóg leeg zijn: lees per product de vrije tekst uit het bestand zelf
(omschrijvingskolommen, voetnoten, tabblad-koppen) en stel waarden voor. Harde grenzen:

- **Alleen het aangeleverde bestand.** Geen web, geen kennis over het merk van buiten het
  bestand — elke waarde moet aanwijsbaar zijn ("staat in kolom X / voetnoot Y").
- Elke fase-3-waarde krijgt een bronverwijzing en gaat óf direct het Excel in (als de tekst
  ondubbelzinnig is) óf naar het tabblad **"controleren"** (bij twijfel), met per rij: de
  waarde, de bron-tekst, en waarom er twijfel is.
- Grote bestanden: verdeel de rijen over parallelle subagents, maar laat elk zijn bronregel
  meegeven zodat jij kunt controleren — neem geen agent-oordeel over zonder bron.
- **`description_en` vul je niet met een kopie van `name_en`.** Heeft de bron één tekstkolom, dan
  is die `name_en` en blijft `description_en` leeg; een kopie tilt de scorekaart op zonder één
  feit toe te voegen en maakt hem onvergelijkbaar tussen merken. Drie merken kwamen hierlangs
  (LEDS-C4 31.864 rijen, Lumina 567, Lumiparts 9.016). Vullen mag zodra er een tweede,
  inhoudelijk ándere kolom is — Molto Luce haalde 99,98 % uit `Price List Text`.
- **Kleur en materiaal gelden voor het product, niet voor een onderdeel.** Decoratieve merken
  beschrijven kap, voet, snoer en diffusor apart. Eén kleur- of materiaalwoord zonder
  onderdeelaanduiding: invullen. Meerdere onderdelen genoemd (`shade Ø 80 cm black/gold / black
  rod / gold disc`): alleen invullen als één ervan aanwijsbaar het hoofddeel is, anders leeg +
  controleren. Kabel- of snoerkleur telt nooit als productkleur, en een afwerking (`matt`,
  `glossy`, `satin`) is geen kleur — Nuudo liet `color_2` 232 keer leeg om die reden. Vier merken
  losten dit vier verschillende manieren op; dat is een inconsistentie in ónze uitvoer, niet in
  de bronnen.
- **Houd "controleren" schoon.** Dat tabblad is de plek waar een mens naar kijkt, en het verliest
  zijn waarde zodra het volloopt: bij Zumtobel stond 87 % van de lijst erop. "Expliciet geen
  data" (een plaatshouder die zegt dat er niets is) hoort er niet in — dat is een geteld feit
  voor het rapport, geen twijfelgeval.

## Stap 5 — het brand-Excel bouwen

Bouw het officiële template exact zoals de portal het verwacht:

```bash
bun run scripts/toon-velden.ts   # alle velden: key, NL/EN-label, niveau, bucket
```

Werkblad **"Product data"** — het template is Engelstalig en heeft drie koprijen:
- **rij 1**: de bucketgroep (`bucketEn`), samengevoegd over de kolommen van die bucket;
- **rij 2**: de veldlabels — de `labelEn`-waarden, dit is de rij waarop de portal herkent;
- **rij 3**: de instructies (`instructionEn`);
- **rij 4 en verder**: de data, één rij per product.
Neem alleen velden met `inExcel: true` én `internalOnly: false` (66 kolommen), in
catalogusvolgorde. `supplier_article_code` en de prijs komen uit de bron en zijn verplicht.

**Mapping parserveld → Excel-kolom** (parser is camelCase, Excel snake_case):
`maxWattage`→`max_wattage` · `kelvin`→`kelvin` · `cri`→`cri` · `ipValue`→`ip_value` ·
`beamAngle`→`beam_angle` · `lumenOutput`→`lumen_output` · `dimmable` splitst in twee
kolommen: een concreet protocol (DALI, TRIAC, PHASE, 0-10V, CASAMBI, PWM, PUSH…) gaat naar
`dim_protocol` én zet `dimmable` op ja; het generieke `DIM` (protocol onbekend) zet alleen
`dimmable` op ja. Let op dat de parser twee namen voor dezelfde familie geeft: `TRIAC` bij het
letterlijke token TRIAC, en `PHASE` bij PHASE, MAINS DIM en TRAILING/LEADING EDGE.

**Schrijf die familie altijd als `TRIAC`.** Dit stond eerder als "kies één schrijfwijze per
merk-Excel", en dat is intern netjes maar over merken heen fout: zes merken uit de nachtrun van
12 aug kozen langs die regel drie verschillende kanten op — DARK en LEDS-C4 schreven `PHASE`
(15.873 resp. alle phase-cut-rijen, DARK mapte zelfs het letterlijke token TRIAC wég naar
PHASE), Cini&Nils, Lumiparts, Nemo en Catellani schreven `TRIAC`. De portal valideert
`dim_protocol` net zomin als `category`, dus een zoekfilter ziet die producten daarna niet meer
als één groep. Eén kanonieke waarde voor de hele database dus; zet de bronvorm (`Phase-Cut`,
`MAINS DIM`, `TRAILING EDGE`) op het aannames-tabblad.

**Wat het template níet heeft.** Er is geen veld voor diepte, voor prijs-per-meter, voor
"onderdeel of compleet armatuur" (Modular: 2.363 rijen `not a complete luminaire`) en geen
statusveld voor uitloop. Daar komen vier klassen bij die bij vrijwel elk merk voorkomen:
**kortingsgroep** (intern-commercieel — die hoort er niet alleen niet in, hij mag er niet in),
**recyclingbijdrage** (`RECUPEL CODE`, Orbit 40.401 rijen), **verpakkingseenheid en colli**
(`VPE`, `Bulto`, `Inner/Outer carton`) en **aantal lichtbronnen**. Verzin daar geen kolom voor en
pers het ook niet in een naburig veld — diepte is géén breedte. Laat leeg en tel het in het rapport.

Schrijf het bestand met een gangbare Excel-bibliotheek — bv. Python + `openpyxl`
(`pip install openpyxl`, plus `pyxlsb` voor xlsb-bronnen) of Node/Bun + `exceljs`; installeer
wat nog ontbreekt en meld dat. Boven ongeveer een miljoen cellen schaalt `openpyxl` niet meer
met een samengevoegde koprij erbij (Orbit: 41.413 × 66); pak dan `xlsxwriter` of een write-only
modus. **Maar let op wat zo'n streaming-writer met je koprijen doet:** hij spoelt een rij weg
zodra je naar een hogere rij schrijft. Bij Molto Luce schreef de eerste versie labelrij en
instructierij afwisselend per kolom en verdwenen kolom 2 t/m 66 van de labelrij stil uit het
bestand — precies de rij waarop de portal herkent. Schrijf de drie koprijen dus op rij-volgorde:
rij 1 volledig, dan rij 2, dan rij 3.

Extra tabblad **"controleren"** met de twijfelgevallen (bron-cel + reden erbij), en een
tabblad **"aannames"** met elk interpretatiebesluit — dat reist mee naar wie het bestand ook
opent. Het aannames-tabblad heeft een **vast kolomschema**, in deze volgorde:

| datum | veld | letterlijke bron | keuze | waarom | rijen geraakt |
|---|---|---|---|---|---|

(Tien parallelle runs leverden anders drie verschillende indelingen op, en dan is het bundelen
over merken heen handwerk.) Bestandsnaam: `<merk>-branddata-<datum>.xlsx`.

**Eindcontrole vóór oplevering** — de eerste echte run faalde hierop, dus sla dit nooit over:
open het geschreven bestand opnieuw en verifieer (1) rij 2 draagt exact de `labelEn`-waarden
uit `toon-velden.ts` — Néderlandse labels worden door de portal niet herkend en de upload
wordt dan geweigerd; (2) rij 1 en 3 zijn gevuld; (3) het kolomaantal is 66; (4) het aantal
datarijen klopt met je eigen telling. Meld die vier controles expliciet in het rapport.

## Stap 6 — het rapport (de dekkings-scorekaart)

Sluit af in de chat met dezelfde scorekaart als de portal toont: per bucket (Basics,
Commercial, Dimensions, …) de dekking per veld, en onderaan de totalen voor
must / wanna / nice.

**De rekenregel, zodat twee runs vergelijkbaar zijn:** dekking per veld = gevulde cellen ÷
datarijen. Het totaal per niveau = **alle gevulde cellen van die velden ÷ (aantal velden ×
datarijen)** — dus celvulling, niet het gemiddelde van de veld-percentages. Die twee lopen ver
uiteen zodra velden ongelijk gevuld zijn, en de portal toont celvulling.

Daarna, kort:

- per fase hoeveel velden hij vulde (fase 1 / 2 / 3) en de parserversie zoals het script hem
  op stderr meldde;
- wat níet meegenomen is (andere tabbladen, scan-pagina's, afbeeldingskolommen, bereiken,
  plaatshouders, ontdubbelde rijen) mét aantallen;
- de gemarkeerde gevallen: onderdelen met armatuurspecs, ondergrens-notaties, twijfelrijen;
- **velden die op 0 % staan omdat de bron ze simpelweg niet heeft** — één regel is genoeg, maar
  noem ze, en **splits ze in twee**: "de bron heeft die kolom niet" tegenover "de bron hééft de
  kolom maar hij is leeg". Dat verandert het advies aan het merk volledig. Bij Carpyen staan
  `Product Text English/Spanish/French` alle drie op 0/289 — dan vraag je niet om een
  datasheet-export maar om het vullen van kolommen die er al zijn. Een commerciële prijslijst
  zónder techniekkolommen (Bega) haalt structureel geen wanna-dekking, en dan is "vraag het merk
  om een datasheet-export" het echte advies in plaats van 43 lege kolommen;
- **conditionele velden met hun eigen noemer.** `dim_protocol` op 43,5 % ziet eruit als een gat
  terwijl 16.470 Halla-rijen expliciet niet dimbaar zijn en 13.035 van de 13.108 dímbare rijen
  wél een protocol dragen. Hetzelfde geldt voor diameter tegenover lengte × breedte (complementair
  gevuld), zaagmaten tegenover inbouw, en `lamp_foot` tegenover fitting-armaturen. Noem het
  portal-cijfer én het cijfer over de rijen waarvoor het veld überhaupt kan gelden;
- **velden die uit één voetnoot komen.** Häfele's `driver_included` staat op 100 % dankzij één
  regel ("Converters are not included, if not mentioned otherwise") — dat is één feit dat 1.298
  keer geldt, geen 1.298 waarnemingen. Toegestaan, maar markeer het, anders is de scorekaart niet
  vergelijkbaar met een kolomgevuld veld;
- **de lege `category` als vráág in plaats van als getal.** Dit is in vrijwel elke run het
  grootste openstaande blok, en de oorzaak is telkens dezelfde: de bron noemt de montagewijze wel
  maar geen typewoord (bij Orbit komen `SPOT` en `DOWNLIGHT` nul keer voor in 41.413
  omschrijvingen). Comprimeer de lege rijen tot hun serie-/familiecombinaties en lever díe lijst
  op met de dekkingswinst erbij: Orbit 23.297 rijen → 85 combinaties (must 85,9 % → ~100 %),
  Penta één besluit over twee series → categorie 74,1 % → 98,1 %, Nuura 45 rijen → 84,7 % → 100 %,
  Tekna 312 rijen → een lijst van 153 familienamen. Dat is de goedkoopste dekkingswinst in het
  hele proces. Loop je tegen een pad aan dat in de taxonomie **niet bestaat** (gependeld
  buitenarmatuur, lamphouder, snoerdimmer, losse LED-module), noem dat dan apart — een verzonnen
  pad is verboden, maar een gemeld gat kan `references/categorieen.md` verbeteren;
- **bronomvang tegenover verwachting.** Noemt de opdracht een aantal producten, zet dat naast het
  aantal bronrijen en verklaar het verschil (varianten, stuklijst, configurator-dump) of noteer
  dat het buiten deze verwerking ligt. Verwerk altijd de volledige lijst — inperken tot de bekende
  selectie is precies het stille verlies dat hier de doodzonde is. Bij Orbit ging het om 430
  producten in XIS tegen 41.413 regels, en dan is de diff bij de portal-upload navenant groot;
  dat mag de gebruiker vooraf weten;
- als laatste regel: wat de gebruiker nog moet doen (tabblad "controleren" nalopen, uploaden
  via de brandportal).

Silent verlies is de doodzonde van dit werk: alles wat je weglaat of niet kon lezen, staat
geteld in het rapport.
