// Deterministische naam-parser (H-03) — haalt specs uit productnamen zoals catalogi
// ze inline coderen, bv. "SASSO 100 RD FL SUSP 1500 DALI 17,9W 3000K".
//
// Harde projectregel: ontbrekend ≠ fout. Liever een veld leeg laten dan een verkeerde
// waarde afgeven. Elke extractie is daarom CONSERVATIEF — alleen wat aantoonbaar met een
// eenheid/label in de naam staat, wordt geparsed. De consument (run 5-verrijking) toetst
// die waarden later alsnog tegen de tolerantietabel; een gokwaarde zou daar rood/onbekend
// vervuilen, dus die geven we bewust niet.
//
// De veldnamen komen exact overeen met de kolommen in db/schema.ts (products), zodat een
// consument het resultaat 1-op-1 kan mappen: maxWattage, kelvin, cri, ipValue, beamAngle,
// lumenOutput, dimmable.

// ── Versielabel ─────────────────────────────────────────────────────────────
// De skill draagt een KOPIE van de productieparser. Rapporteer dít label en niet meer "9786dc5"
// kaal — een rapport dat een versie noemt die niet meer klopt, is erger dan geen versie.
//
// ⚠️ HOOG DIT OP ZODRA HET GEDRAG VERANDERT. Op 12 aug bleek waarom: er liepen verwerkingsruns
// terwijl `verdenking.ts` gepatcht werd, en omdat het label gelijk bleef rapporteerden twee runs
// met aantoonbaar ander gedrag dezelfde versie. Een van de agents merkte het zelf op. Wie het
// label laat staan bij een gedragswijziging, maakt elk rapport dat ernaar verwijst onbetrouwbaar.
//
//   skill1 (11 aug) — Ta-hoek, lm/m, CASAMBI, TRAILING/LEADING EDGE, MAINS DIM, PWM, PUSH,
//                     maat-staart bij `afgekapt`, "integrated power supply" als spec,
//                     kelvin-bereik met plausibiliteitstoets, vastgeplakt wattage onderdrukkend
//   skill2 (12 aug) — `NO dimmable` telt nu als ontkenning (eindigde op \b en miste
//                     daardoor 'dimmable' zelf — 744 rijen bij Buzzi & Buzzi kregen de
//                     OMGEKEERDE waarde), ordinaalteken `º` als bundelhoek, `Ta max/min`, de PLUS-notatie
//                     (`44+15 W`) als onderdrukkende `deelwaarden`, en de letter-vóór-getal-toets
//                     unicode-breed zodat `Ø32 W` geen wattage meer oplevert, plus het Duitse
//                     duizendtalpunt bij lumen (`1.700lm` was 700)
//   skill3 (12 aug) — nieuwe onderdrukkende verdenking `geometriehoek`: de graden van een
//                     koppelstuk, bocht of hoekprofiel (`L-joint 90°`, `120°/90° connector`,
//                     `VERBINDER 90°`) zijn de hoek van dát stuk, geen bundelhoek. Zeven merken
//                     in de nachtrun van 12 aug draaiden die waarde met de hand terug, samen
//                     ±260 rijen
export const PARSERVERSIE = "9786dc5+skill3";

export type ParsedSpecs = {
  maxWattage?: number;
  kelvin?: number;
  cri?: number;
  ipValue?: string;
  beamAngle?: number;
  lumenOutput?: number;
  dimmable?: string;
};

// Welke velden deze parser kan opleveren. Consumers gebruiken dit om te weten welke keys
// kunnen bestaan; "geparsed?" per veld = of de key aanwezig is in het resultaat
// (afwezig = niet herkend, nooit een geraden default).
export const FIELDS = [
  "maxWattage",
  "kelvin",
  "cri",
  "ipValue",
  "beamAngle",
  "lumenOutput",
  "dimmable",
] as const;

// ── De veld-patronen, als ÉÉN waarheid ──────────────────────────────────────
// Benoemd (in plaats van inline) sinds de dubbeltelling-fix van 21 jul: behalve de parser
// hieronder gebruikt ook `specSpans()` deze patronen, en de matcher leunt erop dat beide exact
// hetzelfde herkennen. Twee regexsets over hetzelfde feit = twee waarheden die uit elkaar
// kunnen lopen. Zie docs/goal-wattage-dubbeltelling.md.
const WATT_RE = /(\d+(?:[.,]\d+)?)\s*(?:watt|w)\b/i;
const KELVIN_RE = /(\d{3,5})\s*K(?:elvin)?\b/i;
const CRI_RE = /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*(\d{2,3})/i;
const IP_RE = /\bIP\s*:?\s*(\d{2})\b/i;
// `º` (U+00BA, het Spaanse/Portugese ORDINAALteken) staat er sinds 11 aug 2026 naast `°`
// (U+00B0, het gradenteken). Vibia gebruikt consequent het ordinaalteken: 153 namen, alle van de
// vorm `SPOTLIGHT 12º` / `24º` / `55º` — stuk voor stuk een bundelhoek. Gemeten over de 134.907
// nachtrun-namen zijn dat álle voorkomens van `<getal>º`; er is geen enkel geval waarin het een
// echte ordinaal is ("1º" voor "eerste"). Zonder dit teken bleef de bundelhoek daar leeg.
const BEAM_RE = /(\d{1,3})\s*(?:[°º]|deg\b|graden\b)/i;
// ── Het Duitse duizendtalpunt (12 aug 2026) ─────────────────────────────────
// Oligo schrijft `1.700lm` en `12.500 lm`. Zonder de eerste alternatief pakte de regex daar
// alleen de laatste drie cijfers: 700 en 500 — een factor 2,4 respectievelijk 25 ernaast, stil
// en zonder verdenking. Precies de fout die het duurst is.
//
// De vorm is ondubbelzinnig omdat er EXACT drie cijfers achter de punt staan: een lumenwaarde
// met een decimaal (`1.7 lm`) bestaat niet, en `17.9W` heeft er één. In de 134.907 nachtrun-namen
// komt de vorm niet voor, dus deze regel kost daar niets.
const LUMEN_RE = /(\d{1,3}(?:\.\d{3})+|\d{2,6})\s*(?:lm|lumen)\b/i;

