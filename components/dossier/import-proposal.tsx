// Import-voorstelscherm (functioneel ontwerp §3.5, B-06/B-07). Een geparste import (PDF/
// OCR/LLM/CSV) staat hier vóór opslaan: herkomst + betrouwbaarheid bovenaan, elke rij
// aanvinkbaar. OCR/LLM staat standaard UIT — de mens vinkt aan wat klopt. Niets is
// opgeslagen tot bevestigen; annuleren gooit alles weg. Geen alarmkleuren: een import is
// geen fout, alleen iets dat controle vraagt.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IconCheck } from "./icons";
import type { ImportRow } from "@/db/schema";

// Herkomst-etiket per bron (rustige tekst, geen jargon).
const SOURCE_LABEL: Record<string, string> = {
  pdf: "PDF (tekstlaag)",
  ocr: "OCR (gescand)",
  llm: "AI-extractie",
  csv: "CSV-plak",
  bestek: "Bestek",
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
            ? "mb-5 rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : "mb-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground"
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">Importvoorstel</span>
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
              <span>betrouwbaarheid: {confidence}</span>
            </>
          )}
        </div>
        {uncertain ? (
          <p className="mt-1 font-medium">
            Automatisch herkend — controleer elke regel. Onzekere regels staan
            standaard uit.
          </p>
        ) : (
          <p className="mt-1">
            Niets is opgeslagen. Vink aan wat je wilt toevoegen en bevestig.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Geen regels herkend in deze bron.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Aanvinken</span>
              </TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Aantal</TableHead>
              <TableHead>Gevraagd</TableHead>
              <TableHead>Specs</TableHead>
              {hasPages && <TableHead className="text-right">Pagina</TableHead>}
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
                      aria-label={`Regel ${row.fixtureCode} toevoegen`}
                      className="size-4 accent-foreground align-middle"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.fixtureCode}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.zone ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.quantity ?? (
                      <span className="text-muted-foreground">p/st</span>
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
          {rows.length} regel{rows.length === 1 ? "" : "s"} herkend · standaard{" "}
          {checkedCount} aangevinkt. Niets wordt opgeslagen tot je bevestigt.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            formAction={cancelAction}
            formNoValidate
          >
            Annuleer import
          </Button>
          <Button type="submit" size="sm" disabled={rows.length === 0}>
            <IconCheck /> {checkedCount} aangevinkte regel
            {checkedCount === 1 ? "" : "s"} toevoegen
          </Button>
        </div>
      </div>
    </form>
  );
}
