// In-memory testdatabase (PGlite/WASM) met exact dezelfde migraties als Neon.
// Draait in de vitest-browser: PGlite is WASM, pg_trgm komt uit de contrib-module.
// De migratie-SQL wordt als string geïmporteerd (?raw) zodat er geen fs nodig is.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import initSql from "./migrations/0000_init.sql?raw";
import searchSql from "./migrations/0001_search_and_visibility.sql?raw";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb(): Promise<TestDb> {
  const client = await PGlite.create({ extensions: { pg_trgm } });
  // Beide bestanden zijn multi-statement SQL met ';' — client.exec voert ze integraal uit.
  await client.exec(initSql);
  await client.exec(searchSql);
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
    kelvin?: number | null;
    cri?: number | null;
    ip?: string | null;
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
    kelvin: opts.kelvin ?? null,
    cri: opts.cri ?? null,
    ipValue: opts.ip ?? null,
  });
  await db.insert(schema.prices).values({
    productId,
    priceListId: pl.id,
    grossPrice: opts.price ?? "100.00",
  });
  return { brandId, priceListId: pl.id, productId };
}
