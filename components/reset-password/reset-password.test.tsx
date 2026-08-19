// White-box RSC-test van /reset-password (docs/goal-wachtwoord-reset.md, bouwstap 6).
// Licht/donker × mobiel/desktop, plus gerichte asserts: het wachtwoordbeleid (12–128) is
// zichtbaar, de INVALID_TOKEN-weigerstand is generiek, en de foutmeldingen zijn via
// aria-describedby aan hun veld gekoppeld.
//
// De teststub-acties zitten in ./reset-password-test-stubs.tsx (eigen "use client"-
// bestand): deze testfile draait server-side onder vitest-plugin-rsc en mag zelf géén
// kale functies als action-prop meegeven. InvalidResetLink en LoginChrome zijn exact de
// componenten die app/reset-password/page.tsx rendert — geen handkopie.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-factory";
import { LoginChrome } from "@/components/login/login-chrome";
import { InvalidResetLink } from "./invalid-reset-link";
import {
  ResetPasswordFormIdle,
  ResetPasswordFormTokenfout,
} from "./reset-password-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const sizes = {
  minPasswordLength: MIN_PASSWORD_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
};

const idleScreen = (
  <LoginChrome>
    <ResetPasswordFormIdle {...sizes} />
  </LoginChrome>
);

const tokenfoutScreen = (
  <LoginChrome>
    <ResetPasswordFormTokenfout {...sizes} />
  </LoginChrome>
);

// Wat de pagina rendert bij ?error=INVALID_TOKEN of een ontbrekend token — zie de
// vertakking in app/reset-password/page.tsx.
const invalidLinkScreen = (
  <LoginChrome>
    <InvalidResetLink />
  </LoginChrome>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

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

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`reset-password (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(idleScreen);
      await expect
        .element(page.getByRole("heading", { name: "Lumen Logic" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./reset-password.${theme}.${device}.test.png`,
      });
    });
  }
}

test("het wachtwoordbeleid (12–128) staat zichtbaar bij het veld, gekoppeld via aria-describedby", async () => {
  await renderServer(idleScreen);
  await expect
    .element(
      page.getByText(
        `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters — no other rules.`,
      ),
    )
    .toBeInTheDocument();
  const veld = document.querySelector<HTMLInputElement>("#reset-password");
  expect(veld?.getAttribute("aria-describedby")).toBe("reset-password-hint");
  // Beide wachtwoordvelden zijn er, plus één primaire knop en het meereizende token.
  await expect.element(page.getByLabelText("New password")).toBeInTheDocument();
  await expect
    .element(page.getByLabelText("Confirm password"))
    .toBeInTheDocument();
  const knop = page.getByRole("button", { name: "Set new password" }).query();
  expect(knop?.getAttribute("data-variant")).toBe("default");
  const token = document.querySelector<HTMLInputElement>('input[name="token"]');
  expect(token?.value).toBe("test-token");
});

test("tokenfout: één generieke melding, aria-gekoppeld, met de weg naar een nieuwe link", async () => {
  await renderServer(tokenfoutScreen);
  await wachtOpHydratatie();
  await userEvent.type(page.getByLabelText("New password"), "twaalftekens!");
  await userEvent.type(page.getByLabelText("Confirm password"), "twaalftekens!");
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect
    .element(page.getByText("This reset link is invalid or has expired"))
    .toBeInTheDocument();
  // Generiek: geen woord dat verraadt WAT er mis was (verlopen vs. hergebruikt vs.
  // nooit bestaan) — de INVALID_TOKEN-weergave is één en dezelfde tekst.
  for (const verboden of [/expired token/i, /already used/i, /reused/i, /unknown/i]) {
    expect(document.body.textContent).not.toMatch(verboden);
  }
  const veld = document.querySelector<HTMLInputElement>("#reset-password");
  expect(veld?.getAttribute("aria-invalid")).toBe("true");
  expect(veld?.getAttribute("aria-describedby")).toBe("reset-rejected");
  // De uitweg staat erbij: opnieuw aanvragen.
  const link = document.querySelector<HTMLAnchorElement>(
    '#reset-rejected a[href="/forgot-password"]',
  );
  expect(link).toBeTruthy();
  expect(window.__resetCalls).toEqual([
    { token: "test-token", newPassword: "twaalftekens!" },
  ]);
});

test("te kort wachtwoord: client-afwijzing mét aria-koppeling, zonder serveraanroep", async () => {
  await renderServer(idleScreen);
  await wachtOpHydratatie();
  await userEvent.type(page.getByLabelText("New password"), "kort");
  await userEvent.type(page.getByLabelText("Confirm password"), "kort");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect
    .element(page.getByText(/That password won(')?t do/))
    .toBeInTheDocument();
  const veld = document.querySelector<HTMLInputElement>("#reset-password");
  expect(veld?.getAttribute("aria-invalid")).toBe("true");
  expect(veld?.getAttribute("aria-describedby")).toBe("reset-password-error");
  // De Idle-stub gooit bij élke aanroep — dat de test hier komt, bewijst al dat er geen
  // serveraanroep was; de teller maakt het expliciet.
  expect(window.__resetCalls).toEqual([]);
});

test("niet-gelijke wachtwoorden: client-afwijzing op het confirm-veld", async () => {
  await renderServer(idleScreen);
  await wachtOpHydratatie();
  await userEvent.type(page.getByLabelText("New password"), "twaalftekens!");
  await userEvent.type(page.getByLabelText("Confirm password"), "dertientekens!!");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect
    .element(page.getByText(/Passwords don(')?t match/))
    .toBeInTheDocument();
  const veld = document.querySelector<HTMLInputElement>(
    "#reset-confirm-password",
  );
  expect(veld?.getAttribute("aria-invalid")).toBe("true");
  expect(veld?.getAttribute("aria-describedby")).toBe("reset-confirm-error");
  expect(window.__resetCalls).toEqual([]);
});

// De weigerstand van de pagina (?error=INVALID_TOKEN of geen token): generieke tekst en
// de link naar /forgot-password — plus de vier screenshots.
test("INVALID_TOKEN-weergave: generieke weigerstand met de weg naar een nieuwe link", async () => {
  const { container } = await renderServer(invalidLinkScreen);
  await expect
    .element(page.getByText("This reset link is invalid or has expired."))
    .toBeInTheDocument();
  // Er staat géén wachtwoordformulier: de weigerstand vervangt het, niet ernaast.
  expect(container.querySelector("#reset-password")).toBeNull();
  const link = Array.from(container.querySelectorAll("a")).find(
    (a) => a.getAttribute("href") === "/forgot-password",
  );
  expect(link?.textContent).toContain("Request a new one");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`reset-password ongeldige link (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(invalidLinkScreen);
      await expect
        .element(page.getByText("This reset link is invalid or has expired."))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./reset-password-invalid.${theme}.${device}.test.png`,
      });
    });
  }
}
