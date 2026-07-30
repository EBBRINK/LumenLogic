// Event-inzage (ijzeren regel 5): logEvent/recentEvents zijn het schrijf/leespad dat overal
// wordt hergebruikt (admin, event-log-scherm, analytics). countEventsByAction is nieuw in
// sprint 2.0a — het Event-log-scherm onder Data (app/data/event-log/page.tsx) heeft een
// eigen, lichte telquery nodig i.p.v. de volle `getAnalytics` (lib/repo/analytics.ts).
import { expect, test } from "vitest";
import { createTestDb } from "@/db/test-db";
import { countEventsByAction, logEvent, recentEvents } from "./events";

test("recentEvents geeft de nieuwste rijen terug, meest recent eerst", async () => {
  const db = await createTestDb();
  await logEvent(db, { entity: "search", action: "search", actor: "timo" });
  await logEvent(db, { entity: "product", action: "match", actor: "timo" });

  const events = await recentEvents(db, 10);
  expect(events).toHaveLength(2);
  expect(events[0].action).toBe("match");
  expect(events[1].action).toBe("search");
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
