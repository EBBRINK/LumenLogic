import { Fragment } from "react";
import { IconSearch, IconTrash } from "./icons";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
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
  if (status === "blauw") return { label: "Load", kind: "inladen" };
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
        No spec lines yet. Add them below or paste a CSV block.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Zone</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Match</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
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
                  {l.quantity ?? <span className="text-muted-foreground">ea.</span>}
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
                      // UX-audit bug #5: dit was een kale form-submit, 40px naast de
                      // Open/Load-knop. Eén misklik wiste de regel definitief
                      // (harde delete, lib/repo/dossiers.ts) zonder undo.
                      <ConfirmActionDialog
                        trigger={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove line ${l.fixtureCode}`}
                          >
                            <IconTrash />
                          </Button>
                        }
                        title={`Remove line ${l.fixtureCode}?`}
                        description="The line disappears from this project, together with its match, its deviations and any day price. This cannot be undone."
                        confirmLabel="Remove line"
                        action={deleteAction}
                        fields={{ dossierId, specLineId: l.id }}
                      />
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
                    {autoAccepted && (
                      <span className="italic">
                        {notable.length > 0 && " — "}
                        automatically accepted near-match
                      </span>
                    )}
                    {manuallyChosen && (
                      <span className="italic">
                        {notable.length > 0 && " — "}
                        manually chosen
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
