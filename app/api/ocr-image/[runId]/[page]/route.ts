// B2: paginabeeld van een OCR-run — de échte bron van de import (B6), getoond in
// het Tinder-deck (stap 6/7). Zelfde toegangsregel als de markdown-route: sessie
// verplicht. Dit is de enige plek die (via getOcrPageImage, de enige bytes-lezer
// in de repo-laag) de beeldbytes serveert. Cache privé: het beeld is onveranderlijk
// per (run, pagina), maar hoort nooit in een gedeelde cache.
import { db } from "@/db/client";
import { getOcrPageImage } from "@/lib/repo/ocr";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; page: string }> },
) {
  await requireSession();
  const { runId, page } = await params;
  const pageNum = Number.parseInt(page, 10);
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(pageNum) || pageNum < 1) {
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
      "Cache-Control": "private, max-age=3600",
    },
  });
}
