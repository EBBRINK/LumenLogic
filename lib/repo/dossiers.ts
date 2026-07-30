// UI-naam: Project. DB/code-naam blijft 'dossier' (bewust, zie docs/plan-aanvraag-estimate.md B1).
// Dossier-, spec-regel- en offerte-logica (calculatorflow, BUILD-PLAN §4.3).
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  priceLists,
  prices,
  projectDossiers,
  quoteLines,
  quotes,
  specLineCandidates,
  specLines,
  visibleProducts,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { derivePhase, type Phase, type XisPhase } from "./project-status";

export type { Phase };

// ── Dossiers ─────────────────────────────────────────────────────────────────
export async function listDossiers(db: AppDb) {
  return db
    .select()
    .from(projectDossiers)
    .orderBy(asc(projectDossiers.createdAt));
}

// Nieuw project: altijd status 'concept' (geen statuskeuze bij aanmaken); alleen de
// XIS-fase is te kiezen (default 'start'). `phase` wordt afgeleid (B6, regel 4) —
// dezelfde derivePhase als setStatus/setXisPhase, dus geen tweede waarheid.
export async function createDossier(
  db: AppDb,
  input: {
    name: string;
    customer?: string | null;
    xisPhase?: XisPhase;
    actor?: string;
  },
) {
  const xisPhase = input.xisPhase ?? "start";
  const [row] = await db
    .insert(projectDossiers)
    .values({
      name: input.name,
      customer: input.customer ?? null,
      status: "concept",
      xisPhase,
      phase: derivePhase("concept", xisPhase), // afgeleid; default = veilig (regel 4)
    })
    .returning();
  await logEvent(db, {
    entity: "dossier",
    entityId: row.id,
    action: "dossier_created",
    actor: input.actor,
    payload: {
      name: row.name,
      status: row.status,
      xisPhase: row.xisPhase,
      phase: row.phase,
    },
  });
  return row;
}

export async function getDossier(db: AppDb, id: string) {
  const [row] = await db
    .select()
    .from(projectDossiers)
    .where(eq(projectDossiers.id, id))
    .limit(1);
  return row ?? null;
}

// setDossierPhase is verwijderd (B6): `phase` is afgeleid en kent één schrijver —
// lib/repo/project-status.ts (setStatus/setXisPhase via derivePhase).

// ── Spec-regels ──────────────────────────────────────────────────────────────
// Elke spec-regel gejoined met het (eventueel) gematchte, nog-zichtbare product +
// zijn geldige prijs. Match via view → een verlopen product verliest hier zijn prijs
// (grossPrice = null) en kan niet in de offerte belanden.
export async function getSpecLines(db: AppDb, dossierId: string) {
  return db
    .select({
      id: specLines.id,
      fixtureCode: specLines.fixtureCode,
      quantity: specLines.quantity,
      zone: specLines.zone,
      description: specLines.description,
      brandText: specLines.brandText,
      productText: specLines.productText,
      reqKelvin: specLines.reqKelvin,
      reqCri: specLines.reqCri,
      reqIp: specLines.reqIp,
      status: specLines.status,
      deviations: specLines.deviations,
      source: specLines.source,
      reviewKind: specLines.reviewKind,
      noMatchReason: specLines.noMatchReason,
      manualPrice: specLines.manualPrice,
      sortOrder: specLines.sortOrder,
      matchedProductId: specLines.matchedProductId,
      matchedName: visibleProducts.name,
      matchedBrand: visibleProducts.brandName,
      matchedArticleCode: visibleProducts.articleCode,
      matchedPrice: visibleProducts.grossPrice,
      matchedKelvin: visibleProducts.kelvin,
      matchedCri: visibleProducts.cri,
      matchedIp: visibleProducts.ipValue,
      // B3: wie koos de match — 'system:auto' = automatisch geaccepteerde bijna-match
      // (label op regel, estimate en PDF). Er is hooguit één chosen-kandidaat per regel
      // (chooseCandidate reset eerst alles; runMatcher verwijdert en herschrijft), en
      // de koppeling op matched_product_id zorgt dat een losgemaakte match (unlinkMatch
      // laat het kandidaat-record staan) geen label meer draagt.
      chosenBy: specLineCandidates.chosenBy,
    })
    .from(specLines)
    .leftJoin(
      visibleProducts,
      eq(specLines.matchedProductId, visibleProducts.id),
    )
    .leftJoin(
      specLineCandidates,
      and(
        eq(specLineCandidates.specLineId, specLines.id),
        eq(specLineCandidates.chosen, true),
        eq(specLineCandidates.productId, specLines.matchedProductId),
      ),
    )
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
}

