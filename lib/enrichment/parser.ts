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
const BEAM_RE = /(\d{1,3})\s*(?:°|deg\b|graden\b)/i;
const LUMEN_RE = /(\d{2,6})\s*(?:lm|lumen)\b/i;
// Dimbaarheid kent geen capture-groep maar wel een herkenbare span; de losse tests in
// parseDimmable blijven leidend voor de WAARDE, dit patroon alleen voor de span.
const DIMMABLE_SPAN_RE = /\b(?:DALI|TRIAC|PHASE|[01]\s*-\s*10\s*V|DIM(?:MABLE)?)\b/i;

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
  /\b\d+\s+W-W\b/i, // typemaat gevolgd door de kleurcode W-W ("EASY KAP 80 W-W")
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
  if (/[A-Za-z]$/.test(kop) && /\d\s+W/i.test(treffer)) return true;
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

// Kleurtemperatuur: 3-5 cijfers gevolgd door K/Kelvin. Alleen het reële LED-bereik
// 2000–8000 K telt; daarbuiten (bv. een toevallige "9000K" of "1500K") wordt genegeerd —
// beter niets dan een verkeerde kelvin.
function parseKelvin(name: string): number | undefined {
  const raw = firstCapture(name, KELVIN_RE);
  if (raw == null) return undefined;
  const k = parseInt(raw, 10);
  return k >= 2000 && k <= 8000 ? k : undefined;
}

// CRI/Ra (kleurweergave-index), optioneel met een label-dubbele-punt en/of ≥/>=/>.
// "CRI90", "Ra90", "CRI≥90", "CRI 90", "CRI: ≥ 90", "CRI:90" → 90. OCR-labels uit
// armaturenboeken zetten vaak een ":" tussen het label en de waarde ("CRI: ≥90").
// Alleen 0–100 (index kan niet hoger).
function parseCri(name: string): number | undefined {
  const raw = firstCapture(name, CRI_RE);
  if (raw == null) return undefined;
  const cri = parseInt(raw, 10);
  return cri > 0 && cri <= 100 ? cri : undefined;
}

// IP-klasse: "IP20", "IP 44", "IP65", "IP: 44", "IP:44" → genormaliseerd "IP44"
// (uppercase, geen spatie). Zelfde OCR-dubbele-punt-scenario als bij CRI.
function parseIpValue(name: string): string | undefined {
  const raw = firstCapture(name, IP_RE);
  return raw == null ? undefined : `IP${raw}`;
}

// Bundelhoek: "36deg", "36°", "24 graden" → getal. Alleen 1–360°.
function parseBeamAngle(name: string): number | undefined {
  const raw = firstCapture(name, BEAM_RE);
  if (raw == null) return undefined;
  const a = parseInt(raw, 10);
  return a > 0 && a <= 360 ? a : undefined;
}

// Lumen: ALLEEN bij een expliciete 'lm'/'lumen'-eenheid. Een kaal getal in de naam (zoals
// de "1500" in "SASSO ... 1500 ...") is dubbelzinnig — dat kan net zo goed een maat/type
// zijn — dus dat parsen we bewust NIET als lumen. "800lm" → 800, "1200 lumen" → 1200.
function parseLumen(name: string): number | undefined {
  const raw = firstCapture(name, LUMEN_RE);
  if (raw == null) return undefined;
  const lm = parseInt(raw, 10);
  return lm > 0 ? lm : undefined;
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
  /\b(?:NON[\s-]*DIM\w*|NOT[\s-]*DIM\w*|NIET[\s-]*DIMBAAR|EXCL\.?\s*DIM\w*|ZONDER[\s-]*DIM\w*|NO[\s-]*DIM\b)/i;

// Dimbaarheid: herken het protocol. Specifiek vóór generiek (DALI/TRIAC/PHASE/x-10V vóór
// het kale "DIM"). Retour is de genormaliseerde protocolnaam.
function parseDimmable(name: string): string | undefined {
  if (NIET_DIMBAAR.test(name)) return undefined;
  if (/\bDALI\b/i.test(name)) return "DALI";
  if (/\bTRIAC\b/i.test(name)) return "TRIAC";
  if (/\bPHASE\b/i.test(name)) return "PHASE";
  const v = /\b([01])\s*-\s*10\s*V\b/i.exec(name);
  if (v) return `${v[1]}-10V`;
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

const SPAN_PATTERNS: [(typeof FIELDS)[number], RegExp][] = [
  ["maxWattage", WATT_RE],
  ["kelvin", KELVIN_RE],
  ["cri", CRI_RE],
  ["ipValue", IP_RE],
  ["beamAngle", BEAM_RE],
  ["lumenOutput", LUMEN_RE],
  ["dimmable", DIMMABLE_SPAN_RE],
];

export function specSpans(text: string): SpecSpan[] {
  if (!text) return [];
  const out: SpecSpan[] = [];
  for (const [field, re] of SPAN_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      out.push({ field, start: m.index, end: m.index + m[0].length });
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
