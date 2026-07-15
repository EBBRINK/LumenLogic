// White-box RSC-render tests van het organisatie-/ledenbeheer met fixture-data
// (licht/donker × mobiel/desktop), plus gerichte asserts op wat ertoe doet: leden met hun
// rol-badges (petten), de rol-uitleg met de juiste default-landing, en de harde regel dat
// de rol de VIEW kiest en never what the engine shows.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { OrgList, type OrgWithMembers } from "./org-list";
import { OrgMembers, RoleLegend } from "./org-members";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const now = new Date("2026-07-01T09:00:00Z");

const orgs: OrgWithMembers[] = [
  {
    org: {
      id: "o1",
      name: "Installatiebedrijf De Vries",
      slug: "installatiebedrijf-de-vries",
      branding: { accentColor: "#0a7d55", logoUrl: "https://x/logo.svg" },
      plan: "abonnement",
      seatLimit: 5,
      createdAt: now,
      updatedAt: now,
    },
    members: [
      { email: "piet@devries.nl", roles: ["calculator", "org_admin"] },
      { email: "sanne@devries.nl", roles: ["werkvoorbereider"] },
    ],
  },
  {
    org: {
      id: "o2",
      name: "Licht & Co",
      slug: "licht-co",
      branding: null,
      plan: "trial",
      seatLimit: null,
      createdAt: now,
      updatedAt: now,
    },
    members: [],
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Organisaties
        </h1>
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

const orgScreen = (
  <Screen>
    <RoleLegend />
    <OrgList
      orgs={orgs}
      createAction={noopAction}
      addMemberAction={noopAction}
      removeMemberAction={noopAction}
      saveBrandingAction={noopAction}
    />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`organisatie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(orgScreen);
      await expect.element(document.body).toBeInTheDocument();
      await expect
        .element(
          page.getByText(
            "Matches spec lines and builds the calculation and quote.",
          ),
        )
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Installatiebedrijf De Vries"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./organisatie.${theme}.${device}.test.png`,
      });
    });
  }
}

test("organisaties en leden met rol-badges zijn zichtbaar", async () => {
  await renderServer(
    <Screen>
      <OrgList
        orgs={orgs}
        createAction={noopAction}
        addMemberAction={noopAction}
        removeMemberAction={noopAction}
        saveBrandingAction={noopAction}
      />
    </Screen>,
  );
  // beide organisaties
  await expect
    .element(page.getByText("Installatiebedrijf De Vries"))
    .toBeInTheDocument();
  await expect.element(page.getByText("Licht & Co")).toBeInTheDocument();
  // leden van de eerste org
  await expect.element(page.getByText("piet@devries.nl")).toBeInTheDocument();
  await expect.element(page.getByText("sanne@devries.nl")).toBeInTheDocument();
  // lege org toont een eerlijke melding, geen verborgen leeg vlak
  await expect
    .element(page.getByText("No members yet. Add one below."))
    .toBeInTheDocument();

  // rol-badges op de leden (secondary-variant onderscheidt ze van de legenda-badges
  // en van de checkbox-labels)
  const badges = Array.from(
    document.querySelectorAll('[data-slot="badge"][data-variant="secondary"]'),
  ).map((b) => b.textContent);
  expect(badges).toContain("Calculator");
  expect(badges).toContain("Admin");
  expect(badges).toContain("Work preparer");
  // Piet (calculator + org_admin) + Sanne (werkvoorbereider) = 3 rol-badges
  expect(badges).toHaveLength(3);
});

test("rol-uitleg en default-landing kloppen; de rol kiest de VIEW, niet de engine", async () => {
  await renderServer(
    <Screen>
      <RoleLegend />
    </Screen>,
  );
  // uitleg per pet
  await expect
    .element(
      page.getByText("Matches spec lines and builds the calculation and quote."),
    )
    .toBeInTheDocument();
  // de harde regel staat er expliciet
  expect(document.body.textContent).toContain("never what the engine shows");

  // default-landing hangt aan de juiste rol (mapping via defaultLandingForRoles)
  const items = Array.from(document.querySelectorAll("li"));
  const calc = items.find((li) => li.textContent?.includes("Calculator"));
  expect(calc?.textContent).toContain("Lines");
  const wvb = items.find((li) => li.textContent?.includes("Werkvoorbereider"));
  expect(wvb?.textContent).toContain("Work preparation");
  const pl = items.find((li) => li.textContent?.includes("Projectleider"));
  expect(pl?.textContent).toContain("Luminaire schedule");
  const admin = items.find((li) => li.textContent?.includes("Beheerder"));
  expect(admin?.textContent).toContain("Settings");
});

test("het toevoeg-formulier heeft precies de vier rol-checkboxes", async () => {
  await renderServer(
    <Screen>
      <OrgMembers
        orgId="o1"
        members={[]}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Add member")).toBeInTheDocument();
  const boxes = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="roles"]',
    ),
  );
  expect(boxes.map((b) => b.value)).toEqual([
    "calculator",
    "werkvoorbereider",
    "projectleider",
    "org_admin",
  ]);
});
