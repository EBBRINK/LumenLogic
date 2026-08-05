// B2: download van het markdown-controlespoor van een importrun als .md-bijlage.
// Zelfde toegangsregels als de importrun-pagina: sessie verplicht, en de run moet bij
// dit project horen (geen kruislekken tussen dossiers).
import { db } from "@/db/client";
import { getImportRun } from "@/lib/repo/imports";
import { isUuid } from "@/lib/uuid";
import { getDossier } from "@/lib/repo/dossiers";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const toegang = await bewaakRoute("/projects/[id]/import/[runId]/markdown");
  const { id, runId } = await params;
  // Zelfde uuid-guard als de ocr-image-route hiernaast (UX-audit 30 jul, bug #1):
  // zonder deze regel klapt de uuid-cast in getImportRun op een kapotte param en
  // wordt een 404 een 500. Een route handler kan not-found.tsx niet renderen —
  // dus een kale 404-Response, maar wel in het Engels zoals de rest van de UI.
  if (!isUuid(runId)) {
    return new Response("Not found", { status: 404 });
  }
  // 3.2a — RIJ-SCOPING. De check hieronder ("hoort deze run bij dít dossier") zegt niets
  // over de vraag of de kijker dát dossier mag zien; zonder deze regel is een directe URL
  // naar de import van een ander bedrijf gewoon een geldige download. `getDossier` weegt de
  // scope mee, dus buiten de scope is het antwoord `null` — zelfde 404 als een dossier dat
  // niet bestaat.
  if (!(await getDossier(db, toegangScope(toegang), id))) {
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
