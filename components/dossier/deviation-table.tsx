import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fieldLabel } from "@/lib/matching/tolerances";
import { STATUS } from "./status";
import type { Deviation } from "./types";

// Transparantietabel (C-07): élke afwijking wordt benoemd — óók de velden die kloppen,
// óók binnen een groene regel. Niets wordt stil weggelaten. "onbekend" is geen fout maar
// een eerlijke grijze vlag ("geen data"): ontbrekende data ≠ afwijking.
//
// Het oordeel per veld leunt op dezelfde badge-taal als de statussen (status.ts): dezelfde
// kleur betekent overal hetzelfde. Rustige tinten, geen rode alarmen.
const VERDICT: Record<
  Deviation["verdict"],
  { dot: string; tint: string; label: string }
> = {
  groen: { dot: STATUS.groen.dot, tint: STATUS.groen.tint, label: "within margin" },
  geel: { dot: STATUS.geel.dot, tint: STATUS.geel.tint, label: "yellow margin" },
  rood: { dot: STATUS.rood.dot, tint: STATUS.rood.tint, label: "outside margin" },
  onbekend: { dot: STATUS.open.dot, tint: STATUS.open.tint, label: "no data" },
};

function showValue(v: string | number | null | undefined) {
  return v == null || v === "" ? "—" : String(v);
}

export function DeviationTable({
  deviations,
}: {
  deviations?: Deviation[] | null;
}) {
  const rows = deviations ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deviations recorded yet. Once a match is chosen, every requested field
        appears here with its verdict — including the fields that match.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Delivered</TableHead>
          <TableHead>Verdict</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => {
          const v = VERDICT[d.verdict];
          const missing = d.verdict === "onbekend" && d.delivered == null;
          return (
            <TableRow key={d.field}>
              <TableCell className="font-medium">
                {fieldLabel(d.field)}
              </TableCell>
              <TableCell className="tabular-nums">
                {showValue(d.requested)}
              </TableCell>
              <TableCell className="tabular-nums">
                {missing ? (
                  <span className="text-muted-foreground">no data</span>
                ) : (
                  showValue(d.delivered)
                )}
              </TableCell>
              <TableCell>
                <span
                  title={d.note}
                  className={cn(
                    "inline-flex h-5 w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    v.tint,
                  )}
                >
                  <span
                    className={cn("size-2 rounded-full", v.dot)}
                    aria-hidden
                  />
                  {v.label}
                </span>
                {/* UX-audit 30 jul (bug #8): bij "onbekend" luidde de note "no data for
                    beam angle" — dat herhaalt de badge ernaast én de Field-kolom in
                    dezelfde rij. Eén keer "no data" is genoeg; de volle note blijft in
                    het title-attribuut van de badge staan. */}
                {d.note && d.verdict !== "onbekend" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {d.note}
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
