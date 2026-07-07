// Dossier-, spec-regel- en offerte-logica (calculatorflow, BUILD-PLAN §4.3).
import { asc, eq, sql } from "drizzle-orm";
import {
  projectDossiers,
  quoteLines,
  quotes,
  specLines,
  visibleProducts,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type Phase = "tender" | "awarded";

// ── Dossiers ─────────────────────────────────────────────────────────────────
export async function listDossiers(db: AppDb) {
  return db
    .select()
    .from(projectDossiers)
    .orderBy(asc(projectDossiers.createdAt));
}

export async function createDossier(
  db: AppDb,
  input: { name: string; customer?: string | null; phase?: Phase; actor?: string },
) {
  const [row] = await db
    .insert(projectDossiers)
    .values({
      name: input.name,
      customer: input.customer ?? null,
      phase: input.phase ?? "tender", // default = veilig (regel 4)
    })
    .returning();
  await logEvent(db, {
    entity: "dossier",
    entityId: row.id,
    action: "dossier_created",
    actor: input.actor,
    payload: { name: row.name, phase: row.phase },
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

export async function setDossierPhase(
  db: AppDb,
  id: string,
  phase: Phase,
  actor?: string,
) {
  await db
    .update(projectDossiers)
    .set({ phase, updatedAt: new Date() })
    .where(eq(projectDossiers.id, id));
  await logEvent(db, {
    entity: "dossier",
    entityId: id,
    action: "phase_changed",
    actor,
    payload: { phase },
  });
}

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
    })
    .from(specLines)
    .leftJoin(
      visibleProducts,
      eq(specLines.matchedProductId, visibleProducts.id),
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

  const header = {
    quoteNumber: prev?.quoteNumber ?? (await nextQuoteNumber(db)),
    customer: prev?.customer ?? dossier?.customer ?? null,
    contactName: prev?.contactName ?? null,
    address: prev?.address ?? null,
    projectRef: prev?.projectRef ?? dossier?.name ?? null,
    authorEmail: prev?.authorEmail ?? actor ?? null,
    quoteDate:
      prev?.quoteDate ?? new Date().toISOString().slice(0, 10),
    validUntil: prev?.validUntil ?? null,
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
    await db.insert(quoteLines).values(
      matched.map((l) => {
        const unit = Number(l.manualPrice ?? l.matchedPrice);
        const qty = l.quantity ?? 0; // aantal ontbreekt → stukprijs-modus (A-07)
        return {
          quoteId: quote.id,
          specLineId: l.id,
          productId: l.matchedProductId,
          productName: l.matchedName ?? l.productText ?? l.fixtureCode,
          fixtureCode: l.fixtureCode,
          quantity: qty,
          unitPrice: unit.toFixed(2),
          lineTotal: (unit * qty).toFixed(2),
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
