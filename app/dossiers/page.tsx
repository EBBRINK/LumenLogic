import { db } from "@/db/client";
import { DossierList } from "@/components/dossier/dossier-list";
import { NewDossierForm } from "@/components/dossier/new-dossier-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDossiers } from "@/lib/repo/dossiers";
import { requireSession } from "@/lib/session";
import { createDossierAction } from "./actions";

export default async function DossiersPage() {
  await requireSession();
  const dossiers = await listDossiers(db);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dossiers</h1>
        <p className="text-sm text-muted-foreground">
          Kies een projectdossier of maak een nieuw aan. Fase-default = tender
          (veilig).
        </p>
      </header>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <section>
          <DossierList
            dossiers={dossiers.map((d) => ({
              id: d.id,
              name: d.name,
              customer: d.customer,
              phase: d.phase,
            }))}
          />
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
