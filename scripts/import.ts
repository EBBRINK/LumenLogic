// bun run import — laadt de XIS-brondata (data/source/*.csv) in het Drizzle-schema.
//
// Eigenschappen (zie docs/BUILD-PLAN.md §4.2):
//  • Idempotent: onConflictDoNothing op de bron-UUID → herdraaien voegt niets dubbel toe.
//    (Volledige refresh = TRUNCATE; deze import muteert bestaande rijen niet.)
//  • Fail loud, nooit stil droppen: rijen zonder naam en dangling FK's worden geteld
//    en gelogd. Een product met een dangling brand/category/supplier houdt zijn tekst-
//    backupvelden (brand_name etc.) en blijft doorzoekbaar; alleen de FK wordt genulld.
//  • Prijzen: één prijslijst per merk. De bron heeft geen geldigheidsdatum op prijzen,
//    dus valid_until defaultt op 2026-12-31 (AANNAME — genoteerd in HANDOVER.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  brands,
  categories,
  priceLists,
  prices,
  products,
  suppliers,
} from "@/db/schema";
import { iterRecords } from "./csv";

const SOURCE = join(import.meta.dirname, "..", "data", "source");
const PRICE_LIST_VALID_FROM = "2026-01-01";
const PRICE_LIST_VALID_UNTIL = "2026-12-31"; // AANNAME: bron heeft geen prijsgeldigheidsdatum
const LIMIT = process.env.IMPORT_LIMIT
  ? parseInt(process.env.IMPORT_LIMIT, 10)
  : Infinity;

function read(name: string): string {
  return readFileSync(join(SOURCE, name), "utf8");
}
function int(v: string | null): number | null {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function num(v: string | null): string | null {
  if (v == null) return null;
  return Number.isNaN(Number(v)) ? null : v; // numeric-kolom wil string
}
function bool(v: string | null): boolean | null {
  if (v == null) return null;
  return v === "t" || v === "true" || v === "1";
}
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "merk"
  );
}

async function flush<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
) {
  if (rows.length === 0) return;
  // onConflictDoNothing → idempotent op de primaire sleutel (bron-UUID / unieke index)
  await db.insert(table).values(rows).onConflictDoNothing();
}

async function importSuppliers(): Promise<Set<string>> {
  const ids = new Set<string>();
  const batch: Record<string, unknown>[] = [];
  for (const r of iterRecords(read("brink_suppliers.csv"))) {
    if (!r.id || !r.name) continue;
    ids.add(r.id);
    batch.push({
      id: r.id,
      supplierCode: r.supplier_code,
      name: r.name,
      country: r.country,
      city: r.city,
      contactEmail: r.contact_email,
      notes: r.notes,
    });
  }
  await flush(suppliers, batch);
  console.log(`✓ suppliers: ${batch.length}`);
  return ids;
}

async function importBrands(): Promise<{
  brandIds: Set<string>;
  priceListByBrand: Map<string, string>;
}> {
  const brandIds = new Set<string>();
  const brandBatch: Record<string, unknown>[] = [];
  const listBatch: Record<string, unknown>[] = [];
  for (const r of iterRecords(read("brink_brands.csv"))) {
    if (!r.id || !r.name) continue;
    brandIds.add(r.id);
    brandBatch.push({
      id: r.id,
      brandCode: r.brand_code,
      name: r.name,
      slug: slugify(r.name),
      country: r.country,
      disclosureTier: "tier1", // bron is Tier 1-data (BUILD-PLAN §4.2)
      descriptionNl: r.description_nl,
      warranty: r.warranty,
      rating: r.rating,
      standardDiscountPct: num(r.standard_discount_pct),
      baseDiscountPct: num(r.base_discount_pct),
      paymentTermDays: int(r.payment_term_days),
      deliveryTimeDays: int(r.delivery_time_days),
      website: r.website,
    });
    // één prijslijst per merk
    listBatch.push({
      brandId: r.id,
      name: `Brutoprijslijst ${r.name}`,
      validFrom: PRICE_LIST_VALID_FROM,
      validUntil: PRICE_LIST_VALID_UNTIL,
    });
  }
  await flush(brands, brandBatch);
  await flush(priceLists, listBatch);
  // lees de daadwerkelijk opgeslagen prijslijst-id's (idempotent over herruns)
  const stored = await db
    .select({ id: priceLists.id, brandId: priceLists.brandId })
    .from(priceLists);
  const priceListByBrand = new Map<string, string>();
  for (const row of stored) priceListByBrand.set(row.brandId, row.id);
  console.log(
    `✓ brands: ${brandBatch.length} · prijslijsten: ${priceListByBrand.size}`,
  );
  return { brandIds, priceListByBrand };
}

