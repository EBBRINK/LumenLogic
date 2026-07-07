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
}: {
  rows: QueueRow[];
  markLoadedAction: FormAction;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Geen merken op de wachtrij — er staan geen blauwe regels open.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Merk</TableHead>
          <TableHead className="text-right">Gevraagd</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actie</TableHead>
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
                      wachtend ? STATUS.blauw.dot : "bg-emerald-500",
                    )}
                  />
                  {wachtend ? "Wachtend" : "Ingeladen"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {wachtend ? (
                  <form action={markLoadedAction}>
                    <input type="hidden" name="queueId" value={r.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Markeer als ingeladen
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    afgehandeld
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
