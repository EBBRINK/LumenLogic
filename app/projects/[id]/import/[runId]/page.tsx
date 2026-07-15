import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { ImportMarkdown } from "@/components/dossier/import-markdown";
import { ImportProposal } from "@/components/dossier/import-proposal";
import { getDossier } from "@/lib/repo/dossiers";
import { getImportRun } from "@/lib/repo/imports";
import type { ImportRow } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { cancelImportAction, confirmImportAction } from "../actions";

// Import-voorstelscherm (B-06). Zit binnen de dossier-layout → render alleen de eigen inhoud
// (fragment, geen <main>/header/tabs). Een eigen sub-terug-link naar de regels mag.
export default async function ImportRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  await requireSession();
  const { id, runId } = await params;
  const [dossier, run] = await Promise.all([
    getDossier(db, id),
    getImportRun(db, runId),
  ]);
  // run moet bestaan én bij dit dossier horen (geen kruislekken tussen dossiers)
  if (!dossier || !run || run.dossierId !== id) notFound();

  return (
    <>
      <Link
        href={`/projects/${dossier.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Regels
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
          PDF-import
          {run.filename && (
            <>
              {" "}
              van <span className="tabular-nums">{run.filename}</span>
            </>
          )}{" "}
          — {run.counts?.total ?? (run.rows ?? []).length} regel
          {(run.counts?.total ?? (run.rows ?? []).length) === 1 ? "" : "s"}{" "}
          {run.status === "bevestigd" ? "toegevoegd en gematcht" : "geannuleerd"}
          . De regels staan bij het project; hieronder staat de brontekst als
          controlespoor.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Dit importvoorstel is al{" "}
          {run.status === "bevestigd" ? "bevestigd" : "geannuleerd"}. Ga terug
          naar de regels van dit project.
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
