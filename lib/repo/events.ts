// Ijzeren regel 5: elke zoekactie, match, no-match en offertegeneratie wordt gelogd.
// Het fase-2-verdienmodel (merk-analytics) hangt hieraan — achteraf toevoegen kan niet.
import { desc, sql } from "drizzle-orm";
import { events } from "@/db/schema";
import type { AppDb } from "./db";

export type EventInput = {
  entity: string; // 'spec_line' | 'product' | 'dossier' | 'quote' | 'search' | 'user'
  // Het id van de entity-rij, als tekst. Sinds migratie 0023 is events.entity_id een
  // text-kolom: Better Auth-user-ids zijn 32 alfanumerieke tekens, géén uuid — er is
  // dus geen uuid-garantie meer op deze waarde.
  entityId?: string | null;
  action: string; // 'search' | 'match' | 'no_match' | 'quote_generated' | 'dossier_created'
  actor?: string;
  payload?: Record<string, unknown>;
};

export async function logEvent(db: AppDb, e: EventInput): Promise<void> {
  await db.insert(events).values({
    entity: e.entity,
    entityId: e.entityId ?? null,
    action: e.action,
    actor: e.actor ?? "system",
    payload: e.payload ?? null,
  });
}

export async function recentEvents(db: AppDb, limit = 50) {
  return db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
}

export type EventActionCount = { action: string; count: number };

// Lean telquery voor het Event-log-scherm onder Data (sprint 2.0a). Zelfde SQL-vorm als
// `actionCounts` in lib/repo/analytics.ts:26-30 — bewust hier apart gehouden i.p.v.
// hergebruikt, want analytics.ts blijft byte-stabiel (guardrail 1, HANDOVER.md
// "Fase 2 afgerond": fundament van 2.1, niet achteraf toe te voegen).
export async function countEventsByAction(
  db: AppDb,
): Promise<{ actionCounts: EventActionCount[]; total: number }> {
  const res = await db.execute(
    sql`SELECT action, count(*)::int AS count FROM events GROUP BY action ORDER BY count DESC`,
  );
  const actionCounts = (
    Array.isArray(res) ? res : ((res as { rows?: EventActionCount[] }).rows ?? [])
  ) as EventActionCount[];
  const total = actionCounts.reduce((s, a) => s + Number(a.count), 0);
  return { actionCounts, total };
}
