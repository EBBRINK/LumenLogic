// Deterministisch voorfilter: wélke geparste waarden verdienen een menselijke of agent-blik?
//
// De steekproef van 100 bestaat omdat een mens niet meer aankan — een menselijke grens, geen
// inhoudelijke. Wie die controle wil opschalen naar 30 merken en zeven velden, moet eerst weten
// wáár het mis kán gaan. Dit bestand is die lijst, uitgeschreven als toetsbare regels in plaats
// van als vermoeden.
//
// Het is bewust CONSERVATIEF in de andere richting dan de parser: de parser laat liever een veld
// leeg dan dat hij gokt; dit filter vlagt liever te veel dan te weinig. Een vlag is geen oordeel
// ("deze waarde is fout") maar een verdenking ("hier kan de naam meer dan één lezing hebben").
//
// Puur: geen database, geen I/O — zodat elke regel een test kan hebben en het filter op elke
// schaal draait.

import {
  FIELDS,
  NIET_DIMBAAR,
  beamKandidaten,
  criKandidaten,
  kelvinKandidaten,
  lumenKandidaten,
  wattKandidaten,
  type ParsedSpecs,
} from "./parser";

export type Veld = (typeof FIELDS)[number];

export type Verdenking = {
  veld: Veld;
  soort: string; // korte sleutel, bv. 'meerdere-tokens'
  uitleg: string; // wat er aan de hand is, in gewone taal
};

// ── Globale varianten van de parser-patronen ────────────────────────────────
// De parser neemt per veld de EERSTE match; hier tellen we álle voorkomens, want een tweede
// kandidaat in dezelfde naam is precies de reden om te twijfelen aan de eerste.
// Alleen `ip` staat hier nog. De andere zes velden tellen hun kandidaten sinds 11 aug via de
// PARSER (zie `viaParser` verderop) in plaats van via een eigen regex hier — anders oordelen
// twee lagen onafhankelijk over hetzelfde teken, en dat is de fout waar dit hele bestand
// omheen gebouwd is. De losse kopieën zijn daarom weggehaald in plaats van blijven staan als
// tweede waarheid.
const G = {
  ip: /\bIP\s*:?\s*(\d{2})\b/gi,
};

function alleMatches(naam: string, re: RegExp): string[] {
  return [...naam.matchAll(new RegExp(re.source, re.flags))].map((m) => m[1]);
}

// Meerdere verschillende waarden voor hetzelfde veld = de parser koos er willekeurig één.
// Twee keer dezelfde waarde is géén probleem (herhaling van hetzelfde feit).
function meerdereWaarden(naam: string, re: RegExp): string[] | null {
  const uniek = [...new Set(alleMatches(naam, re).map((v) => v.replace(",", ".")))];
  return uniek.length > 1 ? uniek : null;
}

// ── Bekende, benoemde faalvormen ────────────────────────────────────────────

// Kelvin over een bereik of een keuze: "2700-6500K" (tunable white), "3000/4000K" en
// "2700K/3000K" (schakelbaar). De parser pakt hier de LAATSTE van de twee — het getal vóór het
// scheidingsteken wordt in de eerste vorm niet door K gevolgd — maar wélke waarde "de"
// kleurtemperatuur is, is geen parseervraag maar een productvraag.
//
// ── Waarom de schuine streep er 31 jul bij kwam ─────────────────────────────
// Timo zag het met het oog in het reviewscherm: `Oja 29 | 3000/4000K | 3-Step | Ceiling light`
// kreeg kelvin 4000 en géén enkele vlag, terwijl `… TW 2700K-6500K …` wél werd onderdrukt.
// Het verschil was het scheidingsteken, niet het product. Twee vormen komen aantoonbaar voor:
//
//     3000/4000K    getal / getal+K    23 producten, alle Nordlux
//     2700K/3000K   getal+K / getal+K  27 producten, alle Wever & Ducré
//
// Daarom is `K` op het eerste getal optioneel geworden en staat `/` in de tekenklasse. Bewust
// NIET de komma: een regex daarop gaf 64 Kreon-treffers, maar die matchten `1200-1650, 2700K` —
// een lengtemaat, een komma, en dán de enige kelvin. Kreon heeft dit probleem niet.
// Een toeslagregel is geen product maar een prijsopslag, en de getallen erin verwijzen naar een
// ÁNDER artikel: `Meerprijs Casambi Bluetooth control (Enkel voor de 37 Watt)` kreeg maxWattage
// 37, terwijl die 37 W het armatuur is waarvóór de toeslag geldt.
//
// Gemeten (31 jul, testkopie): 151 namen dragen een toeslagwoord, allemaal CLS, en precies ÉÉN
// daarvan levert überhaupt een geparste waarde op — die ene. De regel kost dus geen enkele goede
// waarde. Dat is meteen zijn beperking: hij is gemeten op één merk en één geval, dus hij bewijst
// niets over leveranciers die deze woorden anders gebruiken.
const TOESLAGREGEL = /\b(?:meerprijs|toeslag|surcharge|supplement|aufpreis)\b/i;

// ── De drie-punts-notatie, na de nachtrun van 11 aug 2026 ───────────────────
// RZB schrijft bereiken met drie punten in plaats van een streepje: `SIDELITE ECO, 29...38 W,
// 3400...4300 lm, 830, wit, DALI`. Het wattage werd daar netjes onderdrukt (twee kandidaten →
// meerdere-waarden), maar de LUMEN had helemaal geen bereiktoets en werd stil platgeslagen tot
// de bovengrens 4300 — een waarde die het armatuur alleen in zijn zwaarste uitvoering haalt.
//
// Vandaar twee wijzigingen: `...` en `…` als scheidingsteken erbij, en een bereiktoets voor
// lumen die er nog niet was. De komma blijft er bewust buiten, om dezelfde reden als bij kelvin
// hierboven: die zit in maatvoering ("1200-1650, 2700K") en zou daar vals vuren.
//
// LET OP bij het lezen: het streepje en de schuine streep zitten hier alleen omdat `KELVIN_BEREIK`
// ze vóór 11 aug al had — dat is bestaand gedrag, geen gemeten keuze. Ze kostten ook iets: een
// diameter vóór een kelvin werd als ondergrens gelezen (`Easy Ø 163 - 4000K …`). Dat is niet
// opgelost door het streepje te schrappen maar door `isKelvinBereik()` hieronder, die eist dat
// het eerste getal zélf een plausibele kelvin is. Voor WATT is het streepje juist wél geschrapt,
// want daar bleek geen equivalente toets mogelijk — zie WATT_BEREIK verderop.
const BEREIK_SCHEIDING = String.raw`(?:\.{3}|…|[-–]|\/)`;
const KELVIN_BEREIK = new RegExp(
  String.raw`(\d{3,5})\s*(K)?\s*${BEREIK_SCHEIDING}\s*(\d{3,5})\s*K\b`,
  "gi",
);