// Zet een getal met duizendtalpunten om: "12.500" → 12500. Een enkele punt met minder of meer
// dan drie cijfers erachter is een DECIMAAL en blijft ongemoeid.
function zonderDuizendtalpunt(raw: string): string {
  return /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
}
// Dimbaarheid kent geen capture-groep maar wel een herkenbare span; de losse tests in
// parseDimmable blijven leidend voor de WAARDE, dit patroon alleen voor de span.
const DIMMABLE_SPAN_RE =
  /\b(?:DALI|TRIAC|PHASE|CASAMBI|PWM|PUSH|(?:TRAILING|LEADING)\s*EDGE|MAINS\s*DIM|[01]\s*-\s*10\s*V|DIM(?:MABLE)?)\b/i;

// ── Ta is de omgevingstemperatuur, niet de bundelhoek (nachtrun 11 aug) ──────
// `BEAM_RE` eist alleen een getal met een gradenteken, en `Ta 50°` voldoet daaraan. Gemeten bij
// iGuzzini: 2.384 namen dragen de notatie, en in 1.708 daarvan werd hij de bundelhoek — een
// waarde die er niet staat, precies wat ontbrekend ≠ fout verbiedt. Na de patch: 1.708 hoeken
// weg, 0 goede hoeken geraakt, 0 waarden veranderd (diff over dat deelcorpus).
//
// De toets kijkt naar wat er vlak vóór het getal staat en is bewust HOOFDLETTERGEVOELIG: `Ta`
// is de vaste notatie, terwijl een ongevoelige variant elk woord op -ta zou raken ("Delta 50°",
// "Vesta 24°") en dan juist echte bundelhoeken zou weggooien.
// `Ta max 35°C` komt er ook voor (iGuzzini, 8 rijen die anders een bundelhoek van 35° kregen),
// vandaar het optionele `max`/`min` tussen het label en het getal.
const TA_PREFIX = /\bTa\s*(?:max|min)?\s*$/;

// ── Lumen per meter is geen productwaarde ───────────────────────────────────
// De woordenschat zegt het al ("lm/m niet overnemen"), maar de parser hield zich er niet aan:
// bij Modular gaf hij 72 keer `1000lm/m` af als lumenOutput. Zelfde redenering als
// WATT_PER_METER hierboven — het totaal hangt van de lengte af en is dus geen armatuurwaarde.
// Per SPAN overslaan, niet per naam: "LEDstrip 2m 1000lm/m totaal 2000lm" draagt verderop wél
// een geldig totaal, en dat mag een strip-notatie eerder in de naam niet kosten.
const LUMEN_PER_METER = /^\d+(?:[.,]\d+)?\s*(?:lm|lumen)\s*\/\s*m\b/i;

// ── De KORTE kleurcode: "30KC90", "3K C90", "40K98HC" (4 aug) ────────────────
// Flos Architectural schrijft kleurtemperatuur en kleurweergave in één samengestelde code in
// plaats van voluit. Van 18.263 producten misten er 18.218 een kelvin en 18.236 een CRI — het
// grootste gat in de catalogus, en volledig een NOTATIEkwestie, geen ontbrekende data.
//
// ── Waarom dit geen aanname is (scripts/meet-flos-notatie{,-2,-3,-4}.ts) ─────
// De vertaling is niet afgeleid uit hoe het eruitziet, maar uit vijf productlijnen die BEIDE
// notaties dragen. Daar staat de vertaling in Flos' eigen catalogus:
//
//   FIND ME 2 BLACK POWER LED 2700K CRI90   naast   FIND ME 0 WHITE POWER LED 27K C90
//   BON JOUR 45 WHITE POWER LED 3000K CRI90 naast   BON JOUR 90 WHITE LED ARRAY 3K CRI90
//   RUN.MAGNET 2.0 FINDME SUSPLED 8W 2700K  naast   RUN.MAGNET 2.0 FINDME SUSP 27K C90 CHR
//
// Elf van de twaalf korte waarden hebben zo een exacte lange tegenhanger in dezelfde lijn; de
// twaalfde (UT SPOT 4K) heeft er geen omdat die lijn geen 4000K-naam in de lange vorm kent —
// geen tegenspraak, alleen een ontbrekend paar. Tegenspraak gemeten: 0 op 18.263.
//
// Twee schalen, allebei uit dezelfde paren: TWEE cijfers is ×100 (27K = 2700K) en ÉÉN cijfer is
// ×1000 (3K = 3000K). Dat is geen ad-hoc uitzondering maar hoe de bron het schrijft, en het
// botst nergens: geen enkele familie draagt zowel 3K als 30K (beide zouden 3000 zijn).
//
// De getalspreiding bevestigt het onafhankelijk: over 15.842 treffers komen alléén 22, 27, 30,
// 35, 40, 50 (×100) en 3, 4 (×1000) voor — exact de LED-kleurtemperatuurladder, met families die
// netjes over {27,30,40,50} variëren. Bij een typemaat of vermogen zou je 12, 45 of 88 zien.
//
// ── Waarom de K VAST aan het getal moet zitten ──────────────────────────────
// Precies één Flos-naam heeft een spatie vóór de K, en dat is geen kleurtemperatuur maar een
// driver: "ALIM.LED AC/DC TCI MP32 K2110-240V 50/60". De eis "geen spatie" kost dus niets en
// weert het enige tegenvoorbeeld dat er is.
//
// ── Waarom er iets ACHTER de K moet staan ───────────────────────────────────
// Zonder die eis leest de regel Sylvania's kilolumen: "KUBIXX 4000K 19KLM SMAL PIR" zou 1900 K
// opleveren, "RAIDEN IP66 40KLM 830" zelfs 4000 K. Gemeten: 68 Sylvania-namen dragen zo'n
// <nn>KLM-vorm. De drie toegestane vervolgen zijn wél gemeten vormen:
//   ...K C90 / ...KC90   de CRI met een C   (13.979 namen)
//   ...K90    / ...K98   de CRI zonder C, altijd vastgeplakt (2.660 namen)
//   ...K<niet-alfanumeriek of eind>          de kale vorm ("27K DALI", 1.862 namen)
// Een letter direct achter de K is dus nooit goed — dat weert KLM, en ook "3Kap".
const KELVIN_KORT_RE = /(?<![\d.,])(\d{1,2})K(?:\s?C(\d{2})(?!\d)|(\d{2})(?!\d)|(?![A-Za-z0-9]))/;

