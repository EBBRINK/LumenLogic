// Merk-CRUD (sprint 1.5): aanmaken, bewerken, levensfase zetten en verwijderen — plus de
// verwijderimpact-teller. Bewust NIET in lib/repo/admin.ts: dat bestand gaat over disclosure
// en uploads, terwijl de teller products, price_lists, enrichment_runs en leads moet kennen.
// Precedent voor een eigen bestand: lib/repo/brand-relations.ts.
//
// Ontwerpregels die hier leven:
//   • Commerciële velden (standardDiscountPct, baseDiscountPct, paymentTermDays,
//     deliveryTimeDays) staan bewust NIET in BrandInput. De import is daar de enige
//     waarheid, en geld raakt de ranking nooit (ijzeren regel 2).
//   • De dubbelcheck is EXACT, niet fuzzy: brand_code mag in de bron dubbel voorkomen
//     (L028 draagt de Flos-drieling), dus een dubbele treffer is een waarschuwing, geen
//     blokkade. De gebruiker beslist; de keuze landt in de event-payload.
//   • Elke schrijfactie logt een event (ijzeren regel 5).
import { eq, sql } from "drizzle-orm";
import {
  brandAliases,
  brandFieldVisibility,
  brandRelations,
  brandUploads,
  brands,
  enrichmentRuns,
  leads,
  priceLists,
  prices,
  products,
  type BrandLifecycle,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type BrandInput = {
  name: string;
  brandCode: string | null;
  country: string | null;
  website: string | null;
  descriptionNl: string | null;
  lifecycle: BrandLifecycle;
  // Milieuvelden (1.7): factoryLocation is het FEIT van het merk (eigen opgave);
  // factoryDistanceKm is ONZE berekening tegen het Brink-adres (lib/brink.ts). Ze hebben
  // een EIGEN event (brand_environment_changed) en staan daarom niet in CHANGED_FIELDS
  // hieronder — zie de exhaustiveness-guard bij updateBrand.
  factoryLocation: string | null;
  factoryDistanceKm: number | null;
};

export type BrandDuplicate = {
  id: string;
  name: string;
  brandCode: string | null;
  on: ("name" | "brand_code")[];
};

export type BrandDeleteImpact = {
  blocked: boolean;
  blockers: {
    products: number;
    priceLists: number;
    enrichmentRuns: number;
    leads: number;
  };
  cascades: {
    brandRelations: number;
    brandAliases: number;
    brandFieldVisibility: number;
    brandUploads: number;
  };
  priceListName: string | null;
  priceRowCount: number;
};

// Vult de NOT NULL-kolom `slug` bij het aanmaken; kolom heeft geen default. Dit is
// nadrukkelijk GEEN normalisatiemechanisme: slug wordt nooit gebruikt voor de dubbelcheck
// of voor matching — daar is brandKeyOf de enige. Bewust niet geëxporteerd, zodat die
// verwarring ook niet kán ontstaan.
function brandSlugOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "merk";
}

// De bevestigingssleutel van de dubbelcheck: de gesorteerde id's van de gevónden dubbelen.
// Wijzigt de gebruiker de naam tussen waarschuwing en bevestiging, dan verandert de
// match-set, verandert de token, en volgt er een VERSE waarschuwing in plaats van een
// blinde schrijfactie op een vinkje van drie seconden geleden.
export function duplicateToken(matches: BrandDuplicate[]): string {
  return matches
    .map((m) => m.id)
    .sort()
    .join(",");
}

