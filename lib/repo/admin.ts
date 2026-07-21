// Admin-console-repository (H3, Brink-beheer, functioneel ontwerp §3.16). De binnendienst
// beheert hier de merk-disclosure (tiers + per-veld-zichtbaarheid), keurt merk-uploads goed
// via één publicatiepad (H-11), ziet gebruikers over alle orgs (L-03/04) en heeft event-inzage
// (ijzeren regel 5). De PDL/ConnectingTheDots-import landt als staging-upload — nooit direct
// in de catalogus, altijd via de goedkeuringspoort (H-10/H-11).
//
// Zelfde patroon als de andere repo's: db geïnjecteerd, disclosure-schrijfacties hergebruikt
// uit lib/repo/disclosure.ts zodat de gating-contract op één plek leeft.
import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import {
  brandUploads,
  brands,
  memberships,
  organizations,
  products,
  type BrandLifecycle,
} from "@/db/schema";
import type { AppDb } from "./db";
import {
  getBrandFieldOverrides,
  setBrandFieldVisibility,
  type DisclosureTier,
} from "./disclosure";
import { logEvent, recentEvents } from "./events";
import { TEMPLATE_UPLOAD_KIND } from "./template-return";

export type BrandWithTier = {
  id: string;
  name: string;
  brandCode: string | null;
  lifecycle: BrandLifecycle;
  disclosureTier: DisclosureTier;
  productCount: number;
};

// Alle merken met hun disclosure-tier + aantal producten (§3.16 merkenoverzicht). Left join
// zodat een merk zonder producten (net ingeladen, blauw) óók telt — nul is een eerlijk getal.
//
// 1.5: brandCode en lifecycle komen additief mee in dezelfde select (nul extra queries), en
// opts filtert server-side voor de filterbalk — G1's klacht is juist dat je op de status niet
// kunt filteren, dus een levensfase zónder filter lost niets op. Zonder opts is het gedrag
// exact als voorheen, zodat geen bestaande aanroeper breekt.
export async function listBrandsWithTier(
  db: AppDb,
  opts?: { q?: string; lifecycle?: BrandLifecycle },
): Promise<BrandWithTier[]> {
  const filters: SQL[] = [];
  const q = opts?.q?.trim();
  if (q) {
    // Naam OF merkcode, hoofdletterongevoelig: je zoekt het merk zoals je het kent.
    const like = `%${q}%`;
    filters.push(
      sql`(${brands.name} ilike ${like} or (${brands.brandCode} is not null and ${brands.brandCode} ilike ${like}))`,
    );
  }
  if (opts?.lifecycle) filters.push(eq(brands.lifecycle, opts.lifecycle));

  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      brandCode: brands.brandCode,
      lifecycle: brands.lifecycle,
      disclosureTier: brands.disclosureTier,
      productCount: sql<number>`count(${products.id})`.mapWith(Number),
    })
    .from(brands)
    .leftJoin(products, eq(products.brandId, brands.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .groupBy(
      brands.id,
      brands.name,
      brands.brandCode,
      brands.lifecycle,
      brands.disclosureTier,
    )
    .orderBy(asc(brands.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brandCode: r.brandCode,
    lifecycle: r.lifecycle as BrandLifecycle,
    disclosureTier: r.disclosureTier as DisclosureTier,
    productCount: r.productCount,
  }));
}

// Disclosure-tier van een merk zetten (J-02). Dit stuurt wat een externe kijker ziet, nooit
// de ranking — er is geen knop die zichtbaarheid tegen geld ruilt (ijzeren regel).
export async function setBrandTier(
  db: AppDb,
  brandId: string,
  tier: DisclosureTier,
  actor?: string,
) {
  await db
    .update(brands)
    .set({ disclosureTier: tier, updatedAt: new Date() })
    .where(eq(brands.id, brandId));
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_tier_changed",
    actor,
    payload: { tier },
  });
}

// Per-veld-uitzonderingen (J-04): de disclosure-repo is de bron van waarheid, admin leent
// alleen de lees/schrijf. Geen tweede implementatie van dezelfde regel.
export async function listBrandFieldOverrides(db: AppDb, brandId: string) {
  return getBrandFieldOverrides(db, brandId);
}

export async function setBrandFieldOverride(
  db: AppDb,
  brandId: string,
  field: string,
  visible: boolean,
  actor?: string,
) {
  await setBrandFieldVisibility(db, brandId, field, visible);
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_field_visibility_changed",
    actor,
    payload: { field, visible },
  });
}

