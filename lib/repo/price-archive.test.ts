// Prijslijst-vervanging + archief (plan-datamodel-productspecs, laag 3) op PGlite. Bewijst:
//   • archivePriceList verplaatst prijsregels naar archive.prices_archive (hot tabel leeg).
//   • replacePriceList archiveert de oude lijst en maakt de nieuwe actief — de partiële
//     unique (één ACTIEVE lijst per merk) staat twee lijsten toe zodra één vervangen is.
//   • Regel 3 blijft: na vervanging is het product via de nieuwe lijst weer zichtbaar.
//   • De unieke natuurlijke sleutel (brand_id, supplier_article_code) weigert duplicaten.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import {
  events,
  prices,
  pricesArchive,
  priceLists,
  products,
  visibleProducts,
} from "@/db/schema";
import {
  archivePriceList,
  extendPriceListValidity,
  PriceListConflictError,
  replacePriceList,
  upsertPriceLines,
} from "@/lib/repo/price-archive";
import { listPriceListStatus } from "@/lib/repo/enrichment";

test("archivePriceList: prijsregels verhuizen naar het archief, lijst wordt vervangen-gemarkeerd", async () => {
  const db = await createTestDb();
  const { priceListId, productId, brandId } = await seedBrandProduct(db, {
    brand: "Flos Architectural",
    name: "Find me 0 spot",
    price: "196.00",
  });

  const { archivedCount } = await archivePriceList(db, priceListId, "test@brink");
  expect(archivedCount).toBe(1);

  // hot tabel leeg, archief gevuld met herkomst-metadata
  const hot = await db.select().from(prices).where(eq(prices.priceListId, priceListId));
  expect(hot).toHaveLength(0);
  const cold = await db.select().from(pricesArchive);
  expect(cold).toHaveLength(1);
  expect(cold[0].productId).toBe(productId);
  expect(cold[0].brandId).toBe(brandId);
  expect(cold[0].grossPrice).toBe("196.00");
  expect(cold[0].archivedBy).toBe("test@brink");

  // lijst-metadata blijft (offertes verwijzen ernaar), maar is niet meer actief
  const [list] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(list.replacedAt).not.toBeNull();
});

test("replacePriceList: oude lijst → archief, nieuwe lijst actief; twee lijsten per merk mag nu", async () => {
  const db = await createTestDb();
  const { priceListId: oldList, productId, brandId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    price: "310.00",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  });

  const { priceListId: newList, archivedCount } = await replacePriceList(
    db,
    brandId,
    { name: "Prijslijst 2027", validFrom: "2027-01-01", validUntil: "2027-12-31" },
    "test@brink",
  );
  expect(archivedCount).toBe(1);
  expect(newList).not.toBe(oldList);

  // beide lijst-rijen bestaan; alleen de nieuwe is actief
  const lists = await db.select().from(priceLists).where(eq(priceLists.brandId, brandId));
  expect(lists).toHaveLength(2);
  expect(lists.find((l) => l.id === oldList)?.replacedAt).not.toBeNull();
  expect(lists.find((l) => l.id === newList)?.replacedAt).toBeNull();

  // nieuwe prijs opvoeren voor hetzelfde product → weer precies één hot prijsregel
  await db.insert(prices).values({ productId, priceListId: newList, grossPrice: "325.00" });
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot).toHaveLength(1);
  expect(hot[0].grossPrice).toBe("325.00");
});

// ── upsertPriceLines: regel-niveau bijwerking (sprint 1.2, plan besluit 1) ────

test("upsertPriceLines: gewijzigde regel archiveert de oude prijs en werkt bij", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Flos Architectural",
    name: "Find me 0 spot",
    price: "196.00",
  });

  const res = await upsertPriceLines(
    db,
    brandId,
    [{ productId, grossPrice: "210.00" }],
    { actor: "test@brink" },
  );
  expect(res).toMatchObject({
    priceListId,
    inserted: 0,
    updated: 1,
    archivedLines: 1,
  });

  // Hot: de nieuwe prijs, op dezelfde (actieve) lijst — geen tweede lijst.
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot).toHaveLength(1);
  expect(hot[0].grossPrice).toBe("210.00");
  expect(hot[0].priceListId).toBe(priceListId);

  // Koud: de oude prijs met de geldigheid van de LIJST waaronder hij gold.
  const cold = await db.select().from(pricesArchive);
  expect(cold).toHaveLength(1);
  expect(cold[0].grossPrice).toBe("196.00");
  expect(cold[0].validUntil).toBe("2999-12-31");
  expect(cold[0].archivedBy).toBe("test@brink");
});

