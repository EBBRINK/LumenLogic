import { db } from "@/db/client";
import { DossierList, StatusLegend } from "@/components/dossier/dossier-list";
import { NewDossierDialog } from "@/components/dossier/new-dossier-form";
import {
  StatusFilter,
  type ProjectStatusFilter,
} from "@/components/dossier/status-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function asQuery(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

// Zoeken staat in de URL, net als het statusfilter (`?filter=`) — dat idioom is de
// standaard op dit scherm: de stand is deelbaar, bookmarkbaar en overleeft een reload.
// Een GET-formulier houdt dat waar zonder client-state; het zoekveld heeft geen JS.
//
// BEKENDE RANDJE: de filterchips bouwen hun href als `basePath` + `?filter=…` en kunnen
// er dus geen tweede parameter bij dragen. Een andere status kiezen wist de zoekterm.
// Andersom niet: dit formulier stuurt het actieve filter als hidden veld mee. Het chip-
// component ligt bij een andere sessie, dus hier niet aangeraakt.
function ProjectSearch({
  q,
  filter,
}: {
  q: string;
  filter: ProjectStatusFilter;
}) {
  const clearHref =
    filter === "alle" ? "/projects" : `/projects?filter=${filter}`;
  return (
    <form
      method="get"
      action="/projects"
      role="search"
      className="flex flex-wrap items-center gap-2"
    >
      {filter !== "alle" && (
        <input type="hidden" name="filter" value={filter} />
      )}
      <label htmlFor="q" className="sr-only">
        Search projects
      </label>
      <Input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search project or customer"
        className="w-full sm:w-72"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {q !== "" && (
        <Button asChild variant="ghost">
          <a href={clearHref}>Clear</a>
        </Button>
      )}
    </form>
  );
}

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const sp = await searchParams;
  const filter = asFilter(sp.filter);
  const q = asQuery(sp.q);
  const [dossiers, organizations] = await Promise.all([
    listDossiersFiltered(db, filter),
    listOrganizations(db),
  ]);
  // Zoeken op naam én klant, hoofdletterongevoelig. Bewust hier en niet in de repo:
  // listDossiersFiltered wordt door meer aanroepers gebruikt, en dit scherm haalt sowieso
  // de hele (korte) lijst op. Filteren vóór getStatusCounts scheelt bovendien een query
  // per weggefilterd dossier.
  const naald = q.toLocaleLowerCase();
  const gevonden = q
    ? dossiers.filter(
        (d) =>
          d.name.toLocaleLowerCase().includes(naald) ||
          (d.customer ?? "").toLocaleLowerCase().includes(naald),
      )
    : dossiers;
  // Kleuren-telling per dossier ophalen zodat de lijst het status-dashboard toont (E-03).
  const withCounts = await Promise.all(
    gevonden.map(async (d) => ({
      id: d.id,
      name: d.name,
      customer: d.customer,
      phase: d.phase,
      status: d.status,
      // Maakt de bestaande sortering (updated_at DESC) zichtbaar op de kaart.
      updatedAt: d.updatedAt,
      counts: (await getStatusCounts(db, d.id)) as StatusCounts,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Choose a project or create a new one. New = Concept; the safety phase
            stays Tender by default (safe).
          </p>
        </div>
        <NewDossierDialog
          action={createDossierAction}
          organizations={organizations}
        />
      </header>
      <div className="mb-6 flex flex-col gap-3">
        <ProjectSearch q={q} filter={filter} />
        <StatusFilter active={filter} />
      </div>
      <StatusLegend className="mb-4" />
      {q !== "" && (
        <p className="mb-3 text-sm text-muted-foreground">
          {withCounts.length} of {dossiers.length}{" "}
          {dossiers.length === 1 ? "project" : "projects"} match “{q}”
        </p>
      )}
      <DossierList
        dossiers={withCounts}
        emptyMessage={
          q !== ""
            ? `No project matches “${q}”.`
            : "No projects yet. Use “New project” to create one."
        }
      />
    </main>
  );
}
