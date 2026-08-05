// White-box RSC-test van het wachtwoordblok op /settings (sprint 3.1, golf 2, besluit
// G34): een ingelogde gebruiker wijzigt zijn eigen wachtwoord, met opgave van het huidige
// wachtwoord. Licht/donker × mobiel/desktop, plus gerichte asserts: het huidige wachtwoord
// is verplicht, een verkeerd huidig wachtwoord wordt geweigerd, en de wachtwoordeis staat
// vóórdat de gebruiker hem overtreedt.
//
// De teststub-acties zitten in ./password-block-test-stubs.tsx (eigen "use client"-bestand,
// zie het commentaar daar): deze testfile draait server-side onder vitest-plugin-rsc en mag
// zelf géén kale functies als action-prop aan PasswordBlock meegeven — dat is precies wat de
// RSC-brug weigert ("Functions cannot be passed directly to Client Components").
//
// De hoofd-screenshotlus toont het wachtwoordblok ALLEEN (niet samen met de drie bestaande
// blokken): bij vier kaarten op 375px breed schaalt de harness het beeld terug tot een
// onbruikbaar plaatje (zelfde les als de budgetCapScreen-isolatie in settings.test.tsx — zie
// dat bestand). Een aparte, niet-screenshottende test bewijst dat het blok wél naast de
// andere drie past.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { AllowedEmailsBlock } from "./allowed-emails-block";
import type { AllowedEmailRow } from "./allowed-emails-block";
import { LlmBudgetBlock } from "./llm-budget-block";
import {
  PasswordBlockIdle,
  PasswordBlockNoPasswordYet,
  PasswordBlockSuccess,
  PasswordBlockWrongCurrent,
} from "./password-block-test-stubs";
import { XisBlock } from "./xis-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const MIN = 12;
const MAX = 128;

const emails: AllowedEmailRow[] = [
  { email: "hello@noplasticfloralfoam.com", addedBy: "migratie-0004" },
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

const passwordScreen = (
  <Screen>
    <PasswordBlockIdle />
  </Screen>
);

const passwordErrorScreen = (
  <Screen>
    <PasswordBlockWrongCurrent />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`wachtwoordblok (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(passwordScreen);
      // exact:true — "Password" is anders een substring-match op "Current password",
      // "New password", "Confirm new password" en de knoptekst "Change password".
      await expect
        .element(page.getByText("Password", { exact: true }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./password-block.${theme}.${device}.test.png`,
      });
    });
  }
}

// Bewijst dat het blok naast de drie bestaande blokken past (structuur/toon-eis uit de
// opdracht) — bewust GEEN screenshot hiervan, zie het commentaar bovenaan dit bestand.
test("het wachtwoordblok staat naast de drie bestaande blokken zonder ze te storen", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
      />
      <LlmBudgetBlock budgetEur={50} spentEur={32.5} saveAction={noopAction} />
      <XisBlock environment="sandbox" keyIsSet saveAction={noopAction} />
      <PasswordBlockIdle />
    </Screen>,
  );
  await expect.element(page.getByText("Users")).toBeInTheDocument();
  await expect.element(page.getByText("LLM budget")).toBeInTheDocument();
  await expect.element(page.getByText("XIS connection")).toBeInTheDocument();
  await expect
    .element(page.getByText("Password", { exact: true }))
    .toBeInTheDocument();
});

// De harde lat, punt 10: een ingelogde gebruiker wijzigt zijn wachtwoord MET opgave van
// het huidige wachtwoord. Dit veld is er, is verplicht en heeft het juiste autoComplete.
test("het huidige wachtwoord wordt gevraagd, met het juiste autoComplete-attribuut", async () => {
  await renderServer(passwordScreen);
  await expect
    .element(page.getByText("Password", { exact: true }))
    .toBeInTheDocument();
  const current = document.querySelector<HTMLInputElement>("#current-password");
  expect(current).not.toBeNull();
  expect(current?.required).toBe(true);
  expect(current?.getAttribute("autoComplete")).toBe("current-password");
  const next = document.querySelector<HTMLInputElement>("#new-password");
  expect(next?.getAttribute("autoComplete")).toBe("new-password");
});

// De wachtwoordeis staat vóór de gebruiker hem overtreedt (§lat): de hint is er meteen,
// niet pas na een fout.
test("de lengte-eis staat er meteen, vóór er iets fout gaat", async () => {
  await renderServer(passwordScreen);
  await expect
    .element(page.getByText(`${MIN}–${MAX} characters — no other rules.`))
    .toBeInTheDocument();
});

// Hydration-wachtlus (zelfde patroon als components/dossier/pdf-upload.test.tsx en
// components/activate/activate.test.tsx).
async function wachtOpHydratatie() {
  await vi.waitFor(
    () => {
      const form = document.querySelector("form");
      if (
        !form ||
        !Object.keys(form).some((k) => k.startsWith("__reactProps"))
      ) {
        throw new Error("formulier nog niet gehydrateerd");
      }
    },
    { timeout: 10_000, interval: 100 },
  );
}

