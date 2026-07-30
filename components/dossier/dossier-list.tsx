import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PhaseBadge } from "./phase-badge";
import { ProjectStatusBadge } from "./project-status-badge";
import { StatusTally } from "./status-badge";
import { STATUS, STATUS_ORDER } from "./status";
import type { DossierSummary } from "./types";

// De projectkaart draagt sinds de UX-audit (30 jul) ook een datum. `updatedAt` staat
// bewust hier en niet in DossierSummary: dat type wordt door een stuk of tien andere
// schermen gedeeld en heeft er geen van nodig.
export type DossierListItem = DossierSummary & {
  /** project_dossiers.updated_at — zie de toelichting bij "Last edited" hieronder. */
  updatedAt?: string | number | Date | null;
};

export function DossierList({
  dossiers,
  emptyMessage = "No projects yet. Use “New project” to create one.",
}: {
  dossiers: DossierListItem[];
  /** Zoekactie zonder resultaat vraagt om een ander verhaal dan een lege database. */
  emptyMessage?: ReactNode;
}) {
  if (dossiers.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {dossiers.map((d) => (
        <li key={d.id}>
          <a
            href={`/projects/${d.id}`}
            // De kaart is het belangrijkste klikdoel van de app; de focus-stand mag
            // daar niet de kale browser-outline zijn. Outline mét offset staat ÓM de
            // kaart heen en is daarmee te onderscheiden van de hover-ring die er
            // strak omheen ligt.
            className="block rounded-xl outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {/* ── Hover, nagemeten (UX-audit 30 jul) ──────────────────────────────
                Was `hover:bg-muted/50`: --muted #F5F7FA op 50% over de witte kaart =
                #FAFBFD, contrast 1,038:1 met de ruststand — onzichtbaar, en de audit
                zag het op voor/na-screenshots inderdaad niet.

                Nu twee dragers tegelijk:
                1. het vlak gaat naar --accent (#F0F2F5 light / #2A3145 dark). Dat is
                   niet `bg-muted` maar de token die in globals.css letterlijk als
                   "hover-vlak" staat aangemerkt, en in light méér verschil geeft:
                   1,122:1 tegen de 1,074:1 van vol --muted. In dark zijn --accent en
                   --muted dezelfde waarde, dus daar verandert de keuze niets.
                2. de ring van de kaart springt van foreground/10 (#E8E8E8 op wit) naar
                   --ring (#2D5A8C light / #1BA89A dark) — 5,87:1 op wit. Het vlak
                   alleen blijft subtiel; de rand is wat je op afstand ziet.
                Transitie op background-color én box-shadow (de ring ís een box-shadow;
                `transition-colors` laat hem springen). 150ms, DESIGN.md §8. */}
            <Card className="py-3 transition-[background-color,box-shadow] hover:bg-accent hover:ring-ring">
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  {d.customer && (
                    <p className="truncate text-sm text-muted-foreground">
                      {d.customer}
                    </p>
                  )}
                  {/* Kleuren-telling per dossier (E-03) — alleen als de counts zijn meegestuurd. */}
                  {d.counts && <StatusTally counts={d.counts} className="mt-1.5" />}
                  {/* "Last edited" maakt de bestaande sortering (updated_at DESC in
                      listDossiersFiltered) voor het eerst leesbaar — de lijst stónd al
                      op recentheid, je kon het alleen niet zien. */}
                  {d.updatedAt != null && (
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      Last edited {formatDate(d.updatedAt)}
                    </p>
                  )}
                </div>
                {/* Status (commercieel) + afgeleide veiligheidsstand (fase, regel 4). */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ProjectStatusBadge status={d.status} />
                  <PhaseBadge phase={d.phase} />
                </div>
              </CardContent>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ── Legenda bij de gekleurde bolletjes (UX-audit 30 jul) ───────────────────────────
// De betekenis zat alleen in `title`-attributen op de telling: hover-only, en op touch
// dus helemaal onbereikbaar. Hier staat hij één keer boven de lijst, niet per kaart.
//
// Dichtgeklapt is het één regel — de zes bolletjes met hun naam. Uitgeklapt komen de
// betekenissen erbij. Een `<details>` en geen tooltip: tikbaar, focusbaar, geen JS.
//
// De namen komen uit STATUS[...].label en dat is bewust: de matcher-statussen HETEN de
// kleuren ("Blue", "Red", "Purple") omdat het woord op zwart-witprint mee moet
// (DESIGN.md O13). De legenda legt dus uit wat een kleur betékent; hij hernoemt niets.
export function StatusLegend({ className }: { className?: string }) {
  return (
    <details
      className={cn(
        "rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs",
        className,
      )}
    >
      <summary className="cursor-pointer marker:text-muted-foreground">
        <span className="font-medium">Dot colours</span>
        {STATUS_ORDER.map((s) => (
          <span
            key={s}
            className="ml-3 inline-flex items-center gap-1 text-muted-foreground"
          >
            <span
              className={cn("size-2 rounded-full", STATUS[s].dot)}
              aria-hidden
            />
            {STATUS[s].label}
          </span>
        ))}
      </summary>
      <dl className="mt-2 grid gap-1.5 border-t border-border pt-2 sm:grid-cols-2">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex gap-2">
            <dt className="flex shrink-0 items-center gap-1 font-medium">
              <span
                className={cn("size-2 rounded-full", STATUS[s].dot)}
                aria-hidden
              />
              {STATUS[s].label}
            </dt>
            <dd className="text-muted-foreground">{STATUS[s].meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
