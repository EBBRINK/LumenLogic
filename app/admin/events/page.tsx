import { db } from "@/db/client";
import { EventsBlock, type EventRow } from "@/components/admin/events-block";
import { recentAdminEvents } from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";

// EVENT-INZAGE (§3.16, ijzeren regel 5). Alleen-lezen. Eigen <main>.
export default async function AdminEventsPage() {
  await requireSession();

  const events = await recentAdminEvents(db, 50);
  const rows: EventRow[] = events.map((e) => ({
    id: e.id,
    entity: e.entity,
    action: e.action,
    actor: e.actor,
    createdAt:
      e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          The event log: every action recorded.
        </p>
      </header>
      <EventsBlock events={rows} />
    </main>
  );
}