// Eén query, exact vergelijken op naam OF merkcode (beide hoofdletterongevoelig).
// Niet fuzzy, niet via slug, niet via brandKeyOf: een waarschuwing die te vaak afgaat
// wordt weggeklikt, en dan is hij niets meer waard.
export async function findBrandDuplicates(
  db: AppDb,
  input: { name: string; brandCode: string | null; excludeId?: string },
): Promise<BrandDuplicate[]> {
  const name = input.name.trim();
  const brandCode = input.brandCode?.trim() || null;
  if (!name && !brandCode) return [];

  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      brandCode: brands.brandCode,
      onName: sql<boolean>`lower(${brands.name}) = lower(${name})`,
      onCode: sql<boolean>`${brands.brandCode} is not null and lower(${brands.brandCode}) = lower(${brandCode})`,
    })
    .from(brands)
    .where(
      sql`(lower(${brands.name}) = lower(${name})
        or (${brands.brandCode} is not null and lower(${brands.brandCode}) = lower(${brandCode})))
        ${input.excludeId ? sql`and ${brands.id} <> ${input.excludeId}` : sql``}`,
    );

  return rows.map((r) => {
    const on: ("name" | "brand_code")[] = [];
    if (r.onName) on.push("name");
    if (r.onCode) on.push("brand_code");
    return { id: r.id, name: r.name, brandCode: r.brandCode, on };
  });
}

export async function createBrand(
  db: AppDb,
  input: BrandInput,
  actor?: string,
  opts?: { duplicateOf?: string[] },
): Promise<{ id: string }> {
  // brands.id heeft geen defaultRandom (de import neemt bron-UUID's over) — zelf zetten.
  const id = crypto.randomUUID();
  const slug = brandSlugOf(input.name);
  await db.insert(brands).values({
    id,
    name: input.name,
    slug,
    brandCode: input.brandCode,
    country: input.country,
    website: input.website,
    descriptionNl: input.descriptionNl,
    lifecycle: input.lifecycle,
    factoryLocation: input.factoryLocation,
    factoryDistanceKm: input.factoryDistanceKm,
  });
  await logEvent(db, {
    entity: "brand",
    entityId: id,
    action: "brand_created",
    actor,
    payload: {
      name: input.name,
      slug,
      brandCode: input.brandCode,
      lifecycle: input.lifecycle,
      factoryLocation: input.factoryLocation,
      factoryDistanceKm: input.factoryDistanceKm,
      duplicateOf: opts?.duplicateOf ?? [],
    },
  });
  return { id };
}

