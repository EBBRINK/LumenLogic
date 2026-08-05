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
//
// ── Twee optionele uitbreidingen (30 jul, merkrelaties-bulkactie) ────────────
// De drie bestaande aanroepers laten de rij die ze bevestigen VERDWIJNEN; de trigger gaat
// mee, Radix unmount de dialoog en die sluit dus vanzelf. Een bulk-statuswijziging laat de
// knop staan, en dan blijft de dialoog open over een pagina die al bijgewerkt is.
//   • `onDone` — aanwezig? dan is de dialoog controlled en sluit hij zodra de submit klaar
//     is. Gemeten via `useFormStatus` binnen het formulier (React' eigen signaal), NIET
//     door de submitknop in een `DialogClose` te wikkelen: dat unmount het formulier
//     tijdens de click-afhandeling en dan gaat de submit zélf niet meer af.
//   • `confirmVariant` — een bulk-status zetten is niet destructief; rood zou het gevolg
//     verkeerd voorstellen. Default blijft `destructive`, de bestaande drie veranderen niet.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
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

// Sluit de dialoog zodra de submit-transitie klaar is (pending → idle). Moet een KIND van
// het formulier zijn; useFormStatus leest de status van het dichtstbijzijnde <form> erboven.
function CloseWhenSubmitted({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      onDone();
    }
  }, [pending, onDone]);
  return null;
}

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "destructive",
  action,
  fields,
  onDone,
}: {
  /** De knop die de dialoog opent; krijgt via asChild de trigger-props. */
  trigger: ReactNode;
  /** Noem het doel bij naam, met vraagteken: "Remove line Lr001?" */
  title: string;
  /** Wat er verdwijnt en dat het niet terugkomt. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `destructive` (default) voor onomkeerbaar verlies; `default` voor een zware maar
   *  gewone wijziging, zoals een bulk-status. */
  confirmVariant?: "destructive" | "default";
  action: (formData: FormData) => void | Promise<void>;
  /** Verborgen velden voor de action, bijv. { dossierId, specLineId }. */
  fields: Record<string, string>;
  /** Aanwezig? Dan sluit de dialoog zichzelf na een geslaagde submit en roept dit aan
   *  (bijv. om de selectie leeg te maken). Weglaten = het bestaande gedrag. */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sluit = useCallback(() => {
    setOpen(false);
    onDone?.();
  }, [onDone]);
  const controlled = onDone !== undefined;

  return (
    <Dialog
      open={controlled ? open : undefined}
      onOpenChange={controlled ? setOpen : undefined}
    >
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
            {controlled && <CloseWhenSubmitted onDone={sluit} />}
            <Button type="submit" variant={confirmVariant} size="sm">
              {confirmLabel}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
