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
function parseWatt(name: string): number | undefined {
  const raw = firstCapture(name, WATT_RE);
  if (raw == null) return undefined;
  const w = toNumber(raw);
  return w > 0 ? w : undefined;
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