// De C-vorm die LOS staat, dus zonder K ervoor: "… LED ARR C80 3000K", "… LED ARRAY C95 13W".
// Twee eisen, allebei uit een gemeten valse positief:
//   • géén letter vóór de C — anders leest hij de C uit een woord of bestelcode:
//     "ECLECTIC 90" (376×), "DC 90-305V", "XTSC 635-3", "LC43MINI", "QR-CBC51".
//   • géén spatie ná de C — Flos schrijft de CRI altijd vast ("C90"), 11.796 keer. De 395
//     "C <getal>"-treffers zijn zónder uitzondering ECLECTIC/QR-CBC-namen. Deze eis weert
//     bovendien Artemide's "A.24 C 90° CORNER" (101 namen): dat is een HOEK, geen CRI, en met
//     een spatie-tolerantie zou de regel daar stil de kleurweergave op 90 zetten.
const CRI_C_LOS_RE = /(?<![A-Za-z0-9])C(\d{2})(?!\d)/;

// De aannemelijke band voor een CRI die ZONDER label geschreven is. De lange vorm mag ruimer
// (die draagt het woord CRI of Ra en is daarmee zelf het bewijs); een kale "C<nn>" moet het
// hebben van de waarde. Gemeten bij Flos: 90 (10.784×), 98 (726), 80 (179), 95 (48) — verder
// niets. Alles onder de 80 dat in de catalogus als C<nn> geschreven staat, is een maat- of
// typecode: C35, C43, C51, C57, C60, C68, C70. Vandaar de ondergrens op 80.
const CRI_ZONDER_LABEL: [number, number] = [80, 100];

// Eerste capture-groep van de eerste match, of null.
function firstCapture(name: string, re: RegExp): string | null {
  const m = re.exec(name);
  return m ? m[1] : null;
}

