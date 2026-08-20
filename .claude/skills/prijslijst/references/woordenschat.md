# Woordenschat & leesregels — verlichtingsprijslijsten

Opgebouwd tijdens de verrijking van 211.317 producten over 28 merken (aug 2026). Elke regel
hieronder is door een menselijke steekproef gekomen; de valkuilen zijn échte fouten die we
gevonden hebben. De gebundelde parser (`scripts/parse-namen.ts`) kent de naam-regels al —
deze lijst is er zodat je leverancierskólommen en fase-3-twijfelgevallen met dezelfde kennis
beoordeelt, en zodat je in de chat-steekproef kunt uitleggen wát je gelezen hebt.

## Kleurtemperatuur (kelvin)

| vorm in bron | betekenis | voorbeeld |
|---|---|---|
| `2700K`, `3000 K` | kelvin, direct | `SPOT 2700K` → 2700 |
| `27K`, `30K` (twee cijfers) | ×100 | `L.SHADOW 27KC90` → 2700 |
| `3K`, `4K` (één cijfer) | ×1000 | `Anda Nero 3K` → 3000 |
| `2.7K`, `2.2K` (decimaal) | ×1000 | Lombardo schrijft zo — bewijst de duizendtal-conventie |
| `827`, `830`, `927`, `940` | driecijferige code: 1e cijfer = CRI-klasse (8=80+, 9=90+), laatste twee = kelvin ×100 | `830` → CRI 80, 3000 K |
| `2700k` / kaal `2700` in een kolom "CCT" | kelvin | Serien |
| `K27`, `K3`, `K4` als **suffix in het artikelnummer** | zelfde schaal als in namen: twee cijfers ×100, één cijfer ×1000 | Bega codeert het zo; valideerde 10.499 rijen en legde 9 conflicten met de omschrijving bloot |
| `K2` (één cijfer, maar 2) | **2700 K**, niet 2000 K — een afkorting van `K27` | gemeten bij Bega: alle 157 rijen met `K2` dragen `2700 K` in de omschrijving. De ×1000-regel zou hier 2000 geven en dat is aantoonbaar fout. Toets een suffix daarom altijd tegen een omschrijvingskolom vóór je hem vertrouwt. |

De driecijferige lichtcode (`830`, `927`, `935`) draagt kelvin én CRI-klasse tegelijk en is dus
twee velden waard. **Lees hem alleen uit een AFGEBAKEND spec-veld**, nooit uit vrije naamtekst —
en de parser doet hem daarom bewust niet.

Waarom die grens er is, gemeten over de 134.907 nachtrun-namen: een kaal `8xx`/`9xx`-token komt
4.235 keer voor, waarvan 1.955 met een op het oog plausibele kelvin. Vrijwel allemaal zijn het
**maten**: `L=947mm` (iGuzzini), `D 845 H 52` en `L 825 B 825` (RZB). Een parserregel hierop zou
dus honderden lengtes tot kleurtemperatuur promoveren.

