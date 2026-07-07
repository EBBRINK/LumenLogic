// Staffelprijzen (I-05): de stukprijs volgt het aantal. In V1 rekent XIS de staffel;
// hier staat het datamodel + de opzoek-logica. GELD BEÏNVLOEDT NOOIT DE RANKING
// (ijzeren regel 2) — dit is puur een prijs die getóónd wordt bij een gegeven aantal,
// nooit een sortering. Ijzeren regel 3 blijft ook hier staan: de basisprijs komt
// UITSLUITEND uit visible_products (verlopen prijslijst = geen prijs), en een staffel
// telt alleen mee binnen diezelfde geldige prijslijst.
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { priceTiers, visibleProducts } from "@/db/schema";
import type { AppDb } from "./db";

// numeric(12,2) wil een string met twee decimalen; een getal wordt netjes gecoërceerd.
function toPrice(v: number | string): string {
  return typeof v === "number" ? v.toFixed(2) : v;
}

// Zet (of werk bij) één staffeldrempel. Idempotent op (product, prijslijst, min_qty)
// via de unieke index — opnieuw draaien met dezelfde drempel overschrijft de prijs,
// het maakt geen tweede rij.
export async function setPriceTier(
  db: AppDb,
  input: {
    productId: string;
    priceListId: string;
    minQty: number;
    grossPrice: number | string;
  },
) {
  const gross = toPrice(input.grossPrice);
  const [row] = await db
    .insert(priceTiers)
    .values({
      productId: input.productId,
      priceListId: input.priceListId,
      minQty: input.minQty,
      grossPrice: gross,
    })
    .onConflictDoUpdate({
      target: [priceTiers.productId, priceTiers.priceListId, priceTiers.minQty],
      set: { grossPrice: gross },
    })
    .returning();
  return row;
}

// Alle staffeldrempels voor een product, oplopend op aantal — de staffeltabel zoals je
// 'm toont ("vanaf 10 stuks … / vanaf 25 stuks …").
export async function listTiers(db: AppDb, productId: string) {
  return db
    .select()
    .from(priceTiers)
    .where(eq(priceTiers.productId, productId))
    .orderBy(asc(priceTiers.minQty));
}

export type StaffelPrice = {
  unitPrice: string | null;
  minQty: number | null; // de gekozen staffeldrempel; null = basisprijs
  source: "staffel" | "basis" | null; // null = geen geldige prijs (regel 3)
};

// De stukprijs voor een aantal: de hoogste staffeldrempel ≤ aantal, anders de basisprijs
// uit visible_products. Geen zichtbaar product (verlopen prijslijst) → geen prijs, en dan
// telt ook geen staffel mee (regel 3 wordt centraal afgedwongen door de view).
export async function getPriceForQty(
  db: AppDb,
  productId: string,
  qty: number | null,
): Promise<StaffelPrice> {
  const n = qty && qty > 0 ? qty : 1;

  const [base] = await db
    .select({
      grossPrice: visibleProducts.grossPrice,
      priceListId: visibleProducts.priceListId,
    })
    .from(visibleProducts)
    .where(eq(visibleProducts.id, productId))
    .limit(1);
  if (!base || base.grossPrice == null) {
    return { unitPrice: null, minQty: null, source: null };
  }

  const tierConds = [eq(priceTiers.productId, productId), lte(priceTiers.minQty, n)];
  // Bind de staffel aan dezelfde geldige prijslijst als de basisprijs (regel 3).
  if (base.priceListId) tierConds.push(eq(priceTiers.priceListId, base.priceListId));
  const [tier] = await db
    .select({ minQty: priceTiers.minQty, grossPrice: priceTiers.grossPrice })
    .from(priceTiers)
    .where(and(...tierConds))
    .orderBy(desc(priceTiers.minQty))
    .limit(1);

  if (tier) return { unitPrice: tier.grossPrice, minQty: tier.minQty, source: "staffel" };
  return { unitPrice: base.grossPrice, minQty: null, source: "basis" };
}
