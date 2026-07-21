// Eigen velden (sprint 1.8): de ENIGE lezer/schrijver van de velddefinities in
// `custom_fields`. Alles wat de rest van de app van eigen velden weet, komt hier vandaan of
// uit de pure laag (lib/custom-fields.ts).
//
// WAAROM ÉÉN PLEK: excelColumns(), templateBuckets() en measurableFields() zijn synchroon en
// puur, en lib/excel-validate.ts + lib/template-diff.ts dragen "geen imports uit db/" als
// uitdrukkelijk ontwerpdoel voor 4.B. De velddefinities staan in de database. De brug is
// laadCatalogus(): hier één keer laden, daarna als parameter door de pure laag heen.
//
// GEEN db.transaction(), net als in lib/repo/template-return.ts: neon-http (productie) gooit
// daarop en PGlite (tests) niet — dat geeft groene tests en een kapotte app.
//
// EVENTS (ijzeren regel 5) hangen aan entity 'custom_field' met de uuid als entity_id. Elk
// schrijfpad logt zijn eigen event: erop rekenen dat een bestaand pad meelogt is precies hoe
// sprint 1.7 bijna een veld stil liet wegvallen. De changed-lijst bij een update wordt uit de
// PATCH afgeleid, niet met de hand bijgehouden (Val 7) — een handlijst vergeet het volgende veld.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { customFields, products } from "@/db/schema";
import {
  catalogusMet,
  type EigenVeldDef,
} from "@/lib/custom-fields";
import type { CatalogBucket, Compleetheidsniveau } from "@/lib/field-catalog";
import type { AppDb } from "./db";
import { logEvent } from "./events";

/** entity-naam in de events-tabel. Er bestond nog geen entity voor een velddefinitie. */
export const CUSTOM_FIELD_ENTITY = "custom_field";

type Rij = typeof customFields.$inferSelect;

/** DB-rij → de vorm die de pure laag kent. `createdAt`/`archivedAt` als ISO-string, want
 *  EigenVeldDef reist door server-componenten heen en een Date serialiseert daar niet
 *  verliesvrij. De sortering binnen een bucket hangt aan createdAt, dus ISO (lexicografisch
 *  = chronologisch) is óók de goedkoopste vergelijking. */
function alsDef(rij: Rij): EigenVeldDef {
  return {
    id: rij.id,
    labelNl: rij.labelNl,
    labelEn: rij.labelEn,
    instructieNl: rij.instructieNl,
    instructionEn: rij.instructionEn,
    niveau: rij.niveau as Compleetheidsniveau,
    bucketKey: rij.bucketKey,
    createdAt: rij.createdAt.toISOString(),
    archivedAt: rij.archivedAt ? rij.archivedAt.toISOString() : null,
  };
}

/**
 * Alle velddefinities, oudste eerst.
 *
 * Default ALLEEN de actieve. Gearchiveerde velden horen niet in het merk-Excel, niet in de
 * scorecard en niet in het retour-pad; wie ze tóch wil (het beheerscherm, om te tonen wát er
 * ooit was) vraagt er zichtbaar om. Andersom — default alles, en de aanroeper filtert — is
 * precies hoe een gearchiveerd veld stil weer in het template opduikt.
 */
export async function listEigenVelden(
  db: AppDb,
  opts?: { metGearchiveerd?: boolean },
): Promise<EigenVeldDef[]> {
  const q = db.select().from(customFields);
  const rijen = opts?.metGearchiveerd
    ? await q.orderBy(asc(customFields.createdAt), asc(customFields.id))
    : await q
        .where(isNull(customFields.archivedAt))
        .orderBy(asc(customFields.createdAt), asc(customFields.id));
  return rijen.map(alsDef);
}

/** De COMPLETE veldcatalogus: het vaste deel (FIELD_CATALOG) plus de actieve eigen velden.
 *  Dit is wat elke aanroeper van excelColumns()/templateBuckets()/measurableFields() hoort
 *  door te geven. */
export async function laadCatalogus(db: AppDb): Promise<CatalogBucket[]> {
  return catalogusMet(await listEigenVelden(db));
}

/**
 * Per definitie-id: bij hoeveel producten dit veld een niet-lege waarde heeft.
 *
 * Eén query over alle velden tegelijk, en de sleutel gaat als BOUND PARAMETER de query in —
 * nooit via sql.raw. Zie ook completenessSelection() in lib/repo/brand-relations.ts: daar
 * staat wél een sql.raw, maar die kolomnaam komt van een programmeur; deze sleutel komt van
 * een gebruiker en mag daarom nooit een identifier in de SQL-tekst worden.
 *
 * Leeg ("") telt níét als waarde: het retour-pad kan een veld leegmaken zonder de sleutel te
 * verwijderen, en een lege string als "gevuld" tellen zou de scorecard laten liegen.
 */
export async function telProductenMetWaarde(
  db: AppDb,
): Promise<Map<string, number>> {
  const defs = await listEigenVelden(db, { metGearchiveerd: true });
  const out = new Map<string, number>();
  for (const def of defs) {
    const rows = (await db
      .select({
        n: sql<number>`count(*) filter (where ${products.customValues} ->> ${def.id} is not null
          and ${products.customValues} ->> ${def.id} <> '')`,
      })
      .from(products)) as { n: number | string }[];
    out.set(def.id, Number(rows[0]?.n ?? 0));
  }
  return out;
}