// ── Merk-uploads: één publicatiepad via staging → goedkeuring (H-11) ─────────
// Alleen wat wacht op een menselijke keuze. Approved/rejected zijn afgehandeld en horen
// niet meer in de wachtrij.
//
// kind='template' hoort hier NIET (sprint 1.2, plan besluit 9): approveUpload hieronder flipt
// alleen de status en past NIETS toe. Een retour-pad-upload zou hier dus een goedkeurknop
// krijgen die stil niets doet — precies het gedrag dat 1.2 moet uitroeien — en die de upload
// bovendien van staging haalt, waarmee het échte voorstel-scherm (de dubbelklik-poort van
// applyTemplateProposal kijkt naar exact deze status) onbereikbaar wordt. Template-uploads
// worden beoordeeld op hun eigen voorstel-scherm bij de merkrelatie:
// /data/brand-relations/[brandId]/upload/[uploadId] — één upload, één goedkeuringspoort.
export async function listBrandUploadsForReview(db: AppDb) {
  return db
    .select({
      id: brandUploads.id,
      brandId: brandUploads.brandId,
      brandName: brands.name,
      kind: brandUploads.kind,
      status: brandUploads.status,
      submittedBy: brandUploads.submittedBy,
      createdAt: brandUploads.createdAt,
    })
    .from(brandUploads)
    .leftJoin(brands, eq(brands.id, brandUploads.brandId))
    .where(
      and(
        eq(brandUploads.status, "staging"),
        ne(brandUploads.kind, TEMPLATE_UPLOAD_KIND),
      ),
    )
    .orderBy(asc(brandUploads.createdAt));
}

export async function approveUpload(
  db: AppDb,
  uploadId: string,
  reviewedBy: string,
) {
  const [row] = await db
    .update(brandUploads)
    .set({ status: "approved", reviewedBy, updatedAt: new Date() })
    .where(eq(brandUploads.id, uploadId))
    .returning();
  if (row) {
    await logEvent(db, {
      entity: "brand_upload",
      entityId: uploadId,
      action: "brand_upload_approved",
      actor: reviewedBy,
      payload: { brandId: row.brandId, kind: row.kind },
    });
  }
  return row ?? null;
}

// Afwijzen draagt altijd een notitie — een afwijzing zonder reden is geen data, net als
// een gearchiveerd dossier (A-05, dezelfde geest).
export async function rejectUpload(
  db: AppDb,
  uploadId: string,
  reviewedBy: string,
  note: string,
) {
  const [row] = await db
    .update(brandUploads)
    .set({
      status: "rejected",
      reviewedBy,
      reviewNote: note,
      updatedAt: new Date(),
    })
    .where(eq(brandUploads.id, uploadId))
    .returning();
  if (row) {
    await logEvent(db, {
      entity: "brand_upload",
      entityId: uploadId,
      action: "brand_upload_rejected",
      actor: reviewedBy,
      payload: { brandId: row.brandId, note },
    });
  }
  return row ?? null;
}

// ── Gebruikersbeheer over orgs (L-03/04) ─────────────────────────────────────
// Alle memberships met hun org-naam, voor de admin die over org-grenzen kijkt.
export async function listAllMemberships(db: AppDb) {
  return db
    .select({
      id: memberships.id,
      orgId: memberships.orgId,
      orgName: organizations.name,
      email: memberships.email,
      roles: memberships.roles,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .orderBy(asc(organizations.name), asc(memberships.email));
}

// ── PDL / ConnectingTheDots-import als staging-stub (H-10) ────────────────────
// Externe productdata komt binnen als een staging brand_upload van kind 'data' — nooit
// stilzwijgend de catalogus in. De binnendienst keurt het daarna goed (H-11), zelfde poort
// als een merk-upload. brandId is verplicht (FK); het merk waaraan de data hangt.
export async function recordPdlImport(
  db: AppDb,
  input: {
    brandId: string;
    payload: Record<string, unknown>;
    actor?: string;
  },
) {
  const [row] = await db
    .insert(brandUploads)
    .values({
      brandId: input.brandId,
      kind: "data",
      payload: input.payload,
      status: "staging",
      submittedBy: input.actor ?? "pdl-import",
    })
    .returning();
  await logEvent(db, {
    entity: "brand_upload",
    entityId: row.id,
    action: "pdl_import_staged",
    actor: input.actor,
    payload: { brandId: input.brandId },
  });
  return row;
}

// ── Event-inzage (ijzeren regel 5) ───────────────────────────────────────────
// De admin ziet de recente activiteit; hergebruikt de events-repo zodat er één leespad is.
export async function recentAdminEvents(db: AppDb, limit = 50) {
  return recentEvents(db, limit);
}
