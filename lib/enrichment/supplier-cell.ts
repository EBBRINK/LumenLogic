// Normalisatie van één rauwe leverancierscel → één van vier uitkomsten. Puur, geen database,
// geen I/O — zodat elke regel hieronder met een tabeltest te bewijzen is vóórdat er data langs
// komt, en zodat de bouw-/controleagents hem kunnen lezen zonder verbinding.
//
// ── Waarom dit vóór de voorstel-lijst gebeurt en niet in toColumnValue ────────
// `toColumnValue` (lib/repo/enrichment.ts:154) doet voor kelvin/cri/lumenOutput een parseInt en
// geeft voor de rest de string ONGEWIJZIGD terug. `maxWattage` en `beamAngle` zijn
// numeric-kolommen (db/schema.ts:275,279), dus een cel "OHNE LM" belandt daar ongefilterd in
// `db.update(products)` — Postgres weigert hem, `publishRun` heeft geen transactie en doet per
// product een losse update, en de lus breekt HALVERWEGE af (deel toegepast, status nog
// 'steekproef'). En op een tekstkolom is het erger: `fieldIsEmpty` telt alleen null en "" als
// leeg (:163), dus een gepubliceerde "-" in ip_value blokkeert die kolom PERMANENT voor de
// waarde die er wél hoort. publishRun is onomkeerbaar.
// Daarom: wat geen schone waarde is, wordt hier nooit een voorstel.
//
// ── De vier uitkomsten ───────────────────────────────────────────────────────
//   waarde        → mag een voorstel worden (genormaliseerd: is er iets aan gedaan?)
//   plaatshouder  → de leverancier zegt expliciet "geen data"; besluit 4 (grijze vlag), dus
//                   geen voorstel, wél tellen in het runrapport
//   bereik        → een echte eigenschap die onze kolom niet kan uitdrukken; ontwerpvraag,
//                   nooit stilzwijgend platslaan naar één getal
//   onbekend      → we snappen deze cel niet. Fail-closed: geen voorstel, wél tellen.
//
// Alle getallen in de commentaren zijn gemeten op `brink_serien_raw` (1.956 rijen, Supabase
// uvmeytxejlzvdgjgthmr, read-only, 30 jul 2026).

export type CelUitkomst =
  | { soort: "waarde"; waarde: string; genormaliseerd: boolean; uitleg?: string }
  | { soort: "plaatshouder"; reden: string }
  | { soort: "bereik"; label: string; van: number | null; tot: number | null }
  | { soort: "onbekend"; reden: string };

// Cellen waarmee de leverancier "hier is geen data" zegt. Gemeten in Serien: "-" (237× in
// CCT K, 316× in CRI Ra, 391× in Regelung, 48× in Schutzklasse), "OHNE LM" (70×, Duits voor
// "zonder lichtbron") en het kale "LM" (24×, Leuchtmittel — dubbelzinnig, dus geen data).
const PLAATSHOUDERS = new Set(["-", "--", "LM", "OHNE LM", "N/A", "NA"]);

// Leeg of plaatshouder? Eén plek, zodat elk veld dezelfde definitie gebruikt.
function plaatshouder(cel: string | null | undefined): CelUitkomst | null {
  if (cel == null) return { soort: "plaatshouder", reden: "null" };
  const t = cel.trim();
  if (t === "") return { soort: "plaatshouder", reden: "leeg" };
  if (PLAATSHOUDERS.has(t.toUpperCase()))
    return { soort: "plaatshouder", reden: `leverancier zegt geen data ("${t}")` };
  return null;
}

// ── Kelvin ───────────────────────────────────────────────────────────────────
// Schoon: exact vier cijfers in het reële LED-bereik. Diezelfde 2000–8000-grens gebruikt de
// naam-parser (lib/enrichment/parser.ts:79); twee bronnen die hetzelfde veld vullen horen niet
// twee verschillende opvattingen te hebben over wat een geldige kelvin is.
// Gemeten in Serien's `CCT K`: 2700 (540×), 3000 (531×), 4000 (212×) = 1.283 schone waarden.
const KELVIN_SCHOON = /^(\d{4})$/;

