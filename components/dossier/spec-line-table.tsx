import { Fragment } from "react";
import { IconSearch, IconTrash } from "./icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { STATUS } from "./status";
import type { SpecLineRow } from "./types";

// De contextuele actie per status (functioneel ontwerp 3.4-2):
//   🟢/🔴/🟣 → Open (regel-detail) · 🟡/review → Review · 🔵 → Inladen (wachtrij).
function actionFor(status: SpecLineRow["status"]): { label: string; kind: "open" | "review" | "inladen" } {
  if (status === "geel") return { label: "Review", kind: "review" };
  if (status === "blauw") return { label: "Inladen", kind: "inladen" };
  return { label: "Open", kind: "open" };
}

export function SpecLineTable({
  dossierId,
  lines,
  deleteAction,
}: {
  dossierId: string;
  lines: SpecLineRow[];
  deleteAction?: (formData: FormData) => void | Promise<void>;
}) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen spec-regels. Voeg ze hieronder toe of plak een CSV-blok.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Zone</TableHead>
          <TableHead>Aantal</TableHead>
          <TableHead>Gevraagd</TableHead>
          <TableHead>Match</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => {
          const act = actionFor(l.status);
          // transparantieregel (C-07): benoem afwijkingen als subregel, óók binnen groen.
          const notable = (l.deviations ?? []).filter(
            (d) => d.verdict !== "onbekend" && d.note && d.note !== "exact",
          );
          // B3: door het systeem geaccepteerde bijna-match → subtiel label bij de notitie.
          const autoAccepted = l.chosenBy === "system:auto";
          // Stap 7 (herontwerp 2026-07-14): een mens koos de match (review-keuze,
          // kandidaat of handmatige link) → merkteken "handmatig gekozen".
          const manuallyChosen = l.chosenBy != null && l.chosenBy !== "system:auto";
          return (
            <Fragment key={l.id}>
              <TableRow>
                <TableCell className="font-medium">{l.fixtureCode}</TableCell>
                <TableCell className="text-muted-foreground">
                  {l.zone ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {l.quantity ?? <span className="text-muted-foreground">p/st</span>}
                </TableCell>
                <TableCell className="max-w-56 whitespace-normal">
                  <span className="text-muted-foreground">{l.brandText}</span>{" "}
                  {l.productText}
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal">
                  {l.matchedName ? (
                    <span>
                      <span className="text-muted-foreground">
                        {l.matchedBrand}
                      </span>{" "}
                      {l.matchedName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={l.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/projects/${dossierId}/line/${l.id}`}>
                        <IconSearch /> {act.label}
                      </a>
                    </Button>
                    {deleteAction && (
                      <form action={deleteAction}>
                        <input type="hidden" name="dossierId" value={dossierId} />
                        <input type="hidden" name="specLineId" value={l.id} />
                        <Button
                          type="submit"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Regel verwijderen"
                        >
                          <IconTrash />
                        </Button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {(notable.length > 0 || autoAccepted || manuallyChosen) && (
                <TableRow className="border-0">
                  <TableCell />
                  <TableCell colSpan={6} className="pt-0 text-xs text-muted-foreground">
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
                    {autoAccepted && (
                      <span className="italic">
                        {notable.length > 0 && " — "}
                        automatisch geaccepteerde bijna-match
                      </span>
                    )}
                    {manuallyChosen && (
                      <span className="italic">
                        {notable.length > 0 && " — "}
                        handmatig gekozen
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// Ongebruikt hier maar handig voor consumers die de betekenis willen tonen.
export { STATUS as STATUS_META };
