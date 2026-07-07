// Disclosure & merkrelaties (J-01…J-05, flow §4.11). Dé gedeelde beslissing die
// /producten/[id], /catalogus en /merk allemaal moeten delen: wat mag een kijker zien?
//
// Tiers (op het merk, brands.disclosure_tier):
//   tier1 — alles + adviesprijs (intern/installateur in projectdossier).
//   tier2 — specs altijd; prijs alleen mét goedgekeurd project, anders "Prijs via Brink".
//   tier3 — alleen naam + logo, "data in afwachting van merk".
// Per-veld-uitzonderingen (brand_field_visibility) overschrijven de tier (J-04).
//
// Regel 3 blijft heilig: een prijs die getoond mag worden komt nog steeds uit
// visible_products (verlopen prijslijst = geen prijs).
import { eq } from "drizzle-orm";
import {
  brandFieldVisibility,
  leads,
  visibleProducts,
  visibleSpecs,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type DisclosureTier = "tier1" | "tier2" | "tier3";

export type ViewerContext = {
  internal: boolean; // Brink-binnendienst of ingelogde installateur
  hasApprovedProject: boolean; // gekoppeld aan een goedgekeurd project (tier 2-prijs)
};

export type Disclosure = {
  showName: boolean; // altijd true
  showSpecs: boolean; // tier1/tier2 → true; tier3 → false
  showPrice: boolean; // prijs echt tonen
  priceGated: boolean; // toon "Prijs via Brink aanvragen" i.p.v. de prijs
  awaitingData: boolean; // tier3: "data in afwachting van merk"
  tier: DisclosureTier;
};

// De kernbeslisboom (§4.11). Puur, testbaar, zonder db.
export function resolveDisclosure(
  tier: DisclosureTier,
  ctx: ViewerContext,
): Disclosure {
  if (tier === "tier3") {
    return {
      showName: true,
      showSpecs: false,
      showPrice: false,
      priceGated: false,
      awaitingData: true,
      tier,
    };
  }
  if (tier === "tier2") {
    const canSeePrice = ctx.internal || ctx.hasApprovedProject;
    return {
      showName: true,
      showSpecs: true,
      showPrice: canSeePrice,
      priceGated: !canSeePrice, // → "Prijs via Brink aanvragen" (J-03)
      awaitingData: false,
      tier,
    };
  }
  // tier1
  return {
    showName: true,
    showSpecs: true,
    showPrice: true,
    priceGated: false,
    awaitingData: false,
    tier,
  };
}

// Mag één specifiek veld getoond worden? Per-veld-uitzondering overschrijft de tier (J-04).
export function fieldVisible(
  base: boolean,
  overrides: Record<string, boolean>,
  field: string,
): boolean {
  if (field in overrides) return overrides[field];
  return base;
}

export async function getBrandFieldOverrides(
  db: AppDb,
  brandId: string,
): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(brandFieldVisibility)
    .where(eq(brandFieldVisibility.brandId, brandId));
  return Object.fromEntries(rows.map((r) => [r.field, r.visible]));
}

export async function setBrandFieldVisibility(
  db: AppDb,
  brandId: string,
  field: string,
  visible: boolean,
) {
  await db
    .insert(brandFieldVisibility)
    .values({ brandId, field, visible })
    .onConflictDoUpdate({
      target: [brandFieldVisibility.brandId, brandFieldVisibility.field],
      set: { visible },
    });
}

// Productkaart-data (J-01): specs uit visible_specs; prijs alleen mee als disclosure
// het toestaat, en dan uit visible_products (regel 3).
export async function getProductForDisclosure(
  db: AppDb,
  productId: string,
  ctx: ViewerContext,
) {
  const [spec] = await db
    .select()
    .from(visibleSpecs)
    .where(eq(visibleSpecs.id, productId))
    .limit(1);
  if (!spec) return null;
  const tier = (spec.disclosureTier ?? "tier1") as DisclosureTier;
  const disclosure = resolveDisclosure(tier, ctx);
  let price: { grossPrice: string | null; currency: string | null } | null = null;
  if (disclosure.showPrice) {
    const [pv] = await db
      .select({
        grossPrice: visibleProducts.grossPrice,
        currency: visibleProducts.currency,
      })
      .from(visibleProducts)
      .where(eq(visibleProducts.id, productId))
      .limit(1);
    price = pv ?? null;
  }
  const overrides = spec.brandId
    ? await getBrandFieldOverrides(db, spec.brandId)
    : {};
  return { spec, disclosure, price, overrides };
}

// J-03: prijsaanvraag = een lead. Gelogd voor opvolging.
export async function createLead(
  db: AppDb,
  input: {
    productId?: string | null;
    brandId?: string | null;
    userEmail?: string | null;
    orgId?: string | null;
    dossierId?: string | null;
    note?: string | null;
  },
) {
  const [row] = await db
    .insert(leads)
    .values({
      productId: input.productId ?? null,
      brandId: input.brandId ?? null,
      userEmail: input.userEmail ?? null,
      orgId: input.orgId ?? null,
      dossierId: input.dossierId ?? null,
      note: input.note ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "lead",
    entityId: row.id,
    action: "lead_price_requested",
    actor: input.userEmail ?? undefined,
    payload: { productId: input.productId ?? null, brandId: input.brandId ?? null },
  });
  return row;
}

export async function listLeads(db: AppDb) {
  return db.select().from(leads).orderBy(leads.createdAt);
}

export async function updateLeadStatus(
  db: AppDb,
  leadId: string,
  status: "open" | "opgevolgd" | "gesloten",
) {
  await db.update(leads).set({ status }).where(eq(leads.id, leadId));
}
