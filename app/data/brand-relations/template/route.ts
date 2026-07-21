// Download van het merk-Excel-template (stap 6, patroon offerte-pdf-route): GET achter
// requireSession, xlsx on-the-fly uit de field-catalog, elke download gelogd
// (ijzeren regel 5) als 'brand_template_downloaded'.
import { db } from "@/db/client";
import { excelColumns } from "@/lib/field-catalog";
import { buildMasterTemplateXlsx, TEMPLATE_FILENAME } from "@/lib/excel-template";
import { laadCatalogus, listEigenVelden } from "@/lib/repo/custom-fields";
import { logEvent } from "@/lib/repo/events";
import { getActor, requireSession } from "@/lib/session";

export async function GET() {
  await requireSession();

  // De COMPLETE catalogus, inclusief Stefans eigen velden. Deze route is het enige moment
  // waarop een eigen veld het merk bereikt: bouwt hij het template uit FIELD_CATALOG, dan
  // krijgt het merk een bestand zonder die kolommen en blijft het veld voor altijd leeg.
  const catalogus = await laadCatalogus(db);
  const buffer = await buildMasterTemplateXlsx(catalogus);

  await logEvent(db, {
    entity: "brand",
    entityId: null,
    action: "brand_template_downloaded",
    actor: await getActor(),
    // Hoeveel kolommen dit bestand had en hoeveel daarvan eigen velden waren: zonder die
    // twee getallen is achteraf niet vast te stellen wélk template een merk ontving —
    // en dat is precies de vraag als een teruggestuurd bestand kolommen mist.
    payload: {
      filename: TEMPLATE_FILENAME,
      kolommen: excelColumns(catalogus).length,
      eigenVelden: (await listEigenVelden(db)).length,
    },
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