// ── Wanneer is "<getal> - <getal>K" écht een bereik? (11 aug 2026) ───────────
// De K op het EERSTE getal is optioneel, en dat moet ook: Nordlux schrijft `3000/4000K` (23
// producten) en tunable white heet gewoon `2700-6500K`. Maar diezelfde optionaliteit leest een
// MAAT vóór een kelvin als ondergrens. Gemeten over de 134.907 nachtrun-namen: van de 812
// kelvin-bereikvlaggen zijn er 748 van deze vorm bij iGuzzini —
//
//     Easy Ø 163 - 4000K - CRI80 - UGR<19 10.3W 1335lm - 4000K - DALI-2
//
// waar 163 de diameter is en 4000 K de énige kleurtemperatuur (hij staat verderop nog eens).
// Die rijen verloren hun kelvin volledig, want `bereik` onderdrukt.
//
// Het onderscheid is meetbaar in plaats van semantisch: draagt het eerste getal zelf een K
// (`2700K/3000K`), dan zijn het twee kleurtemperaturen. Draagt het er geen, dan is het alleen
// een bereik als dat eerste getal zélf een plausibele kelvin is. 163 is dat niet, 2700 wel —
// dus `2700-6500K` blijft gevlagd en `Ø 163 - 4000K` niet.
//
// ── De ondergrens is 1500 en niet 2000, en dat is een gemeten correctie ─────
// Met 2000 (de band die `parseKelvin` voor WAARDEN gebruikt) sloeg deze functie 701 Modular-rijen
// om van "bereik" naar "gewoon 3000 K":
//
//     M-LED Module 50 1x LED 1800-3000K WD Spot DE Aluminium Brushed Anodised
//
// Dat is dim-to-warm — `WD` staat voor warm dim — en 1800 K is daar de onderkant. De TUNABLE-
// regel hieronder kent `WD` niet, dus deze bereiktoets is het enige vangnet voor die rijen. Voor
// het HERKENNEN van een bereik mag de band dus ruimer zijn dan voor het accepteren van een
// waarde: vlaggen is de veilige kant.
const KELVIN_BEREIK_ONDERGRENS = 1500;

function isKelvinBereik(naam: string): boolean {
  const re = new RegExp(KELVIN_BEREIK.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(naam)) !== null) {
    if (m[2]) return true; // beide getallen dragen een K
    const eerste = parseInt(m[1], 10);
    if (eerste >= KELVIN_BEREIK_ONDERGRENS && eerste <= 8000) return true;
  }
  return false;
}
// De tweede waarde MOET door lm/lumen gevolgd worden; anders zou elke lengtemaat vóór een
// lumenopgave ("RAIL 1200-1650 mm 2000 lm") als lumenbereik tellen.
const LUMEN_BEREIK = new RegExp(
  String.raw`\d{2,6}\s*(?:lm|lumen)?\s*${BEREIK_SCHEIDING}\s*\d{2,6}\s*(?:lm|lumen)\b`,
  "i",
);
// Watt kent hetzelfde probleem, maar één trap subtieler: bij `29...38 W` volgt alleen ná de 38
// een W, dus `wattKandidaten` ziet er precies ÉÉN en `meerdere-waarden` zwijgt. De bovengrens
// landde daardoor stil als vermogen.
//
// ── Waarom hier ALLEEN de drie punten staan en géén streepje ────────────────
// Gemeten op het deelcorpus van 83.117 namen (iGuzzini + Vibia) vóór het bouwen: dezelfde regel als hieronder maar
// mét `[-–]` in de scheidingsklasse sloopte 433 GOEDE wattages bij iGuzzini, want die schrijft
// zijn velden met streepjes aan elkaar en zet de lengte vóór het vermogen:
//
//     Superrail … UGR<19 - L=1372 - 11W 1428lm - 3000K - CRI 90
//
// Daar is 11 W gewoon het juiste vermogen en is `1372 - 11W` geen bereik maar een veldscheiding.
// Nul echte bereiken stonden daar tegenover. De schuine streep valt om een andere gemeten reden
// af: `6/9W` is bij Wever & Ducré een tweede uitvoering waarvan 9 W de juiste waarde is (zie
// WATT_PER_BRON in parser.ts).
//
// Lumen mág het streepje wél hebben: daar kostte dezelfde meting 0 goede waarden, en de
// woordenschat documenteert `3400-4300 lm` als echte bereikvorm. Asymmetrie die gemeten is,
// niet gekozen.
const WATT_BEREIK = /\d+(?:[.,]\d+)?\s*W?\s*(?:\.{3}|…)\s*\d+(?:[.,]\d+)?\s*W\b/i;
// ── De PLUS-notatie: twee lichtmotoren, geen totaal (12 aug 2026) ───────────
// Intra Lighting schrijft direct/indirect als `4000+1100 lm 44+15 W`: de armatuur heeft twee
// lichtmotoren en het bestand noemt hun waarden apart. De parser las daar stil de TWEEDE waarde
// (15 W, 1100 lm) en gaf géén verdenking — de armatuur is in werkelijkheid 59 W / 5100 lm, dus
// de afgegeven waarde was ruim een factor drie te laag. 238.602 rijen bij dat ene merk.
//
// Dit is dezelfde familie als de up/down- en per-spot-wattages uit de woordenschat: de spec geldt
// per element en het totaal staat er niet. Optellen zou een productbesluit zijn (zijn het twee
// motoren in één armatuur, of een set?), dus de waarde gaat naar "controleren".
//
// De lookbehind weert modelcodes: in `T5+ 14W` staat een LETTER vóór het eerste getal, en dat is
// geen deelwaarde maar een typenaam. In `4000+1100` staat er een spatie of niets.
const DEELWAARDEN_WATT =
  /(?<![A-Za-z])\d+(?:[.,]\d+)?\s*\+\s*\d+(?:[.,]\d+)?\s*W\b/i;
