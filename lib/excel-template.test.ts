// Master-template (stap 6): we parsen de gegenereerde xlsx-buffer TERUG met exceljs en
// toetsen inhoud, niet bytes: koppen = alle 📄-velden in bucketvolgorde, instructie-rij
// aanwezig, merged bucketgroep-rij klopt, en — de kernwaarborg — geen enkel 🔒-veld
// (keys én labels: inkoopprijs, korting, voorraad) in het hele werkboek.
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { excelColumns, FIELD_CATALOG } from "@/lib/field-catalog";
import { buildMasterTemplateXlsx } from "./excel-template";

async function parseTemplate(): Promise<ExcelJS.Workbook> {
  const bytes = await buildMasterTemplateXlsx();
  const wb = new ExcelJS.Workbook();
  // exceljs accepteert een ArrayBuffer; sliceje voorkomt offset-verrassingen.
  await wb.xlsx.load(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer as never,
  );
  return wb;
}

function rowValues(ws: ExcelJS.Worksheet, rowNr: number): string[] {
  const row = ws.getRow(rowNr);
  const out: string[] = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = row.getCell(c).value;
    out.push(v == null ? "" : String(v));
  }
  return out;
}

test("werkblad Productdata: veldlabels (rij 2) = alle 📄-velden in bucketvolgorde", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Productdata");
  expect(ws).toBeDefined();
  const expected = excelColumns().map(({ field }) => field.labelNl);
  expect(rowValues(ws!, 2).slice(0, expected.length)).toEqual(expected);
  // Geen extra kolommen met inhoud voorbij de catalog.
  expect(ws!.getRow(2).getCell(expected.length + 1).value ?? null).toBeNull();
});

test("instructie-rij (rij 3) aanwezig met de catalog-instructies", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Productdata")!;
  const expected = excelColumns().map(({ field }) => field.instructie);
  expect(rowValues(ws, 3).slice(0, expected.length)).toEqual(expected);
});

test("bucketgroep-rij (rij 1): merges volgen exact de bucketgrenzen", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Productdata")!;
  const columns = excelColumns();
  // Verwachte (start, eind, label) per bucket, afgeleid uit de catalog zelf.
  let col = 1;
  for (const bucket of [...FIELD_CATALOG].sort((a, b) => a.order - b.order)) {
    const n = bucket.fields.filter((f) => f.inExcel && !f.internalOnly).length;
    if (n === 0) continue;
    // De startcel van de (al dan niet gemergde) groep draagt het bucketlabel …
    expect(ws.getCell(1, col).value).toBe(bucket.labelNl);
    // … en de vervolgcellen zijn met de startcel gemergd (zelfde master).
    for (let c = col + 1; c < col + n; c++) {
      expect(ws.getCell(1, c).isMerged).toBe(true);
      expect(String(ws.getCell(1, c).master.address)).toBe(
        ws.getCell(1, col).address,
      );
    }
    // De cel ná de groep hoort NIET meer bij deze merge.
    const next = ws.getCell(1, col + n);
    expect(next.isMerged ? next.master.address : null).not.toBe(
      ws.getCell(1, col).address,
    );
    col += n;
  }
  expect(col - 1).toBe(columns.length);
});

test("NEGATIEF: geen enkel 🔒-veld (key of label) waar dan ook in het werkboek", async () => {
  const wb = await parseTemplate();
  const internal = FIELD_CATALOG.flatMap((b) => b.fields).filter(
    (f) => f.internalOnly,
  );
  expect(internal.length).toBeGreaterThanOrEqual(5); // o.a. inkoopprijs/korting/voorraad
  const alleTekst: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value != null) alleTekst.push(String(cell.value).toLowerCase());
      });
    });
  });
  const blob = alleTekst.join("\n");
  for (const f of internal) {
    expect(blob).not.toContain(f.key.toLowerCase());
    expect(blob).not.toContain(f.labelNl.toLowerCase());
  }
  // Expliciete klassiekers uit het plan.
  for (const woord of ["inkoopprijs", "korting", "voorraad"]) {
    expect(blob).not.toContain(woord);
  }
});

test("frozen panes onder rij 3 en werkblad Uitleg aanwezig", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Productdata")!;
  expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
  const uitleg = wb.getWorksheet("Uitleg");
  expect(uitleg).toBeDefined();
  expect(String(uitleg!.getCell(1, 1).value)).toMatch(/Merkdata-template/);
});
