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
    // In chunks: een catalogus-formaat lijst (18.659 regels gemeten, 11 aug 2026) zou in
    // één multi-row INSERT de Postgres-parameterlimiet (65.535) overschrijden — ~11
    // parameters per rij, dus 1.000 rijen ≈ 11.000 parameters, ruim eronder.
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(pricesArchive).values(
        rows.slice(i, i + CHUNK).map((p) => ({
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
    }
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

// ── Verlenging: valid_until vooruit zetten (bevinding B3, retourpad van regel 3) ──
// Ijzeren regel 3 is eenrichtingsverkeer zolang niemand de einddatum vooruit kan zetten:
// de lijst verloopt, visible_products laat álle producten van het merk vallen, en het
// scherm zegt letterlijk "what's needed now is an extension, not a new submission" —
// terwijl er nergens code stond die een verlenging kon uitvoeren. Dit is die code.
//
// Bewust NIET replacePriceList: er komt geen nieuwe lijst en er wordt niets gearchiveerd.
// Dezelfde lijst, dezelfde prijsregels, alleen een latere einddatum — het merk heeft
// bevestigd dat de prijzen langer gelden. replacePriceList zou de prijsregels naar het
// archief verplaatsen en het gat juist groter maken.
//
// Geen db.transaction(): neon-http gooit daarop (zie de toelichting bij upsertPriceLines,
// ~regel 109). Nodig is het ook niet — dit is één UPDATE van één kolom.

/** Waarom een verlenging geweigerd is. Codes i.p.v. losse zinnen, zodat de action-laag
 *  ze kan vertalen naar een boodschap op het scherm zonder de tekst hier te kennen. */
export type PriceListExtendReason =
  | "invalid_date"
  | "unknown_list"
  | "archived"
  | "date_in_past"
  | "not_later"
  // Twee verschillende dingen, bewust twee codes (de eerste versie had er één en die
  // dekte de tweede helft niet — zie de guards onderaan extendPriceListValidity):
  //  • before_start = de NIEUWE einddatum ligt vóór valid_from;
  //  • not_started  = de LIJST is nog niet begonnen (valid_from > vandaag), wat de
  //    tweede helft van de view-eis is en niets met de nieuwe einddatum te maken heeft.
  | "before_start"
  | "not_started";

export class PriceListExtendError extends Error {
  readonly reason: PriceListExtendReason;
  constructor(reason: PriceListExtendReason, message: string) {
    super(message);
    this.name = "PriceListExtendError";
    this.reason = reason;
  }
}

/** 'YYYY-MM-DD' én een bestaande kalenderdatum — '2026-02-30' rolt door naar 03-02 en
 *  wordt daarom afgewezen, anders zou de DB er stil iets anders van maken. */
function isIsoDatum(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Vandaag als 'YYYY-MM-DD' in UTC — dezelfde conventie als daysUntil() in
 *  lib/repo/enrichment.ts, zodat "verlopen" op het scherm en hier hetzelfde betekent. */
function isoVandaag(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Zet de einddatum van één prijslijst vooruit. Levert de bijgewerkte rij op.
 *
 * Weigert (PriceListExtendError met `reason`):
 *  • de lijst bestaat niet;
 *  • de lijst is vervangen (`replaced_at`): zijn prijsregels staan in prices_archive, dus
 *    een verlenging zou geldigheid beloven voor prijzen die niet meer in `prices` staan —
 *    een lege lijst die groen kleurt. Zo'n merk heeft een nieuwe lijst nodig, geen datum;
 *  • geen geldige YYYY-MM-DD-datum;
 *  • een datum vóór vandaag: de view toetst `valid_until >= CURRENT_DATE` (inclusief, zie
 *    db/migrations/0004_vijfstatussen.sql), dus vandaag mág — gisteren verandert niets;
 *  • een datum die niet later is dan de huidige einddatum. VERKORTEN kan hier bewust niet:
 *    een lijst korter maken haalt producten uit de matcher (regel 3) en is dus een andere
 *    handeling, met een eigen bevestiging en een eigen event — niet iets wat per ongeluk
 *    uit dit formulier mag rollen;
 *  • een datum vóór `valid_from`: een lijst die eindigt vóór hij begint is geen geldige
 *    periode, ongeacht de kalender;
 *  • een lijst die nog niet begonnen is (`valid_from` > vandaag): de view eist ÓÓK
 *    `valid_from <= CURRENT_DATE` (db/migrations/0004_vijfstatussen.sql), dus hoe ver de
 *    einddatum ook vooruit gaat, de producten blijven onzichtbaar. Zonder deze guard meldt
 *    het scherm groen "Its products are back in the matcher" terwijl visible_products nul
 *    rijen geeft — dan liegt de knop. Hier is geen datum die dit repareert: de startdatum
 *    moet naar voren, en dat is een andere handeling.
 */
export async function extendPriceListValidity(
  db: AppDb,
  input: { priceListId: string; validUntil: string; actor?: string },
  today: Date = new Date(),
) {
  const validUntil = input.validUntil.trim();
  if (!isIsoDatum(validUntil)) {
    throw new PriceListExtendError(
      "invalid_date",
      `"${input.validUntil}" is not a valid date (expected YYYY-MM-DD)`,
    );
  }

  const [list] = await db
    .select()
    .from(priceLists)
    .where(eq(priceLists.id, input.priceListId));
  if (!list) {
    throw new PriceListExtendError(
      "unknown_list",
      `Price list ${input.priceListId} does not exist`,
    );
  }
  if (list.replacedAt !== null) {
    throw new PriceListExtendError(
      "archived",
      `Price list ${list.id} was replaced; its price lines are archived — extending it would promise prices that are gone`,
    );
  }

  // Datums als tekst vergelijken mag: 'YYYY-MM-DD' is lexicografisch = chronologisch.
  const vandaag = isoVandaag(today);
  if (validUntil < vandaag) {
    throw new PriceListExtendError(
      "date_in_past",
      `New end date ${validUntil} is in the past (today is ${vandaag})`,
    );
  }
  if (validUntil <= list.validUntil) {
    throw new PriceListExtendError(
      "not_later",
      `New end date ${validUntil} is not later than the current end date ${list.validUntil}`,
    );
  }
  if (validUntil < list.validFrom) {
    throw new PriceListExtendError(
      "before_start",
      `New end date ${validUntil} is before the start date ${list.validFrom}`,
    );
  }
  // De tweede helft van de view-predicaat: `pl.valid_from <= CURRENT_DATE`. Staat NA
  // before_start, want een einddatum vóór de startdatum is de concretere klacht en had
  // al zijn eigen reden; deze guard vangt het geval dat daar doorheen glipt (einddatum
  // ná valid_from, maar valid_from zelf ligt nog in de toekomst).
  if (list.validFrom > vandaag) {
    throw new PriceListExtendError(
      "not_started",
      `Price list ${list.id} has not started yet (valid_from ${list.validFrom}, today is ${vandaag}); a later end date does not make its products visible`,
    );
  }

  const [bijgewerkt] = await db
    .update(priceLists)
    .set({ validUntil, updatedAt: new Date() })
    .where(eq(priceLists.id, list.id))
    .returning();

  // Ijzeren regel 5. previousValidUntil rijdt mee: zonder de oude datum is achteraf niet
  // te zien of dit een verlenging van een week of van vijf jaar was.
  await logEvent(db, {
    entity: "price_list",
    entityId: list.id,
    action: "price_list_extended",
    actor: input.actor,
    payload: {
      brandId: list.brandId,
      name: list.name,
      previousValidUntil: list.validUntil,
      validUntil,
    },
  });

  return bijgewerkt;
}

function gelijkeBedragen(a: string, b: string): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : a.trim() === b.trim();
}
