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

import { FIELDS, type ParsedSpecs } from "./parser";

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

// Dimbaarheid is het enige veld met een ONTKENNING die de parser niet ziet: "NON-DIM" bevat
// het token DIM, en /\bDIM\b/ matcht dat (het streepje is een woordgrens). De parser zegt dan
// "dimbaar" terwijl de naam het tegendeel zegt.
const NIET_DIMBAAR =
  /\b(?:NON[\s-]*DIM\w*|NOT[\s-]*DIM\w*|NIET[\s-]*DIMBAAR|EXCL\.?\s*DIM\w*|ZONDER[\s-]*DIM\w*|NO[\s-]*DIM\b)/i;
const DIM_PROTOCOLLEN = [/\bDALI\b/i, /\bTRIAC\b/i, /\bPHASE\b/i, /\b[01]\s*-\s*10\s*V\b/i];

// Getallen die bij een bijgeleverd of uitgesloten onderdeel horen in plaats van bij het armatuur.
const ACCESSOIRE = /\b(?:EXCL|INCL|SPARE|ACCESS\w*|DRIVER|CONVERTER|TRAFO|ADAPTER|BRACKET)\b/i;

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
  maxWattage: [0.5, 1000],
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
    const meer = meerdereWaarden(naam, re);
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
