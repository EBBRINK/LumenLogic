// Evaluatiescherm (H-07, K-06): de meetlat van de matcher. "Meet hit-rate" draait de
// evaluatieset tegen de huidige catalogus, toont de score + per-regel-diff, en de vorige
// runs eronder (score over tijd). Puur presentational; measureAction komt als prop binnen.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/dossier/status-badge";
import type { MatchStatus } from "@/components/dossier/status";
import { cn } from "@/lib/utils";

type FormAction = (formData: FormData) => void | Promise<void>;

export type EvalLine = {
  id: string;
  fixtureCode: string;
  brandText: string | null;
  productText: string | null;
  expectedStatus: MatchStatus;
};

export type EvalRunRow = {
  id: string;
  label: string;
  hitRate: string;
  results: { lineId: string; expected: string; got: string; hit: boolean }[] | null;
  createdAt: string | Date;
};

function pct(hitRate: string | number): string {
  return `${Math.round(Number(hitRate) * 100)}%`;
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EvaluationPanel({
  lines,
  runs,
  measureAction,
}: {
  lines: EvalLine[];
  runs: EvalRunRow[];
  measureAction: FormAction;
}) {
  // runs komen oudste-eerst binnen (listEvaluationRuns) → laatste is de nieuwste meting
  const latest = runs.length > 0 ? runs[runs.length - 1] : null;
  const byLine = new Map(lines.map((l) => [l.id, l]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Evaluation set</p>
          <p className="text-lg font-medium">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </p>
        </div>
        <form action={measureAction} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Label</span>
            <Input
              name="label"
              placeholder="e.g. after tolerance tweak"
              className="h-8 w-56"
            />
          </label>
          <Button type="submit" size="sm" disabled={lines.length === 0}>
            Measure hit-rate
          </Button>
        </form>
      </div>

      {latest ? (
        <div className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Latest measurement · {latest.label}
            </span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {pct(latest.hitRate)}
            </span>
          </div>
          {latest.results && latest.results.length > 0 && (
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Got</TableHead>
                  <TableHead className="text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.results.map((r) => {
                  const line = byLine.get(r.lineId);
                  return (
                    <TableRow key={r.lineId}>
                      <TableCell className="font-medium">
                        {line?.fixtureCode ?? r.lineId.slice(0, 8)}
                        {line?.productText && (
                          <span className="ml-1 text-muted-foreground">
                            {line.productText}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.expected as MatchStatus} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.got as MatchStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            r.hit
                              ? "text-status-green-ink"
                              : "text-status-red-ink",
                          )}
                        >
                          {r.hit ? "hit" : "miss"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No measurement run yet. Click &ldquo;Measure hit-rate&rdquo; to run the
          evaluation set against the current catalog.
        </p>
      )}

      {runs.length > 1 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Score over time
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Measurement</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Hit-rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...runs].reverse().map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(r.hitRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
