// Event-inzage (ijzeren regel 5): logEvent/recentEvents zijn het schrijf/leespad dat overal
// wordt hergebruikt (admin, event-log-scherm, analytics). countEventsByAction is nieuw in
// sprint 2.0a — het Event-log-scherm onder Data (app/data/event-log/page.tsx) heeft een
// eigen, lichte telquery nodig i.p.v. de volle `getAnalytics` (lib/repo/analytics.ts).
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { events as eventsTable } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { countEventsByAction, logEvent, recentEvents } from "./events";

test("recentEvents geeft de nieuwste rijen terug, meest recent eerst", async () => {
  const db = await createTestDb();
  await logEvent(db, { entity: "search", action: "search", actor: "timo" });
  await logEvent(db, { entity: "product", action: "match", actor: "timo" });

  // ⚠️ Twee tijdstippen die aantoonbaar verschillen, en niet twee aanroepen die hopen dat
  // de klok verschil maakt. `logEvent` laat `created_at` aan `defaultNow()`, en op PGlite
  // volgen deze twee inserts elkaar zo snel op dat ze dezelfde waarde krijgen. Bij een
  // gelijke `created_at` is de uitkomst van `order by created_at desc` in Postgres
  // ongedefinieerd — `events.id` is een random uuid (`db/schema.ts:724`), dus ook een
  // tie-break daarop zou stabiel maar niet chronologisch zijn.
  //
  // Deze test faalde daardoor ongeveer één op de drie keer, óók op een kale `origin/main`
  // (nagemeten 4 aug: 2 van 6 runs rood). Dat was geen regressie en geen bug in de app —
  // het was deze test die op een race gokte. In productie is het verschijnsel zeldzaam:
  // van 3374 events daar is er precies één paar met dezelfde `created_at`. Zou je gelijke
  // tijdstippen ook echt in insert-volgorde willen zien, dan is daar een monotone kolom
  // (bigserial) voor nodig; dat is een migratie en staat als aantekening in het sprintplan.
  const t0 = new Date("2026-08-05T10:00:00.000Z");
  const t1 = new Date("2026-08-05T10:00:01.000Z");
  await db
    .update(eventsTable)
    .set({ createdAt: t0 })
    .where(eq(eventsTable.action, "search"));
  await db
    .update(eventsTable)
    .set({ createdAt: t1 })
    .where(eq(eventsTable.action, "match"));

  const events = await recentEvents(db, 10);
  expect(events).toHaveLength(2);
  expect(events[0].action).toBe("match");
  expect(events[1].action).toBe("search");
  // En de sortering is écht op tijd gebeurd, niet toevallig op insert-volgorde: zonder deze
  // assertie zou een `recentEvents` die de `order by` kwijtraakt hierboven groen blijven.
  expect(events[0].createdAt.getTime()).toBeGreaterThan(
    events[1].createdAt.getTime(),
  );
});

test("countEventsByAction telt per actie + een kloppend totaal", async () => {
  const db = await createTestDb();
  await logEvent(db, { entity: "search", action: "search", actor: "timo" });
  await logEvent(db, { entity: "search", action: "search", actor: "timo" });
  await logEvent(db, { entity: "product", action: "match", actor: "timo" });

  const { actionCounts, total } = await countEventsByAction(db);
  expect(total).toBe(3);
  const search = actionCounts.find((a) => a.action === "search");
  const match = actionCounts.find((a) => a.action === "match");
  expect(search?.count).toBe(2);
  expect(match?.count).toBe(1);
});

test("countEventsByAction op een leeg log: nul rijen, nul totaal", async () => {
  const db = await createTestDb();
  const { actionCounts, total } = await countEventsByAction(db);
  expect(actionCounts).toEqual([]);
  expect(total).toBe(0);
});
