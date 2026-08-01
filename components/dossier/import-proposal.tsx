// Import-voorstelscherm (functioneel ontwerp §3.5, B-06/B-07). Een geparste import (PDF/
// OCR/LLM/CSV) staat hier vóór opslaan: herkomst + betrouwbaarheid bovenaan, elke rij
// aanvinkbaar. OCR/LLM staat standaard UIT — de mens vinkt aan wat klopt. Niets is
// opgeslagen tot bevestigen; annuleren gooit alles weg. Geen alarmkleuren: een import is
// geen fout, alleen iets dat controle vraagt.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCheck } from "./icons";
import type { ImportRow } from "@/db/schema";

// Herkomst-etiket per bron (rustige tekst, geen jargon).
const SOURCE_LABEL: Record<string, string> = {
  pdf: "PDF (text layer)",
  ocr: "OCR (scanned)",
  llm: "AI extraction",
  csv: "CSV paste",
  bestek: "Specification",
};

// Onzekere bronnen: hier tellen we niet op vertrouwen, hier controleer je elke regel.
function isUncertain(source: string): boolean {
  return source === "ocr" || source === "llm";
}

// Compacte specs-samenvatting voor de rij ("3000K · CRI90 · IP20").
function specSummary(row: ImportRow): string {
  const s = row.specs ?? {};
  const parts: string[] = [];
  if (s.kelvin != null) parts.push(`${s.kelvin}K`);
  if (s.cri != null) parts.push(`CRI${s.cri}`);
  if (s.ip) parts.push(String(s.ip));
  if (s.watt != null) parts.push(`${s.watt}W`);
  if (s.lumen != null) parts.push(`${s.lumen}lm`);
  if (s.beamAngle != null) parts.push(`${s.beamAngle}°`);
  if (s.color) parts.push(String(s.color));
  if (s.dimmable) parts.push(String(s.dimmable));
  return parts.join(" · ");
}

export function ImportProposal({
  dossierId,
  runId,
  source,
  confidence,
  filename,
  rows,
  confirmAction,
  cancelAction,
}: {
  dossierId: string;
  runId: string;
  source: string;
  confidence?: string | null;
  filename?: string | null;
  rows: ImportRow[];
  confirmAction?: (formData: FormData) => void | Promise<void>;
  cancelAction?: (formData: FormData) => void | Promise<void>;
}) {
  const uncertain = isUncertain(source);
  const checkedCount = rows.filter((r) => r.checked).length;
  const hasPages = rows.some((r) => r.page != null);

  return (
    <form action={confirmAction}>
      <input type="hidden" name="dossierId" value={dossierId} />
      <input type="hidden" name="runId" value={runId} />

      {/* Herkomst-banner: waar komt dit vandaan + hoe zeker. */}
      <div
        className={
          uncertain
            ? "mb-5 rounded-lg bg-status-amber-tint px-4 py-3 text-sm text-status-amber-ink"
            : "mb-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground"
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">Import proposal</span>
          <span aria-hidden>·</span>
          <span>{SOURCE_LABEL[source] ?? source}</span>
          {filename && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{filename}</span>
            </>
          )}
          {confidence && (
            <>
              <span aria-hidden>·</span>
              <span>confidence: {confidence}</span>
            </>
          )}
        </div>
        {uncertain ? (
          <p className="mt-1 font-medium">
            Automatically recognized — check every line. Uncertain lines are off by
            default.
          </p>
        ) : (
          <p className="mt-1">
            Nothing is saved. Check what you want to add and confirm.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        // Was een kale grijze regel (reviewzwerm 2.5a C1). "framed": dit blok staat
        // los in het formulier op het kale canvas, er is geen <Card> die al een
        // kader tekent.
        //
        // Bewuste `action={null}`: de enige zinnige uitweg is "Cancel import", en die
        // knop staat in de voettekst van ditzelfde formulier, een stukje lager. Een
        // tweede annuleerknop hier zou naar zichzelf wijzen (zelfde afweging als in
        // components/catalog-search.tsx).
        <EmptyState
          title="No lines recognized in this source."
          action={null}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Check</span>
              </TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Specs</TableHead>
              {hasPages && <TableHead className="text-right">Page</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const specs = specSummary(row);
              return (
                <TableRow key={`${row.fixtureCode}-${i}`} data-checked={row.checked}>
                  <TableCell>
                    {/* OCR/LLM: defaultChecked = row.checked (standaard uit). */}
                    <input
                      type="checkbox"
                      name={`row-${i}`}
                      defaultChecked={row.checked}
                      aria-label={`Add line ${row.fixtureCode}`}
                      className="size-4 accent-foreground align-middle"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.fixtureCode}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.zone ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.quantity ?? (
                      <span className="text-muted-foreground">ea.</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    {row.brandText || row.productText ? (
                      <span>
                        <span className="text-muted-foreground">
                          {row.brandText}
                        </span>{" "}
                        {row.productText}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {specs || "—"}
                  </TableCell>
                  {hasPages && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.page ?? "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Voettekst: annuleren gooit alles weg, bevestigen maakt spec-regels. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} line{rows.length === 1 ? "" : "s"} recognized ·{" "}
          {checkedCount} checked by default. Nothing is saved until you confirm.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            formAction={cancelAction}
            formNoValidate
          >
            Cancel import
          </Button>
          <Button type="submit" size="sm" disabled={rows.length === 0}>
            <IconCheck /> Add {checkedCount} checked line
            {checkedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </form>
  );
}