export async function getSpecLine(db: AppDb, id: string) {
  const [row] = await db
    .select()
    .from(specLines)
    .where(eq(specLines.id, id))
    .limit(1);
  return row ?? null;
}

export type SpecLineInput = {
  fixtureCode: string;
  quantity?: number | null;
  zone?: string | null;
  description?: string | null;
  brandText?: string | null;
  productText?: string | null;
  reqKelvin?: number | null;
  reqCri?: number | null;
  reqIp?: string | null;
  reqWatt?: number | null;
  reqLumen?: number | null;
  reqBeamAngle?: number | null;
  reqSizeCm?: number | null;
  reqShape?: string | null;
  reqColor?: string | null;
  reqDimmable?: string | null;
  source?: "manual" | "csv" | "pdf" | "ocr" | "llm";
  sourceConfidence?: string | null;
  sourcePage?: number | null;
  importRunId?: string | null;
};

export async function addSpecLines(
  db: AppDb,
  dossierId: string,
  lines: SpecLineInput[],
) {
  if (lines.length === 0) return [];
  // huidige max sortOrder ophalen zodat toegevoegde regels achteraan komen
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${specLines.sortOrder}), -1)` })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))) as { max: number }[];
  const rows = lines.map((l, i) => ({
    dossierId,
    fixtureCode: l.fixtureCode,
    quantity: l.quantity ?? null,
    zone: l.zone ?? null,
    description: l.description ?? null,
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    reqKelvin: l.reqKelvin ?? null,
    reqCri: l.reqCri ?? null,
    reqIp: l.reqIp ?? null,
    reqWatt: l.reqWatt != null ? String(l.reqWatt) : null,
    reqLumen: l.reqLumen ?? null,
    reqBeamAngle: l.reqBeamAngle != null ? String(l.reqBeamAngle) : null,
    reqSizeCm: l.reqSizeCm != null ? String(l.reqSizeCm) : null,
    reqShape: l.reqShape ?? null,
    reqColor: l.reqColor ?? null,
    reqDimmable: l.reqDimmable ?? null,
    source: l.source ?? "manual",
    sourceConfidence: l.sourceConfidence ?? null,
    sourcePage: l.sourcePage ?? null,
    importRunId: l.importRunId ?? null,
    sortOrder: Number(max) + 1 + i,
  }));
  return db.insert(specLines).values(rows).returning();
}

// Aantallen koppelen op fixture-code (B-08/A-06: bestek/telstaat-import).
// Retourneert welke codes gekoppeld zijn en welke onbekend bleven.
export async function linkQuantities(
  db: AppDb,
  dossierId: string,
  pairs: { code: string; quantity: number }[],
  actor?: string,
): Promise<{ linked: string[]; unknown: string[] }> {
  const existing = await db
    .select({ id: specLines.id, code: specLines.fixtureCode })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId));
  const byCode = new Map(existing.map((r) => [r.code.toLowerCase(), r.id]));
  const linked: string[] = [];
  const unknown: string[] = [];
  for (const p of pairs) {
    const id = byCode.get(p.code.toLowerCase());
    if (id) {
      await db
        .update(specLines)
        .set({ quantity: p.quantity, updatedAt: new Date() })
        .where(eq(specLines.id, id));
      await logEvent(db, {
        entity: "spec_line",
        entityId: id,
        action: "quantity_linked",
        actor,
        payload: { quantity: p.quantity },
      });
      linked.push(p.code);
    } else {
      unknown.push(p.code);
    }
  }
  return { linked, unknown };
}

// CSV-blok plakken: kolommen code, aantal, merk, type (BUILD-PLAN §4.3.2).
export function parseSpecCsv(block: string): SpecLineInput[] {
  const out: SpecLineInput[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // scheiding op tab, puntkomma of komma
    const cols = line.split(/\t|;|,/).map((c) => c.trim());
    if (!cols[0]) continue;
    // meegeplakte kolomkop ("code, aantal, merk, type") is geen spec-regel
    if (/^(code|armatuurcode)$/i.test(cols[0])) continue;
    const qty = parseInt(cols[1] ?? "", 10);
    out.push({
      fixtureCode: cols[0],
      quantity: Number.isNaN(qty) ? 1 : qty,
      brandText: cols[2] || null,
      productText: cols[3] || null,
    });
  }
  return out;
}

export async function deleteSpecLine(db: AppDb, specLineId: string) {
  await db.delete(specLines).where(eq(specLines.id, specLineId));
}

// Dagprijs op DE REGEL (I-04): de catalogus blijft leeg (het gat blijft eerlijk),
// maar deze regel krijgt een handmatige, gemarkeerde prijs met geldigheidsdatum.
export async function setDayPrice(
  db: AppDb,
  input: {
    specLineId: string;
    price: number;
    validUntil?: string | null;
    actor?: string;
  },
) {
  await db
    .update(specLines)
    .set({
      manualPrice: input.price.toFixed(2),
      manualPriceValidUntil: input.validUntil ?? null,
      manualPriceSetBy: input.actor ?? null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, input.specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "day_price_set",
    actor: input.actor,
    payload: { price: input.price, validUntil: input.validUntil ?? null },
  });
}

// Aantal live bijwerken op de estimate (E-07).
export async function setQuantity(
  db: AppDb,
  specLineId: string,
  quantity: number | null,
  actor?: string,
) {
  await db
    .update(specLines)
    .set({ quantity, updatedAt: new Date() })
    .where(eq(specLines.id, specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "quantity_changed",
    actor,
    payload: { quantity },
  });
}

// Bestek/telstaat plakken: "code aantal" of "code;aantal" per regel.
export function parseBestek(block: string): { code: string; quantity: number }[] {
  const out: { code: string; quantity: number }[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\t|;|,|\s{2,}|\s/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    if (/^(code|armatuurcode)$/i.test(cols[0])) continue;
    const qty = parseInt(cols[cols.length - 1], 10);
    if (Number.isNaN(qty)) continue;
    out.push({ code: cols[0], quantity: qty });
  }
  return out;
}

// ── Offerte ──────────────────────────────────────────────────────────────────
// Offertenummer BL-{jaar}-{4 cijfers} (A-09): teller telt bestaande genummerde
// offertes van dit jaar. Wordt pas toegekend bij generatie en daarna bewaard —
// niet bij elke render, en niet opnieuw bij hergenereren.
async function nextQuoteNumber(db: AppDb): Promise<string> {
  const year = new Date().getFullYear();
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)` })
    .from(quotes)
    .where(sql`${quotes.quoteNumber} like ${"BL-" + year + "-%"}`)) as {
    n: number;
  }[];
  return `BL-${year}-${String(Number(n) + 1).padStart(4, "0")}`;
}

