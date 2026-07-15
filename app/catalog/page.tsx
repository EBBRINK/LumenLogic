import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { visibleProducts } from "@/db/schema";
import {
  CatalogSearch,
  type CatalogResult,
  type CatalogValues,
} from "@/components/catalog-search";
import { searchProducts, type ProductCandidate } from "@/lib/repo/products";
import { getActor, requireSession } from "@/lib/session";

// Los zoeken in de catalogus, zonder dossier (functioneel ontwerp §3.12). GEEN dossier-layout
// → eigen <main>. De aanpak is bewust de eenvoudigste die werkt: een GET-form schrijft de
// zoekvelden in de query-string, deze server-component leest ze en roept searchProducts
// direct. Geen aparte server-action nodig. searchProducts logt zelf al search.performed.

// searchParams-waarden kunnen string | string[] | undefined zijn; platslaan naar één string.
function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

function toInt(v: string): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// IP-code ("IP44") → beschermingsgetal (44). Hoger = meer bescherming, dus bruikbaar als
// ondergrens-vergelijking. Geen match → null (onbekend, niet 0).
function ipNumber(v: string | null): number | null {
  const m = String(v ?? "").match(/(\d{2})/);
  return m ? Number.parseInt(m[1], 10) : null;
}

type Criteria = { kelvin: number | null; cri: number | null; ip: number | null };

// Splits de kandidaten in twee lijsten op basis van de ingevulde specfilters:
//   • aantoonbaar — elk ingevuld criterium heeft data op het product én voldoet.
//   • onvolledig  — mist data voor ≥1 ingevuld criterium (grijze vlag; nooit weggelaten).
// Een product met VOLLEDIGE data dat een expliciet ingevuld filter niet haalt, is een
// legitieme filter-misser en valt buiten beide lijsten (dat is niet het stil weglaten van
// ontbrekende data, maar een bewuste zoekverfijning). Zonder specfilters is elke treffer
// een aantoonbare merk/tekst-match.
function classify(
  candidates: ProductCandidate[],
  crit: Criteria,
): { aantoonbaar: CatalogResult[]; onvolledig: CatalogResult[] } {
  const hasCriteria = crit.kelvin != null || crit.cri != null || crit.ip != null;
  const aantoonbaar: CatalogResult[] = [];
  const onvolledig: CatalogResult[] = [];

  for (const c of candidates) {
    if (!hasCriteria) {
      aantoonbaar.push(c);
      continue;
    }
    const missing: string[] = [];
    let fails = false;

    if (crit.kelvin != null) {
      if (c.kelvin == null) missing.push("color temp.");
      else if (c.kelvin !== crit.kelvin) fails = true;
    }
    if (crit.cri != null) {
      if (c.cri == null) missing.push("CRI");
      else if (c.cri < crit.cri) fails = true;
    }
    if (crit.ip != null) {
      const p = ipNumber(c.ipValue);
      if (p == null) missing.push("IP");
      else if (p < crit.ip) fails = true;
    }

    if (fails) continue; // aantoonbaar niet-voldoend aan een ingevuld filter
    if (missing.length > 0) onvolledig.push({ ...c, missing });
    else aantoonbaar.push(c);
  }

  return { aantoonbaar, onvolledig };
}

export default async function CatalogusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const sp = await searchParams;

  const values: CatalogValues = {
    brand: str(sp.brand),
    q: str(sp.q),
    kelvin: str(sp.kelvin),
    cri: str(sp.cri),
    ip: str(sp.ip),
  };

  // Merk-anker: alleen merken die daadwerkelijk zichtbare producten hebben (de view is de
  // enige poort — regel 3). Alfabetisch, puur als keuzelijst (geen ranking).
  const brandRows = await db
    .selectDistinct({ brandName: visibleProducts.brandName })
    .from(visibleProducts)
    .orderBy(asc(visibleProducts.brandName));
  const brands = brandRows
    .map((r) => r.brandName)
    .filter((b): b is string => Boolean(b));

  const crit: Criteria = {
    kelvin: toInt(values.kelvin),
    cri: toInt(values.cri),
    ip: ipNumber(values.ip),
  };
  const filtersActive = crit.kelvin != null || crit.cri != null || crit.ip != null;

  // Alleen zoeken met een anker: merk of vrije tekst. Losse specfilters zonder anker geven
  // geen resultaten (searchProducts vereist query of merk) — het merk is het startpunt.
  const searched = values.brand.length > 0 || values.q.length > 0;

  let aantoonbaar: CatalogResult[] = [];
  let onvolledig: CatalogResult[] = [];
  if (searched) {
    const candidates = await searchProducts(db, {
      query: values.q,
      brand: values.brand,
      limit: 40,
      actor: await getActor(),
    });
    ({ aantoonbaar, onvolledig } = classify(candidates, crit));
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Catalog</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Search the visible catalog freely. Price is shown, never sorted.
      </p>
      <CatalogSearch
        brands={brands}
        values={values}
        aantoonbaar={aantoonbaar}
        onvolledig={onvolledig}
        searched={searched}
        filtersActive={filtersActive}
      />
    </main>
  );
}
