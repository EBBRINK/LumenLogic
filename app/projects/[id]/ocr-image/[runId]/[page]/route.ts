// B2: paginabeeld van een OCR-run — de échte bron van de import (B6), getoond in
// het Tinder-deck (stap 6/7). Zelfde toegangsregels als de markdown-route hiernaast:
// sessie verplicht én de run moet bij dit project horen (geen kruislekken tussen
// dossiers). Dit is de enige plek die (via getOcrPageImage, de enige bytes-lezer in
// de repo-laag) de beeldbytes serveert. Cache: no-store — een geauthenticeerd
// bronbeeld hoort niet in de browsercache te blijven hangen na uitloggen.
import { db } from "@/db/client";
import { getImportRun } from "@/lib/repo/imports";
import { getOcrPageImage } from "@/lib/repo/ocr";
import { isUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string; page: string }> },
) {
  await requireSession();
  const { id, runId, page } = await params;
  const pageNum = Number.parseInt(page, 10);
  // Het uuid-patroon stond hier inline; het woont nu in lib/uuid.ts, zodat de
  // pagina's en deze route één definitie delen (UX-audit 30 jul, bug #1). Een route
  // handler kan not-found.tsx niet renderen — daarom een kale 404-Response, maar wel
  // in het Engels zoals de rest van de UI.
  if (!isUuid(runId) || !Number.isInteger(pageNum) || pageNum < 1) {
    return new Response("Not found", { status: 404 });
  }
  // O4 (A3-tiling): optioneel ?tile=n — een specifieke tegel van de pagina.
  // Zonder queryparam de laagste tegel (tile 0 = hele pagina bij bestaande
  // runs, dus byte-identiek aan vroeger). Ongeldig (geen int ≥ 0) → zelfde
  // 404-pad als elke andere kapotte parameter.
  const tileRaw = new URL(req.url).searchParams.get("tile");
  let tile: number | undefined;
  if (tileRaw != null) {
    if (!/^\d+$/.test(tileRaw)) {
      return new Response("Not found", { status: 404 });
    }
    tile = Number.parseInt(tileRaw, 10);
  }
  // Eigendomscheck (zoals de markdown-route): run onbekend of van een ander
  // dossier → zelfde 404, geen onderscheid naar buiten.
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== id) {
    return new Response("Not found", { status: 404 });
  }
  const image = await getOcrPageImage(db, runId, pageNum, tile);
  if (!image) return new Response("Not found", { status: 404 });
  // Uint8Array → los ArrayBuffer-slice zodat Response een nette BodyInit krijgt.
  const body = image.bytes.slice().buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
