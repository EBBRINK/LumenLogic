// Download van de estimate als PDF (B5, stap 9). GET achter requireSession; de PDF
// wordt on-the-fly gegenereerd uit dezelfde bron als het scherm (lib/repo/estimate) en
// elke download wordt gelogd (ijzeren regel 5: elke offerte-actie in de events-tabel).
import { db } from "@/db/client";
import { renderEstimatePdf } from "@/lib/pdf/estimate";
import { getEstimateData } from "@/lib/repo/estimate";
import { logEvent } from "@/lib/repo/events";
import { isUuid } from "@/lib/uuid";
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
  // Uuid-guard (UX-audit 30 jul, bug #1). Deze route is de derde van de drie
  // route handlers en werd bij de eerste ronde overgeslagen: `id` gaat via
  // getEstimateData → getDossier in eq(projectDossiers.id, …), een uuid-kolom, dus
  // /projects/nope/quote/pdf gaf `invalid input syntax for type uuid` → 500.
  // Een route handler draait GEEN layout, dus de guard in app/projects/[id]/layout.tsx
  // dekt dit pad niet — hij moet hier staan. En hij kan not-found.tsx niet renderen,
  // dus een kale 404-Response, in het Engels zoals de rest van de UI.
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const data = await getEstimateData(db, id);
  if (!data) return new Response("Not found", { status: 404 });

  // Kopblokpoort (UX-audit 30 jul, bug #6). Het scherm verbergt de downloadknop zolang
  // datum of geldigheid leeg is, maar deze route is ook rechtstreeks op te vragen —
  // dan zou het onvolledige klantstuk alsnog stil de deur uit gaan. 409: er is niets
  // mis met de aanvraag, de offerte is nog niet zover.
  //
  // outputsAllowed, niet headerComplete (herstel 2026-07-30): een bevroren offerte is
  // het al verstuurde document en moet altijd opnieuw te downloaden zijn. Met
  // headerComplete gaf deze route 409 op élke offerte die vóór vandaag is gemaakt.
  if (!data.computed.outputsAllowed) {
    return new Response(
      `The quote header is incomplete (${data.computed.missingHeaderFields.join(", ")}). Fill it in on the estimate tab before downloading the PDF.`,
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

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
