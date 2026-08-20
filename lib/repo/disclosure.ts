// Disclosure & merkrelaties (J-01…J-05, flow §4.11). Dé gedeelde beslissing die
// /products/[id], /catalog en /brand allemaal moeten delen: wat mag een kijker zien?
//
// Tiers (op het merk, brands.disclosure_tier):
//   tier1 — alles + adviesprijs (intern/installateur in projectdossier).
//   tier2 — specs altijd; prijs alleen mét goedgekeurd project, anders "Prijs via Brink".
//   tier3 — alleen naam + logo, "data in afwachting van merk".
// Per-veld-uitzonderingen (brand_field_visibility) overschrijven de tier (J-04).
//
// Regel 3 blijft heilig: een prijs die getoond mag worden komt nog steeds uit
// visible_products (verlopen prijslijst = geen prijs).
//
// ⚠️ GEEN ENKELE TIER TOONT EEN PRIJS ZONDER KIJKERCONTEXT (ijzeren regel 1).
//
// Reviewzwerm 2.5a/A5: de tier1-tak negeerde `ctx` volledig en gaf onvoorwaardelijk
// `showPrice: true, priceGated: false`. Gecombineerd met de schema-default
// (`brands.disclosure_tier` stond op tier1, dus élk merk was tier1 tenzij handmatig
// omgezet) en de `?? "tier1"`-fallback voor merkloze producten was dat fail-open op
// een toestemmingsvlag: de briefing zegt "Tier 1: volledige data + adviesprijs (merk
// expliciet akkoord)", en een default die voor elk merk toestemming aanneemt die nooit
// gegeven is, is precies wat J-05 (de anti-webshop-invariant, "geen publieke prijzen")
// verbiedt.
//
// Het ontwerp had de tak al getekend en de code implementeerde hem niet:
// FUNCTIONEEL-ONTWERP §4.11 splitst ónder tier1 op context — intern/installateur →
// alles inclusief adviesprijs; specifier zónder project → specs, adviesprijs alleen
// projectgebonden. Beide takken sluiten een anonieme kijker uit. Die splitsing staat
// nu in de code.
//
// Dit is de tweede helft van de fix; de eerste is de sessiepoort op
// app/products/[id]/page.tsx. Ze dekken elkaar niet: de poort houdt anonieme kijkers
// tegen, deze functie zorgt dat óók een ingelogde kijker zónder recht geen prijs krijgt.
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
  // tier1 — §4.11: intern/installateur ziet alles inclusief adviesprijs; een
  // specifier zonder project ziet de specs, maar de adviesprijs is projectgebonden.
  // Dezelfde contextvoorwaarde als tier2; het verschil tussen de tiers zit in de
  // specs (tier3 verbergt die) en in de per-veld-uitzonderingen, niet in de vraag of
  // een kijker zónder recht een prijs mag zien. Die vraag heeft één antwoord: nee.
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
  // visible_specs.disclosure_tier is nullable (een product zonder merk heeft geen
  // tier). Die onbekende waarde viel op tier1 terug — de ruimste stand. Onbekend is
  // geen toestemming, dus de fallback is de striktste stand die de specs nog toont
  // (A5). Voor een ingelogde interne kijker verandert er niets: tier2 geeft die
  // gewoon specs én prijs.
  const tier = (spec.disclosureTier ?? "tier2") as DisclosureTier;
  const disclosure = resolveDisclosure(tier, ctx);
  // Sinds migratie 0022 (regel 3, herschreven) staat een vervallen product hier gewoon in
  // de view, zónder bedrag. `grossPrice` is dan NULL en zou als "—" op de kaart landen —
  // precies de stille variant die we kwijt wilden. De toestand gaat daarom mee, zodat de
  // kaart kan zeggen wát er aan de hand is en welke prijslijst de laatste was.
  let price: {
    grossPrice: string | null;
    currency: string | null;
    priceState?: string | null;
    lastPriceListName?: string | null;
    lastPriceListValidUntil?: string | null;
  } | null = null;
  if (disclosure.showPrice) {
    const [pv] = await db
      .select({
        grossPrice: visibleProducts.grossPrice,
        currency: visibleProducts.currency,
        priceState: visibleProducts.priceState,
        lastPriceListName: visibleProducts.lastPriceListName,
        lastPriceListValidUntil: visibleProducts.lastPriceListValidUntil,
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

// J-03: pricerequest = een lead. Gelogd voor opvolging.
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
