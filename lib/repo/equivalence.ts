// Gelijkwaardigheids-/duurzaamheidsengine (run 3) — "scheidsrechter, geen rechter".
//
// Rangschikt alternatieven UITSLUITEND op objectieve, door het merk aangeleverde velden:
//   1. technische gelijkwaardigheid (categorie, kleurtemperatuur, CRI, IP);
//   2. duurzaamheid (garantie, repareerbaarheid, EPD/levensduur) als tiebreak.
// Prijs komt in GEEN enkele vergelijkings- of sorteerstap voor (ijzeren regel 2).
// Ontbrekende data wordt eerlijk als "geen data" getoond, nooit stilzwijgend weggelaten.
// Leest enkel uit visible_products. ⚠️ Sinds migratie 0022 betekent dat NIET meer "alleen
// producten met een geldige prijs": een verlopen prijslijst levert een vindbaar product
// zónder bedrag (regel 3, herschreven). Voor de REFERENTIE is dat gewenst — je zoekt juist
// een vervanger — maar de ALTERNATIEVEN worden hieronder expliciet op 'actueel' gefilterd.
import { and, ne, sql } from "drizzle-orm";
import { leesPrijstoestand, type Prijstoestand } from "@/lib/prijstoestand";
import { visibleProducts } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type ComparedField = {
  label: string;
  reference: string | null;
  candidate: string | null;
  verdict: "better" | "worse" | "equal" | "unknown";
  source: string; // altijd merk-opgave — we citeren de cijfers van het merk zelf
};

export type Alternative = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  categoryPath: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  grossPrice: string | null;
  currency: string | null;
  equivalenceScore: number;
  technical: ComparedField[];
  sustainability: ComparedField[];
  rationale: string;
};

export type Reference = {
  id: string;
  name: string;
  brandName: string | null;
  categoryPath: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  grossPrice: string | null;
  /** Regel 3, herschreven: 'actueel' | 'prijslijst_verlopen' | 'uit_prijslijst'. */
  priceState: Prijstoestand;
  warrantyMonths: number | null;
  repairability: string | null;
  epdLifetimeHours: number | null;
  countryOfOrigin: string | null;
};

const FIELDS = {
  priceState: visibleProducts.priceState,
  id: visibleProducts.id,
  name: visibleProducts.name,
  brandName: visibleProducts.brandName,
  articleCode: visibleProducts.articleCode,
  categoryPath: visibleProducts.categoryPath,
  kelvin: visibleProducts.kelvin,
  cri: visibleProducts.cri,
  ipValue: visibleProducts.ipValue,
  grossPrice: visibleProducts.grossPrice,
  currency: visibleProducts.currency,
  warrantyMonths: visibleProducts.warrantyMonths,
  repairability: visibleProducts.repairability,
  epdLifetimeHours: visibleProducts.epdLifetimeHours,
  countryOfOrigin: visibleProducts.countryOfOrigin,
};

function categoryPrefix(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(">>").map((s) => s.trim());
  return parts.slice(0, 2).join(" >> ");
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function techField(
  label: string,
  ref: string | number | null,
  cand: string | number | null,
): ComparedField {
  const r = ref == null ? null : String(ref);
  const c = cand == null ? null : String(cand);
  return {
    label,
    reference: r,
    candidate: c,
    verdict: r != null && c != null && r === c ? "equal" : "unknown",
    source: "merk-opgave",
  };
}

// hogere waarde = beter (garantie, levensduur)
function higherIsBetter(
  label: string,
  ref: number | null,
  cand: number | null,
  unit: string,
): ComparedField {
  let verdict: ComparedField["verdict"] = "unknown";
  if (ref != null && cand != null)
    verdict = cand > ref ? "better" : cand < ref ? "worse" : "equal";
  return {
    label,
    reference: ref == null ? null : `${ref}${unit}`,
    candidate: cand == null ? null : `${cand}${unit}`,
    verdict,
    source: "merk-opgave",
  };
}

export async function getReference(
  db: AppDb,
  productId: string,
): Promise<Reference | null> {
  const [r] = await db
    .select(FIELDS)
    .from(visibleProducts)
    .where(sql`${visibleProducts.id} = ${productId}`)
    .limit(1);
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    brandName: r.brandName ?? null,
    categoryPath: r.categoryPath ?? null,
    kelvin: r.kelvin ?? null,
    cri: r.cri ?? null,
    ipValue: r.ipValue ?? null,
    grossPrice: r.grossPrice ?? null,
    priceState: leesPrijstoestand(r.priceState),
    warrantyMonths: r.warrantyMonths ?? null,
    repairability: r.repairability ?? null,
    epdLifetimeHours: r.epdLifetimeHours ?? null,
    countryOfOrigin: r.countryOfOrigin ?? null,
  };
}

