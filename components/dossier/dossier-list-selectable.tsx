"use client";

// Projectenlijst mét verwijder-selectie (docs/goal-projecten-verwijderen.md).
//
// Blauwdruk: de bulkselectie van components/data/brand-relations-table.tsx —
// ReadonlySet voor de selectie, een balk "N selected" die pas verschijnt bij ≥1,
// ConfirmActionDialog met komma-gescheiden ids en `onDone` om de selectie te wissen.
//
// De checkbox staat bewust NAAST de kaart, niet erin: de hele kaart is één <a>, en een
// checkbox binnen die anchor nest interactieve elementen — dan wint de navigatie de klik.
// Alleen verwijderbare projecten (intern, of org-admin van de eigen org) krijgen er een;
// voor de rest is de kolom leeg maar even breed, zodat de kaarten uitgelijnd blijven.
// Heeft níets op het scherm een checkbox, dan rendert dit exact de oude lijst.
import { useCallback, useMemo, useState } from "react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DossierCard, type DossierListItem } from "./dossier-list";

export type SelectableDossierItem = DossierListItem & {
  /** Mag de kijker dít project verwijderen? (lib/repo/dossier-delete.ts, magVerwijderen) */
  canDelete: boolean;
  /** Aantal spec-regels, voor de bevestigingsdialoog ("21 lines"). */
  lineCount: number;
};

export function SelectableDossierList({
  dossiers,
  emptyMessage,
  deleteAction,
}: {
  dossiers: SelectableDossierItem[];
  emptyMessage: string;
  deleteAction: (formData: FormData) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const verwijderbaar = useMemo(
    () => dossiers.filter((d) => d.canDelete),
    [dossiers],
  );
  // De selectie hoort bij wat je ziet: een nieuw filter of een nieuwe zoekterm levert
  // nieuwe props en dus een selectie die alleen nog uit zichtbare projecten bestaat.
  const geselecteerd = useMemo(
    () => verwijderbaar.filter((d) => selected.has(d.id)),
    [verwijderbaar, selected],
  );
  const wisSelectie = useCallback(() => setSelected(new Set()), []);

  function toggle(id: string, aan: boolean) {
    setSelected((vorige) => {
      const next = new Set(vorige);
      if (aan) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (dossiers.length === 0) {
    return <EmptyState title={emptyMessage} action={null} />;
  }

  const totaalRegels = geselecteerd.reduce((n, d) => n + d.lineCount, 0);
  const namen = geselecteerd.map((d) => `“${d.name}”`).join(", ");

  return (
    <div>
      {geselecteerd.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="font-medium">
            {geselecteerd.length} selected
          </span>
          <ConfirmActionDialog
            trigger={
              <Button type="button" variant="destructive" size="sm">
                Delete selected
              </Button>
            }
            title={
              geselecteerd.length === 1
                ? `Delete project ${namen}?`
                : `Delete ${geselecteerd.length} projects?`
            }
            description={
              <>
                {namen} — {totaalRegels}{" "}
                {totaalRegels === 1 ? "spec line" : "spec lines"} in total.
                Everything under {geselecteerd.length === 1 ? "it" : "them"}{" "}
                (spec lines, match candidates, estimates, imports) is deleted
                permanently. Just want {geselecteerd.length === 1 ? "it" : "them"}{" "}
                out of the list? Use Archive on the project page instead — that
                is reversible.
              </>
            }
            confirmLabel="Delete permanently"
            action={deleteAction}
            fields={{ dossierIds: geselecteerd.map((d) => d.id).join(",") }}
            onDone={wisSelectie}
          />
          <Button type="button" variant="ghost" size="sm" onClick={wisSelectie}>
            Clear selection
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {dossiers.map((d) => (
          <li key={d.id} className="flex items-center gap-3">
            {verwijderbaar.length > 0 && (
              <span className="flex w-4 shrink-0 justify-center">
                {d.canDelete && (
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={(e) => toggle(d.id, e.target.checked)}
                    aria-label={`Select ${d.name} for deletion`}
                  />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <DossierCard d={d} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