// VOORSTEL, geen regel: hoe lang een gegenereerde estimate standaard geldig is.
// Timo mag dit getal veranderen — het staat hier als één constante zodat dat één
// bewerking is en niet een zoektocht door de UI. De mens overschrijft het sowieso in
// "Edit header" (A-10); dit is alleen de stand waarin de offerte geboren wordt.
//
// Waarom er überhaupt een voorstel staat (herstel 2026-07-30): valid_until werd door
// GEEN ENKEL codepad gevuld, dus elke gegenereerde offerte kwam met een lege
// geldigheid ter wereld en viel meteen achter de kopblokpoort — inclusief elke rij die
// al in productie stond.
export const DEFAULT_VALIDITY_DAYS = 30;

// 'YYYY-MM-DD' + n dagen, weer als 'YYYY-MM-DD'. Bewust in UTC gerekend: de kolom is
// een `date` zonder tijdzone, en lokale zomertijd zou er anders een dag naast schieten.
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Genereert (of hergenereert) de offerte uit alle gematchte spec-regels die een
// geldige, niet-verlopen prijs hebben. Regel × stukprijs → totalen. Het kopblok
// (nummer, klant, contact, …) blijft behouden bij hergenereren; een uitgestuurde
// (bevroren) offerte wordt niet overschreven (I-06).
export async function generateQuote(
  db: AppDb,
  dossierId: string,
  actor?: string,
) {
  const dossier = await getDossier(db, dossierId);
  const lines = await getSpecLines(db, dossierId);
  // Groen + geel tellen mee (E-02). Een geldige prijs is nodig: uit de catalogus
  // (matchedPrice) of een dagprijs op de regel (manualPrice, I-04).
  const matched = lines.filter(
    (l) =>
      (l.status === "groen" || l.status === "geel") &&
      (l.matchedPrice != null || l.manualPrice != null),
  );

  // bestaand kopblok bewaren; bevroren offerte niet aanraken (I-06)
  const [prev] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId))
    .orderBy(asc(quotes.createdAt))
    .limit(1);
  if (prev?.frozenAt) return prev; // uitgestuurd → op slot

  const quoteDate = prev?.quoteDate ?? new Date().toISOString().slice(0, 10);
  const header = {
    quoteNumber: prev?.quoteNumber ?? (await nextQuoteNumber(db)),
    customer: prev?.customer ?? dossier?.customer ?? null,
    contactName: prev?.contactName ?? null,
    address: prev?.address ?? null,
    projectRef: prev?.projectRef ?? dossier?.name ?? null,
    authorEmail: prev?.authorEmail ?? actor ?? null,
    quoteDate,
    // Zelfde vorm als quoteDate hierboven: een bestaande waarde blijft staan, anders
    // een voorstel. Dat betekent dat "Refresh estimate" een handmatig leeggemaakte
    // geldigheid opnieuw voorstelt — precies zoals hij ook de datum opnieuw voorstelt.
    // Wie de kop leeg wíl hebben, maakt hem leeg in "Edit header" en genereert niet
    // opnieuw; dán, en alleen dán, gaat de kopblokpoort dicht.
    validUntil: prev?.validUntil ?? addDays(quoteDate, DEFAULT_VALIDITY_DAYS),
  };

  const existing = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId));
  for (const q of existing) {
    await db.delete(quoteLines).where(eq(quoteLines.quoteId, q.id));
    await db.delete(quotes).where(eq(quotes.id, q.id));
  }

  const [quote] = await db
    .insert(quotes)
    .values({ dossierId, ...header })
    .returning();
  if (matched.length > 0) {
    // 0007 (laag 4): prijsherkomst vastklikken — per gematcht product de ACTIEVE
    // prijslijst opzoeken, zodat de offerte zelf documenteert waar de prijs vandaan
    // kwam. Dagprijs-regels zonder catalogusprijs krijgen bewust géén herkomst.
    const productIds = matched
      .map((l) => l.matchedProductId)
      .filter((id): id is string => id != null);
    const provenance = new Map<
      string,
      { priceListId: string; sourceListDate: string }
    >();
    if (productIds.length > 0) {
      const rows = await db
        .select({
          productId: prices.productId,
          priceListId: priceLists.id,
          validFrom: priceLists.validFrom,
        })
        .from(prices)
        .innerJoin(priceLists, eq(prices.priceListId, priceLists.id))
        .where(
          and(
            inArray(prices.productId, productIds),
            isNull(priceLists.replacedAt),
          ),
        );
      for (const r of rows)
        provenance.set(r.productId, {
          priceListId: r.priceListId,
          sourceListDate: r.validFrom,
        });
    }
    await db.insert(quoteLines).values(
      matched.map((l) => {
        const unit = Number(l.manualPrice ?? l.matchedPrice);
        const qty = l.quantity ?? 0; // aantal ontbreekt → stukprijs-modus (A-07)
        const src = l.matchedProductId
          ? provenance.get(l.matchedProductId)
          : undefined;
        return {
          quoteId: quote.id,
          specLineId: l.id,
          productId: l.matchedProductId,
          productName: l.matchedName ?? l.productText ?? l.fixtureCode,
          fixtureCode: l.fixtureCode,
          quantity: qty,
          unitPrice: unit.toFixed(2),
          lineTotal: (unit * qty).toFixed(2),
          // alleen bij een catalogusprijs (niet bij pure dagprijs, I-04)
          priceListId: l.manualPrice != null ? null : (src?.priceListId ?? null),
          sourceListDate:
            l.manualPrice != null ? null : (src?.sourceListDate ?? null),
        };
      }),
    );
  }

  await logEvent(db, {
    entity: "quote",
    entityId: quote.id,
    action: "quote_generated",
    actor,
    payload: { dossierId, lineCount: matched.length },
  });
  return quote;
}

