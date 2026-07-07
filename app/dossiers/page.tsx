import Link from "next/link";
import { db } from "@/db/client";
import { DossierList } from "@/components/dossier/dossier-list";
import { NewDossierForm } from "@/components/dossier/new-dossier-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusCounts } from "@/components/dossier/types";
import { listDossiers } from "@/lib/repo/dossiers";
import { getStatusCounts } from "@/lib/repo/matching";
import { requireSession } from "@/lib/session";
import { createDossierAction } from "./actions";

export default async function DossiersPage() {
  await requireSession();
  const dossiers = await listDossiers(db);
  // Kleuren-telling per dossier ophalen zodat de lijst het status-dashboard toont (E-03).
  const withCounts = await Promise.all(
    dossiers.map(async (d) => ({
      id: d.id,
      name: d.name,
      customer: d.customer,
      phase: d.phase,
      counts: (await getStatusCounts(db, d.id)) as StatusCounts,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dossiers</h1>
          <p className="text-sm text-muted-foreground">
            Kies een projectdossier of maak een nieuw aan. Fase-default = tender
            (veilig).
          </p>
        </div>
        <Link
          href="/analytics"
          className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Analytics →
        </Link>
      </header>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <section>
          <DossierList dossiers={withCounts} />
        </section>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Nieuw dossier</CardTitle>
            </CardHeader>
            <CardContent>
              <NewDossierForm action={createDossierAction} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
