// Sprint M1-eis 3 — de dood-melding, cron-aangeroepen.
import { beforeEach, expect, test, vi } from "vitest";
import { matchstationQueue, projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { claimNextDossier, enqueueDossierForMatching, registerHeartbeat } from "@/lib/repo/matchstation";
import { eq } from "drizzle-orm";

const harnas = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const w = echt[prop];
        return typeof w === "function" ? w.bind(echt) : w;
      },
    },
  ),
}));

const { GET } = await import("./route");

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  harnas.db = db;
  process.env.CRON_SECRET = "cron-geheim";
});

function roep(auth?: string) {
  return GET(new Request("http://local/api/matchstation/healthcheck", {
    headers: auth ? { authorization: auth } : {},
  }));
}

test("zonder Authorization-header → 401", async () => {
  const res = await roep();
  expect(res.status).toBe(401);
});

test("met verkeerd secret → 401", async () => {
  const res = await roep("Bearer verkeerd");
  expect(res.status).toBe(401);
});

test("niets aan de hand → 0 meldingen", async () => {
  const res = await roep("Bearer cron-geheim");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ alerted: 0 });
});

test("een verlopen claim genereert precies één melding en zet dead_alert_sent_at", async () => {
  const [dossier] = await db.insert(projectDossiers).values({ name: "X" }).returning();
  await enqueueDossierForMatching(db, dossier.id);
  const job = await claimNextDossier(db);
  await db
    .update(matchstationQueue)
    .set({ claimedAt: new Date(Date.now() - 20 * 60_000) })
    .where(eq(matchstationQueue.id, job!.id));

  const res = await roep("Bearer cron-geheim");
  expect(await res.json()).toEqual({ alerted: 1 });

  const [row] = await db.select().from(matchstationQueue).where(eq(matchstationQueue.id, job!.id));
  expect(row.deadAlertSentAt).not.toBeNull();

  // tweede cron-tik: geen dubbele melding voor dezelfde stilgevallen claim
  const tweede = await roep("Bearer cron-geheim");
  expect(await tweede.json()).toEqual({ alerted: 0 });
});

test("verouderde heartbeat mét wachtend werk genereert een melding", async () => {
  const [dossier] = await db.insert(projectDossiers).values({ name: "Y" }).returning();
  await enqueueDossierForMatching(db, dossier.id);
  await registerHeartbeat(db, new Date(Date.now() - 10 * 60_000));

  const res = await roep("Bearer cron-geheim");
  expect(await res.json()).toEqual({ alerted: 1 });
});