const DEELWAARDEN_LUMEN =
  /(?<![A-Za-z])\d+\s*\+\s*\d+\s*(?:lm|lumen)\b/i;

const TUNABLE = /\b(?:TW|TUNABLE|DIM\s*TO\s*WARM|D2W|DTW)\b/i;

// Bundelhoek versus kantelhoek: een "30°" naast een kantelwoord is waarschijnlijk niet de bundel.
const KANTEL = /\b(?:TILT|KANTEL|ADJ(?:USTABLE)?|SWIVEL|ROTAT\w*)\b/i;

// Bundelhoek versus MEETKUNDIGE hoek. Een koppelstuk, bocht of hoekprofiel draagt de hoek van
// het stuk zelf — daar komt geen licht uit. Skill-lokaal erbij op 12 aug 2026, na zeven merken
// in één nachtrun die deze waarde allemaal met de hand terugdraaiden: Trizo21 188 rijen
// (`120°/90° connector`), Lumiparts 32 (`L-joint 90°`, `Bocht 90°`), prolicht 25 (`90° corner
// connector`), Moooi 8 (`bend 90°/135°`), nuudo 6, Oligo 1 (`V-KUPPLUNG/…/60°`) en Molto Luce
// (`VERBINDER 90°`). Zelfde familie als `Ta 50°` en `360°`: een gradenteken dat niets met de
// bundel te maken heeft.
//
// Onderdrukkend, want de waarde is aantoonbaar fout — niet onzeker. Dat `CORNER` bij deze
// namen een hoek aanduidt en geen spec, was al vastgesteld in parser.ts (Artemide's
// "A.24 C 90° CORNER", 101 namen, daar tegen CRI afgeschermd); dit trekt dezelfde vondst door
// naar beamAngle. `ANGLE` staat er bewust NIET als los woord in — "beam angle 24°" is juist wél
// de bundel; alleen de stuknamen tellen.
const GEOMETRIEHOEK =
  /\b(?:CORNER|ELBOW|BEND|BOCHT|JOINT|KUPPLUNG|VERBINDER|CONNECTOR|COUPLER|HOEKSTUK|HOEKPROFIEL)\b/i;
const HOEK_BEREIK = /\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:°|deg\b)/i;

// Dimbaarheid is het enige veld met een ONTKENNING die de parser niet zag: "NON-DIM" bevat
// het token DIM, en /\bDIM\b/ matcht dat (het streepje is een woordgrens).
//
// Sinds 30 jul onderdrukt `parseDimmable` het veld zélf bij een ontkenning, dus deze vlag hoort
// in de praktijk niet meer te vuren. De regel blijft staan als REGRESSIETOETS: gaat de parser
// ooit weer voorstellen op een ontkennende naam, dan ziet meet-verdenking.ts dat meteen. NIET_DIMBAAR
// komt daarom uit parser.ts (zie de import bovenaan) — twee kopieën zouden ongemerkt uiteenlopen
// en dan zou de wachter de wacht niet meer kunnen houden.
// CASAMBI en trailing/leading edge staan er sinds 11 aug bij, gelijk met parseDimmable: telt de
// parser een protocol wél en deze lijst niet, dan blijft "meerdere-protocollen" stil bij precies
// de namen waar de keuze het lastigst is (bv. "CASAMBI (DALI)").
//
// Kosten gemeten op het deelcorpus van 83.117 namen (iGuzzini + Vibia): 3.258 namen droegen al meer dan één protocol,
// met CASAMBI erbij worden dat er 3.600 — 342 extra, waarvan 1.042 de combinatie DALI+CASAMBI.
// Die vlag is terecht: `dim_protocol` houdt maar één waarde vast terwijl het product er twee
// kan, dus zo'n rij verdient een blik.
//
// PWM en PUSH staan hier bewust NIET bij, hoewel parseDimmable ze wél kent: PUSH staat bij Vibia
// structureel naast 1-10V (15.071 namen). Dat is één product met twee bedieningswijzen, geen
// tegenstrijdigheid — ze meetellen zou 15.000 rijen ruis op "controleren" zetten.
const DIM_PROTOCOLLEN = [
  /\bDALI\b/i,
  /\bTRIAC\b/i,
  /\b(?:PHASE|MAINS\s*DIM|(?:TRAILING|LEADING)\s*EDGE)\b/i,
  /\b[01]\s*-\s*10\s*V\b/i,
  /\bCASAMBI\b/i,
];

// Getallen die bij een bijgeleverd of uitgesloten onderdeel horen in plaats van bij het armatuur.
const ACCESSOIRE = /\b(?:EXCL|INCL|SPARE|ACCESS\w*|DRIVER|CONVERTER|TRAFO|ADAPTER|BRACKET)\b/i;