test("upsertPriceLines: gelijke regel is een no-op — geen archiefrij (dit ís de idempotentie)", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    price: "310.00",
  });

  // "310" i.p.v. "310.00": numeric(12,2) geeft "310.00" terug waar de diff "310" aanlevert.
  // Tekstvergelijking zou hier een archiefrij schrijven voor een prijs die niet veranderde.
  const res = await upsertPriceLines(db, brandId, [{ productId, grossPrice: "310" }], {});
  expect(res).toMatchObject({ inserted: 0, updated: 0, archivedLines: 0 });
  expect(await db.select().from(pricesArchive)).toHaveLength(0);
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot[0].grossPrice).toBe("310.00");
});

test("upsertPriceLines: geen actieve lijst + newList → lijst aangemaakt, regel ingevoegd", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 40",
    price: "150.00",
  });
  // Merk zonder ACTIEVE lijst: de bestaande lijst archiveren maakt hem replaced.
  await archivePriceList(db, priceListId, "test@brink");

  const res = await upsertPriceLines(
    db,
    brandId,
    [{ productId, grossPrice: "160.00" }],
    {
      newList: { name: "Prijslijst 2027", validFrom: "2027-01-01", validUntil: "2027-12-31" },
      actor: "test@brink",
    },
  );
  expect(res.priceListId).not.toBe(priceListId);
  expect(res).toMatchObject({ inserted: 1, updated: 0, archivedLines: 0 });

  const lijsten = await db.select().from(priceLists).where(eq(priceLists.brandId, brandId));
  expect(lijsten.filter((l) => l.replacedAt === null)).toHaveLength(1);
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).toContain("price_list_created");
});

test("upsertPriceLines: geen actieve lijst en geen newList → Error (nooit een datum verzinnen)", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart Cake",
    price: "99.00",
  });
  await archivePriceList(db, priceListId);

  // valid_until drijft ijzeren regel 3: een gegokte einddatum maakt óf te vroeg alles
  // onzichtbaar óf houdt een verlopen lijst kunstmatig geldig.
  await expect(
    upsertPriceLines(db, brandId, [{ productId, grossPrice: "99.00" }], {}),
  ).rejects.toThrow(/no active price list/);
});

test("DE HAZARD-TEST: upsert van 1 van 3 producten laat de andere 2 zichtbaar — nooit replacePriceList", async () => {
  const db = await createTestDb();
  // Een merk met drie producten op één geldige lijst. Het merk stuurt een template terug met
  // maar één regel — een geldig bestand dat nooit beweerde volledig te zijn.
  const { brandId, priceListId, productId: eerste } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
    price: "100.00",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 52", price: "120.00" });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 66", price: "140.00" });

  const voor = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(voor).toHaveLength(3);

  await upsertPriceLines(db, brandId, [{ productId: eerste, grossPrice: "110.00" }], {
    actor: "test@brink",
  });

  // Dít is de hazard: replacePriceList zou de andere twee prijsregels archiveren en die
  // producten via visible_products onzichtbaar maken (ijzeren regel 3) — schade uit een
  // bestand dat 1 van 3 producten bevatte.
  const na = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(na, "de onaangeraakte producten mogen NOOIT uit visible_products vallen").toHaveLength(3);
  expect(na.find((p) => p.id === eerste)?.grossPrice).toBe("110.00");

  // En er is geen prijslijst gearchiveerd: op dit pad vuurt price_list_archived per definitie
  // nooit. Het analoge spoor is price_lines_upserted.archivedLines + de archiefrijen.
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).not.toContain("price_list_archived");
  expect(acties).toContain("price_lines_upserted");
  expect(await db.select().from(pricesArchive)).toHaveLength(1);
  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.replacedAt).toBeNull();
});

