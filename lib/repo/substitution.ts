// Substitutievoorstel + systeemalternatieven (F-06/07/08, werkvoorbereiding).
//
// Bouwt een veld-voor-veld-vergelijking tussen een voorgeschreven referentie-armatuur en
// een (groener/gelijkwaardig) alternatief: objectieve technische velden (kleurtemperatuur,
// CRI, IP) + duurzaamheid (garantie / repareerbaarheid / EPD / herkomst), telkens met
// bronvermelding 'merk-opgave' — we citeren de cijfers van het merk zelf, niet onafhankelijk
// geverifieerd. Het prijsverschil komt UITSLUITEND als tekst in de saving_note terecht (F-08);
// prijs beïnvloedt nooit een ordening of selectie (ijzeren regel 2). Beide producten worden
// via de gelijkwaardigheidslaag (getReference → visible_products) gelezen — een verlopen
// prijslijst = onvindbaar (ijzeren regel 3), dus daar kan geen substitutievoorstel op.
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { products, substitutionProposals } from "@/db/schema";
import type { SubstitutionProposal } from "@/db/schema";
import { formatEur } from "@/lib/format";
import type { AppDb } from "./db";
import { getReference, type Reference } from "./equivalence";
import { getSpecLines } from "./dossiers";
import { logEvent } from "./events";

// Alle objectieve cijfers komen van het merk zelf.
const SOURCE = "merk-opgave";

export type SubstitutionField = {
  field: string;
  reference: string | null;
  alternative: string | null;
  source: string;
};

// ── Veld-voor-veld-vergelijking bouwen ───────────────────────────────────────
function fmt(v: string | number | null, unit = ""): string | null {
  if (v == null || v === "") return null;
  return `${v}${unit}`;
}

// Vaste volgorde: technisch, dan duurzaamheid. Nooit op prijs (regel 2) — prijs staat
// hier zelfs niet in de tabel, alleen als tekst in de saving_note (F-08).
function buildFields(ref: Reference, alt: Reference): SubstitutionField[] {
  const rows: [string, string | null, string | null][] = [
    ["Kleurtemperatuur", fmt(ref.kelvin, "K"), fmt(alt.kelvin, "K")],
    ["CRI", fmt(ref.cri), fmt(alt.cri)],
    ["IP-waarde", fmt(ref.ipValue), fmt(alt.ipValue)],
    ["Garantie", fmt(ref.warrantyMonths, " mnd"), fmt(alt.warrantyMonths, " mnd")],
    ["Repareerbaarheid", fmt(ref.repairability), fmt(alt.repairability)],
    ["Levensduur (EPD)", fmt(ref.epdLifetimeHours, " u"), fmt(alt.epdLifetimeHours, " u")],
    ["Herkomst", fmt(ref.countryOfOrigin), fmt(alt.countryOfOrigin)],
  ];
  return rows.map(([field, reference, alternative]) => ({
    field,
    reference,
    alternative,
    source: SOURCE,
  }));
}

// F-08: prijsverschil ALS TEKST. Positief = alternatief goedkoper = besparing. De note zegt
// expliciet dat prijs niet meeweegt in de rangschikking — tonen mag, sorteren nooit.
function buildSavingNote(ref: Reference, alt: Reference): string {
  const r = ref.grossPrice == null ? null : Number(ref.grossPrice);
  const a = alt.grossPrice == null ? null : Number(alt.grossPrice);
  const tail = "Prijs is informatief en weegt nooit mee in de rangschikking (F-08).";
  if (r == null || a == null || Number.isNaN(r) || Number.isNaN(a)) {
    return `Prijsverschil niet te bepalen — een geldige prijs ontbreekt. ${tail}`;
  }
  const diff = r - a;
  const abs = formatEur(Math.abs(diff));
  const pair = `referentie ${formatEur(r)} → alternatief ${formatEur(a)}`;
  if (diff > 0) return `Besparing ${abs} per stuk (${pair}). ${tail}`;
  if (diff < 0) return `Meerprijs ${abs} per stuk (${pair}). ${tail}`;
  return `Gelijke stukprijs (${pair}). ${tail}`;
}