Waar hij wél werkt is in een gestructureerde blob met scheidingstekens
(`HELEDON mini, 20 W, 2000 lm, 935, wit` — het veld tussen de komma's ná de lumen). Bij RZB
leverde dat kelvin op 11.053 en CRI op 12.667 rijen, kruisgecontroleerd tegen de spectabel met
**0 afwijkingen**. Doe die vertaling dus in fase 1, met de positie in het veld als bewijs, en
vermeld hem als aanname.

**Valkuilen:**
- `2700K/3000K` of `27K C90 / 30K C90` = **meerdere waarden** → niet kiezen, naar "controleren".
- `DIM2WARM 2200-3000`, `TUNABLE WHITE`, `TW`, `D2W`, `DTW` = **bereik** → nooit platslaan
  tot één getal; het product kán al die waarden. Naar "controleren" of leeg laten. Diezelfde
  vorm draagt wél één zeker feit: dim-to-warm is per definitie dimbaar, dus `dimmable` = yes
  (Segula 19 rijen, SLV 321 `2000-3000K DimToWarm`).
- **`SW` / `switchable` / `3-STEP CCT` is iets anders dan `TW`.** `SW 2700-3000-4000K` (LEDS-C4,
  884 rijen) zijn drie schakelbare stánden, geen continuüm. Beide blijven leeg, maar de reden
  verschilt — meerdere waarden tegenover een bereik — en dat hoort in het rapport. Ook
  `830/35/40` (Zumtobel, 39 rijen) is deze vorm: alleen de eerste lichtcode staat voluit.
- **`TW` is niet altijd tunable white.** Brilumen sluit zijn omschrijvingen af met een kleurcode
  en heeft `TW` naast `TB`, `TS`, `TBG` en `TWB`; 5.259 van de 5.610 rijen met de vlag
  `tunable-white` bevatten het woord *tunable* niet. Toets een kaal tweeletterig token dus tegen
  de andere codes in dezelfde kolom vóór je er een bereik van maakt.
- **Klassewoorden zonder getal blijven leeg**: `led-W` / `led-N` / `led-C`, `WW`/`NW`/`CW`,
  `warm white` (Krea Design, 118 namen). Warm is geen 2700.
- `15K` kan 1500 K zijn óf een typenummer — 1500 K is zeldzaam; bij twijfel navragen.

## Kleurweergave (CRI)

| vorm | betekenis |
|---|---|
| `CRI90`, `CRI 97`, `Ra90` | CRI, direct |
| `CRI90+`, `>90`, `> 95`, `>97` | **ondergrens** — waarde wordt 90/95/97, de operator valt weg. Veilig omdat zoeken "minstens" toetst. Meld in het rapport dat het een ondergrens was. |
| `C90`, `C95`, `C98` (kort, vaak vast aan K-code) | CRI | `27KC90` → CRI 90 |
| `90CRI`, `95CRI` | CRI | |
| `>90CRI`, `>80CRI` | operator én achterstaand label in één token — ondergrens, waarde 90/80 | DARK schrijft zo op 14.284 rijen; de parser leest deze combinatie niet, dus dit is fase-1-/fase-3-werk |

**Valkuil:** `C90`/`C95` is alleen CRI zolang er geen maat achteraan komt. `C95x155` (Brink
V-merk, 6 rijen) is breedte × lengte van een profiel — een `C<nn>` gevolgd door `x<getal>` is
nooit een kleurweergave.

## Vermogen (watt)

| vorm | betekenis |
|---|---|
| `17,9W`, `6W`, `8 W` | wattage, komma = decimaal |
| `MAX 46W`, `max. 12W` | maximum, bruikbaar als maxWattage |

**Valkuilen — hier zijn echte fouten op gevonden:**
- **Fittingbelasting ≠ verbruik.** Bij een lamp met losse fitting (E27, G9, GU10, E14…)
  betekent een watt-kolom meestal *de zwaarste lamp die erin mag* (vaak 100W), niet wat het
  armatuur verbruikt. Neem watt/kelvin/lumen/dimbaar uit leverancierskolommen **alleen** over
  als de lichtbron-kolom zegt dat de LED ingebouwd is (bv. exact `Integrated LED` of exact
  `LED` — en let op: `LED E27` is een LED-lámp op een fitting, dus níet ingebouwd).
- **Belastbaarheid en uitgangsvermogen zijn dezelfde fout, ander apparaat.** `max. load 120 W`
  (Häfele-verdeler), `Driverbox 48V max.86W` en `feed CLICKTRACK 30 48V 150W` (prolicht: 107 van
  de 236 parserwattages vals, 45 %), `CANOPY X-RAIL 2 75W` (Oty), `0-75W` op dimmers en trafo's
  (Brink, 10 rijen), `output`/`Ausgangsleistung` op converters (Häfele, 75 rijen). Het getal
  hoort bij wát het apparaat kán voeden, niet bij wat het verbruikt. Kolom- en labelsignalen:
  `max. load`, `output`, `Ausgangsleistung`, `belastbaarheid`, `aansluitbaar vermogen`.
- **Gloeilamp-equivalentie.** `Parathom 2.6-35W 827 GU10` (Osram, 142 rijen) en `5,9-(60W)`
  (Ingo Maurer): het hoge getal is het vervángen gloeilampvermogen, het lage het echte. De
  parser geeft hier de hoogste af. Herkenningsvorm: twee wattages waarvan het eerste decimaal en
  veel kleiner is, of een halogeen-/gloeilampwoord ernaast. Neem het lage getal alleen over als
  de bron het als LED-vermogen benoemt; anders leeg.
- **`Nx<vermogen>`: alleen `1x` is een productvermogen.** `1x15W` is één lichtmotor van 15 W
  (Catellani & Smith bewijst het bron-intern: de S2-zuster heet `2x15W`). Vanaf `2x` staat het
  totaal er niet en geldt de per-element-regel hieronder.
- **Typenamen die op wattages lijken.** `Componi75W` / `Componi200W` zijn modelnamen (bewijs:
  zustermodel `Componi75-200`). De parser leest dit soort vastgeplakte vormen soms tóch als
  wattage — daarom hoort elk wattage dat vastgeplakt aan een woord staat in de chat-steekproef.
- **`W` als kleurcode.** `W-DMX` (draadloos DMX), `W-W` (warm white), `KAP 80 W-W RND` — de W
  is hier geen watt. De parser eist een getal vóór de W; toon zulke gevallen toch bij twijfel.
- **`W` als WEKEN.** Moooi zet de levertijd in een kolom `stock` als `10W`, `28W` — tien weken,
  geen tien watt. Onherkenbaar aan de cel zelf; het bewijs zit in de context: dezelfde `10W` staat
  daar op 339 meubelrijen, en meubels hebben geen vermogen. **Kijk altijd eerst wat een kolom
  betékent voordat je zijn celvorm vertaalt** — een kolomnaam als `stock`, `levertijd`, `lead
  time` of `delivery` is een rode vlag zodra er een `W` in de cellen staat.
- **`W` als variantletter en als *Wand*.** `Ø32 W` / `Ø40 W` bij Oty Light is de W-uitvoering
  naast de C-, D-, L-, M- en P-varianten (24 rijen); `CUT UP 1 W WANDAUFBAULEUCHTE` bij Molto
  Luce is *Wand*. De toets is bron-intern: zoek zusterrijen met een ándere letter op dezelfde
  positie. Staat die verzameling er, dan is de W geen eenheid.
- **`/m`-vormen**: `44W/m` is vermogen per meter, niet productvermogen → niet overnemen.
- Realistische band: 0,5–999 W. `2254W` in een naam is vrijwel zeker iets anders (lumen ernaast?).
- **De PLUS-notatie**: `4000+1100 lm 44+15 W` (Intra Lighting, 238.602 rijen) is direct/indirect
  — twee lichtmotoren met hun waarden apart. De parser gaf hier stil de TWÉÉDE waarde af, ruim
  een factor drie te laag; sinds 12 aug 2026 vlagt hij dat als `deelwaarden` en onderdrukt hij
  het. Optellen mag je niet: of het één armatuur of een set is, is een productvraag.
- **Per element, nooit optellen of vermenigvuldigen.** `LED 8W up & 8W down` (Jacco Maris),
  `4,8W per spot`, `9 x LED bulb filament 3,5W`, een kroonluchter met 5 lampen: de spec geldt per
  element en het totaal staat er niet. Het uitrekenen is een productbesluit — laat leeg en zet de
  rij op "controleren". Hollands Licht en Jacco Maris raakten samen ±180 rijen op deze vorm.

## Dimbaarheid

| vorm | wordt | opmerking |
|---|---|---|
| `DALI`, `dali` | DALI | ook `DALI 2CH` → DALI |
| `TRIAC` | TRIAC | |
| `0-10V`, `1-10V` | 0-10V / 1-10V | analoog dimprotocol (stuurspanning), tegenhanger van DALI |
| `CASAMBI` | CASAMBI | draadloos; `CASAMBI (DALI)` → DALI + CASAMBI |
| `PHASE`, `MAINS DIM` | TRIAC-familie | |
| `TRAILING EDGE`, `LEADING EDGE` | TRIAC-familie | fase-af- resp. fase-aansnijding; Modular schrijft het zo, 491 rijen |
| `PWM` | PWM | pulsbreedtemodulatie, gangbaar op 48V-tracksystemen (iGuzzini: 4.509 rijen) — protocol invullen |
| `PUSH` | PUSH | bediening via een gewone drukknop; gangbaar bij Spaanse/Italiaanse merken (Vibia: 6.150 cellen) — dimbaar ja, protocol PUSH |
| `BLUETOOTH`, `Converter dimbaar bluetooth` | BLUETOOTH | **alleen uit een kolom**, nooit uit een naam — zie de waarschuwing onder deze tabel (RZB: 929 rijen) |
| `AC dim` | DIM | hoogvolt-chip, netdimbaar; protocol niet nader bepaald (Astro) |
| `DIM`, `dimmable`, `Dimmable: Yes` | DIM | dimbaar, protocol onbekend |
| `NON DIM`, `NON-DIM`, `NO dimmable`, `ON/OFF`, `ND` | **niet** dimbaar → `dimmable` = `no`. Dat is positief bewijs uit de bron, geen afleiding: rijen zónder deze tokens en zonder protocol blijven leeg. Drie merken, 3.155 rijen (Oty 924, prolicht 1.919, Nuudo 312) |
| `TOUCH`, `3-STEP` / `STEP DIM`, `dimmer touch`, `dimmer on cable`, in-line dimmer | dimbaar ja, **protocol leeg** | bediening, geen protocol; vier merken (Buzzi 15, Cini&Nils 37, Catellani 11, LEDS-C4 in 10.792 fase-3-cellen) |
| `MATTER`, `gesture control`, `IQ control`, `Häfele Connect`, app-bediening | — | smarthome-/bedieningsstandaard, geen dimprotocol. prolicht 1.323 rijen, Häfele 260 — zelfde behandeling als `controllable` |
| `A or B or C` (`0/1-10V or PUSH or DALI`, `Dali, DMX, other`) | — | een **keuze** uit configuratieopties, geen eigenschap van dít artikelnummer → alles leeg, rij naar "controleren" (KDLN 6, Graypants) |
| `Dimmable according to bulb` | — | eigenschap van de lámp, niet van het armatuur — de dim-variant van de fittingbelasting-valkuil (Lumen Center, 33 rijen) |
| `DALI + SENSOR`, `SENSORIK UND CASAMBI` | DALI resp. CASAMBI | sensor is geen dimprotocol |
| `TRIAC + 0–10 V` | TRIAC + 0-10V | let op: leveranciers gebruiken soms een en-streep (–) |
| `PROTOPIXEL` | — | pixelbesturing voor lichteffecten, geen dimprotocol in onze zin → `dimmable` ja, protocol leeg (Vibia: 720 rijen) |
| `controllable` | — | betekenis onduidelijk (app-bediening?); niets invullen, rij naar "controleren" (Lodes) |

Volgorde bij meerdere signalen in een naam: NIET-DIMBAAR wint van alles; daarna
DALI → TRIAC → PHASE/TRAILING EDGE → n-10V → CASAMBI → PWM → PUSH → DIM. De gebundelde parser
volgt exact deze volgorde.

**`Bluetooth` in een naam is meestal een antenne, geen dimprotocol.** Gemeten over 83.117 namen:
van de 548 treffers is de grootste groep `Buried pole with Bluetooth antenna H= 7,800` — een
lichtmast met een antenne erop. De parser laat het woord daarom bewust liggen. Staat het in een
kolom die over dimmen gáát ("Converter dimbaar bluetooth"), dan neem je het in fase 1 wél over.

**`3-fase` is een RAILSYSTEEM, geen fase-dimming.** Driefasenrail (3-phase track) heeft drie
stroomkringen in het profiel; met dimmen heeft het niets te maken. SLV heeft er 456 rijen van.
Dezelfde val: `1-fase`/`single phase` bij rails. Kijk of het woord bij een railproduct staat —
dan is het de rail. `PHASE` als dimprotocol staat naast andere protocolnamen, niet naast `track`.

**Compatibiliteit is geen eigenschap.** Staat er `NO DRIVER` naast een rijtje protocollen, dan
somt die lijst op wat het armatuur áánkan met een externe driver — dat is geen dimprotocol van
dit artikel. Vibia doet dit 2.672 keer. Vul dan `driver_included` = nee en laat de dim-velden leeg.

## IP-waarde

`IP20`, `IP44` … direct overnemen. `IP19`/`IP99` bestaan niet — leesfout, niet overnemen.
Let op buurkolommen: "Schutzklasse" (I/II/III, elektrisch) en "EEK" (energielabel) zijn
GEEN IP-waarde, ook al staan ze ernaast.

**Toets elke gelezen waarde tegen de bestaande set** (IP20, IP23, IP40, IP44, IP54, IP55, IP65,
IP66, IP67, IP68 …) in plaats van alleen `IP19`/`IP99` af te vangen. Een regex zonder
hoofdletter- en woordgrenstoets las bij Brilumen `Professional Strip 60 LED` (de letters `ip 60`
midden in *Strip 60*) als `IP60` en
leverde zo 47 niet-bestaande waarden op (IP60, IP12, IP28, IP16, IP11, IP10).

**Twee IP-waarden in één cel is de normale vorm bij inbouw- en buitenarmaturen**, niet een
leesfout: `IN IP20 / OUT IP54` (LEDS-C4, 6.074 rijen — 19 % van dat bestand), `IP65/IP20`
(Global Trac, 148 rijen). Kiezen tussen inbouw- en zichtzijde is een productbesluit → leeg,
rij naar "controleren". `in compliance with IP54` naast een toegekende `IP20` is een
spec-verwijzing en geen tweede waarde: dan geldt IP20.

## Lichtstroom (lumen)

`527 lm`, `1200lm`, kaal getal in een kolom "Lumen". **Valkuil:** `up to 1600LM` is een
bovengrens (CLS) — waarde overnemen mag, maar meld het als ondergrens-onzekerheid in het
rapport. Lumen per meter (`lm/m`) niet overnemen als productwaarde.

**Bereiken worden ook met drie punten geschreven.** `3400...4300 lm` (RZB) is hetzelfde feit als
`3400-4300 lm`: het armatuur haalt de bovengrens alleen in zijn zwaarste uitvoering. Nooit
platslaan tot één getal. Sinds `9786dc5+skill1` vlagt de parser dit als `bereik` (onderdrukkend);
vóór die patch werd de bovengrens stil afgegeven. Dezelfde notatie komt voor bij watt
(`29...38 W`) en kelvin.

## Uitstraalhoek (beam angle)

`10°`, `24°`, `40°gl` (glas-lens), `20°pc` (polycarbonaat-lens), `30° lens`. Optiekcodes
zonder graden (`FL` flood, `SP` spot, `WF` wide flood, `MD` medium) alleen vertalen met een
gecureerde tabel van dat merk — nooit gokken. **Valkuilen:** `360°` is geen bundelhoek;
bij "adjustable/kantelbaar" kan het getal de kantelhoek zijn.

**De hoek van een koppelstuk is geen bundelhoek.** `L-joint 90°`, `Bocht 90°`, `bend 135°`,
`90° corner connector`, `VERBINDER 90°`, `V-KUPPLUNG/…/60°`, `120°/90° connector`: dat is de
meetkundige hoek van het stuk zelf, en daar komt geen licht uit. Zeven merken in de nachtrun van
12 aug 2026 draaiden deze waarde met de hand terug, samen ±260 rijen (Trizo21 188, Lumiparts 32,
prolicht 25, Moooi 8, Nuudo 6, Oligo 1, Molto Luce). Sinds `9786dc5+skill3` vlagt de parser dit
als `geometriehoek` (onderdrukkend) — je hoeft de vorm dus niet meer zelf op te sporen, maar in
leverancierskolommen geldt hij onverkort. Railassortimenten verkopen per definitie hoekstukken.

**Bij lichtbronnen en rondom-stralende armaturen is een gradenwaarde een STRAALhoek.**
`180º Emission` / `360º Emission` (LEDS-C4, 108 rijen), `220°`/`320°` op retrofitlampen (SLV,
25 rijen), `45°` als stand van hals en filament (Segula). Het markeerwoord is `Emission` of de
productklasse, niet het getal: `220°` is een geldige stralingshoek maar nooit een bundelhoek.

**Asymmetrische optiek: `65°x45°`, `26°x42°`.** Twee hoeken die samen één ovale bundel
beschrijven; kiezen kan niet (Global Trac 315 rijen, Buzzi 24) → leeg. Let ook op `35/25º`
(Brilumen, 4 rijen): dat zijn twee úitvoeringen, en een naïeve lezing geeft stil de tweede.
De uitgeschreven verdeling (`Double Asymmetric`, `Single Asymmetric`, `DA`, `AS` — Global Trac
344 rijen) hoort niet bij de hoek maar bij `light_distribution`.

**`Spot`, `Flood`, `Medium`, `Wide` uitgeschreven zijn bundelbreedtes, geen producttype.**
Bij Lumiparts draagt `Spot` die betekenis op 499 rijen; wie hem als typewoord voor `category`
leest, wijst het verkeerde pad toe. Herkenning: staat het woord in dezelfde serie náást `Flood`
of `Medium`, dan is het de optiek.

**`gr` is bij sommige merken de eenheid graden** (SLV: 1.126 rijen, `24gr`). De parser kent hem
bewust NIET — buiten zo'n bestand is `gr` te dubbelzinnig (gram, grijs, bestelcodes). Neem hem
alleen over als je het bínnen het bestand kunt bewijzen: zoek dezelfde waardenverzameling elders
in dezelfde lijst geschreven mét `°`. Bij SLV verdubbelde dat de beam-angle-dekking; leg het vast
als aanname met die kruisverwijzing erbij.

**Let op wélk teken er staat.** Spaanse en Italiaanse merken schrijven het ORDINAALteken `º`
(U+00BA) in plaats van het gradenteken `°` (U+00B0) — `SPOTLIGHT 12º` bij Vibia, 153 rijen. Ze
zien er identiek uit en een regex op alleen `°` mist ze allemaal. De parser kent beide sinds
11 aug 2026; controleer het ook zelf bij leverancierskolommen.

**`Ta 50°` is de omgevingstemperatuur, geen bundelhoek.** Dit is de duurste vorm die de nachtrun
van 11 aug 2026 vond: bij iGuzzini stond hij 1.708 keer in de namen en de parser maakte er even
zoveel bundelhoeken van. De parser slaat `Ta` sinds `9786dc5+skill1` over (hoofdlettergevoelig,
anders raakt hij "Delta 50°"), maar herken de vorm ook zelf in leverancierskolommen — daar is hij
juist wél bruikbaar, als `ambient_temp`.

## Producttype-valkuilen (geldt voor álle velden)

- **Onderdelen dragen armatuurspecs.** Voedingen (`POWER KIT 150W`), drivers
  (`1-10V dimmable driver 36W`), rozetten (`ROS. C/ALIM.`), clusters, spare parts. Staande
  lijn van Timo: onderdelen mogen hun éigen specs dragen — maar markeer ze in het rapport,
  want een zoekopdracht naar "150 W armatuur" vindt dan ook die voeding.
- **Onderdeelwoorden aan het BEGIN van een naam onderdrukken alle velden** (`product-is-onderdeel`,
  daar is de detectie bewezen schoon). Sinds 11 aug 2026 wordt een samengesteld onderdeelwoord
  **midden** in de naam ook gevlagd (`A.24 C POWER KIT 150W`, `SURF.ELECT.CONN.TRACK 48W`) — maar
  met `onderdeel-in-naam`, en die is níet onderdrukkend: de waarde blijft staan en de rij komt op
  "controleren". Je hoeft die gevallen dus niet meer zelf op te sporen.
- **"Integrated power supply" is géén onderdeel.** Bij iGuzzini staat de voeding als spec-fragment
  in gewone armatuurnamen (`… – Integrated power supply - 28.6W 2960lm - 2200K`). Een kwalificatie
  ervóór (integrated, remote, DALI dimmable, constant current, without) betekent dat het armatuur
  er één heeft; zonder kwalificatie (`Power supply unit`, `base for power supply`) is het product
  zélf een onderdeel. Dat onderscheid zit in de parser, maar geldt net zo goed voor kolommen.
- **Retrofitlampen en losse lichtbronnen** (E27-lamp, TL-buis, `LED bulb`, `light engine`):
  eigen specs mogen, zelfde melding.
- **Spare-parts-/meubel-tabbladen**: prijslijsten mengen vaak Lighting met Furniture,
  Accessories en Spare parts. Alleen de verlichtingsrijen horen in ons Excel; meld de rest
  in het rapport als "niet meegenomen: N rijen (tabblad X)".
- **Douane- en goederencodes zijn geen productclassificatie.** `HS Code`, `Custom_Code`,
  `Commodity code`, `INTRASTAT`, `Duty_Code`, `Customs Tariff` — zes kolomnamen voor hetzelfde
  ding, bij zes merken aangetroffen. Het is géén `country_of_origin` (KDLN: `Made in Europe =
  Yes` is ook geen land) en géén categoriebron: bij Normann Copenhagen draagt een compleet
  armatuur de code `9405919000` (glazen ónderdelen) en een GX53-lamp `8544499100` (geïsoleerde
  kabel). Als bewíjs voor rijtype mag hij wél dienen zodra je hem binnen het bestand kunt
  kruisen — bij Oligo scheidde 8504 de trafo's van 940510/940520 — maar dan als aanname, niet
  als veld.

## Ondergrens-notaties die op de kantoorlijst staan

`up to 1600LM` (CLS), `CRI90+` (Kreon/Prado): wij nemen de genoemde waarde, de leverancier
bedoelt mogelijk iets genuanceerders. Overnemen mag, wél melden in het rapport.

## Kleurconsistentie (SDCM)

`MacAdam 3-Step`, `3-Step MacAdam`, `SDCM 3` → `sdcm` = 3. Lodes schrijft het op honderden regels
zo; vóór 11 aug 2026 stond het niet in deze lijst en werd het daarom niet overgenomen.

## Overige vormen uit de praktijk

- **`excl. <fitting>`** (Astro, 640 rijen): `Montreal Round 220 BWL excl. E14` levert drie feiten
  tegelijk — `lamp_foot` = E14, `light_source` = E14, `light_source_included` = nee. Erg vruchtbaar
  bij distributeurs, die meestal ook een voetnoot hebben ("alle armaturen zonder lichtbron tenzij
  vermeld"); die voetnoot is bron-intern bewijs en mag je gebruiken.
- **Statustokens en uitloopmarkeringen**: `Ja`, `nieuw`, `uitloop`, `min > N stuks`, `^^`, een
  losse `*` (Bega: 2.969 rijen). Dit zijn voorraad- en levertijdmarkeringen, geen deel van de
  productnaam — strippen en het aantal in het rapport melden. Ze horen in géén van de 66 velden.
- **Meertalige regels op één rij**: `Matte White Bianco Opaco` (Lodes) is één kleur in twee talen.
  Isoleer de taal van het template (Engels) en meld dat je dat gedaan hebt.
- **Meerdelige omschrijvingskolommen**: Duitse merken splitsen de naam over
  `Article Description 1-4` (Bega). Voeg samen met ` · ` als scheider en laat
  bijsluiter-fragmenten ("add. free 1 x BEGA 13565") weg — die horen niet in de naam.
- **Anderstalige bron**: is de hele prijslijst Nederlands of Duits (RZB), vul `name_en` en
  `description_en` dan met de leverancierstekst zoals die er staat en meld de taal in het rapport.
  Zelf vertalen is een waarde verzinnen; een leeg must-veld is hier de slechtere optie omdat de
  tekst wél bestaat en herleidbaar is.
- **Ja/nee-velden zijn Engelstalig**: het template is Engels, dus `yes` / `no`, niet `ja` / `nee`.

## Maten: alleen wat gelabeld is

Het template heeft `height_cm`, `width_cm`, `length_cm` en een diameter — geen "eerste getal",
geen diepte. Vier regels, alle vier uit gemeten fouten:

- **Zonder as-label wijs je niets toe.** `43 cm` (Normann, 12 rijen), `wall lamp 33x17` (Penta,
  195 rijen), `Cm.57 x 90 x 4,5` (Seletti), `35x21x107mm` (Nosta), `120 x 12 x 3 cm`
  (Graypants), `φ120mm*800mm*30mm` (Zora): welk getal welke as is, staat er niet. Alleen
  invullen bij een expliciet label (`H`, `B`, `L`, `Ø`, `D`) óf als er precies één maat is.
  `AxB` als lengte × breedte mag wél zodra de kolomkop dat zegt (Molto Luce, 5.359 rijen).
- **Zonder eenheid is het geen maat maar een typeaanduiding.** `TIA 200/400/600`, `DOT 600/800`,
  `WALL DISC 19`, `Nuvola H20`, `VICTOR 120/200/295` — vier merken. Dit is de tegenpool van de
  eenheidsafleiding in stap 1 van de skill: die geldt in een maat*kolom*, deze in vrije naamtekst.
- **Verpakkings- en colli-kolommen zijn geen productmaten.** Kolomnaamsignalen: `package`,
  `box`, `carton`, `innerbox`, `outerbox`, `bulto`, `colli`, `packing`, `gross/net weight`,
  `volume`. Zes merken hebben ze (Foscarini, Graypants, KDLN, Trizo21 7.624 rijen `SIZE BOX
  L/W/H`, Tekna, Brink 14 kolommen). Ze zijn juist gevuld wáár de echte maten ontbreken, en dat
  maakt ze verleidelijk. Dezelfde kolommenfamilie draagt soms een **kartonprijs** (Brink: `Inner
  carton Qty+Price`) en een **colli-EAN** — heeft een rij twee of drie EAN's, dan hoort geen van
  die codes bij het product (Carpyen, 60 rijen).
- **Kabel-, pendel- en systeemlengte is geen armatuurmaat.** `cable 210 cm`, `suspension cable
  300 cm`, `max. suspended length 1500-4000 mm`, `max. drop`, `wires 6m`, `SH1500 mm` — vijf
  merken. En een `Ø` in een cel onder een kop `Width (cm)` (Carpyen, 9 cellen) blijft een
  diameter: het celkenmerk wint van wat de kolomkop belooft.

## Plaatshouders: leeg, en "expliciet geen data" apart tellen

Naast `-`, `OHNE LM`, `ON/OFF` en de lege cel:

| vorm | waar aangetroffen |
|---|---|
| numerieke `0`, `0,00`, `0x0x0`, `0 W` | Halla vult zo álle lege specs (26.164 rijen), Intra 49.450, Royal Botania 12. Een `0` glipt door elke celvormmeting als geldige waarde — en een prijs `0` betekent "op aanvraag" of "uitloop", nooit gratis |
| Excel-foutwaarden `#N/A`, `#REF!`, `#VALUE!`, `#NAME?` | Nemo 3 namen, Nuudo 4, Graypants 1 prijs, Carpyen 1. Ze landen als tékst in een must-veld en geen enkele rijtelling ziet het. Herstellen mag alleen uit een tweede kolom in hetzelfde bestand, anders leeg + controleren |
| kruisverwijzingen `see light source`, `siehe Leuchtmittel`, `see converter` | Molto Luce, 6.494 cellen. Zegt iets over een ánder artikel → leeg, rij naar controleren |
| `N_Without Driver`, `N_NA`, `N` | Zora's configurator-export, 16.626 + 18.420 cellen. Expliciet geen data — leeg, en juist **níet** naar controleren; anders loopt dat tabblad vol en verliest het zijn waarde |
| kale eenheid zonder getal (`lm`, `IP`), `N/A`, `/` | Global Trac 152 + 24, Krea 124 namen, Carpyen |

Uitzondering die de regel scherpstelt: een plaatshouder mag spreken als hij **exact** samenvalt
met een andere kolom. Carpyen's `/` staat 139× in `Bulb Included` — precies de 139 rijen met
ingebouwde LED, dus daar is hij `yes`; in `Lumen`, `K` en `CRI` staat dezelfde `/` en zwijgt hij.
Dat is dezelfde bewijsvorm als de `gr`-regel hierboven: een kruisverwijzing bínnen het bestand.

## Kruis twee onafhankelijke dragers van hetzelfde feit

Een prijslijst draagt hetzelfde feit vaak twee of drie keer: in het **artikelnummer**, in een
**aparte speckolom**, en in de **vrije omschrijvende tekst**. Zolang die het eens zijn, heb je
bewijs. Zodra ze elkaar tegenspreken, heb je een **bronfout** — geen parseerfout, en dus niets
dat je met een betere leesregel oplost.

**De duurste vorm is de verschoven kolom.** Bij DCW éditions hoorde bij 22 artikelen de complete
omschrijving — inclusief kleur én kelvin — bij een ándere variant: de kolom was over de rijen
opgeschoven. Er kwam geen enkele foutmelding, en elke waarde op zichzelf was geldig. Zichtbaar
werd het alleen doordat het artikelnummer én de aparte kelvin-kolom `2700 K` zeggen waar de
omschrijvende tekst `2200 K` zegt. Eén drager alleen had die 22 rijen stil verkeerd ingevuld.

**Werkwijze, per veld dat meer dan één drager heeft:**

1. Kies twee dragers die **niet van elkaar afgeleid zijn**. Artikelnummer-suffix tegen speckolom;
   speckolom tegen omschrijving; omschrijving tegen artikelnummer. Twee kolommen die uit dezelfde
   ERP-export komen tellen als één.
2. Tel over de héle lijst hoe vaak ze gelijk zijn en hoe vaak niet — niet steekproefsgewijs.
   Brilumen: 67.520 vergeleken cellen, 0 tegenspraken. Bega's `K27`-suffix: 10.499 rijen, 9
   conflicten. Halla's lichtcode tegen de CCT-kolom: 29.449 bevestigd, 1 conflict. Trizo21's
   kelvinkolom tegen de omschrijving: 3.100 gelijk, 84 in tegenspraak.
3. **Bij een botsing: geen van beide waarden invullen**, rij naar "controleren", en zet er in het
   rapport bij dat het om een bronfout gaat. Kiezen welke drager wint is een productbesluit.
4. **Wijkt het systematisch af, dan meten de twee dragers iets ánders** en is er geen fout. Bij
   Orbit is de kolom `LUMEN (lm)` op 29.001 rijen gelijk aan de omschrijving en op 10.816 (27 %)
   hoger — dat is geen verschoven kolom maar een familie-/modulemaximum. Zo'n percentage met een
   herkenbaar patroon (`kolom ≥ tekst`) is het onderscheid: incidenteel = fout, systematisch =
   twee verschillende grootheden.
5. Ligt de tegenspraak binnen één rij tussen naam en code (`SORRENTO 3 … black+white base` op
   een artikel dat `LDW` = white heet, Nemo; codesuffix `BL` naast omschrijving `Silver`, Solid
   Lighting), dan is het dezelfde klasse: naam letterlijk overnemen, het geraakte veld leeg.

Deze toets vindt ook de andere twee klassen bronfouten die geen melding geven:

- **De halve kolomschuif.** Eén of twee rijen waarin álles één kolom is opgeschoven — Buzzi heeft
  twee rijen met `Description` = "BLACK" en `Price` = "SURFACE", Molto Luce vijf rijen met een
  producttype in de dimkolom, KDLN drie met lichtbrontekst in `Feeding`. Herkenning: een cel uit
  een totaal ander domein dan zijn kolom. Dat is geen nieuwe notatie maar een kapotte rij.
- **De niet-bijgewerkte zusterrij.** Een variant is gekopieerd en maar half aangepast: Carpyen's
  NURA 2 draagt `Watt maximun` = 150 W met naam `… (85W)` én 16.500 lm tegen 10.510 lm op de
  85 W-zuster (3 gevallen); Catellani heeft vier rijen waar de G-variant de tekst van de
  cascata-zuster draagt. Vergelijk daarom naam en speckolommen tússen zusterrijen van dezelfde
  serie. Dezelfde vergelijking vindt uitschieters: Seletti's 15220EX op € 764,49 naast het
  identieke zustermodel 15221EX op € 76,04 — factor tien, markeren en niet corrigeren.

## EAN: drie toetsen vóór je de kolom overneemt

Lengte 8 of 13 cijfers, geldig controlecijfer, en **uniek over het bestand**. Een kolom die
`sku`, `barcode` of `EAN` heet bevat vaak een mengsel: Moooi heeft interne codes als
`MOLHEREB35CA` tussen de EAN's (5 rijen), Segula een 14-cijferige `42605129151683`. Dezelfde
EAN op twee verschillende artikelen is een brontypfout — bij **beide** legen, net als bij twee
prijzen op één code (Häfele `4015643795318` op een armatuur van € 2.680,67 én een wandschakelaar
van € 99; Segula 1 geval). Een interne code in `ean_code` is stille vervuiling van een veld
waar niemand achteraf naar kijkt.

## Excel-artefacten: de doorgetrokken autofill-reeks

Trizo21's CRI-kolom is vanaf rij 3002 gevuld met een reeks die **per rij met 1 oploopt** — van
plausibele waarden als `>96` en `>97` door tot `>285`. Vijfentwintig aaneengesloten reeksen, 338
rijen. Iemand heeft een cel naar beneden gesleept en Excel heeft er braaf van doorgeteld.

Dit is verraderlijker dan een leesfout, want de eerste tientallen waarden zijn op zichzelf
geldig: `>96` is een prima CRI. Je ziet het alleen als je naar de reeks kijkt in plaats van naar
de cel.

**Toets elke numerieke kolom hierop voordat je hem overneemt**: sorteer op rijnummer en kijk of
er lange stukken zijn waar de waarde telkens met exact 1 (of een andere vaste stap) verandert.
Een echte spec-kolom springt; een autofill loopt. Vind je zo'n reeks, laat het hele blok leeg en
meld het aantal — ook het "nog plausibele" begin, want er is geen grens aan te wijzen waar de
onzin begint.

Dezelfde slepen-fout produceert oplopende artikelnummers, EAN's en jaartallen. Bij EAN is de
controle makkelijker: het controlecijfer klopt dan meestal niet.

**De hard afgekapte tekstkolom** is dezelfde soort vondst: je ziet hem aan de kolom, niet aan de
cel. ERP-exports kappen op een vaste veldlengte, en de namen zien er daarna compleet uit. Molto
Luce's `Product Name` stopt op 40 tekens (piek op 38–40) — **72.593 rijen**, gered door de naam
terug te halen uit de kapitalen-aanloop van `Price List Text`. Cini&Nils kapt op 43 en verliest
daarmee de laatste spec: `… Tortora chiaro 4` waar `4K` hoorde te staan, `… Phase-Cu` (838
rijen). Zumtobel kapt op 40 en Intra levert `mustard gr` naast `mustard green`.

Twee toetsen, allebei goedkoop:
- **histogram van de tekenlengte per tekstkolom** — een piek tegen een rond getal (40, 43, 50,
  60, 255) is afkapping, geen toeval;
- **is deze distinct-waarde een prefix van een andere distinct-waarde in dezelfde kolom?** Zo ja,
  dan is de korte de afgekapte.

Vind je er een, zoek dan een tweede kolom die met dezelfde tekst begint en reconstrueer daaruit;
lukt dat niet, dan gaan de rijen naar "controleren" en vraag je om een niet-afgekapte export.
Let op de tegenkant: de parser-verdenking `afgekapt` is óók vals-positief als jíj de naam hebt
samengesteld. Bij Zumtobel vuurde hij op de driecijferige lichtcode aan het naameinde (`… IP65
300 830`, 19 rijen), bij Philips op de naad in de zelfgebouwde naam (611 rijen). Toets een
`afgekapt`-vlag dus eerst tegen de bronkolom vóór je de rij markeert.

**Verdere artefacten uit de nachtrun van 12 aug 2026:**

| artefact | voorbeeld | remedie |
|---|---|---|
| **Formule-gegenereerde naamkolom** | Global Trac: `=C&" "&N&"/"&F&…` — lege cellen laten dubbele spaties en een staart `/0` achter (30 rijen) | normaliseer de naad weg vóór het lezen, schrijf `name_en` letterlijk |
| **Drijvendekomma-ruis** | `31.815389324999995` (Global Trac, uit `=Price2025*1.03`), `26.770370370370372` (Halla) | op centen afronden; het bedrag verandert niet |
| **Mojibake** (latin-1/UTF-8-verhaspeling) | Moooi: `CoppÃ©lia Small`, `london rosÃ©`, `bend 135Â°` — 21 rijen | deterministisch terugdraaien (`.encode('latin-1').decode('utf-8')`) en het aantal melden; `Â°` breekt anders elke gradenregel |
| **Doorgeslagen zoek-en-vervang** | Nuura: `l(US)tre`, `excl(US)ive` in 75 Engelse webteksten | letterlijk overnemen, níet repareren — een echte `(US)`-vermelding zou je slopen — en tellen |
| **Betekenis in de celopmaak** | valuta uit het numberformat `_ "€" * #,##0.00_` (Davide Groppi); legenda `* out of collection in red = € 0,00` (Oty, 147 rijen) en `grijs = uitlopend` (Philips) | noemt een legenda een kleur, lees dan de vulkleur mee of meld expliciet dat je dat niet gedaan hebt |
| **Verticaal samengevoegde cellen** | Lumen Center: `Product` samengevoegd over de varianten van één model (221 merges, 154 modellen, 665 rijen) | vul via de merge-ranges, niet met blind forward-fill — dat loopt over een sectiekop heen en plakt de vorige naam op een volgend model |

## PDF-artefacten die je aan de tekstlaag herkent

Allemaal gemeten tijdens de nachtrun van 11 aug 2026. Ze veroorzaken géén foutmelding — je ziet
ze alleen als je ernaar zoekt.

| artefact | voorbeeld | remedie |
|---|---|---|
| **Gestempelde herdruk**: oude prijzen staan nog in de tekstlaag onder de nieuwe | Luceplan: tekstlaag geeft 1.101,00 waar zichtbaar 1.312,00 staat; 410 dubbele prijsposities | render de pagina en verifieer elke prijs tegen de pixels — zie stap 0 van de skill |
| **Gesplitste cijfers in bedragen** | `€ 1 42,15`, `€ 0 ,00` (Jacco Maris) | spaties toestaan in het prijs-regex, daarna hertellen |
| **Twee kolommen door elkaar op één regel** | `N Pe e s t o w n e e ig tt h o t …` (Lodes) | zoek dezelfde tekst elders in het document waar hij wél leesbaar staat |
| **Verdubbelde tekens** in kop- of voetregels | `jjaaccccoommaarriiss` | alleen koppen; negeren |
| **Code en omschrijving aaneengeplakt** | `20GLOWK12060061_5White` (Hollands Licht) | stel eerst het codeformaat van dit merk vast, splits daarna |
| **Duizendtallen zonder scheidingsteken** | `1460,00` (Lodes) — een regex op `\d{1,3},\d\d` leest stil `460,00` | anker de prijs links op een woordgrens |
| **Legenda-zijbalk plakt vóór de datarij** | Astro p.3 | mid-line matchen in plaats van regelbegin |
