// buildBrandMessage (stap 7): pure NL-tekstgenerator. Randgevallen uit het plan:
// geen prijslijst / verlopen lijst / alles compleet / geen contactpersoon — plus de
// kernwaarborg dat geen enkel 🔒-veld (key of label) ooit in de tekst voorkomt.
import { expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { products } from "@/db/schema";
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
  // Alles gevuld behálve fotometrie (vrijwel leeg) en uiterlijk (half). Sinds 1.3-A
  // meten sdcm/efficacy/ugr/lifetime_rating écht mee, dus die moeten hier óók leeg
  // staan — anders zou fotometrie (0,51) hóger scoren dan uiterlijk (0,50) en zou de
  // Photometrics-assert hieronder alleen nog toevallig slagen. Nu is fotometrie
  // aantoonbaar de laagste: must/wanna-dekking 0,0125 tegen 0,50 voor uiterlijk.
  buckets: maakBuckets(
    {
      ...allesGevuld(30),
      kelvin: 3,
      lumen_output: 0,
      cri: 0,
      beam_angle: 0,
      sdcm: 0,
      efficacy: 0,
      ugr: 0,
      lifetime_rating: 0,
      color_1: 15,
      material_1: 15,
    },
    30,
  ),
};

test("aanhef: contactpersoon indien bekend, anders neutraal", () => {
  expect(buildBrandMessage(basis)).toMatch(/^Dear Anna Vogel,/);
  expect(buildBrandMessage({ ...basis, contactName: null })).toMatch(
    /^Dear Sir or Madam,/,
  );
});

test("geen prijslijst → vraag om prijslijst; geldige lijst → geen prijslijstvraag", () => {
  const zonder = buildBrandMessage({
    ...basis,
    priceListIndicator: "ontbreekt",
    priceListValidUntil: null,
  });
  expect(zonder).toContain("don't have a price list");
  expect(buildBrandMessage(basis)).not.toContain("price list");
});

test("verlopen lijst → verlopen + NL-datum; verloopt binnenkort → tijdig-nieuwe-vraag", () => {
  const verlopen = buildBrandMessage({
    ...basis,
    priceListIndicator: "verlopen",
    priceListValidUntil: "2026-03-01",
  });
  expect(verlopen).toContain("expired");
  expect(verlopen).toContain("1 March 2026");
  const binnenkort = buildBrandMessage({
    ...basis,
    priceListIndicator: "verloopt_binnenkort",
    priceListValidUntil: "2026-08-01",
  });
  expect(binnenkort).toContain("expires soon");
  expect(binnenkort).toContain("1 August 2026");
});

// De invariant waarop de lek-preventie in brand-message.ts leunt sinds 1.3-A.
// Vier 🔒-velden (stock, …) zijn nu meetbaar; dekking() leest alleen must+wanna, dus
// een meetbaar 🔒-veld mag nooit op must/wanna staan. Wordt dat ooit veranderd, dan
// gaan interne cijfers meewegen in een tekst die naar het mérk gaat.
test("INVARIANT: elk 🔒-veld is niveau 'nice' of heeft géén products-kolom", () => {
  const realColumns = new Set(
    Object.values(getTableColumns(products)).map((c) => c.name),
  );
  const overtredingen = FIELD_CATALOG.flatMap((b) => b.fields)
    .filter((f) => f.internalOnly)
    .filter((f) => f.measure.kind !== "none" || realColumns.has(f.key))
    .filter((f) => f.niveau !== "nice")
    .map((f) => `${f.key} (${f.niveau}, measure ${f.measure.kind})`);
  expect(overtredingen).toEqual([]);
});

test("laagste-dekking-buckets in gewone taal, met productaantal en percentage", () => {
  const tekst = buildBrandMessage(basis);
  expect(tekst).toContain("Of your 30 products");
  // Fotometrie heeft de laagste dekking (alleen kelvin 3/30) en wordt benoemd.
  expect(tekst).toMatch(/- Photometrics: incomplete for about \d+% of the products\./);
  // Maximaal drie buckets in de lijst.
  expect(tekst.split("\n").filter((r) => r.startsWith("- ")).length)
    .toBeLessThanOrEqual(3);
});

test("alles compleet → compliment i.p.v. missende-data-lijst", () => {
  const tekst = buildBrandMessage({
    ...basis,
    buckets: maakBuckets(allesGevuld(30), 30),
  });
  expect(tekst).toContain("complete");
  expect(tekst).not.toContain("missing data");
  expect(tekst).not.toMatch(/^- /m);
});

test("verwijzing naar het template en afsluiting zijn er altijd", () => {
  for (const input of [basis, { ...basis, productCount: 0, buckets: maakBuckets({}, 0) }]) {
    const tekst = buildBrandMessage(input);
    expect(tekst).toContain("brinklicht-product-data-template.xlsx");
    expect(tekst).toContain("Kind regards,");
  }
});

// DoD (1.6-C): tot nu toe een STILLE afhankelijkheid — dekking() (regel 39-46
// hierboven) telt alleen must+wanna op, en bucket "intern" heeft daar nul velden in
// (de twee wanna-velden zijn beide kind "none", de rest is "nice"). Bucket 11 kan
// daardoor per constructie nooit in `laagste` terechtkomen. Dat gold al vóór 1.6-C
// (de INVARIANT-test hierboven bewaakt de voorwaarde), maar 1.6-C voegt de bucket
// pas expliciet toe aan FIELD_CATALOG — dus dit gedrag verdient nu een eigen,
// zichtbare test i.p.v. alleen af te leiden uit de invariant.
test("DoD 1.6-C: bucket 11 (Internal) komt nooit voor in de merkmail — niet bij 100%, niet bij 0%", () => {
  const internalBucket = FIELD_CATALOG.find((b) => b.key === "intern")!;
  expect(internalBucket.labelEn).toBe("Internal");

  // Alles gevuld, óók de interne velden (allesGevuld() vult elk meetbaar veld, dus
  // ook bucket 11's stock/stock_reserved/show_on_web/show_price_on_web).
  const alles = buildBrandMessage({ ...basis, buckets: maakBuckets(allesGevuld(30), 30) });
  expect(alles).not.toContain(internalBucket.labelEn);
  expect(alles.toLowerCase()).not.toContain("internal");

  // Omgekeerd: alle NIET-interne meetbare velden 100%, bucket 11 juist 0% — de
  // enige echte lacune in de hele catalogus zit dan in bucket 11. De stille
  // afhankelijkheid betekent dat de mail dit toch "complete" noemt: bucket 11
  // telt gewoon nooit mee, hoe leeg hij ook is.
  const filledZonderIntern: Record<string, number> = { ...allesGevuld(30) };
  for (const f of internalBucket.fields) delete filledZonderIntern[f.key];
  const tekstZonderIntern = buildBrandMessage({
    ...basis,
    buckets: maakBuckets(filledZonderIntern, 30),
  });
  expect(tekstZonderIntern).toContain("complete");
  expect(tekstZonderIntern).not.toMatch(/^- /m);
  expect(tekstZonderIntern).not.toContain(internalBucket.labelEn);
  expect(tekstZonderIntern.toLowerCase()).not.toContain("internal");
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
      expect(tekst).not.toContain(f.labelEn.toLowerCase());
    }
    for (const woord of ["purchase price", "discount", "stock"]) {
      expect(tekst).not.toContain(woord);
    }
  }
});
