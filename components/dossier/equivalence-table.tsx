import { Badge } from "@/components/ui/badge";
import { formatEur } from "@/lib/format";
import type { AlternativeView, ComparedField } from "./types";

function Verdict({ v }: { v: ComparedField["verdict"] }) {
  if (v === "better")
    return <span className="font-medium text-emerald-600 dark:text-emerald-400">↑ better</span>;
  if (v === "worse")
    return <span className="text-destructive">↓ worse</span>;
  if (v === "equal")
    return <span className="text-muted-foreground">= equal</span>;
  return <span className="text-muted-foreground">— no data</span>;
}

function Row({ f }: { f: ComparedField }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pr-3 text-muted-foreground">{f.label}</td>
      <td className="py-1.5 pr-3 tabular-nums">{f.reference ?? "—"}</td>
      <td className="py-1.5 pr-3 tabular-nums">{f.candidate ?? "—"}</td>
      <td className="py-1.5 pr-3 text-xs">
        <Verdict v={f.verdict} />
      </td>
      <td className="py-1.5 text-xs text-muted-foreground">{f.source}</td>
    </tr>
  );
}

// Objectieve gelijkwaardigheids- + duurzaamheidsvergelijking van één alternatief tegen de
// referentie. Prijs staat er wél (informatief) maar is nadrukkelijk NIET meegewogen (regel 2).
export function EquivalenceTable({ alt }: { alt: AlternativeView }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{alt.brandName}</span>
            <Badge variant="secondary" className="text-[10px]">
              equivalence {alt.equivalenceScore.toFixed(1)}
            </Badge>
          </div>
          <p className="font-medium">{alt.name}</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {alt.rationale}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular-nums font-medium">{formatEur(alt.grossPrice)}</p>
          <p className="text-[10px] text-muted-foreground">
            price — not in the weighting
          </p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Reference</th>
            <th className="py-1 pr-3 font-medium">Alternative</th>
            <th className="py-1 pr-3 font-medium">Verdict</th>
            <th className="py-1 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Technical
            </td>
          </tr>
          {alt.technical.map((f) => (
            <Row key={f.label} f={f} />
          ))}
          <tr>
            <td colSpan={5} className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sustainability
            </td>
          </tr>
          {alt.sustainability.map((f) => (
            <Row key={f.label} f={f} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
