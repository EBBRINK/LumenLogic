// Field-catalog (merkrelaties stap 1): de catalog is de ÉNE bron van waarheid voor
// scorecard + Excel-template. Kernwaarborgen: 🔒 lekt nooit naar het Excel, en elke
// "meetbare" kolom bestaat écht in het drizzle-schema (geen handgetypte lijst).
import { expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { products } from "@/db/schema";
import {
  FIELD_CATALOG,
  GEEN_REACTIE_DAGEN,
  bucketScore,
  excelColumns,
  measurableFields,
} from "@/lib/field-catalog";

test("catalog: 10 buckets, oplopende order, unieke veld-keys", () => {
  expect(FIELD_CATALOG).toHaveLength(10);
  expect(FIELD_CATALOG.map((b) => b.order).sort((a, b) => a - b)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  const keys = FIELD_CATALOG.flatMap((b) => b.fields.map((f) => f.key));
  expect(new Set(keys).size).toBe(keys.length);
  expect(GEEN_REACTIE_DAGEN).toBeGreaterThan(0);
});

test("tweetalig: elk veld heeft niet-lege labelEn en instructionEn, elke bucket labelEn", () => {
  for (const bucket of FIELD_CATALOG) {
    expect(bucket.labelEn.trim(), `bucket ${bucket.key}`).not.toBe("");
    for (const f of bucket.fields) {
      expect(f.labelEn.trim(), `labelEn van ${f.key}`).not.toBe("");
      expect(f.instructionEn.trim(), `instructionEn van ${f.key}`).not.toBe("");
    }
  }
});

test("🔒-velden: internalOnly ⇒ nooit in het Excel", () => {
  const internal = FIELD_CATALOG.flatMap((b) => b.fields).filter(
    (f) => f.internalOnly,
  );
  // De vijf commercie-🔒's uit het plan zijn er (merk-korting + stock als eigen velden).
  expect(internal.map((f) => f.key)).toEqual(
    expect.arrayContaining([
      "purchase_price_excl_vat",
      "brand_discount",
      "stock",
      "stock_reserved",
      "show_on_web",
      "show_price_on_web",
    ]),
  );
  for (const f of internal) expect(f.inExcel).toBe(false);
  // Negatief: geen enkel 🔒-veld in de Excel-kolommen.
  for (const { field } of excelColumns()) {
    expect(field.internalOnly).toBe(false);
  }
});

test("meetbare velden: elke measure.column bestaat als échte drizzle-kolom", () => {
  const realColumns = new Set(
    Object.values(getTableColumns(products)).map((c) => c.name),
  );
  for (const { field } of measurableFields()) {
    if (field.measure.kind !== "column") throw new Error("onverwacht");
    expect(realColumns, `kolom voor veld ${field.key}`).toContain(
      field.measure.column,
    );
  }
  // K4-mapping: samengestelde plan-velden expliciet gesplitst/gemapt.
  const byKey = new Map(
    FIELD_CATALOG.flatMap((b) => b.fields).map((f) => [f.key, f]),
  );
  expect(byKey.get("name_nl")?.measure).toEqual({ kind: "column", column: "name" });
  expect(byKey.get("name_en")?.measure).toEqual({ kind: "none" });
  expect(byKey.get("dimmable")?.measure).toEqual({ kind: "column", column: "dimmable" });
  expect(byKey.get("dim_protocol")?.measure).toEqual({ kind: "none" });
  expect(byKey.get("category")?.measure).toEqual({ kind: "column", column: "category_path" });
  expect(byKey.get("list_price_excl_vat")?.measure).toEqual({ kind: "price" });
  // Bucket 9 is v1 volledig grijs.
  const bucket9 = FIELD_CATALOG.find((b) => b.order === 9)!;
  for (const f of bucket9.fields) expect(f.measure.kind).toBe("none");
});

test("bucketScore: 0 producten → ratio 0, niets 'filled'", () => {
  const bucket = FIELD_CATALOG.find((b) => b.key === "basis_identiteit")!;
  const score = bucketScore(bucket, {}, 0);
  expect(score.must).toEqual({ filled: 0, total: 3, ratio: 0 }); // sac, name_nl, category
  expect(score.wanna.ratio).toBe(0);
  expect(score.measurableTotal + score.unmeasurable).toBe(bucket.fields.length);
});

test("bucketScore: alles gevuld → must-ratio exact 1 (= donkergroen in de UI)", () => {
  const bucket = FIELD_CATALOG.find((b) => b.key === "basis_identiteit")!;
  const filled: Record<string, number> = {};
  for (const f of bucket.fields) filled[f.key] = 10;
  const score = bucketScore(bucket, filled, 10);
  expect(score.must.ratio).toBe(1);
  expect(score.must.filled).toBe(score.must.total);
  expect(score.wanna.ratio).toBe(1);
});

test("bucketScore: alleen nice gevuld → must/wanna 0, nice 1; deels gevuld = exacte dekking", () => {
  const bucket = FIELD_CATALOG.find((b) => b.key === "afmetingen")!; // 4 wanna-kolommen, nice onmeetbaar
  const uiterlijk = FIELD_CATALOG.find((b) => b.key === "uiterlijk")!;
  // uiterlijk: color_1/material_1 (wanna, meetbaar), color_2/material_2 (nice, onmeetbaar)
  const score = bucketScore(uiterlijk, { color_2: 10, material_2: 10 }, 10);
  expect(score.must.total).toBe(0);
  expect(score.wanna.ratio).toBe(0);
  expect(score.nice.total).toBe(0); // nice-velden hier onmeetbaar → tellen niet mee
  expect(score.unmeasurable).toBe(2);
  // Geen 90%-knip: 5 van 10 gevuld op één van vier velden = exact 0,125.
  const partial = bucketScore(bucket, { height_cm: 5 }, 10);
  expect(partial.wanna.ratio).toBeCloseTo(5 / 10 / 4, 10);
  expect(partial.wanna.filled).toBe(0);
});
