// Merk-CRUD-repo (sprint 1.5): de dubbelcheck is exact en waarschuwt (blokkeert niet — de
// Flos-drieling op L028 is echt), de token verandert mee met de match-set, de slug wordt bij
// het aanmaken gevuld en bij het bewerken NOOIT aangeraakt, en de verwijderimpact vertelt
// waaróm het niet kan — inclusief de lege prijslijst die bij 405 van de 437 merken de enige
// blocker is. Elke schrijfactie landt in de events-tabel (ijzeren regel 5).
import { expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createTestDb, seedBrand, seedBrandProduct, type TestDb } from "@/db/test-db";
import { brandRelations, brands, events, priceLists } from "@/db/schema";
import {
  createBrand,
  deleteBrand,
  duplicateToken,
  findBrandDuplicates,
  getBrandDeleteImpact,
  getBrandForEdit,
  setBrandLifecycle,
  updateBrand,
  type BrandInput,
} from "@/lib/repo/brands";

const BASIS: BrandInput = {
  name: "Flos",
  brandCode: "L028",
  country: "IT",
  website: null,
  descriptionNl: null,
  lifecycle: "actief",
};

async function eventsFor(db: TestDb, brandId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.entityId, brandId))
    .orderBy(asc(events.createdAt));
}

test("findBrandDuplicates: gedeelde merkcode (de Flos-drieling op L028) en gedeelde naam, hoofdletterongevoelig", async () => {
  const db = await createTestDb();
  const a = await createBrand(db, { ...BASIS, name: "Flos" });
  const b = await createBrand(db, { ...BASIS, name: "Flos Architectural" });
  await createBrand(db, { ...BASIS, name: "Flos SOFT Architectural" });
  await createBrand(db, { ...BASIS, name: "Artemide", brandCode: "L100" });

  // Alleen de code deelt: drie treffers, alle op brand_code.
  const opCode = await findBrandDuplicates(db, { name: "Nieuw Merk", brandCode: "l028" });
  expect(opCode).toHaveLength(3);
  expect(opCode.every((m) => m.on.includes("brand_code"))).toBe(true);
  expect(opCode.some((m) => m.on.includes("name"))).toBe(false);

  // Naam én code raken hetzelfde merk → beide redenen op één match.
  const opBeide = await findBrandDuplicates(db, { name: "fLoS", brandCode: "L028" });
  const zelf = opBeide.find((m) => m.id === a.id)!;
  expect(zelf.on.sort()).toEqual(["brand_code", "name"]);

  // Alleen de naam, andere code: precies één treffer, exact — niet fuzzy.
  const opNaam = await findBrandDuplicates(db, {
    name: "flos architectural",
    brandCode: "L999",
  });
  expect(opNaam.map((m) => m.id)).toEqual([b.id]);

  // Bewerken: het merk zelf is geen dubbele.
  const bewerken = await findBrandDuplicates(db, {
    name: "Flos",
    brandCode: "L028",
    excludeId: a.id,
  });
  expect(bewerken.map((m) => m.id)).not.toContain(a.id);
  expect(bewerken).toHaveLength(2);
});

test("duplicateToken: verandert zodra de match-set verandert (dat is zijn hele reden)", async () => {
  const db = await createTestDb();
  await createBrand(db, { ...BASIS, name: "Flos" });
  await createBrand(db, { ...BASIS, name: "Flos Architectural" });

  const opCode = await findBrandDuplicates(db, { name: "Nieuw", brandCode: "L028" });
  const opNaam = await findBrandDuplicates(db, { name: "Flos", brandCode: null });
  expect(duplicateToken(opCode)).not.toBe(duplicateToken(opNaam));
  expect(duplicateToken([])).toBe("");

  // Volgorde van de matches mag de token niet beïnvloeden (gesorteerd).
  expect(duplicateToken([...opCode].reverse())).toBe(duplicateToken(opCode));
});

