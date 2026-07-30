// Blauw-inlaadwachtrij (H-08): merken die als datagat (blauw) gevraagd zijn, gesorteerd op
// hoe vaak. "Markeer als ingeladen" hermatcht meteen alle blauwe/open regels van dat merk.
import { Button } from "@/components/ui/button";
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
      <p className="text-sm text-muted-foreground">
        No brands in the queue — no blue lines are open.
      </p>
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
              <TableCell className="font-medium">{r.displayName}</TableCell>
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
                  <div className="flex items-center justify-end gap-2">
                    <form action={markLoadedAction}>
                      <input type="hidden" name="queueId" value={r.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Mark as loaded
                      </Button>
                    </form>
                    {dismissAction && (
                      <form action={dismissAction}>
                        <input type="hidden" name="queueId" value={r.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          title={`Remove ${r.displayName} from the load queue — it is not a brand`}
                        >
                          Not a brand
                        </Button>
                      </form>
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
