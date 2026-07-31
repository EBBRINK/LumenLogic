// Leesfuncties voor /catalog. Nu één functie: de merken-keuzelijst boven het zoekformulier.
//
// WAAROM DIT EEN EIGEN QUERY IS (reviewzwerm 2.5a, B4)
// De pagina deed `selectDistinct(brandName).from(visibleProducts)` — en die staat vóór de
// `if (searched)`, dus hij draaide bij élk bezoek aan /catalog, ook als er niets gezocht
// werd. Tegen de echte database gemeten: parallelle seq scan over producten + prices, 210k
// rijen door de hash join, 262 ms warm / 357 ms koud, voor 28–30 namen. De view assembleert
// daarbij ~30 kolommen per rij terwijl er precies één nodig is (brand_name).
//
// ⚠️ DE UITKOMST MOET IDENTIEK BLIJVEN — dit is géén opschoning maar ijzeren regel 3.
// `visible_products` = products ⨝ prices ⨝ price_lists WHERE valid_from <= today <= valid_until
// (db/migrations/0004). Dat er maar ~30 van de 438 merken uit komen is dus het JUISTE
// antwoord: een merk met een verlopen prijslijst hóórt onzichtbaar te zijn, ook in deze
// keuzelijst. `DISTINCT brand_name` over die join is per definitie gelijk aan "de brand_name
// van elk product dat mínstens één prijsregel in een geldige lijst heeft" — en dat is precies
// wat de EXISTS hieronder uitdrukt. Geen aanname over brands.name vs. products.brand_name:
// de naam komt uit dezelfde kolom als voorheen, alleen de join is een semi-join geworden.
//
// BEWUST GEEN CACHE eromheen. Dat was het alternatief in de review, maar een cache van N
// seconden betekent dat een merk waarvan de prijslijst zojuist verliep N seconden lang in de
// keuzelijst blijft staan. Ijzeren regel 3 zegt "verlopen prijslijst = onzichtbaar in álle
// zoekresultaten", centraal afgedwongen — dat is geen regel waar je een TTL op zet. De winst
// zit in de query zelf, niet in het bewaren van een oud antwoord.
import { and, asc, exists, isNotNull, sql } from "drizzle-orm";
import { priceLists, prices, products } from "@/db/schema";
import type { AppDb } from "./db";

/**
 * De merken met minstens één zichtbaar product, alfabetisch. Zelfde verzameling als
 * `SELECT DISTINCT brand_name FROM visible_products`, zonder de brede join.
 */
export function catalogBrandsQuery(db: AppDb) {
  return db
    .selectDistinct({ brandName: products.brandName })
    .from(products)
    .where(
      and(
        isNotNull(products.brandName),
        // De poort van regel 3, als semi-join: Postgres stopt bij de eerste treffer per
        // product en hoeft de prijsrijen niet te materialiseren.
        exists(
          db
            .select({ een: sql`1` })
            .from(prices)
            .innerJoin(priceLists, sql`${priceLists.id} = ${prices.priceListId}`)
            .where(
              and(
                sql`${prices.productId} = ${products.id}`,
                sql`${priceLists.validFrom} <= current_date`,
                sql`${priceLists.validUntil} >= current_date`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(products.brandName));
}

export async function listCatalogBrands(db: AppDb): Promise<string[]> {
  const rows = (await catalogBrandsQuery(db)) as { brandName: string | null }[];
  // Zelfde nafilter als de pagina had: een lege merknaam is geen keuze.
  return rows.map((r) => r.brandName).filter((b): b is string => Boolean(b));
}
