import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fieldLabelTitle } from "@/lib/matching/tolerances";
import { STATUS } from "./status";
import type { Deviation } from "./types";

// Transparantietabel (C-07): élke afwijking wordt benoemd — óók de velden die kloppen,
// óók binnen een groene regel. Niets wordt stil weggelaten. "onbekend" is geen fout maar
// een eerlijke grijze vlag ("geen data"): ontbrekende data ≠ afwijking.
//
// Het oordeel per veld leunt op dezelfde badge-taal als de statussen (status.ts): dezelfde
// kleur betekent overal hetzelfde. Rustige tinten, geen rode alarmen.
//
// Geëxporteerd sinds de UX-audit van 30 jul (item 3): de kandidatenkaarten tonen nu
// dezelfde per-veld-oordelen als deze tabel. Eén map, dus "geel" kan daar nooit een
// andere kleur of een ander woord krijgen dan hier.
export const VERDICT: Record<
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
          // "no data" wordt door de Verdict-badge gedragen. Zegt de rij dát al, dan is
          // elke tweede "no data" in dezelfde rij ruis — zie de toelichting hieronder.
          const missing = d.verdict === "onbekend" && d.delivered == null;
          const noteIsRedundant = missing;
          return (
            <TableRow key={d.field}>
              <TableCell className="font-medium">
                {fieldLabelTitle(d.field)}
              </TableCell>
              <TableCell className="tabular-nums">
                {showValue(d.requested)}
              </TableCell>
              {/* UX-audit 30 jul (bug #8), REPARATIE 30 jul: hier stond een grijze
                  "no data"-tekst, pal naast de "● no data"-badge in de Verdict-cel van
                  dezelfde rij. De vorige ronde haalde alleen de derde herhaling (de note)
                  weg; het aangrenzende paar bleef staan en is precies waar de audit over
                  ging. De cel toont nu het gewone streepje voor "leeg" — één "no data"
                  per rij, in de kolom die het oordeel draagt. */}
              <TableCell className="tabular-nums">
                {showValue(d.delivered)}
              </TableCell>
              <TableCell>
                <span
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
                {/* De note stond in een `title`-attribuut. Dat is geen weergave: een
                    title verschijnt alleen bij muis-hover — niet met toetsenbord, niet op
                    touch. Bij "onbekend zonder waarde" luidt de note "no data for beam
                    angle" en herhaalt hij letterlijk de badge plus de Field-kolom; die
                    laten we weg. In élk ander geval (ook "onbekend" mét een geleverde
                    waarde, waar de note de énige uitleg is) staat hij gewoon als tekst. */}
                {d.note && !noteIsRedundant && (
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