export async function getBrandForEdit(
  db: AppDb,
  brandId: string,
): Promise<(BrandInput & { id: string; slug: string }) | null> {
  const [row] = await db
    .select({
      id: brands.id,
      slug: brands.slug,
      name: brands.name,
      brandCode: brands.brandCode,
      country: brands.country,
      website: brands.website,
      descriptionNl: brands.descriptionNl,
      lifecycle: brands.lifecycle,
      factoryLocation: brands.factoryLocation,
      factoryDistanceKm: brands.factoryDistanceKm,
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  return row ?? null;
}

// Veldnamen die bij een wijziging in payload.changed van brand_updated landen. lifecycle,
// factoryLocation en factoryDistanceKm staan hier NIET in: die hebben een eigen event met
// {from, to} — twee keer hetzelfde loggen maakt de tijdlijn onleesbaar.
const CHANGED_FIELDS = [
  "name",
  "brandCode",
  "country",
  "website",
  "descriptionNl",
] as const;

// Velden met een EIGEN event, bewust buiten CHANGED_FIELDS gehouden.
type OwnEventField = "lifecycle" | "factoryLocation" | "factoryDistanceKm";

// Exhaustiveness-guard: elk veld van BrandInput moet OF in CHANGED_FIELDS staan, OF hier
// als OwnEventField genoemd zijn. Voeg je later een veld aan BrandInput toe zonder het in
// een van beide te noemen, dan faalt deze regel bij `tsc --noEmit` in plaats van dat het
// veld stil buiten élk event valt.
type BrandInputFieldsCovered = keyof BrandInput extends
  | (typeof CHANGED_FIELDS)[number]
  | OwnEventField
  ? true
  : never;
const brandInputFieldsCovered: BrandInputFieldsCovered = true;
void brandInputFieldsCovered;

// Bewerken raakt de SLUG NIET aan, ook niet als de naam verandert. Reden: slug is niet
// uniek, is nergens een route (routes gaan op brandId) en heeft één lezer buiten de
// import. Hem stil laten meeschuiven wijzigt een waarde die niemand ziet, met een
// migratie-achtig risico dat niets oplevert.
//
// Kan tot DRIE events geven — brand_updated, brand_lifecycle_changed en
// brand_environment_changed — als die velden meeveranderen. Bewust: "wie zette welk merk
// op vervallen" (en, sinds 1.7, "wie wijzigde de fabrieksafstand") moet leesbaar zijn
// zonder door veldlijsten te grepen. Voor de milieuvelden weegt dat extra zwaar: de
// kilometers zijn de afstand tot óns adres, en een merk heeft er belang bij die laag in
// te schatten — "iemand heeft de afstand gewijzigd" zonder de oude waarde is dan geen
// audittrail.
export async function updateBrand(
  db: AppDb,
  brandId: string,
  input: BrandInput,
  actor?: string,
  opts?: { duplicateOf?: string[] },
): Promise<void> {
  const before = await getBrandForEdit(db, brandId);
  if (!before) return;

  await db
    .update(brands)
    .set({
      name: input.name,
      brandCode: input.brandCode,
      country: input.country,
      website: input.website,
      descriptionNl: input.descriptionNl,
      lifecycle: input.lifecycle,
      factoryLocation: input.factoryLocation,
      factoryDistanceKm: input.factoryDistanceKm,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brandId));

  // Alleen de veldnamen die écht wijzigden.
  const changed = CHANGED_FIELDS.filter((k) => before[k] !== input[k]);

  if (changed.length > 0) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "brand_updated",
      actor,
      payload: { changed, duplicateOf: opts?.duplicateOf ?? [] },
    });
  }
  if (before.lifecycle !== input.lifecycle) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "brand_lifecycle_changed",
      actor,
      payload: { from: before.lifecycle, to: input.lifecycle },
    });
  }
  if (
    before.factoryLocation !== input.factoryLocation ||
    before.factoryDistanceKm !== input.factoryDistanceKm
  ) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "brand_environment_changed",
      actor,
      payload: {
        from: { location: before.factoryLocation, km: before.factoryDistanceKm },
        to: { location: input.factoryLocation, km: input.factoryDistanceKm },
      },
    });
  }
}

// De uitweg naast de verwijderblokkade (G4): een merk dat niet weg kán, kan wél uit de
// werklijst. Gelijkblijvende waarde schrijft en logt niets — anders vervuilt elke
// dubbele klik de tijdlijn.
export async function setBrandLifecycle(
  db: AppDb,
  brandId: string,
  lifecycle: BrandLifecycle,
  actor?: string,
): Promise<void> {
  const [before] = await db
    .select({ lifecycle: brands.lifecycle })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (!before || before.lifecycle === lifecycle) return;

  await db
    .update(brands)
    .set({ lifecycle, updatedAt: new Date() })
    .where(eq(brands.id, brandId));
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_lifecycle_changed",
    actor,
    payload: { from: before.lifecycle, to: lifecycle },
  });
}

