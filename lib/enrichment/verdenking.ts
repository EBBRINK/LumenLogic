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

import { FIELDS, NIET_DIMBAAR, wattKandidaten, type ParsedSpecs } from "./parser";

export type Veld = (typeof FIELDS)[number];

export type Verdenking = {
  veld: Veld;
  soort: string; // korte sleutel, bv. 'meerdere-tokens'
  uitleg: string; // wat er aan de hand is, in gewone taal
};

// ── Globale varianten van de parser-patronen ────────────────────────────────
// De parser neemt per veld de EERSTE match; hier tellen we álle voorkomens, want een tweede
// kandidaat in dezelfde naam is precies de reden om te twijfelen aan de eerste.
const G = {
  cri: /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*(\d{2,3})/gi,
  kelvin: /(\d{3,5})\s*K(?:elvin)?\b/gi,
  watt: /(\d+(?:[.,]\d+)?)\s*(?:watt|w)\b/gi,
  lumen: /(\d{2,6})\s*(?:lm|lumen)\b/gi,
  ip: /\bIP\s*:?\s*(\d{2})\b/gi,
  beam: /(\d{1,3})\s*(?:°|deg\b|graden\b)/gi,
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

// Kelvin over een bereik: "2700-6500K" (tunable white). De parser pakt hier 6500 — het getal
// vóór het streepje wordt niet door K gevolgd — maar wélke waarde "de" kleurtemperatuur is, is
// geen parseervraag maar een productvraag.
const KELVIN_BEREIK = /\d{3,5}\s*[-–]\s*\d{3,5}\s*K\b/i;
const TUNABLE = /\b(?:TW|TUNABLE|DIM\s*TO\s*WARM|D2W|DTW)\b/i;

// Bundelhoek versus kantelhoek: een "30°" naast een kantelwoord is waarschijnlijk niet de bundel.
const KANTEL = /\b(?:TILT|KANTEL|ADJ(?:USTABLE)?|SWIVEL|ROTAT\w*)\b/i;
const HOEK_BEREIK = /\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:°|deg\b)/i;

// Dimbaarheid is het enige veld met een ONTKENNING die de parser niet zag: "NON-DIM" bevat
// het token DIM, en /\bDIM\b/ matcht dat (het streepje is een woordgrens).
//
// Sinds 30 jul onderdrukt `parseDimmable` het veld zélf bij een ontkenning, dus deze vlag hoort
// in de praktijk niet meer te vuren. De regel blijft staan als REGRESSIETOETS: gaat de parser
// ooit weer voorstellen op een ontkennende naam, dan ziet meet-verdenking.ts dat meteen. NIET_DIMBAAR
// komt daarom uit parser.ts (zie de import bovenaan) — twee kopieën zouden ongemerkt uiteenlopen
// en dan zou de wachter de wacht niet meer kunnen houden.
const DIM_PROTOCOLLEN = [/\bDALI\b/i, /\bTRIAC\b/i, /\bPHASE\b/i, /\b[01]\s*-\s*10\s*V\b/i];

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
  /^\s*(?:LED\s+)?(?:POW(?:ER)?\.?\s*SUPPLY|ALIM(?:ENT|T)?\.?\s*LED|ALIMENTATOR\w*|ALIMENTATORE|DRIVER|CONVERTER|TRAFO|TRANSF?(?:ORMATOR|ORMER)?\b|NETZTEIL|EQUIPO|REMOTE\s+KIT|VOEDING|POWER\s+FEED)/i;

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

// Een naam die halverwege ophoudt. Twee signalen: eindigen op een los koppel-/scheidingsteken,
// of op een LOSSE eenheid-aanduiding die zonder getal betekenisloos is ("… 3000" gevolgd door
// niets, of een kale "CRI" aan het eind).
//
// Bewust NIET in deze lijst: DALI en LED. Die zijn complete woorden en staan in duizenden
// XAL-namen legitiem aan het eind ("… 10,2W cob LED 2700K 220-240V DALI"). Ze meenemen vlagde
// bij de eerste testronde elke normale naam als afgekapt — een filter dat alles verdenkt,
// selecteert niets.
const AFGEKAPT = /(?:[-–/,]\s*$)|(?:\b(?:CRI|IP|LM|KELVIN)\s*$)|(?:\s\d+[.,]?\d*\s*$)/i;

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
  if (
    ONDERDEEL_START.test(naam) ||
    ONDERDEEL_STERK.test(naam) ||
    isLosseLamp ||
    DRIVER_TYPECODE.test(naam)
  ) {
    for (const veld of FIELDS) {
      if (specs[veld] === undefined) continue;
      vlag(
        veld,
        "product-is-onderdeel",
        `de naam begint met een onderdeel (voeding/driver/trafo), dus deze waarde beschrijft dat onderdeel en niet een armatuur`,
      );
    }
    return uit; // verder toetsen heeft geen zin: alles van dit product zwijgt
  }

  // ── per veld: meer dan één kandidaat ──────────────────────────────────────
  const paren: [Veld, RegExp][] = [
    ["cri", G.cri],
    ["kelvin", G.kelvin],
    ["maxWattage", G.watt],
    ["lumenOutput", G.lumen],
    ["ipValue", G.ip],
    ["beamAngle", G.beam],
  ];
  for (const [veld, re] of paren) {
    if (specs[veld] === undefined) continue;
    // Wattage telt zijn kandidaten via de parser zelf: wat die als typecode of typemaat
    // verwerpt, mag hier geen tweede kandidaat meer zijn. Anders oordelen twee lagen
    // onafhankelijk over hetzelfde teken — zie de kanttekening bij wattKandidaten().
    const meer =
      veld === "maxWattage"
        ? (() => {
            const uniek = [...new Set(wattKandidaten(naam).map((v) => v.replace(",", ".")))];
            return uniek.length > 1 ? uniek : null;
          })()
        : meerdereWaarden(naam, re);
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

  // ── kelvin: bereik of tunable white ───────────────────────────────────────
  if (specs.kelvin !== undefined) {
    if (KELVIN_BEREIK.test(naam)) {
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
    if (AFGEKAPT.test(naam)) {
      for (const veld of gevuld) {
        vlag(veld, "afgekapt", "de naam lijkt afgekapt; wat erachter stond is onbekend");
      }
    }
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
