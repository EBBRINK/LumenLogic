// White-box RSC-test van /forgot-password (docs/goal-wachtwoord-reset.md, bouwstap 6).
// Licht/donker × mobiel/desktop, plus gerichte asserts: de sent-melding is neutraal en
// verschijnt ALTIJD — ook bij een crashende action — want elk verschil in respons is een
// kanaal voor account-enumeratie.
//
// De teststub-acties zitten in ./forgot-password-test-stubs.tsx (eigen "use client"-
// bestand, zie het commentaar daar): deze testfile draait server-side onder
// vitest-plugin-rsc en mag zelf géén kale functies als action-prop meegeven.
//
// LoginChrome komt uit components/login/login-chrome.tsx — dezelfde component die
// app/forgot-password/page.tsx gebruikt, geen handkopie (zelfde les als login.test.tsx).
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { LoginChrome } from "@/components/login/login-chrome";
import {
  ForgotPasswordFormCrash,
  ForgotPasswordFormIdle,
  ForgotPasswordFormOk,
} from "./forgot-password-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const idleScreen = (
  <LoginChrome>
    <ForgotPasswordFormIdle />
  </LoginChrome>
);

const okScreen = (
  <LoginChrome>
    <ForgotPasswordFormOk />
  </LoginChrome>
);

const crashScreen = (
  <LoginChrome>
    <ForgotPasswordFormCrash />
  </LoginChrome>
);

const SENT_TEKST = "a reset link has been sent";

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Hydration-wachtlus (zelfde patroon als login.test.tsx): vóór hydratatie zou een klik
// een native GET-submit doen die de testpagina wegnavigeert.
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
    test(`forgot-password (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(idleScreen);
      await expect
        .element(page.getByRole("heading", { name: "Lumen Logic" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./forgot-password.${theme}.${device}.test.png`,
      });
    });
  }
}

test("structuur: e-mailveld en één primaire verzendknop", async () => {
  await renderServer(idleScreen);
  await expect
    .element(page.getByLabelText("Email").first())
    .toBeInTheDocument();
  const knop = page.getByRole("button", { name: "Send reset link" }).query();
  expect(knop?.getAttribute("data-variant")).toBe("default");
});

test("na verzenden: de neutrale sent-melding, zonder enumeratie-lek", async () => {
  await renderServer(okScreen);
  await wachtOpHydratatie();
  await userEvent.type(
    page.getByLabelText("Email").first(),
    "onbekend@brink.nl",
  );
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect.element(page.getByText(SENT_TEKST)).toBeInTheDocument();
  // role="status": de melding wordt door hulpsoftware aangekondigd zonder alert-lawaai.
  expect(document.querySelector("#forgot-sent")?.getAttribute("role")).toBe(
    "status",
  );

  // Kern van de anti-enumeratie-eis: geen woord dat verraadt of het adres bestaat.
  for (const verboden of [
    /unknown/i,
    /no account/i,
    /does not exist/i,
    /not found/i,
    /invalid email/i,
  ]) {
    expect(document.body.textContent).not.toMatch(verboden);
  }
  expect(window.__forgotCalls).toEqual(["onbekend@brink.nl"]);
});

test("ook een crashende action eindigt in exact dezelfde sent-melding", async () => {
  // Een netwerkfout of 500 anders tonen dan succes zou een tweede kanaal zijn om iets
  // over een adres af te leiden — de neutrale melding is dus onvoorwaardelijk.
  await renderServer(crashScreen);
  await wachtOpHydratatie();
  await userEvent.type(page.getByLabelText("Email").first(), "wie@dan.ook");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect.element(page.getByText(SENT_TEKST)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/went wrong|error|failed/i);
});

// Sent-staat in beeld: licht/donker × mobiel/desktop, ná het verzenden.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`forgot-password sent (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(okScreen);
      await wachtOpHydratatie();
      await userEvent.type(
        page.getByLabelText("Email").first(),
        "iemand@brink.nl",
      );
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect.element(page.getByText(SENT_TEKST)).toBeInTheDocument();
      await page.screenshot({
        path: `./forgot-password-sent.${theme}.${device}.test.png`,
      });
    });
  }
}