// ── Het product IS zelf een onderdeel (30 jul, na de zwerm op Flos) ──────────
// Verschil met ACCESSOIRE hierboven, en dat verschil is het hele punt: die regel matcht overal
// in de naam en vlagt daarmee 3.700 GEWONE armaturen die netjes vermelden dat hun driver
// meegeleverd is ("Esprit floor, driver incl., carrara"). Deze regel is verankerd aan het BEGIN
// van de naam en raakt 453 producten die werkelijk een los onderdeel zijn. Eén anker in plaats
// van een woordenlijst die per merk blijft groeien.
//
// De zwerm vond deze vormen op Flos Architectural en ze zijn alle drie meertalig:
//   POW.SUPPLY SURF. 96W BK END ZEROTRACK PR   railvoeding (18 cellen)
//   ALIM.LED / ALIMENT.LED / ALIMT.LED         alimentatore, Italiaans voor voeding (17 cellen)
//   REMOTE KIT … GLOWING TR                    trafo-set (8 cellen)
//   EQUIPO DC 20W 500mA                        Spaans voor apparaat/voeding (2 cellen)
//   TRANS ELEC.LED-17W / TRANSF ALED-8W        transformator (2 cellen)
//
// Waarom ALLE velden zwijgen en niet alleen het vermogen: zo'n doos bezít werkelijk een
// IP-klasse, een vermogen en een dimprotocol. `POWER SUPPLY BOX IP67 24V 50W TRIAC` levert
// ipValue IP67, maxWattage 50 én dimmable TRIAC — alledrie waar over de doos en alledrie
// onwaar over een armatuur. Gemeten aandeel per veld op échte onderdelen: ipValue 78 van 1.456
// landend (5,4 %), dimmable 144, maxWattage 231, en kelvin/cri/beamAngle exact NUL. Het is dus
// eerder een ip- en dimbaarheidsprobleem dan een wattageprobleem.
//
// Merken met echte onderdelen: Wever & Ducré 197 · Flos Architectural 110 · Lombardo 82 ·
// TossB 38 · Marset 21.
const ONDERDEEL_START =
  // Skill-lokale toevoeging bovenop parserversie 9786dc5: POWER\s+KIT (Artemide's
  // 'A.24 C POWER KIT 150W' begint er in de praktijk niet altijd mee — zie ook de
  // woordenschat: onderdelen midden in een naam horen in de chat-steekproef).
  /^\s*(?:LED\s+)?(?:POWER\s+KIT|POW(?:ER)?\.?\s*SUPPLY|ALIM(?:ENT|T)?\.?\s*LED|ALIMENTATOR\w*|ALIMENTATORE|DRIVER|CONVERTER|TRAFO|TRANSF?(?:ORMATOR|ORMER)?\b|NETZTEIL|EQUIPO|REMOTE\s+KIT|VOEDING|POWER\s+FEED)/i;

// ── Twee categorieën die het anker miste, gevonden door de zwerm op W&D ─────
// Allebei vooraf gemeten op valse positieven, want allebei is het kale woord te grof.
//
// LOSSE VERVANGLAMP. `^LAMP` alleen mag NIET: 124 namen beginnen ermee en Egoluce's
// `LAMP. SOSP. GIOVE`, `LAMP. PAR. VELA`, `LAMP. TAVOLO ALBA` zijn Italiaanse armatuurtypes
// (sospensione = hang, parete = wand, tavolo = tafel), net als Artemide's `LAMPADA ESAGONALE`
// en Valerie's `LAMP SHADE`. Een losse lamp noemt daarentegen altijd zijn FITTING of lamptype.
// Die extra eis scheidt ze schoon: 91 producten (W&D 50, Egoluce 38, Lombardo 3) met 153
// landende veldvullingen, en geen enkele armatuurnaam erbij. Nagekeken op alle 124.
//
// DRIVER MET TYPECODE. `DRIVER` ergens in de naam mag óók niet: Kreon heeft 1.806 namen met
// "driver incl." die gewone armaturen zijn, en TossB/Estiluz hebben 1.161 "Driver Base"-namen
// die een eigen beoordeling verdienen (409 landende wattages — dat is een aparte ronde waard,
// geen regel die je er even bij doet). Wél ondubbelzinnig is de vorm die de zwerm aanwees:
// `… TRACK DRIVER D4 100W`, waar DRIVER door een typecode wordt gevolgd. 73 namen, alle W&D,
// alle 73 met een landend wattage dat het driververmogen is.
const LOSSE_LAMP =
  /^\s*LAMP/i;
const LAMP_FITTING =
  /\b(?:E27|E14|E40|B15D|G4|G9|G13|GX53|GU10|GU5\.3|R7S|QT14|S14d?|T5|T8|PAR\d\d|A6\d|C35|ST64|T30)\b/i;
const DRIVER_TYPECODE = /\bDRIVER\s+D\d\b/i;

// ── Losse kap, reflector of plug met de lampbelasting van het armatuur eronder ─
// "RAY INNER COVER A max. 10W" is een binnenkap; die 10W hoort bij het armatuur waar hij in
// gaat. De zwerm wees 21 van deze cellen aan.
//
// De COMBINATIE doet het werk, niet de term. `SHADE` alleen is een valstrik: "ROOMOR WALL SURF
// 1.0 PAR16 B NO SHADE max. 15W GU10" is een écht armatuur, en dat zijn er 31. Die dragen een
// FITTING, en bij een armatuur mét fitting is "max. 15W" juist de geldige lampbelasting.
// Gemeten: 44 namen met "max. <n>W" zonder fitting-token, waarvan 39 door deze termen gedekt.
// Twee klassen, want ze verdragen de fitting-uitzondering verschillend.
//
// ONDUBBELZINNIG: "INNER COVER" en "INNER REFLECTOR" zijn per definitie een los inzetstuk. De
// fitting die er soms bij staat is de lámp waarvoor het stuk bedoeld is, niet een fitting op
// dit product — "BOX MINI PAR16 INNER REFLECTOR B max. 10W" is een reflector vóór een PAR16,
// geen armatuur mét PAR16. Die kregen door de fitting-uitzondering ten onrechte GEEN vlag; de
// zwerm wees ze aan (5 cellen) en ze zijn met 60 producten / 46 landende wattages klein maar
// echt.
const ACCESSOIRE_ALTIJD = /\bINNER\s+(?:COVER|REFLECTOR)\b/i;
// DUBBELZINNIG: `SHADE` staat óók in "ROOMOR WALL SURF 1.0 PAR16 B NO SHADE max. 15W GU10" —
// 31 échte armaturen. Daar is de fitting-uitzondering juist nodig.
const ACCESSOIRE_MAXW = /\b(?:SHADE|LED\s+PLUG|COVER\s+RING)\b/i;
const MAX_WATT = /\bmax\.?\s*\d+(?:[.,]\d+)?\s*W\b/i;
const LAMP_FITTING_BREED =
  /\b(?:E27|E14|E40|B15D|G4|G9|G13|GX53|GX5\.3|GU10|GU5\.3|GZ10|R7S|QT14|QT-14|S14d?|T5|T8|PAR\d\d|MR\d\d|A6\d|G9\d|QR-CBC\d*|C35|ST64)\b/i;