// Komma of punt als decimaalteken → number. "17,9" → 17.9, "24" → 24.
function toNumber(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

// Vermogen: getal (komma/punt-decimaal) direct gevolgd door W of Watt. "17,9W" → 17.9,
// "24 W" → 24, "12.5Watt" → 12.5. Alleen positieve waarden.
// ── Vier valse wattages, gevonden door de agent-zwerm op Flos (30 jul) ───────
// `WATT_RE` is `(\d+(?:[.,]\d+)?)\s*(?:watt|w)\b`, en die `\s*` plus de losse `w` maken hem
// gulzig: élk getal met ergens daarna een W erachter telt. Vier vormen gaan daardoor mis, alle
// vier zelf nagemeten met deze parser en alle vier door de zwerm aangewezen:
//
//   "UT SPOT DOW NT 86 FL DA LED ARR 3K C90 W"  → 90    de CRI, met een losse W als kleurcode
//   "EASY KAP 80 W-W RND BLK DWLED ARRAY C95"   → 80    typemaat + kleurcode "W-W" (dim-to-warm)
//   "EASY KAP 105 EVO WW RND QR-CBC51 GX5.3 W"  → 5.3   de lampvoet GX5.3
//   "CIRCLE OF LIGHT Ø300 LED 12X3W"            → 3     per LED; het armatuur is 36 W
//
// Gemeten omvang catalogusbreed op landende voorstellen: 1.442 van 71.883 (2,01 %), waarvan
// 1.412 de NxM-vorm (TossB 1.103, Wever & Ducré 299) en 30 de andere drie.
//
// Let op wat GEEN bug is en dus niet geweerd wordt: "1x10W" is één lichtbron van 10 W en daar
// is 10 het juiste vermogen. Alleen N ≥ 2 maakt de waarde onvolledig. Mijn eerste telling zei
// 1.529 omdat hij de 1x-vorm meenam; dat was een meetfout, geen bug.
//
// Alle vier worden ZWIJGEND overgeslagen in plaats van gerepareerd. Bij "12X3W" zou 36 te
// berekenen zijn, maar dan neemt de parser een productbesluit (zijn het 12 lichtbronnen in één
// armatuur, of een set van 12?) en dat is precies wat de ijzeren regel ontbrekend ≠ fout
// verbiedt. Zwijgen laat de kolom leeg, en een lege kolom kan een betere bron later nog vullen.

// ── De losse W is bijna nooit een eenheid ───────────────────────────────────
// Eén regel voor een hele familie, en hij is gemeten voordat hij gebouwd werd. `WATT_RE` staat
// een spatie toe tussen het getal en de W (`(\d+)\s*(?:watt|w)\b`), en juist die spatie is het
// probleem: een W die LOS staat is in deze catalogi meestal de kleurcode "wit", niet de eenheid
// watt. Staat er dan vlak vóór het getal een letter, dan is het getal een TYPECODE:
//
//   RONY ADJUST CEILING REC 1.0 PAR16 W max. 12W GU10   → las 16   (lamptype; 12W staat ernaast!)
//   EASY KAP 105 EVO WW RND QR-CBC51 GX5.3 W            → las 5.3  (lampvoet)
//   GINGER A XL42 W.CANOPY OAK                          → las 42   (typemaat)
//   LIFESAFE PRO TS 700 IP65 W EM3 NM DA                → las 65   (IP-KLASSE als vermogen)
//   UT SPOT DOW NT 86 FL DA LED ARR 3K C90 W            → las 90   (CRI)
//
// Gemeten catalogusbreed: 140 landende voorstellen, Wever & Ducré 134 · Sylvania 4 · Marset 2.
// Bij PAR16 is het extra schadelijk: de júiste waarde (`max. 12W`) staat tien tekens verderop in
// dezelfde naam, dus de verkeerde verdringt een goede.
//
// ── Twee dingen die de regel bewust NIET raakt, allebei nagemeten ────────────
// • `1x10W` (87 gevallen, TossB 84): de letter ervoor is de vermenigvuldigings-x en 10 is dan het
//   juiste vermogen van één lichtbron. De maal-vorm wordt apart afgehandeld (WATT_PER_BRON).
// • `F13W`, `F36W`, `Componi200W` (12 gevallen): daar zit de W VAST aan het getal, en dan is hij
//   wél de eenheid — een T5-buis van 13 W. Vandaar de eis dat de W los staat.
const WATT_VALS: RegExp[] = [
  // Een W die met een koppelteken aan letters vastzit is geen eenheid maar het eerste teken van
  // een samenstelling. Dit was `W-W` (de kleurcode warm-white, "EASY KAP 80 W-W"); sinds 31 jul
  // dekt hij élk achtervoegsel, want de vorm is dezelfde en de smallere versie liet er één door:
  //
  //     CLS LDC-407 W-DMX 1-4 kanaals 700mA LED driver  →  maxWattage 407
  //
  // Catalogusbreed gemeten (`scripts/meet-valse-watt-vormen.ts`): 1.173 namen dragen `<cijfer>W-`
  // met letters erachter, en geen ervan is een vermogen. Het zijn er drie soorten: `W-W` (48,
  // warm-white), XAL's bestelcodes (`UNICO-000 305W-E040-E040`, 1.124) en deze ene CLS-driver.
  // Eén regel in plaats van een tweede regel ernaast — de vorige les was dat elke extra regex een
  // gok op één merk is.
  /\b\d+\s*W-[A-Za-z]/i,
  // Decimale typemaat plus losse kleurcode: "ODREY SHADE 4.0 W", "ILANE CEILING SURF 2.0 W 2.0m".
  // Een écht decimaal vermogen schrijft de eenheid vast ("17,9W", "38.4W"), nooit los.
  /\b\d+\.\d\s+W\b/i,
];

// Een getal dat DIRECT achter een letter staat en gevolgd wordt door een LOSSE W: typecode.
// Twee voorwaarden, want elk apart is te grof — zie de meting hierboven.
const WATT_TYPECODE = /[A-Za-z]\d+(?:[.,]\d+)?\s+W\b/;

// "… incl. driver 4W": het vermogen hóórt bij de meegeleverde driver, niet bij het product.
// Gemeten: 40 producten, alle Wever & Ducré, en geen enkele draagt daarnaast een eigen
// wattage — een plafondbasis heeft er ook geen. Deze namen leveren dus terecht niets.
//
// Let op het verschil met Kreon's 1.806 namen die "driver incl." zeggen ZONDER getal: die
// blijven ongemoeid, want daar is geen wattage-span om over te slaan. De volgorde in de tekst
// verschilt ook — "incl. driver 4W" tegen "driver incl., carrara" — en alleen de eerste vorm
// zet een vermogen naast het woord.
const WATT_VAN_DRIVER = /\bincl\.?\s*(?:\d+\s*x\s*)?drivers?\s*$/i;
// Meerdere lichtbronnen: "12X3W", "2 x 24 W". N ≥ 2, want 1x is gewoon één bron.
//
// De tweede vorm kwam uit de vierde zwermronde: "SNEAK CEILING REC 2.0 … 2X6/9W 350/500mA".
// Daar zit een vermenigvuldiging én een bereik door elkaar, en de eerste regel miste hem omdat
// hij een W direct achter het getal eist ("2x6" wordt gevolgd door "/9W"). De parser las 9,
// terwijl het armatuur er twee draagt en dus 18 W is — structureel de helft te laag. Gemeten:
// 122 producten, alle Wever & Ducré, 340 landende veldvullingen. Bij de 1.0-varianten ("6/9W",
// zonder vermenigvuldiging) is 9 juist wél correct, en die blijven staan.
const WATT_PER_BRON =
  /\b(?:[2-9]|\d{2,})\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:\/\s*\d+(?:[.,]\d+)?\s*)?W\b/i;

// Vermogen PER METER: "JANE 2000 IP40 LIGHT ROPE 14,4W/M LED 3000K", "ILANE … 15W/m". Het
// totaal hangt af van de lengte — een strip van 5 m trekt 50 W bij 10 W/m — dus dit is geen
// armatuurvermogen. Gemeten: 147 producten (Kreon 113, W&D 20, XAL 14), 185 landende
// veldvullingen. Vaste-lengtevarianten van hetzelfde profiel dragen wél een totaal ("30W bij
// 2 m") en die blijven staan.
const WATT_PER_METER = /\d+(?:[.,]\d+)?\s*W\s*\/\s*m\b/i;

