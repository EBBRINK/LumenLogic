---
type: project
aliases: ["Lumenlogic podcast transcript", "De menselijke psychologie achter Lumenlogic"]
links: ["[[lumenlogic-briefing]]", "[[brink-licht]]"]
confidence: high
last_updated: 2026-06-24
---

# Lumenlogic podcast — transcript

> Transcriptie van de audio "De menselijke psychologie achter Lumenlogic" (audio-versie
> van de [[lumenlogic-briefing]]). Tijdcodes weggelaten: de opname is in twee delen
> aangeleverd, de tijden klopten niet maar de volgorde wel. Timo komt hier later op terug.
> Audio-bron: `raw/Lumenlogic-podcast-De-menselijke-psychologie-2026-06.m4a`.

## Deel 1

**Speaker 0:** Welkom bij deze nieuwe deepdive. Vandaag duiken we echt in een, nou ja, een heel specifieke en best wel vertrouwelijke bron.

**Speaker 1:** Ja, absoluut.

**Speaker 0:** We kijken namelijk naar een architectuur- en briefingdocument en dat is geschreven voor een softwareontwikkelaar genaamd Timo. En onze missie voor deze sessie is eigenlijk ontcijferen hoe je menselijke psychologie, snoeiharde commerciële belangen en een strikte duurzaamheidsmissie vertaalt naar, nou ja, duizenden regels code.

**Speaker 1:** En dat is echt een behoorlijke kluif. Het document draait om de bouw van Lumen Logic. Dat wordt een nieuw software-as-a-service platform voor de zakelijke verlichtingsmarkt. Ontwikkeld door Brink Nederland BV, in de markt ook bekend als Brink Licht. En belangrijk: Brink is een B Corp — een officieel gecertificeerde duurzaamheidsmissie. Ze zijn al 25 jaar distributeur van premium verlichting en bouwen nu een platform dat de data van zo'n 400 luxemerken en ruimweg 3 miljoen SKU's moet stroomlijnen.

**Speaker 0:** Oké, laten we dit uitpluizen. We hebben het over de bouw- en installatiewereld. In de B2B-sector weet je hoe onverbiddelijk dit soort markten zijn: keiharde marges, strakke deadlines, gigantische aanbestedingen. Hoe ontwerp je software die menselijk gedrag in die wereld stuurt? Mijn oog viel direct op de eerste pagina: Timo krijgt een keiharde, ononderhandelbare regel opgelegd.

**Speaker 1:** Ja, de anti-webshop-regel.

**Speaker 0:** Precies. Lumen Logic is nadrukkelijk geen webshop of e-commerce-platform. Waarom is die definitie zo belangrijk voor een catalogus van 3 miljoen producten?

**Speaker 1:** Het bestaansrecht van het platform hangt af van de medewerking van de premium merken — de absolute top in architecturale verlichting, zoals Flos of Artemide. Die floreren bij exclusiviteit en wantrouwen het traditionele e-commerce-model. Ze willen hun armaturen niet gereduceerd zien tot een plaatje naast een winkelwagentje of een publiek prijskaartje met korting erop. Dat devalueert het merk direct.

**Speaker 0:** Het is alsof je door een prijsvechter-supermarkt loopt en er ligt ineens een originele Picasso tussen de aanbiedingsbakken bij de kassa. Zelfs als het echt is, denk je dat het een goedkope reproductie is. De context maakt het product kapot.

**Speaker 1:** Spijker op de kop. Elke visuele associatie met een koopjesmarkt zorgt dat merken hun data terugtrekken. En zonder hun logo's en specificaties verliest de software z'n geloofwaardigheid bij architecten en installateurs. Daarom: een backend-architectuur met disclosure-tiers, oftewel zichtbaarheidsniveaus.

**Speaker 0:** Hoe werkt dat technisch? Hoe voorkom je dat prijzen op straat komen?

**Speaker 1:** Elk product staat op een van drie niveaus, afhankelijk van de toestemming van het merk. Tier 1 is volledige openheid: alle technische data en adviesprijzen. Tier 2 is restrictiever: specs zichtbaar, prijsvelden geblokkeerd, tenzij de gebruiker is ingelogd en gekoppeld aan een goedgekeurd bouwproject. Tier 3 is de wachtkamer: alleen merknaam en logo, de rest afgeschermd tot er een commercieel akkoord is.

**Speaker 0:** Maar dan een grote commerciële vraag: als het platform geen "koop nu"-knop bouwt en de helft van de prijzen afschermt, hoe verdienen ze dan geld? Zo'n platform bouwen kost een vermogen.

**Speaker 1:** Een tweefasenstrategie. Fase 1, het eerste half jaar, is puur gefocust op de installateur. Installatiebedrijven betalen abonnementskosten of per projectdossier. Voor hen een schijntje, want het bespaart uren opzoekwerk en foutieve calculaties. Dat is de eerste inkomstenstroom.

