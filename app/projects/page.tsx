import { db } from "@/db/client";
import { DossierList } from "@/components/dossier/dossier-list";
import { NewDossierForm } from "@/components/dossier/new-dossier-form";
import {
  StatusFilter,
  type ProjectStatusFilter,
} from "@/components/dossier/status-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusCounts } from "@/components/dossier/types";
import { listDossiersFiltered } from "@/lib/repo/project-status";
import { listOrganizations } from "@/lib/repo/orgs";
import { getStatusCounts } from "@/lib/repo/matching";
import { requireSession } from "@/lib/session";
import { createDossierAction } from "./actions";

// Statusfilter (B6): zonder filter alles behálve archief.
const FILTERS: ProjectStatusFilter[] = [
  "alle",
  "concept",
  "estimate_gestuurd",
  "offerte",
  "gegund",
  "niet_gegund",
  "archief",
];

function asFilter(v: string | string[] | undefined): ProjectStatusFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return FILTERS.includes(s as ProjectStatusFilter)
    ? (s as ProjectStatusFilter)
    : "alle";
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
      status: d.status,
      counts: (await getStatusCounts(db, d.id)) as StatusCounts,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Choose a project or create a new one. New = Concept; the safety phase
          stays Tender by default (safe).
        </p>
      </header>
      <div className="mb-6">
        <StatusFilter active={filter} />
      </div>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <section>
          <DossierList dossiers={withCounts} />
        </section>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>New project</CardTitle>
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
