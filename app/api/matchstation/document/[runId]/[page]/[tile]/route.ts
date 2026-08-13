// Sprint M1 — bytes voor de pageImages-lijst die het ophaal-endpoint teruggeeft (de
// gerenderde OCR-paginabeelden, de beste documentreconstructie die er is — zie
// lib/repo/matchstation.ts, getDocumentForDossier, en HANDOVER.md voor waarom dit geen
// echt "origineel bestand" is). Machine-auth, geen mensensessie.
//
// Zelfde bytes-bron als app/projects/[id]/ocr-image/[runId]/[page]/route.ts
// (getOcrPageImage — B2: de ENIGE plek die de bytes-kolom van ocr_page_images
// selecteert), maar zonder de dossier-scope-check van die route: het matchstation
// heeft geen dossier-context vooraf, alleen de runId uit zijn eigen /werk-respons. Een
// runId die niet bij een gequeuede/geclaimde job hoort levert gewoon de bytes van die
// run — géén erger lek dan de bestaande route, want beide identificeren uitsluitend op
// een ondubbelzinnige uuid; het verschil is auth-vorm (machine-sleutel i.p.v. sessie),
// niet toegangsbreedte.
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";
import { getOcrPageImage } from "@/lib/repo/ocr";
import { isUuid } from "@/lib/uuid";
import { verifyMachineKey } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string; page: string; tile: string }> },
) {
  const auth = await verifyMachineKey(request.headers.get("x-matchstation-key"));
  if (!auth.ok) {
    await logEvent(db, {
      entity: "matchstation",
      action: "matchstation_auth_denied",
      payload: { reason: auth.reason, route: "document" },
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runId, page, tile } = await params;
  const pageNum = Number.parseInt(page, 10);
  const tileNum = Number.parseInt(tile, 10);
  if (!isUuid(runId) || !Number.isInteger(pageNum) || pageNum < 1 || !Number.isInteger(tileNum) || tileNum < 0) {
    return new Response("Not found", { status: 404 });
  }

  const image = await getOcrPageImage(db, runId, pageNum, tileNum);
  if (!image) return new Response("Not found", { status: 404 });

  const body = image.bytes.slice().buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
