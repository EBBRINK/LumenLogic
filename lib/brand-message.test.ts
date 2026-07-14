// buildBrandMessage (stap 7): pure NL-tekstgenerator. Randgevallen uit het plan:
// geen prijslijst / verlopen lijst / alles compleet / geen contactpersoon — plus de
// kernwaarborg dat geen enkel 🔒-veld (key of label) ooit in de tekst voorkomt.
import { expect, test } from "vitest";
import { bucketScore, FIELD_CATALOG } from "@/lib/field-catalog";
import { buildBrandMessage, type BrandMessageInput } from "./brand-message";

// Buckets uit echte scores: `filled` = per veld-key hoeveel producten gevuld zijn.
function maakBuckets(filled: Record<string, number>, productCount: number) {
  return [...FIELD_CATALOG]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({
      bucket,
      score: bucketScore(bucket, filled, productCount),
    }));
}

// Alle meetbare veld-keys op 100% — "alles compleet"-stand.
function allesGevuld(productCount: number): Record<string, number> {
  const filled: Record<string, number> = {};
  for (const b of FIELD_CATALOG) {
    for (const f of b.fields) {
      if (f.measure.kind !== "none") filled[f.key] = productCount;
    }
  }
  return filled;
}

const basis: BrandMessageInput = {
  brandName: "Occhio",
  contactName: "Anna Vogel",
  productCount: 30,
  priceListIndicator: "aanwezig_geldig",
  priceListValidUntil: "2026-12-31",
  // Alles gevuld behálve fotometrie (grotendeels leeg) en uiterlijk (half):
  // fotometrie is dan aantoonbaar de laagste-dekking-bucket.
  buckets: maakBuckets(
    {
      ...allesGevuld(30),
      kelvin: 3,
      lumen_output: 0,
      cri: 0,
      beam_angle: 0,
      color_1: 15,
      material_1: 15,
    },
    30,
  ),
};

test("aanhef: contactpersoon indien bekend, anders neutraal", () => {
  expect(buildBrandMessage(basis)).toMatch(/^Beste Anna Vogel,/);
  expect(buildBrandMessage({ ...basis, contactName: null })).toMatch(
    /^Geachte heer\/mevrouw,/,
  );
});

test("geen prijslijst → vraag om prijslijst; geldige lijst → geen prijslijstvraag", () => {
  const zonder = buildBrandMessage({
    ...basis,
    priceListIndicator: "ontbreekt",
    priceListValidUntil: null,
  });
  expect(zonder).toContain("nog geen prijslijst");
  expect(buildBrandMessage(basis)).not.toContain("prijslijst");
});

test("verlopen lijst → verlopen + NL-datum; verloopt binnenkort → tijdig-nieuwe-vraag", () => {
  const verlopen = buildBrandMessage({
    ...basis,
    priceListIndicator: "verlopen",
    priceListValidUntil: "2026-03-01",
  });
  expect(verlopen).toContain("verlopen");
  expect(verlopen).toContain("1 maart 2026");
  const binnenkort = buildBrandMessage({
    ...basis,
    priceListIndicator: "verloopt_binnenkort",
    priceListValidUntil: "2026-08-01",
  });
  expect(binnenkort).toContain("verloopt binnenkort");
  expect(binnenkort).toContain("1 augustus 2026");
});

test("laagste-dekking-buckets in gewone taal, met productaantal en percentage", () => {
  const tekst = buildBrandMessage(basis);
  expect(tekst).toContain("Van uw 30 producten");
  // Fotometrie heeft de laagste dekking (alleen kelvin 3/30) en wordt benoemd.
  expect(tekst).toMatch(/- Fotometrie: bij ongeveer \d+% van de producten onvolledig\./);
  // Maximaal drie buckets in de lijst.
  expect(tekst.split("\n").filter((r) => r.startsWith("- ")).length)
    .toBeLessThanOrEqual(3);
});

test("alles compleet → compliment i.p.v. missende-data-lijst", () => {
  const tekst = buildBrandMessage({
    ...basis,
    buckets: maakBuckets(allesGevuld(30), 30),
  });
  expect(tekst).toContain("compleet");
  expect(tekst).not.toContain("missen we");
  expect(tekst).not.toMatch(/^- /m);
});

test("verwijzing naar het template en afsluiting zijn er altijd", () => {
  for (const input of [basis, { ...basis, productCount: 0, buckets: maakBuckets({}, 0) }]) {
    const tekst = buildBrandMessage(input);
    expect(tekst).toContain("merkdata-template-brinklicht.xlsx");
    expect(tekst).toContain("Met vriendelijke groet,");
  }
});

test("NEGATIEF: geen enkel 🔒-veld (key of label) in welke stand dan ook", () => {
  const standen: BrandMessageInput[] = [
    basis,
    { ...basis, contactName: null, priceListIndicator: "ontbreekt", priceListValidUntil: null },
    { ...basis, priceListIndicator: "verlopen" },
    { ...basis, buckets: maakBuckets(allesGevuld(30), 30) },
    { ...basis, productCount: 0, buckets: maakBuckets({}, 0) },
  ];
  const internal = FIELD_CATALOG.flatMap((b) => b.fields).filter(
    (f) => f.internalOnly,
  );
  expect(internal.length).toBeGreaterThanOrEqual(5);
  for (const stand of standen) {
    const tekst = buildBrandMessage(stand).toLowerCase();
    for (const f of internal) {
      expect(tekst).not.toContain(f.key.toLowerCase());
      expect(tekst).not.toContain(f.labelNl.toLowerCase());
    }
    for (const woord of ["inkoopprijs", "korting", "voorraad"]) {
      expect(tekst).not.toContain(woord);
    }
  }
});