// De bereikvormen, gemeten: vijf spellingen van hetzelfde begrip plus twee afkortingen.
//   DIM2WARM 2200-3000 (46) · TUNABLE WHITE 2200-5000 (44) · D2W (23) ·
//   DIM2WARM 1800-3000 (18) · TUNEABLE WHITE 2200-4000 (16) · TW (16) ·
//   TUNEABLE WHITE 2700-5000 (8) · TUNABLEWHITE 2200-5000 (2)   = 173 rijen (8,8 %)
// Let op de drie valkuilen die een naïeve regel mist: "TUNEABLE" (met extra e), "TUNABLEWHITE"
// (zonder spatie) en de kale afkortingen "TW"/"D2W" die geen getallen dragen.
const BEREIK_LABEL = /\b(?:DIM\s*2\s*WARM|D2W|TUN[EA]*ABLE\s*WHITE|TUNABLEWHITE|TW)\b/i;
// Twee kelvinwaarden met een streep ertussen. De streep mag een gewoon koppelteken zijn of een
// en-streep: Serien gebruikt in `Regelung` aantoonbaar een en-streep ("TRIAC + 0–10 V"), dus
// aannemen dat een streep altijd U+002D is, is hier gemeten onveilig.
const BEREIK_GETALLEN = /(\d{4})\s*[-–—]\s*(\d{4})/;

export function klasseerKelvin(cel: string | null | undefined): CelUitkomst {
  const ph = plaatshouder(cel);
  if (ph) return ph;
  const t = cel!.trim();

  const schoon = KELVIN_SCHOON.exec(t);
  if (schoon) {
    const k = parseInt(schoon[1], 10);
    if (k < 2000 || k > 8000)
      return { soort: "onbekend", reden: `${k} K valt buiten 2000–8000` };
    return { soort: "waarde", waarde: String(k), genormaliseerd: false };
  }

  // Een bereik herkennen we aan het LABEL, niet aan de getallen: "TW" en "D2W" dragen geen
  // getallen maar zijn wél een bereik. Omgekeerd is een cel met twee getallen zonder label
  // niet automatisch tunable white — die valt hieronder in 'onbekend' en zwijgt dus.
  if (BEREIK_LABEL.test(t)) {
    const g = BEREIK_GETALLEN.exec(t);
    return {
      soort: "bereik",
      label: t,
      van: g ? parseInt(g[1], 10) : null,
      tot: g ? parseInt(g[2], 10) : null,
    };
  }

  // Losse getallen zonder label — bv. "2200-5000". NOOIT stilzwijgend de eerste pakken: dat is
  // precies wat parseInt("2200-5000") doet (stil 2200) en waarom de scheiding hier hoort.
  if (BEREIK_GETALLEN.test(t)) {
    const g = BEREIK_GETALLEN.exec(t)!;
    return { soort: "bereik", label: t, van: parseInt(g[1], 10), tot: parseInt(g[2], 10) };
  }

  return { soort: "onbekend", reden: `geen kelvin te herkennen in "${t}"` };
}

// ── CRI ──────────────────────────────────────────────────────────────────────
// Gemeten in Serien's `CRI Ra`: er is GEEN ENKELE schone waarde. Alle 1.464 bruikbare cellen
// dragen een ondergrens-operator: ">97" (564) · ">90" (455) · ">95" (230) · "> 95" (120) ·
// ">80" (48) · "> 90" (47). Let op dat 90 en 95 in twee spellingen voorkomen (met én zonder
// spatie) en 97 en 80 maar in één — een regel die de spatie niet toestaat, mist 167 rijen.
//
// Waarom de operator strippen hier semantisch mag: `judgeCri` toetst `delivered >= requested`
// ([tolerances.ts:85](lib/matching/tolerances.ts:85)). ">97" betekent "minstens 97"; 97 in de
// kolom is dus een ondergrens die door een ondergrens-toets gaat. Dat is niet lossy in de
// richting die telt. Bij kelvin mag dit NIET — `judgeKelvin` eist exacte gelijkheid.
const CRI_SCHOON = /^(\d{2,3})$/;
const CRI_ONDERGRENS = /^(?:>|>=|≥)\s*(\d{2,3})$/;
const CRI_BOVENGRENS = /^(?:<|<=|≤)\s*(\d{2,3})$/;

