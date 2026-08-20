# Categoriepaden — de enige toegestane waarden voor `category`

`category` is een **must**-veld. Deze lijst is geen suggestie en geen voorbeeld: het is de
volledige taxonomie zoals die in productie bestaat, overgenomen uit
`lumenlogic/data/source/brink_categories.csv` (152 categorieën, 5 hoofdgroepen, 3 niveaus).

**Drie regels die je nooit overtreedt:**

1. **Neem een pad LETTERLIJK over uit de tabellen hieronder**, inclusief hoofdletters, spelling
   en het scheidingsteken ` >> ` (twee groter-dan-tekens met spaties eromheen). Ook waar de
   spelling vreemd oogt — `Buisvormige Fluorescentie)` draagt echt een losse haak, en
   `Oriëntatie opbouw Verlichting` heeft echt maar één hoofdletter. Verbeter niets.
2. **Staat het product er niet in? Dan blijft `category` leeg en gaat de rij naar
   "controleren".** Nooit een pad verzinnen, ook niet een dat logisch klinkt.
3. **Niveau 2 mag als niveau 3 niet vast te stellen is.** In de productiedata komen beide voor
   (`Binnenverlichting >> Hanglampen` naast `Binnenverlichting >> Hanglampen >> Kroonluchter`).
   Een correcte ondiepe categorie is beter dan een gegokte diepe.

**Waarom dit strenger is dan het lijkt.** De brandportal valideert `category` niet: elke string
wordt geaccepteerd en landt rauw in `products.category_path`, terwijl `category_id` `NULL`
blijft. Een fout pad geeft dus geen importfout maar stille datavervuiling — precies het soort
fout dat deze skill hoort te voorkomen. De juistheid is volledig onze verantwoordelijkheid.

> Let op de instructietekst in het Excel-template zelf ("bv. 'Binnenverlichting > Downlights'").
> Dat voorbeeld is fout: het gebruikt één `>` en de categorie heet `Downlighters`. Volg deze
> lijst, niet het voorbeeld in de kolomkop.

## De vijf hoofdgroepen

| hoofdgroep (NL) | Engelse naam in de portal | waarvoor |
|---|---|---|
| `Binnenverlichting` | Design lighting | alle binnenarmaturen |
| `Buitenverlichting` | Exterior lighting | alle buitenarmaturen |
| `Lichtbronnen` | Light Bulbs | losse lampen, retrofit, LED-strips |
| `Drivers, trafo's en ballasten` | Drivers / Power Supplies | **én** alle techniek, accessoires, montagemateriaal, glas, kappen — zie de waarschuwing hieronder |
| `Kosten` | Cost | vracht, montage, verwijderingsbijdrage |

**De valkuil in deze taxonomie:** `Drivers, trafo's en ballasten` is niet alleen voor drivers.
Lampenkappen, glas, lenzen, reflectoren, plasterkits, dimmers, kabels, afstandsbedieningen én
zelfs spiegels en ventilatoren hangen daaronder. Zoek accessoires dus altijd in die boom, ook
als de naam anders doet vermoeden. Er is géén hoofdgroep "Techniek" of "Accessoires".


## Kosten

| volledig pad (letterlijk overnemen) | Engelse naam |
|---|---|
| `Kosten >> Kosten` | Costs |
| `Kosten >> Kosten >> Divers` | Miscellaneous |
| `Kosten >> Kosten >> Montagekosten` | Assembly costs |
| `Kosten >> Kosten >> Verwijderingsbijdrage` | Disposal fee |
| `Kosten >> Kosten >> Vrachtkosten` | Shipping |
| `Kosten >> Project Article` | Project Article |
| `Kosten >> Project Article >> Samengesteld artikel` | — |

## Drivers, trafo's en ballasten

