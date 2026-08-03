// De prijsloze estimate (sprint 3.2b) — de vorm die een EXTERN account te zien krijgt,
// op het scherm én op de PDF.
//
// ⚠️ DE KERN: dit is geen vlag die de sjabloon uitzet, het is een PROJECTIE die het geld
// weggooit. `toPricelessEstimate()` levert een `PricelessEstimate` waarin `unitPrice`,
// de regeltotalen, de zone-subtotalen en het eindtotaal er niet meer ZIJN — niet op nul,
// niet op null, weg. Het externe renderpad (lib/pdf/estimate-extern.ts,
// components/dossier/quote-view-extern.tsx) kent alleen dit type, dus een bedrag
// afdrukken is er geen vergissing meer maar een typefout die niet compileert.
//
// Waarom niet gewoon `renderEstimatePdf(data, { prijzen: false })`? Omdat zo'n vlag op
// één plek gelezen wordt en op tien plekken bedragen staan. Eén vergeten tak, één nieuwe
// kolom, één `formatEur()` in een subregel en het lekt — en het lekt naar buiten, naar
// de partij die de prijzen juist niet mag zien. Ijzeren regel 4: default = veilig.
//
// Wat er WÉL op staat: de regels zelf, aantallen, statussen en hun kleuren, zones, de
// afwijkingsnotities en de open punten. De klant ziet dus precies wat er geleverd wordt
// en waar het nog aan schort — alleen niet wat het kost.
import type { MatchStatus } from "@/components/dossier/status";
import {
  requestedText,
  type EstimateComputed,
  type EstimateHeader,
  type EstimateLine,
  type PmStatus,
} from "./estimate";

/**
 * Eén estimate-regel zónder geld. `unitPrice` is eruit gelicht, en `dayPriceExpiredOn`
 * ook: dat merkteken vertelt wélke prijsbron gebruikt is ("day price expired — catalogue
 * price used instead"). Dat is commerciële binnenkant, en zonder bedrag ernaast is het
 * voor de ontvanger bovendien betekenisloos.
 */
export type PricelessLine = Omit<EstimateLine, "unitPrice" | "dayPriceExpiredOn">;

export type PricelessNumberedLine = { line: PricelessLine; nr: number };

/**
 * Zonegroep zónder `subtotal`. De interne `EstimateZoneGroup` draagt dat veld; hier
 * bestaat het niet, dus er valt ook geen subtotaal per zone af te drukken.
 */
export type PricelessZoneGroup = {
  zone: string | null;
  lines: PricelessNumberedLine[];
};

/**
 * Het volledige externe stuk. Bewust géén `computed`-object met een `totals`-veld erin:
 * wat er niet is kan niet per ongeluk gerenderd worden.
 */
export type PricelessEstimate = {
  dossierName: string;
  /** Kopblok. Bevat per definitie geen bedragen — nummer, datums, klant, project, auteur. */
  header: EstimateHeader;
  quoteNumberDisplay: string;
  quoteNumberAssigned: boolean;
  lineCount: number;
  hasZones: boolean;
  groups: PricelessZoneGroup[];
  /** Alle niet-tellende regels in aanvraagvolgorde — de "open punten". */
  pmLines: PricelessLine[];
  pmByStatus: Record<PmStatus, PricelessLine[]>;
  /** Blauw: welk merk moet er nog ingeladen worden, en hoe vaak. */
  brandFreq: [string, number][];
};

/** Gooit het geld eruit. Eén plek, want scherm en PDF moeten hetzelfde weglaten. */
function stripLine(line: EstimateLine): PricelessLine {
  // Expliciet uitpakken en niet `delete`/rest-spread: komt er ooit een tweede geldveld
  // op EstimateLine bij, dan valt dat hier niet stilzwijgend doorheen — het staat er
  // gewoon niet in, en de test die op nul bedragen toetst blijft groen omdat er niets
  // te lekken viel.
  return {
    id: line.id,
    fixtureCode: line.fixtureCode,
    zone: line.zone,
    productName: line.productName,
    sku: line.sku,
    quantity: line.quantity,
    status: line.status,
    deviations: line.deviations,
    brandText: line.brandText,
    productText: line.productText,
    autoAccepted: line.autoAccepted,
    manuallyChosen: line.manuallyChosen,
  };
}

/**
 * De projectie. Neemt precies de vier stukken die ze leest — een volledige `EstimateData`
 * past er structureel in, en een fixture in een test hoeft geen dossierrij, quote-rij en
 * `frozen`-vlag te verzinnen om hem aan te kunnen roepen.
 */
export type PricelessSource = {
  dossier: { name: string };
  header: EstimateHeader;
  lines: readonly EstimateLine[];
  computed: EstimateComputed;
};

export function toPricelessEstimate(data: PricelessSource): PricelessEstimate {
  const { computed } = data;
  return {
    dossierName: data.dossier.name,
    header: data.header,
    quoteNumberDisplay: computed.quoteNumberDisplay,
    quoteNumberAssigned: computed.quoteNumberAssigned,
    lineCount: data.lines.length,
    hasZones: computed.hasZones,
    groups: computed.groups.map((g) => ({
      zone: g.zone,
      lines: g.lines.map((nl) => ({ line: stripLine(nl.line), nr: nl.nr })),
    })),
    pmLines: computed.pmLines.map(stripLine),
    pmByStatus: Object.fromEntries(
      Object.entries(computed.pmByStatus).map(([s, ls]) => [s, ls.map(stripLine)]),
    ) as Record<PmStatus, PricelessLine[]>,
    brandFreq: computed.brandFreq,
  };
}

/**
 * Eén zin per open-punt-status, in gewone tekst — gedeeld door scherm én PDF, zodat de
 * twee niet uit elkaar lopen. (Het interne pad heeft hiervan twee kopieën, één in
 * quote-view.tsx en één in lib/pdf/estimate.ts; dat is precies de fout die dit bestand
 * niet herhaalt.)
 *
 * Verschil met de interne zinnen: "p.m." staat er niet meer bij. Dat is een boekhoudterm
 * voor "wel genoemd, niet opgeteld" — hij verwijst naar een totaal dat op dit stuk niet
 * bestaat, dus hij zou naar niets wijzen.
 */
export const EXTERN_PM_SENTENCE: Record<PmStatus, (l: PricelessLine) => string> = {
  blauw: (l) => `brand still to be loaded — ${(l.brandText ?? "").trim() || "unknown"}`,
  rood: () => "brand known, this exact product not — back to you",
  paars: (l) =>
    `outside assortment${requestedText(l) ? ` — ${requestedText(l)}` : ""}`,
  open: (l) =>
    `not matched yet${requestedText(l) ? ` — ${requestedText(l)}` : ""}`,
};

/**
 * De voettekst van het externe stuk. De interne versie (ESTIMATE_DISCLAIMER) opent met
 * "Gross prices excl. VAT from valid price lists" en legt daarna uit welke kleuren wél
 * en niet meetellen in het totaal — twee zinnen over geld dat hier niet staat. Deze
 * versie zegt wat er in plaats daarvan wél waar is.
 */
export const EXTERN_ESTIMATE_DISCLAIMER =
  "This overview lists the fixtures, quantities and match status per line. " +
  "Pricing is not included — Brink Licht issues the quotation separately. " +
  "Request order is preserved.";

/**
 * Statussen zijn op dit stuk gewoon zichtbaar (kleur + woord): ze zeggen hoe ver de
 * match is, niet wat iets kost. Deze re-export bestaat zodat het externe renderpad de
 * statuslijst niet zelf hoeft samen te stellen.
 */
export type { MatchStatus };
