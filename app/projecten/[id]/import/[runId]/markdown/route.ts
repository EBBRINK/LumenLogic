// B2: download van het markdown-controlespoor van een importrun als .md-bijlage.
// Zelfde toegangsregels als de importrun-pagina: sessie verplicht, en de run moet bij
// dit project horen (geen kruislekken tussen dossiers).
import { db } from "@/db/client";
import { getImportRun } from "@/lib/repo/imports";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  await requireSession();
  const { id, runId } = await params;
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== id || !run.rawMarkdown) {
    return new Response("Niet gevonden", { status: 404 });
  }
  // Bestandsnaam op basis van de geüploade PDF ("boek.pdf" → "boek.md"); rare tekens
  // eruit zodat de Content-Disposition-header niet te breken is.
  const base =
    (run.filename ?? "import")
      .replace(/\.pdf$/i, "")
      .replace(/[^\w.\- ]+/g, "_")
      .trim() || "import";
  return new Response(run.rawMarkdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.md"`,
    },
  });
}
