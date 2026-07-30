// Merkrelaties — de relatie-/inwinningslaag over de ~430 bron-merken (plan-merkrelaties
// K3): wie is benaderd, is er een geldige prijslijst, en hoe compleet is de data.
// Toestemmings-as (disclosure) leeft sinds sprint 2.0a (blok 3) op de merkdetailpagina
// (Visibility-sectie), niet meer op /admin/brands.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  BrandRelationsTable,
  type BrandRelationTableRow,
} from "@/components/data/brand-relations-table";
import { TemplateDownloadLink } from "@/components/data/template-download-link";
import { bucketBlok } from "@/components/data/scorecard-blokken";
import { INTERNAL_BUCKET_KEY } from "@/lib/field-catalog";
import {
  getAllBrandCompleteness,
  listBrandRelations,
} from "@/lib/repo/brand-relations";
import { requireSession } from "@/lib/session";
import { updateBrandRelationAction } from "./actions";

export default async function MerkrelatiesPage() {
  await requireSession();
  const today = new Date();
  const [relations, completeness] = await Promise.all([
    listBrandRelations(db, today),
    getAllBrandCompleteness(db),
  ]);

  const rows: BrandRelationTableRow[] = relations.map((r) => {
    const c = completeness.get(r.brandId);
    return {
      brandId: r.brandId,
      brandName: r.brandName,
      brandCode: r.brandCode,
      status: r.status,
      lastContactAt: r.lastContactAt,
      productCount: r.productCount,
      priceListIndicator: r.priceListIndicator,
      sharedBrandCode: r.sharedBrandCode,
      // Geen producten → null → "n.v.t." (geen 0% rood).
      // Sprint 1.6 (G10): c.buckets draagt sinds de verhuizing ook categorie
      // "11. Internal" — die mag hier niet als elfde blokje meetellen. Filter op de
      // sleutel, geen `order <= 10`-drempel (die zou stil verkeerd worden als de
      // catalogusvolgorde ooit verandert).
      scorecard: c
        ? c.buckets
            .filter(({ bucket }) => bucket.key !== INTERNAL_BUCKET_KEY)
            .map(({ bucket, score }) => bucketBlok(bucket, score, c.hasProducts))
        : null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand relations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per brand: relationship status, price-list coverage, visibility and
            data completeness. Open a brand for its Visibility (disclosure)
            settings.
          </p>
        </div>
        <TemplateDownloadLink />
      </header>
      <BrandRelationsTable
        rows={rows}
        todayIso={today.toISOString().slice(0, 10)}
        updateAction={updateBrandRelationAction}
      />
    </main>
  );
}
