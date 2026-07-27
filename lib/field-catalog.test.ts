// Field-catalog (merkrelaties stap 1): de catalog is de ÉNE bron van waarheid voor
// scorecard + Excel-template. Kernwaarborgen: 🔒 lekt nooit naar het Excel, en elke
// "meetbare" kolom bestaat écht in het drizzle-schema (geen handgetypte lijst).
import { expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { products } from "@/db/schema";
import { catalogusMet, type EigenVeldDef } from "@/lib/custom-fields";
import {
  FIELD_CATALOG,
  GEEN_REACTIE_DAGEN,
  INTERNAL_BUCKET_KEY,
  bucketScore,
  excelColumns,
  measurableFields,
  scorecardAggregate,
  templateBuckets,
} from "@/lib/field-catalog";

// 11 sinds 1.6-C: de zes 🔒-velden verhuisden uit 2. Commercie naar de nieuwe bucket
// "11. Internal" (besluit G10). Geen veld is toegevoegd of verwijderd — de keys-set
// hieronder is per constructie ongewijzigd; alleen hun bucket is anders.
test("catalog: 11 buckets, oplopende order, unieke veld-keys", () => {
  expect(FIELD_CATALOG).toHaveLength(11);
  expect(FIELD_CATALOG.map((b) => b.order).sort((a, b) => a - b)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
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
  for (const { field } of excelColumns(FIELD_CATALOG)) {
    expect(field.internalOnly).toBe(false);
  }
});

test("meetbare velden: elke measure.column bestaat als échte drizzle-kolom", () => {
  const realColumns = new Set(
    Object.values(getTableColumns(products)).map((c) => c.name),
  );
  for (const { field } of measurableFields(FIELD_CATALOG)) {
    if (field.measure.kind !== "column") throw new Error("onverwacht");
    expect(realColumns, `kolom voor veld ${field.key}`).toContain(
      field.measure.column,
    );
  }
  // K4-mapping: samengestelde plan-velden expliciet gesplitst/gemapt.
  const byKey = new Map(
    FIELD_CATALOG.flatMap((b) => b.fields).map((f) => [f.key, f]),
  );
  // De Engelse velden meten hun EIGEN kolom — niet de NL-hoofdkolom (1.3-A).
  expect(byKey.get("name_en")?.measure).toEqual({ kind: "column", column: "name_en" });
  expect(byKey.get("description_en")?.measure).toEqual({ kind: "column", column: "description_en" });
  expect(byKey.get("dimmable")?.measure).toEqual({ kind: "column", column: "dimmable" });
  expect(byKey.get("dim_protocol")?.measure).toEqual({ kind: "column", column: "dim_protocol" });
  expect(byKey.get("category")?.measure).toEqual({ kind: "column", column: "category_path" });
  expect(byKey.get("list_price_excl_vat")?.measure).toEqual({ kind: "price" });
  // Bucket 9 is sinds 1.3-A volledig meetbaar (0007 legde de url_*-kolommen aan).
  const bucket9 = FIELD_CATALOG.find((b) => b.order === 9)!;
  for (const f of bucket9.fields) {
    expect(f.measure, `bucket 9 veld ${f.key}`).toEqual({
      kind: "column",
      column: f.key,
    });
  }
});

// De converse van de test hierboven. Die toetst één richting — "elke measure.column
// bestaat" — en dáárom kon `name_en: col("name")` jarenlang meelopen: `name` bestáát.
// Deze test toetst de andere richting: bestaat er een products-kolom met exact de
// veld-key als naam, dan MOET het veld die kolom ook meten. Zo dwingt de volgende
// migratie zichzelf af i.p.v. stil te blijven liggen (sprint 1.3-A).
test("REGRESSIE: bestaat products.<key>, dan meet het veld die kolom ook écht", () => {
  const realColumns = new Set(
    Object.values(getTableColumns(products)).map((c) => c.name),
  );
  const overtredingen: string[] = [];
  for (const bucket of FIELD_CATALOG) {
    for (const f of bucket.fields) {
      if (!realColumns.has(f.key)) continue;
      const verwacht = { kind: "column", column: f.key };
      if (JSON.stringify(f.measure) !== JSON.stringify(verwacht)) {
        overtredingen.push(
          `${f.key}: products.${f.key} bestaat, maar measure = ${JSON.stringify(f.measure)}`,
        );
      }
    }
  }
  // Alles ineens, zodat één run élke gemiste kolom laat zien i.p.v. de eerste.
  expect(overtredingen).toEqual([]);
});

test("de 'niet meetbaar'-verzameling is exact twee velden, en die hebben géén kolom", () => {
  const realColumns = new Set(
    Object.values(getTableColumns(products)).map((c) => c.name),
  );
  const none = FIELD_CATALOG.flatMap((b) => b.fields)
    .filter((f) => f.measure.kind === "none")
    .map((f) => f.key);
  expect(none).toEqual(["purchase_price_excl_vat", "brand_discount"]);
  for (const key of none) expect(realColumns.has(key), `kolom ${key}`).toBe(false);
});

test("bucketScore: 0 producten → ratio 0, niets 'filled'", () => {
  const bucket = FIELD_CATALOG.find((b) => b.key === "basis_identiteit")!;
  const score = bucketScore(bucket, {}, 0);
  expect(score.must).toEqual({ filled: 0, total: 3, ratio: 0 }); // sac, name_en, category
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
  const bucket = FIELD_CATALOG.find((b) => b.key === "afmetingen")!; // 4 wanna- + 4 nice-kolommen
  const uiterlijk = FIELD_CATALOG.find((b) => b.key === "uiterlijk")!;
  // uiterlijk: color_1/material_1 (wanna), color_2/material_2 (nice) — sinds 1.3-A
  // zijn alle vier meetbaar, dus nice telt nu wél mee en er is niets grijs meer.
  const score = bucketScore(uiterlijk, { color_2: 10, material_2: 10 }, 10);
  expect(score.must.total).toBe(0);
  expect(score.wanna.ratio).toBe(0);
  expect(score.nice.total).toBe(2);
  expect(score.nice.ratio).toBe(1);
  expect(score.unmeasurable).toBe(0);
  // Geen 90%-knip: 5 van 10 gevuld op één van vier velden = exact 0,125.
  const partial = bucketScore(bucket, { height_cm: 5 }, 10);
  expect(partial.wanna.ratio).toBeCloseTo(5 / 10 / 4, 10);
  expect(partial.wanna.filled).toBe(0);
});

// ── DoD 4c: de afbakening van bucket 11 t.o.v. categorie 1-10 (besluiten G9/G10) ──

test("DoD 4c: categorie 1-10 = excelColumns(FIELD_CATALOG) exact; bucket 11 = precies de zes interne velden, nergens anders", () => {
  const templateKeys = templateBuckets(FIELD_CATALOG).flatMap((b) => b.fields.map((f) => f.key));
  const excelKeys = excelColumns(FIELD_CATALOG).map(({ field }) => field.key);
  expect(templateKeys).toEqual(excelKeys); // zelfde velden, zelfde volgorde
  expect(templateKeys.length).toBe(66); // = excelColumns(FIELD_CATALOG).length, DoD 4c

  const internalBucket = FIELD_CATALOG.find((b) => b.key === INTERNAL_BUCKET_KEY)!;
  expect(internalBucket.fields.map((f) => f.key)).toEqual([
    "purchase_price_excl_vat",
    "brand_discount",
    "stock",
    "stock_reserved",
    "show_on_web",
    "show_price_on_web",
  ]);

  // Geen internalOnly-veld buiten bucket 11.
  for (const bucket of FIELD_CATALOG) {
    if (bucket.key === INTERNAL_BUCKET_KEY) continue;
    for (const f of bucket.fields) {
      expect(f.internalOnly, `${bucket.key}.${f.key}`).toBe(false);
    }
  }

  // templateBuckets(FIELD_CATALOG) bevat bucket 11 niet — hij levert nul 📄-velden.
  expect(templateBuckets(FIELD_CATALOG).some((b) => b.bucket.key === INTERNAL_BUCKET_KEY)).toBe(false);
});

// ── DoD 4d/4e: scorecardAggregate op de ZZTEST QA-15-fixture (21 jul, live gemeten) ──
//
// 3 producten, ongelijk gevuld (zie FASE1-BEVINDINGEN §5):
//   supplier_article_code 3, ean_code 3, name_en 3, category 3 (alle bucket 1)
//   sdcm 3, ugr 2 (bucket 6 fotometrie) · ik_rating 1 (bucket 8) · url_datasheet 3
//   (bucket 9) · list_price_excl_vat 2 (bucket 2 commercie) · verder alles 0.
const QA15_PRODUCT_COUNT = 3;
const QA15_FILLED: Record<string, number> = {
  supplier_article_code: 3,
  ean_code: 3,
  name_en: 3,
  category: 3,
  sdcm: 3,
  ugr: 2,
  ik_rating: 1,
  url_datasheet: 3,
  list_price_excl_vat: 2,
};

test("scorecardAggregate: QA-15-fixture met de hand nagerekend (categorieën + totalen)", () => {
  const agg = scorecardAggregate(QA15_FILLED, QA15_PRODUCT_COUNT, FIELD_CATALOG);
  const byKey = Object.fromEntries(agg.categories.map((c) => [c.bucketKey, c]));

  // 1. Basis & identiteit (8 velden: must sac/name_en/category, wanna description_en/
  //    etim_class, nice ean_code/family/designer). Gevuld: sac 3/3, ean 3/3, name_en
  //    3/3, category 3/3 → coverageSum = 1+1+1+1 = 4, over 8 velden → 0,5.
  expect(byKey.basis_identiteit.coverageSum).toBeCloseTo(4, 10);
  expect(byKey.basis_identiteit.measurableFields).toBe(8);
  expect(byKey.basis_identiteit.ratio).toBeCloseTo(0.5, 10);

  // 2. Commercie (1 veld, must, na de verhuizing): list_price_excl_vat 2/3.
  expect(byKey.commercie.measurableFields).toBe(1);
  expect(byKey.commercie.ratio).toBeCloseTo(2 / 3, 10);

  // 6. Fotometrie (11 velden, geen must): sdcm 3/3=1, ugr 2/3 → coverageSum = 1 + 2/3
  //    = 5/3, over 11 velden → 5/33 ≈ 0,1515.
  expect(byKey.fotometrie.coverageSum).toBeCloseTo(5 / 3, 10);
  expect(byKey.fotometrie.measurableFields).toBe(11);
  expect(byKey.fotometrie.ratio).toBeCloseTo(5 / 33, 10);

  // 8. Bescherming & conformiteit (8 velden): ik_rating 1/3, coverageSum = 1/3, over
  //    8 velden → 1/24 ≈ 0,0417.
  expect(byKey.bescherming_conformiteit.coverageSum).toBeCloseTo(1 / 3, 10);
  expect(byKey.bescherming_conformiteit.ratio).toBeCloseTo(1 / 24, 10);

  // 9. Documentatie/links (5 velden): url_datasheet 3/3=1, coverageSum=1, over 5 → 0,2.
  expect(byKey.documentatie_links.coverageSum).toBeCloseTo(1, 10);
  expect(byKey.documentatie_links.ratio).toBeCloseTo(0.2, 10);

  // Ongewijzigde categorieën (3, 4, 5, 7, 10): niets gevuld → ratio 0.
  for (const key of ["afmetingen", "uiterlijk", "lichtbron_fitting", "elektrisch_driver", "duurzaamheid_milieu"]) {
    expect(byKey[key].ratio, key).toBe(0);
    expect(byKey[key].coverageSum, key).toBe(0);
  }

  // Drie totalen over categorie 1-10 SAMEN (G11), niet het gemiddelde van tien
  // categorie-ratio's:
  //   must:  velden = sac/name_en/category (bucket 1) + list_price (bucket 2) = 4;
  //          coverageSum = 1+1+1 + 2/3 = 11/3 → ratio 11/12 ≈ 0,9167.
  //   wanna: 43 velden totaal; coverageSum = sdcm(1) + ugr(2/3) + ik_rating(1/3) +
  //          url_datasheet(1) = 3 → ratio 3/43 ≈ 0,0698.
  //   nice:  19 velden totaal; coverageSum = ean_code(1) = 1 → ratio 1/19 ≈ 0,0526.
  expect(agg.totals.must.measurableFields).toBe(4);
  expect(agg.totals.must.coverageSum).toBeCloseTo(11 / 3, 10);
  expect(agg.totals.must.ratio).toBeCloseTo(11 / 12, 10);
  expect(agg.totals.wanna.measurableFields).toBe(43);
  expect(agg.totals.wanna.coverageSum).toBeCloseTo(3, 10);
  expect(agg.totals.wanna.ratio).toBeCloseTo(3 / 43, 10);
  expect(agg.totals.nice.measurableFields).toBe(19);
  expect(agg.totals.nice.coverageSum).toBeCloseTo(1, 10);
  expect(agg.totals.nice.ratio).toBeCloseTo(1 / 19, 10);

  // DoD 4c naast elkaar: template vs. gescoord.
  expect(agg.templateFieldCount).toBe(66);
  expect(agg.scoredFieldCount).toBe(66);
  expect(agg.scoredFieldCount).toBe(agg.templateFieldCount);

  // Categorie 11 (Internal) is aanwezig maar telt niet mee: alles 0 in deze fixture,
  // en inTotals is false.
  const internal = byKey[INTERNAL_BUCKET_KEY];
  expect(internal.inTotals).toBe(false);
  expect(internal.order).toBe(11);
});

test("scorecardAggregate: 0 producten → alle ratio's en coverageSums 0, veldentelling blijft staan", () => {
  const agg = scorecardAggregate({}, 0, FIELD_CATALOG);
  expect(agg.hasProducts).toBe(false);
  for (const c of agg.categories) {
    expect(c.ratio, c.bucketKey).toBe(0);
    expect(c.coverageSum, c.bucketKey).toBe(0);
    for (const f of c.fields) {
      if (f.measurable) expect(f.ratio, f.key).toBe(0);
      else expect(f.ratio, f.key).toBeNull();
    }
  }
  expect(agg.totals.must.ratio).toBe(0);
  expect(agg.totals.wanna.ratio).toBe(0);
  expect(agg.totals.nice.ratio).toBe(0);
  expect(agg.totals.must.coverageSum).toBe(0);
  // De veldentelling zelf is geen dekking — die blijft ongeacht productCount.
  expect(agg.totals.must.measurableFields).toBe(4);
  expect(agg.templateFieldCount).toBe(66);
  expect(agg.scoredFieldCount).toBe(66);
});

test("ANTI-VAL (G12): totals.must.ratio is NIET het gemiddelde van de tien categorie-must-ratio's", () => {
  const agg = scorecardAggregate(QA15_FILLED, QA15_PRODUCT_COUNT, FIELD_CATALOG);
  const categorieRatiosMust = agg.categories
    .filter((c) => c.inTotals)
    .map((c) => c.perNiveau.must.ratio);
  expect(categorieRatiosMust).toHaveLength(10);
  const naiefGemiddelde =
    categorieRatiosMust.reduce((a, b) => a + b, 0) / categorieRatiosMust.length;
  // Naief (fout, categoriegewogen): (1 + 2/3 + 0×8) / 10 = 1/6 ≈ 0,1667.
  expect(naiefGemiddelde).toBeCloseTo(1 / 6, 10);
  // Correct (veldgewogen, G12): 11/12 ≈ 0,9167 — een heel ander getal.
  expect(agg.totals.must.ratio).toBeCloseTo(11 / 12, 10);
  expect(agg.totals.must.ratio).not.toBeCloseTo(naiefGemiddelde, 2);
});

test("G11: een intern veld (bucket 11) vullen verandert totals en scoredFieldCount NIET", () => {
  const zonder = scorecardAggregate(QA15_FILLED, QA15_PRODUCT_COUNT, FIELD_CATALOG);
  const met = scorecardAggregate(
    { ...QA15_FILLED, stock: 3, show_on_web: 2 },
    QA15_PRODUCT_COUNT,
    FIELD_CATALOG,
  );
  expect(met.totals).toEqual(zonder.totals);
  expect(met.scoredFieldCount).toBe(zonder.scoredFieldCount);
  expect(met.templateFieldCount).toBe(zonder.templateFieldCount);
  // Ter controle: bucket 11 zelf verandert wél.
  const internalZonder = zonder.categories.find((c) => c.bucketKey === INTERNAL_BUCKET_KEY)!;
  const internalMet = met.categories.find((c) => c.bucketKey === INTERNAL_BUCKET_KEY)!;
  expect(internalMet.coverageSum).toBeGreaterThan(internalZonder.coverageSum);
});

// ── Sprint 1.8: eigen velden mengen mee zonder tweede indeling ────────────────
//
// De converse-test hierboven heeft GEEN uitzondering voor products.custom_values nodig en
// krijgt die ook niet: hij itereert FIELD_CATALOG en slaat elke key over die geen
// products-kolomnaam is. `custom_values` is wél een kolom, maar er is geen catalogusVELD met
// die key — er valt dus niets te overtreden. Een uitzonderingslijst zou hier de eerste
// scheur zijn waardoor de volgende gemiste kolom alsnog stil wegvalt.

const EIGEN: EigenVeldDef = {
  id: "11111111-1111-4111-8111-111111111111",
  labelEn: "Recycled content (%)",
  instructionEn: "Share of recycled material in percent, e.g. 35.",
  niveau: "wanna",
  bucketKey: "duurzaamheid_milieu",
  createdAt: "2026-07-21T10:00:00.000Z",
  archivedAt: null,
};

test("1.8: een eigen veld komt in excelColumns, achteraan zijn eigen bucket", () => {
  const cat = catalogusMet([EIGEN]);
  const keys = excelColumns(cat).map(({ field }) => field.key);
  expect(keys).toHaveLength(67);
  expect(keys.at(-1)).toBe("custom:" + EIGEN.id); // bucket 10 is de laatste 📄-bucket
  // Het vaste deel blijft ongemoeid: FIELD_CATALOG is niet gemuteerd.
  expect(excelColumns(FIELD_CATALOG)).toHaveLength(66);
});

test("1.8: gearchiveerd eigen veld verdwijnt uit de catalogus", () => {
  const cat = catalogusMet([{ ...EIGEN, archivedAt: "2026-07-22T09:00:00.000Z" }]);
  expect(excelColumns(cat)).toHaveLength(66);
});

test("1.8: een eigen veld is meetbaar en telt mee in de scorecard-noemer", () => {
  const cat = catalogusMet([EIGEN]);
  const key = "custom:" + EIGEN.id;

  // measurableFields() levert het veld met een custom-meting — geen kolomnaam, dus niets
  // dat als identifier in de SQL kan belanden.
  const meetbaar = measurableFields(cat).find(({ field }) => field.key === key);
  expect(meetbaar?.field.measure).toEqual({ kind: "custom", fieldId: EIGEN.id });

  // Het invariant van 1.6-C blijft staan: wat we in het Excel vragen is exact wat we scoren.
  const agg = scorecardAggregate({ ...QA15_FILLED, [key]: 2 }, QA15_PRODUCT_COUNT, cat);
  expect(agg.templateFieldCount).toBe(67);
  expect(agg.scoredFieldCount).toBe(agg.templateFieldCount);

  // En hij landt in de categorie van zijn bucket, niet in een elfde categorie.
  const duurzaamheid = agg.categories.find((c) => c.bucketKey === "duurzaamheid_milieu")!;
  expect(duurzaamheid.fields.map((f) => f.key)).toContain(key);
  expect(agg.categories).toHaveLength(11);

  // Veldgewogen (G12): het eigen veld voegt 2/3 aan de wanna-som toe en één aan de noemer.
  const zonder = scorecardAggregate(QA15_FILLED, QA15_PRODUCT_COUNT, FIELD_CATALOG);
  expect(agg.totals.wanna.measurableFields).toBe(zonder.totals.wanna.measurableFields + 1);
  expect(agg.totals.wanna.coverageSum).toBeCloseTo(zonder.totals.wanna.coverageSum + 2 / 3, 10);
});

test("1.8: een eigen veld kan nooit in bucket 11 belanden (CHECK in 0015 + hier zichtbaar)", () => {
  // catalogusMet plaatst puur op bucketKey; de database weigert 'intern' al bij het
  // aanmaken. Deze test legt vast wat er zou gebeuren als die CHECK ooit sneuvelt: het veld
  // zou in de niet-meegewogen categorie 11 verdwijnen — zichtbaar, maar buiten de totalen.
  const cat = catalogusMet([{ ...EIGEN, bucketKey: INTERNAL_BUCKET_KEY }]);
  expect(excelColumns(cat)).toHaveLength(67); // inExcel:true trekt hem tóch het Excel in
  const agg = scorecardAggregate({}, 0, cat);
  // …en dán komt bucket 11 TWEE KEER in de scorecard: één keer via templateBuckets()
  // (want hij levert nu een 📄-veld) en één keer als de vaste, niet-meegewogen categorie 11.
  // Dat is de schade die de CHECK in migratie 0015 voorkomt.
  const internCategorieen = agg.categories.filter(
    (c) => c.bucketKey === INTERNAL_BUCKET_KEY,
  );
  expect(internCategorieen).toHaveLength(2);
  expect(internCategorieen.map((c) => c.inTotals)).toEqual([true, false]);
});
