// Wat een EXTERN account op /settings ziet — sprint 3.2a.
//
// `/settings` staat in de route-allowlist op `iedereen` en niet op `intern`, en dat is een
// bewuste keuze met een prijs: het scherm is daarmee het enige in de app dat voor twee
// soorten kijkers rendert. Externen weigeren zou betekenen dat ze hun eigen wachtwoord niet
// kunnen wijzigen — precies wat sprint 3.1 vorige week heeft opgeleverd — dus staat de deur
// open en zijn de INTERNE BLOKKEN afgeschermd: toegelaten adressen, LLM-budget en de
// XIS-sleutel.
//
// Dit bestand pint die twee standen naast elkaar vast, met screenshots licht/donker ×
// mobiel/desktop. De asserties eronder zijn wat de test echt bewijst; de plaatjes zijn om
// te kíjken (`bun vitest run` schrijft ze naast dit bestand).
//
// ⚠️ Bewust op de BLOKKEN en niet op de hele pagina: `app/settings/page.tsx` trekt Better
// Auth, de PDF-laag en de hele repo-graaf mee, en dan zou dit een test van de modulegraaf
// worden in plaats van van de scheiding. De regel die de blokken kiest (`toegang.soort ===
// "intern"`) staat in de pagina en wordt daar getoetst door
// `app/settings/settings-actions.test.ts`; wat híér wordt vastgelegd is wat de twee standen
// tónen.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { AllowedEmailsBlock } from "./allowed-emails-block";
import { LlmBudgetBlock } from "./llm-budget-block";
// Het wachtwoordblok via zijn bestaande client-stub: de vitest-RSC-brug staat geen kale
// functies toe die van deze (server-side) testfile naar een clientcomponent oversteken.
// Zie de toelichting bovenaan password-block-test-stubs.tsx.
import { PasswordBlockIdle } from "./password-block-test-stubs";
import { XisBlock } from "./xis-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

/**
 * Precies de blokken die `app/settings/page.tsx` voor een INTERN account rendert, in
 * dezelfde volgorde. Het wachtwoordblok staat onderaan, want dat is het enige blok dat
 * beide kijkers delen.
 */
const internScherm = (
  <div className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <AllowedEmailsBlock
          emails={[
            { email: "timo@brinklicht.nl", addedBy: "seed" },
            { email: "e.brink@brinklicht.nl", addedBy: "timo@brinklicht.nl" },
          ]}
          addAction={noopAction}
          removeAction={noopAction}
          sessionEmail="timo@brinklicht.nl"
        />
      </div>
      <LlmBudgetBlock
        budgetEur={50}
        spentEur={12.4}
        breakdown={[
          { purpose: "vangnet", eur: 8.1 },
          { purpose: "ocr", eur: 4.3 },
        ]}
        saveAction={noopAction}
      />
      <XisBlock environment="sandbox" keyIsSet={false} saveAction={noopAction} />
      <PasswordBlockIdle />
    </div>
  </div>
);

/** Wat een EXTERN account overhoudt: alleen zijn eigen wachtwoord. */
const externScherm = (
  <div className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
    <div className="grid gap-6 lg:grid-cols-2">
      <PasswordBlockIdle />
    </div>
  </div>
);

// ── Wat er staat, en vooral wat er níét staat ────────────────────────────────

// `renderServer` rendert asynchroon door en het wachtwoordblok is een clientcomponent;
// `document.body.textContent` is dus leeg tot er iets uit dát blok in beeld staat. Op de
// kop "Password" wachten (exact, anders matcht hij ook "Current password", "New password"
// en de knop "Change password") is de laatste stap in beide standen — zelfde patroon als
// password-block.test.tsx.
async function toonEnLees(scherm: React.ReactElement): Promise<string> {
  await renderServer(scherm);
  await expect
    .element(page.getByText("Password", { exact: true }))
    .toBeInTheDocument();
  return document.body.textContent ?? "";
}

test("intern: de beheerblokken staan er, en het wachtwoordblok ook", async () => {
  const tekst = await toonEnLees(internScherm);
  expect(tekst).toContain("timo@brinklicht.nl");
  expect(tekst).toContain("e.brink@brinklicht.nl");
  // De drie beheerblokken, elk aan een eigen woord herkend.
  expect(tekst.toLowerCase()).toContain("budget");
  expect(tekst.toUpperCase()).toContain("XIS");
  expect(tekst.toLowerCase()).toContain("password");
});

test("extern: geen adressenlijst, geen budget, geen XIS-sleutel — wel het wachtwoord", async () => {
  const tekst = await toonEnLees(externScherm);
  // Dít is de eis. Een toegelaten-adressenlijst is de ledenlijst van Brink, het
  // LLM-budget is Brinks kostenplaatje en de XIS-sleutel is een koppeling met hun ERP —
  // geen van drieën gaat een klant iets aan.
  expect(tekst).not.toContain("brinklicht.nl");
  expect(tekst.toLowerCase()).not.toContain("budget");
  expect(tekst).not.toContain("XIS");
  // …en het blok dat hij wél nodig heeft staat er: zonder dit zou 3.2a een extern account
  // opsluiten met het wachtwoord dat hij bij de activatie heeft gekozen.
  expect(tekst.toLowerCase()).toContain("password");
});

// ── Screenshots: licht/donker × mobiel/desktop ───────────────────────────────

for (const [naam, scherm] of [
  ["intern", internScherm],
  ["extern", externScherm],
] as const) {
  for (const thema of ["light", "dark"] as const) {
    for (const [apparaat, viewport] of Object.entries(viewports)) {
      test(`instellingen ${naam} (${thema}, ${apparaat})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (thema === "dark") document.documentElement.classList.add("dark");
        await renderServer(scherm);
        // Wachten op iets dat er zeker is, anders schiet de screenshot een lege boom.
        await expect
          .element(page.getByText("Password", { exact: true }))
          .toBeInTheDocument();
        await page.screenshot({
          path: `./settings-toegang.${naam}.${thema}.${apparaat}.test.png`,
        });
      });
    }
  }
}
