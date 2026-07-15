// XIS-export (E-09…E-12, run 6). De echte Lynx POST /projects-API bestaat nog niet;
// deze module bouwt het EXPORTBESTAND in exact het payload-formaat dat die API straks
// krijgt (docs/xis-post-api-attributes.md) plus de administratie in de tabel xis_exports.
//
// Twee ijzeren regels zitten hier verankerd:
//  • Aanvraagvolgorde is heilig: regels gaan mee op sort_order — NOOIT hersorteren op
//    status of prijs (XIS-attribuut "sort_order" + docs/matching-regelset.md).
//  • Niets wordt stilzwijgend weggelaten: élke spec-regel komt in de payload. Een regel
//    zónder bruikbare match (blauw/rood/paars/open) gaat mee als 'tekstregel' — zichtbaar,
//    zónder artikel — zodat de aanvraag compleet blijft.
//
// Idempotent op dossier-id (external_reference): hooguit één export per dossier; opnieuw
// exporteren maakt geen duplicaat (createXisExport → {created:false, export}).

import { asc, eq } from "drizzle-orm";
import { quotes, xisExports } from "@/db/schema";
import type { AppDb } from "./db";
import { getDossier, getSpecLines } from "./dossiers";
import { logEvent } from "./events";

export type XisExport = typeof xisExports.$inferSelect;

// Regel-classificatie (pre-flight): waarom een regel wél/niet een artikel meekrijgt.
//  • product      — groen/geel met een gematcht product dat een XIS-artikelcode heeft.
//  • nieuw_product— groen/geel met een gematcht product zónder artikelcode (handmatig
//                   opgevoerd; bestaat nog niet in XIS → moet daar nog aangemaakt worden).
//  • tekstregel   — blauw/rood/paars/open: gaat mee zonder artikel, want niets wordt weggelaten.
export type XisLineKind = "product" | "tekstregel" | "nieuw_product";

export type XisLine = {
  sort_order: number;
  fixture_code: string;
  kind: XisLineKind;
  quantity: number | null;
  description: string | null;
  zone: string | null;
  product_ref: string | null; // XIS-artikelcode (A1); null als het product nog niet in XIS staat
  product_name: string | null;
  unit_price_excl_vat: number | null; // manualPrice ?? bruto catalogusprijs
};

export type XisPayload = {
  project: {
    external_reference: string; // ons dossier-id — idempotentiesleutel
    name: string;
    customer: string | null;
    date: string; // YYYY-MM-DD
    quote_number: string | null;
    notes: string | null;
  };
  lines: XisLine[];
};

type JoinedSpecLine = Awaited<ReturnType<typeof getSpecLines>>[number];

// Classificeer één (al met het matched product gejoinde) spec-regel.
function classify(line: JoinedSpecLine): XisLineKind {
  const matched =
    (line.status === "groen" || line.status === "geel") &&
    line.matchedProductId != null;
  if (!matched) return "tekstregel"; // blauw/rood/paars/open → tekstregel zónder artikel
  // Gematcht, maar geen XIS-artikelcode = handmatig product dat nog niet in XIS bestaat.
  return line.matchedArticleCode ? "product" : "nieuw_product";
}

// Bouwt de volledige payload voor één dossier, in aanvraagvolgorde.
export async function buildXisPayload(
  db: AppDb,
  dossierId: string,
): Promise<XisPayload> {
  const dossier = await getDossier(db, dossierId);
  if (!dossier) throw new Error(`dossier ${dossierId} not found`);

  // getSpecLines sorteert al op sort_order (dan createdAt) — die volgorde houden we exact aan.
  const specLines = await getSpecLines(db, dossierId);

  // Kopblok mag verrijkt worden met nummer/datum uit een bestaande offerte, maar hangt
  // er niet van af (een export kan ook zonder gegenereerde offerte).
  const [quote] = await db
    .select({ quoteNumber: quotes.quoteNumber, quoteDate: quotes.quoteDate })
    .from(quotes)
    .where(eq(quotes.dossierId, dossierId))
    .orderBy(asc(quotes.createdAt))
    .limit(1);

  const lines: XisLine[] = specLines.map((l) => {
    const kind = classify(l);
    const isProduct = kind !== "tekstregel";
    const price = l.manualPrice ?? l.matchedPrice; // I-04: dagprijs wint van catalogusprijs
    const reqSummary = [l.brandText, l.productText].filter(Boolean).join(" ");
    return {
      sort_order: l.sortOrder,
      fixture_code: l.fixtureCode,
      kind,
      quantity: l.quantity ?? null,
      // vrije regeltekst: eigen omschrijving, anders de gevraagde merk/type-samenvatting
      description: l.description ?? (reqSummary || null),
      zone: l.zone ?? null,
      product_ref: kind === "product" ? l.matchedArticleCode : null,
      product_name: isProduct ? l.matchedName ?? null : null,
      unit_price_excl_vat: isProduct && price != null ? Number(price) : null,
    };
  });

  return {
    project: {
      external_reference: dossierId,
      name: dossier.name,
      customer: dossier.customer ?? null,
      date: quote?.quoteDate ?? new Date().toISOString().slice(0, 10),
      quote_number: quote?.quoteNumber ?? null,
      notes: null,
    },
    lines,
  };
}

// Pre-flight-telling voor de export-dialoog: hoeveel echte artikelen, tekstregels en
// nog-aan-te-maken producten gaan er mee?
export async function preflightSummary(
  db: AppDb,
  dossierId: string,
): Promise<{
  productLines: number;
  textLines: number;
  newProducts: number;
  total: number;
}> {
  const { lines } = await buildXisPayload(db, dossierId);
  let productLines = 0;
  let textLines = 0;
  let newProducts = 0;
  for (const l of lines) {
    if (l.kind === "product") productLines++;
    else if (l.kind === "tekstregel") textLines++;
    else newProducts++;
  }
  return { productLines, textLines, newProducts, total: lines.length };
}

// Schrijf een export-snapshot weg. Idempotent op dossier-id: bestaat er al een export,
// dan geven we die terug zonder een tweede rij of dubbele statuswijziging.
export async function createXisExport(
  db: AppDb,
  input: {
    dossierId: string;
    actor?: string;
    environment?: string; // 'sandbox' | 'production' — default sandbox (NFR 7)
  },
): Promise<{ created: boolean; export: XisExport }> {
  const [existing] = await db
    .select()
    .from(xisExports)
    .where(eq(xisExports.dossierId, input.dossierId))
    .orderBy(asc(xisExports.createdAt))
    .limit(1);
  if (existing) return { created: false, export: existing };

  const payload = await buildXisPayload(db, input.dossierId);
  const [row] = await db
    .insert(xisExports)
    .values({
      dossierId: input.dossierId,
      mode: "file", // de Lynx-POST bestaat nog niet → exportbestand
      environment: input.environment ?? "sandbox",
      status: "aangemaakt",
      payload,
    })
    .returning();

  await logEvent(db, {
    entity: "xis_export",
    entityId: row.id,
    action: "xis_exported",
    actor: input.actor,
    payload: {
      dossierId: input.dossierId,
      environment: row.environment,
      lineCount: payload.lines.length,
    },
  });
  return { created: true, export: row };
}

// Alle exports van een dossier (oudste eerst).
export async function getXisExports(
  db: AppDb,
  dossierId: string,
): Promise<XisExport[]> {
  return db
    .select()
    .from(xisExports)
    .where(eq(xisExports.dossierId, dossierId))
    .orderBy(asc(xisExports.createdAt));
}