// ── extendPriceListValidity: het retourpad van ijzeren regel 3 (bevinding B3) ─
// Regel 3 werkte tot nu toe maar één kant op: een verlopen lijst haalde de producten uit
// visible_products, en er was geen enkele code die de einddatum vooruit kon zetten — terwijl
// het scherm letterlijk om een "extension" vraagt. Deze tests leggen de terugweg vast.

/** Datum n dagen vanaf nu als 'YYYY-MM-DD' (UTC) — de tests draaien tegen de échte
 *  CURRENT_DATE van PGlite, dus vaste toekomstdatums zouden ooit verlopen. */
function overDagen(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

test("DE BEWIJSTEST: verlopen lijst verlengen geeft de producten hun prijs terug (regel 3, terug)", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId } = await seedBrandProduct(db, {
    brand: "Occhio",
    name: "Mito Sospeso",
    price: "845.00",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31", // verlopen: valid_until < CURRENT_DATE
  });

  // Uitgangspunt = ijzeren regel 3 in zijn nieuwe formulering (migratie 0022): het product
  // is wél te vinden, maar er hangt geen bedrag aan. Vóór 0022 stond hier `toHaveLength(0)`;
  // wat de verlenging repareert is sindsdien de PRIJS, niet het bestaan.
  const voor = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(voor, "verlopen prijslijst laat het product staan").toHaveLength(1);
  expect(voor[0].priceState).toBe("prijslijst_verlopen");
  expect(
    voor[0].grossPrice,
    "een bedrag uit een verlopen lijst mag nergens naar buiten komen",
  ).toBeNull();

  const nieuweDatum = overDagen(365);
  const bijgewerkt = await extendPriceListValidity(
    db,
    { priceListId, validUntil: nieuweDatum, actor: "test@brink" },
  );
  expect(bijgewerkt.validUntil).toBe(nieuweDatum);
  expect(bijgewerkt.id).toBe(priceListId); // dezelfde lijst, geen opvolger

  // En dít is wat er niet bestond: de prijs is terug.
  const na = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(na).toHaveLength(1);
  expect(na[0].id).toBe(productId);
  expect(na[0].priceState).toBe("actueel");
  expect(na[0].grossPrice).toBe("845.00");

  // Geen archief-bijwerking: de prijsregels bewegen niet bij een verlenging.
  expect(await db.select().from(pricesArchive)).toHaveLength(0);
  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.replacedAt).toBeNull();
});

test("extendPriceListValidity: logt price_list_extended met de oude én de nieuwe datum", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 40",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });

  const nieuweDatum = overDagen(90);
  await extendPriceListValidity(db, {
    priceListId,
    validUntil: nieuweDatum,
    actor: "test@brink",
  });

  const gelogd = (await db.select().from(events)).filter(
    (e) => e.action === "price_list_extended",
  );
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].entity).toBe("price_list");
  expect(gelogd[0].entityId).toBe(priceListId);
  expect(gelogd[0].actor).toBe("test@brink");
  // previousValidUntil is dragend: zonder de oude datum is achteraf niet te zien of dit
  // een verlenging van een week of van vijf jaar was.
  expect(gelogd[0].payload).toMatchObject({
    brandId,
    name: "Prijslijst Kreon",
    previousValidUntil: "2020-12-31",
    validUntil: nieuweDatum,
  });
});

test("extendPriceListValidity: datum in het verleden → geweigerd (de lijst blijft verlopen)", async () => {
  const db = await createTestDb();
  const { priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });

  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: overDagen(-1) }),
  ).rejects.toMatchObject({ reason: "date_in_past" });

  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.validUntil).toBe("2020-12-31");
  expect(await db.select().from(events)).toHaveLength(0);
});

test("extendPriceListValidity: niet later dan de huidige einddatum → geweigerd (verkorten is een andere handeling)", async () => {
  const db = await createTestDb();
  const { priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });

  // Een datum in de toekomst, maar vóór de huidige einddatum: verkorten haalt producten
  // uit de matcher (regel 3) en mag nooit uit een knop rollen die "extend" heet.
  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: "2100-01-01" }),
  ).rejects.toMatchObject({ reason: "not_later" });
  // Ook exact dezelfde datum is geen verlenging.
  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: "2999-12-31" }),
  ).rejects.toMatchObject({ reason: "not_later" });

  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.validUntil).toBe("2999-12-31");
});

