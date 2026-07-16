// Prijslijst-vervanging + archief (plan-datamodel-productspecs, laag 3).
// `prices` bevat alléén de actuele catalogus; verlopen/vervangen prijsregels
// verhuizen naar archive.prices_archive (SCD type 4, append-only, geen FK's).
// Offertes blijven verantwoordbaar via hun eigen snapshot (laag 4) — het archief
// is puur "welke lijst gold toen", niet nodig om een oude offerte te renderen.
import { and, eq, inArray, isNull } from "drizzle-orm";
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

// ── Regel-niveau bijwerking (sprint 1.2, retour-pad; plan besluit 1) ──────────
// GEDEELTELIJKE bijwerking, en daarom NIET replacePriceList. Een ingevuld merk-template is
// per constructie een deelverzameling: het template zegt "one product per row" en de
// validator accepteert elk aantal rijen, dus een geldig bestand kan 40 van 500 producten
// bevatten. replacePriceList zou de andere 460 prijsregels archiveren en die producten via
// visible_products onzichtbaar maken (ijzeren regel 3) — schade uit een bestand dat nooit
// beweerde volledig te zijn. Alleen de aangeleverde regels bewegen hier.
//
// VERWIJDERT NOOIT een prijsregel: een lege prijscel is op dit pad een conflict, geen
// opdracht (zie ConflictReden 'price_clear' in lib/template-diff.ts).
//
// Geen db.transaction(): neon-http gooit daarop (PGlite niet — groene tests, kapotte app).
// De veiligheid komt van de vorm: gelijke waarde = no-op, dus tweemaal draaien archiveert
// niet twee keer, en de upsert loopt op de natuurlijke sleutel (product_id, price_list_id).
export async function upsertPriceLines(
  db: AppDb,
  brandId: string,
  lines: { productId: string; grossPrice: string }[],
  opts: {
    newList?: { name: string; validFrom: string; validUntil: string };
    actor?: string;
  },
): Promise<{
  priceListId: string;
  inserted: number;
  updated: number;
  archivedLines: number;
}> {
  // price_lists_brand_active_uniq garandeert er hoogstens één.
  let [list] = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.brandId, brandId), isNull(priceLists.replacedAt)));

  if (!list) {
    // Geen datums verzinnen: valid_until drijft ijzeren regel 3, en een gegokte einddatum
    // maakt óf te vroeg alles onzichtbaar óf houdt een verlopen lijst kunstmatig geldig.
    // De aanroeper vraagt het uit (submitBrandUpload weigert een lijst zonder einddatum al).
    if (!opts.newList) {
      throw new Error(
        `Brand ${brandId} has no active price list; provide opts.newList (name, validFrom, validUntil)`,
      );
    }
    [list] = await db
      .insert(priceLists)
      .values({ brandId, ...opts.newList })
      .returning();
    await logEvent(db, {
      entity: "price_list",
      entityId: list.id,
      action: "price_list_created",
      actor: opts.actor,
      payload: { brandId, replaced: null },
    });
  }

  let inserted = 0;
  let updated = 0;
  let archivedLines = 0;

  if (lines.length > 0) {
    const bestaand = new Map(
      (
        await db
          .select()
          .from(prices)
          .where(
            and(
              eq(prices.priceListId, list.id),
              inArray(
                prices.productId,
                lines.map((l) => l.productId),
              ),
            ),
          )
      ).map((p) => [p.productId, p]),
    );

    for (const line of lines) {
      const huidig = bestaand.get(line.productId);
      // Idempotentie: numeriek vergelijken, niet als tekst — numeric(12,2) geeft "196.00"
      // terug waar de diff "196" aanlevert. Tekstvergelijking zou elke herhaalde
      // goedkeuring een archiefrij laten schrijven voor een prijs die niet veranderde.
      if (huidig && gelijkeBedragen(huidig.grossPrice, line.grossPrice)) continue;

      if (huidig) {
        // EERST archiveren, dan overschrijven. Andersom is de oude prijs weg zodra de
        // archiefschrijving faalt — en het archief is het enige spoor dat we hebben.
        await db.insert(pricesArchive).values({
          originalPriceId: huidig.id,
          productId: huidig.productId,
          priceListId: list.id,
          priceListName: list.name,
          brandId: list.brandId,
          grossPrice: huidig.grossPrice,
          purchasePrice: huidig.purchasePrice,
          currency: huidig.currency,
          // Zelfde semantiek als archivePriceList: de geldigheid van de LIJST waaronder de
          // prijs gold, niet het moment van archiveren (dat is archived_at).
          validFrom: list.validFrom,
          validUntil: list.validUntil,
          archivedBy: opts.actor ?? null,
        });
        archivedLines++;
      }

      await db
        .insert(prices)
        .values({
          productId: line.productId,
          priceListId: list.id,
          grossPrice: line.grossPrice,
        })
        .onConflictDoUpdate({
          target: [prices.productId, prices.priceListId],
          set: { grossPrice: line.grossPrice, updatedAt: new Date() },
        });

      if (huidig) updated++;
      else inserted++;
    }
  }

  await logEvent(db, {
    entity: "price_list",
    entityId: list.id,
    action: "price_lines_upserted",
    actor: opts.actor,
    payload: {
      brandId,
      inserted,
      updated,
      archivedLines,
      unchanged: lines.length - inserted - updated,
    },
  });

  return { priceListId: list.id, inserted, updated, archivedLines };
}

function gelijkeBedragen(a: string, b: string): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : a.trim() === b.trim();
}
