// Sprint M1 — bytes voor het document-blok van het ophaal-endpoint.
import { beforeEach, expect, test, vi } from "vitest";
import { importRuns, ocrPageImages, projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";

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
  process.env.MATCHSTATION_MACHINE_KEY = "test-sleutel";
});

async function seedPageImage() {
  const [dossier] = await db.insert(projectDossiers).values({ name: "X" }).returning();
  const [run] = await db.insert(importRuns).values({ dossierId: dossier.id, source: "ocr", rows: [] }).returning();
  await db.insert(ocrPageImages).values({
    importRunId: run.id,
    page: 1,
    tile: 0,
    mime: "image/jpeg",
    width: 10,
    height: 10,
    bytes: new Uint8Array([1, 2, 3, 4]),
  });
  return run.id;
}

function roep(runId: string, page: string, tile: string, key?: string) {
  return GET(
    new Request(`http://local/api/matchstation/document/${runId}/${page}/${tile}`, {
      headers: key ? { "x-matchstation-key": key } : {},
    }),
    { params: Promise.resolve({ runId, page, tile }) },
  );
}

test("zonder sleutel → 401", async () => {
  const runId = await seedPageImage();
  const res = await roep(runId, "1", "0");
  expect(res.status).toBe(401);
});

test("bestaande pagina → 200 met de rauwe bytes", async () => {
  const runId = await seedPageImage();
  const res = await roep(runId, "1", "0", "test-sleutel");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  const buf = new Uint8Array(await res.arrayBuffer());
  expect([...buf]).toEqual([1, 2, 3, 4]);
});

test("onbekende pagina → 404", async () => {
  const runId = await seedPageImage();
  const res = await roep(runId, "99", "0", "test-sleutel");
  expect(res.status).toBe(404);
});

test("geen geldige uuid als runId → 404, geen database-crash", async () => {
  const res = await roep("niet-een-uuid", "1", "0", "test-sleutel");
  expect(res.status).toBe(404);
});
