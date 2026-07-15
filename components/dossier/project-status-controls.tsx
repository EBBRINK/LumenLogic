"use client";
// Status- en XIS-fase-bediening in de projectkop (B6, stap 4). Vervangt de phase-toggle
// én de lifecycle-knoppen: er is geen aparte fase-schakelaar meer — `phase` wordt server-
// side afgeleid (lib/repo/project-status.ts, de ene schrijver) en staat als badge in de kop.
//
// • Status-dropdown: concept → estimate gestuurd → offerte → gegund / niet gegund → archief.
//   Archief opent eerst een dialoog met een VERPLICHTE reden (een verloren tender is data);
//   de server weigert een lege reden óók (vangnet).
// • XIS-fase-select: de tien fasen uit XIS, in de taal van Brink. Uitgeschakeld bij
//   archief (read-only) — heropenen kan alleen via de status.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IconLock } from "./icons";
import {
  PROJECT_STATUS_META,
  PROJECT_STATUS_ORDER,
  XIS_PHASE_LABELS,
  XIS_PHASE_ORDER,
} from "./project-status-badge";
import type { ProjectStatus, XisPhase } from "./types";

type FormAction = (formData: FormData) => void | Promise<void>;

export function ProjectStatusControls({
  dossierId,
  status,
  xisPhase,
  archivedReason,
  statusAction,
  xisPhaseAction,
}: {
  dossierId: string;
  status: ProjectStatus;
  xisPhase: XisPhase;
  archivedReason?: string | null;
  statusAction: FormAction;
  xisPhaseAction: FormAction;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [, startTransition] = useTransition();
  const readOnly = status === "archief";

  const submitStatus = (next: ProjectStatus, withReason?: string) => {
    const fd = new FormData();
    fd.set("dossierId", dossierId);
    fd.set("status", next);
    if (withReason) fd.set("reason", withReason);
    startTransition(() => statusAction(fd));
  };

  const submitXisPhase = (next: XisPhase) => {
    const fd = new FormData();
    fd.set("dossierId", dossierId);
    fd.set("xisPhase", next);
    startTransition(() => xisPhaseAction(fd));
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label
          htmlFor={`status-${dossierId}`}
          className="text-sm text-muted-foreground"
        >
          Status
        </label>
        <select
          id={`status-${dossierId}`}
          value={status}
          onChange={(e) => {
            const next = e.target.value as ProjectStatus;
            if (next === status) return;
            if (next === "archief") {
              setReason("");
              setArchiveOpen(true); // eerst de reden — dan pas archiveren
              return;
            }
            submitStatus(next);
          }}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          {PROJECT_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_META[s].label}
            </option>
          ))}
        </select>

        <label
          htmlFor={`xis-phase-${dossierId}`}
          className="text-sm text-muted-foreground"
        >
          XIS phase
        </label>
        <select
          id={`xis-phase-${dossierId}`}
          value={xisPhase}
          disabled={readOnly}
          onChange={(e) => {
            const next = e.target.value as XisPhase;
            if (next !== xisPhase) submitXisPhase(next);
          }}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {XIS_PHASE_ORDER.map((p) => (
            <option key={p} value={p}>
              {XIS_PHASE_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {readOnly && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconLock className="size-3.5" /> Archived:{" "}
          {archivedReason?.trim() || "no reason"}
        </span>
      )}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this project?</DialogTitle>
            <DialogDescription>
              An archived project is read-only. The reason is required — a lost
              tender is data. For example &ldquo;lost tender&rdquo; or
              &ldquo;project cancelled&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              submitStatus("archief", reason.trim());
              setArchiveOpen(false);
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="archive-reason" className="text-sm font-medium">
                Reason (required)
              </label>
              <Input
                id="archive-reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="lost tender"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setArchiveOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!reason.trim()}>
                Yes, archive
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
