import { EmptyState } from "@/components/ui/empty-state";
import { formatEur } from "@/lib/format";
import { CatalogSearchForm, type CountAction } from "./catalog-search-form";
import { VervallenMarkering } from "@/components/vervallen-markering";
import { isVervallen } from "@/lib/prijstoestand";
import { omschrijfHerkenning, type HerkendToken } from "@/lib/spec-tokens";
import type { Candidate } from "./dossier/types";

// Losse catalogus-zoek (functioneel ontwerp §3.12). Geen dossiercontext: het merk is het
// anker ("het merk hebben we altijd"), daarna vrije tekst + optionele specfilters. Zelfde
// matcher-gevoel als de dossier-match, maar zonder "Kies"-actie — dit is puur opzoeken.
//
// Ijzeren regels die hier zichtbaar zijn:
//   • Prijs wordt getóónd, nooit gesorteerd (regel 2). De volgorde komt uit searchProducts
//     (tekstsimilariteit); deze component hersorteert nooit.
//   • Ontbrekende data ≠ afkeuring. Een product zonder gevraagde spec belandt in
//     "Mogelijk — data onvolledig" (grijze vlag), het wordt nooit stil weggelaten.
//   • Regel 3 (herschreven 19 aug 2026): een vervallen product staat gewoon in de lijst,
//     rood gemarkeerd en zónder bedrag. Vóór die datum kwam het hier nooit aan — en juist
//     dát was het probleem: de bestekschrijver die een artikelnummer van vorig jaar
//     overtypte kreeg nul treffers in plaats van "dit product is vervallen".

// Eén zoekresultaat = een catalogus-kandidaat, optioneel verrijkt met welke ingevulde
// specfilters we NIET konden verifiëren (ontbrekende productdata).
export type CatalogResult = Candidate & { missing?: string[] };

// De ingevulde zoekvelden, plat zoals ze uit de query-string komen (form method=get).
export type CatalogValues = {
  brand: string;
  q: string;
  kelvin: string;
  cri: string;
  ip: string;
};

const EMPTY_VALUES: CatalogValues = { brand: "", q: "", kelvin: "", cri: "", ip: "" };

function ResultCard({ item }: { item: CatalogResult }) {
  const code = item.articleCode ?? item.supplierArticleCode ?? "—";
  const specs = [
    code,
    item.kelvin ? `${item.kelvin}K` : null,
    item.cri ? `CRI ${item.cri}` : null,
    item.ipValue ?? null,
    item.lumenOutput ? `${item.lumenOutput} lm` : null,
  ].filter(Boolean);
  return (
    <li>
      <a
        href={`/products/${item.id}`}
        className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{item.brandName ?? "—"}</p>
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{specs.join(" · ")}</p>
          {item.missing && item.missing.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              no data for: {item.missing.join(", ")}
            </p>
          )}
        </div>
        {/* Prijs OF markering, nooit allebei — de view levert bij een vervallen product
            geen bedrag, dus hier valt niets weg te laten dat er anders wél zou staan. */}
        {isVervallen(item.priceState) ? (
          <VervallenMarkering
            toestand={item.priceState}
            stempel={{
              name: item.lastPriceListName,
              validUntil: item.lastPriceListValidUntil,
            }}
            brandName={item.brandName}
            variant="badge"
          />
        ) : (
          <span className="shrink-0 font-medium tabular-nums">
            {formatEur(item.grossPrice)}
          </span>
        )}
      </a>
    </li>
  );
}

