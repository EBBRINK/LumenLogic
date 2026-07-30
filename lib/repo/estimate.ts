// UI-naam: Project. Eén bron voor de estimate (B5, stap 9): het scherm
// (components/dossier/quote-view.tsx) en de PDF (lib/pdf/estimate.ts) rekenen allebei
// via computeEstimate — dezelfde totalen, dezelfde p.m.-regels, dezelfde volgorde.
// Nooit twee waarheden. Prijzen zijn bewust bruto adviesprijs (B5): kortingen horen
// bij de offerte, buiten de tool.
import type { Deviation } from "@/components/dossier/types";
import type { MatchStatus } from "@/components/dossier/status";
import type { AppDb } from "./db";
import { getDossier, getQuote, getSpecLines } from "./dossiers";

// Eén estimate-regel. Bewust ontkoppeld van de repo-rijvorm zodat scherm en PDF met
// fixtures getest kunnen worden. Anders dan de gegenereerde offerte bevat de estimate
// ÁLLE spec-regels — óók blauw/rood/paars/open — want niets wordt stilzwijgend weggelaten.
export type EstimateLine = {
  id: string;
  fixtureCode: string;
  zone?: string | null;
  productName: string | null; // gematchte productnaam, anders de gevraagde tekst
  sku: string | null; // artikelcode van het gematchte product
  quantity: number | null;
  unitPrice: string | null; // dagprijs (I-04) wint van catalogusprijs
  status: MatchStatus;
  deviations?: Deviation[] | null;
  brandText?: string | null; // gevraagd merk (voor blauw: welk merk inladen)
  productText?: string | null; // gevraagd type
  // B3: match gekozen door het systeem (chosenBy='system:auto') → label
  // "automatisch geaccepteerde bijna-match" bij de afwijkingsnotitie (scherm + PDF).
  autoAccepted?: boolean;
  // Stap 7 (herontwerp 2026-07-14): match gekozen door een mens (review-keuze,
  // kandidaat of handmatige link) → merkteken "handmatig gekozen" (scherm + PDF).
  manuallyChosen?: boolean;
};

// Wat er in het veld "Quote number" staat zolang er nog geen nummer is (A-09: de
// teller loopt pas bij uitsturen). Eén constante, want scherm, PDF en test moeten
// dezelfde zin gebruiken.
export const NUMBER_PENDING = "Number assigned on sending";

// Kopblok (A-09/A-10). Read-only tonen is prima; het nummer volgt pas bij uitsturen.
export type EstimateHeader = {
  quoteNumber: string | null;
  quoteDate: string | null;
  customer: string | null;
  projectRef: string | null;
  author: string | null;
  validUntil: string | null;
};

// Alleen groen + geel tellen mee in het projecttotaal (E-02). Blauw/rood/paars gaan
// mee als p.m. — getoond, niet opgeteld.
export function countsInTotal(status: MatchStatus): boolean {
  return status === "groen" || status === "geel";
}

// Regeltotaal als de regel meetelt: aantal × stukprijs. Null bij een niet-tellende
// status (p.m.), ontbrekend aantal (p/st) of ontbrekende prijs.
export function countedLineTotal(line: EstimateLine): number | null {
  if (!countsInTotal(line.status)) return null;
  if (line.quantity == null || line.unitPrice == null) return null;
  return Number(line.unitPrice) * line.quantity;
}

// Transparantieregel (C-07): benoemde afwijkingen als subregel — óók binnen groen.
export function notableDeviations(line: EstimateLine): Deviation[] {
  return (line.deviations ?? []).filter(
    (d) => d.verdict !== "onbekend" && d.note && d.note !== "exact",
  );
}

