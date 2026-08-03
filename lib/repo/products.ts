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

// De view-kolommen zijn drizzle-typisch nullable; id/name zijn in werkelijkheid NOT NULL
// (products.id/name). Deze mapper coërceert één rij (uit welke tak dan ook) naar een kandidaat.
function toCandidate(
  r: Record<string, unknown>,
  score: number,
  matchKind: "exact" | "fuzzy",
): ProductCandidate {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    brandName: (r.brandName as string | null) ?? null,
    articleCode: (r.articleCode as string | null) ?? null,
    supplierArticleCode: (r.supplierArticleCode as string | null) ?? null,
    categoryPath: (r.categoryPath as string | null) ?? null,
    kelvin: (r.kelvin as number | null) ?? null,
    cri: (r.cri as number | null) ?? null,
    ipValue: (r.ipValue as string | null) ?? null,
    lumenOutput: (r.lumenOutput as number | null) ?? null,
    grossPrice: (r.grossPrice as string | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    score,
    matchKind,
  };
}

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
      results = exact.map((r) => toCandidate(r, 1, "exact"));
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
      // Prefix-bonus: een naam die mét de zoektekst begint ("SASSO 100 SQ SP CEIL…") is
      // vrijwel zeker het gevraagde armatuur; accessoires noemen de familie meestal
      // middenin ("SNOOT … FOR SASSO 100"). Nog steeds puur tekst — geen prijs (regel 2).
      const prefixBonus =
        query.length > 0
          ? sql<number>`(case when ${visibleProducts.name} ilike ${query + "%"} then 1 else 0 end)`
          : sql<number>`0`;

      // Regel 2: #tokens, dan prefix, dan similariteit, dan naam. Geen prijs, nergens.
      //
      // De constante termen worden WEGGELATEN, niet vervangen — zelfde afvangpatroon als
      // lib/matching/engine.ts. Zonder tokens blijft `matchCount` de letterlijke `0` en
      // zonder zoektekst `prefixBonus` ook, en een kale integer in ORDER BY leest Postgres
      // niet als waarde maar als KOLOMPOSITIE: `order by 0 desc` → "ORDER BY position 0 is
      // not in select list". Daarmee crashte /catalog op een merk zonder zoektekst en op
      // een zoektekst van één teken (tokens zijn stukken van ≥2 tekens, dus één teken
      // levert er nul op). Zet hier dus nooit een `sql`0`` of een dummy-kolom terug.
      //
      // `score` gaat mee op dezelfde voorwaarde. Hij is een functieaanroep en dus géén
      // positionele verwijzing, maar `similarity(name, '')` is gemeten 0 voor élke rij —
      // een sorteersleutel die niets ordent. Bij één teken is hij wél betekenisvol
      // (gemeten 0 / 0,038 / 0,05), dus de grens ligt bij `query.length > 0`, niet bij
      // het aantal tokens.
      const orderTerms = [
        ...(tokens.length > 0 ? [desc(matchCount)] : []),
        ...(query.length > 0 ? [desc(prefixBonus), desc(score)] : []),
        asc(visibleProducts.name),
      ];

      const fuzzy = await db
        .select({ ...SELECTION, score, matchCount })
        .from(visibleProducts)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(...orderTerms)
        .limit(limit);
      results = fuzzy.map((r) => toCandidate(r, Number(r.score) || 0, "fuzzy"));
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
// gegund-stand. In tender-stand geeft de poort altijd een lege lijst. De echte rangschikking
// zit in de gelijkwaardigheidsengine (lib/repo/equivalence.ts); deze wrapper levert een
// beknopte kandidatenlijst voor de match-pagina.
export async function getAlternativeSuggestions(
  db: AppDb,
  opts: { phase: "tender" | "awarded"; productId: string; actor?: string },
): Promise<ProductCandidate[]> {
  if (opts.phase === "tender") return []; // default = veilig
  const { getEquivalentAlternatives } = await import("./equivalence");
  const { alternatives } = await getEquivalentAlternatives(db, {
    phase: opts.phase,
    referenceProductId: opts.productId,
    actor: opts.actor,
  });
  return alternatives.map((a) => ({
    id: a.id,
    name: a.name,
    brandName: a.brandName,
    articleCode: a.articleCode,
    supplierArticleCode: null,
    categoryPath: a.categoryPath,
    kelvin: a.kelvin,
    cri: a.cri,
    ipValue: a.ipValue,
    lumenOutput: null,
    grossPrice: a.grossPrice,
    currency: a.currency,
    score: a.equivalenceScore,
    matchKind: "fuzzy" as const,
  }));
}
