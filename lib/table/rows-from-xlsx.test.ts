// XLSX-naad: een écht exceljs-werkboek heen en terug — geen gemockte cellen, want
// de risico's zitten juist in exceljs' rijke celtypes (richText, formule, datum).
import ExcelJS from "exceljs";
import { expect, test } from "vitest";
import { rowsFromXlsx, sheetsFromXlsx } from "./rows-from-xlsx";

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

// — sheetsFromXlsx (goal-meerdere-tabbladen N2): álle bladen, met naam en tabvolgorde —

test("sheetsFromXlsx: alle bladen in tabvolgorde, verborgen bladen gemarkeerd", async () => {
  const wb = new ExcelJS.Workbook();
  const een = wb.addWorksheet("Delta Light");
  een.addRow(["Codering", "Aantal", "Fabrikant/type"]);
  een.addRow(["1", 3, "Delta Light Spy 39"]);
  const twee = wb.addWorksheet("Wever en Ducre");
  twee.addRow(["Codering", "Aantal", "Fabrikant/type"]);
  twee.addRow(["1", 3, "Wever en Ducre 18486LQ3"]);
  twee.addRow(["2", 1, "Wever en Ducre 18486LQ3"]);
  wb.addWorksheet("Legenda").addRow(["Toelichting bij de codes"]);
  const verborgen = wb.addWorksheet("Sjabloon", { state: "hidden" });
  verborgen.addRow(["Codering", "Aantal"]);
  verborgen.addRow(["9", 1]);

  const sheets = await sheetsFromXlsx(await toBytes(wb));
  expect(sheets.map((s) => [s.index, s.name, s.hidden, s.rows.length])).toEqual([
    [1, "Delta Light", false, 2],
    [2, "Wever en Ducre", false, 3],
    [3, "Legenda", false, 1],
    [4, "Sjabloon", true, 2],
  ]);
});

test("rowsFromXlsx blijft het eerste blad mét inhoud pakken", async () => {
  // gedragsanker: bij nul databladen mag er niets veranderen aan wat er gebeurde
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Leeg blad");
  const data = wb.addWorksheet("Data");
  data.addRow(["Lp001", 1]);
  const tweede = wb.addWorksheet("Nog een blad");
  tweede.addRow(["Lp999", 9]);

  expect(await rowsFromXlsx(await toBytes(wb))).toEqual([["Lp001", "1"]]);
});