test("createBrand: id + slug worden gegenereerd, lifecycle default 'actief', event met duplicateOf", async () => {
  const db = await createTestDb();
  const bestaand = await createBrand(db, { ...BASIS, name: "Flos" });
  const { id } = await createBrand(
    db,
    { ...BASIS, name: "Flos SOFT Architectural" },
    "timo",
    { duplicateOf: [bestaand.id] },
  );

  const row = await getBrandForEdit(db, id);
  expect(row).not.toBeNull();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect(row!.slug).toBe("flos-soft-architectural");
  expect(row!.lifecycle).toBe("actief");
  expect(row!.descriptionNl).toBeNull();

  const evts = await eventsFor(db, id);
  expect(evts).toHaveLength(1);
  expect(evts[0].entity).toBe("brand");
  expect(evts[0].action).toBe("brand_created");
  expect(evts[0].actor).toBe("timo");
  expect(evts[0].payload).toEqual({
    name: "Flos SOFT Architectural",
    slug: "flos-soft-architectural",
    brandCode: "L028",
    lifecycle: "actief",
    duplicateOf: [bestaand.id],
  });
});

test("createBrand: de omschrijving landt in description_nl (geen stil weggevallen sleutel)", async () => {
  const db = await createTestDb();
  const { id } = await createBrand(db, {
    ...BASIS,
    name: "Tronconi",
    descriptionNl: "Failliet in 2024.",
  });
  const [row] = await db.select().from(brands).where(eq(brands.id, id));
  expect(row.descriptionNl).toBe("Failliet in 2024.");
});

test("updateBrand: laat de slug ongemoeid en logt alleen de gewijzigde velden", async () => {
  const db = await createTestDb();
  const { id } = await createBrand(db, { ...BASIS, name: "Itre" });
  const slugVoor = (await getBrandForEdit(db, id))!.slug;

  await updateBrand(db, id, { ...BASIS, name: "Intre", country: "NL" }, "timo");

  const na = (await getBrandForEdit(db, id))!;
  expect(na.name).toBe("Intre");
  expect(na.slug).toBe(slugVoor); // hernoemen verschuift de slug NIET
  expect(na.slug).toBe("itre");

  const evts = await eventsFor(db, id);
  expect(evts.map((e) => e.action)).toEqual(["brand_created", "brand_updated"]);
  expect(evts[1].payload).toEqual({ changed: ["name", "country"], duplicateOf: [] });

  // Niets gewijzigd → geen event erbij.
  await updateBrand(db, id, { ...BASIS, name: "Intre", country: "NL" }, "timo");
  expect(await eventsFor(db, id)).toHaveLength(2);
});

test("updateBrand met fase-wijziging geeft TWEE events; setBrandLifecycle logt alleen bij echte wijziging", async () => {
  const db = await createTestDb();
  const { id } = await createBrand(db, { ...BASIS, name: "Luxit" });

  await updateBrand(
    db,
    id,
    { ...BASIS, name: "Luxit", descriptionNl: "Failliet", lifecycle: "bestaat_niet_meer" },
    "timo",
  );
  let evts = await eventsFor(db, id);
  expect(evts.map((e) => e.action)).toEqual([
    "brand_created",
    "brand_updated",
    "brand_lifecycle_changed",
  ]);
  expect(evts[1].payload).toEqual({ changed: ["descriptionNl"], duplicateOf: [] });
  expect(evts[2].payload).toEqual({ from: "actief", to: "bestaat_niet_meer" });

  // Zelfde waarde nog eens zetten: geen schrijfactie, geen event.
  await setBrandLifecycle(db, id, "bestaat_niet_meer", "timo");
  expect(await eventsFor(db, id)).toHaveLength(3);

  await setBrandLifecycle(db, id, "slapend", "timo");
  evts = await eventsFor(db, id);
  expect(evts).toHaveLength(4);
  expect(evts[3].action).toBe("brand_lifecycle_changed");
  expect(evts[3].payload).toEqual({ from: "bestaat_niet_meer", to: "slapend" });
  expect((await getBrandForEdit(db, id))!.lifecycle).toBe("slapend");
});

