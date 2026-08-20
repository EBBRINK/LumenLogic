// DOCX → rijen (goal-import-meer-formaten, Bouwer A stap 2). mammoth zet het
// document om naar eenvoudige HTML; de tabellen daarin worden rijen, de lopende
// tekst is de vrije-tekst-fallback (dat pad gaat — als enige van de tabel-import —
// wél langs de AI-rijvariant van de leesroute; zie het goal-doc en Bouwer B).
//
// De HTML-extractie is een eigen pure functie (rowsFromHtmlTables) zodat hij los
// van mammoth te testen is; mammoth's uitvoer is gecontroleerd simpel
// (<table><tr><td>…, geen attributen van betekenis), dus een kleine tag-scanner
// volstaat — geen DOM-parser nodig op de server.
import mammoth from "mammoth";
import type { TableRows } from "./parse-rows";

// Alle <table>'s in mammoth-HTML → één rijenlijst (tabellen achter elkaar; een
// armaturenstaat die per verdieping een tabel heeft blijft zo één import).
// Rijgrenzen zijn heilig: cellen komen alleen uit hun eigen <td>/<th>.
export function rowsFromHtmlTables(html: string): TableRows {
  const rows: TableRows = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  for (const table of html.matchAll(tableRe)) {
    for (const tr of table[1].matchAll(trRe)) {
      const cells: string[] = [];
      for (const cell of tr[1].matchAll(cellRe)) {
        cells.push(htmlToText(cell[1]));
      }
      rows.push(cells);
    }
  }
  return rows;
}

// Binnenkant van een cel: tags weg, entiteiten terug, whitespace genormaliseerd.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DocxResult = {
  rows: TableRows; // rijen uit tabellen (leeg als het document geen tabellen heeft)
  // Volledige lopende tekst — het vrije-tekst-fallbackpad wanneer er geen tabellen
  // zijn. Altijd gevuld (ook mét tabellen): het is tegelijk het controlespoor.
  freeText: string;
};

export async function rowsFromDocx(bytes: Uint8Array): Promise<DocxResult> {
  // mammoth wil onder Node/Bun een Buffer (geverifieerd onder Bun, 20 aug).
  const buffer = Buffer.from(bytes);
  const [html, raw] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
  ]);
  return { rows: rowsFromHtmlTables(html.value), freeText: raw.value.trim() };
}
