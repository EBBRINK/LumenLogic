// De directe template-import op PGlite (docs/goal-template-upload-direct-import.md).
// Bewijst de vervang-semantiek en de archief-aansluiting:
//   • het bestand wint: nieuwe waarden, gewijzigde waarden én leeggemaakte velden;
//   • de oude prijslijst gaat automatisch op archief (replacePriceList, eindelijk
//     aangesloten) en de regels staan in archive.prices_archive;
//   • producten die in het bestand ontbreken verliezen hun prijsregel en verdwijnen uit
//     visible_products — geen spookproducten, geen delete;
//   • een bestand zonder één verwerkbare prijs wordt geweigerd vóór de eerste schrijf;
//   • één samenvattend event (template_import_finished) met tellingen + de bestaande
//     per-veld-events (product_fields_applied met old/new).
import { expect, test } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { addProductToBrand, createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  brandRelations,
  events,
  priceLists,
  prices,
  pricesArchive,
  products,
  visibleProducts,
} from "@/db/schema";
import type { GelezenRij } from "@/lib/excel-validate";
import {
  importTemplateDirect,
  TemplateImportError,
} from "@/lib/repo/template-import";

const NIEUWE_LIJST = {
  name: "Price list 2027",
  validFrom: "2026-01-01",
  validUntil: "2027-12-31",
};

function rij(nr: number, velden: Record<string, string>): GelezenRij {
  return { rij: nr, velden };
}

async function importeer(db: TestDb, brandId: string, rijen: GelezenRij[]) {
  return importTemplateDirect(db, {
    brandId,
    rijen,
    waarschuwingen: [],
    filename: "deltalight-branddata.xlsx",
    fileSize: 1_000_000,
    newList: NIEUWE_LIJST,
    actor: "brink",
  });
}

/**
 * De codes die op de ACTUELE lijst staan — dat is wat deze tests bedoelden toen ze nog van
 * "zichtbaar" spraken. Sinds migratie 0022 staat een product dat uit de lijst is gevallen
 * óók in `visible_products` (vindbaar, zonder bedrag, `uit_prijslijst`), dus "zichtbaar" en
 * "op de actuele lijst" zijn niet langer hetzelfde. De import-tests gaan over dat tweede;
 * `vervallenCodes` hieronder bewaakt het eerste.
 */
async function actueleCodes(db: TestDb, brandId: string): Promise<string[]> {
  const rows = await db
    .select({ code: products.supplierArticleCode })
    .from(visibleProducts)
    .innerJoin(products, eq(products.id, visibleProducts.id))
    .where(
      and(eq(products.brandId, brandId), eq(visibleProducts.priceState, "actueel")),
    );
  return rows.map((r) => r.code ?? "").sort();
}

/** De codes die wél vindbaar zijn maar niet meer op de lijst staan (geen bedrag). */
async function vervallenCodes(db: TestDb, brandId: string): Promise<string[]> {
  const rows = await db
    .select({ code: products.supplierArticleCode, prijs: visibleProducts.grossPrice })
    .from(visibleProducts)
    .innerJoin(products, eq(products.id, visibleProducts.id))
    .where(
      and(
        eq(products.brandId, brandId),
        eq(visibleProducts.priceState, "uit_prijslijst"),
      ),
    );
  // De bescherming van regel 3, hier meegemeten: vervallen betekent geen bedrag.
  for (const r of rows) expect(r.prijs).toBeNull();
  return rows.map((r) => r.code ?? "").sort();
}

/** Het standaard-toneel: één merk, actieve lijst, twee producten (ART-1 en ART-2). */
async function toneel(db: TestDb) {
  const { brandId, priceListId, productId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "Downlight Alpha",
    supplierArticleCode: "ART-1",
    price: "100.00",
    kelvin: 3000,
    color1: "Black",
  });
  const tweede = await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "Spot Beta",
    supplierArticleCode: "ART-2",
    price: "200.00",
  });
  return { brandId, priceListId, productId, tweedeProductId: tweede.productId };
}

