// Leesfuncties voor /catalog. Nu één functie: de merken-keuzelijst boven het zoekformulier.
//
// WAAROM DIT EEN EIGEN QUERY IS (reviewzwerm 2.5a, B4)
// De pagina deed `selectDistinct(brandName).from(visibleProducts)` — en die staat vóór de
// `if (searched)`, dus hij draaide bij élk bezoek aan /catalog, ook als er niets gezocht
// werd. Tegen de echte database gemeten: parallelle seq scan over producten + prices, 210k
// rijen door de hash join, 262 ms warm / 357 ms koud, voor 28–30 namen. De view assembleert
// daarbij ~30 kolommen per rij terwijl er precies één nodig is (brand_name).
//
// ⚠️ DE UITKOMST MOET IDENTIEK BLIJVEN AAN DIE VAN DE VIEW — dit is géén opschoning maar
// ijzeren regel 3. Sinds migratie 0022 luidt die regel: "verlopen prijslijst = product
// zichtbaar zonder prijs". `visible_products` = elk product waarvan we een prijs kennen óf
// ooit kenden (een prijsregel in een begonnen lijst, of een rij in archive.prices_archive).
// Dat er nu méér merken uit komen dan de ~30 van vóór 0022 is dus het JUISTE antwoord: een
// merk met een verlopen prijslijst hóórt vindbaar te zijn, ook in deze keuzelijst — anders
// kun je niet naar de producten filteren die je nu juist wél moet kunnen vinden.
//
// De twee EXISTS'en hieronder zijn samen precies de WHERE van de view. `valid_from <=
// current_date` blijft staan: een nog-niet-begonnen lijst is geen verval maar het
// omgekeerde, en die producten blijven onzichtbaar (zie de kop van 0022). `valid_until`
// staat er bewust NIET meer in — dat was de hele wijziging.
//
// BEWUST GEEN CACHE eromheen. Dat was het alternatief in de review, maar een cache van N
// seconden betekent dat een merk waarvan de prijslijst zojuist verliep N seconden lang het
// verkeerde antwoord geeft. De winst zit in de query zelf, niet in het bewaren van een oud
// antwoord.
import { and, asc, exists, isNotNull, or, sql } from "drizzle-orm";
import { priceLists, prices, pricesArchive, products } from "@/db/schema";
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
        or(
          exists(
            db
              .select({ een: sql`1` })
              .from(prices)
              .innerJoin(priceLists, sql`${priceLists.id} = ${prices.priceListId}`)
              .where(
                and(
                  sql`${prices.productId} = ${products.id}`,
                  sql`${priceLists.validFrom} <= current_date`,
                ),
              ),
          ),
          // De tweede helft van de view: uit de lijst gevallen, maar wél gearchiveerd.
          exists(
            db
              .select({ een: sql`1` })
              .from(pricesArchive)
              .where(sql`${pricesArchive.productId} = ${products.id}`),
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
