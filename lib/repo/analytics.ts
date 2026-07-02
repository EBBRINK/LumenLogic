// Analytics uit het event-log — het fundament onder het Fase-2-verdienmodel
// (merk-analytics): welke producten worden gezocht, gematcht en overwogen. Het platform
// is in de basis een observatiemachine; deze laag maakt die zichtbaar.
import { sql } from "drizzle-orm";
import type { AppDb } from "./db";

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

export type Analytics = {
  actionCounts: { action: string; count: number }[];
  topSearches: { query: string; count: number }[];
  topMatched: { brand: string | null; name: string; count: number }[];
  recent: {
    action: string;
    entity: string;
    actor: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }[];
  totalEvents: number;
};

export async function getAnalytics(db: AppDb): Promise<Analytics> {
  const actionCounts = rows<{ action: string; count: number }>(
    await db.execute(
      sql`SELECT action, count(*)::int AS count FROM events GROUP BY action ORDER BY count DESC`,
    ),
  );
  const topSearches = rows<{ query: string; count: number }>(
    await db.execute(sql`
      SELECT payload->>'query' AS query, count(*)::int AS count
      FROM events
      WHERE action = 'search' AND coalesce(payload->>'query','') <> ''
      GROUP BY 1 ORDER BY count DESC LIMIT 8`),
  );
  const topMatched = rows<{ brand: string | null; name: string; count: number }>(
    await db.execute(sql`
      SELECT p.brand_name AS brand, p.name AS name, count(*)::int AS count
      FROM events e
      JOIN products p ON p.id = (e.payload->>'productId')::uuid
      WHERE e.action = 'match'
        -- guard: één event met een niet-uuid payload mag de cast (en de pagina) niet breken
        AND e.payload->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 8`),
  );
  const recent = rows<Analytics["recent"][number]>(
    await db.execute(sql`
      SELECT action, entity, actor, created_at AS "createdAt", payload
      FROM events ORDER BY created_at DESC LIMIT 15`),
  );
  const totalEvents = actionCounts.reduce((s, a) => s + Number(a.count), 0);
  return { actionCounts, topSearches, topMatched, recent, totalEvents };
}
