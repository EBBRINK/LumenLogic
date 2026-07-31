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
  dayPriceExpiredNote,
  notableDeviations,
  pmSummary,
  requestedText,
  ESTIMATE_DISCLAIMER,
  PM_STATUSES,
  type EstimateHeader,
  type EstimateLine,
  type EstimateZoneGroup,
  type PmStatus,
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

// Eén regel per p.m.-status in "Open items & actions" — dezelfde woorden als de PDF
// (lib/pdf/estimate.ts), want scherm en papier vertellen hetzelfde verhaal. Exhaustief
// getypeerd: een nieuwe status krijgt hier een zin, of het bouwt niet. Vóór A4 stonden
// hier alleen blauw en rood — paars én open hadden op het scherm géén bolletje, terwijl
// hun regeltotaal wel "p.m." zei.
const PM_ITEM: Record<PmStatus, (line: EstimateLine) => ReactNode> = {
  blauw: (l) => (
    <>
      load brand{" "}
      <span className="font-medium">{(l.brandText ?? "").trim() || "unknown"}</span>{" "}
      <span className="text-muted-foreground">(our action)</span>
    </>
  ),
  rood: () => (
    <>
      back to customer{" "}
      <span className="text-muted-foreground">(brand known, this product not)</span>
    </>
  ),
  paars: (l) => (
    <>
      outside assortment
      {requestedText(l) && (
        <>
          {" — "}
          <span className="font-medium">{requestedText(l)}</span>
        </>
      )}{" "}
      <span className="text-muted-foreground">(reported explicitly, p.m.)</span>
    </>
  ),
  open: (l) => (
    <>
      not matched yet
      {requestedText(l) && (
        <>
          {" — "}
          <span className="font-medium">{requestedText(l)}</span>
        </>
      )}{" "}
      <span className="text-muted-foreground">(no product chosen)</span>
    </>
  ),
};