test("getBrandDeleteImpact: een LEGE prijslijst blokkeert — mét naam en 0 prijsregels", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrand(db, "Tronconi");
  await db.insert(priceLists).values({
    brandId,
    name: "Brutoprijslijst Tronconi",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });

  const impact = await getBrandDeleteImpact(db, brandId);
  expect(impact.blocked).toBe(true);
  expect(impact.blockers).toEqual({
    products: 0,
    priceLists: 1,
    enrichmentRuns: 0,
    leads: 0,
  });
  expect(impact.priceListName).toBe("Brutoprijslijst Tronconi");
  expect(impact.priceRowCount).toBe(0); // dít is waarom de naam meekomt: 1 lijst, 0 regels
});

test("getBrandDeleteImpact: producten + prijsregels tellen, cascades apart", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Artemide", name: "Tolomeo" });
  await db.insert(brandRelations).values({ brandId, status: "benaderd" });

  const impact = await getBrandDeleteImpact(db, brandId);
  expect(impact.blockers.products).toBe(1);
  expect(impact.blockers.priceLists).toBe(1);
  expect(impact.priceRowCount).toBe(1);
  expect(impact.cascades.brandRelations).toBe(1);
  expect(impact.cascades.brandAliases).toBe(0);
});

test("deleteBrand: {ok:false} bij een prijslijst — de rij blijft staan, geen event", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Martini", name: "X" });

  const res = await deleteBrand(db, brandId, "timo");
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.impact.blockers.priceLists).toBe(1);
  expect(await getBrandForEdit(db, brandId)).not.toBeNull();
  expect(
    (await eventsFor(db, brandId)).some((e) => e.action === "brand_deleted"),
  ).toBe(false);
});

test("deleteBrand: vers merk gaat weg, brand_relations cascadeert mee, event draagt naam/code", async () => {
  const db = await createTestDb();
  const { id } = await createBrand(db, { ...BASIS, name: "Dubbel Ingevoerd" }, "timo");
  await db.insert(brandRelations).values({ brandId: id, status: "benaderd" });

  const res = await deleteBrand(db, id, "timo");
  expect(res.ok).toBe(true);
  expect(await getBrandForEdit(db, id)).toBeNull();
  expect(
    await db.select().from(brandRelations).where(eq(brandRelations.brandId, id)),
  ).toHaveLength(0);

  const evts = await eventsFor(db, id);
  expect(evts.map((e) => e.action)).toEqual(["brand_created", "brand_deleted"]);
  // entityId wijst naar een rij die niet meer bestaat → naam/code MOETEN in de payload.
  expect(evts[1].payload).toEqual({
    name: "Dubbel Ingevoerd",
    slug: "dubbel-ingevoerd",
    brandCode: "L028",
    cascaded: {
      brandRelations: 1,
      brandAliases: 0,
      brandFieldVisibility: 0,
      brandUploads: 0,
    },
  });
});

test("alle vier de events landen op entity 'brand'", async () => {
  const db = await createTestDb();
  const { id } = await createBrand(db, { ...BASIS, name: "Modiss" }, "timo");
  await updateBrand(db, id, { ...BASIS, name: "Modiss", country: "ES" }, "timo");
  await setBrandLifecycle(db, id, "bestaat_niet_meer", "timo");
  await deleteBrand(db, id, "timo");

  const evts = await eventsFor(db, id);
  expect(evts.map((e) => e.action)).toEqual([
    "brand_created",
    "brand_updated",
    "brand_lifecycle_changed",
    "brand_deleted",
  ]);
  expect(evts.every((e) => e.entity === "brand")).toBe(true);
  expect(evts.every((e) => e.actor === "timo")).toBe(true);
});
