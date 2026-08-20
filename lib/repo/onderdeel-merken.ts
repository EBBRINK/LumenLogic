// Welke merken voeren losse drivers en accessoires? — de databasekant van de
// driver-waarschuwing (docs/goal-vervallen-producten.md, deel 3).
//
// AANLEIDING. Brink heeft een project verkocht en de plastic kits vergeten. Een driver of
// honingraatfilter staat in een prijslijst als losse regel, zonder enige relatie tot het
// armatuur waar hij bij hoort — en die relatie bestaat niet in onze data, niet in de bron,
// en is ook niet af te leiden: een driver kies je niet op wattage, er zijn verschillende
// types. Dus geen koppeling en geen gok. Alleen dit ene merk-brede feit, waarna een mens
// het bij het merk navraagt.
//
// WAAROM MERK-BREED EN NIET PER PRODUCT. Er is geen kolom die zegt "dit product is een
// accessoire" (zie db/schema.ts, products) en `category_path` is gevuld op 19 van de 211k
// rijen. Wat er wél is, is een gemeten naam-regex — en die is betrouwbaar genoeg om te
// tellen, niet om per rij een uitspraak op te hangen. Tellen is precies wat hier gebeurt.
//
// WAAROM NIET OPGESLAGEN. Een afgeleide vlag op `brands` zou meteen achterlopen op de
// eerstvolgende import, en er is geen pad dat hem bijwerkt. De vraag wordt per scherm
// gesteld, over de handvol merken die op dat scherm staan — één geaggregeerde query met een
// `IN`, geen scan over de catalogus.
import { sql } from "drizzle-orm";
import { products } from "@/db/schema";
import {
  ONDERDEEL_DREMPEL,
  onderdeelPatroonSql,
} from "@/lib/onderdeel-signaal";
import type { AppDb } from "./db";

/**
 * Van de meegegeven merknamen: welke voeren er losse onderdelen?
 *
 * Op NAAM en niet op id, omdat `products.brand_name` de kolom is waar de matcher, de
 * kandidatenlijst en de offerteregel allemaal al mee werken — een id zou op elk van die
 * schermen apart doorgegeven moeten worden voor precies dezelfde uitkomst.
 *
 * Lege invoer → lege uitkomst, zonder de database aan te raken. Dat is niet alleen
 * zuinigheid: `IN ()` is geen geldige SQL, en dit is het geval dat zich op elk leeg dossier
 * voordoet.
 */
export async function merkenMetLosseOnderdelen(
  db: AppDb,
  brandNames: readonly (string | null | undefined)[],
): Promise<Set<string>> {
  const namen = [...new Set(brandNames.filter((b): b is string => Boolean(b)))];
  if (namen.length === 0) return new Set();

  const patroon = onderdeelPatroonSql();
  const rows = (await db
    .select({ brandName: products.brandName })
    .from(products)
    .where(
      sql`${products.brandName} in ${namen} and ${products.name} ~* ${patroon}`,
    )
    .groupBy(products.brandName)
    .having(sql`count(*) >= ${ONDERDEEL_DREMPEL}`)) as {
    brandName: string | null;
  }[];

  return new Set(
    rows.map((r) => r.brandName).filter((b): b is string => Boolean(b)),
  );
}
