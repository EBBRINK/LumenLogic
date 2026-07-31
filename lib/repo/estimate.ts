// UI-naam: Project. Eén bron voor de estimate (B5, stap 9): het scherm
// (components/dossier/quote-view.tsx) en de PDF (lib/pdf/estimate.ts) rekenen allebei
// via computeEstimate — dezelfde totalen, dezelfde p.m.-regels, dezelfde volgorde.
// Nooit twee waarheden. Prijzen zijn bewust bruto adviesprijs (B5): kortingen horen
// bij de offerte, buiten de tool.
//
// Welke statussen p.m. zijn wordt hier AFGELEID van countsInTotal (PM_STATUSES), en de
// twee zinnen die daarover op het klantstuk komen (pmSummary, ESTIMATE_DISCLAIMER)
// staan hier ook — scherm en PDF drukken ze af, ze schrijven ze niet zelf. Handmatige
// statuslijsten aan de leeskant zijn verboden: die lieten `open` uit de verantwoording
// vallen terwijl er wél "p.m." naast de regel stond (reviewzwerm A4).
import type { Deviation } from "@/components/dossier/types";
import { STATUS, STATUS_ORDER, type MatchStatus } from "@/components/dossier/status";
import type { AppDb } from "./db";
import { unitPriceOf } from "./day-price";
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

// Alleen groen + geel tellen mee in het projecttotaal (E-02). Eén tuple, en alles wat
// met "telt mee" te maken heeft is ervan afgeleid: countsInTotal() hieronder, het type
// PmStatus, en PM_STATUSES verderop. Zo kan geen status buiten zowel het totaal als de
// verantwoording vallen — precies wat `open` overkwam (reviewzwerm A4): niet opgeteld,
// nergens verantwoord, en tóch "p.m." in de regeltotaalkolom van een klantstuk.
const COUNTING_STATUSES = ["groen", "geel"] as const;
export type CountingStatus = (typeof COUNTING_STATUSES)[number];

// Élke andere status gaat mee als p.m. — getoond, niet opgeteld. Óók `open`, en dat is
// de NORMALE stand van een vers geïmporteerd dossier (matching zet hem), geen randgeval.
export type PmStatus = Exclude<MatchStatus, CountingStatus>;

export function countsInTotal(status: MatchStatus): boolean {
  return (COUNTING_STATUSES as readonly MatchStatus[]).includes(status);
}

// De twee statuslijsten waaruit scherm én PDF hun zinnen bouwen — afgeleid van
// countsInTotal, in de vaste STATUS_ORDER-volgorde. Nooit met de hand opsommen: drie
// losse `l.status === "blauw" | "rood" | "paars"`-filters lieten `open` uit élke
// verantwoording vallen terwijl de regel wél als p.m. werd afgedrukt.
export const COUNTING_ORDER: MatchStatus[] = STATUS_ORDER.filter((s) =>
  countsInTotal(s),
);
export const PM_STATUSES = STATUS_ORDER.filter(
  (s) => !countsInTotal(s),
) as PmStatus[];

// Aantallen per p.m.-status + het totaal. Afgeleid: één sleutel per PM_STATUS.
export type PmCounts = Record<PmStatus, number> & { total: number };

// De verantwoordingsregel onder het eindtotaal: "blue 1 · red 1 · purple 2 · open 4".
// Alleen de statussen die er écht zijn (een "purple 0" is ruis), in STATUS_ORDER-
// volgorde, met de labels uit STATUS — die labels ZIJN de kleurnamen (DESIGN.md O13),
// dus er worden hier geen nieuwe woorden verzonnen. Scherm en PDF drukken exact deze
// string af: nooit twee waarheden.
export function pmSummary(pm: PmCounts): string {
  return PM_STATUSES.filter((s) => pm[s] > 0)
    .map((s) => `${STATUS[s].label.toLowerCase()} ${pm[s]}`)
    .join(" · ");
}

// "green and yellow" / "blue, red, purple and open" — uit de statuslabels.
function statusWords(list: MatchStatus[]): string {
  const words = list.map((s) => STATUS[s].label.toLowerCase());
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// De voettekst onder de estimate. Eén string voor scherm én PDF, opgebouwd uit de
// afgeleide lijsten: komt er een status bij, dan noemt de uitleg hem vanzelf. De oude
// versie somde "blue, red and purple" met de hand op en loog daarmee over `open`.
export const ESTIMATE_DISCLAIMER =
  "Gross prices excl. VAT from valid price lists. " +
  `Only ${statusWords(COUNTING_ORDER)} count; ${statusWords(PM_STATUSES)} are shown ` +
  "as p.m. — displayed, not totaled. Request order is preserved.";

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
  // Aantallen per p.m.-status; `total` telt ÁLLE niet-tellende regels (afgeleid), niet
  // een som van een paar met de hand genoemde statussen.
  pm: PmCounts;
  // Álle p.m.-regels in aanvraagvolgorde. Wie de verantwoording afdrukt itereert hier
  // (of over pmByStatus) en kan geen status vergeten.
  pmLines: EstimateLine[];
  // Dezelfde regels, gegroepeerd per status — voor de "open punten"-lijst, die per
  // status een eigen zin en een eigen bolletje heeft.
  pmByStatus: Record<PmStatus, EstimateLine[]>;
  blauwLines: EstimateLine[]; // p.m.: merk inladen (onze actie)
  roodLines: EstimateLine[]; // p.m.: terug naar de klant
  paarsLines: EstimateLine[]; // p.m.: buiten assortiment, expliciet gemeld
  openLines: EstimateLine[]; // p.m.: nog niet gematcht, geen product gekozen
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

  // p.m.-regels: getoond, niet opgeteld. Afgeleid van countsInTotal — dezelfde wet die
  // countedLineTotal gebruikt, dus wat niet in het totaal zit staat gegarandeerd wél in
  // de verantwoording. De named arrays hieronder zijn alleen nog uitsnedes.
  const pmLines = lines.filter((l) => !countsInTotal(l.status));
  const pmByStatus = Object.fromEntries(
    PM_STATUSES.map((s) => [s, pmLines.filter((l) => l.status === s)]),
  ) as Record<PmStatus, EstimateLine[]>;
  const pm: PmCounts = {
    ...(Object.fromEntries(
      PM_STATUSES.map((s) => [s, pmByStatus[s].length]),
    ) as Record<PmStatus, number>),
    total: pmLines.length,
  };

  // Open punten & acties: welke merken moeten wij inladen (blauw)?
  const freq = new Map<string, number>();
  for (const l of pmByStatus.blauw) {
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
    pmLines,
    pmByStatus,
    blauwLines: pmByStatus.blauw,
    roodLines: pmByStatus.rood,
    paarsLines: pmByStatus.paars,
    openLines: pmByStatus.open,
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
    unitPrice: unitPriceOf(r).unitPrice, // I-04: dagprijs wint (lib/repo/day-price.ts)
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