export function klasseerCri(cel: string | null | undefined): CelUitkomst {
  const ph = plaatshouder(cel);
  if (ph) return ph;
  const t = cel!.trim();

  const binnenBereik = (n: number) =>
    n > 0 && n <= 100
      ? null
      : ({ soort: "onbekend", reden: `CRI ${n} valt buiten 1–100` } as CelUitkomst);

  const schoon = CRI_SCHOON.exec(t);
  if (schoon) {
    const n = parseInt(schoon[1], 10);
    return binnenBereik(n) ?? { soort: "waarde", waarde: String(n), genormaliseerd: false };
  }

  const onder = CRI_ONDERGRENS.exec(t);
  if (onder) {
    const n = parseInt(onder[1], 10);
    return (
      binnenBereik(n) ?? {
        soort: "waarde",
        waarde: String(n),
        genormaliseerd: true,
        uitleg: `"${t}" → ${n} (ondergrens; judgeCri toetst delivered >= requested)`,
      }
    );
  }

  // Een BOVENgrens ("<90") is als geleverde waarde onbruikbaar: hij zegt hoe goed het product
  // NIET is. Die zwijgt. Gemeten komt hij bij Serien niet voor; de regel staat er zodat hij
  // niet per ongeluk als ondergrens wordt gelezen als een ander merk hem wél gebruikt.
  if (CRI_BOVENGRENS.test(t))
    return { soort: "onbekend", reden: `bovengrens "${t}" is geen geleverde CRI` };

  return { soort: "onbekend", reden: `geen CRI te herkennen in "${t}"` };
}

// ── IP-klasse ────────────────────────────────────────────────────────────────
// Gemeten in Serien's `Schutzart`: IP20 (1.439) · IP40 (240) · IP30 (159) · IP44 (48), en
// NUL plaatshouders. 1.886 van 1.956 gevuld (96,4 %) — de schoonste kolom in de tabel.
//
// Fail-closed op een KAAL getal: `parseIp` in de matcher pakt met /(\d{2})/ het eerste
// tweetal uit wat er ook staat ([tolerances.ts:62](lib/matching/tolerances.ts:62)), dus een
// cel "20" zou daar als IP20 doorgaan. Wij eisen het IP-voorvoegsel, want een kaal "20" in een
// kolom die ook 'Schutzklasse' had kunnen zijn is geen IP-klasse maar een gok.
const IP_SCHOON = /^IP\s*(\d{2})$/i;

export function klasseerIp(cel: string | null | undefined): CelUitkomst {
  const ph = plaatshouder(cel);
  if (ph) return ph;
  const t = cel!.trim();
  const m = IP_SCHOON.exec(t);
  if (!m) return { soort: "onbekend", reden: `geen IP-klasse te herkennen in "${t}"` };
  const genormaliseerd = t.toUpperCase() !== `IP${m[1]}`;
  return { soort: "waarde", waarde: `IP${m[1]}`, genormaliseerd };
}

// ── Wattage ──────────────────────────────────────────────────────────────────
// Gemeten in Serien's `Systemleistung W`: 30 distincte waarden, ALLE kale getallen (20, 33, 82,
// 40, …), 1.422 gevuld en nul plaatshouders. "Systemleistung" is het opgenomen vermogen van het
// hele armatuur inclusief driver — dus een armatuureigenschap, niet die van een losse lamp.
// Komma-decimaal → punt, want de kolom is numeric.
const WATT_SCHOON = /^(\d+(?:[.,]\d+)?)$/;

export function klasseerWatt(cel: string | null | undefined): CelUitkomst {
  const ph = plaatshouder(cel);
  if (ph) return ph;
  const t = cel!.trim();
  const m = WATT_SCHOON.exec(t);
  if (!m) return { soort: "onbekend", reden: `geen wattage te herkennen in "${t}"` };
  const genormaliseerd = m[1].includes(",");
  const w = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(w) || w <= 0)
    return { soort: "onbekend", reden: `wattage "${t}" is niet positief` };
  return {
    soort: "waarde",
    waarde: String(w),
    genormaliseerd,
    uitleg: genormaliseerd ? `"${t}" → ${w} (komma-decimaal)` : undefined,
  };
}

