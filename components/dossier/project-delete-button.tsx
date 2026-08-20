"use client";

// Verwijderknop in de dossier-header (docs/goal-projecten-verwijderen.md). Alleen
// gerenderd als de kijker mág verwijderen (layout beslist via magVerwijderen) — bij
// géén recht is de knop afwezig, niet uitgegrijsd (precedent: brand-delete-block.tsx).
//
// De dialoog noemt naam en inhoud ("d — 21 lines, 1 estimate") en wijst op Archiveren
// als het omkeerbare pad: verwijderen is hier écht weg, er is geen prullenbak.
import { Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import type { DossierDeleteImpact } from "@/lib/repo/dossier-delete";

function onderdeel(n: number, enkel: string, meer: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? enkel : meer}`;
}

export function ProjectDeleteButton({
  dossierId,
  name,
  impact,
  action,
}: {
  dossierId: string;
  name: string;
  impact: DossierDeleteImpact;
  action: (formData: FormData) => Promise<void> | void;
}) {
  const inhoud =
    [
      onderdeel(impact.specLines, "spec line", "spec lines"),
      onderdeel(impact.quotes, "estimate", "estimates"),
      onderdeel(impact.importRuns, "import", "imports"),
    ]
      .filter(Boolean)
      .join(", ") || "no lines yet";

  return (
    <ConfirmActionDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" className="text-destructive">
          <Trash2 className="size-3.5" /> Delete
        </Button>
      }
      title={`Delete project “${name}”?`}
      description={
        <>
          “{name}” — {inhoud}. Everything under it (spec lines, match
          candidates, estimates, imports) is deleted permanently; there is no
          undo.{" "}
          {impact.leads > 0 &&
            `${impact.leads} linked ${impact.leads === 1 ? "lead keeps" : "leads keep"} existing but ${impact.leads === 1 ? "loses" : "lose"} the project link. `}
          Just want it out of the list? Use Archive instead — that is
          reversible.
        </>
      }
      confirmLabel="Delete permanently"
      action={action}
      // Bewust twee velden met dezelfde uuid: `dossierId` voedt bewaakProject() (de
      // poort leest dat ene veld), `dossierIds` is de vorm die deleteSchema parst.
      fields={{ dossierId, dossierIds: dossierId }}
    />
  );
}