test("vervang-semantiek: bestand wint (zetten, wijzigen, wissen), ontbrekend product verdwijnt uit zicht", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId, tweedeProductId } = await toneel(db);

  // ART-1: kelvin gewijzigd, color_1 LEEGGEMAAKT, prijs gewijzigd. ART-3: nieuw product.
  // ART-2 ontbreekt in het bestand → vervang-semantiek: uit de zoekresultaten.
  const uitkomst = await importeer(db, brandId, [
    rij(4, {
      supplier_article_code: "ART-1",
      kelvin: "4000",
      color_1: "",
      list_price_excl_vat: "110",
    }),
    rij(5, {
      supplier_article_code: "ART-3",
      name_en: "Track Gamma",
      kelvin: "2700",
      list_price_excl_vat: "300",
    }),
  ]);

  expect(uitkomst.createdProducts).toBe(1);
  expect(uitkomst.updatedProducts).toBe(1);
  expect(uitkomst.clearedFields).toBe(1);
  expect(uitkomst.goneProducts).toBe(1);
  expect(uitkomst.priceList.priceLines).toBe(2);
  expect(uitkomst.priceList.archivedLines).toBe(2); // beide oude regels naar het archief

  // Het bestand wint, ook de lege cel.
  const [art1] = await db.select().from(products).where(eq(products.id, productId));
  expect(art1.kelvin).toBe(4000);
  expect(art1.color1).toBeNull();

  // Nieuw product bestaat, met naam uit name_en.
  const [art3] = await db
    .select()
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.supplierArticleCode, "ART-3")));
  expect(art3.name).toBe("Track Gamma");
  expect(art3.kelvin).toBe(2700);

  // De oude lijst is vervangen; zijn regels staan in het archief; er is precies één
  // actieve lijst met de opgegeven metadata.
  const [oudeLijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(oudeLijst.replacedAt).not.toBeNull();
  const archief = await db
    .select()
    .from(pricesArchive)
    .where(eq(pricesArchive.brandId, brandId));
  expect(archief).toHaveLength(2);
  const [actief] = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.brandId, brandId), isNull(priceLists.replacedAt)));
  expect(actief.name).toBe("Price list 2027");
  expect(actief.validUntil).toBe("2027-12-31");

  // IJzeren regel 3, centraal afgedwongen: ART-2 heeft geen regel op de nieuwe lijst.
  // Sinds 0022 verdwijnt hij daardoor niet, maar wordt hij vindbaar zónder bedrag — precies
  // het scenario van de bestekschrijver die een artikelnummer van vorig jaar overtypt.
  expect(await actueleCodes(db, brandId)).toEqual(["ART-1", "ART-3"]);
  expect(await vervallenCodes(db, brandId)).toEqual(["ART-2"]);
  const [art2] = await db.select().from(products).where(eq(products.id, tweedeProductId));
  expect(art2.name).toBe("Spot Beta");

  // Events: archief-aansluiting + samenvatting + per-veld-spoor.
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).toContain("template_import_started");
  expect(acties).toContain("price_list_archived");
  expect(acties).toContain("price_list_created");
  expect(acties).toContain("product_created_from_template");
  expect(acties).toContain("product_fields_applied");
  expect(acties).toContain("template_import_finished");

  const [samenvatting] = await db
    .select()
    .from(events)
    .where(eq(events.action, "template_import_finished"));
  const payload = samenvatting.payload as Record<string, unknown>;
  expect(payload.createdProducts).toBe(1);
  expect(payload.updatedProducts).toBe(1);
  expect(payload.clearedFields).toBe(1);
  expect(payload.goneProducts).toBe(1);

  // Het per-veld-spoor draagt old/new, óók de wissing.
  const [veldEvent] = await db
    .select()
    .from(events)
    .where(and(eq(events.action, "product_fields_applied"), eq(events.entityId, productId)));
  const fields = (veldEvent.payload as { fields: Record<string, { old: unknown; new: unknown }> })
    .fields;
  expect(fields.kelvin).toEqual({ old: "3000", new: "4000" });
  expect(fields.color_1).toEqual({ old: "Black", new: null });

  // Relatiestatus → verwerkt.
  const [rel] = await db
    .select()
    .from(brandRelations)
    .where(eq(brandRelations.brandId, brandId));
  expect(rel.status).toBe("verwerkt");
});

