// Blijvende test voor de client-side rasterisatie (B1): een kleine, ter plekke
// gegenereerde beeld-PDF (pdf-lib, alleen een embedded JPEG — géén tekstlaag, zoals
// het echte armaturenboek) wordt met lib/pdf/render.ts naar JPEG gerenderd. Het echte
// 5,5 MB Deerns-boek draait alleen in de eenmalige render.smoke.test.ts, niet in CI.
import { expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  OCR_MAX_SIDE_PX,
  openPdfDocument,
  renderPdfPageToJpeg,
} from "./render";

// Tekent "tekst als pixels" op een canvas en verpakt dat als JPEG-pagina in een PDF —
// de fixture heeft dus 0 tekens tekstlaag, precies het OCR-scenario.
async function makeImagePdf(
  pages: Array<{ w: number; h: number; label: string }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const { w, h, label } of pages) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("geen 2d-context");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.font = "24px sans-serif";
    ctx.fillText(label, 40, 60);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const jpgBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const jpg = await doc.embedJpg(jpgBytes);
    const page = doc.addPage([w, h]);
    page.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

test("rendert een beeldpagina naar JPEG met de langste zijde op 1568px", async () => {
  // Liggende pagina (breedte = langste zijde), zoals het Deerns-boek.
  const bytes = await makeImagePdf([{ w: 400, h: 300, label: "Lp001-a XAL" }]);
  const pdf = await openPdfDocument(bytes);
  expect(pdf.numPages).toBe(1);

  const result = await renderPdfPageToJpeg(pdf, 1);
  expect(result.width).toBe(OCR_MAX_SIDE_PX);
  expect(result.height).toBe(Math.round((300 / 400) * OCR_MAX_SIDE_PX));
  expect(result.blob.type).toBe("image/jpeg");
  // JPEG-magic bytes FF D8 — het is echt een JPEG, geen leeg blob.
  const head = new Uint8Array(await result.blob.arrayBuffer());
  expect([head[0], head[1]]).toEqual([0xff, 0xd8]);
  expect(result.blob.size).toBeGreaterThan(1000);
});

test("hergebruikt één canvas over pagina's met verschillende oriëntatie", async () => {
  const bytes = await makeImagePdf([
    { w: 400, h: 300, label: "pagina 1 liggend" },
    { w: 300, h: 400, label: "pagina 2 staand" },
  ]);
  const pdf = await openPdfDocument(bytes);
  const canvas = document.createElement("canvas");

  const p1 = await renderPdfPageToJpeg(pdf, 1, { canvas });
  const p2 = await renderPdfPageToJpeg(pdf, 2, { canvas });

  // Staande pagina: hoogte is nu de langste zijde — het hergebruikte canvas volgt.
  expect([p1.width, p1.height]).toEqual([OCR_MAX_SIDE_PX, 1176]);
  expect([p2.width, p2.height]).toEqual([1176, OCR_MAX_SIDE_PX]);
  expect(p2.blob.size).toBeGreaterThan(1000);
});