async function vulFormulierIn(opts?: {
  huidig?: string;
  nieuw?: string;
  bevestig?: string;
}) {
  const nieuw = opts?.nieuw ?? "een-heel-lang-nieuw-wachtwoord";
  await userEvent.type(
    page.getByLabelText("Current password"),
    opts?.huidig ?? "het-oude-wachtwoord",
  );
  // exact:true — anders is "New password" ook een (case-insensitive) substring-match op
  // "Confirm new password" en raakt de locator twee velden.
  await userEvent.type(
    page.getByLabelText("New password", { exact: true }),
    nieuw,
  );
  await userEvent.type(
    page.getByLabelText("Confirm new password"),
    opts?.bevestig ?? nieuw,
  );
}

test("verkeerd huidig wachtwoord: geweigerd met een duidelijke, veldgebonden melding", async () => {
  await renderServer(passwordErrorScreen);
  await wachtOpHydratatie();
  await vulFormulierIn();
  await page.getByRole("button", { name: "Change password" }).click();

  await expect
    .element(page.getByText("Current password is incorrect."))
    .toBeInTheDocument();

  const current = document.querySelector<HTMLInputElement>("#current-password");
  expect(current?.getAttribute("aria-invalid")).toBe("true");
  expect(current?.getAttribute("aria-describedby")).toBe(
    "current-password-error",
  );
  // De stub-actie (in password-block-test-stubs.tsx) telt zijn aanroepen via een
  // window-teller: module-exports komen door de RSC-testbrug als client-referentie aan,
  // niet als de vi.fn()-waarde zelf, dus een gewone toHaveBeenCalledWith kan hier niet.
  expect(window.__changePasswordCalls).toEqual([
    {
      currentPassword: "het-oude-wachtwoord",
      newPassword: "een-heel-lang-nieuw-wachtwoord",
    },
  ]);
});

// Golf-2-critic ronde 1: een account zonder wachtwoord (deploy 1 — 0 van de 3 huidige
// users hebben er een, briefing §2) mag NOOIT "Current password is incorrect." te horen
// krijgen — dat is onwaar en geeft geen vervolgstap. Dit is de regressietest daarop.
test("account zonder wachtwoord: eigen melding met vervolgstap, niet 'incorrect'", async () => {
  await renderServer(
    <Screen>
      <PasswordBlockNoPasswordYet />
    </Screen>,
  );
  await wachtOpHydratatie();
  await vulFormulierIn();
  await page.getByRole("button", { name: "Change password" }).click();

  await expect
    .element(
      page.getByText(
        "This account doesn't have a password yet — ask Brink for an activation code.",
      ),
    )
    .toBeInTheDocument();
  // De kern van deze fix: het woord "incorrect" mag hier nergens staan.
  expect(document.body.textContent).not.toContain("incorrect");

  const current = document.querySelector<HTMLInputElement>("#current-password");
  expect(current?.getAttribute("aria-invalid")).toBe("true");
  expect(current?.getAttribute("aria-describedby")).toBe(
    "current-password-error",
  );
});

test("wachtwoorden komen niet overeen: client-side melding, de server wordt niet aangeroepen", async () => {
  await renderServer(passwordScreen);
  await wachtOpHydratatie();
  await vulFormulierIn({
    nieuw: "een-heel-lang-nieuw-wachtwoord",
    bevestig: "iets-heel-anders-en-ook-lang",
  });
  await page.getByRole("button", { name: "Change password" }).click();

  await expect
    .element(page.getByText("Passwords don't match."))
    .toBeInTheDocument();
  // idle-stub (nooitAanroepen) gooit bij aanroep; de teller blijft dan op [] staan — was
  // hij aangeroepen, dan had de action gecrasht en had de mismatch-tekst niet gestaan.
  expect(window.__changePasswordCalls).toEqual([]);
});

test("te kort nieuw wachtwoord: client-side geweigerd vóór de aanroep", async () => {
  await renderServer(passwordScreen);
  await wachtOpHydratatie();
  await vulFormulierIn({ nieuw: "te-kort", bevestig: "te-kort" });
  await page.getByRole("button", { name: "Change password" }).click();

  await expect
    .element(page.getByText(`That password won't do — use ${MIN}–${MAX} characters.`))
    .toBeInTheDocument();
  expect(window.__changePasswordCalls).toEqual([]);
});

test("geslaagd: bevestiging zichtbaar, velden geleegd", async () => {
  await renderServer(
    <Screen>
      <PasswordBlockSuccess />
    </Screen>,
  );
  await wachtOpHydratatie();
  await vulFormulierIn();
  await page.getByRole("button", { name: "Change password" }).click();

  await expect.element(page.getByText("Password changed.")).toBeInTheDocument();
  const current = document.querySelector<HTMLInputElement>("#current-password");
  const next = document.querySelector<HTMLInputElement>("#new-password");
  expect(current?.value).toBe("");
  expect(next?.value).toBe("");
});

// Foutstaat in beeld: licht/donker × mobiel/desktop, ná de afwijzing.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`wachtwoordblok foutstaat (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(passwordErrorScreen);
      await wachtOpHydratatie();
      await vulFormulierIn();
      await page.getByRole("button", { name: "Change password" }).click();
      await expect
        .element(page.getByText("Current password is incorrect."))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./password-block-error.${theme}.${device}.test.png`,
      });
    });
  }
}
