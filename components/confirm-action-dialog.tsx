"use client";

// Bevestiging vóór een onomkeerbare server-action (UX-audit 30 jul, bug #5).
//
// Twee plekken deden een harde delete op één klik, met een 16px prullenbak als enige
// affordance: de spec-regeltabel (~40px naast de Open/Load-knop die men de hele dag
// aanklikt) en de login-allowlist. Er is geen undo en geen prullenbak in de database.
//
// Dit is bewust géén nieuw dialoogmechanisme: het is exact de vorm van
// components/dossier/xis-push-dialog.tsx — Radix-dialog uit components/ui/dialog.tsx,
// met een <form action={serverAction}> in de footer. Geen callAction() hier: dat is
// voor een geawait server-action vanuit client-code; een form-submit is Next' eigen
// pad en heeft die classificatie niet nodig.
//
// De vraag noemt het doel bij naam ("Remove line Lr001?"). Een bevestiging die alleen
// "Are you sure?" zegt, leert niets en wordt weggeklikt.
import type { ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  action,
  fields,
}: {
  /** De knop die de dialoog opent; krijgt via asChild de trigger-props. */
  trigger: ReactNode;
  /** Noem het doel bij naam, met vraagteken: "Remove line Lr001?" */
  title: string;
  /** Wat er verdwijnt en dat het niet terugkomt. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  action: (formData: FormData) => void | Promise<void>;
  /** Verborgen velden voor de action, bijv. { dossierId, specLineId }. */
  fields: Record<string, string>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              {cancelLabel}
            </Button>
          </DialogClose>
          <form action={action}>
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button type="submit" variant="destructive" size="sm">
              {confirmLabel}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
