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
      type: "extern", // organizations.type, nieuw in migratie 0019 (G31)
      createdAt: now,
      updatedAt: now,
    },
    members: [
      { email: "piet@devries.nl", roles: ["calculator", "org_admin"] },
      { email: "sanne@devries.nl", roles: ["werkvoorbereider"] },
    ],
    // Besluiten G36/G39: de server bepaalt of deze gebruiker de leden van déze organisatie
    // mag beheren. De fixtures hieronder zijn de interne stand (mag alles) — de
    // org_admin-stand staat in een eigen test onderaan dit bestand.
    canManageMembers: true,
  },
  {
    org: {
      id: "o2",
      name: "Licht & Co",
      slug: "licht-co",
      branding: null,
      plan: "trial",
      seatLimit: null,
      type: "extern", // organizations.type, nieuw in migratie 0019 (G31)
      createdAt: now,
      updatedAt: now,
    },
    members: [],
    canManageMembers: true,
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-7xl">
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
      addMemberAction={noopAction}
      removeMemberAction={noopAction}
      saveBrandingAction={noopAction}
      canGrantOrgAdmin
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
        addMemberAction={noopAction}
        removeMemberAction={noopAction}
        saveBrandingAction={noopAction}
        canGrantOrgAdmin
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

// ⚠️ 3.2c, BESLUIT 1 — HET AANMAAKFORMULIER IS HIER WEG. Hier stonden twee A7-tests
// (UX-audit 30 jul) over wáár het Create-formulier op dit scherm hoorde te staan. Die vraag
// bestaat niet meer: een organisatie aanmaken gebeurt op /admin/users, bij de PIN-uitgifte,
// omdat "iemand toegang geven" één handeling is die over twee schermen verdeeld stond.
//
// Deze twee tests zijn de vervangers, en ze meten de andere kant op: dat er hier écht geen
// tweede ingang is blijven hangen. Twee aanmaakformulieren zou de versnippering verdubbelen
// in plaats van hem oplossen — en dan is de vraag welke van de twee de waarheid is.
// Het bewijs dat het formulier op de nieuwe plek wél werkt staat in
// components/admin/orgs.test.tsx.
test("besluit 1 — lege organisatielijst wijst naar Admin en biedt geen formulier", async () => {
  await renderServer(
    <Screen>
      <OrgList
        orgs={[]}
        addMemberAction={noopAction}
        removeMemberAction={noopAction}
        saveBrandingAction={noopAction}
        canGrantOrgAdmin
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("No organizations yet."))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/created in Admin/))
    .toBeInTheDocument();

  // Geen aanmaak-formulier, nergens op dit scherm — ook niet in de lege toestand.
  const forms = Array.from(document.querySelectorAll("form")).filter((f) =>
    f.querySelector('input[name="name"]'),
  );
  expect(forms).toEqual([]);
  // Bewust op de KAARTKOP en niet op de body-tekst: de lege toestand noemt "New
  // organizations are created in Admin", en een kale substring-check op "New organization"
  // zou daarop afketsen. Wat weg moet is de kaart, niet het woord.
  const koppen = Array.from(
    document.querySelectorAll('[data-slot="card-title"]'),
  ).map((k) => k.textContent);
  expect(koppen).not.toContain("New organization");
});

test("besluit 1 — met organisaties: nog steeds geen aanmaak-formulier, alleen leden en branding", async () => {
  await renderServer(
    <Screen>
      <OrgList
        orgs={orgs}
        addMemberAction={noopAction}
        removeMemberAction={noopAction}
        saveBrandingAction={noopAction}
        canGrantOrgAdmin
      />
    </Screen>,
  );
  // ⚠️ Eerst een await-assertie op iets dat er wél staat: `renderServer` is pas na een
  // await gespoeld, en een synchrone querySelectorAll erop vindt anders een lege body —
  // waarmee élke "er staat geen formulier"-assertie gratis groen wordt.
  await expect
    .element(page.getByText("Installatiebedrijf De Vries"))
    .toBeInTheDocument();

  const koppen = Array.from(
    document.querySelectorAll('[data-slot="card-title"]'),
  ).map((k) => k.textContent);
  expect(koppen).not.toContain("New organization");
  const aanmaak = Array.from(document.querySelectorAll("form")).filter((f) =>
    f.querySelector('input[name="name"]'),
  );
  expect(aanmaak).toEqual([]);
  // Wat er wél staat: de branding-formulieren, één per organisatie.
  const branding = Array.from(document.querySelectorAll("form")).filter((f) =>
    f.querySelector('input[name="logoUrl"]'),
  );
  expect(branding).toHaveLength(orgs.length);
});

// De lege toestand blijft een screenshot waard: zonder het formulier erin is het een
// ander kader dan vóór 3.2c, en het moet op 375px net zo netjes vallen als op 1280px.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`organisatie leeg (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <OrgList
            orgs={[]}
            addMemberAction={noopAction}
            removeMemberAction={noopAction}
            saveBrandingAction={noopAction}
            canGrantOrgAdmin
            />
        </Screen>,
      );
      await expect
        .element(page.getByText("No organizations yet."))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./organisatie-leeg.${theme}.${device}.test.png`,
      });
    });
  }
}

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
  const wvb = items.find((li) => li.textContent?.includes("Work preparer"));
  expect(wvb?.textContent).toContain("Work preparation");
  const pl = items.find((li) => li.textContent?.includes("Project lead"));
  expect(pl?.textContent).toContain("Luminaire schedule");
  const admin = items.find((li) => li.textContent?.includes("Admin"));
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
        canManage
        canGrantOrgAdmin
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

// ── Besluiten G36/G39: het scherm biedt niets aan dat de server toch weigert ────
// ⚠️ UI-gemak, geen poort. Het bewijs dat addMemberAction/removeMemberAction zélf weigeren
// staat in app/admin/users/issue-pin-authz.test.ts (de échte actions, zonder formulier).

test("org_admin-stand: geen org_admin-vinkje, en geen verwijderknop bij een collega-beheerder", async () => {
  await renderServer(
    <Screen>
      <OrgMembers
        orgId="o1"
        members={[
          { email: "piet@devries.nl", roles: ["calculator", "org_admin"] },
          { email: "sanne@devries.nl", roles: ["werkvoorbereider"] },
        ]}
        addAction={noopAction}
        removeAction={noopAction}
        canManage
        canGrantOrgAdmin={false}
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
  ]);

  // Piet is org_admin: geen knop. Sanne wel.
  const knoppen = Array.from(
    document.querySelectorAll("button[aria-label^='Remove']"),
  ).map((b) => b.getAttribute("aria-label"));
  expect(knoppen).toEqual(["Remove sanne@devries.nl"]);
});

test("een organisatie die je niet beheert: geen formulier, geen knoppen, wel de lijst", async () => {
  await renderServer(
    <Screen>
      <OrgMembers
        orgId="o2"
        members={[{ email: "iemand@anders.nl", roles: ["calculator"] }]}
        addAction={noopAction}
        removeAction={noopAction}
        canManage={false}
        canGrantOrgAdmin={false}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("iemand@anders.nl"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/can't manage the members/))
    .toBeInTheDocument();
  expect(document.querySelectorAll('input[name="roles"]')).toHaveLength(0);
  expect(document.querySelectorAll("button[aria-label^='Remove']")).toHaveLength(0);
});