async function importCategories(): Promise<Set<string>> {
  const ids = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const r of iterRecords(read("brink_categories.csv"))) {
    if (!r.id || !r.name_nl) continue;
    ids.add(r.id);
    rows.push({
      id: r.id,
      nameNl: r.name_nl,
      nameEn: r.name_en,
      parentId: r.parent_id,
      level: int(r.level) ?? 1,
      displayOrder: int(r.display_order),
      fullPathNl: r.full_path_nl,
    });
  }
  // parent_id kan naar een categorie verwijzen die verderop in de CSV staat, maar we
  // hebben géén FK op parent_id (self-ref, bewust weggelaten) → volgorde maakt niet uit.
  await flush(categories, rows);
  console.log(`✓ categories: ${rows.length}`);
  return ids;
}

async function importProducts(ctx: {
  brandIds: Set<string>;
  categoryIds: Set<string>;
  supplierIds: Set<string>;
  priceListByBrand: Map<string, string>;
}) {
  const stats = {
    products: 0,
    skippedNoName: 0,
    danglingBrand: 0,
    danglingCategory: 0,
    danglingSupplier: 0,
    prices: 0,
    noPrice: 0,
  };
  const PRODUCT_BATCH = 700;
  let productBatch: Record<string, unknown>[] = [];
  let priceBatch: Record<string, unknown>[] = [];

  // Prijzen verwijzen naar producten → ALTIJD eerst de producten flushen, dan de prijzen,
  // in dezelfde slag. Elk product levert ≤1 prijs, dus beide batches lopen synchroon.
  const flushBatch = async () => {
    await flush(products, productBatch);
    await flush(prices, priceBatch);
    productBatch = [];
    priceBatch = [];
  };

  for (const r of iterRecords(read("brink_products.csv"))) {
    if (stats.products >= LIMIT) break;
    if (!r.id) continue;
    if (!r.name) {
      stats.skippedNoName++;
      continue;
    }
    let brandId = r.brand_id;
    if (brandId && !ctx.brandIds.has(brandId)) {
      stats.danglingBrand++;
      brandId = null; // behoud brand_name-tekst, null de dangling FK
    }
    let categoryId = r.category_id;
    if (categoryId && !ctx.categoryIds.has(categoryId)) {
      stats.danglingCategory++;
      categoryId = null;
    }
    let supplierId = r.supplier_id;
    if (supplierId && !ctx.supplierIds.has(supplierId)) {
      stats.danglingSupplier++;
      supplierId = null;
    }

    productBatch.push({
      id: r.id,
      articleCode: r.article_code,
      name: r.name,
      brandId,
      brandName: r.brand_name,
      supplierArticleCode: r.supplier_article_code,
      categoryId,
      categoryPath: r.category_path,
      supplierId,
      supplierName: r.supplier_name,
      status: r.status ?? "actief",
      description: r.description,
      lumenOutput: int(r.lumen_output),
      maxWattage: num(r.max_wattage),
      kelvin: int(r.kelvin),
      cri: int(r.cri),
      ipValue: r.ip_value,
      beamAngle: num(r.beam_angle),
      dimmable: r.dimmable,
      driverIncluded: r.driver_included,
      lightSource: r.light_source,
      directionable: bool(r.directionable),
      heightCm: num(r.height_cm),
      widthCm: num(r.width_cm),
      lengthCm: num(r.length_cm),
      diameterCm: num(r.diameter_cm),
      color1: r.color_1,
      material1: r.material_1,
    });
    stats.products++;

    // prijs → alleen als er een geldige verkoopprijs én een prijslijst voor het merk is
    const price = num(r.selling_price_excl_vat);
    const listId = brandId ? ctx.priceListByBrand.get(brandId) : undefined;
    if (price && Number(price) > 0 && listId) {
      priceBatch.push({
        productId: r.id,
        priceListId: listId,
        grossPrice: price,
      });
      stats.prices++;
    } else {
      stats.noPrice++;
    }

    if (productBatch.length >= PRODUCT_BATCH) {
      await flushBatch();
      if (stats.products % 21000 === 0)
        console.log(`  … ${stats.products} producten`);
    }
  }
  await flushBatch();
  console.log(`✓ products: ${stats.products}`);
  console.log(
    `  prijzen: ${stats.prices} · zonder prijs (onzichtbaar): ${stats.noPrice}`,
  );
  console.log(
    `  overgeslagen (geen naam): ${stats.skippedNoName} · dangling FK — brand ${stats.danglingBrand}, category ${stats.danglingCategory}, supplier ${stats.danglingSupplier}`,
  );
}

async function main() {
  const t0 = Date.now();
  console.log("Import gestart…");
  const supplierIds = await importSuppliers();
  const { brandIds, priceListByBrand } = await importBrands();
  const categoryIds = await importCategories();
  await importProducts({
    brandIds,
    categoryIds,
    supplierIds,
    priceListByBrand,
  });
  const res = await db.execute(
    sql`SELECT count(*)::int AS count FROM visible_products`,
  );
  const rows = (Array.isArray(res) ? res : res.rows) as { count: number }[];
  console.log(`Zichtbare producten (via view): ${rows[0]?.count ?? "?"}`);
  console.log(`Klaar in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("Import mislukt:", e);
  process.exit(1);
});
