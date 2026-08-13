// De prijsloze estimate op het SCHERM (sprint 3.2b) — het externe renderpad.
//
// Zusje van quote-view.tsx, en om dezelfde reden een eigen bestand als bij de PDF: dit
// component krijgt een `PricelessEstimate` binnen (lib/repo/estimate-extern.ts) en dat
// type draagt geen `unitPrice`, geen regeltotaal, geen zone-subtotaal en geen
// `totals`-object. Een bedrag tonen is hier dus geen vergeten `if` maar een typefout.
//
// Wat er wél staat: de regels in aanvraagvolgorde, zones als groepskoppen, aantallen,
// statusbadges mét hun kleur, de afwijkingsnotities en de open punten. De klant ziet
// precies wat er geleverd wordt en waar het nog aan schort — alleen niet wat het kost.
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { notableDeviations, requestedText, PM_STATUSES } from "@/lib/repo/estimate";
import {
  EXTERN_ESTIMATE_DISCLAIMER,
  EXTERN_PM_SENTENCE,
  type PricelessEstimate,
  type PricelessLine,
  type PricelessZoneGroup,
} from "@/lib/repo/estimate-extern";
import { PhaseBadge } from "./phase-badge";
import { StatusBadge } from "./status-badge";
import { STATUS } from "./status";
import type { Phase } from "./types";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// Zes kolommen i.p.v. acht: "Unit price" en "Line total" bestaan hier niet.
const COLS = 6;

export function ExternalQuoteView({
  estimate,
  phase,
  actions,
}: {
  estimate: PricelessEstimate;
  phase: Phase;
  actions?: ReactNode;
}) {
  const { header, groups, hasZones, pmLines, pmByStatus, brandFreq } = estimate;

  return (
    // Zelfde documentbreedte als het interne stuk (896px) binnen de dossiercontainer.
    <div className="max-w-4xl">
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
            <h2 className="text-xl font-semibold tracking-tight">
              {estimate.dossierName}
            </h2>
          </div>
          <div className="print:hidden">
            <PhaseBadge phase={phase} />
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Quote number" value={estimate.quoteNumberDisplay} />
          <Field label="Date" value={header.quoteDate ?? "—"} />
          <Field label="Customer" value={header.customer ?? "—"} />
          <Field label="Project" value={header.projectRef ?? "—"} />
          <Field label="Author" value={header.author ?? "—"} />
          <Field label="Valid until" value={header.validUntil ?? "—"} />
        </dl>
        {/* Geen "Complete the quote header"-banner. Die wijst naar "Edit header" en naar
            "Generate estimate", en dat zijn allebei knoppen die een externe lezer niet
            heeft — een instructie geven voor een control die er niet is, is precies de
            val die het interne scherm op 30 juli heeft opgelost. */}
      </header>

      {estimate.lineCount === 0 ? (
        <EmptyState
          title="No spec lines yet."
          description="Lines appear here with their status as soon as Brink Licht adds them."
          action={null}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
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

      {/* Geen totalenblok — er valt niets op te tellen en er is niets te verantwoorden
          ("shown, not totaled" gaat over een totaal dat hier niet bestaat). */}

      {pmLines.length > 0 && (
        <section className="mt-8 border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Open items &amp; actions</h3>
          <ul className="space-y-1.5 text-sm">
            {PM_STATUSES.flatMap((s) =>
              pmByStatus[s].map((l) => (
                <li key={l.id} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      STATUS[s].dot,
                    )}
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">{l.fixtureCode}</span> —{" "}
                    {EXTERN_PM_SENTENCE[s](l)}
                  </span>
                </li>
              )),
            )}
          </ul>

          {brandFreq.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Brands still to be loaded
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

      {/* Letterlijk dezelfde string als in de PDF-voettekst (lib/repo/estimate-extern.ts). */}
      <p className="mt-6 text-xs text-muted-foreground">
        {EXTERN_ESTIMATE_DISCLAIMER}
      </p>
    </div>
  );
}

function ZoneRows({
  group,
  showZone,
}: {
  group: PricelessZoneGroup;
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

function LineRows({ line, nr }: { line: PricelessLine; nr: number }) {
  const displayName = line.productName ?? (requestedText(line) || "—");
  const notable = notableDeviations(line);
  const hasMarks =
    notable.length > 0 ||
    !!line.autoAccepted ||
    !!line.matchstationChosen ||
    !!line.manuallyChosen;

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
        <TableCell>
          <StatusBadge status={line.status} />
        </TableCell>
      </TableRow>
      {hasMarks && (
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell />
          <TableCell />
          <TableCell colSpan={COLS - 2} className="pt-0 text-xs text-muted-foreground">
            {notable.length > 0 && (
              <>
                deviation:{" "}
                {notable.map((d, i) => (
                  <span key={d.field}>
                    {i > 0 && " · "}
                    <span
                      className={
                        d.verdict === "rood"
                          ? "text-status-red-ink"
                          : d.verdict === "geel"
                            ? "text-status-amber-ink"
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
                automatically accepted near-match
              </span>
            )}
            {line.matchstationChosen && (
              <span className="italic">
                {notable.length > 0 && " — "}
                matched by the matchstation
              </span>
            )}
            {line.manuallyChosen && (
              <span className="italic">
                {notable.length > 0 && " — "}
                manually chosen
              </span>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
