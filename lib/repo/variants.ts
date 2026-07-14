// Echte kleurvarianten voor de variant-review-kaart (stap 7, herontwerp §4).
// Zusterproducten = zelfde merk + zelfde naam mínus kleur-token (de kleur-tokens komen
// uit de naam-parser, lib/enrichment/parser.ts — één bron). Er wordt UITSLUITEND uit
// `visible_products` gelezen (ijzeren regel 3): een zustervariant met verlopen
// prijslijst bestaat hier niet. Nul varianten gevonden → de kaart valt terug op de
// kandidatenlijst van de regel; er wordt nooit een kleur verzonnen.
import { asc, eq, sql } from "drizzle-orm";
import { specLineCandidates, specLines, visibleProducts } from "@/db/schema";
import { extractColorTokens } from "@/lib/enrichment/parser";
import type { AppDb } from "./db";

export type ColorVariant = {
  productId: string;
  color: string; // de kleur zoals de productnaam hem draagt (bv. "white", "black/gold")
  name: string;
};

// Het ankerproduct van de regel: de gekozen match, anders de best gerankte kandidaat.
async function anchorProductId(db: AppDb, specLineId: string): Promise<string | null> {
  const [line] = await db
    .select({ matchedProductId: specLines.matchedProductId })
    .from(specLines)
    .where(eq(specLines.id, specLineId))
    .limit(1);
  if (!line) return null;
  if (line.matchedProductId) return line.matchedProductId;
  const [top] = await db
    .select({ productId: specLineCandidates.productId })
    .from(specLineCandidates)
    .where(eq(specLineCandidates.specLineId, specLineId))
    .orderBy(asc(specLineCandidates.rank))
    .limit(1);
  return top?.productId ?? null;
}

// Vind de kleurvarianten (zusterproducten) van de regel-match. Retour bevat óók het
// anker zelf als zijn naam een kleur draagt — de gevraagde kleur kan de juiste zijn.
// Eén variant per kleur (eerste op alfabet wint); volgorde = naam-alfabet, nooit prijs
// (ijzeren regel 2 — geld raakt geen enkele rangschikking).
export async function getColorVariants(
  db: AppDb,
  specLineId: string,
): Promise<ColorVariant[]> {
  const anchorId = await anchorProductId(db, specLineId);
  if (!anchorId) return [];

  const [anchor] = await db
    .select({ name: visibleProducts.name, brandName: visibleProducts.brandName })
    .from(visibleProducts)
    .where(eq(visibleProducts.id, anchorId))
    .limit(1);
  if (!anchor?.name) return []; // niet (meer) zichtbaar → geen varianten

  const { baseKey } = extractColorTokens(anchor.name);
  if (!baseKey) return [];

  // Grove SQL-voorselectie binnen het merk (eerste betekenisvolle basistoken in de
  // naam), daarna de precieze basissleutel-vergelijking in JS — de kleurlogica leeft
  // op één plek (de naam-parser), niet half in SQL.
  const firstToken = baseKey.split(" ").find((t) => t.length >= 2) ?? baseKey;
  const rows = await db
    .select({ id: visibleProducts.id, name: visibleProducts.name })
    .from(visibleProducts)
    .where(
      sql`${visibleProducts.brandName} = ${anchor.brandName} and ${visibleProducts.name} ilike ${"%" + firstToken + "%"}`,
    )
    .orderBy(asc(visibleProducts.name))
    .limit(200);

  const seen = new Set<string>();
  const out: ColorVariant[] = [];
  for (const r of rows) {
    const name = String(r.name ?? "");
    const parsed = extractColorTokens(name);
    if (parsed.baseKey !== baseKey) continue; // geen zuster
    if (parsed.colors.length === 0) continue; // naam draagt geen kleur → geen variantknop
    const color = parsed.colors.join(" / ");
    if (seen.has(color)) continue;
    seen.add(color);
    out.push({ productId: String(r.id), color, name });
  }
  return out;
}
