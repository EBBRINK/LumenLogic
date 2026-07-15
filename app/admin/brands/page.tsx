import { db } from "@/db/client";
import {
  BrandsTierBlock,
  type BrandTierRow,
} from "@/components/admin/brands-tier-block";
import { listBrandFieldOverrides, listBrandsWithTier } from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";
import { setFieldVisibilityAction, setTierAction } from "../actions";

// MERKEN & TIERS (§3.16, J-02/J-04). Leeft buiten de dossier-layout → eigen <main>.
export default async function AdminMerkenPage() {
  await requireSession();

  const brands = await listBrandsWithTier(db);
  // Per-veld-overrides per merk erbij: de disclosure-repo is de bron.
  const rows: BrandTierRow[] = await Promise.all(
    brands.map(async (b) => ({
      id: b.id,
      name: b.name,
      disclosureTier: b.disclosureTier,
      productCount: b.productCount,
      overrides: await listBrandFieldOverrides(db, b.id),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Brands &amp; visibility
        </h1>
        <p className="text-sm text-muted-foreground">
          Disclosure tier and per-field exceptions per brand.
        </p>
      </header>
      <BrandsTierBlock
        brands={rows}
        setTierAction={setTierAction}
        setFieldVisibilityAction={setFieldVisibilityAction}
      />
    </main>
  );
}