function ResultList({
  title,
  note,
  items,
}: {
  title: string;
  note?: string;
  items: CatalogResult[];
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>
      {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((c) => (
            <ResultCard key={c.id} item={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function CatalogSearch({
  brands,
  values = EMPTY_VALUES,
  aantoonbaar = [],
  onvolledig = [],
  searched = false,
  filtersActive = false,
  total,
  verbreed = false,
  herkend = [],
  countAction,
}: {
  brands: string[];
  values?: CatalogValues;
  aantoonbaar?: CatalogResult[];
  onvolledig?: CatalogResult[];
  searched?: boolean;
  filtersActive?: boolean;
  /** Aantal ZICHTBARE treffers in totaal — inclusief wat het plafond buiten beeld laat. */
  total?: number;
  /**
   * Viel de zoekopdracht terug op de BREDE variant? Dan bevat geen enkel product álle
   * getypte woorden en zie je de ruimere uitslag. Dat moet het scherm zeggen: een lijst
   * zonder je eigen zoekwoord erin leest anders als een exact antwoord.
   */
  verbreed?: boolean;
  /**
   * Specwaarden die uit de vrije zoektekst gelezen zijn ("2700" → kleurtemperatuur). Het
   * scherm toont ze omdat het raden is: een verkeerd geraden token moet zichtbaar en
   * corrigeerbaar zijn (vul het specveld zelf in — dat wint altijd).
   */
  herkend?: HerkendToken[];
  /** Server action voor de live teller tijdens het typen; zonder blijft de teller uit. */
  countAction?: CountAction;
}) {
  const shown = aantoonbaar.length + onvolledig.length;
  const gevonden = total ?? shown;
  const verborgen = Math.max(0, gevonden - shown);
  return (
    <div className="flex flex-col gap-6">
      {/* Het formulier is een clientcomponent geworden voor de live teller (demosessie
          12 aug): tijdens het typen telt het aantal treffers mee, gedebounced, via de
          meegegeven server action. De echte zoekactie blijft het GET-formulier. */}
      <CatalogSearchForm brands={brands} values={values} countAction={countAction} />

      {!searched ? (
        // Geen actie: de zoekknop staat direct hierboven in hetzelfde formulier — een
        // tweede knop zou naar zichzelf wijzen.
        <EmptyState
          title="Choose a brand or type free text and search the catalog."
          action={null}
        />
      ) : shown === 0 ? (
        <EmptyState
          title="No products found"
          description="No visible product matches this search. That's an honest status, not an error."
          action={null}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Het resultaatplafond, hardop. Er worden maximaal negen treffers getoond, en
              de gebruiker moet zién hoe groot de stapel is die hij niet ziet — dat getal
              is precies de prikkel om meer in te vullen. Er is bewust geen doorbladeren:
              wie de rest wil zien, levert informatie aan. Nooit stil afkappen; als deze
              regel verdwijnt, liegt het scherm over wat het weglaat. */}
          {/* De terugval, hardop. Dit is de tegenhanger van de strenge AND-tak: geen enkel
              product bevat álle getypte woorden, dus toont het scherm de ruimere uitslag.
              Stil doen zou de ergste variant zijn — je typt een woord erbij, de stapel wordt
              groter, en er staat nergens waarom. OCR-aanvragen zitten vol verschrijvingen,
              dus dit gebeurt vaker dan je zou denken; zie lib/repo/products.ts. */}
          {herkend.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="spec-tokens">
              {herkend.map(omschrijfHerkenning).join(" · ")}. Fill in the field yourself to
              override.
            </p>
          )}
          {verbreed && (
            <p className="text-sm" data-testid="broadened">
              <span className="font-medium">No product has all your search words.</span>{" "}
              <span className="text-muted-foreground">
                Showing the broader match instead: products with at least one of them.
              </span>
            </p>
          )}
          <p className="text-sm" data-testid="result-cap">
            <span className="font-medium tabular-nums">
              {verborgen > 0
                ? `Showing ${shown} of ${gevonden} matches`
                : `Showing all ${gevonden} matches`}
            </span>
            {verborgen > 0 && (
              <span className="text-muted-foreground">
                {" "}
                — the other {verborgen} are left out and cannot be paged through. Fill in
                more fields to narrow the search.
              </span>
            )}
          </p>
          <div className="flex flex-col gap-8">
            <ResultList title="Provably compliant" items={aantoonbaar} />
            <ResultList
              title="Possible — data incomplete"
              // UX-audit 30 jul (item 12): hier stond "They are never silently omitted."
              // achteraan. Die belofte staat nu nog op één plek, bij het afrondingsblok in
              // components/dossier/match-candidates.tsx — daar valt de status te kiezen,
              // hier valt niets te kiezen. Wat blijft is wat de lijst betekent.
              note="No data is not a rejection: these products are (still) missing data to prove the match."
              items={onvolledig}
            />
          </div>
        </div>
      )}

      {searched && filtersActive && shown > 0 && (
        <p className="text-xs text-muted-foreground">
          Products that demonstrably fail a filled-in spec filter are not in these
          lists.
        </p>
      )}
    </div>
  );
}
