// Sprint M1 — het ophaal-endpoint tegen een echte PGlite-database (zelfde harnas als
// app/projects/actions-validation.test.ts): proxy op @/db/client zodat de route-code
// ongewijzigd tegen de testdatabase draait.
import { beforeEach, expect, test, vi } from "vitest";
import { projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { enqueueDossierForMatching } from "@/lib/repo/matchstation";

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

function roep(key?: string) {
  return GET(new Request("http://local/api/matchstation/werk", {
    headers: key ? { "x-matchstation-key": key } : {},
  }));
}

test("zonder sleutel → 401, geen data", async () => {
  const res = await roep();
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("met verkeerde sleutel → 401", async () => {
  const res = await roep("verkeerd");
  expect(res.status).toBe(401);
});

test("geen MATCHSTATION_MACHINE_KEY geconfigureerd → 401 (fail-closed, geen open poort per ongeluk)", async () => {
  delete process.env.MATCHSTATION_MACHINE_KEY;
  const res = await roep("test-sleutel");
  expect(res.status).toBe(401);
});

test("geen werk in de wachtrij → 204", async () => {
  const res = await roep("test-sleutel");
  expect(res.status).toBe(204);
});

test("werk aanwezig → 200 met dossier, job en document-blok (met de eerlijke waarschuwing)", async () => {
  const [dossier] = await db.insert(projectDossiers).values({ name: "Ziekenhuis Noord", customer: "GGZ" }).returning();
  await enqueueDossierForMatching(db, dossier.id);

  const res = await roep("test-sleutel");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.dossier).toMatchObject({ id: dossier.id, name: "Ziekenhuis Noord", customer: "GGZ" });
  expect(body.job.dossierId).toBe(dossier.id);
  expect(body.document.pageImages).toEqual([]);
  expect(body.document.markdown).toBeNull();
  expect(body.document.warning).toMatch(/originele geüploade bestand/);
  expect(body.existingLines).toEqual([]);
});

test("een tweede aanroep tijdens de geldige claim krijgt geen werk (204) — nooit twee machines op hetzelfde dossier", async () => {
  const [dossier] = await db.insert(projectDossiers).values({ name: "Kantoor Zuid" }).returning();
  await enqueueDossierForMatching(db, dossier.id);

  const eerste = await roep("test-sleutel");
  expect(eerste.status).toBe(200);
  const tweede = await roep("test-sleutel");
  expect(tweede.status).toBe(204);
});
