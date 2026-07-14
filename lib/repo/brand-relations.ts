// Merkrelaties (plan-merkrelaties K1/K2/K7/K8): de relatie-/inwinningslaag over de
// ~430 bron-merken heen — wie is benaderd, wat is de status, is er een geldige prijslijst.
//
// Ontwerpregels die hier leven:
//   • Reads schrijven NOOIT: een merk zonder brand_relations-rij is virtueel
//     'niet_benaderd' (LEFT JOIN + COALESCE). Alleen upsertBrandRelation schrijft.
//   • Race-vrij schrijven: INSERT … ON CONFLICT (brand_id) DO UPDATE.
//   • Regel 5: elke statuswijziging → event 'brand_relation_status_changed' met
//     payload {from, to}; overige veldwijzigingen → 'brand_relation_updated'.
//     Beide kunnen uit één save komen.
//   • K8: brands.brand_code is niet uniek (bv. L052 dubbel) — merken die een code
//     delen krijgen een dubbele-code-markering, zodat niemand dubbel belt.

import { asc, eq, sql } from "drizzle-orm";
import {
  brandRelations,
  brands,
  priceLists,
  products,
  type BrandRelationStatus,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { daysUntil } from "./enrichment";

// Prijslijst-indicator voor het overzicht. 'verloopt_binnenkort' volgt dezelfde
// 30-dagen-horizon als de waarschuwingsbuckets van listPriceListStatus.
export type PriceListIndicator =
  | "aanwezig_geldig"
  | "verloopt_binnenkort"
  | "verlopen"
  | "ontbreekt";

const VERLOOPT_BINNENKORT_DAGEN = 30;

export function priceListIndicator(
  validUntil: string | null,
  today: Date = new Date(),
): PriceListIndicator {
  if (!validUntil) return "ontbreekt";
  const daysLeft = daysUntil(validUntil, today);
  if (daysLeft < 0) return "verlopen";
  if (daysLeft <= VERLOOPT_BINNENKORT_DAGEN) return "verloopt_binnenkort";
  return "aanwezig_geldig";
}

export type BrandRelationRow = {
  brandId: string;
  brandName: string;
  brandCode: string | null;
  status: BrandRelationStatus;
  contactName: string | null;
  contactEmail: string | null;
  lastContactAt: string | null;
  notes: string | null;
  productCount: number;
  priceListValidUntil: string | null;
  priceListIndicator: PriceListIndicator;
  sharedBrandCode: boolean; // K8: dubbele-code-badge
};

// Alle merken met (virtuele) relatiestatus + prijslijst-indicator + productaantal.
// Puur lezen — een merk zonder rij komt terug als 'niet_benaderd' zonder dat er
// ooit een rij ontstaat.
export async function listBrandRelations(
  db: AppDb,
  today: Date = new Date(),
): Promise<BrandRelationRow[]> {
  // Eén rij per merk, ook bij meerdere prijslijst-rijen (bv. vervangen lijsten):
  // we aggregeren naar de nieuwste einddatum per merk i.p.v. een kale LEFT JOIN,
  // die zou fan-outen zodra een merk >1 prijslijst heeft.
  const latestList = db
    .select({
      brandId: priceLists.brandId,
      validUntil: sql<string>`max(${priceLists.validUntil})`.as("valid_until"),
    })
    .from(priceLists)
    .groupBy(priceLists.brandId)
    .as("latest_list");

  const rows = await db
    .select({
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.brandCode,
      status: sql<BrandRelationStatus>`coalesce(${brandRelations.status}, 'niet_benaderd')`,
      contactName: brandRelations.contactName,
      contactEmail: brandRelations.contactEmail,
      lastContactAt: brandRelations.lastContactAt,
      notes: brandRelations.notes,
      priceListValidUntil: latestList.validUntil,
      productCount: sql<number>`(
        select count(*) from ${products} p where p.brand_id = ${brands.id}
      )`,
    })
    .from(brands)
    .leftJoin(brandRelations, eq(brandRelations.brandId, brands.id))
    .leftJoin(latestList, eq(latestList.brandId, brands.id))
    .orderBy(asc(brands.name));

  // K8: codes die door méér dan één merk gedragen worden.
  const codeCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.brandCode) {
      codeCounts.set(r.brandCode, (codeCounts.get(r.brandCode) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    brandId: r.brandId,
    brandName: r.brandName,
    brandCode: r.brandCode,
    status: r.status,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    lastContactAt: r.lastContactAt,
    notes: r.notes,
    productCount: Number(r.productCount),
    priceListValidUntil: r.priceListValidUntil,
    priceListIndicator: priceListIndicator(r.priceListValidUntil, today),
    sharedBrandCode:
      r.brandCode != null && (codeCounts.get(r.brandCode) ?? 0) > 1,
  }));
}

export type BrandRelationPatch = Partial<{
  status: BrandRelationStatus;
  contactName: string | null;
  contactEmail: string | null;
  lastContactAt: string | null;
  notes: string | null;
}>;

// Enige schrijver (K2): upsert op brand_id. Events (K7):
// • status écht gewijzigd → 'brand_relation_status_changed' {from, to}
// • andere velden in de patch → 'brand_relation_updated' {fields}
export async function upsertBrandRelation(
  db: AppDb,
  brandId: string,
  patch: BrandRelationPatch,
  actor?: string,
): Promise<typeof brandRelations.$inferSelect> {
  // Huidige (virtuele) status bepalen vóór de write, voor het {from, to}-event.
  const [existing] = await db
    .select({ status: brandRelations.status })
    .from(brandRelations)
    .where(eq(brandRelations.brandId, brandId))
    .limit(1);
  const from: BrandRelationStatus = existing?.status ?? "niet_benaderd";

  const [row] = await db
    .insert(brandRelations)
    .values({ brandId, ...patch })
    .onConflictDoUpdate({
      target: brandRelations.brandId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();

  const statusChanged = patch.status !== undefined && patch.status !== from;
  if (statusChanged) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "brand_relation_status_changed",
      actor,
      payload: { from, to: patch.status },
    });
  }

  const otherFields = Object.keys(patch).filter((k) => k !== "status");
  if (otherFields.length > 0) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "brand_relation_updated",
      actor,
      payload: { fields: otherFields },
    });
  }

  return row;
}