export async function getQuote(db: AppDb, dossierId: string) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId))
    .orderBy(asc(quotes.createdAt))
    .limit(1);
  if (!quote) return null;
  const lines = await db
    .select()
    .from(quoteLines)
    .where(eq(quoteLines.quoteId, quote.id))
    .orderBy(asc(quoteLines.fixtureCode));
  const total = lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  return { quote, lines, total };
}

// A-10: kopblok bewerkbaar tot de estimate wordt uitgestuurd. Werkt op de bestaande
// offerte van het dossier; een bevroren offerte blijft op slot (I-06).
export async function updateQuoteHeader(
  db: AppDb,
  dossierId: string,
  fields: {
    quoteNumber?: string | null;
    customer?: string | null;
    contactName?: string | null;
    address?: string | null;
    projectRef?: string | null;
    authorEmail?: string | null;
    quoteDate?: string | null;
    validUntil?: string | null;
  },
  actor?: string,
) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId))
    .orderBy(asc(quotes.createdAt))
    .limit(1);
  if (!quote || quote.frozenAt) return; // geen offerte of bevroren → niet wijzigen
  await db
    .update(quotes)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(quotes.id, quote.id));
  await logEvent(db, {
    entity: "quote",
    entityId: quote.id,
    action: "quote_header_updated",
    actor,
    payload: { dossierId },
  });
}

