"use client";
// Faseovergang als expliciete, gelogde actie (A-04). De knop opent een bevestigings-
// dialoog die benoemt wat er verandert; pas na "Ja" verstuurt hij setPhaseAction.
import { useState } from "react";
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
import type { Phase } from "./types";

export function PhaseToggle({
  dossierId,
  phase,
  action,
}: {
  dossierId: string;
  phase: Phase;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const toAwarded = phase === "tender";
  const target: Phase = toAwarded ? "awarded" : "tender";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={toAwarded ? "default" : "outline"} size="sm">
          {toAwarded ? "Markeer als gegund" : "Terug naar tender"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {toAwarded
              ? "Dit project op gegund zetten?"
              : "Dit project terugzetten naar tender?"}
          </DialogTitle>
          <DialogDescription asChild>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {toAwarded ? (
                <>
                  <li>De engine gaat gelijkwaardige alternatieven tonen.</li>
                  <li>De estimate wordt bevroren als tender-versie.</li>
                  <li>De tab Werkvoorbereiding verschijnt.</li>
                </>
              ) : (
                <>
                  <li>Alle alternatieven-suggesties verdwijnen (default = veilig).</li>
                  <li>De tab Werkvoorbereiding verdwijnt.</li>
                </>
              )}
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Annuleer
          </Button>
          <form action={action}>
            <input type="hidden" name="dossierId" value={dossierId} />
            <input type="hidden" name="phase" value={target} />
            <Button type="submit" size="sm">
              {toAwarded ? "Ja, gegund" : "Ja, terug naar tender"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
