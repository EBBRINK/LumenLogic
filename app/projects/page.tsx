import { db } from "@/db/client";
import { DossierList, StatusLegend } from "@/components/dossier/dossier-list";
import { NewDossierDialog } from "@/components/dossier/new-dossier-form";
import {
  StatusFilter,
  type ProjectStatusFilter,
} from "@/components/dossier/status-filter";
import { PROJECT_STATUS_META } from "@/components/dossier/project-status-badge";
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
// Beide richtingen blijven heel: dit formulier stuurt het actieve filter als hidden veld
// mee, en de filterchips dragen `?q=` mee via `params` (StatusFilter). Dat was tot de
// verificatieronde van 30 jul eenrichtingsverkeer — een statuschip wiste de zoekterm.
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
      {/* Submit → `outline`. `secondary` is hier gereserveerd voor de filterchips
          ernaast, waar het de úit-stand van een schakelaar is (DESIGN.md §6). */}
      <Button type="submit" variant="outline">
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
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
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
        {/* `params` houdt de zoekterm heel als je een andere status kiest — zonder
            dit bouwde de chip zijn href als basePath + "?filter=…" en wiste hij `?q=`
            stilzwijgend (verificatie 30 jul). */}
        <StatusFilter active={filter} params={{ q }} />
      </div>
      <StatusLegend className="mb-4" />
      {/* De noemer is de lijst ná het statusfilter, niet de hele database — daarom staat
          het filter erbij zodra het niet "All" is. "0 of 1 project match" liep bovendien
          mis in het werkwoord; "Showing … matching" klopt bij elk aantal. */}
      {q !== "" && (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing {withCounts.length} of {dossiers.length}{" "}
          {dossiers.length === 1 ? "project" : "projects"}
          {filter === "alle"
            ? ""
            : ` under “${PROJECT_STATUS_META[filter].label}”`}{" "}
          matching “{q}”
        </p>
      )}
      {/* De lege staat vertelt wélke van de drie situaties het is. "No projects yet" op
          `?filter=archief` is onwaar zodra er één niet-gearchiveerd project bestaat —
          zelfde soort halve waarheid als de rest van de audit; alleen de derde tak mag
          "nog geen projecten" zeggen. */}
      <DossierList
        dossiers={withCounts}
        emptyMessage={
          q !== ""
            ? `No project matches “${q}”${
                filter === "alle" ? "" : ` under “${PROJECT_STATUS_META[filter].label}”`
              }.`
            : filter !== "alle"
              ? `No projects under “${PROJECT_STATUS_META[filter].label}”.`
              : "No projects yet. Use “New project” to create one."
        }
      />
    </main>
  );
}
