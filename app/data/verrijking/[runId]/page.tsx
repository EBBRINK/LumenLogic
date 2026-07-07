// Verrijking — steekproef controleren (H-05). Per item goed/fout + publiceren/verwerpen.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  SampleReview,
  type SampleItem,
} from "@/components/data/enrichment-panels";
import {
  RunStatusBadge,
  type RunStatus,
} from "@/components/data/enrichment-status";
import { getEnrichmentRun, getSampleItems } from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";
import {
  publishRunAction,
  rejectRunAction,
  setVerdictAction,
} from "../../actions";

export default async function VerrijkingRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requireSession();
  const { runId } = await params;
  const run = await getEnrichmentRun(db, runId);
  if (!run) notFound();

  const items = await getSampleItems(db, runId);
  const sampleItems: SampleItem[] = items.map((it) => ({
    id: it.id,
    productName: it.productName,
    field: it.field,
    value: it.value,
    sampleVerdict: it.sampleVerdict as "goed" | "fout" | null,
  }));

  const counts = (run.counts as Record<string, number> | null) ?? {};

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link
        href="/data/verrijking"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Verrijking
      </Link>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {run.brandName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {counts.geparsed ?? 0} geparste velden · {counts.steekproef ?? 0} in
            de steekproef
            {run.status === "gepubliceerd" && counts.toegepast != null && (
              <> · {counts.toegepast} toegepast</>
            )}
          </p>
        </div>
        <RunStatusBadge status={run.status as RunStatus} />
      </header>

      <SampleReview
        runId={run.id}
        status={run.status as RunStatus}
        items={sampleItems}
        verdictAction={setVerdictAction}
        publishAction={publishRunAction}
        rejectAction={rejectRunAction}
      />
    </main>
  );
}
