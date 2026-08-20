// Merkrelaties — de relatie-/inwinningslaag over de ~430 bron-merken (plan-merkrelaties
// K3): wie is benaderd, is er een geldige prijslijst, en hoe compleet is de data.
// Toestemmings-as (disclosure) leeft sinds sprint 2.0a (blok 3) op de merkdetailpagina
// (Visibility-sectie), niet meer op /admin/brands.
//
// Herbouw 30 jul (UX-audit bak 2 item 10): zoeken, filteren en pagineren gebeuren HIER,
// vóór de rendergrens, met de stand in de URL. De tabel is nog steeds een client
// component, maar krijgt 25 rijen mee in plaats van 438 — en de dure
// compleetheidsaggregatie draait alleen nog over die 25 merken.
import { db } from "@/db/client";
import { BrandRelationsTable } from "@/components/data/brand-relations-table";
import {
  BrandRelationsPager,
  BrandRelationsToolbar,
} from "@/components/data/brand-relations-controls";
import { BrandManagementHeader } from "@/components/data/brand-management-header";
import {
  filterBrandRelationRows,
  overallCoverage,
  pageSlice,
  pageWindow,
  parseBrandRelationsQuery,
  type BrandRelationBaseRow,
  type BrandRelationTableRow,
} from "@/lib/brand-relations-view";
import {
  getAllBrandCompleteness,
  listBrandRelations,
} from "@/lib/repo/brand-relations";
import {
  bulkSetBrandRelationStatusAction,
  updateBrandRelationAction,
} from "./actions";
import { bewaakRoute } from "@/lib/route-toegang";

export default async function MerkrelatiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await bewaakRoute("/brand-management");
  const query = parseBrandRelationsQuery(await searchParams);
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const relations = await listBrandRelations(db, today);
  const alle: BrandRelationBaseRow[] = relations.map((r) => ({
    brandId: r.brandId,
    brandName: r.brandName,
    brandCode: r.brandCode,
    status: r.status,
    lastContactAt: r.lastContactAt,
    productCount: r.productCount,
    priceListIndicator: r.priceListIndicator,
    sharedBrandCode: r.sharedBrandCode,
  }));

  const gefilterd = filterBrandRelationRows(alle, query, todayIso);
  const window = pageWindow(gefilterd.length, query.page);
  const pagina = pageSlice(gefilterd, window);

  // Pas hier de dure query, en alleen voor de zichtbare merken: zonder die grens leest
  // getAllBrandCompleteness élke productrij (~210k) met 66+ filter-aggregaten erover.
  const completeness = await getAllBrandCompleteness(
    db,
    undefined,
    pagina.map((r) => r.brandId),
  );

  const rows: BrandRelationTableRow[] = pagina.map((r) => {
    const c = completeness.get(r.brandId);
    // Geen producten → null → "n/a" (geen 0% dat als slecht cijfer leest).
    return { ...r, completeness: c ? overallCoverage(c.aggregate) : null };
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      {/* Geen "← Data" meer: sinds de IA-opschoning (12 aug) is dit zélf een hoofdingang
          en bestaat de Data-werkbank niet meer. De kop staat in een eigen component zodat
          hij zonder database getest en gefotografeerd kan worden. */}
      <BrandManagementHeader />
      <div className="space-y-4">
        <BrandRelationsToolbar
          query={query}
          window={window}
          totalCount={alle.length}
        />
        <BrandRelationsTable
          rows={rows}
          updateAction={updateBrandRelationAction}
          bulkAction={bulkSetBrandRelationStatusAction}
        />
        <BrandRelationsPager query={query} window={window} />
      </div>
    </main>
  );
}
