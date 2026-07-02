// Ijzeren regel 5: elke zoekactie, match, no-match en offertegeneratie wordt gelogd.
// Het fase-2-verdienmodel (merk-analytics) hangt hieraan — achteraf toevoegen kan niet.
import { desc } from "drizzle-orm";
import { events } from "@/db/schema";
import type { AppDb } from "./db";

export type EventInput = {
  entity: string; // 'spec_line' | 'product' | 'dossier' | 'quote' | 'search'
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
