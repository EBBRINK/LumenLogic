import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type EventRow = {
  id: string;
  entity: string;
  action: string;
  actor: string;
  createdAt: string; // ISO
};

function formatMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// EVENT-INZAGE (§3.16, ijzeren regel 5): elke zoekactie, match, keuze en beheerhandeling is
// gelogd. De admin leest hier de recente activiteit — de basis onder de merk-analytics van
// fase 2. Alleen-lezen: het log is de bron, niet iets om te bewerken.
export function EventsBlock({ events }: { events: EventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recente activiteit</CardTitle>
        <p className="text-sm text-muted-foreground">
          Het event-log: elke handeling is vastgelegd. Alleen-lezen.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen activiteit.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wanneer</TableHead>
                <TableHead>Entiteit</TableHead>
                <TableHead>Handeling</TableHead>
                <TableHead>Door</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatMoment(e.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{e.entity}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{e.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.actor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
