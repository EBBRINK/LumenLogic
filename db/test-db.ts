// In-memory testdatabase (PGlite/WASM) met exact dezelfde migraties als Neon.
// Draait in de vitest-browser: PGlite is WASM, pg_trgm komt uit de contrib-module.
// De migratie-SQL wordt als string geïmporteerd (?raw) zodat er geen fs nodig is.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import initSql from "./migrations/0000_init.sql?raw";
import searchSql from "./migrations/0001_search_and_visibility.sql?raw";
import authSql from "./migrations/0002_auth.sql?raw";
import viewSql from "./migrations/0003_view_sustainability.sql?raw";
import vijfstatussenSql from "./migrations/0004_vijfstatussen.sql?raw";
import h2h3Sql from "./migrations/0005_h2_h3.sql?raw";
import projectstatusSql from "./migrations/0006_projectstatus_ai.sql?raw";
import datamodelSql from "./migrations/0007_datamodel_productspecs.sql?raw";
import merkrelatiesSql from "./migrations/0008_merkrelaties.sql?raw";
import ocrSql from "./migrations/0009_ocr.sql?raw";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb(): Promise<TestDb> {
  const client = await PGlite.create({ extensions: { pg_trgm } });
  // Multi-statement SQL met ';' — client.exec voert elk bestand integraal uit.
  // Zelfde migraties als Neon, inclusief 0002 auth (cleanup-testdata raakt `user`).
  await client.exec(initSql);
  await client.exec(searchSql);
  await client.exec(authSql);
  await client.exec(viewSql); // view mét duurzaamheids-/techvelden (regel 3 blijft gelijk)
  await client.exec(vijfstatussenSql); // run 4: vijfstatussen + kandidaten/review/import
  await client.exec(h2h3Sql); // H2/H3: orgs/rollen, disclosure, lifecycle, merkportaal
  await client.exec(projectstatusSql); // B6: status/xis_phase + raw_markdown + ai_suggestions
  await client.exec(datamodelSql); // 0007: veldcatalogus + archive + prijsherkomst
  await client.exec(merkrelatiesSql); // 0008: merkrelaties — brand_relations + statusenum
  await client.exec(ocrSql); // 0009: OCR — ocr_page_images + llm_usage.import_run_id + ocr_status
  return drizzle(client, { schema });
}

// Seed één merk + prijslijst + product + prijs. Elke aanroep krijgt een eigen merk
// (eigen prijslijst-geldigheid) zodat verlopen vs. geldige prijslijsten los te sturen zijn.
export async function seedBrandProduct(
  db: TestDb,
  opts: {
    brand: string;
    name: string;
    price?: string;
    validFrom?: string;
    validUntil?: string;
    articleCode?: string | null;
    supplierArticleCode?: string | null;
    kelvin?: number | null;
    cri?: number | null;
    ip?: string | null;
    maxWattage?: number | null;
    lumenOutput?: number | null;
    beamAngle?: number | null;
    dimmable?: string | null;
    color1?: string | null;
    diameterCm?: number | null;
    categoryPath?: string | null;
    warrantyMonths?: number | null;
    repairability?: string | null;
    epdLifetimeHours?: number | null;
  },
) {
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  await db.insert(schema.brands).values({
    id: brandId,
    name: opts.brand,
    slug: opts.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "merk",
  });
  const [pl] = await db
    .insert(schema.priceLists)
    .values({
      brandId,
      name: `Prijslijst ${opts.brand}`,
      validFrom: opts.validFrom ?? "2026-01-01",
      validUntil: opts.validUntil ?? "2999-12-31",
    })
    .returning();
  await db.insert(schema.products).values({
    id: productId,
    name: opts.name,
    brandId,
    brandName: opts.brand,
    articleCode: opts.articleCode ?? null,
    supplierArticleCode: opts.supplierArticleCode ?? null,
    kelvin: opts.kelvin ?? null,
    cri: opts.cri ?? null,
    ipValue: opts.ip ?? null,
    maxWattage: opts.maxWattage != null ? String(opts.maxWattage) : null,
    lumenOutput: opts.lumenOutput ?? null,
    beamAngle: opts.beamAngle != null ? String(opts.beamAngle) : null,
    dimmable: opts.dimmable ?? null,
    color1: opts.color1 ?? null,
    diameterCm: opts.diameterCm != null ? String(opts.diameterCm) : null,
    categoryPath: opts.categoryPath ?? null,
    warrantyMonths: opts.warrantyMonths ?? null,
    repairability: opts.repairability ?? null,
    epdLifetimeHours: opts.epdLifetimeHours ?? null,
  });
  await db.insert(schema.prices).values({
    productId,
    priceListId: pl.id,
    grossPrice: opts.price ?? "100.00",
  });
  return { brandId, priceListId: pl.id, productId };
}

// Voeg een extra product aan een BESTAAND merk toe (zelfde prijslijst), zodat een merk
// meerdere producten kan hebben — nodig om "merk bestaat, product niet" (rood) te testen.
export async function addProductToBrand(
  db: TestDb,
  opts: {
    brandId: string;
    priceListId: string;
    name: string;
    price?: string;
    articleCode?: string | null;
    supplierArticleCode?: string | null;
    kelvin?: number | null;
    cri?: number | null;
    ip?: string | null;
    maxWattage?: number | null;
    lumenOutput?: number | null;
    beamAngle?: number | null;
    dimmable?: string | null;
    color1?: string | null;
    diameterCm?: number | null;
  },
) {
  const productId = crypto.randomUUID();
  const [{ name: brandName }] = await db
    .select({ name: schema.brands.name })
    .from(schema.brands)
    .where(eq(schema.brands.id, opts.brandId));
  await db.insert(schema.products).values({
    id: productId,
    name: opts.name,
    brandId: opts.brandId,
    brandName,
    articleCode: opts.articleCode ?? null,
    supplierArticleCode: opts.supplierArticleCode ?? null,
    kelvin: opts.kelvin ?? null,
    cri: opts.cri ?? null,
    ipValue: opts.ip ?? null,
    maxWattage: opts.maxWattage != null ? String(opts.maxWattage) : null,
    lumenOutput: opts.lumenOutput ?? null,
    beamAngle: opts.beamAngle != null ? String(opts.beamAngle) : null,
    dimmable: opts.dimmable ?? null,
    color1: opts.color1 ?? null,
    diameterCm: opts.diameterCm != null ? String(opts.diameterCm) : null,
  });
  await db.insert(schema.prices).values({
    productId,
    priceListId: opts.priceListId,
    grossPrice: opts.price ?? "100.00",
  });
  return { productId };
}
