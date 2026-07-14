import Link from "next/link";
import { db } from "@/db/client";
import { DossierList } from "@/components/dossier/dossier-list";
import { NewDossierForm } from "@/components/dossier/new-dossier-form";
import {
  LifecycleFilter,
  type DossierFilter,
} from "@/components/dossier/lifecycle-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusCounts } from "@/components/dossier/types";
import { listDossiersFiltered } from "@/lib/repo/lifecycle";
import { listOrganizations } from "@/lib/repo/orgs";
import { getStatusCounts } from "@/lib/repo/matching";
import { requireSession } from "@/lib/session";
import { createDossierAction } from "./actions";

const FILTERS: DossierFilter[] = [
  "alle",
  "tender",
  "gegund",
  "opgeleverd",
  "archief",
];

function asFilter(v: string | string[] | undefined): DossierFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return FILTERS.includes(s as DossierFilter) ? (s as DossierFilter) : "alle";
}

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const filter = asFilter((await searchParams).filter);
  const [dossiers, organizations] = await Promise.all([
    listDossiersFiltered(db, filter),
    listOrganizations(db),
  ]);
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
          <h1 className="text-2xl font-semibold tracking-tight">Projecten</h1>
          <p className="text-sm text-muted-foreground">
            Kies een project of maak een nieuw aan. Fase-default = tender
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
      <div className="mb-6">
        <LifecycleFilter active={filter} />
      </div>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <section>
          <DossierList dossiers={withCounts} />
        </section>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Nieuw project</CardTitle>
            </CardHeader>
            <CardContent>
              <NewDossierForm
                action={createDossierAction}
                organizations={organizations}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
