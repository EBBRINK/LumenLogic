// Master-template voor merken (plan-merkrelaties K5 + Timo-besluit 3: écht .xlsx via
// exceljs). Pure builder: leest UITSLUITEND lib/field-catalog.ts — alleen 📄-velden
// (inExcel én !internalOnly, dubbel gefilterd in excelColumns()), volgorde = bucket-
// volgorde. Het template is volledig ENGELSTALIG (labelEn/instructionEn — het gaat naar
// internationale merken); de app-UI blijft Nederlands. Eén werkblad "Product data" met
// drie koprijen (bucketgroep / veldlabel / instructie) + leeg invulgebied, plus een
// werkblad "Instructions". 🔒-velden komen hier per constructie nooit in terecht; de
// negatieve test parse't de buffer terug.
import ExcelJS from "exceljs";
import { excelColumns } from "@/lib/field-catalog";

export const TEMPLATE_FILENAME = "brinklicht-product-data-template.xlsx";

// Aantal lege invulrijen onder de koppen (louter cosmetisch — Excel groeit gewoon door).
const INVULRIJEN = 200;

// Zachte, afwisselende buckettinten voor de groepsrij (ARGB, licht).
const BUCKET_TINTEN = ["FFE8F0E8", "FFE8ECF4", "FFF4EEE4", "FFEDE8F2"] as const;

export async function buildMasterTemplateXlsx(): Promise<Uint8Array> {
  const columns = excelColumns();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Brink Licht — Lumen Logic";
  wb.created = new Date();

  const ws = wb.addWorksheet("Product data", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Rij 2 en 3 eerst als platte waarden; rij 1 (bucketgroepen) daarna met merges.
  ws.getRow(2).values = columns.map(({ field }) => field.labelEn);
  ws.getRow(3).values = columns.map(({ field }) => field.instructionEn);

  // Rij 1: per bucket één samengevoegde cel met de bucketnaam, licht gekleurd.
  let start = 1; // 1-based kolomindex
  let bucketIndex = 0;
  while (start <= columns.length) {
    const bucket = columns[start - 1].bucket;
    let end = start;
    while (end < columns.length && columns[end].bucket.key === bucket.key) end++;
    if (end > start) ws.mergeCells(1, start, 1, end);
    const cell = ws.getCell(1, start);
    cell.value = bucket.labelEn;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    const tint = BUCKET_TINTEN[bucketIndex % BUCKET_TINTEN.length];
    for (let c = start; c <= end; c++) {
      ws.getCell(1, c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: tint },
      };
    }
    bucketIndex++;
    start = end + 1;
  }

  // Opmaak veldlabel- en instructierij + leesbare kolombreedtes.
  ws.getRow(2).font = { bold: true };
  ws.getRow(3).font = { italic: true, color: { argb: "FF808080" } };
  ws.getRow(3).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(3).height = 42;
  columns.forEach(({ field }, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(40, Math.max(16, field.labelEn.length + 4));
  });
  ws.getRow(1).height = 20;
  // Leeg invulgebied (geen inhoud, alleen dat het blad "af" oogt).
  for (let r = 4; r < 4 + INVULRIJEN; r++) ws.getRow(r);

  // Werkblad "Instructions": korte Engelse instructie voor het merk.
  const uitleg = wb.addWorksheet("Instructions");
  uitleg.getColumn(1).width = 100;
  const regels = [
    "Product data template — Brink Licht (Lumen Logic)",
    "",
    "Fill in one product per row on the 'Product data' tab, starting at row 4.",
    "Row 1 groups the fields, row 2 contains the field names and row 3 a short instruction with unit and example.",
    "Fields that do not apply to your products may simply be left empty.",
    "Use the units from the instruction row (e.g. centimetres, kelvin, lumens) and keep the column order unchanged.",
    "Please return the completed file to your contact at Brink Licht.",
  ];
  regels.forEach((tekst, i) => {
    const cell = uitleg.getCell(i + 1, 1);
    cell.value = tekst;
    if (i === 0) cell.font = { bold: true, size: 14 };
    cell.alignment = { wrapText: true };
  });

  // writeBuffer geeft in Node een Buffer en in de browser een ArrayBuffer — beide
  // normaliseren we naar Uint8Array (zelfde patroon als de PDF-renderer).
  const out = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  return new Uint8Array(out as ArrayBuffer);
}
