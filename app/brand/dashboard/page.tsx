import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { BrandDashboard } from "@/components/merk/brand-dashboard";
import { getBrandAggregates } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";
import { refreshAggregatesAction } from "../actions";

// Geaggregeerd dashboard (K-05). De materialized view is de anonimiseringsgrens: het merk
// ziet enkel zijn eigen totaal (overwogen/gekozen), nooit een onderliggend project.
async function resolveBrand(brandId?: string) {
  if (brandId) {
    const [b] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (b) return b;
  }
  const [first] = await db.select().from(brands).orderBy(asc(brands.name)).limit(1);
  return first ?? null;
}

export default async function MerkDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandParam } = await searchParams;
  const brand = await resolveBrand(brandParam);
  const aggregates = await getBrandAggregates(db);
  const own = brand
    ? aggregates.find((a) => a.brandName === brand.name)
    : undefined;
  const data = { considered: own?.considered ?? 0, chosen: own?.chosen ?? 0 };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/brand"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Merkportaal
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </header>
      {brand ? (
        <BrandDashboard
          brandName={brand.name}
          data={data}
          refreshAction={refreshAggregatesAction}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen merk gekoppeld aan dit portaal.
        </p>
      )}
    </main>
  );
}
