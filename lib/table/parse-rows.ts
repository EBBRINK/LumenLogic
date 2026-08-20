// Rijen → spec-regels (goal-import-meer-formaten, Bouwer A stap 2).
//
// Dit is het deterministische hart van de tabel-import: xlsx/csv/docx leveren
// allemaal hetzelfde tussenformaat (string[][] — één string-array per rij) en dit
// bestand maakt daar spec-regels van. GEEN AI: de rijen zijn al gestructureerd
// (arbitragebesluit 20 aug), dus een rij-mapper volstaat en ijzeren regel 2 blijft
// vanzelf geborgd.
//
// Twee heilige regels:
//   • RIJGRENZEN ZIJN HEILIG: elke rij wordt onafhankelijk gelezen, er is nergens
//     een `rows.join` over rijen heen — een cel kan nooit in een buurrij lekken.
//   • sourcePage = het 1-GEBASEERDE RIJNUMMER in het bronbestand (semantiek staat
//     ook bij spec_source in db/schema.ts): de Review-tab toont "Read from row N"
//     en dat nummer moet kloppen met wat de gebruiker in Excel ziet. Overgeslagen
//     rijen (leeg, koprij) schuiven dus NIET op.
import { parseProductName } from "@/lib/enrichment/parser";
import { splitBrandType } from "@/lib/pdf/armaturenboek";
import type { SpecLineInput } from "@/lib/repo/dossiers";

export type TableRows = string[][];

// Welke kolom welk veld draagt. Herkenning op de koprij; zonder koprij vallen we
// terug op de positionele volgorde van de bestaande CSV-plak-flow
// (code · aantal · merk · type — parseSpecCsv in lib/repo/dossiers.ts).
type ColumnField =
  | "fixtureCode"
  | "quantity"
  | "brandText"
  | "productText"
  | "zone"
  | "reqArticleCode"
  | "reqKelvin"
  | "reqCri"
  | "reqIp"
  | "reqWatt"
  | "reqLumen";

// Kopwoord → veld, op genormaliseerde vorm (lowercase, alleen [a-z0-9]). De lijst is
// bewust NL+EN: armaturenstaten komen van bestekpartijen in beide talen.
const HEADER_KEYS: [string, ColumnField][] = [
  ["code", "fixtureCode"],
  ["armatuurcode", "fixtureCode"],
  ["armatuur", "fixtureCode"],
  ["lichtcode", "fixtureCode"],
  ["fixture", "fixtureCode"],
  ["fixturecode", "fixtureCode"],
  ["codering", "fixtureCode"],
  ["aantal", "quantity"],
  ["stuks", "quantity"],
  ["qty", "quantity"],
  ["quantity", "quantity"],
  ["amount", "quantity"],
  ["merk", "brandText"],
  ["fabricaat", "brandText"],
  ["fabrikant", "brandText"],
  ["brand", "brandText"],
  ["manufacturer", "brandText"],
  ["type", "productText"],
  ["omschrijving", "productText"],
  ["product", "productText"],
  ["description", "productText"],
  ["armatuurtype", "productText"],
  // gecombineerde merk+type-kolom uit Nederlandse bestekken: splitBrandType haalt
  // het merk er per regel uit, precies zoals het PDF-pad dat doet
  ["fabrikanttype", "productText"],
  ["fabricaattype", "productText"],
  ["merktype", "productText"],
  ["zone", "zone"],
  ["ruimte", "zone"],
  ["ruimtenaam", "zone"],
  ["room", "zone"],
  ["locatie", "zone"],
  ["location", "zone"],
  ["artikelnummer", "reqArticleCode"],
  ["artikelnr", "reqArticleCode"],
  ["artnr", "reqArticleCode"],
  ["artikelcode", "reqArticleCode"],
  ["articlenumber", "reqArticleCode"],
  ["articlecode", "reqArticleCode"],
  ["sku", "reqArticleCode"],
  ["kelvin", "reqKelvin"],
  ["kleurtemperatuur", "reqKelvin"],
  ["cct", "reqKelvin"],
  ["cri", "reqCri"],
  ["ra", "reqCri"],
  ["ip", "reqIp"],
  ["ipwaarde", "reqIp"],
  ["watt", "reqWatt"],
  ["wattage", "reqWatt"],
  ["vermogen", "reqWatt"],
  ["lumen", "reqLumen"],
  ["lichtstroom", "reqLumen"],
];
const HEADER_MAP = new Map(HEADER_KEYS);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Welke sleutels ook als DEELWOORD mogen binden, langste eerst. Twee begrenzingen,
// allebei bewust (goal-bestek-kopwoorden):
//   • PREFIX, geen substring — substring maakt korte sleutels giftig ("opdracht"
//     bevat "ra", "principe" bevat "ip"). Prijs: een kop "Naam ruimte" bindt niet;
//     daarvoor is de woordenlijst hierboven de route.
//   • MINIMAAL 4 TEKENS — "ip", "ra", "cri", "cct", "qty" en "sku" doen alleen exact
//     mee. De kortste deelwoord-sleutels zijn "code", "type", "zone", "merk", "room".
const PREFIX_MIN_LEN = 4;
const PREFIX_KEYS = HEADER_KEYS.filter(([k]) => k.length >= PREFIX_MIN_LEN).sort(
  (a, b) => b[0].length - a[0].length,
);

