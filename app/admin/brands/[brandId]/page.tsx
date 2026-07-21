import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { BrandForm } from "@/components/admin/brand-form";
import { BrandDeleteBlock } from "@/components/admin/brand-delete-block";
import { getBrandDeleteImpact, getBrandForEdit } from "@/lib/repo/brands";
import { requireSession } from "@/lib/session";
import {
  deleteBrandAction,
  setBrandLifecycleAction,
  updateBrandAction,
} from "../actions";

// Merk bewerken, levensfase zetten en (proberen te) verwijderen. De verwijderimpact kost
// acht subquery's; die telling hoort daarom hier en niet in de lijst — daar zou hij
// 437 keer draaien voor een antwoord dat vandaag voor elke rij hetzelfde is (plan §1/§3).
export default async function MerkDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  await requireSession();
  const { brandId } = await params;

  const [brand, impact] = await Promise.all([
    getBrandForEdit(db, brandId),
    getBrandDeleteImpact(db, brandId),
  ]);
  if (!brand) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/admin/brands"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brands
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {brand.name}
          {brand.brandCode && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {brand.brandCode}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relationship, outreach and completeness live on{" "}
          <Link
            href={`/data/brand-relations/${brand.id}`}
            className="underline underline-offset-4"
          >
            Brand relations
          </Link>
          .
        </p>
      </header>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <h2 className="mb-3 font-medium">Brand</h2>
        <BrandForm mode="edit" brand={brand} action={updateBrandAction} />
      </section>

      <BrandDeleteBlock
        brandId={brand.id}
        brandName={brand.name}
        lifecycle={brand.lifecycle}
        impact={impact}
        deleteAction={deleteBrandAction}
        setLifecycleAction={setBrandLifecycleAction}
      />
    </main>
  );
}
