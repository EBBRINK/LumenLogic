// White-box RSC-render/interactietests voor het status- en fasemodel (B6, stap 4) —
// vervangt de oude lifecycle-tests, met behoud van het gedekte gedrag: archiveren
// vraagt een VERPLICHTE reden, archief toont read-only-taal, en het lijstfilter draagt
// aria-current. Plus licht/donker × mobiel/desktop screenshots van de projectlijst
// (statusbadges + filter) en de projectkop (status- en XIS-fase-controls).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DossierList } from "./dossier-list";
import { PhaseBadge } from "./phase-badge";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectStatusControls } from "./project-status-controls";
import { StatusFilter } from "./status-filter";
import { StatusTally } from "./status-badge";
import { emptyCounts } from "./status";
import type { DossierSummary } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Alle zes statussen in één lijst — de badge-taal moet op elk scherm hetzelfde zijn.
const dossiers: DossierSummary[] = [
  { id: "d1", name: "Ziekenhuis Noord", customer: "Deerns", phase: "tender", status: "concept", counts: { ...emptyCounts(), groen: 9, geel: 2 } },
  { id: "d2", name: "Kantoor Zuid", customer: "BAM Bouw", phase: "tender", status: "estimate_gestuurd", counts: { ...emptyCounts(), groen: 4 } },
  { id: "d3", name: "School West", customer: "Heijmans", phase: "tender", status: "offerte", counts: { ...emptyCounts(), groen: 6, blauw: 1 } },
  { id: "d4", name: "Museum Oost", customer: "Gemeente", phase: "awarded", status: "gegund", counts: { ...emptyCounts(), groen: 12 } },
  { id: "d5", name: "Hotel Centrum", customer: "Van Wijnen", phase: "tender", status: "niet_gegund", counts: { ...emptyCounts(), groen: 3, rood: 2 } },
  { id: "d6", name: "Vervallen project", customer: null, phase: "tender", status: "archief" },
];

// Nagebouwde projectkop (zelfde opbouw als app/projects/[id]/layout.tsx) — zo staat
// de header mét status-dropdown, XIS-fase-select en afgeleide fase-badge op de foto.
function Projectkop({
  status,
  xisPhase,
  phase,
  archivedReason,
}: {
  status: DossierSummary["status"];
  xisPhase: React.ComponentProps<typeof ProjectStatusControls>["xisPhase"];
  phase: "tender" | "awarded";
  archivedReason?: string | null;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Ziekenhuis Noord</h1>
          <ProjectStatusBadge status={status} />
          <PhaseBadge phase={phase} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Deerns</span>
          <StatusTally counts={{ ...emptyCounts(), groen: 9, geel: 2 }} />
        </div>
      </div>
      <ProjectStatusControls
        dossierId="d1"
        status={status}
        xisPhase={xisPhase}
        archivedReason={archivedReason}
        statusAction={noopAction}
        xisPhaseAction={noopAction}
      />
    </header>
  );
}

const screens = {
  "projectlijst-status": (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Projecten</h1>
      <div className="mb-6">
        <StatusFilter active="alle" />
      </div>
      <DossierList dossiers={dossiers} />
    </Screen>
  ),
  "projectkop-status": (
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>
  ),
  "projectkop-gegund": (
    <Screen>
      <Projectkop status="gegund" xisPhase="deal_making" phase="awarded" />
    </Screen>
  ),
  "projectkop-archief": (
    <Screen>
      <Projectkop
        status="archief"
        xisPhase="lost"
        phase="tender"
        archivedReason="verloren tender"
      />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// Lijst: elke status verschijnt als badge; de afgeleide fase-badge staat ernaast.
test("projectlijst: statusbadge per project, in de vaste badge-taal", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={dossiers} />
    </Screen>,
  );
  for (const label of [
    "Concept",
    "Estimate sent",
    "Quote",
    "Won", // let op: staat er 2× — als statusbadge én als fase-badge (awarded)
    "Lost",
    "Archived",
  ]) {
    await expect
      .element(page.getByText(label, { exact: true }).first())
      .toBeInTheDocument();
  }
});

// Filter: zeven opties (Alle + zes statussen), de actieve draagt aria-current;
// default "All" zonder query (toont alles behálve archief — dat is de repo-kant).
test("statusfilter: zeven opties, de actieve draagt aria-current", async () => {
  await renderServer(
    <Screen>
      <StatusFilter active="archief" />
    </Screen>,
  );
  for (const label of [
    "All",
    "Concept",
    "Estimate sent",
    "Quote",
    "Won",
    "Lost",
    "Archived",
  ]) {
    await expect
      .element(page.getByRole("link", { name: label, exact: true }))
      .toBeInTheDocument();
  }
  await expect
    .element(page.getByRole("link", { name: "Archived" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(page.getByRole("link", { name: "All" }))
    .not.toHaveAttribute("aria-current");
  await expect
    .element(page.getByRole("link", { name: "Lost" }))
    .toHaveAttribute("href", "/projects?filter=niet_gegund");
});

// Kop: status-dropdown met de zes statussen + XIS-fase-select met de tien NL-labels.
test("projectkop: status-dropdown en XIS-fase-select met alle opties", async () => {
  await renderServer(
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>,
  );
  const status = page.getByLabelText("Status");
  await expect.element(status).toBeInTheDocument();
  const xis = page.getByLabelText("XIS phase");
  await expect.element(xis).toBeInTheDocument();
  // De tien XIS-fasen als nette NL-labels.
  for (const label of [
    "Start", "Engineering", "Calculations", "Presenting", "Tender",
    "Deal making", "Deliver", "Aftersales", "Win", "Lost",
  ]) {
    await expect
      .element(page.getByRole("option", { name: label }).first())
      .toBeInTheDocument();
  }
});

// Archiveren vraagt eerst een VERPLICHTE reden (gedrag uit de oude lifecycle-test):
// archief kiezen opent de dialoog, de submit staat uit tot er een reden is ingevuld.
test("status archief kiezen vraagt een requirede reden voordat het door kan", async () => {
  await renderServer(
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>,
  );
  await page.getByLabelText("Status").selectOptions("Archived");
  await expect.element(page.getByText(/Reason \(required\)/)).toBeInTheDocument();
  const submit = page.getByRole("button", { name: "Yes, archive" });
  await expect.element(submit).toBeDisabled();
  await page.getByLabelText(/Reason \(required\)/).fill("verloren tender");
  await expect.element(submit).toBeEnabled();
});

// Archief = read-only: de reden staat in de kop, de XIS-fase-select staat op slot;
// alleen via de status-dropdown kom je eruit (heropenen).
test("projectkop archief: toont de reden en zet de XIS-fase-select op slot", async () => {
  await renderServer(
    <Screen>
      <Projectkop
        status="archief"
        xisPhase="lost"
        phase="tender"
        archivedReason="verloren tender"
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Archived: verloren tender/))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("XIS phase")).toBeDisabled();
  await expect.element(page.getByLabelText("Status")).toBeEnabled();
});
