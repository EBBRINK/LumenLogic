import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { PricelistUpload } from "@/components/merk/pricelist-upload";
import type { UploadRow } from "@/components/merk/pricelist-upload";
import { listBrandUploads } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";
import { submitUploadAction } from "../actions";

// Prijslijst-upload (H-11): verplichte valid_until → staging. Buiten de dossier-layout.
async function resolveBrand(brandId?: string) {
  if (brandId) {
    const [b] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (b) return b;
  }
  const [first] = await db.select().from(brands).orderBy(asc(brands.name)).limit(1);
  return first ?? null;
}

export default async function MerkPrijslijstenPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandParam } = await searchParams;
  const brand = await resolveBrand(brandParam);
  const uploads = brand ? await listBrandUploads(db, brand.id) : [];

  const rows: UploadRow[] = uploads.map((u) => {
    const validUntil = u.payload?.["valid_until"];
    return {
      id: u.id,
      kind: u.kind,
      status: u.status,
      validUntil: typeof validUntil === "string" ? validUntil : null,
      submittedBy: u.submittedBy,
      createdAt: u.createdAt.toISOString(),
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/merk"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Merkportaal
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Prijslijsten</h1>
      </header>
      {brand ? (
        <PricelistUpload
          brandId={brand.id}
          brandName={brand.name}
          uploads={rows}
          submitAction={submitUploadAction}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen merk gekoppeld aan dit portaal.
        </p>
      )}
    </main>
  );
}
