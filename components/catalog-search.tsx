import { IconSearch } from "./dossier/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";
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

// Native select, gestyled in dezelfde taal als <Input> (geen shadcn-select in de repo).
const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

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
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              no data for: {item.missing.join(", ")}
            </p>
          )}
        </div>
        <span className="shrink-0 font-medium tabular-nums">
          {formatEur(item.grossPrice)}
        </span>
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
}: {
  brands: string[];
  values?: CatalogValues;
  aantoonbaar?: CatalogResult[];
  onvolledig?: CatalogResult[];
  searched?: boolean;
  filtersActive?: boolean;
}) {
  const total = aantoonbaar.length + onvolledig.length;
  return (
    <div className="flex flex-col gap-6">
      <form method="get" action="/catalog" className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand" hint="We always have the brand — start there.">
            <select
              name="brand"
              defaultValue={values.brand}
              aria-label="Brand"
              data-testid="brand-select"
              className={selectClass}
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Free text">
            <Input
              name="q"
              defaultValue={values.q}
              placeholder="e.g. SASSO 100 or article no. L360048"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Color temp. (K)">
            <Input
              type="number"
              name="kelvin"
              defaultValue={values.kelvin}
              placeholder="e.g. 3000"
              inputMode="numeric"
            />
          </Field>
          <Field label="CRI (min.)">
            <Input
              type="number"
              name="cri"
              defaultValue={values.cri}
              placeholder="e.g. 90"
              inputMode="numeric"
            />
          </Field>
          <Field label="IP (min.)">
            <Input name="ip" defaultValue={values.ip} placeholder="e.g. IP44" />
          </Field>
        </div>

        <div>
          <Button type="submit">
            <IconSearch /> Search
          </Button>
        </div>
      </form>

      {!searched ? (
        <p className="text-sm text-muted-foreground">
          Choose a brand or type free text and search the catalog.
        </p>
      ) : total === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">No products found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No visible product matches this search. That's an honest status, not an
            error.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <ResultList title="Provably compliant" items={aantoonbaar} />
          <ResultList
            title="Possible — data incomplete"
            note="No data is not a rejection: these products are (still) missing data to prove the match. They are never silently omitted."
            items={onvolledig}
          />
        </div>
      )}

      {searched && filtersActive && total > 0 && (
        <p className="text-xs text-muted-foreground">
          Products that demonstrably fail a filled-in spec filter are not in these
          lists.
        </p>
      )}
    </div>
  );
}
