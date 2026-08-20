// Productkaart met disclosure-gating (J-01, J-03, J-04, flow §4.11, functioneel ontwerp §3.16).
// PRESENTATIONAL & server-veilig: geen hooks, geen db — het rendert een reeds-opgeloste
// Disclosure. De beslisboom zit in lib/repo/disclosure.ts (resolveDisclosure); hier tonen we
// alleen wat mag:
//   • naam + merk ALTIJD (ook tier3).
//   • specs alleen als disclosure.showSpecs, per veld nog afgevlagd via fieldVisible (J-04).
//     Een verborgen veld levert GEEN lege rij op — het bestaat simpelweg niet in de lijst.
//   • prijs alleen als disclosure.showPrice (tier1, of tier2 intern/met goedgekeurd project).
//     Anders bij priceGated de knop "Prijs via Brink aanvragen" (→ createLead, een lead-event).
//   • tier3/awaitingData → "Data in afwachting van merk", geen specs, geen prijs.
//   • herkomst per verrijkt veld (H-09): spec.tier2Source[veld] wordt als tag getoond.
//
// Ijzeren regels: prijs mag getoond worden, maar rangschikt nooit; disclosure verkoopt nooit
// zichtbaarheid; ontbrekende spec = geen rij hier (de grijze-vlag-vergelijking leeft in de
// vergelijk-tray, de échte naast-elkaar-context).
import { VervallenMarkering } from "@/components/vervallen-markering";
import { leesPrijstoestand } from "@/lib/prijstoestand";
import { fieldVisible, type Disclosure } from "@/lib/repo/disclosure";
import { formatEur } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// Structurele subset van een visible_specs-rij — de pagina geeft de volledige rij door
// (extra velden zijn toegestaan). Eigen type: nooit in gedeelde files schrijven.
export type ProductSpec = {
  id: string | null;
  name: string | null;
  brandName: string | null;
  brandId?: string | null;
  categoryPath: string | null;
  lumenOutput: number | null;
  maxWattage: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  beamAngle: string | null;
  dimmable: string | null;
  color1: string | null;
  tier2Source: Record<string, string> | null;
  warrantyMonths: number | null;
  repairability: string | null;
  epdLifetimeHours: number | null;
  countryOfOrigin: string | null;
};

export type ProductPrice = {
  grossPrice: string | null;
  currency: string | null;
  // Regel 3, herschreven (19 aug 2026). Optioneel omdat de fixtures van de bestaande tests
  // hem niet kennen; ontbreekt hij, dan leest leesPrijstoestand hem als vervallen — maar
  // dan is er ook een bedrag, en de tak hieronder kijkt eerst naar het bedrag.
  priceState?: string | null;
  lastPriceListName?: string | null;
  lastPriceListValidUntil?: string | null;
} | null;

type RequestAction = (formData: FormData) => void | Promise<void>;

// Lege string/whitespace telt als "geen waarde".
function txt(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Objectieve/technische velden. De sleutel is de camelCase-kolomnaam — 1-op-1 met de keys
// in tier2_source (H-09) en met de verrijkings-parser (lib/enrichment/parser.ts). Prijs zit
// hier bewust NIET tussen: geld loopt volledig via de disclosure-prijsblok.
const FIELD_DEFS: { key: string; label: string; render: (s: ProductSpec) => string | null }[] =
  [
    { key: "kelvin", label: "Color temperature", render: (s) => (s.kelvin != null ? `${s.kelvin} K` : null) },
    { key: "cri", label: "Color rendering (CRI)", render: (s) => (s.cri != null ? `Ra ${s.cri}` : null) },
    { key: "lumenOutput", label: "Lumen output", render: (s) => (s.lumenOutput != null ? `${s.lumenOutput} lm` : null) },
    { key: "maxWattage", label: "Power", render: (s) => (txt(s.maxWattage) != null ? `${txt(s.maxWattage)} W` : null) },
    { key: "beamAngle", label: "Beam angle", render: (s) => (txt(s.beamAngle) != null ? `${txt(s.beamAngle)}°` : null) },
    { key: "ipValue", label: "IP value", render: (s) => txt(s.ipValue) },
    { key: "dimmable", label: "Dimmable", render: (s) => txt(s.dimmable) },
    { key: "color1", label: "Color", render: (s) => txt(s.color1) },
    { key: "warrantyMonths", label: "Warranty", render: (s) => (s.warrantyMonths != null ? `${s.warrantyMonths} mo` : null) },
    { key: "repairability", label: "Repairability", render: (s) => txt(s.repairability) },
    { key: "epdLifetimeHours", label: "Lifetime (EPD)", render: (s) => (s.epdLifetimeHours != null ? `${s.epdLifetimeHours} h` : null) },
    { key: "countryOfOrigin", label: "Country of origin", render: (s) => txt(s.countryOfOrigin) },
    { key: "categoryPath", label: "Category", render: (s) => txt(s.categoryPath) },
  ];

export type SpecRow = { key: string; label: string; value: string; source: string | null };

// De zichtbare specrijen: alleen als de tier specs toestaat, per veld afgevlagd (J-04), en
// alleen velden die daadwerkelijk data hebben (geen lege rijen — instructie J-01).
export function visibleSpecRows(
  spec: ProductSpec,
  disclosure: Disclosure,
  overrides: Record<string, boolean>,
): SpecRow[] {
  if (!disclosure.showSpecs || disclosure.awaitingData) return [];
  const rows: SpecRow[] = [];
  for (const def of FIELD_DEFS) {
    if (!fieldVisible(true, overrides, def.key)) continue; // per-veld-override kan verbergen
    const value = def.render(spec);
    if (value == null || value === "") continue; // geen data → geen rij
    rows.push({ key: def.key, label: def.label, value, source: spec.tier2Source?.[def.key] ?? null });
  }
  return rows;
}

// Objectieve velden als label→waarde (voor de vergelijk-tray). Prijsvrij per constructie
// (FIELD_DEFS bevat geen prijs) én respecteert dezelfde zichtbaarheidsregels als de kaart.
export function objectiveFields(
  spec: ProductSpec,
  disclosure: Disclosure,
  overrides: Record<string, boolean>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of visibleSpecRows(spec, disclosure, overrides)) out[r.label] = r.value;
  return out;
}

