// Eén werkblad → rijen. Gedeeld door de SERVER (lib/table/rows-from-xlsx.ts) en de
// BROWSER (het >15 MB-pad in components/dossier/pdf-upload-card.tsx).
//
// Waarom gedeeld: die twee lazen hetzelfde bestand ooit verschillend — de server
// cel-voor-cel over 1..rowCount, de browser met eachRow (dat lege rijen overslaat) en
// zonder trim. Daardoor konden de rijnummers uiteenlopen, en met de tabbladkeuze ook het
// getal "N lines found" dat de gebruiker te zien krijgt. lib/table/sheet-choice.ts deelt
// de beslissing; dit bestand deelt het lezen. Samen kunnen de paden niet meer
// verschillen — niet in wélk blad, en niet in hoeveel regels erin zitten.
//
// exceljs staat hier alleen als TYPE. De browser laadt hem via een dynamische import
// (statisch zou hem in de bundel van elke projectpagina trekken) en een type-import wordt
// bij het bundelen volledig geëlimineerd.
import type ExcelJS from "exceljs";
import type { TableRows } from "./parse-rows";

// Eén celwaarde → string, zoals de gebruiker hem ziet. exceljs geeft rijke types terug
// (richText, formule met result, datum, hyperlink); alles wat geen tekst is wordt eerlijk
// platgeslagen, nooit geraden.
export function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null)
      return cellToString(value.result as ExcelJS.CellValue);
    if ("formula" in value) return ""; // formule zonder cached result: leeg, niet raden
    if ("error" in value) return "";
  }
  return String(value);
}

// RIJGRENZEN ZIJN HEILIG (zie de kop van lib/table/parse-rows.ts): rij N in Excel is
// rows[N-1] hier, inclusief lege rijen. Daarom lopen we 1..rowCount en niet eachRow —
// die slaat lege rijen over, waardoor alle rijnummers opschuiven en de "Read from row N"
// in de Review-tab liegt over waar een regel vandaan kwam.
export function rowsFromWorksheet(sheet: ExcelJS.Worksheet): TableRows {
  const rows: TableRows = [];
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

// Verborgen bladen komen wél mee maar zijn gemarkeerd — wat je ermee doet beslist
// lib/table/sheet-choice.ts, niet de lezer.
export function isHiddenWorksheet(sheet: ExcelJS.Worksheet): boolean {
  return sheet.state === "hidden" || sheet.state === "veryHidden";
}
