"use client";
// Dossier-lifecycle-bediening (A-05, statemachine §4.8). Naast de fase (tender/gegund)
// leeft de lifecycle van het dossier: actief → opgeleverd (armaturenboek overgedragen,
// read-only) of gearchiveerd (verloren/vervallen, read-only). Archiveren vraagt eerst een
// reden — een verloren tender is data, de reden hoort erbij. Heropenen zet alles terug op
// actief. Opgeleverd/gearchiveerd tonen een rustige read-only-melding; geen alarmkleuren.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IconLock } from "./icons";
import type { Lifecycle } from "@/lib/repo/lifecycle";

// Rustige badge-taal per lifecycle (esthetiek = eerlijkheid; kalme tinten).
const LIFECYCLE_META: Record<Lifecycle, { label: string; tint: string }> = {
  actief: {
    label: "Actief",
    tint: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  delivered: {
    label: "Opgeleverd",
    tint: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  archived: {
    label: "Gearchiveerd",
    tint: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const m = LIFECYCLE_META[lifecycle];
  return (
    <Badge variant="secondary" className={m.tint}>
      {m.label}
    </Badge>
  );
}

// Een simpele overgangsknop: post lifecycle (+ dossierId) naar de gedeelde action.
function TransitionButton({
  dossierId,
  target,
  label,
  variant = "outline",
  action,
}: {
  dossierId: string;
  target: Lifecycle;
  label: string;
  variant?: "default" | "outline" | "ghost";
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="dossierId" value={dossierId} />
      <input type="hidden" name="lifecycle" value={target} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

// Archiveren met verplichte reden: de knop opent een dialoog met een redenveld. De submit
// blijft uitgeschakeld zolang de reden leeg is (en setLifecycle weigert 'm óók serverside).
function ArchiveDialog({
  dossierId,
  action,
}: {
  dossierId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valid = reason.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Archiveer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dit project archiveren?</DialogTitle>
          <DialogDescription>
            Een gearchiveerd project is read-only. De reden hoort erbij — een verloren
            tender is data. Bijvoorbeeld &ldquo;verloren tender&rdquo; of &ldquo;project
            vervallen&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="lifecycle" value="archived" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="archive-reason" className="text-sm font-medium">
              Reden (verplicht)
            </label>
            <Input
              id="archive-reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="verloren tender"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Annuleer
            </Button>
            <Button type="submit" size="sm" disabled={!valid}>
              Ja, archiveer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// De volledige lifecycle-balk: huidige staat als badge, een read-only-melding bij
// opgeleverd/gearchiveerd, en de toegestane overgangsknoppen voor de huidige staat.
export function LifecycleControls({
  dossierId,
  lifecycle,
  archivedReason,
  action,
}: {
  dossierId: string;
  lifecycle: Lifecycle;
  archivedReason?: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LifecycleBadge lifecycle={lifecycle} />

      {lifecycle === "delivered" && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconLock className="size-3.5" /> Opgeleverd — read-only
        </span>
      )}
      {lifecycle === "archived" && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconLock className="size-3.5" /> Gearchiveerd:{" "}
          {archivedReason?.trim() || "geen reden"}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {lifecycle === "actief" && (
          <>
            <TransitionButton
              dossierId={dossierId}
              target="delivered"
              label="Markeer als opgeleverd"
              action={action}
            />
            <ArchiveDialog dossierId={dossierId} action={action} />
          </>
        )}
        {lifecycle === "delivered" && (
          <>
            <ArchiveDialog dossierId={dossierId} action={action} />
            <TransitionButton
              dossierId={dossierId}
              target="actief"
              label="Heropen"
              action={action}
            />
          </>
        )}
        {lifecycle === "archived" && (
          <TransitionButton
            dossierId={dossierId}
            target="actief"
            label="Heropen"
            action={action}
          />
        )}
      </div>
    </div>
  );
}