// Gevraagde merk/type-tekst als er (nog) geen gematcht product is.
export function requestedText(line: EstimateLine): string {
  return [line.brandText, line.productText]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

// Regel + doorlopend nummer (aanvraagvolgorde-positie in de hele estimate).
export type NumberedEstimateLine = { line: EstimateLine; nr: number };
export type EstimateZoneGroup = {
  zone: string | null;
  lines: NumberedEstimateLine[];
  // Subtotaal van de tellende regels (groen+geel met aantal én prijs) binnen de zone.
  // Het scherm toont dit (nog) niet; de PDF wel.
  subtotal: number;
};

export type EstimateComputed = {
  // A-09: het nummer komt pas bij uitsturen. Zolang dat niet is gebeurd staat hier
  // NUMBER_PENDING — geen sjabloonhaken, geen Nederlands (UX-audit bug #6): dit veld
  // wordt letterlijk op een Engelstalig klantdocument (scherm én PDF) afgedrukt.
  quoteNumberDisplay: string;
  // Is er een écht offertenummer? Voor plekken waar de zin anders moet lopen dan een
  // veldwaarde, zoals de PDF-titel en de voettekst.
  quoteNumberAssigned: boolean;
  // A-10 + UX-audit bug #6: kopblok compleet genoeg om het stuk de deur uit te doen?
  // Datum en geldigheid zijn het minimum — een offerte zonder die twee is geen aanbod.
  headerComplete: boolean;
  missingHeaderFields: string[]; // labels, in de volgorde van het kopblok
  totals: { groen: number; geel: number; samen: number };
  pm: { blauw: number; rood: number; paars: number; total: number };
  blauwLines: EstimateLine[]; // p.m.: merk inladen (onze actie)
  roodLines: EstimateLine[]; // p.m.: terug naar de klant
  paarsLines: EstimateLine[]; // p.m.: buiten assortiment, expliciet gemeld
  brandFreq: [string, number][]; // blauw: merk → aantal regels, in eerste-verschijning-volgorde
  hasZones: boolean;
  groups: EstimateZoneGroup[];
};

// Groepeer op zone in eerste-verschijning-volgorde; bínnen een zone blijft de
// aanvraagvolgorde intact (de array-volgorde). Nooit hersorteren op status/prijs.
// De nummering (#) is al vooraf toegekend op de globale aanvraagvolgorde, dus die
// blijft stabiel — ongeacht hoe de zones gegroepeerd worden.
function groupByZone(lines: NumberedEstimateLine[]): EstimateZoneGroup[] {
  const groups: EstimateZoneGroup[] = [];
  const index = new Map<string, number>();
  for (const nl of lines) {
    const zone = nl.line.zone;
    const key = zone && zone.trim() ? zone.trim() : "__none__";
    let at = index.get(key);
    if (at === undefined) {
      at = groups.length;
      index.set(key, at);
      groups.push({
        zone: key === "__none__" ? null : zone!.trim(),
        lines: [],
        subtotal: 0,
      });
    }
    groups[at].lines.push(nl);
    groups[at].subtotal += countedLineTotal(nl.line) ?? 0;
  }
  return groups;
}

// De volledige berekening achter de estimate — puur, zonder db. Scherm én PDF
// gebruiken exact deze functie (één bron, stap 9).
export function computeEstimate(
  header: EstimateHeader,
  lines: EstimateLine[],
): EstimateComputed {
  // A-09 blijft ongewijzigd: er wordt hier GEEN nummer gereserveerd, de teller loopt
  // pas bij uitsturen. Alleen de weergave is veranderd (UX-audit bug #6): de oude
  // fallback was `BL-{jaar}-{nummer volgt}` — een Nederlandse zin mét accolades op een
  // Engelstalig klantdocument, die als onvervulde sjabloonvariabele leest. Het jaar
  // erin was bovendien een gok: de teller loopt op het jaar van uitsturen, niet op de
  // offertedatum van nu.
  const quoteNumberAssigned = header.quoteNumber != null;
  const quoteNumberDisplay = header.quoteNumber ?? NUMBER_PENDING;

  // Kopblokpoort (bug #6): datum en geldigheid zijn het minimum voor een klantstuk.
  const missingHeaderFields: string[] = [];
  if (!header.quoteDate?.trim()) missingHeaderFields.push("Date");
  if (!header.validUntil?.trim()) missingHeaderFields.push("Valid until");
  const headerComplete = missingHeaderFields.length === 0;

  // Totalen: groen apart, geel apart, samen. Een regel telt alleen mee met een aantal
  // én een geldige prijs; ontbreekt het aantal, dan is het een stukprijs-regel (p/st).
  let groen = 0;
  let geel = 0;
  for (const l of lines) {
    const t = countedLineTotal(l);
    if (t == null) continue;
    if (l.status === "groen") groen += t;
    else geel += t;
  }

  // p.m.-regels: getoond, niet opgeteld.
  const blauwLines = lines.filter((l) => l.status === "blauw");
  const roodLines = lines.filter((l) => l.status === "rood");
  const paarsLines = lines.filter((l) => l.status === "paars");
  const pm = {
    blauw: blauwLines.length,
    rood: roodLines.length,
    paars: paarsLines.length,
    total: blauwLines.length + roodLines.length + paarsLines.length,
  };

  // Open punten & acties: welke merken moeten wij inladen (blauw)?
  const freq = new Map<string, number>();
  for (const l of blauwLines) {
    const b = (l.brandText ?? "").trim() || "onbekend merk";
    freq.set(b, (freq.get(b) ?? 0) + 1);
  }

  const hasZones = lines.some((l) => l.zone && l.zone.trim());
  // Nummer vooraf toekennen op globale aanvraagvolgorde, dán pas groeperen.
  const numbered: NumberedEstimateLine[] = lines.map((line, i) => ({
    line,
    nr: i + 1,
  }));

  return {
    quoteNumberDisplay,
    quoteNumberAssigned,
    headerComplete,
    missingHeaderFields,
    totals: { groen, geel, samen: groen + geel },
    pm,
    blauwLines,
    roodLines,
    paarsLines,
    brandFreq: [...freq.entries()],
    hasZones,
    groups: groupByZone(numbered),
  };
}

// ── Db → estimate ────────────────────────────────────────────────────────────
// Eén functie die voor een dossier alle estimate-data levert: kopblok, regels in
// aanvraagvolgorde (getSpecLines sorteert op sort_order), en de volledige berekening.
export async function getEstimateData(db: AppDb, dossierId: string) {
  const dossier = await getDossier(db, dossierId);
  if (!dossier) return null;

  const [specRows, quoteData] = await Promise.all([
    getSpecLines(db, dossierId),
    getQuote(db, dossierId),
  ]);

  const lines: EstimateLine[] = specRows.map((r) => ({
    id: r.id,
    fixtureCode: r.fixtureCode,
    zone: r.zone,
    status: r.status as MatchStatus,
    quantity: r.quantity,
    productName: r.matchedName ?? null,
    sku: r.matchedArticleCode ?? null,
    unitPrice: r.manualPrice ?? r.matchedPrice ?? null, // I-04: dagprijs wint
    deviations: (r.deviations as Deviation[] | null) ?? null,
    brandText: r.brandText,
    productText: r.productText,
    autoAccepted: r.chosenBy === "system:auto",
    manuallyChosen: r.chosenBy != null && r.chosenBy !== "system:auto",
  }));

  const quote = quoteData?.quote ?? null;
  const header: EstimateHeader = {
    quoteNumber: quote?.quoteNumber ?? null,
    quoteDate: quote?.quoteDate ?? null,
    customer: quote?.customer ?? dossier.customer,
    projectRef: quote?.projectRef ?? null,
    author: quote?.authorEmail ?? null,
    validUntil: quote?.validUntil ?? null,
  };

  return {
    dossier,
    quote, // volledige offerte-rij (o.a. frozenAt voor het kopblok-slot, I-06)
    header,
    lines,
    computed: computeEstimate(header, lines),
  };
}

export type EstimateData = NonNullable<Awaited<ReturnType<typeof getEstimateData>>>;