export type EigenVeldInvoer = {
  labelNl: string;
  labelEn: string;
  instructieNl: string;
  instructionEn: string;
  niveau: Compleetheidsniveau;
  bucketKey: string;
};

export async function createEigenVeld(
  db: AppDb,
  invoer: EigenVeldInvoer,
  actor?: string,
): Promise<EigenVeldDef> {
  const [rij] = await db
    .insert(customFields)
    .values({
      labelNl: invoer.labelNl.trim(),
      labelEn: invoer.labelEn.trim(),
      instructieNl: invoer.instructieNl.trim(),
      instructionEn: invoer.instructionEn.trim(),
      niveau: invoer.niveau,
      bucketKey: invoer.bucketKey,
    })
    .returning();

  const def = alsDef(rij);
  await logEvent(db, {
    entity: CUSTOM_FIELD_ENTITY,
    entityId: def.id,
    action: "custom_field_created",
    actor,
    // labelEn draagt de leesbaarheid die de uuid-sleutel niet heeft: zonder dit veld is
    // een event over `custom:9f2c…` voor een mens betekenisloos.
    payload: {
      labelNl: def.labelNl,
      labelEn: def.labelEn,
      niveau: def.niveau,
      bucketKey: def.bucketKey,
    },
  });
  return def;
}

export type EigenVeldPatch = Partial<EigenVeldInvoer>;

/**
 * Wijzigen, inclusief hernoemen. De `changed`-lijst wordt uit de patch AFGELEID (Val 7):
 * alleen velden die écht anders werden, elk met {old, new}. Een hardgecodeerde lijst zoals in
 * lib/repo/brands.ts vergeet het volgende veld dat erbij komt.
 */
export async function updateEigenVeld(
  db: AppDb,
  id: string,
  patch: EigenVeldPatch,
  actor?: string,
): Promise<EigenVeldDef> {
  const [voor] = await db
    .select()
    .from(customFields)
    .where(eq(customFields.id, id));
  if (!voor) throw new Error(`Custom field ${id} does not exist`);

  const genormaliseerd: EigenVeldPatch = {};
  for (const [k, v] of Object.entries(patch) as [keyof EigenVeldInvoer, string][]) {
    if (v === undefined) continue;
    genormaliseerd[k] = (typeof v === "string" ? v.trim() : v) as never;
  }

  const [na] = await db
    .update(customFields)
    .set({ ...genormaliseerd, updatedAt: new Date() })
    .where(eq(customFields.id, id))
    .returning();

  const fields: Record<string, { old: string; new: string }> = {};
  for (const k of Object.keys(genormaliseerd) as (keyof EigenVeldInvoer)[]) {
    const oud = String(voor[k]);
    const nieuw = String(na[k]);
    if (oud !== nieuw) fields[k] = { old: oud, new: nieuw };
  }
  if (Object.keys(fields).length > 0) {
    await logEvent(db, {
      entity: CUSTOM_FIELD_ENTITY,
      entityId: id,
      action: "custom_field_updated",
      actor,
      payload: { fields },
    });
  }
  return alsDef(na);
}

/**
 * Archiveren (soft delete). Geen hard delete: met een uuid-sleutel liggen de waarden na
 * verwijderen onder een uuid die niemand meer heeft — onherstelbaar. De WAARDEN worden hier
 * dan ook nooit gewist; dat zou een mass-update over 211k productrijen zijn die updated_at
 * verzet en de fingerprint-discipline van elke volgende sprint breekt.
 *
 * TELT EERST, SCHRIJFT DAARNA — hetzelfde patroon als getBrandDeleteImpact/deleteBrand
 * (lib/repo/brands.ts): de telling gebeurt vlak vóór de write en gaat mee in het resultaat én
 * in het event, zodat "je gooit 1.240 ingevulde waarden uit het zicht" een gemeten getal is en
 * geen schatting van vóór de klik.
 *
 * `{ ok: false }` = het veld bestaat niet (meer) of was al gearchiveerd. Dubbelklik is dus
 * geen tweede event.
 */
export async function archiveEigenVeld(
  db: AppDb,
  id: string,
  actor?: string,
): Promise<{ ok: true; productsWithValue: number } | { ok: false }> {
  const [voor] = await db
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, id), isNull(customFields.archivedAt)));
  if (!voor) return { ok: false };

  // Hertellen vlak vóór de write, met de sleutel als bound parameter.
  const telling = (await db
    .select({
      n: sql<number>`count(*) filter (where ${products.customValues} ->> ${id} is not null
        and ${products.customValues} ->> ${id} <> '')`,
    })
    .from(products)) as { n: number | string }[];
  const productsWithValue = Number(telling[0]?.n ?? 0);

  const [na] = await db
    .update(customFields)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customFields.id, id), isNull(customFields.archivedAt)))
    .returning();
  // Race: iemand anders was net eerder. Geen event over iets wat wij niet deden.
  if (!na) return { ok: false };

  await logEvent(db, {
    entity: CUSTOM_FIELD_ENTITY,
    entityId: id,
    action: "custom_field_archived",
    actor,
    payload: { labelEn: voor.labelEn, productsWithValue },
  });
  return { ok: true, productsWithValue };
}
