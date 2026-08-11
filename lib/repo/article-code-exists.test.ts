// `articleCodeExists` — de vraag "kennen wij dit leveranciersartikelnummer?" achter de
// melding op de regel-detailpagina (docs/goal-artikelnummer-matching.md, B5).
//
// De eis is niet "vindt hij iets", maar "zegt hij hetzelfde als de matcher". Beide
// gebruiken dezelfde normalisatie en dezelfde twee kolommen; zouden ze uit elkaar lopen,
// dan meldt het scherm "niet in onze catalogus" onder een kandidatenlijst die de matcher
// juist via die code vond — of andersom, en dat is precies het soort halve waarheid dat
// dit dossier moest wegnemen.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import { articleCodeExists } from "@/lib/repo/products";
import { evaluateSpecLine } from "@/lib/matching/engine";

async function seedCatalogus() {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "[LPS] MULTI POWER 250-900 / 20W DIM8",
    supplierArticleCode: "21012 0298",
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 INTERN",
    articleCode: "L360-SASSO100",
    supplierArticleCode: null,
  });
  return db;
}

test("kent het nummer zoals de klant het schrijft, in elke notatie", async () => {
  const db = await seedCatalogus();
  for (const vorm of ["21012 0298", "210120298", "21012-0298", "21012 0298 "]) {
    expect(await articleCodeExists(db, vorm)).toBe(true);
  }
  // Het interne artikelnummer telt óók — dezelfde twee kolommen als de matcher.
  expect(await articleCodeExists(db, "L360-SASSO100")).toBe(true);
});

test("een onbekend nummer is onbekend; leeg is nooit een treffer", async () => {
  const db = await seedCatalogus();
  // Bestaat bij Delta Light, ontbreekt in onze import — het gemeten geval.
  expect(await articleCodeExists(db, "32812 9220 BRBB")).toBe(false);
  expect(await articleCodeExists(db, "")).toBe(false);
  expect(await articleCodeExists(db, "   ")).toBe(false);
  // Geen prefix-treffer: een deel van een code is geen code.
  expect(await articleCodeExists(db, "21012")).toBe(false);
});

test("zegt precies hetzelfde als de matcher — dezelfde code, hetzelfde antwoord", async () => {
  const db = await seedCatalogus();
  const basis = {
    brandText: "Delta Light",
    productText: "MULTI POWER",
    specs: {},
    nonLighting: false,
  };

  const treffer = await evaluateSpecLine(db, { ...basis, sku: "21012 0298" });
  expect(treffer.viaArticleCode).toBe("21012 0298");
  expect(await articleCodeExists(db, "21012 0298")).toBe(true);

  const mis = await evaluateSpecLine(db, { ...basis, sku: "32812 9220 BRBB" });
  expect(mis.articleCodeMiss).toBe("32812 9220 BRBB");
  expect(await articleCodeExists(db, "32812 9220 BRBB")).toBe(false);
});
