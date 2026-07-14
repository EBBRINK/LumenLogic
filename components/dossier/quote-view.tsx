import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  computeEstimate,
  countedLineTotal,
  countsInTotal,
  notableDeviations,
  requestedText,
  type EstimateHeader,
  type EstimateLine,
  type EstimateZoneGroup,
} from "@/lib/repo/estimate";
import { PhaseBadge } from "./phase-badge";
import { StatusBadge } from "./status-badge";
import { STATUS } from "./status";
import type { Phase } from "./types";

// De berekening (totalen, p.m., zones, nummering) leeft in lib/repo/estimate.ts —
// één bron voor scherm én PDF (stap 9). Dit component rendert alleen.
export type { EstimateHeader, EstimateLine } from "@/lib/repo/estimate";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const COLS = 8;

export function QuoteView({
  dossierName,
  phase,
  header,
  lines,
  actions,
}: {
  dossierName: string;
  phase: Phase;
  header: EstimateHeader;
  lines: EstimateLine[];
  actions?: ReactNode;
}) {
  const computed = computeEstimate(header, lines);
  const { totals, pm, blauwLines, roodLines, brandFreq, hasZones, groups } =
    computed;

  return (
    <div className="mx-auto max-w-4xl">
      {actions && (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2 print:hidden">
          {actions}
        </div>
      )}

      <header className="mb-6 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Estimate
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{dossierName}</h2>
          </div>
          <div className="print:hidden">
            <PhaseBadge phase={phase} />
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Offertenummer" value={computed.quoteNumberDisplay} />
          <Field label="Datum" value={header.quoteDate ?? "—"} />
          <Field label="Klant" value={header.customer ?? "—"} />
          <Field label="Project" value={header.projectRef ?? "—"} />
          <Field label="Opsteller" value={header.author ?? "—"} />
          <Field label="Geldig tot" value={header.validUntil ?? "—"} />
        </dl>
      </header>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen spec-regels. Voeg regels toe op het tabblad Regels; ze verschijnen
          hier automatisch met hun status.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Aantal</TableHead>
              <TableHead className="text-right">Stukprijs</TableHead>
              <TableHead className="text-right">Regeltotaal</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <ZoneRows key={g.zone ?? "__none__"} group={g} showZone={hasZones} />
            ))}
          </TableBody>
        </Table>
      )}

      {lines.length > 0 && (
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Groen</span>
              <span className="tabular-nums">{formatEur(totals.groen)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Geel</span>
              <span className="tabular-nums">{formatEur(totals.geel)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
              <span>Samen (groen + geel)</span>
              <span className="tabular-nums">{formatEur(totals.samen)}</span>
            </div>
            {pm.total > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Getoond, niet opgeteld (blauw {pm.blauw} · rood {pm.rood} · paars{" "}
                {pm.paars}) — <span className="font-medium">p.m.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {(blauwLines.length > 0 || roodLines.length > 0) && (
        <section className="mt-8 border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Open punten &amp; acties</h3>
          <ul className="space-y-1.5 text-sm">
            {blauwLines.map((l) => (
              <li key={l.id} className="flex items-start gap-2">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS.blauw.dot)} aria-hidden />
                <span>
                  <span className="font-medium">{l.fixtureCode}</span> — merk{" "}
                  <span className="font-medium">
                    {(l.brandText ?? "").trim() || "onbekend"}
                  </span>{" "}
                  inladen <span className="text-muted-foreground">(ons)</span>
                </span>
              </li>
            ))}
            {roodLines.map((l) => (
              <li key={l.id} className="flex items-start gap-2">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS.rood.dot)} aria-hidden />
                <span>
                  <span className="font-medium">{l.fixtureCode}</span> — terug naar
                  klant <span className="text-muted-foreground">(merk bekend, dit product niet)</span>
                </span>
              </li>
            ))}
          </ul>

          {brandFreq.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Merken inladen (ons)
              </p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {brandFreq.map(([brand, n]) => (
                  <li key={brand} className="tabular-nums">
                    {brand} — {n}×
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Brutoprijzen excl. btw uit geldige prijslijsten. Alleen groen en geel tellen mee;
        blauw, rood en paars staan als p.m. — getoond, niet opgeteld. Aanvraagvolgorde
        is aangehouden.
      </p>
    </div>
  );
}

// Rendert de regels van één zone. Het regelnummer is al vooraf toegekend
// (aanvraagvolgorde blijft heilig).
function ZoneRows({
  group,
  showZone,
}: {
  group: EstimateZoneGroup;
  showZone: boolean;
}) {
  return (
    <>
      {showZone && (
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell
            colSpan={COLS}
            className="pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Zone {group.zone}
          </TableCell>
        </TableRow>
      )}
      {group.lines.map((nl) => (
        <LineRows key={nl.line.id} line={nl.line} nr={nl.nr} />
      ))}
    </>
  );
}

function LineRows({ line, nr }: { line: EstimateLine; nr: number }) {
  const counting = countsInTotal(line.status);
  const displayName = line.productName ?? (requestedText(line) || "—");

  // Regeltotaal-cel: p.m. voor niet-tellende statussen, p/st bij ontbrekend aantal.
  let totalCell: ReactNode;
  const lineTotal = countedLineTotal(line);
  if (!counting) {
    totalCell = <span className="text-muted-foreground">p.m.</span>;
  } else if (line.quantity == null) {
    totalCell = <span className="text-muted-foreground">p/st</span>;
  } else if (lineTotal == null) {
    totalCell = <span className="text-muted-foreground">—</span>;
  } else {
    totalCell = formatEur(lineTotal);
  }

  // Transparantieregel (C-07): benoemde afwijkingen als subregel — óók binnen groen.
  const notable = notableDeviations(line);

  return (
    <>
      <TableRow>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {nr}
        </TableCell>
        <TableCell className="font-medium">{line.fixtureCode}</TableCell>
        <TableCell className="max-w-64 whitespace-normal">{displayName}</TableCell>
        <TableCell className="tabular-nums text-muted-foreground">
          {line.sku ?? "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {line.quantity ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {line.unitPrice != null ? (
            formatEur(line.unitPrice)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{totalCell}</TableCell>
        <TableCell>
          <StatusBadge status={line.status} />
        </TableCell>
      </TableRow>
      {(notable.length > 0 || line.autoAccepted || line.manuallyChosen) && (
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell />
          <TableCell />
          <TableCell
            colSpan={COLS - 2}
            className="pt-0 text-xs text-muted-foreground"
          >
            {notable.length > 0 && (
              <>
                afwijking:{" "}
                {notable.map((d, i) => (
                  <span key={d.field}>
                    {i > 0 && " · "}
                    <span
                      className={
                        d.verdict === "rood"
                          ? "text-rose-600 dark:text-rose-400"
                          : d.verdict === "geel"
                            ? "text-amber-600 dark:text-amber-400"
                            : ""
                      }
                    >
                      {d.note}
                    </span>
                  </span>
                ))}
              </>
            )}
            {line.autoAccepted && (
              <span className="italic">
                {notable.length > 0 && " — "}
                automatisch geaccepteerde bijna-match
              </span>
            )}
            {line.manuallyChosen && (
              <span className="italic">
                {notable.length > 0 && " — "}
                handmatig gekozen
              </span>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
