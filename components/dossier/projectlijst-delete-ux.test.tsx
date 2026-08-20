// White-box RSC-tests voor projecten verwijderen (docs/goal-projecten-verwijderen.md):
// checkboxes op de lijst, de "N selected"-balk met "Delete selected", en de
// bevestigingsdialoog die naam, inhoud én het Archiveren-alternatief noemt.
//
// De screenshots bouwen het scherm na zoals app/projects/page.tsx het samenstelt —
// zelfde truc als projectlijst-ux.test.tsx (de pagina zelf is DB-backed).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import {
  SelectableDossierList,
  type SelectableDossierItem,
} from "./dossier-list-selectable";
import { ProjectDeleteButton } from "./project-delete-button";
import { emptyCounts } from "./status";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Zes identieke testprojecten "d" — precies het scherm waarvoor dit gebouwd is —
// plus één project zonder verwijderrecht, zodat het lege checkbox-vak op de foto staat.
const dossiers: SelectableDossierItem[] = [
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    name: "d",
    customer: "Timo",
    phase: "tender" as const,
    status: "concept" as const,
    counts: emptyCounts(),
    updatedAt: "2026-08-12T09:15:00Z",
    canDelete: true,
    lineCount: 0,
  })),
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "Ziekenhuis Noord",
    customer: "Deerns",
    phase: "tender",
    status: "concept",
    counts: { ...emptyCounts(), groen: 9, geel: 2 },
    updatedAt: "2026-07-30T09:15:00Z",
    canDelete: false,
    lineCount: 21,
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

test("checkbox alleen op verwijderbare projecten; selectie toont de balk en de dialoog", async () => {
  await renderServer(
    <Screen>
      <SelectableDossierList
        dossiers={dossiers}
        emptyMessage="No projects yet."
        deleteAction={noopAction}
      />
    </Screen>,
  );
  // Drie verwijderbare → drie checkboxes; "Ziekenhuis Noord" heeft er geen.
  await expect
    .element(page.getByLabelText("Select d for deletion").first())
    .toBeInTheDocument();
  const boxes = document.querySelectorAll('input[type="checkbox"]');
  expect(boxes).toHaveLength(3);
  expect(
    document.querySelector('[aria-label="Select Ziekenhuis Noord for deletion"]'),
  ).toBeNull();

  await page.getByLabelText("Select d for deletion").first().click();
  await page.getByLabelText("Select d for deletion").nth(1).click();
  await expect.element(page.getByText("2 selected")).toBeInTheDocument();

  await page.getByRole("button", { name: "Delete selected" }).click();
  // De dialoog noemt het aantal, de inhoud en het omkeerbare alternatief.
  await expect
    .element(page.getByRole("heading", { name: "Delete 2 projects?" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/Use Archive on the project page instead/))
    .toBeInTheDocument();
});

test("Clear selection maakt de balk weer leeg", async () => {
  await renderServer(
    <Screen>
      <SelectableDossierList
        dossiers={dossiers}
        emptyMessage="No projects yet."
        deleteAction={noopAction}
      />
    </Screen>,
  );
  await page.getByLabelText("Select d for deletion").first().click();
  await expect.element(page.getByText("1 selected")).toBeInTheDocument();
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(document.body.textContent).not.toContain("1 selected");
});

test("ProjectDeleteButton: dialoog noemt naam, inhoud en Archiveren", async () => {
  await renderServer(
    <Screen>
      <ProjectDeleteButton
        dossierId="00000000-0000-4000-8000-000000000001"
        name="d"
        impact={{ name: "d", specLines: 21, quotes: 1, importRuns: 2, leads: 0 }}
        action={noopAction}
      />
    </Screen>,
  );
  await page.getByRole("button", { name: "Delete" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Delete project “d”?" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/21 spec lines, 1 estimate, 2 imports/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/Use Archive instead/))
    .toBeInTheDocument();
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`projectlijst-delete (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <SelectableDossierList
            dossiers={dossiers}
            emptyMessage="No projects yet."
            deleteAction={noopAction}
          />
        </Screen>,
      );
      await page.getByLabelText("Select d for deletion").first().click();
      await page.getByLabelText("Select d for deletion").nth(1).click();
      await expect.element(page.getByText("2 selected")).toBeInTheDocument();
      await page.screenshot({
        path: `./projectlijst-delete.${theme}.${device}.test.png`,
      });
    });

    test(`projectlijst-delete-dialoog (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <SelectableDossierList
            dossiers={dossiers}
            emptyMessage="No projects yet."
            deleteAction={noopAction}
          />
        </Screen>,
      );
      await page.getByLabelText("Select d for deletion").first().click();
      await page.getByRole("button", { name: "Delete selected" }).click();
      await expect
        .element(page.getByRole("heading", { name: "Delete project “d”?" }))
        .toBeInTheDocument();
      // Open-animatie 100ms (DESIGN.md §8); zonder pauze staat er een half
      // uitgezoomde dialoog op de foto.
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({
        path: `./projectlijst-delete-dialoog.${theme}.${device}.test.png`,
      });
    });
  }
}
