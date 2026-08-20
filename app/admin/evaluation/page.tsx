// Evaluatie — de meetlat van de matcher (H-07, K-06). Toont de evaluatieset, meet de
// hit-rate tegen de huidige catalogus en de score over tijd.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  EvaluationPanel,
  type EvalLine,
  type EvalRunRow,
} from "@/components/data/evaluation-panel";
import type { MatchStatus } from "@/components/dossier/status";
import {
  listEvaluationLines,
  listEvaluationRuns,
} from "@/lib/repo/evaluation";
import { measureAction } from "./actions";
import { bewaakRoute } from "@/lib/route-toegang";

export default async function EvaluatiePage() {
  await bewaakRoute("/admin/evaluation");
  const [lines, runs] = await Promise.all([
    listEvaluationLines(db),
    listEvaluationRuns(db),
  ]);

  const evalLines: EvalLine[] = lines.map((l) => ({
    id: l.id,
    fixtureCode: l.fixtureCode,
    brandText: l.brandText,
    productText: l.productText,
    expectedStatus: l.expectedStatus as MatchStatus,
  }));

  const evalRuns: EvalRunRow[] = runs.map((r) => ({
    id: r.id,
    label: r.label,
    hitRate: r.hitRate,
    results: r.results,
    createdAt: r.createdAt,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Admin
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A fixed set of real spec lines with a human-set expected status. Each
          measurement runs the matcher against it — so with every tolerance or
          search tweak you see whether quality went up or down.
        </p>
      </header>
      <EvaluationPanel
        lines={evalLines}
        runs={evalRuns}
        measureAction={measureAction}
      />
    </main>
  );
}
