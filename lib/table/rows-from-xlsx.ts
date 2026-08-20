// XLSX → rijen (goal-import-meer-formaten, Bouwer A stap 2). exceljs zat al in de
// deps (brandportal-Excel). Het lezen zelf staat in lib/table/worksheet-rows.ts, gedeeld
// met het >15 MB-clientpad; hier zit alleen het openen van het werkboek.
//
// sheetsFromXlsx levert ÁLLE bladen; rowsFromXlsx is het dunne laagje eroverheen dat
// het eerste blad met inhoud pakt. Dat was ooit de hele waarheid, met als motivering
// "een armaturenstaat is één tabel, extra tabbladen zijn vrijwel altijd legenda of lege
// sjabloonbladen". Die aanname klopt vaak maar niet altijd: een werkboek kan twee
// UITVOERINGEN dragen, en dan verdween de tweede zonder een woord
// (docs/probleem-meerdere-tabbladen.md). rowsFromXlsx blijft bestaan als gedragsanker
// voor de fallback — bij nul databladen verandert er niets aan wat er gebeurt.
import ExcelJS from "exceljs";
import type { TableRows } from "./parse-rows";
import { isHiddenWorksheet, rowsFromWorksheet } from "./worksheet-rows";

export type XlsxSheet = {
  index: number; // 1-GEBASEERD, de positie op de tabjes zoals de gebruiker ze telt
  name: string;
  hidden: boolean;
  rows: TableRows;
};

// Alle werkbladen, in tabvolgorde.
export async function sheetsFromXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs accepteert een ArrayBuffer; een subarray-view kopiëren we eerst.
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(buf);

  return workbook.worksheets.map((ws, i) => ({
    index: i + 1,
    name: ws.name,
    hidden: isHiddenWorksheet(ws),
    rows: rowsFromWorksheet(ws),
  }));
}

export async function rowsFromXlsx(bytes: Uint8Array): Promise<TableRows> {
  const sheets = await sheetsFromXlsx(bytes);
  return sheets.find((s) => s.rows.length > 0)?.rows ?? sheets[0]?.rows ?? [];
}
