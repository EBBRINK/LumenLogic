// Verrijking — overzicht (H-03…H-06). Merk kiezen om de parser te draaien + de runs-lijst.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  BrandPicker,
  EnrichmentRunsTable,
  type EnrichRunRow,
} from "@/components/data/enrichment-panels";
import type { RunStatus } from "@/components/data/enrichment-status";
import {
  listEnrichableBrands,
  listEnrichmentRuns,
} from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";
import { startRunAction } from "../actions";

export default async function VerrijkingPage() {
  await requireSession();
  const [brands, runs] = await Promise.all([
    listEnrichableBrands(db),
    listEnrichmentRuns(db),
  ]);

  const runRows: EnrichRunRow[] = runs.map((r) => ({
    id: r.id,
    brandName: r.brandName,
    status: r.status as RunStatus,
    counts: r.counts as Record<string, number> | null,
    sampleErrorRate: r.sampleErrorRate,
    createdAt: r.createdAt,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Enrichment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The parser reads specs from the product name and proposes them. You check
          a sample by hand; only after publishing do they land on the products. LLM
          enrichment (for names without recognizable specs) is a later step.
        </p>
      </header>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <h2 className="mb-3 text-sm font-medium">New run</h2>
        <BrandPicker brands={brands} startAction={startRunAction} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Runs
        </h2>
        <EnrichmentRunsTable runs={runRows} />
      </section>
    </main>
  );
}
