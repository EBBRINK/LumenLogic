// Download van het merk-Excel-template (stap 6, patroon offerte-pdf-route): GET achter
// requireSession, xlsx on-the-fly uit de field-catalog, elke download gelogd
// (ijzeren regel 5) als 'brand_template_downloaded'.
import { db } from "@/db/client";
import { buildMasterTemplateXlsx, TEMPLATE_FILENAME } from "@/lib/excel-template";
import { logEvent } from "@/lib/repo/events";
import { getActor, requireSession } from "@/lib/session";

export async function GET() {
  await requireSession();

  const buffer = await buildMasterTemplateXlsx();

  await logEvent(db, {
    entity: "brand",
    entityId: null,
    action: "brand_template_downloaded",
    actor: await getActor(),
    payload: { filename: TEMPLATE_FILENAME },
  });

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