// Eén SELECT met scalaire subquery's op geïndexeerde brand_id-kolommen. Twee groepen,
// want ze betekenen iets anders: de bovenste vier hebben een FK zonder ON DELETE (de
// DELETE faalt), de onderste vier cascaden stil mee.
//
// De prijslijst komt er mét naam en het aantal prijsregels bij: bij 405 van de 437 merken
// is een LEGE prijslijst de énige blocker, en "1 prijslijst" zonder die twee getallen
// leest als een fout waar de gebruiker naar gaat zoeken.
export async function getBrandDeleteImpact(
  db: AppDb,
  brandId: string,
): Promise<BrandDeleteImpact> {
  const [row] = await db
    .select({
      products: sql<number>`(select count(*) from ${products} p where p.brand_id = ${brandId})`.mapWith(
        Number,
      ),
      priceLists:
        sql<number>`(select count(*) from ${priceLists} pl where pl.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      enrichmentRuns:
        sql<number>`(select count(*) from ${enrichmentRuns} er where er.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      leads: sql<number>`(select count(*) from ${leads} l where l.brand_id = ${brandId})`.mapWith(
        Number,
      ),
      brandRelations:
        sql<number>`(select count(*) from ${brandRelations} br where br.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      brandAliases:
        sql<number>`(select count(*) from ${brandAliases} ba where ba.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      brandFieldVisibility:
        sql<number>`(select count(*) from ${brandFieldVisibility} bfv where bfv.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      brandUploads:
        sql<number>`(select count(*) from ${brandUploads} bu where bu.brand_id = ${brandId})`.mapWith(
          Number,
        ),
      // De actieve lijst eerst; bij gelijke stand de oudste, zodat het antwoord stabiel is.
      priceListName: sql<
        string | null
      >`(select pl.name from ${priceLists} pl where pl.brand_id = ${brandId} order by pl.replaced_at nulls first, pl.created_at limit 1)`,
      priceRowCount: sql<number>`(
        select count(*) from ${prices} pr
        join ${priceLists} pl on pl.id = pr.price_list_id
        where pl.brand_id = ${brandId}
      )`.mapWith(Number),
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  // Merk bestaat niet (meer): alles nul, niets blokkeert.
  if (!row) {
    return {
      blocked: false,
      blockers: { products: 0, priceLists: 0, enrichmentRuns: 0, leads: 0 },
      cascades: {
        brandRelations: 0,
        brandAliases: 0,
        brandFieldVisibility: 0,
        brandUploads: 0,
      },
      priceListName: null,
      priceRowCount: 0,
    };
  }

  const blockers = {
    products: row.products,
    priceLists: row.priceLists,
    enrichmentRuns: row.enrichmentRuns,
    leads: row.leads,
  };
  return {
    blocked:
      blockers.products +
        blockers.priceLists +
        blockers.enrichmentRuns +
        blockers.leads >
      0,
    blockers,
    cascades: {
      brandRelations: row.brandRelations,
      brandAliases: row.brandAliases,
      brandFieldVisibility: row.brandFieldVisibility,
      brandUploads: row.brandUploads,
    },
    priceListName: row.priceListName ?? null,
    priceRowCount: row.priceRowCount,
  };
}

// Hertelt vlak vóór de DELETE en geeft {ok:false, impact} terug in plaats van te gooien:
// de gebruiker ziet dan hetzelfde impact-panel als vóór de klik, in plaats van een
// stacktrace. Eén database is dev én prod — daarom bovendien een vangnet op de
// PG-constraintfout zelf; een constraint-naam mag nooit naar boven lekken.
export async function deleteBrand(
  db: AppDb,
  brandId: string,
  actor?: string,
): Promise<{ ok: true } | { ok: false; impact: BrandDeleteImpact }> {
  const impact = await getBrandDeleteImpact(db, brandId);
  if (impact.blocked) return { ok: false, impact };

  // Naam/code vóór de DELETE lezen: na afloop wijst entityId naar een rij die niet meer
  // bestaat, dus zonder deze payload is het event onleesbaar.
  const before = await getBrandForEdit(db, brandId);
  if (!before) return { ok: true };

  try {
    await db.delete(brands).where(eq(brands.id, brandId));
  } catch {
    return { ok: false, impact: await getBrandDeleteImpact(db, brandId) };
  }

  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_deleted",
    actor,
    payload: {
      name: before.name,
      slug: before.slug,
      brandCode: before.brandCode,
      cascaded: impact.cascades,
    },
  });
  return { ok: true };
}
