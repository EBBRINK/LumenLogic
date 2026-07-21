import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandForm } from "@/components/admin/brand-form";
import { requireSession } from "@/lib/session";
import { createBrandAction } from "../actions";

// Merk aanmaken (sprint 1.5). Een eigen route, geen inline `<details>` op de lijst: na de
// dubbelcheck-POST rendert de pagina opnieuw en zou een `<details>` dicht staan — dan is
// juist de waarschuwing die de mens moet zien onzichtbaar (plan §1).
export default async function NieuwMerkPage() {
  await requireSession();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/admin/brands"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brands
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New brand</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A brand with no products yet is not a mistake — that is the outreach
          work list.
        </p>
      </header>
      <section className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <BrandForm mode="create" action={createBrandAction} />
      </section>
    </main>
  );
}
