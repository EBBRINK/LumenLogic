// De disclosure-beslisboom (§4.11) is de gedeelde gating-contract van /producten,
// /catalogus en /merk — hier gelockt op de tier × context-matrix + de per-veld-override.
import { expect, test } from "vitest";
import {
  fieldVisible,
  resolveDisclosure,
  type ViewerContext,
} from "@/lib/repo/disclosure";

const intern: ViewerContext = { internal: true, hasApprovedProject: false };
const externZonderProject: ViewerContext = { internal: false, hasApprovedProject: false };
const externMetProject: ViewerContext = { internal: false, hasApprovedProject: true };

test("tier1 toont altijd alles inclusief prijs", () => {
  const d = resolveDisclosure("tier1", externZonderProject);
  expect(d.showSpecs).toBe(true);
  expect(d.showPrice).toBe(true);
  expect(d.priceGated).toBe(false);
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

test("per-veld-uitzondering overschrijft de tier-basis (J-04)", () => {
  // basis = zichtbaar, maar 'gross_price' expliciet verborgen
  expect(fieldVisible(true, { gross_price: false }, "gross_price")).toBe(false);
  // basis = verborgen, maar 'max_wattage' expliciet zichtbaar
  expect(fieldVisible(false, { max_wattage: true }, "max_wattage")).toBe(true);
  // geen override → basis telt
  expect(fieldVisible(true, {}, "kelvin")).toBe(true);
});
