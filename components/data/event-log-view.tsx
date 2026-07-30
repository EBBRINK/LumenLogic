import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventLabel } from "@/lib/event-labels";
import type { EventActionCount } from "@/lib/repo/events";
import { EventsBlock, type EventRow } from "./event-log-block";

export type EventLogViewProps = {
  totalEvents: number;
  actionCounts: EventActionCount[];
  events: EventRow[];
};

// Event-log-view (sprint 2.0a): voegt twee eerdere vensters op dezelfde events-tabel samen
// (ijzeren regel 5) tot één scherm onder Data — de tellingen "Logged events"/"By type" die
// eerder op /analytics stonden, plus de chronologische Activity-tabel die eerder op
// /admin/events stond. Eigen telquery (`countEventsByAction`) + eigen label-map
// (lib/event-labels.ts): components/analytics-view.tsx en lib/repo/analytics.ts blijven
// byte-stabiel (guardrail 1, HANDOVER.md "Fase 2 afgerond").
export function EventLogView({
  totalEvents,
  actionCounts,
  events,
}: EventLogViewProps) {
  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Logged events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {totalEvents}
            </p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              By type
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {actionCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              actionCounts.map((a) => (
                <Badge key={a.action} variant="secondary" className="gap-1">
                  {eventLabel(a.action)}
                  <span className="tabular-nums font-semibold">{a.count}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <EventsBlock events={events} />
    </div>
  );
}
