import { db } from "@/db/client";
import {
  CatalogSearch,
  type CatalogResult,
  type CatalogValues,
} from "@/components/catalog-search";
import { listCatalogBrands } from "@/lib/repo/catalog";
import {
  searchProductsWithTotal,
  type ProductCandidate,
} from "@/lib/repo/products";
import { getActor } from "@/lib/session";
import { bewaakRoute } from "@/lib/route-toegang";
import { ipNumber } from "@/lib/catalog-zoekvorm";
import { countCatalogMatches } from "./actions";

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

// ipNumber ("IP44" → 44) verhuisde naar lib/catalog-zoekvorm.ts: de live-tel-action moet
// het IP-veld exact zo lezen als deze pagina, dus de definitie staat op één plek.

type Criteria = { kelvin: number | null; cri: number | null; ip: number | null };

// Het resultaatplafond (demosessie Brink Licht, 12 aug). Een zoekopdracht met weinig
// informatie leverde honderden technisch kloppende maar waardeloze treffers op. Er worden
// er nu maximaal negen getoond — mét het werkelijke totaal ernaast, want dát is de prikkel
// om meer in te vullen. Bewust GEEN doorbladeren: "mensen moeten hun informatie
// aanleveren". Verhoog dit getal dus niet om "meer te laten zien"; dat is precies het
// gedrag dat hier is afgeschaft.
const RESULTAAT_PLAFOND = 9;

// Splits de opgehaalde kandidaten in twee lijsten:
//   • aantoonbaar — elk ingevuld criterium heeft data op het product én voldoet.
//   • onvolledig  — mist data voor ≥1 ingevuld criterium (grijze vlag; nooit weggelaten).
// Producten die aantoonbaar NIET aan een ingevuld filter voldoen zijn hier al weg: die
// sluit searchProductsWithTotal in SQL uit (`filters`). Dat hoort daar en niet hier, want
// het totaal dat we tonen moet exact de rijen tellen die de query ook teruggeeft. Zet dus
// geen tweede afkeuring terug in deze functie — dan zou het scherm rijen wegfilteren die
// nog wél in de teller zitten.
function classify(
  candidates: ProductCandidate[],
  crit: Criteria,
): { aantoonbaar: CatalogResult[]; onvolledig: CatalogResult[] } {
  const aantoonbaar: CatalogResult[] = [];
  const onvolledig: CatalogResult[] = [];

  for (const c of candidates) {
    const missing: string[] = [];
    if (crit.kelvin != null && c.kelvin == null) missing.push("color temp.");
    if (crit.cri != null && c.cri == null) missing.push("CRI");
    if (crit.ip != null && ipNumber(c.ipValue) == null) missing.push("IP");

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
  await bewaakRoute("/catalog");
  const sp = await searchParams;

  const values: CatalogValues = {
    brand: str(sp.brand),
    q: str(sp.q),
    kelvin: str(sp.kelvin),
    cri: str(sp.cri),
    ip: str(sp.ip),
  };

  // Merk-anker: alleen merken die daadwerkelijk zichtbare producten hebben (regel 3).
  // Alfabetisch, puur als keuzelijst (geen ranking). Deze lijst wordt bij ELK bezoek
  // opgehaald, ook zonder zoekopdracht — het formulier staat er altijd. Daarom hoort hier
  // géén brede join over de prijs-view maar de semi-join uit lib/repo/catalog.ts (B4);
  // de verzameling is identiek, inclusief het verbergen van merken met een verlopen
  // prijslijst. Lees de toelichting daar voor je dit terugdraait.
  const brands = await listCatalogBrands(db);

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
  let total = 0;
  let verbreed = false;
  let herkend: Awaited<ReturnType<typeof searchProductsWithTotal>>["herkend"] = [];
  if (searched) {
    const {
      items,
      total: gevonden,
      verbreed: viaTerugval,
      herkend: uitTekst,
    } = await searchProductsWithTotal(db, {
      query: values.q,
      brand: values.brand,
      // Precies het plafond ophalen, niet meer: wat je niet toont, hoef je ook niet uit de
      // database te trekken. Het totaal komt uit een count over dezelfde WHERE.
      limit: RESULTAAT_PLAFOND,
      filters: crit,
      actor: await getActor(),
    });
    total = gevonden;
    verbreed = viaTerugval;
    herkend = uitTekst;
    ({ aantoonbaar, onvolledig } = classify(items, crit));
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Catalog</h1>
      {/* UX-audit 30 jul (item 12): "Price is shown, never sorted." is hier weg. Het
          bleef waar — ijzeren regel 2 staat en het scherm heeft geen sorteerknop — maar
          een scherm hoeft zijn eigen regels niet voor te lezen op een plek waar niets te
          kiezen valt. Alleen de zin is geschrapt; de regel niet. Zet hier dus géén
          sorteermogelijkheid neer omdat de disclaimer verdwenen is. */}
      <p className="mb-6 text-sm text-muted-foreground">
        Search the visible catalog freely.
      </p>
      <CatalogSearch
        brands={brands}
        values={values}
        aantoonbaar={aantoonbaar}
        onvolledig={onvolledig}
        searched={searched}
        filtersActive={filtersActive}
        total={total}
        verbreed={verbreed}
        herkend={herkend}
        countAction={countCatalogMatches}
      />
    </main>
  );
}
