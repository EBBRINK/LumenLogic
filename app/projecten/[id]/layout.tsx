import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { DossierTabs } from "@/components/dossier/dossier-tabs";
import { PhaseBadge } from "@/components/dossier/phase-badge";
import { ProjectStatusBadge } from "@/components/dossier/project-status-badge";
import { ProjectStatusControls } from "@/components/dossier/project-status-controls";
import { StatusTally } from "@/components/dossier/status-badge";
import { getDossier } from "@/lib/repo/dossiers";
import { getStatusCounts } from "@/lib/repo/matching";
import { getReviewCounts } from "@/lib/repo/review";
import { isReadOnly } from "@/lib/repo/project-status";
import type { StatusCounts } from "@/components/dossier/status";
import { requireSession } from "@/lib/session";
import { setStatusAction, setXisPhaseAction } from "../actions";

// Gedeelde dossier-header + tabs (functioneel ontwerp §3.3): het dossier is de "map",
// alles eromheen zit achter één URL met tabs. Statusbadge, afgeleide fase (badge) en
// kleuren-telling zijn altijd in beeld — het dashboard van het dossier. Read-only
// alléén bij status archief (B6).
export default async function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const counts = (await getStatusCounts(db, id)) as StatusCounts;
  const review = await getReviewCounts(db, id);
  const readOnly = isReadOnly(dossier.status);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <Link
        href="/projecten"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Projecten
      </Link>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {dossier.name}
            </h1>
            <ProjectStatusBadge status={dossier.status} />
            {/* De afgeleide veiligheidsstand (regel 4) — geen toggle meer, alleen tonen. */}
            <PhaseBadge phase={dossier.phase} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {dossier.customer && (
              <span className="text-sm text-muted-foreground">
                {dossier.customer}
              </span>
            )}
            <StatusTally counts={counts} />
          </div>
        </div>
        <ProjectStatusControls
          dossierId={dossier.id}
          status={dossier.status}
          xisPhase={dossier.xisPhase}
          archivedReason={dossier.archivedReason}
          statusAction={setStatusAction}
          xisPhaseAction={setXisPhaseAction}
        />
      </header>

      {readOnly && (
        <div className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Dit project is gearchiveerd en daarmee read-only. Zet de status terug
          (bijvoorbeeld naar concept) om weer te kunnen wijzigen.
        </div>
      )}

      <div className="mb-8">
        <DossierTabs
          dossierId={dossier.id}
          phase={dossier.phase}
          reviewPending={review.pending}
          reviewTotal={review.total}
        />
      </div>

      {children}
    </main>
  );
}