// ── Dimprotocol ──────────────────────────────────────────────────────────────
// Gemeten in Serien's `Regelung`, 14 distincte waarden. De partitie over de 1.955 gekoppelde
// producten: 1.264 met een dimprotocol · 132 die "niet dimbaar" zeggen (ON/OFF, ON/OFF+SENSOR) ·
// 118 zonder dimgegeven (SENSORIK, INTEGR.) · 441 plaatshouder of null.
//
// ── Waarom samengestelde cellen juist VEILIG zijn ────────────────────────────
// `judgeDimmable` normaliseert weg wat geen letter of cijfer is en doet dan een
// substring-toets in BEIDE richtingen ([tolerances.ts:119](lib/matching/tolerances.ts:119)).
// Een bestek dat DALI vraagt tegen een product met "DALI 2CH + CASAMBI" geeft dus groen — de
// gevraagde string zit erin. Samengestelde protocollen doorgeven is daarmee niet slordig maar
// correct: het armatuur ondersteunt ze werkelijk allebei.
//
// Wat wél moet zwijgen is "ON/OFF": dat is de AFWEZIGHEID van dimmen. In een kolom die
// `dimmable` heet zou die waarde door judgeDimmable als "ander protocol" (geel) worden gelezen
// in plaats van als "kan niet dimmen", en dat is een verkeerd feit. Onze kolom kan dat niet
// uitdrukken; daarom plaatshouder, en de 132 rijen staan als geregistreerde ontwerpvraag in het
// runrapport in plaats van als stil gat.
const PROTOCOLLEN: [string, RegExp][] = [
  ["DALI", /\bDALI\b/i],
  ["TRIAC", /\bTRIAC\b/i],
  ["CASAMBI", /\bCASAMBI\b/i],
  // 0–10 V / 1-10V, met koppelteken, en-streep of niets ertussen. Serien schrijft hier
  // aantoonbaar een EN-STREEP ("TRIAC + 0–10 V", 20×) — een regel met alleen [-] mist die.
  ["0-10V", /\b[01]\s*[-–—]?\s*10\s*V\b/i],
];
const ZEGT_NIET_DIMBAAR = /\bON\s*\/?\s*OFF\b/i;

export function klasseerDimprotocol(cel: string | null | undefined): CelUitkomst {
  const ph = plaatshouder(cel);
  if (ph) return ph;
  const t = cel!.trim();

  const gevonden = PROTOCOLLEN.filter(([, re]) => re.test(t)).map(([naam]) => naam);
  if (gevonden.length > 0) {
    const waarde = gevonden.join(" + ");
    return {
      soort: "waarde",
      waarde,
      genormaliseerd: waarde !== t.toUpperCase(),
      uitleg: waarde === t.toUpperCase() ? undefined : `"${t}" → ${waarde}`,
    };
  }

  if (ZEGT_NIET_DIMBAAR.test(t))
    return {
      soort: "plaatshouder",
      reden: `"${t}" zegt niet-dimbaar; onze dimmable-kolom kan dat niet uitdrukken zonder judgeDimmable te misleiden`,
    };

  // SENSORIK (aanwezigheidsdetectie) en INTEGR. zijn geen dimprotocol. Fail-closed: zwijgen.
  return { soort: "onbekend", reden: `geen dimprotocol te herkennen in "${t}"` };
}

// De normalisatoren als benoemde verzameling, zodat de toewijzingstabel er per kolom naar kan
// verwijzen en een test kan afdwingen dat elke 'armatuur'-kolom er precies één noemt.
export const NORMALISATOREN = {
  kelvin: klasseerKelvin,
  cri: klasseerCri,
  ip: klasseerIp,
  watt: klasseerWatt,
  dimprotocol: klasseerDimprotocol,
} as const;

export type NormalisatorNaam = keyof typeof NORMALISATOREN;
