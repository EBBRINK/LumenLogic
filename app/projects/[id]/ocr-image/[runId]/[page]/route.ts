// B2: paginabeeld van een OCR-run — de échte bron van de import (B6), getoond in
// het Tinder-deck (stap 6/7). Zelfde toegangsregels als de markdown-route hiernaast:
// sessie verplicht én de run moet bij dit project horen (geen kruislekken tussen
// dossiers). Dit is de enige plek die (via getOcrPageImage, de enige bytes-lezer in
// de repo-laag) de beeldbytes serveert. Cache: no-store — een geauthenticeerd
// bronbeeld hoort niet in de browsercache te blijven hangen na uitloggen.
import { db } from "@/db/client";
import { getImportRun } from "@/lib/repo/imports";
import { getOcrPageImage } from "@/lib/repo/ocr";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string; page: string }> },
) {
  await requireSession();
  const { id, runId, page } = await params;
  const pageNum = Number.parseInt(page, 10);
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(pageNum) || pageNum < 1) {
    return new Response("Niet gevonden", { status: 404 });
  }
  // Eigendomscheck (zoals de markdown-route): run onbekend of van een ander
  // dossier → zelfde 404, geen onderscheid naar buiten.
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== id) {
    return new Response("Niet gevonden", { status: 404 });
  }
  const image = await getOcrPageImage(db, runId, pageNum);
  if (!image) return new Response("Niet gevonden", { status: 404 });
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