| volledig pad (letterlijk overnemen) | Engelse naam |
|---|---|
| `Drivers, trafo's en ballasten >> Onbekend` | Unknown |
| `Drivers, trafo's en ballasten >> Onbekend >> Uitzoeken` | To be defined |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten` | Transformers / Power Supplies |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten >> Ballast compact-fluo` | Ballast compact-fluo |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten >> Ballast TL` | Ballast TL |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten >> LED powersupply en drivers` | LED powersupply en drivers |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten >> Halogeen Transformator 12V` | Halogen 12V Transformator |
| `Drivers, trafo's en ballasten >> Trafo's en ballasten >> Ballast gasontlading` | Ballast Discharge |
| `Drivers, trafo's en ballasten >> Spiegels` | Mirrors |
| `Drivers, trafo's en ballasten >> Spiegels >> Spiegels met Verlichting` | Mirrors with Indirect Light |
| `Drivers, trafo's en ballasten >> Spiegels >> Spiegels` | Mirrors |
| `Drivers, trafo's en ballasten >> Decoratief` | Specials |
| `Drivers, trafo's en ballasten >> Decoratief >> Cadeautjes` | Gifts |
| `Drivers, trafo's en ballasten >> Decoratief >> Klein Meubilair` | Small Furniture |
| `Drivers, trafo's en ballasten >> Decoratief >> Kandelaars` | Candlestick |
| `Drivers, trafo's en ballasten >> Decoratief >> Ventilatoren` | Fans |
| `Drivers, trafo's en ballasten >> Technische Accessoires` | Technical Accesories |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Reserve- vervangonderdelen` | Replacement part |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> DMX regeling` | DMX regeling |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Inbouw dimmers` | Dimmers |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Kabels` | Kabels |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Afstandsbediening` | Remote |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> voetplaten/grondstukken tbv bolderarmaturen` | Footplates / Plots Serving Bollards |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Opbouw dimmers` | Surfaced dimmers |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Lenzen/Filters/Reflectoren` | Lenses, Filters and Reflectors |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Reflectoren en louvres` | Reflectors and Louvres |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Glas (en vervangglas)` | Glass and replacement Glass |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Montage onderdelen voor wand/plafondarmaturen` | Mounting parts for Wall / Ceiling Fixtures |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Schakelmateriaal` | Switchgear |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Lege profielen voor LEDstrips` | Empty profiles Ledstrips |
| `Drivers, trafo's en ballasten >> Technische Accessoires >> Lampenkappen` | Lampshades |
| `Drivers, trafo's en ballasten >> Montagemateriaal` | Mounting Materials |
| `Drivers, trafo's en ballasten >> Montagemateriaal >> Plasterkits, inbouwframes, inbouwdozen` | Plasterkits, mounting frames, wall boxes |
| `Drivers, trafo's en ballasten >> Montagemateriaal >> Inbouwdozen voor grondinbouw armaturen` | Mounting Boxes for inground |

## Binnenverlichting