test("extendPriceListValidity: vervangen lijst → geweigerd (zijn prijsregels staan in het archief)", async () => {
  const db = await createTestDb();
  const { priceListId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart Cake",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });
  await archivePriceList(db, priceListId, "test@brink");

  // Verlengen zou geldigheid beloven voor prijzen die niet meer in `prices` staan: een
  // lege lijst met een groene datum. Zo'n merk heeft een nieuwe lijst nodig, geen datum.
  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: overDagen(180) }),
  ).rejects.toMatchObject({ reason: "archived" });

  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.validUntil).toBe("2020-12-31");
});

test("extendPriceListValidity: onbekende lijst en onzin-datum → geweigerd met hun eigen reden", async () => {
  const db = await createTestDb();
  await expect(
    extendPriceListValidity(db, {
      priceListId: crypto.randomUUID(),
      validUntil: overDagen(30),
    }),
  ).rejects.toMatchObject({ reason: "unknown_list" });

  const { priceListId } = await seedBrandProduct(db, {
    brand: "Flos Architectural",
    name: "Find me 0 spot",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });
  // 31 februari bestaat niet; de DB zou er stil iets anders van maken.
  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: "2027-02-31" }),
  ).rejects.toMatchObject({ reason: "invalid_date" });
  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: "31-12-2027" }),
  ).rejects.toMatchObject({ reason: "invalid_date" });
});

test("extendPriceListValidity: datum vóór valid_from → geweigerd (de view zou de producten alsnog verbergen)", async () => {
  const db = await createTestDb();
  // Kapotte brondata: een lijst die pas over jaren begint en al verlopen is.
  const { priceListId } = await seedBrandProduct(db, {
    brand: "Itre",
    name: "Fastill",
    validFrom: "2090-01-01",
    validUntil: "2020-12-31",
  });

  await expect(
    extendPriceListValidity(db, { priceListId, validUntil: overDagen(30) }),
  ).rejects.toMatchObject({ reason: "before_start" });
});

test("extendPriceListValidity: lijst die nog niet begonnen is → geweigerd, óók met een datum ná valid_from", async () => {
  // Het gat dat 'before_start' NIET dekte. De view eist twee dingen
  // (db/migrations/0004_vijfstatussen.sql): valid_from <= CURRENT_DATE ÉN
  // valid_until >= CURRENT_DATE. Een einddatum ná valid_from glipte langs de
  // before_start-guard, de UPDATE ging door en het scherm meldde groen "Its products are
  // back in the matcher" — terwijl visible_products nul rijen bleef geven omdat de lijst
  // pas in 2090 begint. Precies het soort leugen dat de knop onbetrouwbaar maakt.
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Itre",
    name: "Fastill",
    price: "120.00",
    validFrom: "2090-01-01",
    validUntil: "2020-12-31",
  });

  const voor = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(voor).toHaveLength(0);

  await expect(
    // 2095 ligt ná valid_from (2090), dus before_start vuurt hier niet.
    extendPriceListValidity(db, { priceListId, validUntil: "2095-01-01" }),
  ).rejects.toMatchObject({ reason: "not_started" });

  // Niets geschreven: dezelfde einddatum, geen event, en het product blijft onzichtbaar.
  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.validUntil).toBe("2020-12-31");
  expect(
    (await db.select().from(events)).filter((e) => e.action === "price_list_extended"),
  ).toHaveLength(0);
  const na = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(na, "een verlenging die niets zichtbaar maakt mag niet slagen").toHaveLength(0);
});

test("listPriceListStatus: een gearchiveerde lijst draagt replaced_at mee (het scherm mag hem geen verlengknop geven)", async () => {
  // De bedrading achter D3: archivePriceList laat valid_until in het verleden staan, dus
  // de rij leest als "verlopen" en kreeg een verlengformulier dat altijd faalt met
  // 'archived'. Het scherm kan dat alleen weten als de query het veld meelevert.
  const db = await createTestDb();
  const { priceListId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart Cake",
    price: "99.00",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });

  const voor = (await listPriceListStatus(db)).find((r) => r.id === priceListId);
  expect(voor?.bucket).toBe("verlopen");
  expect(voor?.replacedAt).toBeNull();

  await archivePriceList(db, priceListId, "test@brink");

  const na = (await listPriceListStatus(db)).find((r) => r.id === priceListId);
  expect(na, "de rij blijft in de set — andere schermen rekenen erop").toBeDefined();
  expect(na?.bucket).toBe("verlopen");
  expect(na?.replacedAt).not.toBeNull();
});

