import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { BrandDataView } from "@/components/merk/brand-data-view";
import { getBrandData, resolveBrandFromParam } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";

// Data-inzien (§3.16): het merk ziet zijn eigen producten + specs, zonder prijs of ranking.
// Welk merk, beslist resolveBrandFromParam — inclusief de uuid-guard op ?brand=. Deze
// pagina had zijn eigen kopie van die resolver zónder guard, dus /brand/data?brand=nope
// gaf een 500 terwijl /brand?brand=nope al gerepareerd was (UX-audit 30 jul, bug #1).

export default async function MerkDataPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandParam } = await searchParams;
  const brand = await resolveBrandFromParam(db, brandParam);
  const data = brand ? await getBrandData(db, brand.id) : null;

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
