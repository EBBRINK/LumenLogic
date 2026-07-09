// Genereert één realistisch test-armaturenboek (PDF MÉT tekstlaag) dat bewust alle vijf
// de statussen uitlokt tegen de echte catalogus:
//   • GROEN  — echt product, gevraagde specs binnen de groene marge
//   • GEEL   — echt product van het merk, één spec in de gele marge
//   • BLAUW  — merk dat Brink niet voert (Zumtobel/Trilux) → inlaadlijst
//   • ROOD   — merk wél in de catalogus, dit specifieke product niet
//   • PAARS  — geen verlichting (stoel/kast) → buiten assortiment
//
// De omschrijvingen coderen de specs inline (17,9W 3000K IP44), zodat de deterministische
// spec-extractie in lib/pdf/armaturenboek.ts ze als gevraagde specs oppikt. Draai:
//   bun scripts/gen-test-armaturenboek.ts
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// [code, merk, omschrijving (met specs), verwachte status — alleen ter documentatie]
const ROWS: [string, string, string, string][] = [
  // — GROEN: echte producten uit de catalogus —
  ["Lp301", "XAL", "SASSO 100 SQ SP CEIL 3000K", "groen"],
  ["Lp302", "Wever & Ducré", "SCAVA 1.0 WALL", "groen"],
  ["Ls001", "Flos", "Bellhop Glass C2", "groen"],
  ["Lp401", "TAL", "TAGLIO CORNER", "groen"],
  ["Ld201", "Kreon", "Holon 80 directional 3000K", "groen"],
  ["Lw101", "Axo Light", "NEST SEMI-RECESSED 3000K", "groen"],
  ["Ls010", "Artemide", "MELAMPO W BRONZE", "groen"],
  ["Lp501", "Egoluce", "STAR MAXI 2700K", "groen"],
  ["Ld105", "XAL", "UNICO Q4 2700K", "groen"],
  // — GEEL: echt product, maar een spec net in de gele marge —
  ["Ld202", "Kreon", "Holon 80 directional 3000K 40W", "geel"],
  ["Lw102", "Axo Light", "NEST SEMI-RECESSED 3000K 8W", "geel"],
  ["Ld106", "XAL", "UNICO Q4 2700K 30W", "geel"],
  ["Lw103", "Axo Light", "NEST SEMI-RECESSED 3000K 9W", "geel"],
  ["Ld107", "XAL", "UNICO Q4 2700K 28W", "geel"],
  // — ROOD: merk hebben we, dit product niet —
  ["Lp601", "XAL", "PHANTOMDELUXE ZX9000", "rood"],
  ["Lr701", "Flos", "ORIONNOVA QX5 SPECIAL", "rood"],
  // — BLAUW: merk voert Brink niet —
  ["Lp801", "Zumtobel", "PANOS INFINITY Q150 3000K", "blauw"],
  ["Ls802", "Trilux", "BELVISO S C 3000K", "blauw"],
  // — PAARS: geen verlichting —
  ["Lx901", "Vitra", "Meda bureau stoel", "paars"],
  ["Lx902", "USM", "Haller kast laag", "paars"],
];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.12, 0.17, 0.24);
  const grey = rgb(0.45, 0.45, 0.45);

  const page = doc.addPage([595, 842]); // A4 staand
  page.drawText("Nieuwbouw Kantoorpand De Boog — Armaturenboek", {
    x: 48, y: 792, size: 15, font: bold, color: navy,
  });
  page.drawText("Deerns Nederland B.V.  ·  project 08421  ·  revisie A", {
    x: 48, y: 774, size: 9, font, color: grey,
  });
  page.drawText("Inhoudsopgave — te leveren armaturen", {
    x: 48, y: 744, size: 11, font: bold, color: navy,
  });
  page.drawText("Code        Fabrikant / type", { x: 48, y: 724, size: 9, font: bold });
  page.drawText("Blz.", { x: 512, y: 724, size: 9, font: bold });
  page.drawLine({ start: { x: 48, y: 718 }, end: { x: 547, y: 718 }, thickness: 0.75, color: grey });

  let y = 700;
  ROWS.forEach(([code, brand, type], i) => {
    page.drawText(code, { x: 48, y, size: 9.5, font: bold });
    page.drawText(`${brand}  ${type}`, { x: 118, y, size: 9.5, font });
    page.drawText(String(12 + i), { x: 516, y, size: 9.5, font, color: grey });
    y -= 22;
  });
  // Bewust geen voettekst ná de laatste regel: de tekstextractie voegt alle tekst samen,
  // dus losse tekst achter de laatste armatuurcode zou in die regel bloeden.

  const bytes = await doc.save();
  const out = "docs/examples/test-armaturenboek.pdf";
  writeFileSync(out, bytes);
  console.log(`✓ ${out} geschreven (${ROWS.length} regels)`);
}

main();
