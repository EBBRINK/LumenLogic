import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { BrandDataView } from "@/components/merk/brand-data-view";
import { getBrandData } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";

// Data-inzien (§3.16): het merk ziet zijn eigen producten + specs, zonder prijs of ranking.
async function resolveBrandId(brandId?: string) {
  if (brandId) {
    const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
    if (b) return b.id;
  }
  const [first] = await db.select({ id: brands.id }).from(brands).orderBy(asc(brands.name)).limit(1);
  return first?.id ?? null;
}

export default async function MerkDataPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandParam } = await searchParams;
  const brandId = await resolveBrandId(brandParam);
  const data = brandId ? await getBrandData(db, brandId) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/brand"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brand portal
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">View data</h1>
      </header>
      {data ? (
        <BrandDataView
          brandName={data.brand.name}
          products={data.products.map((p) => ({
            id: p.id,
            name: p.name,
            articleCode: p.articleCode,
            kelvin: p.kelvin,
            cri: p.cri,
            ipValue: p.ipValue,
            lumenOutput: p.lumenOutput,
            status: p.status,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No brand linked to this portal yet.
        </p>
      )}
    </main>
  );
}
