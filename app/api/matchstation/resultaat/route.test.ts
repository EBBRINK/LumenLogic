// Sprint M1 — het terugstuur-endpoint tegen een echte PGlite-database.
import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { claimNextDossier, enqueueDossierForMatching } from "@/lib/repo/matchstation";

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

const { POST } = await import("./route");

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  harnas.db = db;
  process.env.MATCHSTATION_MACHINE_KEY = "test-sleutel";
  delete process.env.MATCHSTATION_MAX_EUR_PER_RUN;
});

function roep(body: unknown, key = "test-sleutel") {
  return POST(
    new Request("http://local/api/matchstation/resultaat", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-matchstation-key": key } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

async function dossierMetGeclaimdeJob() {
  const [dossier] = await db.insert(projectDossiers).values({ name: "Ziekenhuis Noord" }).returning();
  await enqueueDossierForMatching(db, dossier.id);
  const job = await claimNextDossier(db);
  return { dossier, job: job! };
}

test("zonder sleutel → 401", async () => {
  const res = await roep({ queue_id: crypto.randomUUID(), regels: [] }, "");
  expect(res.status).toBe(401);
});

test("kapotte JSON-body → 400, geen 500", async () => {
  process.env.MATCHSTATION_MACHINE_KEY = "test-sleutel";
  const res = await POST(
    new Request("http://local/api/matchstation/resultaat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-matchstation-key": "test-sleutel" },
      body: "{niet-json",
    }),
  );
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("invalid_json");
});

test("onbekende of niet-geclaimde queue_id → 409, geen data gemuteerd", async () => {
  const res = await roep({
    queue_id: crypto.randomUUID(),
    regels: [{ fixture_code: "Lp001", uitkomst: "bestaat_niet" }],
  });
  expect(res.status).toBe(409);
});

test("ongeldige uitkomst-waarde → 400 (zod), niet een database-crash", async () => {
  const { job } = await dossierMetGeclaimdeJob();
  const res = await roep({
    queue_id: job.id,
    regels: [{ fixture_code: "Lp001", uitkomst: "twijfel" }],
  });
  expect(res.status).toBe(400);
});

test("noch spec_line_id noch fixture_code → 400", async () => {
  const { job } = await dossierMetGeclaimdeJob();
  const res = await roep({ queue_id: job.id, regels: [{ uitkomst: "bestaat_niet" }] });
  expect(res.status).toBe(400);
});

test("happy path: gevonden past de regel toe, koppelt het product en markeert de job verwerkt", async () => {
  const { dossier, job } = await dossierMetGeclaimdeJob();
  const [line] = await db.insert(specLines).values({ dossierId: dossier.id, fixtureCode: "Lp301", brandText: "Flos" }).returning();
  const { productId } = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop Glass C2", price: "845.00" });

  const res = await roep({
    queue_id: job.id,
    regels: [
      {
        spec_line_id: line.id,
        uitkomst: "gevonden",
        product_id: productId,
        prijs: "845.00",
        prijs_vast: true,
        toelichting: "Exacte treffer",
        bewijs: { merk_bevestigd: "Flos", naam_treffer: "exact", kandidaten_over: 1 },
      },
    ],
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.uitkomsten[0]).toMatchObject({ applied: "result", status: "groen" });

  const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
  expect(row.matchedProductId).toBe(productId);

  const [queueRow] = await db.select().from((await import("@/db/schema")).matchstationQueue);
  expect(queueRow.status).toBe("verwerkt");
});

test("plafond geraakt halverwege de batch → de resterende regel wordt niet_beoordeeld, nooit stilzwijgend genegeerd", async () => {
  process.env.MATCHSTATION_MAX_EUR_PER_RUN = "1.00";
  const { dossier, job } = await dossierMetGeclaimdeJob();
  const [lineA] = await db.insert(specLines).values({ dossierId: dossier.id, fixtureCode: "Lp001" }).returning();
  const [lineB] = await db.insert(specLines).values({ dossierId: dossier.id, fixtureCode: "Lp002" }).returning();

  const res = await roep({
    queue_id: job.id,
    regels: [
      { spec_line_id: lineA.id, uitkomst: "bestaat_niet", cost_eur: 0.8 },
      { spec_line_id: lineB.id, uitkomst: "bestaat_niet", cost_eur: 0.5 },
    ],
  });
  const body = await res.json();
  expect(body.uitkomsten[1]).toMatchObject({ applied: "niet_beoordeeld" });

  const [rowB] = await db.select().from(specLines).where(eq(specLines.id, lineB.id));
  expect(rowB.reviewKind).toBe("niet_beoordeeld");
});

test("een fixture_code zonder spec_line_id maakt de regel aan en matcht 'm meteen", async () => {
  const { job, dossier } = await dossierMetGeclaimdeJob();
  const res = await roep({
    queue_id: job.id,
    regels: [{ fixture_code: "Lp777", brand_text: "Zumtobel", uitkomst: "merk_ontbreekt", toelichting: "niet in catalogus" }],
  });
  expect(res.status).toBe(200);
  const rows = await db.select().from(specLines).where(eq(specLines.dossierId, dossier.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ fixtureCode: "Lp777", status: "blauw", source: "llm" });
});
