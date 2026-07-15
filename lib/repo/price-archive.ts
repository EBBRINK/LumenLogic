// Prijslijst-vervanging + archief (plan-datamodel-productspecs, laag 3).
// `prices` bevat alléén de actuele catalogus; verlopen/vervangen prijsregels
// verhuizen naar archive.prices_archive (SCD type 4, append-only, geen FK's).
// Offertes blijven verantwoordbaar via hun eigen snapshot (laag 4) — het archief
// is puur "welke lijst gold toen", niet nodig om een oude offerte te renderen.
import { and, eq, isNull } from "drizzle-orm";
import { priceLists, prices, pricesArchive } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// Verplaatst alle prijsregels van één prijslijst naar het archief en markeert de
// lijst als vervangen. Idempotent genoeg: een al-vervangen lijst zonder prijsregels
// levert gewoon 0 gearchiveerde rijen op.
export async function archivePriceList(
  db: AppDb,
  priceListId: string,
  actor?: string,
): Promise<{ archivedCount: number }> {
  const [list] = await db
    .select()
    .from(priceLists)
    .where(eq(priceLists.id, priceListId));
  if (!list) throw new Error(`Price list ${priceListId} does not exist`);

  const rows = await db
    .select()
    .from(prices)
    .where(eq(prices.priceListId, priceListId));

  if (rows.length > 0) {
    await db.insert(pricesArchive).values(
      rows.map((p) => ({
        originalPriceId: p.id,
        productId: p.productId,
        priceListId: list.id,
        priceListName: list.name,
        brandId: list.brandId,
        grossPrice: p.grossPrice,
        purchasePrice: p.purchasePrice,
        currency: p.currency,
        validFrom: list.validFrom,
        validUntil: list.validUntil,
        archivedBy: actor ?? null,
      })),
    );
    await db.delete(prices).where(eq(prices.priceListId, priceListId));
  }

  // Lijst-metadata blijft bestaan (quote_lines.price_list_id verwijst ernaar),
  // maar telt niet meer als actief — de partiële unique op brand_id komt vrij
  // voor de opvolger.
  await db
    .update(priceLists)
    .set({ replacedAt: new Date() })
    .where(eq(priceLists.id, priceListId));

  await logEvent(db, {
    entity: "price_list",
    entityId: priceListId,
    action: "price_list_archived",
    actor,
    payload: { brandId: list.brandId, archivedCount: rows.length },
  });
  return { archivedCount: rows.length };
}

// Nieuwe prijslijst voor een merk: archiveert eerst de actieve lijst (als die er
// is) en maakt daarna de nieuwe aan. Dé route voor "prijslijst 2027 komt binnen".
export async function replacePriceList(
  db: AppDb,
  brandId: string,
  next: { name: string; validFrom: string; validUntil: string },
  actor?: string,
): Promise<{ priceListId: string; archivedCount: number }> {
  const [active] = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.brandId, brandId), isNull(priceLists.replacedAt)));

  let archivedCount = 0;
  if (active) {
    ({ archivedCount } = await archivePriceList(db, active.id, actor));
  }
  const [created] = await db
    .insert(priceLists)
    .values({ brandId, ...next })
    .returning();
  await logEvent(db, {
    entity: "price_list",
    entityId: created.id,
    action: "price_list_created",
    actor,
    payload: { brandId, replaced: active?.id ?? null },
  });
  return { priceListId: created.id, archivedCount };
}
