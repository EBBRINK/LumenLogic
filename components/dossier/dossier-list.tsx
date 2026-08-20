import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
  /** project_dossiers.updated_at — zie de toelichting bij het label hieronder. */
  updatedAt?: string | number | Date | null;
};

export function DossierList({
  dossiers,
  emptyMessage = "No projects yet. Use “New project” to create one.",
}: {
  dossiers: DossierListItem[];
  /**
   * Zoekactie zonder resultaat vraagt om een ander verhaal dan een lege database.
   * String en geen ReactNode: dit is de titel van de gedeelde lege toestand, en die
   * is bewust één zin op voorgrondkleur (components/ui/empty-state.tsx).
   */
  emptyMessage?: string;
}) {
  if (dossiers.length === 0) {
    // Was een kale grijze regel — precies het dialect dat empty-state.tsx afschaft
    // (UX-audit 30 jul, A6; reviewzwerm 2.5a C1).
    //
    // "framed": op /projects staat deze lijst op het kale canvas, er is geen <Card>
    // omheen die het kader al tekent.
    //
    // Bewuste `action={null}`: de uitweg van elk van de drie gevallen staat al op het
    // scherm — "New project" in de paginakop, en zoekterm/statusfilter in de balk er
    // vlak boven. Een knop hier zou naar bediening wijzen die twee centimeter hoger
    // staat, en de tekst van de lege toestand doet dat al in woorden.
    return <EmptyState title={emptyMessage} action={null} />;
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
            {/* `overflow-visible`: ui/card.tsx knipt standaard alles af wat buiten de
                kaart valt (rondingen op kaartbrede afbeeldingen — die heeft deze kaart
                niet). Zonder dit sneed de kaart de tooltip van de kleuren-telling en de
                statusbadge halverwege de tweede regel af. */}
            <Card className="overflow-visible py-3 transition-[background-color,box-shadow] hover:bg-accent hover:ring-ring">
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
                  {/* Deze datum maakt de bestaande sortering (updated_at DESC in
                      listDossiersFiltered) voor het eerst leesbaar — de lijst stónd al
                      op recentheid, je kon het alleen niet zien.

                      HET LABEL ZEGT PRECIES WAT DE KOLOM BIJHOUDT, en dat is bewust
                      niet "Last edited". `project_dossiers.updated_at` heeft geen
                      `$onUpdate` in het schema; hij beweegt alleen als iemand hem
                      expliciet zet, en dat doen in productie exact drie schrijvers:
                      `setStatus` en `setXisPhase` (lib/repo/project-status.ts, status
                      resp. XIS-fase + de afgeleide veiligheidsfase) en `setDossierOrg`
                      (lib/repo/orgs.ts, alleen aangeroepen bij het aanmaken). Een PDF
                      importeren, regels toevoegen of bewerken en de matcher draaien
                      schrijven naar `spec_lines.updated_at` en laten de dossierrij
                      ongemoeid — een project waar je een middag in hebt zitten
                      importeren zou onder "Last edited" dus nog de oude datum tonen.
                      Dat is dezelfde soort halve waarheid als de groene "valid"-badge
                      op een prijslijst met 0 producten (UX-audit 30 jul).
                      Naast de datum staan de twee badges die hij beschrijft: de
                      status en de fase. Het optreken van de dossier-datum bij
                      regelwijzigingen is een aparte beslissing (raakt meerdere
                      repo-functies) en staat als open punt in HANDOVER.md. */}
                  {d.updatedAt != null && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Status or phase changed {formatDate(d.updatedAt)}
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

// ── Legenda bij de gekleurde bolletjes (UX-audit 30 jul; demo Brink Licht 12 aug) ──
// De betekenis zat eerst alleen in `title`-attributen op de telling: hover-only, en op
// touch dus helemaal onbereikbaar. Sindsdien staat hij één keer bij de lijst, niet per
// kaart.
//
// Ronde 2 (demo 12 aug): het was een `<details>` bovenaan — dicht één regel met de zes
// kleurnamen, open pas de betekenissen. Twee klachten van de klant, allebei terecht:
// je moet hem eerst openklappen, en "Yellow" vertelt je niets. Dus:
//   • geen `<details>`/pijltje meer — altijd open;
//   • `sticky bottom-0` onderaan de pagina: hij blijft in beeld terwijl je door de
//     lijst scrolt, en gaat aan het eind gewoon in de flow staan. Bewust sticky en
//     niet `fixed`: fixed haalt hem uit de flow en legt hem over de laatste kaart.
//   • de kop is nu STATUS[...].name ("Match", "Awaiting brand") — de betekenis, niet
//     de kleurnaam. Het bolletje ernaast houdt de koppeling met de kleur, en de
//     kleurnaam blijft staan wáár hij moet staan: op de badge en op de print
//     (STATUS[...].label/.word, DESIGN.md O13). De legenda hernoemt dus niets.
// De beschrijvende zin (`meaning`) staat er onveranderd achter.
//
// `max-h-[45vh] overflow-y-auto`: op 375px zijn zes regels mét zin hoog, en een
// sticky balk die het halve scherm vult is erger dan geen legenda.
export function StatusLegend({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Dot colours"
      className={cn(
        "sticky bottom-0 z-10 max-h-[45vh] overflow-y-auto rounded-lg border border-border bg-card px-3 py-2.5 text-xs shadow-lg",
        className,
      )}
    >
      <p className="mb-1.5 font-medium">Dot colours</p>
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex gap-2">
            {/* Vaste kolombreedte: zonder dit begint elke zin op een andere x en
                oogt de legenda als losse regels in plaats van een lijst. w-28 past
                de langste kop ("Invalid product") op text-xs. */}
            <dt className="flex w-28 shrink-0 items-center gap-1.5 font-medium">
              <span
                className={cn("size-2 rounded-full", STATUS[s].dot)}
                aria-hidden
              />
              {STATUS[s].name}
            </dt>
            <dd className="text-muted-foreground">{STATUS[s].meaning}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