// Besturingsapparatuur die met zijn eigen soortnaam begint. `DIMMER` staat in 20 namen over zes
// merken en levert maar 2 landende wattages op — klein, maar het is per definitie de
// SCHAKELLAST en nooit het vermogen van een armatuur.
//
// `WIRELESS … CONTROL` staat erbij na de derde zwermronde: "STREX WIRELESS CASAMBI CONTROL B 8W"
// is een draadloze besturingsmodule. Gemeten 48 namen, 4 met een landend wattage, alle vier W&D.
// Het KALE woord CONTROL mag niet: dat raakt 128 namen waaronder TossB's "ROUND CONTROL MINI Arm
// 550mm - 6W LED 2700K", en dat is gewoon een armatuur.
const BESTURING = /^\s*DIMMER\b|\bDALI\s+SELV\s+DEVICE\b|\bWIRELESS\b[^|]*\bCONTROL\b|\bDIMMING\s+MODULE\b/i;

// ── Railadapter, connectorset, voedingsstekker en lader ─────────────────────
// Alle drie klein en alle drie door de derde zwermronde aangewezen.
//
// `TRACK ADAPTER` mag NIET kaal, en dit is de scherpste valstrik van de dag: 214 namen bevatten
// het, maar 192 daarvan zijn XAL-ARMATUREN waar het een montage-optie aan het EIND is
// ("SIVERA 25 AC LOUVER … DALI 10,7W LED 3000K 220-240V TRACK ADAPTER"). Bij de 22 Wever &
// Ducré-adapters staat het middenin, gevolgd door varianten ("1-PHASE TRACK ADAPTER 1.0 B for
// suspended luminaires", "… STREX TRACK ADAPTER DALI-2 2700K B"). De positie scheidt ze
// volledig: 22 tegen 192, geen overlap. Een adapter heeft trouwens geen kleurtemperatuur — die
// 2700K is een variantcode voor het armatuur waar hij onder hangt.
const RAILADAPTER = /\bTRACK\s+ADAPTER\b(?!\s*$)/i;
// 12 producten, 2 landende wattages. XAL's "SOUNDCATCHER SYS CONNECTOR SET OF TWO CONNECTORS"
// en W&D's "CONNECTOR SET MR16 GU5.3 max. 12W" zijn allebei een aansluitset; die 12W hoort bij
// de lamp die erin gaat.
const CONNECTORSET = /\bCONNECTOR\s+SET\b/i;
// 8 producten (Marset 4, W&D 4): "USB CHARGER + EU PLUG BLACK", "FLEXFY DC POWER PLUG 100W".
const VOEDINGSSTEKKER = /\b(?:POWER\s+PLUG|USB\s+CHARGER)\b/i;

// Twee termen mogen ÓÓK verderop in de naam staan, en dat is geen verzwakking van het anker
// maar een gemeten uitzondering. "POWER SUPPLY" en "SURF. POWER" zijn samenstellingen die niet
// in een armatuurnaam voorkomen tenzij het product er een IS — anders dan het kale woord
// "POWER", dat wél gewoon in armatuurnamen staat ("BON JOUR 45 BLACK POWER LED",
// "A.24 C POWER KIT…") en dat hier dus bewust ontbreekt.
//
// Aanleiding: de zwerm vond `BELT SURF. POWER 96W 48V BLACK`, de opbouwvoeding van het
// 48 V BELT-railsysteem. Die begint met de productfamilie, niet met een onderdeelwoord, dus het
// anker miste hem. Gemeten vóór het bouwen: deze uitzondering vangt precies ÉÉN extra product
// in de hele catalogus en raakt geen enkele naam met een kaal "POWER". Eén meting, geen gok.
const ONDERDEEL_STERK = /\b(?:POW(?:ER)?\.?\s*SUPPLY|SURF\.?\s*POWER|POWER\s+FEED)\b/i;

// ── "Integrated power supply" is een SPEC, geen product (11 aug 2026) ────────
// De regel hierboven werd op Flos gemeten, waar hij precies één extra product ving. Op iGuzzini
// houdt die meting geen stand: dat merk zet de voeding als spec-fragment in gewone armatuurnamen.
//
//   Lingotto Floodlight with arm and swivel joint – Warm White – Integrated power supply
//   - 28.6W 2960lm - 2200K - DALI-2 - Colour: White
//
// Omdat `product-is-onderdeel` ALLE velden onderdrukt, kostte dat de watt, lumen, kelvin én het
// dimprotocol van een volwaardig armatuur. Gemeten over de 134.907 nachtrun-namen: 4.666 namen
// dragen de term, en de scheiding is scherp:
//
//   4.291  een kwalificatie ervóór (Integrated / remote / DALI dimmable / constant current /
//          without / with) — het armatuur HÉÉFT een voeding; vlag hoort niet te vuren
//     375  geen kwalificatie ("Power supply unit", "Power Feed and…", "base for power supply")
//          — het product IS een voeding of een onderdeel ervan; vlag blijft
//
// `for` staat bewust NIET in de lijst: "base for power supply" is wél een onderdeel.
const POWER_SUPPLY_ALS_SPEC =
  /\b(?:integrated|incorporated|remote|external|built[-\s]?in|electronic|dimmable|constant\s+(?:current|voltage)|without|with|DALI|non[-\s]?dim\w*)\b[\s\w.,/-]{0,18}$/i;

// Is de "power supply"-treffer een productsoort, of alleen een spec van een armatuur?
function isOnderdeelSterk(naam: string): boolean {
  const m = ONDERDEEL_STERK.exec(naam);
  if (!m) return false;
  return !POWER_SUPPLY_ALS_SPEC.test(naam.slice(Math.max(0, m.index - 40), m.index));
}

