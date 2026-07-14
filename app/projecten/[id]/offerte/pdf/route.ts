// Download van de estimate als PDF (B5, stap 9). GET achter requireSession; de PDF
// wordt on-the-fly gegenereerd uit dezelfde bron als het scherm (lib/repo/estimate) en
// elke download wordt gelogd (ijzeren regel 5: elke offerte-actie in de events-tabel).
import { db } from "@/db/client";
import { renderEstimatePdf } from "@/lib/pdf/estimate";
import { getEstimateData } from "@/lib/repo/estimate";
import { logEvent } from "@/lib/repo/events";
import { getActor, requireSession } from "@/lib/session";

// Bestandsnaam: offertenummer als dat er is, anders de projectnaam — veilig geslugd.
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "estimate"
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const data = await getEstimateData(db, id);
  if (!data) return new Response("Project niet gevonden", { status: 404 });

  const bytes = await renderEstimatePdf(data);
  const filename = `estimate-${slug(data.header.quoteNumber ?? data.dossier.name)}.pdf`;

  await logEvent(db, {
    entity: "dossier",
    entityId: data.dossier.id,
    action: "estimate_pdf_generated",
    actor: await getActor(),
    payload: {
      quoteNumber: data.header.quoteNumber,
      lineCount: data.lines.length,
      filename,
    },
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