| volledig pad (letterlijk overnemen) | Engelse naam |
|---|---|
| `Binnenverlichting >> Project artikel` | Project Article |
| `Binnenverlichting >> Project artikel >> Project artikel` | — |
| `Binnenverlichting >> Vloerlampen` | Floor Lamps |
| `Binnenverlichting >> Vloerlampen >> vloerlamp rondom stralend` | floor lamp ambient and shade |
| `Binnenverlichting >> Vloerlampen >> vloerlamp indirect stralend` | floor lamp indirect uplight |
| `Binnenverlichting >> Vloerlampen >> leeslamp Staand` | reading floor lamp |
| `Binnenverlichting >> Vloerlampen >> werkplek vloerlamp` | workplace floor lamp |
| `Binnenverlichting >> Vloerlampen >> vloerlamp met Tafeltje` | floor Lamp with table |
| `Binnenverlichting >> Hanglampen` | Pendant Lighting |
| `Binnenverlichting >> Hanglampen >> hangende profielen (gependeld)` | hanging profiles (suspended) |
| `Binnenverlichting >> Hanglampen >> Hanglamp Rondom Stralend` | Pendant Light Ambient and Shade |
| `Binnenverlichting >> Hanglampen >> Hanglamp Indirect stralend` | Pendant Light Indirect Uplight |
| `Binnenverlichting >> Hanglampen >> Kroonluchter` | Chandelier |
| `Binnenverlichting >> Hanglampen >> werkplek hanglamp` | workplace pendant lighting |
| `Binnenverlichting >> Tafellampen` | Table Lamps |
| `Binnenverlichting >> Tafellampen >> Oplaadbaar en Draadloos` | Rechargeable and Wireless |
| `Binnenverlichting >> Tafellampen >> Tafellamp met Voet` | Table Lamp with Base |
| `Binnenverlichting >> Tafellampen >> Bureaulamp` | Desk Lamp |
| `Binnenverlichting >> Tafellampen >> Tafellamp met Klem` | Table Lamp with Clamp |
| `Binnenverlichting >> Tafellampen >> tafellamp met tafeldoorvoer` | table lamp with table transit |
| `Binnenverlichting >> Wandlampen` | Wall Lights |
| `Binnenverlichting >> Wandlampen >> Direct- en indirect stralend` | Wall Light Uplighter |
| `Binnenverlichting >> Wandlampen >> Wandlamp Rondom Stralend` | Wall Light Ambient and Shade |
| `Binnenverlichting >> Wandlampen >> Wandlamp Profielen` | Wall Light Profiles |
| `Binnenverlichting >> Wandlampen >> Wandlamp Indirect Stralend` | Wall Light Indirect Uplight |
| `Binnenverlichting >> Wandlampen >> Leeslamp Wandlamp` | Reading Lamp Wall Light |
| `Binnenverlichting >> Wandlampen >> Wandlamp Oriëntatie` | Wall Light Orientation |
| `Binnenverlichting >> Wandlampen >> Inbouw Wandlamp` | Wall Lamp Recessed |
| `Binnenverlichting >> Plafondlampen` | Ceiling Lights |
| `Binnenverlichting >> Plafondlampen >> Plafondlamp Rondom Stralend` | Ceiling Light Ambient and Shade |
| `Binnenverlichting >> Plafondlampen >> Plafondlamp Indirect Stralend` | Ceiling Light Indirect Uplight |
| `Binnenverlichting >> Plafondlampen >> Inbouw Profielen Plafondlamp` | Recessed Ceiling Light Profiles |
| `Binnenverlichting >> Plafondlampen >> Werkplek Inbouw (TL/PL/LED)` | Workspace Lamp Recessed |
| `Binnenverlichting >> Plafondlampen >> Opbouw profielen Plafondlamp` | Surfaced Ceiling Lights Profiles |
| `Binnenverlichting >> Plafondlampen >> Werkplek Opbouw (TL/PL/LED)` | Workplace Lamp Surfaced mounted |
| `Binnenverlichting >> Spot` | Spotlight |
| `Binnenverlichting >> Spot >> Plafond Inbouwspot` | Ceiling Recessed Spotlight |
| `Binnenverlichting >> Spot >> Plafond / Wand Opbouwspot` | Ceiling / Wall Surfaced Spotlight |
| `Binnenverlichting >> Spot >> Vloer Inbouwspots Indoor` | Indoor Floor Spotlight Recessed |
| `Binnenverlichting >> Spot >> Vloerspot (staand)` | Floor Spotlight (Standing) |
| `Binnenverlichting >> Spot >> Pendelspot (hangend)` | Pendant Spotlight |
| `Binnenverlichting >> Noodverlichting` | Emergency Lights |
| `Binnenverlichting >> Noodverlichting >> Armaturen met Geïntegreerde Noodunit` | Luminaires with Integrated Emergency Unit |
| `Binnenverlichting >> Noodverlichting >> Vluchtwegverlichting Inbouw` | Escape Route Lighting Recessed |
| `Binnenverlichting >> Noodverlichting >> Vluchtwegverlichting Opbouw` | Escape Route Lighting Surfaced |
| `Binnenverlichting >> Noodverlichting >> Separate Noodunit` | Separate Emergency Light |
| `Binnenverlichting >> Downlighters` | Downlight |
| `Binnenverlichting >> Downlighters >> Opbouw gasontlading` | Surfaced metalhalide |
| `Binnenverlichting >> Downlighters >> Inbouw Compact-fluorescentie` | Recessed Compact Fluorescent |
| `Binnenverlichting >> Downlighters >> Opbouw Compact-fluorescentie` | Surfaced Compact Fluorescent |
| `Binnenverlichting >> Downlighters >> Inbouw Gasontlading` | Built-in Gas Discharge |
| `Binnenverlichting >> Downlighters >> Inbouw LED Downlighter` | Recessed LED Downlight |
| `Binnenverlichting >> Downlighters >> Opbouw LED Downlighter` | Surfaced LED Downlight |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen` | Rails, Tracks & Kabelsystems |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 12V Track Spots` | Track Spots 12V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 12V Track Componenten` | Track Components 12V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 230V Track Spots` | Track Spots 230V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 230V Track Componenten` | Track Components 230V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 12V Spankabels Spots` | Cable Lighting Spots 12 V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 12V Spankabels Componenten` | Cable Lighting Components 12V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 230V Spankabels Spots` | Cable Lighting Spots 230V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 230V Spankabels Componenten` | Cable Lighting Components 230V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Componenten` | Track Components 48V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Spots` | Track Spots 48V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 24V Track Componenten` | Track Components 24V |
| `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 24V Track Spots` | 24V Track Spots |

