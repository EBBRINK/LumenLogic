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
import { ACTION_LABEL } from "@/lib/event-labels";

export type EventRow = {
  id: string;
  entity: string;
  action: string;
  actor: string;
  createdAt: string; // ISO
  payload?: Record<string, unknown> | null;
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

// Korte, leesbare weergave van de payload — geen parsing, alleen een scanbare snippet.
// Leeg/ontbrekend payload toont niets (geen "{}"-ruis in de tabel).
function payloadSnippet(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || Object.keys(payload).length === 0) return null;
  const text = JSON.stringify(payload);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// EVENT-INZAGE (§3.16, ijzeren regel 5): elke zoekactie, match, keuze en beheerhandeling is
// gelogd. Verhuisd van components/admin/events-block.tsx naar Data (sprint 2.0a) — het log
// is ruwe data, geen beheerhandeling; zie HANDOVER.md "Event-log = ruwe data → onder Data".
// Alleen-lezen: het log is de bron, niet iets om te bewerken. De actie krijgt hier een
// leesbaar label (lib/event-labels.ts) en een payload-snippet als die er is.
export function EventsBlock({ events }: { events: EventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          The event log: every action is recorded. Read-only.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const snippet = payloadSnippet(e.payload);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatMoment(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.entity}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {ACTION_LABEL[e.action] ?? e.action}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.actor}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {snippet ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