// Is de match op deze plek een TYPECODE of TYPEMAAT in plaats van een vermogen?
function isValseWatt(name: string, index: number, treffer: string): boolean {
  const kop = name.slice(0, index);
  // "12X3W": de vermenigvuldigings-x — daar is het getal het vermogen van één lichtbron.
  if (/\d[xX*]$/.test(kop)) return false;
  // "PAR16 W", "GX5.3 W", "IP65 W": een letter direct vóór het getal én een LOSSE W erna.
  //
  // De tekenklasse is sinds 12 aug 2026 UNICODE-breed (`\p{L}` in plaats van `[A-Za-z]`) en
  // bevat ook het diameterteken. Oty light schrijft `POP HOST Ø32 W` en `MOMA Ø40 W`, waarin de
  // W een uitvoeringsletter is naast de C-, D-, L-, M- en P-varianten van dezelfde serie — de
  // ASCII-only test zag `Ø` niet als letter en gaf daar 32 en 40 watt af. 24 rijen bij dat ene
  // merk; in de 134.907 namen van de nachtrun komt de vorm niet voor, dus de regel kost daar niets.
  if (/[\p{L}Ø⌀Φø]$/u.test(kop) && /\d\s+W/i.test(treffer)) return true;
  // "… incl. driver 4W": de span staat direct achter het woord driver.
  if (WATT_VAN_DRIVER.test(kop.slice(-24))) return true;
  // "ODREY SHADE 4.0 W", "80 W-W": decimale typemaat of kleurcode, altijd met een losse W.
  // Bewust een KLEIN venster achter de match: "80 W" alleen laat de "-W" niet zien, maar de
  // hele reststring zou een látere match ten onrechte veroordelen op tekst die verderop staat.
  // Drie tekens is genoeg voor "-W" en te weinig om een volgende typemaat binnen te halen.
  const venster = name.slice(index, index + treffer.length + 3);
  if (WATT_VALS.some((re) => re.test(venster))) return true;
  return false;
}

// De wattage-kandidaten van een naam, ná aftrek van typecodes en typematen. ÉÉN bron van
// waarheid: `parseWatt` neemt hier de eerste uit, en `verdenking.ts` telt hier hoeveel er zijn.
//
// Waarom dat één functie moet zijn (30 jul, tweede correctie): eerst sloeg de parser de valse
// span over terwijl `verdenkingen()` hem nog als kandidaat telde. Gevolg: "… 1.1 B ROUND incl.
// driver 4W" landde en "… 1.1 W ROUND incl. driver 4W" werd geweerd op `meerdere-waarden` —
// zelfde armatuur, andere kleurcode, andere uitkomst. Dat is exact het Muuto-bezwaar waarmee
// deze opdracht begon, alleen een laag opgeschoven: niet meer in de parser maar in de poort.
// Twee lagen die onafhankelijk over hetzelfde teken oordelen, geven vroeg of laat tegengestelde
// antwoorden op twee namen die hetzelfde product zijn.
export function wattKandidaten(name: string): string[] {
  if (!name || WATT_PER_BRON.test(name) || WATT_PER_METER.test(name)) return [];
  const globaal = new RegExp(WATT_RE.source, "gi");
  const uit: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = globaal.exec(name)) !== null) {
    if (isValseWatt(name, m.index, m[0])) continue;
    uit.push(m[1]);
  }
  return uit;
}

function parseWatt(name: string): number | undefined {
  if (WATT_PER_BRON.test(name) || WATT_PER_METER.test(name)) return undefined;

  // ── Per SPAN beoordelen, niet per naam (30 jul, tweede versie) ─────────────
  // De eerste versie wees de hele naam af zodra er ergens een typemaat-W in stond. Gemeten
  // gevolg: 16 namen verloren een AANWEZIGE juiste waarde, zoals
  // "SIRRO SPOT INSET 1.0 W max. 12W" — de 1.0 is de typemaat, maar max. 12W staat er gewoon.
  //
  // Dat is precies de willekeur die dit hele spoor moest wegnemen: twee producten uit dezelfde
  // familie kregen een verschillende uitkomst omdat de kleurcode toevallig W was
  // ("… 1.1 B ROUND incl. driver 4W" gaf 4, "… 1.1 W ROUND incl. driver 4W" gaf niets).
  // Nu slaan we de valse span over en kijken naar de volgende kandidaat.
  for (const raw of wattKandidaten(name)) {
    const w = toNumber(raw);
    if (w > 0) return w;
  }
  return undefined;
}

// ── Kandidaten per veld: ÉÉN bron voor de parser én de verdenking ────────────
// Zelfde constructie en zelfde reden als `wattKandidaten` hierboven: `verdenking.ts` telt hoeveel
// kandidaten een naam draagt (`meerdere-waarden`) en moet daarbij exact hetzelfde zien als de
// parser. Sinds de korte vorm erbij kwam is dat geen theorie meer — een tweede regexset zou
// "30KC90" in de ene laag wél en in de andere niet herkennen.
//
// De kandidaten zijn GENORMALISEERD naar echte kelvin, niet naar de ruwe tekst. Anders zou
// "27K" naast "2700K" als twee verschillende waarden tellen terwijl het één feit is. Bewust
// ONgefilterd op bereik: `parseKelvin` verwerpt hieronder wat buiten 2000–8000 valt, maar voor
// de vraag "hoeveel kandidaten staan er in deze naam" telt ook een onwaarschijnlijke mee —
// "1500K 3000K" moet `meerdere-waarden` blijven vlaggen, precies zoals vóór deze wijziging.
export function kelvinKandidaten(name: string): number[] {
  if (!name) return [];
  const uit: number[] = [];
  const lang = new RegExp(KELVIN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = lang.exec(name)) !== null) uit.push(parseInt(m[1], 10));
  const kort = new RegExp(KELVIN_KORT_RE.source, "g");
  while ((m = kort.exec(name)) !== null) {
    const v = parseInt(m[1], 10);
    // Twee cijfers = ×100 (27K → 2700), één cijfer = ×1000 (3K → 3000). Zie de meting boven.
    uit.push(m[1].length === 1 ? v * 1000 : v * 100);
  }
  return uit;
}

// Kleurtemperatuur: de lange vorm eerst (3-5 cijfers + K/Kelvin), dan de korte. Alleen het reële
// LED-bereik 2000–8000 K telt; daarbuiten (bv. een toevallige "9000K" of "1500K") wordt genegeerd
// — beter niets dan een verkeerde kelvin. Die grens doet meteen dienst als vangnet onder de korte
// vorm: "19K" zou 1900 opleveren en valt er dus vanzelf uit.
//
// De lange vorm blijft vóóraan staan zodat namen die hem dragen zich exact gedragen als vóór
// 4 aug; gemeten is dat geen enkele naam de twee vormen met een ANDERE waarde combineert.
function parseKelvin(name: string): number | undefined {
  for (const k of kelvinKandidaten(name)) {
    if (k >= 2000 && k <= 8000) return k;
  }
  return undefined;
}

