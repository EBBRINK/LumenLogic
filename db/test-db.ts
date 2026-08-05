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
import brandAliasesSql from "./migrations/0010_brand_aliases.sql?raw";
import ocrTilesSql from "./migrations/0011_ocr_tiles.sql?raw";
import aliasSeraxSql from "./migrations/0012_alias_serax.sql?raw";
import levensfaseSql from "./migrations/0013_merk_levensfase.sql?raw";
import milieuFabrieksafstandSql from "./migrations/0014_milieu_fabrieksafstand.sql?raw";
import eigenVeldenSql from "./migrations/0015_eigen_velden.sql?raw";
import eigenVeldenEngelsSql from "./migrations/0016_eigen_velden_engels.sql?raw";
import snelheidIndexenSql from "./migrations/0017_snelheid_indexen.sql?raw";
import analyticsMerkgatSql from "./migrations/0018_analytics_merkgat_index.sql?raw";
import orgTypeActivatieSql from "./migrations/0019_org_type_activatie.sql?raw";

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
  // 0010: brand_aliases (O5) — de seed-INSERT…SELECT's matchen in een verse test-DB
  // niets en inserten dus niets; tests seeden hun eigen aliassen via seedBrandAlias.
  await client.exec(brandAliasesSql);
  await client.exec(ocrTilesSql); // 0011: OCR A3-tiling — tile-kolom + unique(run, page, tile)
  await client.exec(aliasSeraxSql); // 0012: alias serax → Valerie Objects (seedt niets op een lege test-DB)
  await client.exec(levensfaseSql); // 0013: brands.lifecycle — kolomdefault, geen backfill
  await client.exec(milieuFabrieksafstandSql); // 0014: factory_location/-distance_km — geen backfill
  // 0015: custom_fields + products.custom_values — eigen velden. De nieuwe kolom staat in
  // GEEN view; db/matcher-grens.test.ts leest de view-definities uit déze test-DB terug.
  await client.exec(eigenVeldenSql);
  // 0016: label_nl/instructie_nl nullable (legacy), CHECKs EN-only — /data/fields vraagt
  // geen Nederlands meer.
  await client.exec(eigenVeldenEngelsSql);
  // 0017: expressie-indexen (2.5b). Puur snelheid — geen kolom, geen view, geen gedrag.
  // Ze staan hier omdat db/migration-0017.test.ts de planner ermee moet kunnen laten
  // plannen: alleen zo blijkt of de uitdrukking in de index nog letterlijk gelijk is aan
  // die in de code. Verder verandert de testomgeving er niets van.
  await client.exec(snelheidIndexenSql);
  // 0018: idem, voor de merkgat-tegel op /analytics.
  await client.exec(analyticsMerkgatSql);
  // 0019: organizations.type (G31) + activation_pins (C10/G34). Zaait óók in een verse
  // test-DB de Brink-org ('brink-licht', type 'intern') — elke test-DB heeft dus precies
  // één organisatie vóórdat de test zelf iets aanmaakt. De dossier- en membership-backfill
  // eronder raakt in een verse DB nul rijen (geen dossiers, geen users).
  //
  // ⚠️ Was 0017 op deze branch. Sprint 2.5b nam dat nummer op main in (én 0018), dus bij
  // de rebase is deze migratie hernummerd naar 0019 — hij was nog niet gedeployd, dus dat
  // kon zonder gevolgen. Twee bestanden met hetzelfde nummer laten staan zou de volgorde
  // dubbelzinnig maken, en dít bestand is wat die volgorde bepaalt.
  await client.exec(orgTypeActivatieSql);
  return drizzle(client, { schema });
}

// Seed alléén een merkrij — geen prijslijst, geen product. Nodig om "merkrij bestaat,
// maar zonder producten" te testen: sinds stap 4 (O5) toetst de engine op prodúcten
// in de basistabel, dus zo'n merk is een datagat → blauw + inlaadwachtrij.
export async function seedBrand(db: TestDb, name: string) {
  const brandId = crypto.randomUUID();
  await db.insert(schema.brands).values({
    id: brandId,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "merk",
  });
  return { brandId };
}

// Seed een gecureerde merknaam-redirect (O5): aliasKey moet al genormaliseerd zijn
// (brandKeyOf-vorm, lowercase alfanumeriek) — precies zoals productie; de CHECK in
// migratie 0010 dwingt het ook hier af.
export async function seedBrandAlias(
  db: TestDb,
  brandId: string,
  aliasKey: string,
  note?: string,
) {
  await db.insert(schema.brandAliases).values({
    brandId,
    aliasKey,
    note: note ?? null,
  });
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
