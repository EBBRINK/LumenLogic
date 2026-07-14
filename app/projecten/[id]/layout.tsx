import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { DossierTabs } from "@/components/dossier/dossier-tabs";
import { PhaseBadge } from "@/components/dossier/phase-badge";
import { PhaseToggle } from "@/components/dossier/phase-toggle";
import { StatusTally } from "@/components/dossier/status-badge";
import { LifecycleControls } from "@/components/dossier/lifecycle-controls";
import { getDossier } from "@/lib/repo/dossiers";
import { getStatusCounts } from "@/lib/repo/matching";
import { getReviewCounts } from "@/lib/repo/review";
import { isReadOnly, type Lifecycle } from "@/lib/repo/lifecycle";
import type { StatusCounts } from "@/components/dossier/status";
import { requireSession } from "@/lib/session";
import { setPhaseAction } from "../actions";
import { setLifecycleAction } from "../lifecycle-actions";

// Gedeelde dossier-header + tabs (functioneel ontwerp §3.3): het dossier is de "map",
// alles eromheen zit achter één URL met tabs. Fasebadge + kleuren-telling zijn altijd
// in beeld — het dashboard van het dossier.
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
  const lifecycle = (dossier.lifecycle ?? "actief") as Lifecycle;
  const readOnly = isReadOnly(lifecycle);

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
        <div className="flex flex-col items-end gap-3">
          <PhaseToggle
            dossierId={dossier.id}
            phase={dossier.phase}
            action={setPhaseAction}
          />
          <LifecycleControls
            dossierId={dossier.id}
            lifecycle={lifecycle}
            archivedReason={dossier.archivedReason}
            action={setLifecycleAction}
          />
        </div>
      </header>

      {readOnly && (
        <div className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Dit project is {lifecycle === "delivered" ? "opgeleverd" : "gearchiveerd"} en
          daarmee read-only. Bewerkingen worden niet meer verwacht — heropen het project om
          weer te kunnen wijzigen.
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