export async function getEquivalentAlternatives(
  db: AppDb,
  opts: {
    phase: "tender" | "awarded";
    referenceProductId: string;
    limit?: number;
    actor?: string;
  },
): Promise<{ reference: Reference | null; alternatives: Alternative[] }> {
  const reference = await getReference(db, opts.referenceProductId);

  // Ijzeren regel 4: in tender-stand nooit alternatieven — default = veilig.
  if (opts.phase !== "awarded") return { reference, alternatives: [] };
  if (!reference) return { reference: null, alternatives: [] };

  const prefix = categoryPrefix(reference.categoryPath);
  const conditions = [
    ne(visibleProducts.id, reference.id),
    // ⚠️ Alleen actuele producten mogen als ALTERNATIEF voorgesteld worden. Sinds migratie
    // 0022 staan vervallen producten wél in de view — vindbaar en rood — maar een
    // alternatief voorstellen dat je niet kunt offreren is erger dan geen alternatief: de
    // gebruiker zou het overnemen en pas bij het opmaken van de offerte merken dat er geen
    // prijs is. Zoeken en matchen tonen vervallen producten juist wél; dáár is de
    // herschreven regel 3 voor. Dit is de andere kant van diezelfde beslissing.
    sql`${visibleProducts.priceState} = 'actueel'`,
  ];
  if (prefix) {
    conditions.push(
      sql`${visibleProducts.categoryPath} ilike ${prefix + "%"}`,
    );
  } else {
    // geen categorie → val terug op het eerste naam-token (productfamilie)
    const token = reference.name.split(/\s+/)[0];
    if (token) conditions.push(sql`${visibleProducts.name} ilike ${token + "%"}`);
    else return { reference, alternatives: [] };
  }

  const rows = await db
    .select(FIELDS)
    .from(visibleProducts)
    .where(and(...conditions))
    .limit(80);

  const refK = reference.kelvin;
  const scored = rows.map((r) => {
    const candK = num(r.kelvin);
    // objectieve gelijkwaardigheid — geen prijs, nergens
    let score = 0;
    if (prefix && r.categoryPath) {
      score += r.categoryPath.trim() === reference.categoryPath?.trim() ? 2 : 1;
    }
    if (refK != null && candK != null) {
      score += Math.max(0, 2 - Math.abs(refK - candK) / 200);
    }
    if (r.brandName && reference.brandName && r.brandName !== reference.brandName)
      score += 0.5; // ander merk = echte value-engineering-optie
    // duurzaamheid als tiebreak (nooit als hoofd-ordening, nooit prijs)
    const w = num(r.warrantyMonths) ?? 0;
    const epd = num(r.epdLifetimeHours) ?? 0;
    const sustain = w / 12 + epd / 50000;
    return { r, score, sustain, candK };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.sustain - a.sustain ||
      String(a.r.name).localeCompare(String(b.r.name)),
  );

  const top = scored.slice(0, opts.limit ?? 4);
  const alternatives: Alternative[] = top.map(({ r, score }) => {
    const technical = [
      techField("Kleurtemperatuur", reference.kelvin, num(r.kelvin)),
      techField("CRI", reference.cri, num(r.cri)),
      techField("IP-waarde", reference.ipValue, r.ipValue ?? null),
    ];
    const sustainability = [
      higherIsBetter(
        "Garantie",
        reference.warrantyMonths,
        num(r.warrantyMonths),
        " mnd",
      ),
      techField("Repareerbaarheid", reference.repairability, r.repairability ?? null),
      higherIsBetter(
        "Levensduur (EPD)",
        reference.epdLifetimeHours,
        num(r.epdLifetimeHours),
        " u",
      ),
      techField("Herkomst", reference.countryOfOrigin, r.countryOfOrigin ?? null),
    ];
    const wins = sustainability.filter((f) => f.verdict === "better");
    const leaf = (r.categoryPath ?? reference.categoryPath ?? "")
      .split(">>")
      .pop()
      ?.trim();
    const parts = [
      `Gelijkwaardig${leaf ? ` ${leaf.toLowerCase()}` : ""}${num(r.kelvin) ? ` ${num(r.kelvin)}K` : ""}`,
    ];
    if (wins.length)
      parts.push(
        `beter op ${wins.map((f) => f.label.toLowerCase()).join(", ")}`,
      );
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      brandName: r.brandName ?? null,
      articleCode: r.articleCode ?? null,
      categoryPath: r.categoryPath ?? null,
      kelvin: num(r.kelvin),
      cri: num(r.cri),
      ipValue: r.ipValue ?? null,
      grossPrice: r.grossPrice ?? null,
      currency: r.currency ?? null,
      equivalenceScore: Math.round(score * 100) / 100,
      technical,
      sustainability,
      rationale: parts.join(" — "),
    };
  });

  await logEvent(db, {
    entity: "product",
    entityId: reference.id,
    action: "suggestions",
    actor: opts.actor,
    payload: { phase: opts.phase, count: alternatives.length },
  });

  return { reference, alternatives };
}
