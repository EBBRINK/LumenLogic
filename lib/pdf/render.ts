// Client-side rasterisatie van PDF-pagina's naar JPEG (B1 van het OCR-plan). Draait
// UITSLUITEND in de browser: de upload-kaart rendert een beeld-PDF pagina voor pagina
// naar een canvas en stuurt alleen het gecomprimeerde JPEG naar de server — zo blijft
// een 5,5+ MB armaturenboek onder Next's action-bodylimiet én Vercel's ~4,5 MB
// request-limiet. Gebruikt de pdfjs (5.6.x) die al in unpdf zit: geen nieuwe runtime-dep.
//
// Render-API (bewezen in render.smoke.test.ts tegen het echte Deerns-boek): recente
// pdfjs wil een `canvas`-parameter — `page.render({ canvas, viewport }).promise`;
// `canvasContext` is daar alleen nog voor backwards compatibility.
//
// Dit bestand is bewust los van armaturenboek.ts/extract.ts gehouden, gespiegeld aan
// extract.ts: de client-bundle krijgt alleen unpdf, niet de parser.
import { getDocumentProxy } from "unpdf";

// Anthropic-vision-limiet: beelden > 1568 px op de langste zijde worden door de API
// teruggeschaald — dat kost juist de pixels van de armatuurcodes. Dus zelf exact op
// 1568 px (langste zijde) renderen; nooit opschalen boven de bronresolutie is niet
// nodig: het boek is 600 dpi, ruim boven dit doel.
export const OCR_MAX_SIDE_PX = 1568;
export const OCR_JPEG_QUALITY = 0.8;

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

export interface RenderedPage {
  /** JPEG-bytes (image/jpeg, kwaliteit OCR_JPEG_QUALITY). */
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
}

// Los exporteren zodat de client-loop het document één keer opent en de pagina's
// strikt sequentieel rendert (B1) — zelfde proxy als extract.ts gebruikt.
export async function openPdfDocument(bytes: Uint8Array): Promise<PdfDocument> {
  return getDocumentProxy(bytes);
}

// Rendert één pagina naar JPEG met de langste zijde op maxSidePx. Geef hetzelfde
// canvas bij elke aanroep mee om per-pagina-allocaties te vermijden (B1: canvas
// hergebruiken); zonder canvas wordt er één aangemaakt.
export async function renderPdfPageToJpeg(
  pdf: PdfDocument,
  pageNumber: number,
  options: {
    canvas?: HTMLCanvasElement;
    maxSidePx?: number;
    quality?: number;
  } = {},
): Promise<RenderedPage> {
  const maxSidePx = options.maxSidePx ?? OCR_MAX_SIDE_PX;
  const quality = options.quality ?? OCR_JPEG_QUALITY;

  const page = await pdf.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = maxSidePx / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = options.canvas ?? document.createElement("canvas");
    // Afronden op hele pixels; het canvas resizen wist het meteen voor hergebruik.
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error(`Pagina ${pageNumber}: canvas.toBlob gaf null`)),
        "image/jpeg",
        quality,
      );
    });
    return { blob, width: canvas.width, height: canvas.height, pageNumber };
  } finally {
    // Pagina-resources (o.a. gedecodeerde 600dpi-JPEG's) direct vrijgeven — bij 31
    // pagina's sequentieel houdt dit het geheugen vlak.
    page.cleanup();
  }
}