## Buitenverlichting

| volledig pad (letterlijk overnemen) | Engelse naam |
|---|---|
| `Buitenverlichting >> Grond Inbouw Tuinverlichting` | Outdoor Recessed Lighting |
| `Buitenverlichting >> Grond Inbouw Tuinverlichting >> grond inbouw` | ground recessed |
| `Buitenverlichting >> Grond Inbouw Tuinverlichting >> grondinbouw oriëntatie` | ground orientation recessed |
| `Buitenverlichting >> Grond Opbouw Tuinverlichting` | Outdoor Surfaced Lighting |
| `Buitenverlichting >> Grond Opbouw Tuinverlichting >> bolderarmaturen` | pillar luminaires |
| `Buitenverlichting >> Grond Opbouw Tuinverlichting >> paaltoparmaturen` | pole top luminairs |
| `Buitenverlichting >> Grond Opbouw Tuinverlichting >> Masten en toebehoren` | Post top luminaires |
| `Buitenverlichting >> Grond Opbouw Tuinverlichting >> Oriëntatie opbouw Verlichting` | Oriëntation Surfaced lighting |
| `Buitenverlichting >> Wand Tuinverlichting` | Outdoor Wall Lighting |
| `Buitenverlichting >> Wand Tuinverlichting >> Wandinbouw` | Wall Recessed |
| `Buitenverlichting >> Wand Tuinverlichting >> Wandopbouw rondom stralend` | Wall Surfaced Ambient and Shade |
| `Buitenverlichting >> Wand Tuinverlichting >> Wandopbouw Indirect Stralend` | Wall Surfaced Indirect Uplight |
| `Buitenverlichting >> Wand Tuinverlichting >> Wandopbouw Direct/indirect stralend` | wall Surfaced direct/indirect Uplight |
| `Buitenverlichting >> Wand Tuinverlichting >> Armaturen met Huisnummer` | Luminaires with house number |
| `Buitenverlichting >> Plafond Tuinverlichting` | Ceiling Garden Light |
| `Buitenverlichting >> Plafond Tuinverlichting >> Plafondlamp Inbouw` | Ceiling Light Recessed |
| `Buitenverlichting >> Plafond Tuinverlichting >> Plafondlamp Opbouw` | Ceiling Light Surfaced |
| `Buitenverlichting >> Buitenlampen Decoratief` | Decorative Outdoor Lights |
| `Buitenverlichting >> Buitenlampen Decoratief >> Tuinverlichting Decoratief` | Decorative Exterior Lighting |
| `Buitenverlichting >> Schijnwerpers / Projectors` | Floodlights / Projectors |
| `Buitenverlichting >> Schijnwerpers / Projectors >> Schijnwerpers / projectors` | Floodlights / Projectors |
| `Buitenverlichting >> Buiten Prikspots` | Landscape Lighting |
| `Buitenverlichting >> Buiten Prikspots >> Prikspots` | Spots with Earth Spike |

## Lichtbronnen