// ── Onderdeelwoorden MIDDEN in de naam (nachtrun 11 aug 2026) ───────────────
// `ONDERDEEL_START` is verankerd aan het begin van de naam, en dat anker is bewust gekozen: het
// kale woord midden in een naam vlagt duizenden gewone armaturen. De keerzijde stond al in de
// woordenschat en werd deze run drie keer echt geraakt — `A.24 C POWER KIT 150W` (Artemide),
// `Smart Surface … Controller` en `Dim Module` (Modular, 3 rijen), `SURF.ELECT.CONN.TRACK 48W`
// (Vibia, 148 rijen). De skill ving dat normaal met de chat-steekproef; in een autonome run is
// er geen mens die het opmerkt.
//
// De lijst mijdt daarom de losse woorden waarvan gemeten is dat ze in armatuurnamen staan —
// POWER, TRACK en DRIVER (Kreon alleen al 1.806 namen met "driver incl."). Wat overblijft zijn
// woordcombinaties plus vier soortnamen die op zichzelf al een onderdeel aanduiden.
//
// CANOPY is er na een meting weer UIT gehaald: `parser.ts` noemt zelf `GINGER A XL42 W.CANOPY
// OAK` als een gewoon Marset-armatuur, en de vorm komt in het deelcorpus van 83.117 namen (iGuzzini + Vibia) 0 keer voor —
// een regel die niets vangt en een bekend tegenvoorbeeld raakt, hoort er niet te staan.
// CONNECTOR SET is er ook uit: die valt al onder CONNECTORSET hieronder, en dubbel dekken
// betekent dat twee regels over hetzelfde teken oordelen.
//
// Gemeten treffers op datzelfde deelcorpus: CONTROLLER 10 (iGuzzini DMX/KNX-besturingskasten,
// alle tien terecht). De overige leden vuren daar niet — ze komen uit Modular en Artemide, die
// niet in dit corpus zitten; hun bewijs staat in de nachtrun-notities.
//
// De vlag is NIET-ONDERDRUKKEND: hij staat niet in ONDERDRUKKENDE_VERDENKINGEN, dus de waarde
// wordt gewoon afgegeven én de rij komt op "controleren". Onderdelen mogen hun eigen specs
// dragen (staande lijn van Timo) — ze moeten alleen zichtbaar zijn.
const ONDERDEEL_MIDDEN =
  /\b(?:POWER\s+KIT|CONTROLLER|DIM(?:MING)?\s+MODULE|CONN(?:ECTOR)?\.?\s*(?:TRACK|KIT)|END\s+CAP|COUPLER|JOINER)\b/i;

// ── Wattage dat VASTGEPLAKT aan een woord staat ─────────────────────────────
// Het Componi75W-patroon uit de woordenschat: `Componi75W` en `Componi200W` zijn modelnamen
// (bewijs: het zustermodel heet `Componi75-200`), maar `F13W` is wél een T5-buis van 13 W.
// Dezelfde vorm, tegengestelde betekenis — dus dit is per definitie geen parseervraag maar een
// productvraag, en de parser hoort hem niet stilzwijgend te beslechten.
//
// De woordenschat schrijft daarom voor dat zulke wattages in de chat-steekproef horen. Deze vlag
// is de autonome tegenhanger en is WÉL onderdrukkend (zie parse-namen.ts): draait er geen mens
// mee, dan is "liever leeg dan een gok" de enige lijn die overblijft — de waarde gaat naar
// "controleren" in plaats van de datakolom. Luceplan leverde er 37 in één lijst.
//
// Gemeten op het deelcorpus van 83.117 namen (iGuzzini + Vibia): 0 treffers. Deze regel is dus alleen gedekt door de
// unit-tests en door Luceplan's lijst, niet door dit corpus — de vorm komt uit merken die hier
// niet in zitten. Dat is de reden dat hij smal is: een letter, dan cijfers, dan een VASTE W.
const VASTGEPLAKT_WATT = /[A-Za-z]\d+(?:[.,]\d+)?W\b/;

// Een naam die halverwege ophoudt. Twee signalen: eindigen op een los koppel-/scheidingsteken,
// of op een LOSSE eenheid-aanduiding die zonder getal betekenisloos is ("… 3000" gevolgd door
// niets, of een kale "CRI" aan het eind).
//
// Bewust NIET in deze lijst: DALI en LED. Die zijn complete woorden en staan in duizenden
// XAL-namen legitiem aan het eind ("… 10,2W cob LED 2700K 220-240V DALI"). Ze meenemen vlagde
// bij de eerste testronde elke normale naam als afgekapt — een filter dat alles verdenkt,
// selecteert niets.
const AFGEKAPT = /(?:[-–/,]\s*$)|(?:\b(?:CRI|IP|LM|KELVIN)\s*$)|(?:\s\d+[.,]?\d*\s*$)/i;

// ── Een AFMETING aan het eind is geen afgekapte naam (11 aug 2026) ──────────
// De derde tak hierboven (`\s\d+$`, "de naam eindigt op een kaal getal") is bedoeld voor een
// kelvin die vóór de K is afgesneden. Bij een merk dat zijn maten áchteraan zet, sloopt hij
// alles. Gemeten over de 134.907 nachtrun-namen van tien merken:
//
//   9.406 rijen verliezen hun parserwaarden UITSLUITEND door `afgekapt` — 23.262 veldwaarden
//   9.242 van die rijen eindigen op een maat met label, samen 22.780 van die 23.262 waarden
//
// Het zijn er bij RZB 9.093, en de namen zijn aantoonbaar compleet:
//
//     COMFORT LINER SLIM, 13 W, 1050 lm, 840, wit, DALI Plafondarmaturen, D 255 H 34
//
// Daar is `H 34` de hoogte in mm, het laatste veld van een gestructureerde omschrijving. De
// watt, lumen en DALI die er dertig tekens eerder staan, zijn gewoon waar.
//
// De uitzondering is bewust SMAL: alleen een getal dat direct achter een maatlabel staat
// (D/H/B/L/Ø/mm/cm). `RVS 316` (staalsoort, Astro) en `Lens 80` (lenshoek, Modular, 309 rijen)
// blijven dus gevlagd — daar is het label geen maat, en zonder bewijs veranderen we niets.
const MAAT_STAART = /\b(?:[DHBLØ]|mm|cm)\s*\d+[.,]?\d*\s*$/i;

