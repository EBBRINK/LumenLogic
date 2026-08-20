// XLSX → rijen (goal-import-meer-formaten, Bouwer A stap 2). exceljs zat al in de
// deps (brandportal-Excel); we lezen het EERSTE werkblad met inhoud — een
// armaturenstaat is één tabel, extra tabbladen zijn vrijwel altijd legenda/lege
// sjabloonbladen. Rijgrenzen zijn heilig: één worksheet-rij = één rij in het
// resultaat, inclusief lege rijen (rijnummers moeten kloppen met wat de gebruiker
// in Excel ziet — sourcePage = rijnummer).
import ExcelJS from "exceljs";
import type { TableRows } from "./parse-rows";

// Eén celwaarde → string, zoals de gebruiker hem ziet. exceljs geeft rijke types
// terug (richText, formule met result, datum, hyperlink); alles wat geen tekst is
// wordt eerlijk platgeslagen, nooit geraden.
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null)
      return cellToString(value.result as ExcelJS.CellValue);
    if ("formula" in value) return ""; // formule zonder cached result: leeg, niet raden
    if ("error" in value) return "";
  }
  return String(value);
}

export async function rowsFromXlsx(bytes: Uint8Array): Promise<TableRows> {
  const workbook = new ExcelJS.Workbook();
  // exceljs accepteert een ArrayBuffer; een subarray-view kopiëren we eerst.
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(buf);

  const sheet =
    workbook.worksheets.find((ws) => ws.actualRowCount > 0) ??
    workbook.worksheets[0];
  if (!sheet) return [];

  const rows: TableRows = [];
  // 1..rowCount, inclusief lege rijen — rij N in Excel is rows[N-1] hier.
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) {
      cells.push(cellToString(row.getCell(c).value).trim());
    }
    rows.push(cells);
  }
  // lege staart weghalen (Excel houdt vaak duizenden "gebruikte" lege rijen aan)
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}
