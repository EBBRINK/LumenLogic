import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { BrandOverview } from "@/components/merk/brand-overview";
import { isUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";

// Merkportaal-landing (§3.16). Buiten de dossier-layout → rendert zijn eigen <main>.
// Welk merk het portaal toont, komt (voorlopig) uit ?brand=<id>; anders het eerste merk.
// De echte merk-scoping via membership komt met de integratie-laag.
async function resolveBrand(brandId?: string) {
  // Zelfde uuid-cast-val als bug #1, hier via een QUERY-param: ?brand=nope gaf een
  // 500. Géén notFound() maar dezelfde terugval als een onbekend merk-id — die
  // terugval bestond al ("anders het eerste merk"), en een kapotte queryparam hoort
  // niet strenger te zijn dan een geldige die niets vindt.
  if (brandId && isUuid(brandId)) {
    const [b] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (b) return b;
  }
  const [first] = await db.select().from(brands).orderBy(asc(brands.name)).limit(1);
  return first ?? null;
}

export default async function MerkPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandId } = await searchParams;
  const brand = await resolveBrand(brandId);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brand portal</h1>
        <p className="text-sm text-muted-foreground">
          Submit data and price lists and see aggregated how your products perform.
        </p>
      </header>
      {brand ? (
        <BrandOverview brandName={brand.name} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No brand linked to this portal yet.
        </p>
      )}
    </main>
  );
}