// Plausibele waardenbereiken. Buiten deze grenzen is de waarde niet per se fout, maar wel
// ongebruikelijk genoeg om een blik te verdienen.
const BEREIK: Partial<Record<Veld, [number, number]>> = {
  cri: [70, 100],
  kelvin: [2200, 6500],
  // Bovengrens gemeten, niet gekozen (30 jul). De juiste formulering is niet "boven 999 staan
  // alleen railprofielen" — dat was 15 van de 16 en dus een overgeneralisatie — maar:
  //
  //   BOVEN 999 W BESTAAT IN DEZE CATALOGUS GEEN ECHT ARMATUUR. Het zwaarste is 850 W
  //   (Lombardo Versus 4). Wat daarboven staat, is een railprofiel of een typefout.
  //
  // Gemeten over alle landende voorstellen: 16 op 1000 W of hoger. Vijftien daarvan zijn
  // T.MAGNET-railprofielen (1000/1500/2000/2500/3000 W = de belastbaarheid van de rail).
  // De zestiende is `Rocks IP65 2254W 41800lm 840` van Sylvania, een schijnwerper met een
  // bedorven getal: dezelfde Rocks-familie loopt 112 W/20.500 lm en 142 W/26.000 lm, netjes
  // 177–189 lm/W, en 2254 W bij 41.800 lm zou 18,5 lm/W zijn — een factor tien mis. Het ware
  // vermogen ligt rond 224 W.
  //
  // De grens vangt beide soorten zonder een woordenlijst die per merk moet groeien.
  maxWattage: [0.5, 999],
  lumenOutput: [50, 100_000],
  beamAngle: [5, 180],
};

// IP-klassen die in de praktijk bestaan. Een "IP19" of "IP99" is een leesfout of een typefout
// in de bron.
const IP_BEKEND = new Set([
  "IP20", "IP21", "IP23", "IP24", "IP25", "IP30", "IP33", "IP34", "IP40", "IP43", "IP44",
  "IP45", "IP50", "IP54", "IP55", "IP60", "IP64", "IP65", "IP66", "IP67", "IP68", "IP69",
]);

/**
 * Alle verdenkingen voor één product. `specs` is wat de parser eruit haalde; alleen velden
 * die daadwerkelijk een waarde opleverden worden getoetst — over een leeg veld valt niets te
 * zeggen (ontbrekend ≠ fout).
 */