// CRI/Ra (kleurweergave-index): eerst de vorm MET label, dan Flos' kale C-vorm.
//
// Met label, optioneel met een label-dubbele-punt en/of ≥/>=/>: "CRI90", "Ra90", "CRI≥90",
// "CRI 90", "CRI: ≥ 90", "CRI:90" → 90. OCR-labels uit armaturenboeken zetten vaak een ":"
// tussen het label en de waarde ("CRI: ≥90"). Alleen 0–100 (index kan niet hoger).
//
// Zonder label komt de waarde uit Flos' samengestelde code, in twee gemeten vormen: mét C
// ("30K C90", "30KC90") en zonder ("30K90HC", "40K98HC"). Dat het tweede getal daar écht de CRI
// is en niet iets anders, is apart gemeten: in 27 productfamilies varieert dat getal (80/90/98)
// terwijl de K gelijk blijft, en in 1.821 families varieert de K terwijl het getal gelijk blijft.
// Twee onafhankelijke assen — dat is precies wat kleurtemperatuur en kleurweergave zijn.
export function criKandidaten(name: string): number[] {
  if (!name) return [];
  const uit: number[] = [];
  const gelabeld = new RegExp(CRI_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = gelabeld.exec(name)) !== null) uit.push(parseInt(m[1], 10));

  const [min, max] = CRI_ZONDER_LABEL;
  const zonderLabel = (raw: string | undefined) => {
    if (raw == null) return;
    const v = parseInt(raw, 10);
    if (v >= min && v <= max) uit.push(v);
  };
  // Groep 2 en 3 van de korte kleurcode: "…K C90" / "…KC90" en "…K90".
  const kort = new RegExp(KELVIN_KORT_RE.source, "g");
  while ((m = kort.exec(name)) !== null) zonderLabel(m[2] ?? m[3]);
  // De C-vorm zonder K ervoor: "… LED ARR C80 3000K".
  const los = new RegExp(CRI_C_LOS_RE.source, "g");
  while ((m = los.exec(name)) !== null) zonderLabel(m[1]);
  return uit;
}

function parseCri(name: string): number | undefined {
  for (const cri of criKandidaten(name)) {
    if (cri > 0 && cri <= 100) return cri;
  }
  return undefined;
}

// IP-klasse: "IP20", "IP 44", "IP65", "IP: 44", "IP:44" → genormaliseerd "IP44"
// (uppercase, geen spatie). Zelfde OCR-dubbele-punt-scenario als bij CRI.
function parseIpValue(name: string): string | undefined {
  const raw = firstCapture(name, IP_RE);
  return raw == null ? undefined : `IP${raw}`;
}

// De hoek-kandidaten van een naam, ná aftrek van omgevingstemperaturen. Zelfde constructie en
// zelfde reden als `wattKandidaten`: `verdenking.ts` telt hier de kandidaten, zodat parser en
// poort niet onafhankelijk over hetzelfde teken oordelen.
export function beamKandidaten(name: string): number[] {
  if (!name) return [];
  const uit: number[] = [];
  const g = new RegExp(BEAM_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = g.exec(name)) !== null) {
    if (TA_PREFIX.test(name.slice(0, m.index))) continue;
    uit.push(parseInt(m[1], 10));
  }
  return uit;
}

// Bundelhoek: "36deg", "36°", "24 graden" → getal. Alleen 1–360°.
function parseBeamAngle(name: string): number | undefined {
  for (const a of beamKandidaten(name)) {
    if (a > 0 && a <= 360) return a;
  }
  return undefined;
}

// Lumen: ALLEEN bij een expliciete 'lm'/'lumen'-eenheid. Een kaal getal in de naam (zoals
// de "1500" in "SASSO ... 1500 ...") is dubbelzinnig — dat kan net zo goed een maat/type
// zijn — dus dat parsen we bewust NIET als lumen. "800lm" → 800, "1200 lumen" → 1200.
export function lumenKandidaten(name: string): number[] {
  if (!name) return [];
  const uit: number[] = [];
  const g = new RegExp(LUMEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = g.exec(name)) !== null) {
    // Vijf tekens achter de match is genoeg voor " / m" en te weinig om een volgende
    // lumenwaarde binnen te halen — zelfde vensterredenering als bij `isValseWatt`.
    if (LUMEN_PER_METER.test(name.slice(m.index, m.index + m[0].length + 5))) continue;
    uit.push(parseInt(zonderDuizendtalpunt(m[1]), 10));
  }
  return uit;
}

function parseLumen(name: string): number | undefined {
  for (const lm of lumenKandidaten(name)) {
    if (lm > 0) return lm;
  }
  return undefined;
}

