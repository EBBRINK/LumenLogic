// Product-matching. Twee ijzeren regels leven hier:
//   • Regel 2: geld beïnvloedt de ranking NOOIT. De ORDER BY hieronder is puur
//     tekstsimilariteit (trigram). `gross_price` wordt getoond, nooit gesorteerd.
//   • Regel 3: er wordt UITSLUITEND uit de view `visible_products` gelezen — een product
//     met een verlopen prijslijst bestaat hier simpelweg niet. Nooit per query opnieuw
//     gefilterd; de view is de enige poort.
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { visibleProducts } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type ProductCandidate = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  supplierArticleCode: string | null;
  categoryPath: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  lumenOutput: number | null;
  grossPrice: string | null;
  currency: string | null;
  score: number;
  matchKind: "exact" | "fuzzy";
};

const SELECTION = {
  id: visibleProducts.id,
  name: visibleProducts.name,
  brandName: visibleProducts.brandName,
  articleCode: visibleProducts.articleCode,
  supplierArticleCode: visibleProducts.supplierArticleCode,
  categoryPath: visibleProducts.categoryPath,
  kelvin: visibleProducts.kelvin,
  cri: visibleProducts.cri,
  ipValue: visibleProducts.ipValue,
  lumenOutput: visibleProducts.lumenOutput,
  grossPrice: visibleProducts.grossPrice,
  currency: visibleProducts.currency,
};

export type SearchOptions = {
  query: string;
  brand?: string | null;
  limit?: number;
  actor?: string;
  specLineId?: string | null; // voor het event-log
};

export async function searchProducts(
  db: AppDb,
  opts: SearchOptions,
): Promise<ProductCandidate[]> {
  const query = (opts.query ?? "").trim();
  const brand = (opts.brand ?? "").trim();
  const limit = opts.limit ?? 8;

  let results: ProductCandidate[] = [];
  if (query.length > 0 || brand.length > 0) {
    // 1) Exacte SKU/artikelnummer-match (als de gevraagde tekst een code blijkt te zijn).
    if (query.length > 0) {
      const exact = await db
        .select(SELECTION)
        .from(visibleProducts)
        .where(
          or(
            sql`lower(${visibleProducts.articleCode}) = lower(${query})`,
            sql`lower(${visibleProducts.supplierArticleCode}) = lower(${query})`,
          ),
        )
        .limit(limit);
      results = exact.map((r) => ({ ...r, score: 1, matchKind: "exact" }));
    }

    // 2) Anders: fuzzy op merk + producttekst. Het merk wordt genormaliseerd vergeleken
    //    ("LedsC4" ≡ "LEDS-C4"). Minstens één producttekst-token moet in de naam zitten;
    //    daarna wordt gerangschikt op #matchende tokens en trigram-similariteit — nooit
    //    op prijs (regel 2). Descriptieve woorden ("Adjustable") die niet in de SKU-naam
    //    staan verlagen dus alleen de rang, ze sluiten een kandidaat niet uit.
    if (results.length === 0) {
      const conditions = [];
      if (brand.length > 0) {
        const normBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normBrand.length > 0) {
          conditions.push(
            sql`regexp_replace(lower(${visibleProducts.brandName}), '[^a-z0-9]', '', 'g') like ${"%" + normBrand + "%"}`,
          );
        } else {
          conditions.push(ilike(visibleProducts.brandName, `%${brand}%`));
        }
      }

      const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
      let matchCount = sql<number>`0`;
      if (tokens.length > 0) {
        const tokenMatches = tokens.map(
          (t) => ilike(visibleProducts.name, `%${t}%`) as ReturnType<typeof ilike>,
        );
        conditions.push(or(...tokenMatches)); // ≥1 token aanwezig
        matchCount = sql<number>`(${sql.join(
          tokens.map(
            (t) =>
              sql`(case when ${visibleProducts.name} ilike ${"%" + t + "%"} then 1 else 0 end)`,
          ),
          sql` + `,
        )})`;
      } else if (query.length > 0) {
        conditions.push(ilike(visibleProducts.name, `%${query}%`));
      }
      const score = sql<number>`similarity(${visibleProducts.name}, ${query})`;

      const fuzzy = await db
        .select({ ...SELECTION, score, matchCount })
        .from(visibleProducts)
        .where(conditions.length ? and(...conditions) : undefined)
        // Regel 2: #matchende tokens, dan similariteit, dan naam. Geen prijs, nergens.
        .orderBy(desc(matchCount), desc(score), asc(visibleProducts.name))
        .limit(limit);
      results = fuzzy.map((r) => ({
        id: r.id,
        name: r.name,
        brandName: r.brandName,
        articleCode: r.articleCode,
        supplierArticleCode: r.supplierArticleCode,
        categoryPath: r.categoryPath,
        kelvin: r.kelvin,
        cri: r.cri,
        ipValue: r.ipValue,
        lumenOutput: r.lumenOutput,
        grossPrice: r.grossPrice,
        currency: r.currency,
        score: Number(r.score) || 0,
        matchKind: "fuzzy" as const,
      }));
    }
  }

  await logEvent(db, {
    entity: "spec_line",
    entityId: opts.specLineId ?? null,
    action: "search",
    actor: opts.actor,
    payload: { query, brand, resultCount: results.length },
  });

  return results;
}

// Losse ophaal van één zichtbaar product (voor de offerte-snapshot / detailweergave).
export async function getVisibleProduct(db: AppDb, id: string) {
  const rows = await db
    .select(SELECTION)
    .from(visibleProducts)
    .where(eq(visibleProducts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Ijzeren regel 4: value-engineering-/duurzaamheidssuggesties bestaan UITSLUITEND in de
// gegund-stand. In tender-stand geeft deze poort altijd een lege lijst — hier, centraal.
// De vergelijkingsengine zelf is run 3; de poort staat vanaf nu in de architectuur.
export async function getAlternativeSuggestions(
  db: AppDb,
  opts: { phase: "tender" | "awarded"; productId: string },
): Promise<ProductCandidate[]> {
  if (opts.phase === "tender") return []; // default = veilig
  // gegund: run-3-engine nog niet gebouwd → voorlopig leeg, maar de poort is open.
  return [];
}