// Legt een substitutievoorstel vast: het veld-voor-veld-document + de kostentekst. Idempotent
// hoeft dit niet te zijn — elk voorstel is een momentopname (de catalogus/prijzen bewegen).
export async function createSubstitution(
  db: AppDb,
  input: {
    dossierId: string;
    specLineId?: string | null;
    referenceProductId: string;
    alternativeProductId: string;
    actor?: string;
  },
): Promise<SubstitutionProposal> {
  const [ref, alt] = await Promise.all([
    getReference(db, input.referenceProductId),
    getReference(db, input.alternativeProductId),
  ]);
  if (!ref)
    throw new Error(
      "Referentieproduct is niet zichtbaar (mogelijk een verlopen prijslijst).",
    );
  if (!alt)
    throw new Error(
      "Alternatief product is niet zichtbaar (mogelijk een verlopen prijslijst).",
    );

  const fields = buildFields(ref, alt);
  const savingNote = buildSavingNote(ref, alt);

  const [row] = await db
    .insert(substitutionProposals)
    .values({
      dossierId: input.dossierId,
      specLineId: input.specLineId ?? null,
      referenceProductId: input.referenceProductId,
      alternativeProductId: input.alternativeProductId,
      fields,
      savingNote,
      actor: input.actor ?? null,
    })
    .returning();

  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "substitution_created",
    actor: input.actor,
    payload: {
      referenceProductId: input.referenceProductId,
      alternativeProductId: input.alternativeProductId,
      specLineId: input.specLineId ?? null,
    },
  });

  return row;
}

// ── Leeslaag (document + lijst) ──────────────────────────────────────────────
export type SubstitutionParty = {
  id: string | null;
  name: string | null;
  brandName: string | null;
  articleCode: string | null;
};

export type SubstitutionDetail = {
  id: string;
  dossierId: string;
  specLineId: string | null;
  reference: SubstitutionParty;
  alternative: SubstitutionParty;
  fields: SubstitutionField[];
  savingNote: string | null;
  createdAt: Date | string;
};

// Namen/artikelcodes komen uit de basis-`products`-tabel (identiteit, geen prijs) zodat het
// document ook leesbaar blijft als de prijslijst intussen verliep — de vergelijkingscijfers
// zelf zijn al bij het aanmaken vastgelegd.
export async function getSubstitution(
  db: AppDb,
  id: string,
): Promise<SubstitutionDetail | null> {
  const refP = alias(products, "ref_p");
  const altP = alias(products, "alt_p");
  const [row] = await db
    .select({
      id: substitutionProposals.id,
      dossierId: substitutionProposals.dossierId,
      specLineId: substitutionProposals.specLineId,
      fields: substitutionProposals.fields,
      savingNote: substitutionProposals.savingNote,
      createdAt: substitutionProposals.createdAt,
      refId: refP.id,
      refName: refP.name,
      refBrand: refP.brandName,
      refArticle: refP.articleCode,
      altId: altP.id,
      altName: altP.name,
      altBrand: altP.brandName,
      altArticle: altP.articleCode,
    })
    .from(substitutionProposals)
    .leftJoin(refP, eq(substitutionProposals.referenceProductId, refP.id))
    .leftJoin(altP, eq(substitutionProposals.alternativeProductId, altP.id))
    .where(eq(substitutionProposals.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: String(row.id),
    dossierId: String(row.dossierId),
    specLineId: row.specLineId ? String(row.specLineId) : null,
    reference: {
      id: row.refId ?? null,
      name: row.refName ?? null,
      brandName: row.refBrand ?? null,
      articleCode: row.refArticle ?? null,
    },
    alternative: {
      id: row.altId ?? null,
      name: row.altName ?? null,
      brandName: row.altBrand ?? null,
      articleCode: row.altArticle ?? null,
    },
    fields: (row.fields as SubstitutionField[] | null) ?? [],
    savingNote: row.savingNote ?? null,
    createdAt: row.createdAt as Date,
  };
}

export type SubstitutionSummary = {
  id: string;
  createdAt: Date | string;
  savingNote: string | null;
  referenceName: string | null;
  referenceBrand: string | null;
  alternativeName: string | null;
  alternativeBrand: string | null;
};

export async function listSubstitutions(
  db: AppDb,
  dossierId: string,
): Promise<SubstitutionSummary[]> {
  const refP = alias(products, "ref_p");
  const altP = alias(products, "alt_p");
  const rows = await db
    .select({
      id: substitutionProposals.id,
      createdAt: substitutionProposals.createdAt,
      savingNote: substitutionProposals.savingNote,
      referenceName: refP.name,
      referenceBrand: refP.brandName,
      alternativeName: altP.name,
      alternativeBrand: altP.brandName,
    })
    .from(substitutionProposals)
    .leftJoin(refP, eq(substitutionProposals.referenceProductId, refP.id))
    .leftJoin(altP, eq(substitutionProposals.alternativeProductId, altP.id))
    .where(eq(substitutionProposals.dossierId, dossierId))
    .orderBy(desc(substitutionProposals.createdAt));
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: r.createdAt as Date,
    savingNote: r.savingNote ?? null,
    referenceName: r.referenceName ?? null,
    referenceBrand: r.referenceBrand ?? null,
    alternativeName: r.alternativeName ?? null,
    alternativeBrand: r.alternativeBrand ?? null,
  }));
}