export function QuoteView({
  dossierName,
  phase,
  header,
  lines,
  actions,
  frozen = false,
  headerEditable = false,
}: {
  dossierName: string;
  phase: Phase;
  header: EstimateHeader;
  lines: EstimateLine[];
  actions?: ReactNode;
  /** I-06: uitgestuurd. Dan is dit stuk het klantdocument — geen poort, geen banner. */
  frozen?: boolean;
  /**
   * Staat "Edit header" op deze pagina? Bepaalt WELKE instructie de banner geeft.
   * Default false: zonder dat de aanroeper het bevestigt wijzen we niet naar een blok
   * dat er misschien niet is — dat was precies de val (herstel 2026-07-30).
   */
  headerEditable?: boolean;
}) {
  const computed = computeEstimate(header, lines, { frozen });
  const { totals, pm, pmLines, pmByStatus, brandFreq, hasZones, groups } = computed;

  return (
    // Geen `mx-auto` meer — zelfde reden als in armaturenboek-view.tsx: binnen de
    // 1280px-dossiercontainer zou centreren het document uit het lood zetten met de
    // tabbalk erboven. De documentbreedte zelf (896px) verandert niet.
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
            <h2 className="text-xl font-semibold tracking-tight">{dossierName}</h2>
          </div>
          <div className="print:hidden">
            <PhaseBadge phase={phase} />
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Quote number" value={computed.quoteNumberDisplay} />
          <Field label="Date" value={header.quoteDate ?? "—"} />
          <Field label="Customer" value={header.customer ?? "—"} />
          <Field label="Project" value={header.projectRef ?? "—"} />
          <Field label="Author" value={header.author ?? "—"} />
          <Field label="Valid until" value={header.validUntil ?? "—"} />
        </dl>
        {/* UX-audit bug #6: een kop met lege datum/geldigheid mag niet stilzwijgend
            naar de printer. Bewust NIET op print:hidden — komt het stuk toch op
            papier (Ctrl+P van de browser), dan hoort deze regel er juist op te staan.
            Print/PDF/XIS zelf staan uit zolang dit blok er is; dat gebeurt in
            app/projects/[id]/quote/page.tsx, want daar wonen de knoppen.

            Twee correcties (herstel 2026-07-30):
             1. Een BEVROREN offerte krijgt nooit deze banner. computed.outputsAllowed
                staat dan open, dus de knoppen staan er ook — een melding "dit kan niet
                geprint worden" onder een printknop is een leugen, en het kopblok is
                toch op slot.
             2. De instructie noemt "Edit header" alleen als dat blok er echt staat.
                Anders is de enige echte uitweg "Generate estimate": dát is de stap die
                datum én geldigheid invult. De oude tekst stuurde de gebruiker naar een
                control die niet gerenderd was. */}
        {!computed.outputsAllowed && (
          <p
            role="status"
            className="mt-3 rounded-lg bg-status-amber-tint px-3 py-2 text-sm text-status-amber-ink"
          >
            <span className="font-medium">Complete the quote header</span> —{" "}
            {computed.missingHeaderFields.join(" and ")}{" "}
            {computed.missingHeaderFields.length === 1 ? "is" : "are"} still
            empty.{" "}
            {headerEditable
              ? "Fill them in under “Edit header”;"
              : "Use “Generate estimate” to fill them in;"}{" "}
            until then this estimate cannot be printed, downloaded or sent.
          </p>
        )}
      </header>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No spec lines yet. Add lines on the Lines tab; they appear here
          automatically with their status.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Line total</TableHead>
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
              <span className="text-muted-foreground">Green</span>
              <span className="tabular-nums">{formatEur(totals.groen)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Yellow</span>
              <span className="tabular-nums">{formatEur(totals.geel)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
              <span>Combined (green + yellow)</span>
              <span className="tabular-nums">{formatEur(totals.samen)}</span>
            </div>
            {/* Zelfde bron, zelfde zin als de PDF (pmSummary): élke niet-tellende
                status die er is, inclusief open. */}
            {pm.total > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Shown, not totaled ({pmSummary(pm)}) —{" "}
                <span className="font-medium">p.m.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* De poort staat op ÁLLE p.m.-regels: wat als p.m. in de kolom staat, staat hier
          verantwoord. Volgorde per status (PM_STATUSES), net als op de PDF. */}
      {pmLines.length > 0 && (
        <section className="mt-8 border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Open items &amp; actions</h3>
          <ul className="space-y-1.5 text-sm">
            {PM_STATUSES.flatMap((s) =>
              pmByStatus[s].map((l) => (
                <li key={l.id} className="flex items-start gap-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS[s].dot)} aria-hidden />
                  <span>
                    <span className="font-medium">{l.fixtureCode}</span> —{" "}
                    {PM_ITEM[s](l)}
                  </span>
                </li>
              )),
            )}
          </ul>

          {brandFreq.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Load brands (our action)
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

      {/* Letterlijk dezelfde string als in de PDF-voettekst (lib/repo/estimate.ts),
          opgebouwd uit de afgeleide statuslijsten — dus de uitleg noemt open óók. */}
      <p className="mt-6 text-xs text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
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
    totalCell = <span className="text-muted-foreground">ea.</span>;
  } else if (lineTotal == null) {
    totalCell = <span className="text-muted-foreground">—</span>;
  } else {
    totalCell = formatEur(lineTotal);
  }

  // Transparantieregel (C-07): benoemde afwijkingen als subregel — óók binnen groen.
  const notable = notableDeviations(line);
  // A7: verlopen dagprijs → dezelfde subregel, vooraan. Letterlijk dezelfde zin als op
  // de PDF (lib/repo/estimate.ts), want dit gaat over het bedrag in de kolom ernaast:
  // die toont dan de catalogusprijs, of "—" als er niets is om op terug te vallen.
  const expiredNote = dayPriceExpiredNote(line);
  const hasOtherMarks =
    notable.length > 0 || !!line.autoAccepted || !!line.manuallyChosen;

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
      {(hasOtherMarks || expiredNote) && (
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell />
          <TableCell />
          <TableCell
            colSpan={COLS - 2}
            className="pt-0 text-xs text-muted-foreground"
          >
            {expiredNote && (
              <span className="text-status-amber-ink">
                {expiredNote}
                {hasOtherMarks && " — "}
              </span>
            )}
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
