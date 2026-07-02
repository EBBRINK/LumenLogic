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
      description: specLines.description,
      brandText: specLines.brandText,
      productText: specLines.productText,
      reqKelvin: specLines.reqKelvin,
      reqCri: specLines.reqCri,
      reqIp: specLines.reqIp,
      status: specLines.status,
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
  quantity?: number;
  description?: string | null;
  brandText?: string | null;
  productText?: string | null;
  reqKelvin?: number | null;
  reqCri?: number | null;
  reqIp?: string | null;
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
    quantity: l.quantity ?? 1,
    description: l.description ?? null,
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    reqKelvin: l.reqKelvin ?? null,
    reqCri: l.reqCri ?? null,
    reqIp: l.reqIp ?? null,
    sortOrder: Number(max) + 1 + i,
  }));
  return db.insert(specLines).values(rows).returning();
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

export async function matchSpecLine(
  db: AppDb,
  specLineId: string,
  productId: string,
  actor?: string,
) {
  await db
    .update(specLines)
    .set({ matchedProductId: productId, status: "matched", updatedAt: new Date() })
    .where(eq(specLines.id, specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "match",
    actor,
    payload: { productId },
  });
}

export async function markNoMatch(
  db: AppDb,
  specLineId: string,
  actor?: string,
) {
  await db
    .update(specLines)
    .set({ matchedProductId: null, status: "no_match", updatedAt: new Date() })
    .where(eq(specLines.id, specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "no_match",
    actor,
  });
}

export async function deleteSpecLine(db: AppDb, specLineId: string) {
  await db.delete(specLines).where(eq(specLines.id, specLineId));
}

// ── Offerte ──────────────────────────────────────────────────────────────────
// Genereert (of hergenereert) de offerte uit alle gematchte spec-regels die een
// geldige, niet-verlopen prijs hebben. Regel × stukprijs → totalen.
export async function generateQuote(
  db: AppDb,
  dossierId: string,
  actor?: string,
) {
  const lines = await getSpecLines(db, dossierId);
  const matched = lines.filter(
    (l) => l.matchedProductId && l.matchedPrice != null,
  );

  // bestaande offerte(s) opruimen → hergenereren is idempotent
  const existing = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId));
  for (const q of existing) {
    await db.delete(quoteLines).where(eq(quoteLines.quoteId, q.id));
    await db.delete(quotes).where(eq(quotes.id, q.id));
  }

  const [quote] = await db.insert(quotes).values({ dossierId }).returning();
  if (matched.length > 0) {
    await db.insert(quoteLines).values(
      matched.map((l) => {
        const unit = Number(l.matchedPrice);
        return {
          quoteId: quote.id,
          specLineId: l.id,
          productId: l.matchedProductId,
          productName: l.matchedName ?? l.productText ?? l.fixtureCode,
          fixtureCode: l.fixtureCode,
          quantity: l.quantity,
          unitPrice: unit.toFixed(2),
          lineTotal: (unit * l.quantity).toFixed(2),
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
