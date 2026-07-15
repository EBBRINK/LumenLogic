// PDF-import van armaturenboeken (run 2). Leest de tekstlaag van een geüpload
// armaturenboek en haalt uit de inhoudsopgave de rijen (armatuurcode · merk · type).
//
// Belangrijk: veel armaturenboeken (o.a. het Deerns-voorbeeld in docs/examples) zijn
// als beeld/outline geëxporteerd en hebben GÉÉN tekstlaag — dan valt er niets te parsen.
// Dat melden we eerlijk (fail loud), i.p.v. stil niets te importeren.
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import type { SpecLineInput } from "@/lib/repo/dossiers";
import { parseProductName } from "@/lib/enrichment/parser";

// Armatuurcode zoals in de Deerns-boeken: Lp301, Ls004, Lw201, Lp001-a, Lt001…
// Geëxporteerd (B3): de OCR-laag (lib/ai/ocr.ts) toetst gelezen codes aan exact
// dezelfde regex, zodat parser en vision nooit uiteenlopen in wat een code is.
export const CODE = /^[A-Z][a-z]{1,2}\d{2,3}(?:-[a-z0-9])?$/;

export type PdfImportResult = {
  lines: SpecLineInput[];
  hadText: boolean;
  rawRows: number;
  // B2: de volledige tekstlaag als markdown ("## Pagina N" + regels zoals unpdf ze
  // levert) — het controlespoor dat bij de importrun wordt bewaard.
  markdown: string;
};

// Cap op de markdown (±2 MB tekst): een controlespoor moet volledig genoeg zijn om te
// herleiden wat er in de PDF stond, maar mag de database-rij niet onbegrensd opblazen.
export const MARKDOWN_CAP = 2 * 1024 * 1024;
const TRUNCATION_NOTE = "> truncated at 2 MB";
export const NO_TEXT_LAYER_NOTE = "> no text layer found";

// Tekstlaag per pagina → markdown-controlespoor. Regeleindes blijven zoals unpdf ze
// levert (hasEOL); boven de cap kappen we af met een eerlijke notitie onderaan.
export function pagesToMarkdown(pages: string[]): string {
  const md = pages
    .map((page, i) => `## Page ${i + 1}\n\n${page}`)
    .join("\n\n");
  if (md.length <= MARKDOWN_CAP) return md;
  return `${md.slice(0, MARKDOWN_CAP)}\n\n${TRUNCATION_NOTE}`;
}

// Splitst "XAL SASSO 100" → { brand, type } door de langst mogelijke bekende merknaam
// vooraan te matchen. Zo blijven "Wever & Ducré", "LED Linear", "Landscape Forms Inc" heel.
// Geëxporteerd (bouwstap 4): de OCR-repo-laag (lib/repo/ocr.ts) knipt met exact dezelfde
// helper wanneer vision geen merk las — parser en OCR lopen zo nooit uiteen.
export function splitBrandType(
  rest: string,
  brandNames: string[],
): { brand: string | null; type: string } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const restNorm = norm(rest);
  let best: string | null = null;
  for (const b of brandNames) {
    const bn = norm(b);
    if (bn.length >= 2 && restNorm.startsWith(bn)) {
      if (!best || bn.length > norm(best).length) best = b;
    }
  }
  if (best) {
    // knip de merknaam (op woordgrens) van de originele tekst
    const words = rest.split(/\s+/);
    let acc = "";
    let cut = 0;
    for (let i = 0; i < words.length; i++) {
      acc += words[i];
      cut = i + 1;
      if (norm(acc) === norm(best)) break;
      if (norm(acc).length >= norm(best).length) break;
    }
    return { brand: best, type: words.slice(cut).join(" ").trim() };
  }
  // geen bekend merk herkend: eerste woord als merk, rest als type
  const words = rest.split(/\s+/);
  return { brand: words[0] ?? null, type: words.slice(1).join(" ").trim() };
}

export function parseTocText(
  text: string,
  brandNames: string[],
): SpecLineInput[] {
  // PDF-tekstextractie levert de inhoudsopgave vaak als één doorlopende stroom terug
  // (geen regeleindes). We tokeniseren en segmenteren op armatuurcodes: elke code start
  // een record dat loopt tot de volgende code; een los bladzijdenummer aan het eind valt weg.
  const tokens = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: SpecLineInput[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < tokens.length && !CODE.test(tokens[i])) i++; // spring naar de eerste code
  while (i < tokens.length) {
    const code = tokens[i];
    let j = i + 1;
    const mid: string[] = [];
    while (j < tokens.length && !CODE.test(tokens[j])) {
      mid.push(tokens[j]);
      j++;
    }
    // trailing bladzijdenummer weghalen (maar niet een type zoals "1.0")
    if (mid.length && /^\d{1,3}$/.test(mid[mid.length - 1])) mid.pop();
    if (mid.length && !seen.has(code)) {
      seen.add(code);
      const { brand, type } = splitBrandType(mid.join(" "), brandNames);
      // Deterministische spec-extractie (geen AI): armaturenboeken coderen de gevraagde
      // specs inline in de omschrijving ("… 17,9W 3000K IP44"). We lezen die met de
      // naam-parser en zetten ze als GEVRAAGDE specs, zodat de tolerantie-matcher geel/
      // rood kan bepalen. Ontbrekend blijft leeg (nooit geraden).
      const specs = type ? parseProductName(type) : {};
      lines.push({
        fixtureCode: code,
        quantity: 1, // inhoudsopgave kent geen aantallen → default 1
        brandText: brand,
        productText: type || null,
        reqKelvin: specs.kelvin ?? null,
        reqCri: specs.cri ?? null,
        reqIp: specs.ipValue ?? null,
        reqWatt: specs.maxWattage ?? null,
        reqLumen: specs.lumenOutput ?? null,
        reqBeamAngle: specs.beamAngle ?? null,
        reqDimmable: specs.dimmable ?? null,
      });
    }
    i = j;
  }
  return lines;
}

// Pure parsing van al-geëxtraheerde pagina-tekst (413-fix deel 1): dit is voortaan het
// server-pad — de browser extraheert (lib/pdf/extract.ts), de server parst alleen nog
// tekst en heeft geen pdfjs meer nodig. Zelfde uitkomst als extractSpecLinesFromPdf:
// voor de parser plakken we de pagina's aan elkaar (die normaliseert whitespace toch
// al), voor de markdown blijven de regeleindes per pagina staan.
export function parseSpecLinesFromPages(
  pages: string[],
  brandNames: string[],
): PdfImportResult {
  const merged = pages.join("\n");
  const hadText = merged.trim().length > 0;
  const lines = hadText ? parseTocText(merged, brandNames) : [];
  const markdown = hadText ? pagesToMarkdown(pages) : NO_TEXT_LAYER_NOTE;
  return { lines, hadText, rawRows: lines.length, markdown };
}

// PDF → pages → parse, in één stap. Blijft bestaan voor tests en scripts (o.a. de
// PGlite-acceptatietest); de server-action gebruikt parseSpecLinesFromPages direct.
export async function extractSpecLinesFromPdf(
  bytes: Uint8Array,
  brandNames: string[],
): Promise<PdfImportResult> {
  const pages = await extractPagesFromPdf(bytes);
  return parseSpecLinesFromPages(pages, brandNames);
}
