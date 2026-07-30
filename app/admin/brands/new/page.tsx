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
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      {/* De PAGINACONTAINER is 1280px zoals overal (DESIGN.md §5) — daar hangt de
          linkerrand aan, en die moet gelijk staan met /admin/brands waar je vandaan
          komt. Dat een formulier op 1280px onleesbaar lange regels krijgt (§4: 70–80
          tekens) lossen we op met een BEWUSTE kolombreedte hieronder, niet door de
          container te versmallen: dat laatste verschuift de rand en is precies de
          fout die deze sweep opruimt. max-w-3xl = 768px, de breedte die deze pagina
          hiervóór als geheel had, dus het formulier zelf oogt onveranderd. */}
      <div className="max-w-3xl">
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
      </div>
    </main>
  );
}
