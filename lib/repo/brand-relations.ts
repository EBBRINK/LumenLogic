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

import { asc, eq, sql, type SQL } from "drizzle-orm";
import {
  brandRelations,
  brands,
  priceLists,
  prices,
  products,
  type BrandRelationStatus,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { daysUntil } from "./enrichment";
import {
  bucketScore,
  measurableFields,
  scorecardAggregate,
  type BucketScore,
  type CatalogBucket,
  type ScorecardAggregate,
} from "@/lib/field-catalog";
import { laadCatalogus } from "./custom-fields";

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

// ── Compleetheids-aggregatie (stap 4) ────────────────────────────────────────
// Eén SQL met count(*) filter (where <kolom> is not null) per meetbaar veld,
// gegenereerd uit measurableFields(). Het prijs-veld (measure.kind "price") zit
// daar bewust NIET in: dat meten we via een EXISTS op prices ⨝ price_lists —
// sinds 1.6-A ZONDER de valid_until-voorwaarde. Compleetheid meet AANLEVERING,
// niet geldigheid: een prijs op een verlopen lijst telt hier gewoon mee.
// Zichtbaarheid is een aparte as en blijft onverkort bij visible_products
// (ijzeren regel 3) — deze functie raakt die view niet. Het BEDRAG wordt nooit
// gelezen (ijzeren regel 2).

export const PRICE_FIELD_KEY = "list_price_excl_vat";

export type BrandCompleteness = {
  brandId: string;
  productCount: number;
  hasProducts: boolean; // false → UI toont "n.v.t." i.p.v. 0% rood
  // Per veld-key: bij hoeveel producten het veld gevuld is (incl. het prijs-veld).
  filledByField: Record<string, number>;
  buckets: { bucket: CatalogBucket; score: BucketScore }[];
  // Scorecard-aggregatie (1.6-C): categorie- en niveautotalen, veldgewogen (G12).
  aggregate: ScorecardAggregate;
};

// Selectie-fragmenten, gedeeld door getBrandCompleteness en getAllBrandCompleteness
// zodat beide codepaden per definitie identieke cijfers geven.
function completenessSelection(
  catalogus: readonly CatalogBucket[],
): Record<string, SQL<unknown>> {
  const selection: Record<string, SQL<unknown>> = {
    brand_id: sql`${products.brandId}`,
    product_count: sql`count(*)`,
  };
  for (const { field } of measurableFields(catalogus)) {
    if (field.measure.kind === "custom") {
      // EIGEN VELD — bewust GÉÉN sql.raw. De sleutel gaat als BOUND PARAMETER de query in;
      // hij komt namelijk uit gebruikersinvoer (Stefan maakt het veld aan), en een
      // gebruikersgekozen waarde die als identifier in de SQL-tekst belandt is een
      // injectie-poort. Bij de kolomtak hieronder mag sql.raw wél: die kolomnaam staat in
      // lib/field-catalog.ts en komt dus altijd van een programmeur — plus de regex ervoor
      // gooit bij alles wat geen kale identifier is.
      //
      // Dit is óók waarom álle eigen velden in ÉÉN jsonb-kolom leven: hun meting is dan voor
      // elk veld dezelfde uitdrukking met alleen een andere parameter. Er is geen per-veld
      // kolomkeuze die uit sync kan lopen — een eigen veld kán niet bestaan zonder geldige
      // meting.
      //
      // `<> ''` naast `is not null`: het retour-pad kan een eigen veld leegmaken zonder de
      // sleutel te verwijderen, en een lege string als "gevuld" tellen laat de scorecard liegen.
      const id = field.measure.fieldId;
      selection[field.key] = sql`count(*) filter (
        where ${products.customValues} ->> ${id} is not null
          and ${products.customValues} ->> ${id} <> ''
      )`;
      continue;
    }
    if (field.measure.kind !== "column") continue;
    const column = field.measure.column;
    if (!/^[a-z0-9_]+$/.test(column)) {
      throw new Error(`Invalid column name in field-catalog: ${column}`);
    }
    selection[field.key] = sql`count(*) filter (where ${sql.raw(`"${column}"`)} is not null)`;
  }
  // Prijs: EXISTS op prices ⨝ price_lists — sinds 1.6-A ongeacht valid_until (dit
  // meet aanlevering, niet geldigheid; de join blijft staan, maar de datum wordt
  // niet meer als filter gebruikt). Nooit het bedrag (regel 2).
  selection[PRICE_FIELD_KEY] = sql`count(*) filter (where exists (
    select 1 from ${prices} pr
    join ${priceLists} pl on pl.id = pr.price_list_id
    where pr.product_id = ${sql.raw('"products"."id"')}
  ))`;
  return selection;
}

function toCompleteness(
  brandId: string,
  row: Record<string, unknown> | undefined,
  catalogus: readonly CatalogBucket[],
): BrandCompleteness {
  const productCount = row ? Number(row.product_count) : 0;
  const filledByField: Record<string, number> = {};
  if (row) {
    for (const key of Object.keys(row)) {
      if (key === "brand_id" || key === "product_count") continue;
      filledByField[key] = Number(row[key]);
    }
  }
  return {
    brandId,
    productCount,
    hasProducts: productCount > 0,
    filledByField,
    buckets: [...catalogus]
      .sort((a, b) => a.order - b.order)
      .map((bucket) => ({
        bucket,
        score: bucketScore(bucket, filledByField, productCount),
      })),
    aggregate: scorecardAggregate(filledByField, productCount, catalogus),
  };
}

// `catalogus` is optioneel MET een laadfunctie als terugval, en dat is hier iets anders dan
// de verboden default in de pure laag: daar zou een default stil FIELD_CATALOG kiezen en de
// eigen velden laten verdwijnen; hier haalt de terugval juist de complete catalogus uit de
// database. De parameter bestaat zodat een aanroeper die er al een heeft (het overzicht met
// ~436 merken) hem niet per merk opnieuw laadt.
export async function getBrandCompleteness(
  db: AppDb,
  brandId: string,
  catalogus?: readonly CatalogBucket[],
): Promise<BrandCompleteness> {
  const cat = catalogus ?? (await laadCatalogus(db));
  const rows = await db
    .select(completenessSelection(cat))
    .from(products)
    .where(eq(products.brandId, brandId))
    .groupBy(products.brandId);
  return toCompleteness(
    brandId,
    rows[0] as Record<string, unknown> | undefined,
    cat,
  );
}

// Voor het overzicht: alle merken mét producten in één query (geen N+1).
// Merken zonder producten ontbreken in de map — de UI toont daar "n.v.t.".
export async function getAllBrandCompleteness(
  db: AppDb,
  catalogus?: readonly CatalogBucket[],
): Promise<Map<string, BrandCompleteness>> {
  const cat = catalogus ?? (await laadCatalogus(db));
  const rows = (await db
    .select(completenessSelection(cat))
    .from(products)
    .groupBy(products.brandId)) as Record<string, unknown>[];
  const map = new Map<string, BrandCompleteness>();
  for (const row of rows) {
    const brandId = String(row.brand_id);
    map.set(brandId, toCompleteness(brandId, row, cat));
  }
  return map;
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