| volledig pad (letterlijk overnemen) | Engelse naam |
|---|---|
| `Lichtbronnen >> Speciaal lampen` | Speciaal lampen |
| `Lichtbronnen >> Speciaal lampen >> speciale lichtbronnen` | speciale lichtbronnen |
| `Lichtbronnen >> LED Lamp` | LED Lamp |
| `Lichtbronnen >> LED Lamp >> LED Retrofit` | LED Retrofit |
| `Lichtbronnen >> LED Lamp >> LED systemen` | LED Systems |
| `Lichtbronnen >> LED Lamp >> LED Strips` | LED Strips |
| `Lichtbronnen >> Halogeen Lamp` | Halogen Lamp |
| `Lichtbronnen >> Halogeen Lamp >> Halogeen 12V` | Halogen 12V |
| `Lichtbronnen >> Halogeen Lamp >> Halogeen 230V` | Halogen 230V |
| `Lichtbronnen >> Compact Fluorescentielamp` | Compact Fluorescent Lamp |
| `Lichtbronnen >> Compact Fluorescentielamp >> Compact Fluorescentie` | Compact Fluorescent |
| `Lichtbronnen >> Gloeilampen` | Incandescent Lamp |
| `Lichtbronnen >> Gloeilampen >> Gloeilampen` | Incandescent Lamp |
| `Lichtbronnen >> TL (buisvormige fluorescentie)` | TL (Tubular Fluorescent) |
| `Lichtbronnen >> TL (buisvormige fluorescentie) >> Buisvormige Fluorescentie)` | Fluorescent Tube |
| `Lichtbronnen >> Gasontlading` | Discharge |
| `Lichtbronnen >> Gasontlading >> Gasontlading` | Metal Halide |

## Van typewoord naar pad

Zoek in deze volgorde en stop zodra je een treffer hebt:

1. **Een categoriekolom in de bron** — vertaal met de tabellen hierboven.
2. **Een typewoord in de productnaam.** Meertalig is gewoon; let op Italiaans
   (`sospensione` = hang, `parete` = wand, `tavolo` = tafel, `da terra` = vloer,
   `alimentatore` = driver), Duits (`Pendelleuchte`, `Wandleuchte`, `Einbau` = inbouw,
   `Anbau`/`Aufbau` = opbouw, `Stehleuchte` = vloer) en Frans (`applique` = wand,
   `suspension` = hang, `encastré` = inbouw).
3. **Een afkortingenlegenda in het bestand** (Astro: `WL` = wandlamp, `BWL` = buitenwandlamp,
   `IBS` = inbouwspot). Die legenda is bron-intern bewijs — gebruik hem, en noteer de vertaling
   als aanname.
4. **Een tabblad- of sectiekop** die over een hele groep rijen gaat.

Veelvoorkomende vertalingen, met het pad dat je moet invullen:

| in de bron | pad |
|---|---|
| downlight, inbouwspot rond in plafond | `Binnenverlichting >> Downlighters >> Inbouw LED Downlighter` |
| opbouw downlight | `Binnenverlichting >> Downlighters >> Opbouw LED Downlighter` |
| inbouwspot, recessed spot | `Binnenverlichting >> Spot >> Plafond Inbouwspot` |
| opbouwspot, surface spot, wandspot | `Binnenverlichting >> Spot >> Plafond / Wand Opbouwspot` |
| pendel, suspension, hanglamp | `Binnenverlichting >> Hanglampen` (of een niveau dieper) |
| kroonluchter, chandelier | `Binnenverlichting >> Hanglampen >> Kroonluchter` |
| plafonnière, ceiling light | `Binnenverlichting >> Plafondlampen` |
| wandlamp, applique, wall light | `Binnenverlichting >> Wandlampen` |
| vloerlamp, floor lamp, staande lamp | `Binnenverlichting >> Vloerlampen` |
| tafellamp, table lamp | `Binnenverlichting >> Tafellampen >> Tafellamp met Voet` |
| bureaulamp, desk lamp | `Binnenverlichting >> Tafellampen >> Bureaulamp` |
| oplaadbaar, draadloos, portable | `Binnenverlichting >> Tafellampen >> Oplaadbaar en Draadloos` |
| railspot 48V, magnetische rail | `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Spots` |
| railprofiel, connector, eindkap, canopy (48V) | `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Componenten` |
| idem, 230V / 24V / 12V | vervang `48V` door `230V`, `24V` of `12V` — die vier paden bestaan alle vier |
| lichtlijn, lineair profiel (inbouw) | `Binnenverlichting >> Plafondlampen >> Inbouw Profielen Plafondlamp` |
| lichtlijn, lineair profiel (opbouw) | `Binnenverlichting >> Plafondlampen >> Opbouw profielen Plafondlamp` |
| lichtlijn gependeld | `Binnenverlichting >> Hanglampen >> hangende profielen (gependeld)` |
| noodverlichting, pictogram | `Binnenverlichting >> Noodverlichting >> Vluchtwegverlichting Inbouw` (of Opbouw) |
| bollard, sokkel, pollerleuchte | `Buitenverlichting >> Grond Opbouw Tuinverlichting >> bolderarmaturen` |
| grondspot, inground | `Buitenverlichting >> Grond Inbouw Tuinverlichting >> grond inbouw` |
| buitenwandlamp | `Buitenverlichting >> Wand Tuinverlichting >> Wandopbouw rondom stralend` |
| schijnwerper, floodlight, projector | `Buitenverlichting >> Schijnwerpers / Projectors >> Schijnwerpers / projectors` |
| prikspot, tuinspot met grondpin | `Buitenverlichting >> Buiten Prikspots >> Prikspots` |
| lichtmast, paaltop | `Buitenverlichting >> Grond Opbouw Tuinverlichting >> Masten en toebehoren` |
| retrofit LED-lamp (E27, GU10, G9) | `Lichtbronnen >> LED Lamp >> LED Retrofit` |
| LED-strip, ledstrip op rol | `Lichtbronnen >> LED Lamp >> LED Strips` |
| TL-buis | `Lichtbronnen >> TL (buisvormige fluorescentie) >> Buisvormige Fluorescentie)` |
| driver, converter, voeding, netzteil | `Drivers, trafo's en ballasten >> Trafo's en ballasten >> LED powersupply en drivers` |
| dimmer (inbouw) | `Drivers, trafo's en ballasten >> Technische Accessoires >> Inbouw dimmers` |
| lens, filter, reflector | `Drivers, trafo's en ballasten >> Technische Accessoires >> Lenzen/Filters/Reflectoren` |
| lampenkap, shade | `Drivers, trafo's en ballasten >> Technische Accessoires >> Lampenkappen` |
| glas, vervangglas | `Drivers, trafo's en ballasten >> Technische Accessoires >> Glas (en vervangglas)` |
| leeg profiel voor ledstrip | `Drivers, trafo's en ballasten >> Technische Accessoires >> Lege profielen voor LEDstrips` |
| plasterkit, inbouwframe, inbouwdoos | `Drivers, trafo's en ballasten >> Montagemateriaal >> Plasterkits, inbouwframes, inbouwdozen` |
| beugel, ophanging voor wand/plafond | `Drivers, trafo's en ballasten >> Technische Accessoires >> Montage onderdelen voor wand/plafondarmaturen` |
| reserveonderdeel, spare part | `Drivers, trafo's en ballasten >> Technische Accessoires >> Reserve- vervangonderdelen` |
| vrachtkosten, transport | `Kosten >> Kosten >> Vrachtkosten` |

## Engelse en merkeigen termen die in de praktijk voorkomen

Deze lijst is niet bedacht maar geteld: het zijn de 45 meestvoorkomende categoriewaarden uit de
nachtrun van 11 aug 2026 (54.344 rijen met een ongeldige categorie, waarvan deze tabel 94 %
dekt). Ze komen deels uit de bronbestanden en deels uit eerdere verwerkingen — precies de
woorden waar je straks weer tegenaan loopt.

