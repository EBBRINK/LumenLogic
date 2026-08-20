// B4 (reviewzwerm 2.5a): de merken-keuzelijst van /catalog kwam uit een DISTINCT over
// visible_products — 210k rijen door een hash join, bij élk bezoek, voor 30 namen. De
// query is vervangen door een semi-join op products + prices + price_lists.
//
// WAT DEZE TESTS BEWAKEN, in volgorde van belang:
//  1. De VERZAMELING is identiek aan die van visible_products. Dát is de hoofdassertie —
//     de keuzelijst mag nooit een eigen mening krijgen over wie zichtbaar is.
//     ⚠️ Sinds 0022 (19 aug 2026) luidt regel 3 "verlopen prijslijst = zichtbaar zonder
//     prijs", dus een merk met een verlopen lijst hóórt er nu IN te staan. Wat níét mag
//     terugkomen is een merk zonder enig prijsspoor of met alleen een toekomstige lijst.
//  2. De lijst wordt niet meer uit de brede prijs-view gehaald (de dure scan die
//     onvoorwaardelijk draaide).
// De referentietest (1) draait beide queries naast elkaar op dezelfde database, zodat
// "identiek" gemeten wordt en niet beweerd.
import { asc, sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb, seedBrand, seedBrandProduct } from "@/db/test-db";
import { visibleProducts } from "@/db/schema";
import { catalogBrandsQuery, listCatalogBrands } from "@/lib/repo/catalog";

// De oude implementatie, letterlijk zoals hij in app/catalog/page.tsx stond. Blijft hier
// staan als referentie-orakel: de nieuwe query moet er exact hetzelfde uitkomen.
async function oudeMerkenlijst(db: Awaited<ReturnType<typeof createTestDb>>) {
  const rows = await db
    .selectDistinct({ brandName: visibleProducts.brandName })
    .from(visibleProducts)
    .orderBy(asc(visibleProducts.brandName));
  return rows.map((r) => r.brandName).filter((b): b is string => Boolean(b));
}

test("regel 3: een verlopen prijslijst houdt het merk in de keuzelijst, een toekomstige niet", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "Flos",
    name: "Sasso 100",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });
  await seedBrandProduct(db, {
    brand: "Artemide",
    name: "Tolomeo",
    // Prijslijst is verlopen → het product blijft vindbaar (zonder prijs), dus het merk
    // moet ook te kiezen zijn. Anders kun je niet filteren naar wat je juist zoekt.
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });
  await seedBrandProduct(db, {
    brand: "Toekomst",
    name: "Nog niet geldig",
    // Nog niet begonnen — de andere kant van hetzelfde venster.
    validFrom: "2999-01-01",
    validUntil: "2999-12-31",
  });
  // Merkrij zonder producten en zonder prijslijst: bestaat wél, hoort er niet in.
  await seedBrand(db, "Zonder Producten");

  const merken = await listCatalogBrands(db);

  expect(merken).toContain("Flos");
  expect(merken).toContain("Artemide"); // ← de omkering: verlopen is vindbaar
  expect(merken).not.toContain("Toekomst"); // nog niet begonnen ≠ vervallen
  expect(merken).not.toContain("Zonder Producten");
  expect(merken).toEqual(["Artemide", "Flos"]);
});

test("de nieuwe query geeft exact dezelfde verzameling als DISTINCT over visible_products", async () => {
  const db = await createTestDb();
  // Een gemengde catalogus: geldig, verlopen, toekomstig, meerdere producten per merk,
  // en een merk waarvan één product wél en één product géén geldige prijs heeft.
  await seedBrandProduct(db, { brand: "Zumtobel", name: "Panos", validUntil: "2999-12-31" });
  await seedBrandProduct(db, { brand: "XAL", name: "Move it", validUntil: "2999-12-31" });
  await seedBrandProduct(db, { brand: "Bega", name: "Boom", validUntil: "2020-01-02", validFrom: "2020-01-01" });
  await seedBrandProduct(db, { brand: "Delta Light", name: "Boxy", validUntil: "2999-12-31" });
  await seedBrandProduct(db, { brand: "Delta Light", name: "Boxy XL", validUntil: "2020-01-02", validFrom: "2020-01-01" });
  await seedBrand(db, "Kaal Merk");

  const nieuw = await listCatalogBrands(db);
  const oud = await oudeMerkenlijst(db);

  expect(nieuw).toEqual(oud);
  // En het is geen lege-vs-lege vergelijking: er staat echt wat in, Bega inbegrepen —
  // dat merk heeft alleen een verlopen lijst en is sinds 0022 vindbaar zónder prijs.
  expect(oud.length).toBeGreaterThan(0);
  expect(nieuw).toContain("Bega");
  expect(nieuw).not.toContain("Kaal Merk"); // geen product, geen prijsspoor
  // "Delta Light" heeft één geldig en één verlopen product → precies één keer in de lijst.
  expect(nieuw.filter((m) => m === "Delta Light")).toHaveLength(1);
});

