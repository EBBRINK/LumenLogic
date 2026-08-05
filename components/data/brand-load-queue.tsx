// Blauw-inlaadwachtrij (H-08): merken die als datagat (blauw) gevraagd zijn, gesorteerd op
// hoe vaak. "Markeer als ingeladen" hermatcht meteen alle blauwe/open regels van dat merk.
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS } from "@/components/dossier/status";
import { cn } from "@/lib/utils";

type FormAction = (formData: FormData) => void | Promise<void>;

export type QueueRow = {
  id: string;
  displayName: string;
  frequency: number;
  status: "wachtend" | "ingeladen";
  loadedAt: string | Date | null;
};

export function BrandLoadQueue({
  rows,
  markLoadedAction,
  dismissAction,
}: {
  rows: QueueRow[];
  markLoadedAction: FormAction;
  // UX-audit 30 jul (bug #12): de parser leest zoneteksten (`Divers`, `Vergaderruimte`,
  // `Toilet`) als merknaam. Voor die rijen was "Mark as loaded" de énige actie, en die is
  // niet waar — er valt niets in te laden. "Not a brand" voert de rij af.
  dismissAction?: FormAction;
}) {
  if (rows.length === 0) {
    return (
      // Was een kale grijze regel (reviewzwerm 2.5a C1). "framed": op /data/loading
      // staat dit blok direct in <main>, zonder omhullende kaart.
      //
      // Bewuste `action={null}`: deze wachtrij vult zichzelf vanuit de matcher — een
      // merk komt hier binnen doordat een regel blauw wordt, niet doordat iemand hier
      // iets aanmaakt. Er is dus niets te starten; leeg is hier goed nieuws.
      <EmptyState
        title="No brands in the queue — no blue lines are open."
        action={null}
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Brand</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const wachtend = r.status === "wachtend";
          return (
            <TableRow key={r.id}>
              {/* whitespace-normal: TableCell zet van zichzelf `whitespace-nowrap`, dus
                  zonder dit kan de tabel bij 375px nergens smaller worden dan de som van
                  alle voluit gezette tekst — en dan schuift de Action-kolom het beeld uit
                  (reparatie 30 jul, bevinding 11). */}
              <TableCell className="whitespace-normal font-medium">
                {r.displayName}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.frequency}×
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      wachtend ? STATUS.blauw.dot : "bg-status-green-dot",
                    )}
                  />
                  {wachtend ? "Waiting" : "Loaded"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {wachtend ? (
                  // Reparatie 30 jul, bevinding 11: op 375px stond "Not a brand" volledig
                  // buiten beeld en was zelfs "Mark as lo…" afgekapt. Onder sm stapelen de
                  // twee knoppen; vanaf sm staan ze weer naast elkaar.
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <form action={markLoadedAction}>
                      <input type="hidden" name="queueId" value={r.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="h-auto w-full py-1 whitespace-normal sm:h-7 sm:w-auto sm:py-0 sm:whitespace-nowrap"
                      >
                        Mark as loaded
                      </Button>
                    </form>
                    {dismissAction && (
                      // BLOCKER, reparatie 30 jul. Dit was één klik op een `ghost`-knop —
                      // de mínst opvallende bediening van de rij — en daarachter zat een
                      // harde DELETE zonder undo, zonder archief en zonder enig scherm
                      // waar een afgevoerde rij nog te zien is. Weg is ook de `frequency`,
                      // opgeteld over álle projecten; die telling is niet te reconstrueren.
                      //
                      // Twee commits eerder is components/confirm-action-dialog.tsx
                      // gebouwd voor precies dit gevaar en aangesloten op de spec-regel en
                      // de login-allowlist — allebei mínder ingrijpend dan deze (een
                      // spec-regel is van één dossier, deze rij is app-breed). Dezelfde
                      // dialoog dus, en `destructive` in plaats van `ghost`: het gewicht
                      // van de knop hoort bij het gevolg te passen.
                      <ConfirmActionDialog
                        trigger={
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-auto w-full py-1 whitespace-normal sm:h-7 sm:w-auto sm:py-0 sm:whitespace-nowrap"
                          >
                            Not a brand
                          </Button>
                        }
                        title={`Remove ${r.displayName} from the queue?`}
                        description={`${r.displayName} was requested ${r.frequency}× across all projects. Removing it deletes the queue row and that count for good — there is no undo and no archive. The lines that requested it stay blue, and the same text can return through a new import.`}
                        confirmLabel="Not a brand"
                        action={dismissAction}
                        fields={{ queueId: r.id }}
                      />
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    handled
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
