// Echte kleurvarianten (stap 7): getColorVariants vindt zusterproducten (zelfde merk,
// zelfde naam minus kleur-token) via visible_products — een zuster met verlopen
// prijslijst bestaat niet (ijzeren regel 3). Nul varianten → lege lijst (de kaart valt
// dan terug op de kandidatenlijst; er wordt nooit een kleur verzonnen).
import { expect, test } from "vitest";
import * as schema from "@/db/schema";
import { addProductToBrand, createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { extractColorTokens } from "@/lib/enrichment/parser";
import { getColorVariants } from "@/lib/repo/variants";

async function seedLine(
  db: TestDb,
  fields: Partial<typeof schema.specLines.$inferInsert> = {},
) {
  const [dossier] = await db
    .insert(schema.projectDossiers)
    .values({ name: "Varianten" })
    .returning();
  const [line] = await db
    .insert(schema.specLines)
    .values({ dossierId: dossier.id, fixtureCode: "Lv100", ...fields })
    .returning();
  return line;
}

test("kleur-tokens: kleurwoord en samengestelde kleur herkend, codes niet", () => {
  expect(extractColorTokens("DISCOCO 53 WHITE")).toEqual({
    colors: ["white"],
    baseKey: "discoco 53",
  });
  expect(extractColorTokens("DISCOCO 53 BLACK/GOLD")).toEqual({
    colors: ["black/gold"],
    baseKey: "discoco 53",
  });
  // "C/5mt" is geen kleur; interpunctie normaliseert ("SUSP." ≡ "SUSP")
  expect(extractColorTokens("DISCOCO 35 SUSP. WHITE C/5MT")).toEqual({
    colors: ["white"],
    baseKey: "discoco 35 susp c/5mt",
  });
  // geen kleurwoord → geen kleur, nooit geraden
  expect(extractColorTokens("TAGLIO CORNER").colors).toEqual([]);
});

test("getColorVariants vindt zusterkleuren van hetzelfde merk, zelfde basisnaam", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId: white } = await seedBrandProduct(db, {
    brand: "Marset",
    name: "DISCOCO 53 WHITE",
  });
  const { productId: blackGold } = await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "DISCOCO 53 BLACK/GOLD",
  });
  // andere basisnaam (88 i.p.v. 53) → géén zuster
  await addProductToBrand(db, { brandId, priceListId, name: "DISCOCO 88 WHITE" });

  const line = await seedLine(db, { matchedProductId: white });
  const variants = await getColorVariants(db, line.id);

  expect(variants.map((v) => v.color).sort()).toEqual(["black/gold", "white"]);
  expect(variants.find((v) => v.color === "white")?.productId).toBe(white);
  expect(variants.find((v) => v.color === "black/gold")?.productId).toBe(blackGold);
  expect(variants.some((v) => v.name.includes("DISCOCO 88"))).toBe(false);
});

test("getColorVariants filtert onzichtbare zusters (geen geldige prijs) weg", async () => {
  const db = await createTestDb();
  const { brandId, productId: white } = await seedBrandProduct(db, {
    brand: "Marset",
    name: "DISCOCO 53 WHITE",
  });
  // zuster van hetzelfde merk ZONDER geldige prijs(lijst) → onzichtbaar in
  // visible_products (regel 3: verlopen/ontbrekende prijslijst = product bestaat niet)
  const red = crypto.randomUUID();
  await db.insert(schema.products).values({
    id: red,
    name: "DISCOCO 53 RED",
    brandId,
    brandName: "Marset",
  });

  const line = await seedLine(db, { matchedProductId: white });
  const variants = await getColorVariants(db, line.id);

  expect(variants.map((v) => v.color)).toEqual(["white"]);
  expect(variants.some((v) => v.productId === red)).toBe(false);
});

test("getColorVariants: anker via de best gerankte kandidaat als er geen match is", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId: white } = await seedBrandProduct(db, {
    brand: "Marset",
    name: "DISCOCO 53 WHITE",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "DISCOCO 53 GREEN" });

  const line = await seedLine(db); // geen matchedProductId
  await db.insert(schema.specLineCandidates).values({
    specLineId: line.id,
    productId: white,
    rank: 1,
    list: "aantoonbaar",
    verdicts: [],
  });

  const variants = await getColorVariants(db, line.id);
  expect(variants.map((v) => v.color).sort()).toEqual(["green", "white"]);
});

test("getColorVariants: naam zonder kleurwoord en zonder gekleurde zusters → leeg (fallback)", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, {
    brand: "TAL",
    name: "TAGLIO CORNER",
  });
  const line = await seedLine(db, { matchedProductId: productId });
  expect(await getColorVariants(db, line.id)).toEqual([]);
});
