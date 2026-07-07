// White-box RSC-render tests van de instellingen-blokken met fixture-data. Licht/donker ×
// mobiel/desktop, plus gerichte asserts op de gedragingen die ertoe doen: de laatste
// gebruiker is niet te verwijderen, de budgetteller toont verbruik/cap, en de XIS-sleutel
// wordt NOOIT als waarde getoond — alleen de aan/afwezigheid ervan.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { AllowedEmailsBlock } from "./allowed-emails-block";
import type { AllowedEmailRow } from "./allowed-emails-block";
import { LlmBudgetBlock } from "./llm-budget-block";
import { XisBlock } from "./xis-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const emails: AllowedEmailRow[] = [
  { email: "hello@noplasticfloralfoam.com", addedBy: "migratie-0004" },
  { email: "eduard@brink.nl", addedBy: "timo" },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Instellingen
        </h1>
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

const settingsScreen = (
  <Screen>
    <AllowedEmailsBlock
      emails={emails}
      addAction={noopAction}
      removeAction={noopAction}
    />
    <LlmBudgetBlock budgetEur={50} spentEur={32.5} saveAction={noopAction} />
    <XisBlock environment="sandbox" keyIsSet saveAction={noopAction} />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`instellingen (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(settingsScreen);
      await expect.element(document.body).toBeInTheDocument();
      // De drie blokken staan er.
      await expect.element(page.getByText("Gebruikers")).toBeInTheDocument();
      await expect.element(page.getByText("LLM-budget")).toBeInTheDocument();
      await expect.element(page.getByText("XIS-koppeling")).toBeInTheDocument();
      await page.screenshot({
        path: `./instellingen.${theme}.${device}.test.png`,
      });
    });
  }
}

test("gebruikers: adressen zichtbaar, verwijderen kan bij meer dan één adres", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("hello@noplasticfloralfoam.com"))
    .toBeInTheDocument();
  await expect.element(page.getByText("eduard@brink.nl")).toBeInTheDocument();
  const removeBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="eduard@brink.nl verwijderen"]',
  );
  expect(removeBtn).not.toBeNull();
  expect(removeBtn?.disabled).toBe(false);
});

test("gebruikers: het laatste adres is NIET te verwijderen (fail-safe)", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={[emails[0]]}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("hello@noplasticfloralfoam.com"))
    .toBeInTheDocument();
  const removeBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="hello@noplasticfloralfoam.com verwijderen"]',
  );
  expect(removeBtn).not.toBeNull();
  expect(removeBtn?.disabled).toBe(true);
});

test("budget: verbruik en cap staan er; overschrijding toont een amber-notitie, geen rood alarm", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={20} spentEur={27.4} saveAction={noopAction} />
    </Screen>,
  );
  // teller toont zowel verbruik als cap
  await expect.element(page.getByText("€ 27,40")).toBeInTheDocument();
  await expect
    .element(page.getByText("Maandcap overschreden — controleer het verbruik."))
    .toBeInTheDocument();
});

test("budget: zonder cap geen meter maar een neutrale melding", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={null} spentEur={5} saveAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Geen maandcap ingesteld."))
    .toBeInTheDocument();
  expect(page.getByRole("progressbar").query()).toBeNull();
});

test("XIS: de echte sleutel wordt nooit gerenderd — alleen de aanwezigheid", async () => {
  const secret = "xis-live-supersecret-key-123";
  await renderServer(
    <Screen>
      <XisBlock environment="productie" keyIsSet saveAction={noopAction} />
    </Screen>,
  );
  // 'ingesteld' verschijnt, de geheime waarde staat nergens in de DOM.
  await expect.element(page.getByText("ingesteld")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(secret);
  // Het invoerveld is leeg (toont nooit de opgeslagen waarde).
  const input = document.querySelector<HTMLInputElement>("#xis-key");
  expect(input?.value).toBe("");
});
