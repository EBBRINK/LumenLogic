// XLSX-naad: een écht exceljs-werkboek heen en terug — geen gemockte cellen, want
// de risico's zitten juist in exceljs' rijke celtypes (richText, formule, datum).
import ExcelJS from "exceljs";
import { expect, test } from "vitest";
import { rowsFromXlsx } from "./rows-from-xlsx";

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

test("werkboek → rijen: strings, getallen, richText en lege rij op hun plek", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Armaturenstaat");
  ws.addRow(["Code", "Aantal", "Merk", "Type"]);
  ws.addRow(["Lp301", 12, "XAL", "SASSO 100"]);
  ws.addRow([]); // lege rij — moet blijven, rijnummers zijn heilig
  ws.getCell("A4").value = {
    richText: [{ text: "Lw" }, { text: "201", font: { bold: true } }],
  };
  ws.getCell("B4").value = 4;

  const rows = await rowsFromXlsx(await toBytes(wb));
  expect(rows).toHaveLength(4);
  expect(rows[0]).toEqual(["Code", "Aantal", "Merk", "Type"]);
  expect(rows[1]).toEqual(["Lp301", "12", "XAL", "SASSO 100"]);
  expect(rows[2].every((c) => c === "")).toBe(true);
  expect(rows[3][0]).toBe("Lw201"); // richText samengevoegd
  expect(rows[3][1]).toBe("4");
});

test("eerste werkblad mét inhoud wint; lege staartrijen vallen weg", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Leeg blad"); // leeg eerste blad
  const ws = wb.addWorksheet("Data");
  ws.addRow(["Lp001", 1]);
  ws.addRow([]); // lege staart

  const rows = await rowsFromXlsx(await toBytes(wb));
  expect(rows).toEqual([["Lp001", "1"]]);
});
