/// <reference types="vite/client" />
// Sprint 2.5b — bewijs bij migratie 0017 (expressie-indexen).
//
// EEN EXPRESSIE-INDEX FAALT STIL. Postgres matcht hem structureel tegen de uitdrukking in
// de query: staat er in de index één teken anders dan in de code, dan is er geen fout en
// geen waarschuwing — alleen weer een seq scan over 211k rijen. Een test die enkel
// `pg_indexes` afvinkt zou dus groen blijven terwijl de winst weg is. Daarom drie soorten
// bewijs, en alle drie op een echte Postgres (PGlite) met exact de productie-migraties:
//
//   1. DE PLANNER KIEST HEM. We laten Postgres de uitdrukking uit de code plannen en
//      toetsen op de indexnaam in het plan. `enable_seqscan = off` is nodig omdat een
//      testtabel van een handvol rijen altijd sneller seq-gescand wordt — de vraag hier is
//      "kán de planner erbij", niet "kiest hij hem op drie rijen".
//   2. DE UITDRUKKING KOMT UIT DE CODE. De strings hieronder worden uit de bronbestanden
//      zelf gelezen (import.meta.glob ?raw), niet overgetypt. Verandert iemand de
//      normalisatie in lib/repo/products.ts of lib/matching/engine.ts zonder de migratie
//      mee te nemen, dan valt (1) om — dat is precies de bedoeling.
//   3. DE UITKOMST IS ONVERANDERD. Dezelfde zoekopdracht mét en zonder de indexen geeft
//      exact dezelfde rijen in exact dezelfde volgorde. Een snellere query die andere
//      rijen teruggeeft is een regressie, geen winst.
import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, seedBrandProduct, type TestDb } from "./test-db";
import { searchProducts } from "@/lib/repo/products";

const MIGRATIE = Object.values(
  import.meta.glob(
    ["./migrations/0017_snelheid_indexen.sql", "./migrations/0018_analytics_merkgat_index.sql"],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>,
).join("\n");

const BRONNEN = import.meta.glob(
  [
    "../lib/repo/products.ts",
    "../lib/matching/engine.ts",
    "../lib/repo/analytics-tiles.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** De vijf indexen, met de uitdrukking zoals de code hem stelt en een conditie die die
 *  uitdrukking gebruikt. `kolom` is de drizzle-kolomnaam in de SQL-sjablonen van de code. */
const INDEXEN = [
  {
    index: "products_brand_key_trgm_idx",
    expr: "regexp_replace(lower(brand_name), '[^a-z0-9]', '', 'g')",
    conditie: (e: string) => `${e} like '%xal%'`,
  },
  {
    index: "products_article_code_key_idx",
    expr: "regexp_replace(lower(article_code), '[^a-z0-9]', '', 'g')",
    conditie: (e: string) => `${e} = 'l028f1077009'`,
  },
  {
    index: "products_supplier_article_code_key_idx",
    expr: "regexp_replace(lower(supplier_article_code), '[^a-z0-9]', '', 'g')",
    conditie: (e: string) => `${e} = 'l028f1077009'`,
  },
  {
    index: "products_article_code_lower_idx",
    expr: "lower(article_code)",
    conditie: (e: string) => `${e} = lower('L028F1077009')`,
  },
  {
    index: "products_supplier_article_code_lower_idx",
    expr: "lower(supplier_article_code)",
    conditie: (e: string) => `${e} = lower('L028F1077009')`,
  },
  // 0018 — de merkgat-tegel op /analytics. Andere uitdrukking (btrim erbij), dus een
  // eigen index; hij hoort in dezelfde tripwire thuis.
  {
    index: "products_brand_name_trimmed_lower_idx",
    expr: "lower(btrim(brand_name))",
    conditie: (e: string) => `${e} = lower(btrim(' XAL '))`,
  },
] as const;

async function plan(db: TestDb, conditie: string): Promise<string> {
  const res = (await db.execute(
    sql.raw(`EXPLAIN SELECT id FROM products WHERE ${conditie}`),
  )) as unknown as { rows?: Record<string, string>[] } | Record<string, string>[];
  const rijen = Array.isArray(res) ? res : (res.rows ?? []);
  return rijen.map((r) => Object.values(r).join(" ")).join("\n");
}

test("0017 (1/3): de planner kan élke expressie-index bedienen", async () => {
  const db = await createTestDb();
  // Zonder rijen kiest de planner soms een Result-knoop; één rij is genoeg om te plannen.
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    articleCode: "L028F1077009",
    supplierArticleCode: "L028F1077009",
  });
  await db.execute(sql.raw("ANALYZE products"));
  await db.execute(sql.raw("SET enable_seqscan = off"));

  for (const { index, expr, conditie } of INDEXEN) {
    expect(await plan(db, conditie(expr)), `index ${index}`).toContain(index);
  }
});

test("0017 (2/3): de uitdrukkingen komen letterlijk uit de code én uit de migratie", async () => {
  const alleBron = Object.values(BRONNEN).join("\n");
  expect(alleBron.length).toBeGreaterThan(1000); // de glob heeft écht iets gevonden

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const { index, expr } of INDEXEN) {
    // In de migratie staat de uitdrukking op de kale kolomnaam — letterlijk toetsbaar.
    expect(MIGRATIE, `migratie mist ${index}`).toContain(expr);
    // In de code staat dezelfde uitdrukking, maar met een drizzle-kolomreferentie
    // (`${visibleProducts.brandName}`) of een alias (`p.brand_name`) op de plek van de
    // kolom. Alleen díe plek mag verschillen; al het andere — spaties, quotes, de
    // klassevolgorde van regexp_replace — moet teken voor teken kloppen, want daar hangt
    // af of Postgres de index nog herkent.
    const patroon = new RegExp(
      esc(expr).replace(
        /brand_name|supplier_article_code|article_code/,
        "[^)]+",
      ),
    );
    expect(patroon.test(alleBron), `code mist de vorm van ${index}`).toBe(true);
  }
});

test("0017 (3/3): dezelfde zoekopdracht geeft mét en zonder de indexen identieke rijen", async () => {
  async function zoek(zonderIndexen: boolean) {
    const db = await createTestDb();
    if (zonderIndexen) {
      for (const { index } of INDEXEN) {
        await db.execute(sql.raw(`DROP INDEX ${index}`));
      }
    }
    const catalogus: [naam: string, code: string][] = [
      ["SASSO 100 SQ SP CEIL 2700K", "L028F1077009"],
      ["SASSO 100 RD SP CEIL 3000K", "L028F1077010"],
      ["SNOOT FOR SASSO 100", "L028F1077011"],
      ["MENO 60 TRIMLESS", "L031F2000001"],
    ];
    for (const [name, articleCode] of catalogus) {
      await seedBrandProduct(db, { brand: "XAL", name, articleCode });
    }
    // Twee zoekvormen: de fuzzy tekst-tak en de exacte artikelnummer-tak.
    const fuzzy = await searchProducts(db, { query: "SASSO 100", limit: 20 });
    const exact = await searchProducts(db, { query: "L028F1077010", limit: 20 });
    return {
      fuzzy: fuzzy.map((h) => h.name),
      exact: exact.map((h) => h.name),
    };
  }

  const met = await zoek(false);
  const zonder = await zoek(true);
  expect(met.fuzzy.length).toBeGreaterThan(0);
  expect(met.exact.length).toBeGreaterThan(0);
  expect(met).toEqual(zonder);
});
