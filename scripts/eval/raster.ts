// Server-side rasterisatie voor de eval-OCR-route (stap 2, docs/goal-import-ai-
// leesroute.md): rendert pagina's van een beeld-PDF naar JPEG onder Bun, als
// spiegelbeeld van lib/pdf/render.ts (dat UITSLUITEND in de browser draait).
// De constanten (max zijde, JPEG-kwaliteit) worden bewust uit lib/pdf/render
// geïmporteerd zodat pariteit met de browser-route afgedwongen blijft: wat de
// eval meet, is wat de echte upload-kaart naar de vision-API zou sturen.
//
// @napi-rs/canvas is een devDependency (alleen scripts/tests); de console-warning
// "CCITTFaxStream: Falling back to JS" bij het Dordrecht-boek is onschuldig.
import { getDocumentProxy, createIsomorphicCanvasFactory } from "unpdf";
import { createCanvas } from "@napi-rs/canvas";
import { OCR_MAX_SIDE_PX, OCR_JPEG_QUALITY } from "@/lib/pdf/render";
import type { PageTile } from "@/lib/pdf/tiles";

export type RasterPdf = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function openPdf(bytes: Uint8Array): Promise<RasterPdf> {
  const CanvasFactory = await createIsomorphicCanvasFactory(
    () => import("@napi-rs/canvas"),
  );
  // CanvasFactory verplicht — anders levert pdfjs onder Node/Bun een zwart/leeg canvas
  return getDocumentProxy(bytes, { CanvasFactory });
}

export async function renderPageToJpeg(
  pdf: RasterPdf,
  pageNumber: number,
  maxSidePx: number = OCR_MAX_SIDE_PX,
  quality: number = OCR_JPEG_QUALITY,
): Promise<{ jpegBytes: Uint8Array; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = maxSidePx / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const jpegBytes = await canvas.encode("jpeg", Math.round(quality * 100)); // async! quality 0–100
    return { jpegBytes: new Uint8Array(jpegBytes), width, height };
  } finally {
    page.cleanup();
  }
}

// O4 (stap 5): één tegel renderen via een offset-viewport — zelfde geometrie
// (lib/pdf/tiles.ts) en zelfde aanpak als renderPdfTileToJpeg in de browser.
// De aanroeper beheert getPage/cleanup (één getPage per pagina, cleanup ná de
// laatste tegel), zodat het bronbeeld één keer per pagina gedecodeerd wordt.
export async function renderTileToJpeg(
  page: Awaited<ReturnType<RasterPdf["getPage"]>>,
  tile: PageTile,
  quality: number = OCR_JPEG_QUALITY,
): Promise<{ jpegBytes: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({
    scale: tile.renderScale,
    offsetX: -tile.sourceRect.xPt * tile.renderScale,
    offsetY: -tile.sourceRect.yPt * tile.renderScale,
  });
  const canvas = createCanvas(tile.outPx.width, tile.outPx.height);
  const ctx = canvas.getContext("2d");
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const jpegBytes = await canvas.encode("jpeg", Math.round(quality * 100));
  return {
    jpegBytes: new Uint8Array(jpegBytes),
    width: tile.outPx.width,
    height: tile.outPx.height,
  };
}