// Dimbaarheid is het enige veld met een ONTKENNING die de parser zelf niet zag: "NON DIM" bevat
// het token DIM en `/\bDIM\b/` matcht dat — het streepje én de spatie zijn een woordgrens. De
// parser zei dan "dimbaar" terwijl de naam het tegendeel zegt.
//
// Gemeten op de branch (scripts/meet-nondim.ts, scripts/meet-nondim-conflict.ts, 30 jul):
// 3.635 namen ontkennen dimbaarheid, en 3.164 daarvan zouden op een LEGE kolom landen —
// XAL 2.810, Wever & Ducré 273, CLS 58, Flos Architectural 33. Het zijn aansluitdozen en
// plafondkappen: "THROUGH WIRING CONNECTION BOX NON DIM 3-POLE". Geen ontbrekende waarde maar
// de OMGEKEERDE, en `publishRun` is onomkeerbaar.
//
// Waarom dit meer is dan een verrijkingsfout: `judgeDimmable` (lib/matching/tolerances.ts:119)
// doet substring-matching in BEIDE richtingen na het strippen van niet-alfanumeriek. Een bestek
// dat "DIM" vraagt krijgt dus GROEN op een niet-dimbaar armatuur; vraagt het DALI, dan geel
// ("ander protocol") in plaats van `onbekend`. Beide duwen de kandidaat omhoog.
//
// De ontkenning onderdrukt het veld VOLLEDIG, ook als er een protocolnaam in staat. Gemeten
// zijn dat 26 namen, en het zijn stuk voor stuk varianten-opsommingen: "TRACK LINEAR CONNECTOR
// NON DIM/ZIGBEE/DALI 48VDC" somt op wát er leverbaar is. Voor dít artikel is geen van beide
// lezingen een feit — dus zwijgen, conform de ijzeren regel ontbrekend ≠ fout.
//
// Eén definitie, gedeeld met lib/enrichment/verdenking.ts (die importeert hem hiervandaan, niet
// andersom — verdenking.ts hangt al aan parser.ts en een cyclus is het niet waard).
export const NIET_DIMBAAR =
  /\b(?:NON[\s-]*DIM\w*|NOT[\s-]*DIM\w*|NIET[\s-]*DIMBAAR|EXCL\.?\s*DIM\w*|ZONDER[\s-]*DIM\w*|NO[\s-]*DIM\w*)/i;

// Dimbaarheid: herken het protocol. Specifiek vóór generiek (DALI/TRIAC/PHASE/x-10V vóór
// het kale "DIM"). Retour is de genormaliseerde protocolnaam.
//
// ── Vier vormen erbij na de nachtrun van 11 aug 2026 ─────────────────────────
// Alle vier stonden ze wél in de woordenschat en niet in de parser. De volgorde houdt die
// woordenschat aan (NIET-DIMBAAR wint van alles, dan DALI → TRIAC → PHASE → n-10V), zodat
// "CASAMBI (DALI)" DALI blijft opleveren zoals daar beschreven.
//
//   CASAMBI            70 Modular-namen; het protocol staat er letterlijk
//   TRAILING/LEADING EDGE   fase-af- resp. fase-aansnijding, dus TRIAC-familie — net als het al
//                      aanwezige PHASE. (MAINS DIM stond óók nog niet in deze functie en is er
//                      hier bij gezet, conform de woordenschat.) Modular: 491 rijen.
//   PWM                gangbaar op 48V-tracksystemen
//   PUSH               bediening via een gewone drukknop
//
// Omvang gemeten op het deelcorpus van 83.117 namen (iGuzzini + Vibia) vóór het bouwen, geteld als "namen die nú géén
// dimwaarde krijgen en er met deze regel wél een zouden krijgen": PWM 4.508, PUSH 1.508. PUSH
// staat bij Vibia meestal als "PUSH 1-10V" (15.071 namen) en die blijven 1-10V opleveren, want
// die toets staat eerder — dat is ook de juiste uitkomst, want het protocol is dan 1-10V.
//
// ── Waarom BLUETOOTH hier NIET staat, hoewel de woordenschat hem kent ────────
// Gemeten: 548 namen dragen het woord, en de grootste groep is `Buried pole with Bluetooth
// antenna H= 7,800` — een lichtmast met een antenne erop. Dat is een fysiek onderdeel, geen
// dimprotocol, en de parser kan de twee in een naam niet uit elkaar houden. Uit een KOLOM die
// "Converter dimbaar bluetooth" heet (RZB, 929 rijen) mag je hem in fase 1 wél overnemen.
function parseDimmable(name: string): string | undefined {
  if (NIET_DIMBAAR.test(name)) return undefined;
  if (/\bDALI\b/i.test(name)) return "DALI";
  if (/\bTRIAC\b/i.test(name)) return "TRIAC";
  if (/\b(?:PHASE|MAINS\s*DIM|(?:TRAILING|LEADING)\s*EDGE)\b/i.test(name)) return "PHASE";
  const v = /\b([01])\s*-\s*10\s*V\b/i.exec(name);
  if (v) return `${v[1]}-10V`;
  if (/\bCASAMBI\b/i.test(name)) return "CASAMBI";
  if (/\bPWM\b/i.test(name)) return "PWM";
  if (/\bPUSH\b/i.test(name)) return "PUSH";
  if (/\bDIM(?:MABLE)?\b/i.test(name)) return "DIM";
  return undefined;
}

// Zet alleen de keys die daadwerkelijk geparsed zijn; afwezige key = niet herkend.
function set<K extends keyof ParsedSpecs>(
  out: ParsedSpecs,
  key: K,
  value: ParsedSpecs[K] | undefined,
): void {
  if (value !== undefined) out[key] = value;
}

export function parseProductName(name: string): ParsedSpecs {
  const out: ParsedSpecs = {};
  if (!name) return out;
  set(out, "maxWattage", parseWatt(name));
  set(out, "kelvin", parseKelvin(name));
  set(out, "cri", parseCri(name));
  set(out, "ipValue", parseIpValue(name));
  set(out, "beamAngle", parseBeamAngle(name));
  set(out, "lumenOutput", parseLumen(name));
  set(out, "dimmable", parseDimmable(name));
  return out;
}

// ── Spec-spans: wélke karakters brachten een veld voort ─────────────────────
// Voor de dubbeltelling-fix (docs/goal-wattage-dubbeltelling.md). De matcher moet weten of een
// producttekst-token de bron is van een gevraagde spec: dan beoordeelt specScore dat feit al
// mét tolerantie en mag de ruwe tekstscore het niet nóg eens belonen.
//
// Waarom dit hier woont en niet in de matcher: de req_*-velden op een spec-regel zijn geparsed
// uit exact dezelfde producttekst, door parseProductName (lib/pdf/armaturenboek.ts:131). De
// vraag "welke karakters hebben deze waarde voortgebracht" is dus al door DEZE module
// beantwoord. Een tweede regexset in de matcher zou daarvan kunnen afwijken.
//
// Verschil met parseProductName: die neemt per veld de EERSTE match (dat is de waarde); hier
// worden álle voorkomens gerapporteerd, want elk voorkomen is hetzelfde feit en telt dus even
// hard dubbel. Herkenning is daarmee net zo conservatief als de parser: eenheid of label
// verplicht. "L90" matcht CRI_RE niet (geen CRI/Ra-label) en is dus géén span — precies de
// valse positief die een naïeve getal-gelijkheid wél zou pakken.
export type SpecSpan = {
  field: (typeof FIELDS)[number];
  start: number;
  end: number;
};