| wat je aantreft | pad |
|---|---|
| `Pendant`, `Pendant luminaire`, `Suspension lamps`, `System pendant luminaire` | `Binnenverlichting >> Hanglampen` |
| `Ceiling`, `Ceiling luminaire`, `Ceiling lamps` | `Binnenverlichting >> Plafondlampen` |
| `Wall`, `Wall lights`, `Wall lamps`, `Wall luminaire` | `Binnenverlichting >> Wandlampen` |
| `Recessed wall luminaire` (binnen) | `Binnenverlichting >> Wandlampen >> Inbouw Wandlamp` |
| `Floor`, `Floor lamps` | `Binnenverlichting >> Vloerlampen` |
| `Table`, `Table lamps` | `Binnenverlichting >> Tafellampen` |
| `Spots` | `Binnenverlichting >> Spot` |
| `Recessed ceiling downlight`, `Compact downlight` | `Binnenverlichting >> Downlighters >> Inbouw LED Downlighter` |
| `Ceiling-mounted downlight` | `Binnenverlichting >> Downlighters >> Opbouw LED Downlighter` |
| `Track System 48V` — armatuur | `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Spots` |
| `Track System 48V` — rail of component | `Binnenverlichting >> Rails, Tracks & Kabelsystemen >> 48V Track Componenten` |
| `Track System 230V` | idem met `230V` |
| `In-ground luminaire` | `Buitenverlichting >> Grond Inbouw Tuinverlichting >> grond inbouw` |
| `Bollard`, `Bollard head` | `Buitenverlichting >> Grond Opbouw Tuinverlichting >> bolderarmaturen` |
| `Pole-top luminaire` | `Buitenverlichting >> Grond Opbouw Tuinverlichting >> paaltoparmaturen` |
| `Luminaire pole`, mast | `Buitenverlichting >> Grond Opbouw Tuinverlichting >> Masten en toebehoren` |
| `Performance floodlight`, `Compact floodlight`, `Surface floodlight` | `Buitenverlichting >> Schijnwerpers / Projectors >> Schijnwerpers / projectors` |
| `Installation housing`, inbouwbehuizing | `Drivers, trafo's en ballasten >> Montagemateriaal >> Plasterkits, inbouwframes, inbouwdozen` |

**En de termen die je bewust LEEG laat**, met de rij naar "controleren" — ze klinken als een
categorie maar wijzen er geen aan:

| term | waarom niet |
|---|---|
| `Standalone Luminaire` (3.921 rijen) | zegt alleen dát het geen railarmatuur is, niet wát het is |
| `Ceiling and wall luminaire` (1.174) | twee categorieën tegelijk; welke geldt is een productvraag |
| `Profile System` (1.264) | inbouw, opbouw en gependeld zijn drie verschillende paden |
| `Accessory` / `Accessories` (858) | de taxonomie kent vijftien soorten accessoire |
| `Recessed luminaire`, `Recessed ceiling luminaire` (674) | downlight, spot of profiel — niet te bepalen |
| `Light building element` (149) | geen categorie, een bouwwijze |
| `Wall washer` (132) | kan een spot of een wandarmatuur zijn |

Dat is geen zwakte van de lijst maar het hele punt: 40 % van de rijen uit de vorige run droeg een
pad dat in productie niet bestaat, en de portal weigert dat niet. Leeg met een aantekening is
herstelbaar; een verzonnen pad is stille vervuiling.

## Twijfelgevallen die vaak terugkomen

- **Een onderdeel dat bij een armatuursoort hoort** (een canopy voor een hanglamp) krijgt het
  pad van het ónderdeel, niet dat van het armatuur waar het bij hoort.
- **Rail plus armatuur in één artikel**: het armatuur wint — kies het `… Track Spots`-pad,
  niet het `… Track Componenten`-pad van dezelfde spanning.
- **Binnen én buiten** verkocht: kies op de IP-waarde. IP44 of hoger mét een expliciete
  buitenvermelding is buiten; anders binnen.
- **Een familie waarvan alleen sommige varianten een typewoord dragen**: het typewoord van de
  familie geldt voor de hele familie, mits de basisnaam identiek is. Noteer dat als aanname.
- **Spanning onbekend bij railcomponenten**: er zijn aparte paden voor 12V, 24V, 48V en 230V.
  Staat de spanning nergens, gebruik dan niveau 2
  (`Binnenverlichting >> Rails, Tracks & Kabelsystemen`) in plaats van te gokken.
- **Een merk zonder enig typewoord** (RZB: 206 series zonder taxonomie): laat het veld leeg en
  meld dat als één regel in het rapport. Duizenden keren gokken is duurder dan één keer melden.
