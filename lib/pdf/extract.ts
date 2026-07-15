// Tekstlaag-extractie uit een PDF, per pagina. Draait zowel in de BROWSER (de upload-
// kaart leest de PDF client-side en stuurt alleen de tekstlaag naar de server — zo
// blijft een 5,5+ MB armaturenboek onder Next's action-bodylimiet én Vercel's harde
// ~4,5 MB request-limiet) als in Node/Bun (tests, scripts): unpdf bundelt een
// serverless pdfjs zonder DOM- of worker-afhankelijkheid.
//
// Dit bestand is bewust los van armaturenboek.ts gehouden: de client-bundle krijgt
// alleen unpdf, niet de parser en zijn server-afhankelijkheden.
import { extractText, getDocumentProxy } from "unpdf";

// mergePages: false → regeleindes per pagina blijven behouden, exact de vorm die
// parseSpecLinesFromPages en het markdown-controlespoor verwachten.
export async function extractPagesFromPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}
