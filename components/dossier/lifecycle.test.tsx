// White-box RSC-render/interactietests voor de dossier-lifecycle (A-05). We renderen de
// lifecycle-bediening in elke staat (actief/opgeleverd/gearchiveerd) en het filter, en
// asserten expliciet de juiste knoppen, badges, read-only-meldingen en — bij archiveren —
// het verplichte redenveld. Plus licht/donker × mobiel/desktop screenshots voor het "zicht".
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { LifecycleControls } from "./lifecycle-controls";
import { LifecycleFilter } from "./lifecycle-filter";

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

// Screenshots per staat (het dossier is de "map"; de balk staat altijd in beeld).
const states = {
  "lifecycle-actief": (
    <Screen>
      <LifecycleControls dossierId="d1" lifecycle="actief" action={noopAction} />
    </Screen>
  ),
  "lifecycle-opgeleverd": (
    <Screen>
      <LifecycleControls dossierId="d1" lifecycle="delivered" action={noopAction} />
    </Screen>
  ),
  "lifecycle-gearchiveerd": (
    <Screen>
      <LifecycleControls
        dossierId="d1"
        lifecycle="archived"
        archivedReason="verloren tender"
        action={noopAction}
      />
    </Screen>
  ),
  "lifecycle-filter": (
    <Screen>
      <LifecycleFilter active="archief" />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(states)) {
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

// actief: badge "Actief", opleveren + archiveren, geen read-only-melding.
test("lifecycle actief: opleveren + archiveren, geen read-only-melding", async () => {
  await renderServer(
    <Screen>
      <LifecycleControls dossierId="d1" lifecycle="actief" action={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("Actief", { exact: true })).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Markeer als opgeleverd" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Archiveer" }))
    .toBeInTheDocument();
  // Geen heropenen en geen read-only-melding in de actieve staat.
  expect(page.getByRole("button", { name: "Heropen" }).query()).toBeNull();
  expect(page.getByText(/read-only/).query()).toBeNull();
});

// delivered: read-only-melding + archiveren + heropenen.
test("lifecycle opgeleverd: read-only-melding, archiveren en heropenen", async () => {
  await renderServer(
    <Screen>
      <LifecycleControls dossierId="d1" lifecycle="delivered" action={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Opgeleverd — read-only/))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Heropen" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Archiveer" }))
    .toBeInTheDocument();
  // Opleveren kan niet nog eens.
  expect(
    page.getByRole("button", { name: "Markeer als opgeleverd" }).query(),
  ).toBeNull();
});

// archived: read-only-melding met reden + alleen heropenen.
test("lifecycle gearchiveerd: toont de reden en biedt alleen heropenen", async () => {
  await renderServer(
    <Screen>
      <LifecycleControls
        dossierId="d1"
        lifecycle="archived"
        archivedReason="verloren tender"
        action={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Gearchiveerd: verloren tender/))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Heropen" }))
    .toBeInTheDocument();
  // Geen opleveren en geen los archiveer-actie meer.
  expect(
    page.getByRole("button", { name: "Markeer als opgeleverd" }).query(),
  ).toBeNull();
  expect(page.getByRole("button", { name: "Archiveer" }).query()).toBeNull();
});

// Archiveren opent een dialoog met een VERPLICHT redenveld; de submit staat uit tot er
// een reden is ingevuld.
test("archiveren vraagt een verplichte reden voordat het door kan", async () => {
  await renderServer(
    <Screen>
      <LifecycleControls dossierId="d1" lifecycle="actief" action={noopAction} />
    </Screen>,
  );
  await page.getByRole("button", { name: "Archiveer" }).click();
  // Redenveld verschijnt, submit ("Ja, archiveer") staat nog uit.
  await expect.element(page.getByText(/Reden \(verplicht\)/)).toBeInTheDocument();
  const submit = page.getByRole("button", { name: "Ja, archiveer" });
  await expect.element(submit).toBeDisabled();
  // Na een reden mag het door.
  await page.getByLabelText(/Reden \(verplicht\)/).fill("verloren tender");
  await expect.element(submit).toBeEnabled();
});

// Filter: alle vijf opties als links, de actieve draagt aria-current.
test("lifecycle-filter: vijf opties, de actieve draagt aria-current", async () => {
  await renderServer(
    <Screen>
      <LifecycleFilter active="archief" />
    </Screen>,
  );
  for (const label of ["Alle", "Tender", "Gegund", "Opgeleverd", "Archief"]) {
    await expect
      .element(page.getByRole("link", { name: label }))
      .toBeInTheDocument();
  }
  // De actieve optie is gemarkeerd; "Alle" is dat niet.
  await expect
    .element(page.getByRole("link", { name: "Archief" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(page.getByRole("link", { name: "Alle" }))
    .not.toHaveAttribute("aria-current");
  // Href's bevatten de juiste filterwaarde (default "Alle" zonder query).
  await expect
    .element(page.getByRole("link", { name: "Opgeleverd" }))
    .toHaveAttribute("href", "/dossiers?filter=opgeleverd");
});
