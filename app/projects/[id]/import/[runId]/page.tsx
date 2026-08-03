import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { ImportMarkdown } from "@/components/dossier/import-markdown";
import { ImportProposal } from "@/components/dossier/import-proposal";
import { getDossier } from "@/lib/repo/dossiers";
import { getImportRun } from "@/lib/repo/imports";
import { countFailedOcrPages } from "@/lib/repo/ocr";
import type { ImportRow } from "@/db/schema";
import { requireUuid } from "@/lib/uuid";
import { cancelImportAction, confirmImportAction } from "../actions";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

// Import-voorstelscherm (B-06). Zit binnen de dossier-layout → render alleen de eigen inhoud
// (fragment, geen <main>/header/tabs). Een eigen sub-terug-link naar de regels mag.
export default async function ImportRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const toegang = await bewaakRoute("/projects/[id]/import/[runId]");
  const { id, runId } = await params;
  // Beide uuid-kolommen (project_dossiers.id, import_runs.id) en beide in dezelfde
  // Promise.all — vóór de eigendomscheck hieronder, want die wordt nooit bereikt als
  // de cast al klapt.
  requireUuid(id, runId);
  const [dossier, run] = await Promise.all([
    getDossier(db, toegangScope(toegang), id),
    getImportRun(db, runId),
  ]);
  // run moet bestaan én bij dit dossier horen (geen kruislekken tussen dossiers)
  if (!dossier || !run || run.dossierId !== id) notFound();

  // goal-liegende-import-melding §3: de upload-kaart meldt "N of M pages failed"
  // ook, maar die melding leeft in clientstate en wordt door de navigatie
  // weggevaagd. Gefaalde pagina's zijn precies het feit waarop gehandeld moet
  // worden, dus staan ze hier server-afgeleid en blijvend.
  const failedPages =
    run.source === "ocr" ? await countFailedOcrPages(db, run.id) : 0;
  const ocrPageCount = (run.counts as Record<string, number> | null)?.pageCount;

  return (
    <>
      <Link
        href={`/projects/${dossier.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Lines
      </Link>

      {run.status === "voorstel" ? (
        <ImportProposal
          dossierId={dossier.id}
          runId={run.id}
          source={run.source}
          confidence={run.confidence}
          filename={run.filename}
          rows={(run.rows ?? []) as ImportRow[]}
          confirmAction={confirmImportAction}
          cancelAction={cancelImportAction}
        />
      ) : run.source === "pdf" ? (
        // PDF-imports zijn nooit een voorstel: deterministisch geparst, direct bevestigd.
        // Deze pagina is dan het controlespoor van de import (B2).
        <p className="text-sm text-muted-foreground">
          PDF import
          {run.filename && (
            <>
              {" "}
              of <span className="tabular-nums">{run.filename}</span>
            </>
          )}{" "}
          — {run.counts?.total ?? (run.rows ?? []).length} line
          {(run.counts?.total ?? (run.rows ?? []).length) === 1 ? "" : "s"}{" "}
          {run.status === "bevestigd" ? "added and matched" : "cancelled"}
          . The lines are with the project; the source text below is the audit
          trail.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          This import proposal is already{" "}
          {run.status === "bevestigd" ? "confirmed" : "cancelled"}. Go back to this
          project's lines.
        </p>
      )}

      {failedPages > 0 && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {failedPages} of {ocrPageCount ?? "?"} page
          {failedPages === 1 ? "" : "s"} could not be read — those lines are
          missing from this run. See the events log for the reason per page;
          choosing the same PDF again re-reads only what is missing.
        </p>
      )}

      {/* B2: markdown-controlespoor — inklapbaar + downloadbaar. */}
      {run.rawMarkdown && (
        <ImportMarkdown
          markdown={run.rawMarkdown}
          downloadHref={`/projects/${dossier.id}/import/${run.id}/markdown`}
        />
      )}
    </>
  );
}
