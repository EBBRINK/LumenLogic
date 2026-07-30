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

// Wat er in het veld "Quote number" staat zolang er nog geen nummer is. Eén constante,
// want scherm, PDF en test moeten dezelfde zin gebruiken.
//
// De zin volgt de CODE, niet A-09. A-09 in het functioneel ontwerp zegt "teller verhoogt
// pas bij bevestigen/uitsturen", maar nextQuoteNumber (lib/repo/dossiers.ts) kent het
// nummer toe bij GENEREREN en bewaart het daarna. Dit veld wordt letterlijk op een
// Engelstalig klantstuk afgedrukt (scherm én PDF), dus het mag geen belofte doen die de
// software niet nakomt: "assigned on sending" was net zo onwaar als het oude
// `BL-2026-{nummer volgt}` onleesbaar was. Zie HANDOVER.md 2026-07-30 — welke van de
// twee (ontwerp of code) moet wijken is een besluit voor Timo.
export const NUMBER_PENDING = "Number assigned when the estimate is generated";

// Kopblok (A-09/A-10). Read-only tonen is prima; het nummer volgt bij genereren.
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
  // Het nummer komt bij genereren (nextQuoteNumber). Zolang dat niet is gebeurd staat
  // hier NUMBER_PENDING — geen sjabloonhaken, geen Nederlands (UX-audit bug #6): dit
  // veld wordt letterlijk op een Engelstalig klantdocument (scherm én PDF) afgedrukt.
  quoteNumberDisplay: string;
  // Is er een écht offertenummer? Voor plekken waar de zin anders moet lopen dan een
  // veldwaarde, zoals de PDF-titel en de voettekst.
  quoteNumberAssigned: boolean;
  // A-10 + UX-audit bug #6: kopblok compleet genoeg om het stuk de deur uit te doen?
  // Datum en geldigheid zijn het minimum — een offerte zonder die twee is geen aanbod.
  headerComplete: boolean;
  missingHeaderFields: string[]; // labels, in de volgorde van het kopblok
  // I-06: is de offerte uitgestuurd (bevroren)? Doorgegeven, niet berekend — het scherm
  // en de poort hieronder moeten er allebei op kunnen leunen zonder de quote-rij te zien.
  frozen: boolean;
  // DE POORT (herstel 2026-07-30). Mag dit stuk naar buiten: Print, Download PDF,
  // → To XIS? Eén veld, drie aanroepers (pagina, PDF-route, XIS-action) — nooit twee
  // waarheden.
  //
  // Een BEVROREN offerte is nooit gepoort. Die IS het verstuurde document: weigeren om
  // hem te printen is de omgekeerde wereld, en het kopblok staat dan bovendien op slot
  // (updateQuoteHeader weigert, "Edit header" wordt niet gerenderd) — de gebruiker zou
  // gestuurd worden naar een knop die niet bestaat en een veld dat niet schrijfbaar is.
  // Dat gold ook voor élke offerte die al in productie stond: die hebben allemaal
  // valid_until = NULL, want geen enkel codepad heeft dat veld ooit gevuld.
  outputsAllowed: boolean;
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
  opts: { frozen?: boolean } = {},
): EstimateComputed {
  // Hier wordt GEEN nummer toegekend — dat doet generateQuote. Alleen de weergave is
  // veranderd (UX-audit bug #6): de oude fallback was `BL-{jaar}-{nummer volgt}` — een
  // Nederlandse zin mét accolades op een Engelstalig klantdocument, die als onvervulde
  // sjabloonvariabele leest.
  //
  // .trim() aan beide kanten: een kop met alleen witruimte in het nummerveld is geen
  // nummer. Zonder de trim leverde " " een lege PDF-titel op ("Estimate  — …"), terwijl
  // de datumchecks hieronder wél al trimden.
  const quoteNumber = header.quoteNumber?.trim() || "";
  const quoteNumberAssigned = quoteNumber !== "";
  const quoteNumberDisplay = quoteNumberAssigned ? quoteNumber : NUMBER_PENDING;

  // Kopblokpoort (bug #6): datum en geldigheid zijn het minimum voor een klantstuk.
  const missingHeaderFields: string[] = [];
  if (!header.quoteDate?.trim()) missingHeaderFields.push("Date");
  if (!header.validUntil?.trim()) missingHeaderFields.push("Valid until");
  const headerComplete = missingHeaderFields.length === 0;
  const frozen = opts.frozen ?? false;
  const outputsAllowed = headerComplete || frozen;

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
    frozen,
    outputsAllowed,
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

  // I-06: bevroren = uitgestuurd. Gaat mee de berekening in, want de poort
  // (outputsAllowed) hangt eraan en die moet overal hetzelfde antwoord geven.
  const frozen = quote?.frozenAt != null;

  return {
    dossier,
    quote, // volledige offerte-rij (o.a. frozenAt voor het kopblok-slot, I-06)
    header,
    lines,
    frozen,
    computed: computeEstimate(header, lines, { frozen }),
  };
}

export type EstimateData = NonNullable<Awaited<ReturnType<typeof getEstimateData>>>;
