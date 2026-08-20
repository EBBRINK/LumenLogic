// Gelijkwaardigheidsengine (run 3): bewijst de ijzeren regels op een echte (PGlite) db.
//   • Regel 4: in tender géén alternatieven; in gegund wél.
//   • Regel 2: prijs beïnvloedt de ranking NOOIT (aparte, expliciete test).
//   • Regel 3: verlopen prijslijst → niet als referentie én niet als alternatief.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { getEquivalentAlternatives } from "@/lib/repo/equivalence";

const CAT = "Binnenverlichting >> Spot";

async function seedScenario() {
  const db = await createTestDb();
  const { productId: ref } = await seedBrandProduct(db, {
    brand: "XAL", name: "SASSO 100 CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 36, epdLifetimeHours: 35000, price: "310.00",
  });
  return { db, ref };
}

test("regel 4: tender geeft geen alternatieven, gegund wél", async () => {
  const { db, ref } = await seedScenario();
  await seedBrandProduct(db, {
    brand: "Kreon", name: "ESPRIT CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 120, epdLifetimeHours: 100000, price: "699.00",
  });

  const tender = await getEquivalentAlternatives(db, { phase: "tender", referenceProductId: ref });
  expect(tender.alternatives).toHaveLength(0);

  const awarded = await getEquivalentAlternatives(db, { phase: "awarded", referenceProductId: ref });
  expect(awarded.alternatives.length).toBeGreaterThan(0);
  expect(awarded.alternatives.some((a) => a.brandName === "Kreon")).toBe(true);
});

test("regel 2: prijs beïnvloedt de ranking niet (tiebreak op naam, niet op prijs)", async () => {
  const { db, ref } = await seedScenario();
  // twee identiek-gelijkwaardige, identiek-duurzame alternatieven; alleen prijs verschilt
  await seedBrandProduct(db, {
    brand: "MerkA", name: "AAA CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 60, epdLifetimeHours: 50000, price: "5000.00", // duur
  });
  await seedBrandProduct(db, {
    brand: "MerkB", name: "BBB CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 60, epdLifetimeHours: 50000, price: "10.00", // goedkoop
  });
  const { alternatives } = await getEquivalentAlternatives(db, {
    phase: "awarded", referenceProductId: ref, limit: 10,
  });
  const aaa = alternatives.findIndex((a) => a.name === "AAA CEIL");
  const bbb = alternatives.findIndex((a) => a.name === "BBB CEIL");
  // als prijs zou meewegen, stond het goedkope BBB vooraan; de engine sorteert op naam
  expect(aaa).toBeGreaterThanOrEqual(0);
  expect(bbb).toBeGreaterThan(aaa);
});

test("duurzaamheid is de tiebreak: hogere garantie/EPD wint bij gelijke gelijkwaardigheid", async () => {
  const { db, ref } = await seedScenario();
  await seedBrandProduct(db, {
    brand: "Groen", name: "GROEN CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 120, epdLifetimeHours: 100000, price: "900.00",
  });
  await seedBrandProduct(db, {
    brand: "Grijs", name: "GRIJS CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 24, epdLifetimeHours: 25000, price: "50.00",
  });
  const { alternatives } = await getEquivalentAlternatives(db, {
    phase: "awarded", referenceProductId: ref, limit: 10,
  });
  const groen = alternatives.findIndex((a) => a.brandName === "Groen");
  const grijs = alternatives.findIndex((a) => a.brandName === "Grijs");
  expect(groen).toBeGreaterThanOrEqual(0);
  expect(groen).toBeLessThan(grijs); // duurzamere optie staat hoger
});

test("regel 3: alternatief met verlopen prijslijst is onvindbaar", async () => {
  const { db, ref } = await seedScenario();
  await seedBrandProduct(db, {
    brand: "Ghost", name: "PHANTOM CEIL", categoryPath: CAT, kelvin: 3000,
    warrantyMonths: 999, epdLifetimeHours: 999999, // beste duurzaamheid…
    price: "100.00", validUntil: "2020-01-01", // …maar verlopen → onzichtbaar
  });
  const { alternatives } = await getEquivalentAlternatives(db, {
    phase: "awarded", referenceProductId: ref, limit: 10,
  });
  expect(alternatives.some((a) => a.name.includes("PHANTOM"))).toBe(false);
});

test("regel 3 herschreven: een vervallen referentie krijgt gewoon alternatieven", async () => {
  // ⚠️ Deze test verwachtte tot 19 aug 2026 `reference: null` — verlopen was onvindbaar.
  // Sinds migratie 0022 is de referentie vindbaar zónder bedrag, en dat is precies het
  // geval waarin je een alternatief zoekt. Wat wél hard blijft: een ALTERNATIEF moet
  // actueel zijn, anders stel je iets voor dat je niet kunt offreren.
  const db = await createTestDb();
  const { productId: ref } = await seedBrandProduct(db, {
    brand: "XAL", name: "SASSO 100 CEIL", categoryPath: CAT, kelvin: 3000,
    price: "310.00", validFrom: "2019-01-01", validUntil: "2020-01-01",
  });
  await seedBrandProduct(db, {
    brand: "Delta Light", name: "BOXY CEIL", categoryPath: CAT, kelvin: 3000,
    price: "280.00",
  });
  // En een alternatief dat óók vervallen is: dat mag niet voorgesteld worden.
  await seedBrandProduct(db, {
    brand: "Ghost", name: "PHANTOM CEIL", categoryPath: CAT, kelvin: 3000,
    price: "90.00", validFrom: "2019-01-01", validUntil: "2020-01-01",
  });

  const res = await getEquivalentAlternatives(db, { phase: "awarded", referenceProductId: ref });
  expect(res.reference).not.toBeNull();
  expect(res.reference!.priceState).toBe("prijslijst_verlopen");
  expect(res.reference!.grossPrice).toBeNull();

  const namen = res.alternatives.map((a) => a.name);
  expect(namen).toContain("BOXY CEIL");
  expect(namen).not.toContain("PHANTOM CEIL");
});
