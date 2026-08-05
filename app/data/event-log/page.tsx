// Event-log (§3.16, ijzeren regel 5). Sprint 2.0a: samenvoeging van de tellingen die eerder
// op /analytics stonden ("Logged events" + "By type") en de Activity-tabel die eerder op
// /admin/events stond — beide zijn vensters op dezelfde events-tabel. Alleen-lezen, eigen
// <main>. Zie HANDOVER.md "Fase 2 afgerond" (guardrail 1): analytics.ts/analytics-view.tsx
// blijven ongemoeid, deze pagina heeft een eigen lean telquery + eigen label-map.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { EventLogView } from "@/components/data/event-log-view";
import type { EventRow } from "@/components/data/event-log-block";
import { countEventsByAction, recentEvents } from "@/lib/repo/events";
import { bewaakRoute } from "@/lib/route-toegang";

export default async function EventLogPage() {
  await bewaakRoute("/data/event-log");

  const [{ actionCounts, total }, events] = await Promise.all([
    countEventsByAction(db),
    recentEvents(db, 50),
  ]);

  const rows: EventRow[] = events.map((e) => ({
    id: e.id,
    entity: e.entity,
    action: e.action,
    actor: e.actor,
    createdAt:
      e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    payload: e.payload ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Event log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every search, match and admin action is recorded here. Read-only.
        </p>
      </header>
      <EventLogView totalEvents={total} actionCounts={actionCounts} events={rows} />
    </main>
  );
}