**Speaker 0:** Je pakt de markt via de achterdeur — je maakt de installateur afhankelijk van jouw superieure data.

**Speaker 1:** Exact. En in fase 2, als duizenden installateurs het dagelijks gebruiken, draait het verdienmodel naar de merken. Geen producten verkopen, maar geanonimiseerde data-inzichten. Brink kan naar Artemide stappen: "jullie nieuwe hanglamp werd 500 keer overwogen in bestekken, maar in 80% koos de installateur op het laatste moment een concurrent vanwege een betere montage-optie."

**Speaker 0:** Wauw. Die informatie is voor een productontwikkelaar goud waard — marktonderzoek op een presenteerblaadje.

**Speaker 1:** Zeker. Het platform is in de basis een gigantische observatiemachine.

**Speaker 0:** Maar om die data te verzamelen moet de installateur de software omarmen. En hier zet de briefing standaard softwareontwikkeling op z'n kop. Normaal bouw je één gelikt dashboard. Maar de briefing waarschuwt: "de installateur" als één persoon bestaat niet in de bouwwereld. Dat is een mythe.

**Speaker 1:** Klopt. Het projectdossier gaat door drie verschillende paar handen — een soort driekoppig wezen. Kop 1 is de calculator, helemaal aan het begin. Het bedrijf probeert een aanbesteding (tender) te winnen voor bijvoorbeeld een ziekenhuis.

**Speaker 0:** Die persoon is extreem risicomijdend. Nul ruimte voor creativiteit. Een architect heeft specifieke lampen geëist; stelt de calculator een goedkopere voor en oordeelt de jury "niet gelijkwaardig", dan ligt het bedrijf uit een miljoenencontract.

**Speaker 1:** Voor de calculator is Lumen Logic alleen een veiligheidsharnas. Dan: de deal is gewonnen, het project gegund. Het dossier verschuift naar persoon 2, de werkvoorbereider — een compleet ander mentaal model: value engineering.

**Speaker 0:** Wat doet die werkvoorbereider daar in de praktijk mee?

**Speaker 1:** Value engineering = hetzelfde resultaat met minder moeite of lagere kosten. Stel: 50 losse inbouwspots in een gang. De werkvoorbereider ziet in Lumen Logic een alternatief — een continu led-lijnsysteem, evenveel licht, maar de helft van de montagetijd. Hier is wél ruimte voor alternatieven.

**Speaker 0:** En dan gaat de map naar persoon 3, de projectleider — op de bouwplaats, met helm.

**Speaker 1:** Die wil geen verrassingen. Een digitaal armaturenboek: lamp A daar, kabel B hier. Een schone overdracht. De briefing eist dat Timo een interface bouwt die meebeweegt met deze drie behoeftes, in plaats van één scherm met honderd knoppen waarin de calculator verdwaalt en de projectleider verzuipt in tenderdata.

**Speaker 0:** Maar is dat niet foutgevoelig? Als calculator en werkvoorbereider andere data zien, valt het project in duigen.

**Speaker 1:** Scherp punt. De oplossing is de fase-bewuste engine — het hart van Lumen Logic. Eén database, één waarheid, maar het algoritme weet constant in welke fase het projectdossier zit en past zijn gedrag proactief aan.

## Deel 2

**Speaker 1:** Hier wordt het interessant, want zo wordt het B Corp-verhaal briljant geïntegreerd. Eén machinerie, twee standen.

**Speaker 0:** Stand 1: de tenderstand. De calculator werkt, het project is nog niet gewonnen. Veiligheid voorop. En Brink neemt een ongebruikelijke beslissing: in de tenderstand onderdrukt de software actief elke duurzaamheidssuggestie. De tool zwijgt over groene alternatieven.

**Speaker 1:** Wacht, serieus? Brink is een B Corp, duurzaamheid is hun ding. Verloochenen ze hun missie niet juist op het beslissende moment?

**Speaker 0:** Oppervlakkig wel. Maar het getuigt van diep marktbegrip. Zou de software in die stressfase zeggen "kies deze duurzame lamp in plaats van die uit het bestek", dan volgt de calculator dat onder tijdsdruk, beoordeelt de architect het als "niet gelijkwaardig", en verliest de installateur de miljoenenklus. Brink krijgt de schuld en raakt de klant kwijt. Kennis is pas waardevol als het veilig is om toe te passen.

**Speaker 1:** Metafoor: navigeren met Google Maps. Je bent te laat voor een sollicitatie, je wilt de snelste route. Als de app zegt "heeft u de langere milieuvriendelijke route overwogen?", gooi je je telefoon uit het raam. De timing is verkeerd.

**Speaker 0:** En op de terugweg, ontspannen, met alle tijd: als de app de groene toeristische route voorstelt, sta je daar wel voor open. De context bepaalt de acceptatie.

