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
  ["zone", "zone"],
  ["ruimte", "zone"],
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

// Hoeveel cellen van deze rij een bekend kopwoord zijn.
function headerHits(row: string[]): Map<number, ColumnField> {
  const hits = new Map<number, ColumnField>();
  const taken = new Set<ColumnField>();
  row.forEach((cell, i) => {
    const field = HEADER_MAP.get(norm(cell));
    // eerste kolom met een kopwoord wint ("Type" naast "Type opmerking")
    if (field && !taken.has(field)) {
      hits.set(i, field);
      taken.add(field);
    }
  });
  return hits;
}

// Koprij-detectie: de eerste rij binnen de eerste 10 met ≥ 2 herkende kopwoorden.
// Eén treffer is te dun ("Type" komt ook in gewone cellen voor); twee betekent dat
// de rij als geheel een kop is. Geen koprij gevonden → positioneel (CSV-plak-vorm).
const HEADER_SCAN_ROWS = 10;
export function detectHeader(rows: TableRows): {
  headerRow: number | null;
  columns: Map<number, ColumnField>;
} {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const hits = headerHits(rows[r]);
    if (hits.size >= 2) return { headerRow: r, columns: hits };
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
  const lines: SpecLineInput[] = [];
  const seen = new Set<string>();

  for (let r = 0; r < rows.length; r++) {
    if (headerRow != null && r <= headerRow) continue; // kop + alles erboven is geen data
    const row = rows[r].map((c) => c.trim());
    if (row.every((c) => c.length === 0)) continue;

    const cell = (field: ColumnField): string | undefined => {
      if (headerRow != null) {
        for (const [i, f] of columns) if (f === field) return row[i];
        return undefined;
      }
      const i = POSITIONAL.indexOf(field);
      return i >= 0 ? row[i] : undefined;
    };

    const fixtureCode = (cell("fixtureCode") ?? "").trim();
    if (!fixtureCode) continue;
    // positioneel pad: een meegeplakte kolomkop is geen spec-regel (parseSpecCsv-regel)
    if (headerRow == null && /^(code|armatuurcode)$/i.test(fixtureCode)) continue;
    // dubbele code in hetzelfde bestand: eerste rij wint (zelfde regel als parseTocText)
    if (seen.has(fixtureCode)) continue;
    seen.add(fixtureCode);

    let brandText = cell("brandText")?.trim() || null;
    let productText = cell("productText")?.trim() || null;
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
      zone: cell("zone")?.trim() || null,
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
