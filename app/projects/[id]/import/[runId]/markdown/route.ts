// B2: download van het markdown-controlespoor van een importrun als .md-bijlage.
// Zelfde toegangsregels als de importrun-pagina: sessie verplicht, en de run moet bij
// dit project horen (geen kruislekken tussen dossiers).
import { db } from "@/db/client";
import { getImportRun } from "@/lib/repo/imports";
import { isUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  await requireSession();
  const { id, runId } = await params;
  // Zelfde uuid-guard als de ocr-image-route hiernaast (UX-audit 30 jul, bug #1):
  // zonder deze regel klapt de uuid-cast in getImportRun op een kapotte param en
  // wordt een 404 een 500. Een route handler kan not-found.tsx niet renderen —
  // dus een kale 404-Response, maar wel in het Engels zoals de rest van de UI.
  if (!isUuid(runId)) {
    return new Response("Not found", { status: 404 });
  }
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== id || !run.rawMarkdown) {
    return new Response("Not found", { status: 404 });
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