// ── Systeemalternatieven (cross-categorie, heuristisch) ──────────────────────
// Eenvoudige functionele-gelijkwaardigheidssuggestie op zone + aantal: veel losse spots in
// één zone kunnen functioneel vervangen worden door één doorlopend lijnsysteem. Nadrukkelijk
// een "voorstel" — de werkvoorbereider beoordeelt lichtbeeld/dimming zelf. Geen prijs in het
// spel; de rangschikking is puur op aantal (regel 2 blijft gelden).
export type SystemAlternative = {
  zone: string;
  spotCount: number;
  lineCount: number;
  fixtureCodes: string[];
  suggestion: string;
  rationale: string;
  kind: "voorstel";
};

const SPOT_RE = /\b(spot|spots|spotje|inbouwspot|downlight)\b/i;

function looksLikeSpot(l: {
  productText: string | null;
  matchedName: string | null;
  description: string | null;
  fixtureCode: string;
}): boolean {
  const hay = [l.productText, l.matchedName, l.description, l.fixtureCode]
    .filter(Boolean)
    .join(" ");
  return SPOT_RE.test(hay);
}

export async function systeemAlternatieven(
  db: AppDb,
  dossierId: string,
  opts: { threshold?: number } = {},
): Promise<SystemAlternative[]> {
  const threshold = opts.threshold ?? 4;
  const lines = await getSpecLines(db, dossierId);

  const byZone = new Map<
    string,
    { spotCount: number; lineCount: number; fixtureCodes: string[] }
  >();
  for (const l of lines) {
    const zone = (l.zone ?? "").trim();
    if (!zone) continue; // geen zone → geen zone-gebonden voorstel
    if (!looksLikeSpot(l)) continue;
    const entry =
      byZone.get(zone) ?? { spotCount: 0, lineCount: 0, fixtureCodes: [] };
    entry.spotCount += l.quantity ?? 1; // aantal ontbreekt → tel als 1
    entry.lineCount += 1;
    entry.fixtureCodes.push(l.fixtureCode);
    byZone.set(zone, entry);
  }

  const out: SystemAlternative[] = [];
  for (const [zone, e] of byZone) {
    if (e.spotCount < threshold) continue;
    out.push({
      zone,
      spotCount: e.spotCount,
      lineCount: e.lineCount,
      fixtureCodes: e.fixtureCodes,
      suggestion: `${e.spotCount} spots in zone “${zone}” → overweeg één doorlopend lijnsysteem`,
      rationale:
        "Functioneel gelijkwaardig lichtniveau met minder armaturen en montagepunten. Cross-categorie voorstel — controleer lichtbeeld, dimming en spreiding vóór overname.",
      kind: "voorstel",
    });
  }
  // Sortering op aantal (nooit prijs), dan zone-naam — puur voor een stabiele weergave.
  out.sort((a, b) => b.spotCount - a.spotCount || a.zone.localeCompare(b.zone));

  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "system_alternatives",
    payload: { count: out.length, threshold },
  });

  return out;
}