export function verdenkingen(naam: string, specs: ParsedSpecs): Verdenking[] {
  const uit: Verdenking[] = [];
  const vlag = (veld: Veld, soort: string, uitleg: string) => uit.push({ veld, soort, uitleg });

  if (!naam) return uit;

  // ── het product is zelf een onderdeel ─────────────────────────────────────
  // Vlagt ELK gevuld veld, want geen enkele spec van een voeding of driver beschrijft een
  // armatuur. Staat vóór de veldtoetsen zodat de reden zichtbaar één en dezelfde is.
  const isLosseLamp = LOSSE_LAMP.test(naam) && LAMP_FITTING.test(naam);
  // Een kap/reflector/plug MET een max.-opgave maar ZONDER fitting: de lampbelasting hoort bij
  // het armatuur eronder, niet bij het plaatje.
  const isKapMetMaxW =
    MAX_WATT.test(naam) &&
    (ACCESSOIRE_ALTIJD.test(naam) ||
      (ACCESSOIRE_MAXW.test(naam) && !LAMP_FITTING_BREED.test(naam)));
  if (
    ONDERDEEL_START.test(naam) ||
    TOESLAGREGEL.test(naam) ||
    isOnderdeelSterk(naam) ||
    isLosseLamp ||
    isKapMetMaxW ||
    BESTURING.test(naam) ||
    RAILADAPTER.test(naam) ||
    CONNECTORSET.test(naam) ||
    VOEDINGSSTEKKER.test(naam) ||
    DRIVER_TYPECODE.test(naam)
  ) {
    for (const veld of FIELDS) {
      if (specs[veld] === undefined) continue;
      vlag(
        veld,
        "product-is-onderdeel",
        `het product is zelf geen armatuur (voeding/driver/trafo, kap, losse lamp, railadapter of toeslagregel), dus deze waarde beschrijft iets anders`,
      );
    }
    return uit; // verder toetsen heeft geen zin: alles van dit product zwijgt
  }

  // ── per veld: meer dan één kandidaat ──────────────────────────────────────
  // Alleen ipValue telt nog via een eigen regex; de rest gaat via `viaParser` hieronder.
  const paren: [Veld, RegExp | null][] = [
    ["cri", null],
    ["kelvin", null],
    ["maxWattage", null],
    ["lumenOutput", null],
    ["ipValue", G.ip],
    ["beamAngle", null],
  ];
  // Zes velden tellen hun kandidaten via de PARSER in plaats van via een eigen regex hier.
  // Wattage doet dat sinds 30 jul: wat de parser als typecode of typemaat verwerpt, mag hier
  // geen tweede kandidaat meer zijn — anders oordelen twee lagen onafhankelijk over hetzelfde
  // teken (zie de kanttekening bij wattKandidaten()). Kelvin en CRI zijn er 4 aug bij gekomen,
  // toen Flos' korte code ("30KC90", "3K C90", "40K98HC") in de parser landde: het lokale
  // `G.kelvin` kent alleen de lange vorm, dus een naam met de korte vorm zou hier nul kandidaten
  // tellen terwijl de parser er één ziet. Dezelfde scheefstand, één laag verderop.
  // Lumen en beamAngle zijn er 11 aug bij gekomen, toen de parser lm/m en `Ta 50°` ging
  // overslaan: het lokale `G.lumen`/`G.beam` kent die uitzonderingen niet, dus een naam met
  // "1000lm/m … 2000lm" zou hier twee kandidaten tellen terwijl de parser er één ziet — en dan
  // onderdrukt `meerdere-waarden` een waarde die helemaal niet dubbelzinnig is.
  const viaParser: Partial<Record<Veld, (naam: string) => (string | number)[]>> = {
    maxWattage: (n) => wattKandidaten(n).map((v) => v.replace(",", ".")),
    kelvin: kelvinKandidaten,
    cri: criKandidaten,
    lumenOutput: lumenKandidaten,
    beamAngle: beamKandidaten,
  };
  for (const [veld, re] of paren) {
    if (specs[veld] === undefined) continue;
    const eigen = viaParser[veld];
    const meer = eigen
      ? (() => {
          const uniek = [...new Set(eigen(naam).map(String))];
          return uniek.length > 1 ? uniek : null;
        })()
      : re
        ? meerdereWaarden(naam, re)
        : null;
    if (meer) {
      vlag(veld, "meerdere-waarden", `${meer.length} verschillende waarden in de naam: ${meer.join(", ")} — de parser nam de eerste`);
    }
  }

  // ── per veld: waarde buiten het gebruikelijke bereik ──────────────────────
  for (const veld of FIELDS) {
    const grens = BEREIK[veld];
    const waarde = specs[veld];
    if (!grens || waarde === undefined || typeof waarde !== "number") continue;
    if (waarde < grens[0] || waarde > grens[1]) {
      vlag(veld, "buiten-bereik", `waarde ${waarde} valt buiten het gebruikelijke ${grens[0]}–${grens[1]}`);
    }
  }

  // ── deelwaarden: twee lichtmotoren, totaal niet genoemd ───────────────────
  if (specs.maxWattage !== undefined && DEELWAARDEN_WATT.test(naam)) {
    vlag("maxWattage", "deelwaarden", "de naam noemt twee vermogens met een plus (direct/indirect of twee lichtmotoren); het totaal staat er niet en optellen is een productbesluit");
  }
  if (specs.lumenOutput !== undefined && DEELWAARDEN_LUMEN.test(naam)) {
    vlag("lumenOutput", "deelwaarden", "de naam noemt twee lichtstromen met een plus; het totaal staat er niet en optellen is een productbesluit");
  }

  // ── watt: bereik ──────────────────────────────────────────────────────────
  if (specs.maxWattage !== undefined && WATT_BEREIK.test(naam)) {
    vlag("maxWattage", "bereik", "de naam noemt een vermogens-BEREIK; de bovengrens geldt alleen voor de zwaarste uitvoering");
  }

  // ── lumen: bereik ─────────────────────────────────────────────────────────
  if (specs.lumenOutput !== undefined && LUMEN_BEREIK.test(naam)) {
    vlag("lumenOutput", "bereik", "de naam noemt een lichtstroom-BEREIK; het armatuur haalt de bovengrens alleen in zijn zwaarste uitvoering");
  }

  // ── kelvin: bereik of tunable white ───────────────────────────────────────
  if (specs.kelvin !== undefined) {
    if (isKelvinBereik(naam)) {
      vlag("kelvin", "bereik", "de naam noemt een kleurtemperatuur-BEREIK; welke waarde geldt is een productvraag");
    } else if (TUNABLE.test(naam)) {
      vlag("kelvin", "tunable-white", "de naam duidt op instelbaar wit — één vaste kelvin is dan misleidend");
    }
  }

  // ── beam: kantelhoek of bereik ────────────────────────────────────────────
  if (specs.beamAngle !== undefined) {
    if (KANTEL.test(naam)) {
      vlag("beamAngle", "kantelhoek", "de naam noemt kantelen/richten — de graden kunnen de kantelhoek zijn, niet de bundel");
    }
    if (GEOMETRIEHOEK.test(naam)) {
      vlag("beamAngle", "geometriehoek", "de naam noemt een koppelstuk/bocht/hoekprofiel — de graden zijn de hoek van dát stuk, geen bundelhoek");
    }
    if (HOEK_BEREIK.test(naam)) {
      vlag("beamAngle", "bereik", "de graden staan als bereik genoteerd");
    }
  }

  // ── dimbaarheid: ontkenning en meerdere protocollen ───────────────────────
  if (specs.dimmable !== undefined) {
    if (NIET_DIMBAAR.test(naam)) {
      vlag("dimmable", "ontkenning", "de naam zegt NIET dimbaar, maar het token DIM matcht toch — dit is vrijwel zeker fout");
    }
    const gevonden = DIM_PROTOCOLLEN.filter((re) => re.test(naam)).length;
    if (gevonden > 1) {
      vlag("dimmable", "meerdere-protocollen", "meer dan één dimprotocol in de naam");
    }
  }

  // ── ipValue: onbekende klasse ─────────────────────────────────────────────
  if (specs.ipValue !== undefined && !IP_BEKEND.has(specs.ipValue)) {
    vlag("ipValue", "onbekende-klasse", `${specs.ipValue} is geen gangbare IP-klasse`);
  }

  // ── naambreed: accessoire-context en afgekapte namen ──────────────────────
  const gevuld = FIELDS.filter((f) => specs[f] !== undefined);
  if (gevuld.length > 0) {
    if (ACCESSOIRE.test(naam)) {
      for (const veld of gevuld) {
        vlag(veld, "accessoire-context", "de naam noemt een bijgeleverd/uitgesloten onderdeel — het getal kan daarbij horen");
      }
    }
    if (AFGEKAPT.test(naam) && !MAAT_STAART.test(naam)) {
      for (const veld of gevuld) {
        vlag(veld, "afgekapt", "de naam lijkt afgekapt; wat erachter stond is onbekend");
      }
    }
    // Niet-onderdrukkend: de waarde blijft staan, de rij wordt zichtbaar. Zie de toelichting
    // bij ONDERDEEL_MIDDEN — onderdelen mogen hun eigen specs dragen, maar een zoekopdracht
    // naar "150 W armatuur" mag geen railvoeding opleveren zonder dat iemand dat wist.
    if (ONDERDEEL_MIDDEN.test(naam)) {
      for (const veld of gevuld) {
        vlag(veld, "onderdeel-in-naam", "midden in de naam staat een onderdeelwoord (voeding, controller, connector, canopy) — de waarde kan bij het onderdeel horen in plaats van bij een armatuur");
      }
    }
  }

  // ── wattage dat vastgeplakt aan een woord staat ───────────────────────────
  if (specs.maxWattage !== undefined && VASTGEPLAKT_WATT.test(naam)) {
    vlag("maxWattage", "vastgeplakt-wattage", "het wattage zit vast aan een woord of typecode (Componi75W-patroon) — dat kan een modelnaam zijn in plaats van een vermogen");
  }

  return uit;
}

// Verdenkingen die per NAAMVORM gelden in plaats van per product: draagt één vorm meerdere
// verschillende waarden voor hetzelfde veld, dan zegt een oordeel over één rij niets over de
// rest van die vorm. (Gemeten bij XAL/CRI: 104 van de 676 vormen, 22,4 % van het volume.)
export function vormenMetMeerdereWaarden(
  items: { field: string; vorm: string; value: string }[],
): Map<string, Set<string>> {
  const per = new Map<string, Set<string>>();
  for (const it of items) {
    const k = `${it.field}|${it.vorm}`;
    if (!per.has(k)) per.set(k, new Set());
    per.get(k)!.add(it.value);
  }
  return new Map([...per].filter(([, v]) => v.size > 1));
}
