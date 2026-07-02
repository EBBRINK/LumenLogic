// Genereert een tekst-gebaseerd voorbeeld-armaturenboek (mét tekstlaag) zodat de
// PDF-import (run 2) live demonstreerbaar is. Het echte Deerns-voorbeeld in docs/examples
// is als beeld geëxporteerd en heeft geen tekstlaag.
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const ROWS: [string, string, string][] = [
  ["Lp301", "XAL", "SASSO 100"],
  ["Lr303", "XAL", "SASSO 60 Adjustable"],
  ["Ls004", "LED Linear", "XOOLINE"],
  ["Ls601", "iGuzzini", "Typha"],
  ["Lw001", "XAL", "BASO 60"],
  ["Lw002", "NORKA", "LUGANO"],
  ["Lw201", "Wever & Ducré", "SCAVA 1.0"],
];

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 liggend
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.05, 0.2, 0.55);

  page.drawText("RET - Waalhaven — Armaturenboek (voorbeeld)", {
    x: 50, y: 545, size: 16, font: bold, color: blue,
  });
  page.drawText("Inhoudsopgave", { x: 50, y: 510, size: 13, font: bold });
  page.drawText("Armatuurcode        Merk                     Type                                   Bladzijde", {
    x: 50, y: 485, size: 10, font: bold,
  });

  let y = 465;
  ROWS.forEach(([code, brand, type], i) => {
    // één regel per rij zodat de tekstlaag de kolommen op volgorde teruggeeft
    const line = `${code}        ${brand}        ${type}        ${20 + i}`;
    page.drawText(line, { x: 50, y, size: 10, font });
    y -= 22;
  });

  const bytes = await doc.save();
  writeFileSync("docs/examples/demo-armaturenboek.pdf", bytes);
  console.log("✓ docs/examples/demo-armaturenboek.pdf geschreven");
}

main();
