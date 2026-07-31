// De disclosure-beslisboom (§4.11) is de gedeelde gating-contract van /products,
// /catalog en /brand — hier gelockt op de tier × context-matrix + de per-veld-override.
import { expect, test } from "vitest";
import { products } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  fieldVisible,
  getProductForDisclosure,
  resolveDisclosure,
  type ViewerContext,
} from "@/lib/repo/disclosure";

const intern: ViewerContext = { internal: true, hasApprovedProject: false };
const externZonderProject: ViewerContext = { internal: false, hasApprovedProject: false };
const externMetProject: ViewerContext = { internal: false, hasApprovedProject: true };

// A5 (reviewzwerm 2.5a). Deze test stond hier eerder als "tier1 toont altijd alles
// inclusief prijs" en legde daarmee juist het defect vast: de tier1-tak negeerde `ctx`
// en gaf een externe kijker zonder project onvoorwaardelijk de brutoprijs. §4.11 tekent
// ónder tier1 wél een contextsplitsing, die was alleen nooit gebouwd. "Altijd" is dus
// vervangen door de matrix die het ontwerp voorschrijft.
test("tier1: intern of met goedgekeurd project ziet de adviesprijs", () => {
  for (const ctx of [intern, externMetProject]) {
    const d = resolveDisclosure("tier1", ctx);
    expect(d.showSpecs).toBe(true);
    expect(d.showPrice).toBe(true);
    expect(d.priceGated).toBe(false);
  }
});

test("A5 tier1: specifier zonder project ziet specs, maar géén adviesprijs", () => {
  const d = resolveDisclosure("tier1", externZonderProject);
  expect(d.showSpecs).toBe(true); // tier1 verbergt nooit specs
  expect(d.showPrice).toBe(false); // ijzeren regel 1: geen publieke prijs
  expect(d.priceGated).toBe(true); // → "Prijs via Brink aanvragen" (J-03)
});

// De kern van A5 in één regel: er is geen tier waarin een kijker zonder recht een prijs
// krijgt. Dit is de assert die de oude situatie in álle tiers tegelijk zou vangen.
test("A5: geen enkele tier toont een prijs aan een kijker zonder recht", () => {
  for (const tier of ["tier1", "tier2", "tier3"] as const) {
    const d = resolveDisclosure(tier, externZonderProject);
    expect(d.showPrice).toBe(false);
  }
});

test("tier2 toont specs; prijs alleen intern of met goedgekeurd project", () => {
  expect(resolveDisclosure("tier2", intern).showPrice).toBe(true);
  expect(resolveDisclosure("tier2", externMetProject).showPrice).toBe(true);
  const gated = resolveDisclosure("tier2", externZonderProject);
  expect(gated.showSpecs).toBe(true);
  expect(gated.showPrice).toBe(false);
  expect(gated.priceGated).toBe(true); // → "Prijs via Brink aanvragen"
});

test("tier3 toont alleen naam + 'data in afwachting van merk'", () => {
  const d = resolveDisclosure("tier3", intern);
  expect(d.showName).toBe(true);
  expect(d.showSpecs).toBe(false);
  expect(d.showPrice).toBe(false);
  expect(d.awaitingData).toBe(true);
});

// A5, verzwarend deel: visible_specs.disclosure_tier is nullable (een product zonder
// merk heeft geen tier), en de repo viel voor die onbekende waarde terug op tier1 — de
// ruimste stand. Samen met de oude tier1-tak betekende dat: merkloos product = publieke
// prijs. Onbekend is geen toestemming.
test("A5: een product zonder merk valt terug op de gegate stand, niet op tier1", async () => {
  const db = await createTestDb();
  const [p] = await db
    .insert(products)
    .values({
      id: crypto.randomUUID(),
      name: "MERKLOOS ARMATUUR",
      brandId: null, // → visible_specs.disclosure_tier is NULL
      status: "actief",
    })
    .returning();

  const extern = await getProductForDisclosure(db, p.id, externZonderProject);
  expect(extern).not.toBeNull();
  expect(extern!.disclosure.tier).toBe("tier2");
  expect(extern!.disclosure.showPrice).toBe(false);
  expect(extern!.disclosure.priceGated).toBe(true);
  // En er is niet stiekem tóch een prijs opgehaald.
  expect(extern!.price).toBeNull();

  // Intern verandert er niets: die ziet het product gewoon.
  const binnen = await getProductForDisclosure(db, p.id, intern);
  expect(binnen!.disclosure.showSpecs).toBe(true);
  expect(binnen!.disclosure.showPrice).toBe(true);
});

test("per-veld-uitzondering overschrijft de tier-basis (J-04)", () => {
  // basis = zichtbaar, maar 'gross_price' expliciet verborgen
  expect(fieldVisible(true, { gross_price: false }, "gross_price")).toBe(false);
  // basis = verborgen, maar 'max_wattage' expliciet zichtbaar
  expect(fieldVisible(false, { max_wattage: true }, "max_wattage")).toBe(true);
  // geen override → basis telt
  expect(fieldVisible(true, {}, "kelvin")).toBe(true);
});