// Welke cellen van deze rij een kopwoord dragen, plus hoeveel daarvan EXACT waren.
// Dat onderscheid draagt de drempel in detectHeader: een deelwoord mag een echte
// koprij verbreden, maar nooit in zijn eentje een datarij tot koprij uitroepen.
function headerHits(row: string[]): {
  hits: Map<number, ColumnField>;
  exact: number;
} {
  const hits = new Map<number, ColumnField>();
  const taken = new Set<ColumnField>();
  const cells = row.map(norm);
  let exact = 0;

  // Pass 1 — exact. Eerste kolom met een kopwoord wint ("Type" naast "Type opmerking").
  cells.forEach((cell, i) => {
    const field = HEADER_MAP.get(cell);
    if (field && !taken.has(field)) {
      hits.set(i, field);
      taken.add(field);
      exact++;
    }
  });

  // Pass 2 — deelwoord, uitsluitend op velden die pass 1 niet claimde en cellen die
  // pass 1 niet bond. Dát is de tiebreak: "Ruimtenr." in kolom A is een treffer op
  // "ruimte", maar zone hangt dan al aan "Ruimtenaam" in kolom B en de treffer valt
  // dood — deterministisch, zonder negeerlijst.
  //
  // Binnen één cel wint de langste sleutel ONDER DE NOG VRIJE VELDEN (PREFIX_KEYS is
  // op lengte gesorteerd, de find pakt dus de langste die past). Is het veld van de
  // langste treffer al bezet, dan bindt de eerstvolgende kortere die nog vrij is:
  // "Fabrikanttype-aanduiding" náást een "Fabrikant/type"-kolom bindt brandText, want
  // productText hangt dan al aan de buurkolom. Per veld wint de eerste kolom.
  cells.forEach((cell, i) => {
    if (hits.has(i)) return;
    const hit = PREFIX_KEYS.find(([k, f]) => !taken.has(f) && cell.startsWith(k));
    if (!hit) return;
    hits.set(i, hit[1]);
    taken.add(hit[1]);
  });

  return { hits, exact };
}

// Koprij-detectie: de eerste rij binnen de eerste 10 met ≥ 2 herkende kopwoorden,
// waarvan minstens één EXACT. Eén treffer is te dun ("Type" komt ook in gewone cellen
// voor); twee betekent dat de rij als geheel een kop is. De exacte-eis sluit het gat
// dat deelwoorden anders openen: een datarij als ["Code 12","2","XAL","Type A"] haalt
// twee deelwoord-treffers en zou zichzelf tot koprij bombarderen, waarna alles erboven
// wegvalt. Geen koprij gevonden → positioneel (CSV-plak-vorm).
const HEADER_SCAN_ROWS = 10;
export function detectHeader(rows: TableRows): {
  headerRow: number | null;
  columns: Map<number, ColumnField>;
} {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const { hits, exact } = headerHits(rows[r]);
    if (hits.size >= 2 && exact >= 1) return { headerRow: r, columns: hits };
  }
  return { headerRow: null, columns: new Map() };
}

