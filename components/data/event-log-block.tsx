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
import { eventLabel } from "@/lib/event-labels";
import { formatDateTime } from "@/lib/format";
import { fieldLabel } from "@/lib/matching/tolerances";

export type EventRow = {
  id: string;
  entity: string;
  action: string;
  actor: string;
  createdAt: string; // ISO
  payload?: Record<string, unknown> | null;
};

// UX-audit 30 jul (bug #9): hier stond een eigen `toLocaleString("nl-NL", …)` zónder jaar
// — "30 jul, 12:24" terwijl het log over maanden loopt. Eén datumformatter voor de hele
// app, in lib/format.ts.

// Hoeveel payload-paren er hooguit in de cel passen voordat het een blok tekst wordt.
const MAX_PAYLOAD_PAIRS = 4;

type PayloadPair = { key: string; label: string; value: string };

function showPayloadValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Genest object/array: compact serialiseren en afkappen — beter dan niets tonen.
  const text = JSON.stringify(v);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// UX-audit 30 jul (bug #8): de Details-kolom drukte ruwe JSON af (`{"brandKey":"xal",…}`),
// afgekapt met een ellips. Nu een compacte sleutel/waarde-lijst met dezelfde leesbare
// veldlabels als de rest van de app; leeg/ontbrekend payload toont niets ("—", geen
// "{}"-ruis in de tabel).
function payloadPairs(
  payload: Record<string, unknown> | null | undefined,
): PayloadPair[] {
  if (!payload) return [];
  return Object.entries(payload).map(([key, value]) => ({
    key,
    label: fieldLabel(key),
    value: showPayloadValue(value),
  }));
}

// EVENT-INZAGE (§3.16, ijzeren regel 5): elke zoekactie, match, keuze en beheerhandeling is
// gelogd. Verhuisd van components/admin/events-block.tsx naar Data (sprint 2.0a) — het log
// is ruwe data, geen beheerhandeling; zie HANDOVER.md "Event-log = ruwe data → onder Data".
// Alleen-lezen: het log is de bron, niet iets om te bewerken. De actie krijgt hier een
// leesbaar label (lib/event-labels.ts) en de payload als sleutel/waarde-lijst als die er is.
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
                const pairs = payloadPairs(e.payload);
                const shown = pairs.slice(0, MAX_PAYLOAD_PAIRS);
                const rest = pairs.length - shown.length;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.entity}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {eventLabel(e.action)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.actor}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {pairs.length === 0 ? (
                        "—"
                      ) : (
                        <dl className="flex flex-col gap-0.5">
                          {shown.map((p) => (
                            <div key={p.key} className="flex gap-1.5">
                              <dt className="shrink-0">{p.label}:</dt>
                              <dd className="min-w-0 truncate text-foreground/80">
                                {p.value}
                              </dd>
                            </div>
                          ))}
                          {rest > 0 && (
                            <div className="text-muted-foreground">
                              +{rest} more
                            </div>
                          )}
                        </dl>
                      )}
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