// De derde kolom is een OPTIONELE toets op de match. De korte kleurcode heeft er een nodig: hij
// herkent "C35" in "A6/C35" wel als vorm, maar `parseCri` verwerpt die waarde (buiten 80–100).
// Zonder de toets zou de matcher een span melden voor een spec die nooit geparsed is, en dan
// onderdrukt hij een tekstscore op grond van een veld dat er niet is — de spiegelbeeldige fout
// van de dubbeltelling die deze module moest oplossen.
const SPAN_PATTERNS: [(typeof FIELDS)[number], RegExp, ((m: RegExpExecArray) => boolean)?][] = [
  ["maxWattage", WATT_RE],
  ["kelvin", KELVIN_RE],
  ["cri", CRI_RE],
  ["ipValue", IP_RE],
  // De twee toetsen hieronder houden `specSpans` gelijk met de parser: die slaat sinds
  // 11 aug `Ta 50°` en `1000lm/m` over, en een span melden voor een veld dat nooit geparsed is,
  // is precies de spiegelbeeldige fout die in de kop hierboven beschreven staat.
  ["beamAngle", BEAM_RE, (m) => !TA_PREFIX.test(m.input.slice(0, m.index))],
  ["lumenOutput", LUMEN_RE, (m) =>
    !LUMEN_PER_METER.test(m.input.slice(m.index, m.index + m[0].length + 5))],
  ["dimmable", DIMMABLE_SPAN_RE],
  // Flos' korte code levert twee velden uit één span: "30KC90" is zowel de kelvin als de CRI.
  ["kelvin", KELVIN_KORT_RE, (m) => {
    const k = m[1].length === 1 ? +m[1] * 1000 : +m[1] * 100;
    return k >= 2000 && k <= 8000;
  }],
  ["cri", KELVIN_KORT_RE, (m) => {
    const c = m[2] ?? m[3];
    return c != null && +c >= CRI_ZONDER_LABEL[0] && +c <= CRI_ZONDER_LABEL[1];
  }],
  ["cri", CRI_C_LOS_RE, (m) => +m[1] >= CRI_ZONDER_LABEL[0] && +m[1] <= CRI_ZONDER_LABEL[1]],
];

export function specSpans(text: string): SpecSpan[] {
  if (!text) return [];
  const out: SpecSpan[] = [];
  for (const [field, re, toets] of SPAN_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      if (!toets || toets(m)) out.push({ field, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) g.lastIndex++; // nooit vastlopen op een lege match
    }
  }
  return out;
}

// ── Kleur-tokens ──────────────────────────────────────────────────────────────
// Catalogi coderen de kleur als los woord in de naam ("DISCOCO 53 WHITE",
// "MELAMPO W BRONZE", "DISCOCO 53 BLACK/GOLD"). Dezelfde conservatieve regel als
// hierboven: alleen een token dat VOLLEDIG uit bekende kleurwoorden bestaat telt als
// kleur — "C/5mt" of "WH" wordt nooit als kleur geraden (ontbrekend ≠ fout).
// Deze lijst is de ene bron voor kleur-herkenning; de zusterproduct-query
// (lib/repo/variants.ts, echte kleurvarianten op de review-kaart) hergebruikt hem.
const COLOR_TOKENS = new Set([
  // Engels (verreweg het gangbaarst in de bron-catalogi)
  "white", "black", "grey", "gray", "silver", "gold", "golden", "bronze",
  "brass", "chrome", "copper", "aluminium", "aluminum", "anthracite", "beige",
  "red", "blue", "green", "yellow", "orange", "pink", "brown", "ivory",
  "cream", "sand", "terracotta",
  // Nederlands
  "wit", "zwart", "grijs", "zilver", "goud", "brons", "messing", "chroom",
  "koper", "antraciet", "rood", "blauw", "groen", "geel", "oranje", "roze",
  "bruin", "ivoor", "creme", "crème",
]);

// Is dit hele token een kleur? Samengestelde kleuren met een slash ("BLACK/GOLD")
// tellen alleen als élk deel een kleurwoord is.
function isColorToken(token: string): boolean {
  const parts = token.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => COLOR_TOKENS.has(p));
}

export type NameColor = {
  // De herkende kleur-tokens, in naamvolgorde, lowercase (bv. ["white"] of ["black/gold"]).
  colors: string[];
  // De naam zónder kleur-tokens, genormaliseerd (lowercase, interpunctie → spatie).
  // Twee producten met dezelfde baseKey zijn zustervarianten van elkaar.
  baseKey: string;
};

// Haal kleur(en) uit een productnaam en lever de kleur-loze basissleutel op.
// Interpunctie wordt genormaliseerd zodat "SUSP." ≡ "SUSP"; de slash blijft staan
// zodat samengestelde kleuren ("BLACK/GOLD") als één token beoordeeld worden.
export function extractColorTokens(name: string): NameColor {
  const tokens = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const colors: string[] = [];
  const base: string[] = [];
  for (const t of tokens) {
    if (isColorToken(t)) colors.push(t);
    else base.push(t);
  }
  return { colors, baseKey: base.join(" ") };
}

// De kleur van een product zoals de naam hem draagt, of null als de naam geen
// herkenbaar kleurwoord bevat (nooit een geraden default).
export function colorFromName(name: string): string | null {
  const { colors } = extractColorTokens(name);
  return colors.length ? colors.join(" / ") : null;
}