test("natuurlijke sleutel: zelfde (brand, supplier_article_code) twee keer → geweigerd", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 40",
    supplierArticleCode: "K-40-001",
  });
  await expect(
    db.insert(products).values({
      id: crypto.randomUUID(),
      name: "Holon 40 (duplicaat)",
      brandId,
      brandName: "Kreon",
      supplierArticleCode: "K-40-001",
    }),
  ).rejects.toThrow();
});

// ── Race (fix 20 aug 2026): twee uploads voor hetzelfde merk tegelijk ─────────
// PGlite is single-connection; een échte gelijktijdigheidstest kan niet. We testen het
// contract: de claim is atomair (UPDATE … WHERE replaced_at IS NULL RETURNING), de
// invariant "hooguit één actieve lijst per merk" is database-afgedwongen
// (price_lists_brand_active_uniq, 0007), en de verliezer krijgt een nette fout.

test("race-contract: nogmaals replacePriceList laat exact één actieve lijst achter", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "Boxy R",
    price: "150.00",
  });

  await replacePriceList(db, brandId, {
    name: "Prijslijst 2027",
    validFrom: "2027-01-01",
    validUntil: "2027-12-31",
  });
  await replacePriceList(db, brandId, {
    name: "Prijslijst 2027 v2",
    validFrom: "2027-01-01",
    validUntil: "2027-12-31",
  });

  const actief = (
    await db.select().from(priceLists).where(eq(priceLists.brandId, brandId))
  ).filter((l) => l.replacedAt === null);
  expect(actief).toHaveLength(1);
  expect(actief[0].name).toBe("Prijslijst 2027 v2");
});

test("race-contract: de unique index weigert een tweede actieve lijst (INSERT gooit)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "iGuzzini",
    name: "Laser Blade",
    price: "220.00",
  });
  // seed heeft al een actieve lijst; een tweede actieve rij moet op de index klappen.
  // Drizzle wikkelt de databasefout ("Failed query: …") — de echte violation zit in de
  // cause-keten, dus daar zoeken we hem (zelfde keten die de productiecode afloopt).
  const err = await db
    .insert(priceLists)
    .values({
      brandId,
      name: "Sluiproute",
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
    })
    .then(
      () => null,
      (e: unknown) => e,
    );
  expect(err).toBeInstanceOf(Error);
  const keten: string[] = [];
  for (let e = err as Error | undefined; e instanceof Error; e = e.cause as Error) {
    keten.push(`${(e as Error & { code?: string }).code ?? ""} ${e.message}`);
  }
  expect(keten.join(" | ")).toMatch(/23505|price_lists_brand_active_uniq/);
});

test("race-contract: verliezer van de insert-race krijgt PriceListConflictError", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart lotis",
    price: "99.00",
  });
  // Naboots van de interleaving: de verliezer claimt niets (de winnaar was hem voor),
  // en op het moment dat hij zijn nieuwe lijst insert bestaat de lijst van de winnaar
  // al. Single-connection-truc: laat de claim niets vinden door replaced_at te vullen
  // NADAT de winnaarslijst er al staat — dan is de enige overgebleven stap de insert,
  // en die klapt op de index… behalve dat de seed-lijst dan de actieve is. Daarom
  // andersom: we geven de verliezer een db waarvan de claim-update niets teruggeeft.
  const verliezerDb = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "update") {
        // claim vindt niets: de winnaar heeft de actieve lijst al gearchiveerd
        return () => ({
          set: () => ({ where: () => ({ returning: async () => [] }) }),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as typeof db;

  await expect(
    replacePriceList(verliezerDb, brandId, {
      name: "Verliezerslijst",
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
    }),
  ).rejects.toThrow(PriceListConflictError);
});