// B-10: een spec-regel bewerken. Wijziging aan merk/type/specs raakt de match, dus
// de aanroeper draait daarna de matcher opnieuw (via runMatchAction).
export async function updateSpecLine(
  db: AppDb,
  specLineId: string,
  fields: Partial<SpecLineInput>,
  actor?: string,
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const set = (k: string, v: unknown) => {
    if (v !== undefined) patch[k] = v;
  };
  set("fixtureCode", fields.fixtureCode);
  set("quantity", fields.quantity ?? null);
  set("zone", fields.zone ?? null);
  set("brandText", fields.brandText ?? null);
  set("productText", fields.productText ?? null);
  set("reqKelvin", fields.reqKelvin ?? null);
  set("reqCri", fields.reqCri ?? null);
  set("reqIp", fields.reqIp ?? null);
  set("reqWatt", fields.reqWatt != null ? String(fields.reqWatt) : null);
  set("reqLumen", fields.reqLumen ?? null);
  set("reqBeamAngle", fields.reqBeamAngle != null ? String(fields.reqBeamAngle) : null);
  set("reqSizeCm", fields.reqSizeCm != null ? String(fields.reqSizeCm) : null);
  set("reqShape", fields.reqShape ?? null);
  set("reqColor", fields.reqColor ?? null);
  set("reqDimmable", fields.reqDimmable ?? null);
  await db.update(specLines).set(patch).where(eq(specLines.id, specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "spec_line_edited",
    actor,
    payload: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
  });
}