test("tweede run met hetzelfde bestand convergeert: geen veldwijzigingen, wél een verse lijst", async () => {
  const db = await createTestDb();
  const { brandId } = await toneel(db);
  const bestand = [
    rij(4, { supplier_article_code: "ART-1", kelvin: "4000", list_price_excl_vat: "110" }),
  ];
  await importeer(db, brandId, bestand);
  const tweede = await importeer(db, brandId, bestand);

  // Alles is al zo: geen product-writes, geen dubbele producten.
  expect(tweede.createdProducts).toBe(0);
  expect(tweede.updatedProducts).toBe(0);
  const alle = await db.select().from(products).where(eq(products.brandId, brandId));
  expect(alle).toHaveLength(2);
  // De lijst-wissel gebeurt wél opnieuw — het bestand is opnieuw integraal leidend.
  expect(tweede.priceList.priceLines).toBe(1);
  expect(await actueleCodes(db, brandId)).toEqual(["ART-1"]);
  expect(await vervallenCodes(db, brandId)).toEqual(["ART-2"]);
});

test("zonder één verwerkbare prijs weigert de import vóór de eerste schrijf", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await toneel(db);

  await expect(
    importeer(db, brandId, [
      rij(4, { supplier_article_code: "ART-1", kelvin: "4000", list_price_excl_vat: "" }),
    ]),
  ).rejects.toThrowError(TemplateImportError);

  // Niets geschreven: kelvin onaangeraakt, oude lijst nog actief, geen import-events.
  const [art1] = await db
    .select()
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.supplierArticleCode, "ART-1")));
  expect(art1.kelvin).toBe(3000);
  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.replacedAt).toBeNull();
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).not.toContain("template_import_started");
  expect(acties).not.toContain("price_list_archived");
});

test("onverwerkbare en niet-opslagbare velden worden geteld en gelogd, nooit stil weggegooid", async () => {
  const db = await createTestDb();
  const { brandId } = await toneel(db);

  const uitkomst = await importeer(db, brandId, [
    rij(4, {
      supplier_article_code: "ART-1",
      kelvin: "warm white", // past niet in integer → skipped
      list_price_excl_vat: "110",
    }),
  ]);

  expect(uitkomst.skippedFields).toBe(1);
  const [art1] = await db
    .select()
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.supplierArticleCode, "ART-1")));
  expect(art1.kelvin).toBe(3000); // onverwerkbaar wint nooit van bestaande data

  const [samenvatting] = await db
    .select()
    .from(events)
    .where(eq(events.action, "template_import_finished"));
  const payload = samenvatting.payload as {
    skippedFields: number;
    skippedFieldsSample: { fieldKey: string; reden: string }[];
  };
  expect(payload.skippedFields).toBe(1);
  expect(payload.skippedFieldsSample[0]).toMatchObject({
    fieldKey: "kelvin",
    reden: "unprocessable",
  });
});

test("geblokkeerde rijen (geen artikelcode / geen naam) worden overgeslagen en geteld", async () => {
  const db = await createTestDb();
  const { brandId } = await toneel(db);

  const uitkomst = await importeer(db, brandId, [
    rij(4, { supplier_article_code: "ART-1", list_price_excl_vat: "110" }),
    // Nieuw product zonder naam: products.name is NOT NULL → rij overgeslagen.
    rij(5, { supplier_article_code: "ART-9", list_price_excl_vat: "50" }),
    // Rij zonder artikelcode: geen identiteit → overgeslagen.
    rij(6, { supplier_article_code: "", name_en: "Naamloos", list_price_excl_vat: "60" }),
  ]);

  expect(uitkomst.skippedRows).toBe(2);
  expect(uitkomst.createdProducts).toBe(0);
  const alle = await db.select().from(products).where(eq(products.brandId, brandId));
  expect(alle).toHaveLength(2); // ART-1 en ART-2 van het toneel, niets erbij
});

test("catalogus-formaat: 2.000 rijen in batches, geen per-rij-explosie", async () => {
  const db = await createTestDb();
  const { brandId } = await toneel(db);

  const rijen: GelezenRij[] = [];
  for (let i = 0; i < 2000; i++) {
    rijen.push(
      rij(4 + i, {
        supplier_article_code: `BULK-${String(i).padStart(4, "0")}`,
        name_en: `Product ${i}`,
        kelvin: "3000",
        list_price_excl_vat: String(100 + i),
      }),
    );
  }
  const uitkomst = await importeer(db, brandId, rijen);
  expect(uitkomst.createdProducts).toBe(2000);
  expect(uitkomst.priceList.priceLines).toBe(2000);
  expect(uitkomst.goneProducts).toBe(2); // ART-1 en ART-2 stonden niet in het bestand
  expect(await actueleCodes(db, brandId)).toHaveLength(2000);
  expect(await vervallenCodes(db, brandId)).toEqual(["ART-1", "ART-2"]);
});