function herkomstLabel(source: string): string {
  if (source === "parsed-from-name") return "derived from name";
  return source;
}

// H-09: waar een veld door verrijking is gevuld, tonen we de herkomst — niet als harde claim,
// maar als muted stempel, zodat een afgeleide waarde herkenbaar blijft.
function HerkomstTag({ source }: { source: string }) {
  return (
    <span
      title={`Source: ${source}`}
      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground"
    >
      {herkomstLabel(source)}
    </span>
  );
}

function PriceBlock({
  spec,
  disclosure,
  price,
  requestAction,
}: {
  spec: ProductSpec;
  disclosure: Disclosure;
  price: ProductPrice;
  requestAction: RequestAction;
}) {
  if (disclosure.awaitingData) return null;
  if (disclosure.showPrice) {
    return (
      // UX-audit 30 jul (item 3): dit was `text-2xl font-semibold` — de prijs was
      // letterlijk de grootste tekst op de productpagina, groter dan de productnaam
      // (text-xl). Ijzeren regel 2 zegt dat geld de rangschikking nooit beïnvloedt; dan
      // hoort het ook niet het luidste element van het scherm te zijn. Nu bodygewicht:
      // even zichtbaar en even exact, alleen niet meer als eerste in het oog.
      // Niet terugzetten naar een koptekstformaat zonder dat besluit terug te draaien.
      <div className="flex items-baseline gap-2">
        {price != null && price.grossPrice == null && price.priceState != null ? (
          // Geen bedrag, maar wél een reden: de prijslijst is verlopen of het product is
          // uit de lijst gevallen. Zonder deze tak stond hier "— list price", en dat is
          // de stille variant waar de klant over viel.
          <VervallenMarkering
            toestand={leesPrijstoestand(price.priceState)}
            stempel={{
              name: price.lastPriceListName ?? null,
              validUntil: price.lastPriceListValidUntil ?? null,
            }}
            brandName={spec.brandName}
            variant="inline"
          />
        ) : (
          <>
            <span data-price className="text-base font-medium tabular-nums">
              {formatEur(price?.grossPrice)}
            </span>
            <span className="text-sm text-muted-foreground">list price</span>
          </>
        )}
      </div>
    );
  }
  if (disclosure.priceGated) {
    // J-03: de pricerequest is een lead. De knop post naar de server-action (createLead).
    return (
      <form action={requestAction} className="flex flex-col items-start gap-1.5">
        <input type="hidden" name="productId" value={spec.id ?? ""} />
        <input type="hidden" name="brandId" value={spec.brandId ?? ""} />
        <Button type="submit" variant="outline">
          Request price via Brink
        </Button>
        <p className="text-xs text-muted-foreground">
          The list price for this brand is on request.
        </p>
      </form>
    );
  }
  return null;
}

export function ProductCard({
  spec,
  disclosure,
  price,
  overrides,
  requestAction,
}: {
  spec: ProductSpec;
  disclosure: Disclosure;
  price: ProductPrice;
  overrides: Record<string, boolean>;
  requestAction: RequestAction;
}) {
  const rows = visibleSpecRows(spec, disclosure, overrides);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl leading-tight">{spec.name ?? "Unnamed product"}</CardTitle>
        {txt(spec.brandName) && (
          <p className="text-sm text-muted-foreground">{spec.brandName}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PriceBlock spec={spec} disclosure={disclosure} price={price} requestAction={requestAction} />

        {disclosure.awaitingData ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Data awaiting brand.
          </p>
        ) : rows.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-10 gap-y-0 sm:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2"
              >
                <dt className="text-sm text-muted-foreground">{r.label}</dt>
                <dd className="flex items-center gap-2 text-right text-sm font-medium tabular-nums">
                  <span>{r.value}</span>
                  {r.source && <HerkomstTag source={r.source} />}
                </dd>
              </div>
            ))}
          </dl>
        ) : disclosure.showSpecs ? (
          // Zit al in een <Card>: inline. Specs komen van het merk, niet van deze
          // pagina — bewuste `action={null}`.
          <EmptyState
            variant="inline"
            title="No specifications available."
            action={null}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
