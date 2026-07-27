// Master-template (stap 6): we parsen de gegenereerde xlsx-buffer TERUG met exceljs en
// toetsen inhoud, niet bytes. Het template is volledig ENGELSTALIG (labelEn/instructionEn,
// tabbladen "Product data" en "Instructions"): koppen = alle 📄-velden in bucketvolgorde,
// instructie-rij aanwezig, merged bucketgroep-rij klopt, en — de kernwaarborg — geen enkel
// 🔒-veld (keys, NL-labels én EN-labels) in het hele werkboek.
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { catalogusMet, type EigenVeldDef } from "@/lib/custom-fields";
import {
  excelColumns,
  FIELD_CATALOG,
  type CatalogBucket,
} from "@/lib/field-catalog";

/** Het vaste deel van de catalogus: wat elke bestaande test hier bedoelde toen
 *  excelColumns() nog parameterloos was. */
const CATALOGUS = FIELD_CATALOG;
import { buildMasterTemplateXlsx, TEMPLATE_FILENAME } from "./excel-template";

async function parseTemplate(
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): Promise<ExcelJS.Workbook> {
  const bytes = await buildMasterTemplateXlsx(catalogus);
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

test("bestandsnaam is Engelstalig", () => {
  expect(TEMPLATE_FILENAME).toBe("brinklicht-product-data-template.xlsx");
});

test("werkblad Product data: Engelse veldlabels (rij 2) = alle 📄-velden in bucketvolgorde", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Product data");
  expect(ws).toBeDefined();
  const expected = excelColumns(CATALOGUS).map(({ field }) => field.labelEn);
  expect(expected).toContain("Supplier article code");
  expect(expected).toContain("Gross list price excl. VAT");
  expect(rowValues(ws!, 2).slice(0, expected.length)).toEqual(expected);
  // Geen extra kolommen met inhoud voorbij de catalog.
  expect(ws!.getRow(2).getCell(expected.length + 1).value ?? null).toBeNull();
});

test("instructie-rij (rij 3) aanwezig met de Engelse catalog-instructies", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Product data")!;
  const expected = excelColumns(CATALOGUS).map(({ field }) => field.instructionEn);
  expect(rowValues(ws, 3).slice(0, expected.length)).toEqual(expected);
});

test("bucketgroep-rij (rij 1): merges volgen exact de bucketgrenzen, Engelse labels", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Product data")!;
  const columns = excelColumns(CATALOGUS);
  // Verwachte (start, eind, label) per bucket, afgeleid uit de catalog zelf.
  let col = 1;
  for (const bucket of [...FIELD_CATALOG].sort((a, b) => a.order - b.order)) {
    const n = bucket.fields.filter((f) => f.inExcel && !f.internalOnly).length;
    if (n === 0) continue;
    // De startcel van de (al dan niet gemergde) groep draagt het Engelse bucketlabel …
    expect(ws.getCell(1, col).value).toBe(bucket.labelEn);
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

test("NEGATIEF: geen enkel 🔒-veld (key, NL-label of EN-label) waar dan ook in het werkboek", async () => {
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
    expect(blob).not.toContain(f.labelEn.toLowerCase());
  }
  // Expliciete klassiekers uit het plan, NL én EN.
  for (const woord of [
    "inkoopprijs",
    "korting",
    "voorraad",
    "purchase price",
    "discount",
    "stock",
  ]) {
    expect(blob).not.toContain(woord);
  }
});

test("frozen panes onder rij 3 en werkblad Instructions aanwezig", async () => {
  const wb = await parseTemplate();
  const ws = wb.getWorksheet("Product data")!;
  expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
  const uitleg = wb.getWorksheet("Instructions");
  expect(uitleg).toBeDefined();
  expect(String(uitleg!.getCell(1, 1).value)).toMatch(/Product data template/);
  // Laatste instructieregel: retourneren naar de contactpersoon.
  const teksten: string[] = [];
  uitleg!.eachRow((row) => teksten.push(String(row.getCell(1).value ?? "")));
  expect(teksten.join("\n")).toContain(
    "Please return the completed file to your contact at Brink Licht.",
  );
});

// ── Sprint 1.8: eigen velden staan écht in het bestand dat het merk krijgt ────

const EIGEN: EigenVeldDef = {
  id: "22222222-2222-4222-8222-222222222222",
  labelEn: "Recycled content (%)",
  instructionEn: "Share of recycled material in percent, e.g. 35.",
  niveau: "wanna",
  bucketKey: "duurzaamheid_milieu",
  createdAt: "2026-07-21T10:00:00.000Z",
  archivedAt: null,
};

test("1.8: een eigen veld krijgt een echte kolom, mét zijn instructie in rij 3", async () => {
  const wb = await parseTemplate(catalogusMet([EIGEN]));
  const ws = wb.getWorksheet("Product data")!;
  const labels = rowValues(ws, 2);
  const kolom = labels.indexOf(EIGEN.labelEn) + 1;
  expect(kolom).toBeGreaterThan(0);
  // Rij 3 is wat het merk vertelt wát het moet invullen — een kolom zonder instructie is
  // precies hoe je een kolom krijgt die niemand invult. Daarom is instructie ook verplicht
  // niet-leeg in migratie 0015.
  expect(String(ws.getRow(3).getCell(kolom).value ?? "")).toBe(EIGEN.instructionEn);
  // In de bucket van het veld, achteraan: de bestaande 66 kolommen houden hun plek.
  expect(kolom).toBe(labels.filter((l) => l !== "").length);
  // …en onder de bucketgroep van rij 1, niet onder een elfde groep: de merge van
  // "Sustainability / environment" loopt over hem heen.
  expect(String(ws.getRow(1).getCell(kolom).value ?? "")).toBe(
    "Sustainability / environment",
  );
});

test("1.8: zonder eigen velden is het bestand bit-voor-bit het oude template", async () => {
  const wb = await parseTemplate(catalogusMet([]));
  const ws = wb.getWorksheet("Product data")!;
  expect(rowValues(ws, 2).filter((v) => v !== "")).toHaveLength(66);
});