const POSITIONAL: ColumnField[] = [
  "fixtureCode",
  "quantity",
  "brandText",
  "productText",
];

function intOrNull(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(",", "."), 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(s: string | undefined): number | null {
  if (!s) return null;
  // "17,9" en "17.9 W" allebei toegestaan; eenheden erachter vallen weg.
  const m = s.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export type ParseRowsResult = {
  lines: SpecLineInput[];
  headerRow: number | null; // 0-gebaseerde index van de koprij (null = positioneel)
  rawRows: number; // aantal rijen in het bronbestand (incl. kop en lege rijen)
};

// De mapper zelf. brandNames voedt splitBrandType voor het geval er géén merk-kolom
// is en het fabricaat in de omschrijving verstopt zit (zelfde helper als het PDF- en
// OCR-pad — de drie routes lopen nooit uiteen in wat een merk is).
export function parseSpecLinesFromRows(
  rows: TableRows,
  brandNames: string[],
): ParseRowsResult {
  const { headerRow, columns } = detectHeader(rows);
  // Twee leesstrategieën, één keer benoemd: mét koprij weten we waar de kolommen
  // staan, positioneel gokken we op de CSV-plak-volgorde. Drie regels hieronder
  // hangen van dat onderscheid af (zone doorvullen, lege codering, dedup).
  const positional = headerRow == null;
  const lines: SpecLineInput[] = [];
  const seen = new Set<string>();
  // Laatst gelezen ruimtenaam, voor de samengevoegde-cel-layout hieronder.
  let zoneCarry: string | null = null;

  for (let r = 0; r < rows.length; r++) {
    if (headerRow != null && r <= headerRow) continue; // kop + alles erboven is geen data
    const row = rows[r].map((c) => c.trim());
    if (row.every((c) => c.length === 0)) continue;

    const cell = (field: ColumnField): string | undefined => {
      if (!positional) {
        for (const [i, f] of columns) if (f === field) return row[i];
        return undefined;
      }
      const i = POSITIONAL.indexOf(field);
      return i >= 0 ? row[i] : undefined;
    };

    // Ruimtenaam vult DOOR over lege cellen heen. Een armaturenstaat is een
    // samengevoegde-cel-layout: de ruimte staat alleen op de eerste regel en geldt tot
    // de volgende — precies zoals een mens de kolom leest. Zonder dit hield de
    // armaturenstaat van een woning 16 van de 42 regels zonder zone en viel alles in
    // één naamloze groep bij de zone-subtotalen (lib/repo/estimate.ts). Het doorvullen
    // staat vóór de fixtureCode-controle, zodat ook een rij zonder armatuur de
    // ruimtenaam kan zetten. Tussenkopjes ("VERDIEPING") staan in een andere kolom en
    // lekken dus niet. Alleen bij een herkende koprij: positioneel is er geen
    // zone-kolom, en dan mag er ook niets doorgevuld worden.
    const zoneCell = positional ? undefined : cell("zone")?.trim();
    if (zoneCell) zoneCarry = zoneCell;

    const fixtureCode = (cell("fixtureCode") ?? "").trim();
    const productCell = cell("productText")?.trim() || null;
    // Een rij ZONDER codering. Positioneel is een lege code het enige signaal dat een
    // rij geen data is (meegeplakte rommel boven een CSV-plak) — daar blijft de guard
    // dus staan. Mét koprij weten we wél waar de kolommen staan: een rij met een
    // product maar zonder codering is gewoon een armatuur waarvoor de bestekschrijver
    // geen positiecode had. In de armaturenstaat van een woning zijn dat rij 97 (3x
    // Toldbod) en rij 99, samen 5 van de 86 stuks. Een rij die álleen een getal draagt
    // is dat níet: de totaalregel "Aantallen = 86" onderaan het bestek heeft geen
    // product en hoort geen spec-regel te worden.
    if (!fixtureCode && (positional || !productCell)) continue;
    // positioneel pad: een meegeplakte kolomkop is geen spec-regel (parseSpecCsv-regel)
    if (positional && /^(code|armatuurcode)$/i.test(fixtureCode)) continue;
    // Dubbele code: alleen op het POSITIONELE pad wint de eerste rij. Dáár is een
    // dubbele code hetzelfde signaal als in parseTocText (lib/pdf/armaturenboek.ts:110)
    // — een armatuurcode ÍS een sleutel zodra er geen kolomstructuur is om op te
    // vertrouwen, en de bestaande CSV-plak-test pint dat vast. (parseSpecCsv zelf
    // dedupt níet; die leest een blok dat de gebruiker net zelf geplakt heeft.)
    // Mét koprij vervalt de dedup: in een tabelbestek is "Codering" een groeps- of
    // positielabel dat bewust herhaald wordt, en is elke rij per constructie een eigen
    // regel. Gemeten op de armaturenstaat van een woning: dedup op code gooide 9 van de
    // 42 regels weg, waaronder twee rijen die een ánder armatuur met dezelfde codering
    // droegen (goal-bestek-kopwoorden, besloten 20 aug).
    if (positional) {
      if (seen.has(fixtureCode)) continue;
      seen.add(fixtureCode);
    }

    let brandText = cell("brandText")?.trim() || null;
    let productText = productCell;
    // Geen merk-kolom (of leeg) maar wél een omschrijving → zelfde merk-herkenning
    // als het PDF-pad. De woorden vóór de merknaam (zaalnamen) vallen daar bewust weg.
    if (!brandText && productText) {
      const split = splitBrandType(productText, brandNames);
      if (split.brand) {
        brandText = split.brand;
        productText = split.type || null;
      }
    }

    // Inline specs uit de omschrijving ("… 17,9W 3000K IP44") — deterministisch,
    // zoals parseTocText. Een expliciete kolomwaarde wint altijd van de inline lezing.
    const inline = productText ? parseProductName(productText) : {};

    const quantity = intOrNull(cell("quantity"));
    lines.push({
      fixtureCode,
      quantity: quantity ?? 1, // tabel zonder aantallen → default 1 (zoals de TOC)
      zone: zoneCarry,
      brandText,
      productText,
      reqArticleCode: cell("reqArticleCode")?.trim() || null,
      reqKelvin: intOrNull(cell("reqKelvin")) ?? inline.kelvin ?? null,
      reqCri: intOrNull(cell("reqCri")) ?? inline.cri ?? null,
      reqIp: cell("reqIp")?.trim() || inline.ipValue || null,
      reqWatt: numOrNull(cell("reqWatt")) ?? inline.maxWattage ?? null,
      reqLumen: intOrNull(cell("reqLumen")) ?? inline.lumenOutput ?? null,
      reqBeamAngle: inline.beamAngle ?? null,
      reqDimmable: inline.dimmable ?? null,
      sourcePage: r + 1, // 1-gebaseerd RIJNUMMER in het bronbestand — heilig
    });
  }

  return { lines, headerRow, rawRows: rows.length };
}

// Controlespoor: de rijen als markdown-tabel (rawMarkdown op de run, zelfde rol als
// pagesToMarkdown bij PDF). Cap ~2 MB, zelfde grens als het PDF-spoor.
export const ROWS_MARKDOWN_CAP = 2 * 1024 * 1024;
const TRUNCATION_NOTE = "> truncated at 2 MB";

export function rowsToMarkdown(rows: TableRows): string {
  const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => esc(r[i] ?? "")).join(" | ")} |`;
  const md = rows
    .flatMap((r, i) =>
      i === 0
        ? [line(r), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`]
        : [line(r)],
    )
    .join("\n");
  if (md.length <= ROWS_MARKDOWN_CAP) return md;
  return `${md.slice(0, ROWS_MARKDOWN_CAP)}\n\n${TRUNCATION_NOTE}`;
}
