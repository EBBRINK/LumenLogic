// Evaluatieset-harness (H-07, K-06): meet de hit-rate van de matcher tegen een kleine,
// deterministische catalogus met bekende verwachte statussen. Bewijst dat de meting én de
// per-regel-diff kloppen, en dat elke run een nieuwe evaluation_runs-rij toevoegt.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import {
  addEvaluationLines,
  listEvaluationLines,
  listEvaluationRuns,
  measureHitRate,
} from "@/lib/repo/evaluation";

// Kleine catalogus: alleen XAL staat ingeladen (met de SASSO 100 op 3000K).
// Occhio is bewust NIET ingeladen → dat merk moet blauw geven.
async function seedCatalogue(db: Awaited<ReturnType<typeof createTestDb>>) {
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 3000K",
    price: "310.00",
    kelvin: 3000,
    maxWattage: 20,
  });
}

test("measureHitRate meet de score en de per-regel-diff tegen de catalogus", async () => {
  const db = await createTestDb();
  await seedCatalogue(db);

  // Vier regels met bekende verwachte statussen:
  //  A groen  — XAL SASSO, kelvin 3000 (product levert exact 3000K)
  //  B blauw  — merk Occhio staat niet in de catalogus (data-gat)
  //  C paars  — geen verlichting (het woord "tafel" → buiten assortiment)
  //  D groen* — XAL SASSO, kelvin 4000 (product kan 4000K niet → matcher zegt ROOD).
  //             De regel VERWACHT groen (bewuste divergentie-fixture) → dit hoort een
  //             MISS te zijn, zodat we de hit=false-tak echt uitoefenen.
  const inserted = await addEvaluationLines(db, [
    {
      fixtureCode: "EV-A",
      brandText: "XAL",
      productText: "SASSO 100",
      specs: { kelvin: 3000 },
      expectedStatus: "groen",
      note: "moet groen matchen",
    },
    {
      fixtureCode: "EV-B",
      brandText: "Occhio",
      productText: "Mito raggio",
      specs: {},
      expectedStatus: "blauw",
      note: "merk niet ingeladen",
    },
    {
      fixtureCode: "EV-C",
      brandText: null,
      productText: "Eiken tafel 200cm",
      specs: {},
      expectedStatus: "paars",
      note: "geen verlichting",
    },
    {
      fixtureCode: "EV-D",
      brandText: "XAL",
      productText: "SASSO 100",
      specs: { kelvin: 4000 },
      expectedStatus: "groen",
      note: "verwacht groen, maar 4000K bestaat niet → matcher geeft rood (bewuste miss)",
    },
  ]);
  expect(inserted).toHaveLength(4);

  const lines = await listEvaluationLines(db);
  expect(lines).toHaveLength(4);

  const { hitRate, results } = await measureHitRate(db, "baseline");

  // 3 van de 4 raak → 0.75
  expect(results).toHaveLength(4);
  expect(hitRate).toBeCloseTo(0.75, 4);

  // Per-regel-diff: koppel resultaat aan fixtureCode via de line-id.
  const byCode = new Map(lines.map((l) => [l.id, l.fixtureCode]));
  const got = new Map(
    results.map((r) => [byCode.get(r.lineId)!, r]),
  );

  expect(got.get("EV-A")).toMatchObject({ expected: "groen", got: "groen", hit: true });
  expect(got.get("EV-B")).toMatchObject({ expected: "blauw", got: "blauw", hit: true });
  expect(got.get("EV-C")).toMatchObject({ expected: "paars", got: "paars", hit: true });
  // De bewuste miss: verwacht groen, matcher geeft rood → hit=false.
  expect(got.get("EV-D")).toMatchObject({ expected: "groen", got: "rood", hit: false });

  // De run is vastgelegd met de score als numeric-string.
  const runs = await listEvaluationRuns(db);
  expect(runs).toHaveLength(1);
  expect(runs[0].label).toBe("baseline");
  expect(Number(runs[0].hitRate)).toBeCloseTo(0.75, 4);
  expect(runs[0].results).toHaveLength(4);
});

test("elke meting voegt een nieuwe evaluation_runs-rij toe (score over tijd)", async () => {
  const db = await createTestDb();
  await seedCatalogue(db);
  await addEvaluationLines(db, [
    {
      fixtureCode: "EV-A",
      brandText: "XAL",
      productText: "SASSO 100",
      specs: { kelvin: 3000 },
      expectedStatus: "groen",
    },
  ]);

  const first = await measureHitRate(db, "run-1");
  expect(first.hitRate).toBeCloseTo(1, 4); // enige regel matcht groen

  const second = await measureHitRate(db, "run-2");
  expect(second.hitRate).toBeCloseTo(1, 4);

  const runs = await listEvaluationRuns(db);
  expect(runs).toHaveLength(2);
  expect(runs.map((r) => r.label)).toEqual(["run-1", "run-2"]); // oudste eerst
});

test("lege evaluatieset geeft hit-rate 0 en legt toch een run vast", async () => {
  const db = await createTestDb();
  const { hitRate, results } = await measureHitRate(db, "leeg");
  expect(hitRate).toBe(0);
  expect(results).toHaveLength(0);
  const runs = await listEvaluationRuns(db);
  expect(runs).toHaveLength(1);
  expect(Number(runs[0].hitRate)).toBe(0);
});