**Speaker 1:** Dat is de post-gunning-stand. Zodra "project gegund" is aangevinkt en de werkvoorbereider het dossier opent, ontwaakt de B Corp-engine. Dan komen de suggesties: "deze lamp kun je vervangen, langere garantie, lagere CO₂", inclusief een objectieve PDF om de eindklant te overtuigen.

**Speaker 0:** B2B-beïnvloeding op z'n best. Veel groene software faalt omdat ze de commerciële realiteit negeren en preken vanaf de zijlijn. Brink nestelt zich in de kern en introduceert duurzaamheid pas als de winstmarge niet meer in gevaar is. Gedrag verander je niet met moraliteit, maar door duurzaamheid het meest risicoloze alternatief te maken op het juiste moment.

**Speaker 1:** Maar om te overtuigen heb je waterdicht bewijs nodig — harde specificaties. Dat brengt ons bij de fundering: de data. De briefing noemt de Connecting the Dots PDL, een product data lake: een reservoir waar de ruwe data van die 430 merken in wordt gepompt (API's, PDF's, Excel-sheets).

**Speaker 0:** Maar de briefing is streng: die importlaag is "dom loodgieterswerk". Waar het om draait is het normaliseren van data en het afdwingen van een uniform dataschema.

**Speaker 1:** En dat schema moet vanaf dag één perfect zijn. Niet alleen technische velden — vanaf versie één ook garantie, verwachte levensduur en repareerbaarheid.

**Speaker 0:** Want je kunt niet later 430 merken bellen om voor 3 miljoen producten een nieuw veldje te vullen. Dat is onmogelijk.

**Speaker 1:** Operationele zelfmoord. En dan het data-rot-mechanisme — een slim detail over risicomanagement. In de meeste databases blijft een verlopen prijslijst zichtbaar tot iemand 'm bijwerkt: "beter oude info dan geen info."

**Speaker 0:** De standaard in de industrie.

**Speaker 1:** Maar Lumen Logic doet het tegenovergestelde: overschrijdt een prijslijst de geldigheidsdatum, dan verwijdert het algoritme het product onmiddellijk uit alle zoekresultaten. Het verdwijnt.

**Speaker 0:** Contra-intuïtief. Waarom opzettelijk gaten slaan?

**Speaker 1:** Het verandert de aard van de fout. Oude data is een onzichtbare fout: de calculator begroot erop, tekent, en twee maanden later blijken de prijzen gestegen — dat verdampt uit de marge. Een gat dwingt de calculator de telefoon te pakken voor een actuele dagprijs. Irritant, maar het beschermt de marge. Een gat is eerlijk, een foute prijs is fataal voor vertrouwen.

**Speaker 0:** En dat vertrouwen geldt ook richting de merken. Hoe zorg je dat Artemide niet boos belt omdat Flos boven hen staat?

**Speaker 1:** Hoe doen ze dat?

**Speaker 0:** Scoort een merk laag, dan zegt Brink: "wij tonen slechts de levensduur die jullie zelf hebben opgegeven." Je kunt niet ruziën met je eigen cijfers.

**Speaker 1:** Wat ons bij de indrukwekkendste regel brengt: de ijzeren regel. Geen backend-instelling, maar een harde architectuurregel: merkgeld mag de ranking nooit kantelen.

**Speaker 0:** We zijn gewend aan zoekmachines en boekingsplatforms waar de bovenste resultaten gesponsord zijn — iemand betaalt om je blikveld te manipuleren. Voor Lumen Logic zou dat de doodsklap zijn. Ontdekt een installateur dat een lamp wordt aangeraden omdat het merk betaalde, dan is de reputatie weg.

**Speaker 1:** En de geloofwaardigheid van de B Corp-certificering ligt op straat. Zodra betaling de duurzaamheidsvergelijking beïnvloedt, ben je een veredelde reclamezuil.

**Speaker 0:** Daarom moet de matching-logica strikt gescheiden zijn van de commerciële logica. De scheidsrechter blijft onomkoopbaar. Ranken gebeurt puur op feiten.

**Speaker 1:** Samenvattend: we openden een vertrouwelijk briefingdocument, verwachtten gortdroge API-koppelingen, maar het bleek een masterclass in het begrijpen van je klant. De driekoppige gebruiker, de fase-bewuste engine die pas over duurzaamheid begint als het veilig is, en de heiligheid van onafhankelijke data.

**Speaker 0:** Het laat zien hoe software gedrag kan sturen zonder belerend te zijn. De objectieve waarheid is vaak overtuigend genoeg.

**Speaker 1:** Eén laatste gedachte: hoe vaak sturen de tools die jij dagelijks gebruikt jouw beslissingen, simpelweg omdat iemand voor zichtbaarheid betaalde? Wat zou er in jouw industrie veranderen als software weer een eerlijke scheidsrechter werd?
