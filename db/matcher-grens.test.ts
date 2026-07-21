/// <reference types="vite/client" />
// DoD 5 van sprint 1.8 — de matcher-grens.
//
// DEZE TEST TOONT "ONMOGELIJK", NIET "GEBEURT NIET". Dat onderscheid is het hele punt.
//
// Een gedragstest ("we zoeken op een eigen veld en krijgen niets terug") bewijst alleen dat
// de matcher vandaag niet toevallig langs die waarde kwam. Hij zou groen blijven terwijl
// iemand `custom_values` aan de view toevoegt en er nog geen zoekopdracht op draait — en dan
// staat er een groene test naast een gebroken grens.
//
// Wat er wél bewezen wordt, in drie stappen:
//   1. De VIEW-DEFINITIE zoals Postgres hem zelf teruggeeft. `visible_products` en
//      `visible_specs` hebben een EXPLICIETE kolomlijst — geen `SELECT *`, geen generieke
//      loop over "alle kolommen". Staat `custom_values` daar niet in, dan kan geen enkele
//      query via die view erbij, ongeacht wat de engine probeert.
//   2. Het DRIZZLE-viewobject, want dat is wat de engine in TypeScript in handen heeft
//      (lib/matching/engine.ts leest productgegevens uitsluitend via visibleProducts).
//   3. De BRON van élk bestand onder lib/matching/: er staat nergens ook maar een verwijzing
//      naar de eigen velden. Wie de grens wil doorbreken moet én een migratie schrijven die
//      een view herdefinieert, én hier een tweede rode test veroorzaken.
//
// Stap 3 leest broncode i.p.v. gedrag te observeren, en dat is opzettelijk: het is de enige
// vorm die ook een pad afdekt dat vandaag nog niet bestaat.
import { expect, test } from "vitest";
import { getViewSelectedFields, sql } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { visibleProducts, visibleSpecs } from "./schema";

/** Elk bestand onder lib/matching/ als ruwe tekst. `import.meta.glob` en geen handmatige
 *  lijst: een nieuw bestand in die map valt zo automatisch onder de tripwire in plaats van
 *  er stil buiten te blijven. */
const MATCHING_BRONNEN = import.meta.glob("../lib/matching/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Elke manier waarop een eigen veld in de matcher terecht zou kunnen komen: de kolom, de
 *  drizzle-property, de tabel, de prefix en de module zelf. */
const VERBODEN =
  /custom_values|customValues|custom_fields|customFields|EIGEN_VELD_PREFIX|lib\/custom-fields/;

async function viewdef(naam: string): Promise<string> {
  const db = await createTestDb();
  const res = (await db.execute(
    sql`select pg_get_viewdef(${naam}::regclass) as def`,
  )) as unknown as { rows?: { def: string }[] } | { def: string }[];
  const rijen = Array.isArray(res) ? res : (res.rows ?? []);
  return String(rijen[0].def);
}

test("DoD 5 (1/3): de definitie van visible_products noemt custom_values niet", async () => {
  const def = await viewdef("visible_products");
  // Zekerheidscheck dat we écht de definitie te pakken hebben en niet een lege string.
  expect(def).toMatch(/tier2_source/);
  expect(def).not.toMatch(/custom_values/);
  // En het is geen SELECT * waar een nieuwe kolom vanzelf in zou vallen.
  expect(def).not.toMatch(/select\s+\*/i);
});

test("DoD 5 (1/3, bis): idem voor visible_specs", async () => {
  const def = await viewdef("visible_specs");
  expect(def).toMatch(/tier2_source/);
  expect(def).not.toMatch(/custom_values/);
  expect(def).not.toMatch(/select\s+\*/i);
});

test("DoD 5 (2/3): het drizzle-viewobject dat de engine gebruikt kent customValues niet", () => {
  // ⚠️ NIET Object.keys(visibleProducts): drizzle hangt de kolommen aan een intern symbol,
  // dus Object.keys() geeft een LEGE array en `not.toContain(...)` zou altijd slagen —
  // een test die niets toetst. getViewSelectedFields() is de echte kolomlijst.
  const kolommen = Object.keys(getViewSelectedFields(visibleProducts));
  const specKolommen = Object.keys(getViewSelectedFields(visibleSpecs));

  expect(kolommen).not.toContain("customValues");
  expect(specKolommen).not.toContain("customValues");
  // Contrast: tier2Source zit er wél in. Dát is precies waarom de eigen veldwaarden NIET in
  // tier2_source mochten landen — die kolom staat in beide views.
  expect(kolommen).toContain("tier2Source");
  expect(specKolommen).toContain("tier2Source");
});

test("DoD 5 (3/3): geen enkel bestand onder lib/matching/ noemt de eigen velden", () => {
  const paden = Object.keys(MATCHING_BRONNEN);
  // Zonder deze assert zou een kapotte glob een lege lus opleveren: groen zonder te toetsen.
  expect(paden.length).toBeGreaterThanOrEqual(3);
  expect(paden.some((p) => p.endsWith("engine.ts"))).toBe(true);

  const overtredingen = paden.filter((p) => VERBODEN.test(MATCHING_BRONNEN[p]));
  // Alles ineens, zodat één run élke overtreding laat zien i.p.v. de eerste.
  expect(overtredingen).toEqual([]);
});