// ⚠️ De datums komen UIT DE DATABASE, niet uit JavaScript. `new Date().toISOString()`
// geeft UTC: draai de test in Amsterdam op 23:30 zomertijd en "vandaag" is daar al
// morgen. Dan meet de test de tijdzone van de testrunner in plaats van de query —
// precies de valkuil op een grensdatumtest. `current_date` is bovendien exact wat
// zowel de view als de EXISTS-poort zelf gebruikt.
async function dagen(db: Awaited<ReturnType<typeof createTestDb>>) {
  const res = await db.execute(sql`
    select (current_date - 1)::text as gisteren,
           current_date::text        as vandaag,
           (current_date + 1)::text  as morgen
  `);
  const rows = (
    Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
  ) as { gisteren: string; vandaag: string; morgen: string }[];
  return rows[0];
}

test("grensdatum: vandaag aflopen of vandaag beginnen is nog zichtbaar, gisteren en morgen niet", async () => {
  // De vier tests die de keuzelijst hadden zaaiden alleen 2020 en 2999 — ver van de
  // grens. Daardoor bleef `>=` → `>` op valid_until groen (een merk waarvan de
  // prijslijst vandaag afloopt zou een dag te vroeg verdwijnen) en bleef het
  // wegvallen van valid_from <= current_date óók groen (geen toekomstige lijst op de
  // grens). Deze test zet alle vier de randen precies op de dag.
  const db = await createTestDb();
  const { gisteren, vandaag, morgen } = await dagen(db);

  // Gisteren afgelopen → verlopen, dus zichtbaar zónder prijs (regel 3 sinds 0022).
  await seedBrandProduct(db, {
    brand: "Gisteren Af",
    name: "Verlopen",
    validFrom: "2020-01-01",
    validUntil: gisteren,
  });
  // Vandaag afgelopen → de LAATSTE geldige dag. valid_until >= current_date, dus
  // zichtbaar. Dit is de rand die `>` zou wegsnijden.
  await seedBrandProduct(db, {
    brand: "Vandaag Af",
    name: "Laatste dag",
    validFrom: "2020-01-01",
    validUntil: vandaag,
  });
  // Vandaag begonnen → de EERSTE geldige dag. valid_from <= current_date, dus zichtbaar.
  await seedBrandProduct(db, {
    brand: "Vandaag Begonnen",
    name: "Eerste dag",
    validFrom: vandaag,
    validUntil: "2999-12-31",
  });
  // Morgen beginnend → nog niet geldig. Dit is de rand die wegvalt zodra de
  // valid_from-conditie uit de EXISTS verdwijnt — en het is óók de rand die 0022 niet mocht
  // meenemen: een prijs die eraan komt is geen verval, dus daar valt niets over te melden.
  await seedBrandProduct(db, {
    brand: "Morgen Begint",
    name: "Nog niet",
    validFrom: morgen,
    validUntil: "2999-12-31",
  });

  const nieuw = await listCatalogBrands(db);
  const oud = await oudeMerkenlijst(db);

  // De hoofdassertie: exact dezelfde semantiek als de view, óók op de grensdagen.
  expect(nieuw).toEqual(oud);
  // En expliciet, zodat een falende run meteen zegt wélke rand gesneuveld is. "Gisteren Af"
  // staat er sinds 0022 bij; "Morgen Begint" nog steeds niet.
  expect(nieuw).toEqual(["Gisteren Af", "Vandaag Af", "Vandaag Begonnen"]);
});

test("de keuzelijst komt niet meer uit de brede prijs-view", async () => {
  const db = await createTestDb();
  // De dure scan die bij élk bezoek aan /catalog draaide: DISTINCT over visible_products,
  // de view die products ⨝ prices ⨝ price_lists met ~30 kolommen assembleert. Zodra deze
  // query die view weer aanraakt is B4 terug — aan een keuzelijst valt daar niets te
  // verdienen. De poort van regel 3 moet er wél in staan, als semi-join.
  const { sql } = catalogBrandsQuery(db).toSQL();
  expect(sql).not.toContain("visible_products");
  expect(sql.toLowerCase()).toContain("exists");
  expect(sql).toContain("price_lists");
  // valid_from blijft: een toekomstige lijst is geen verval (zie de kop van 0022).
  expect(sql).toContain("current_date");
  // …en het archief is de tweede helft van de view: uit de lijst gevallen, wél bekend.
  expect(sql).toContain("prices_archive");
});
