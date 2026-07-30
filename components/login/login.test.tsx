// White-box RSC-test van /login (sprint 3.1, golf 2): wachtwoord als hoofdpad naast de
// bestaande magic link (besluit G27/G32 — de magic link mag NIET weg, zie de correctie in
// G35 en docs/sprint3-1-briefing.md §5 punt 6). Licht/donker × mobiel/desktop, plus
// gerichte asserts: beide inlogpaden staan er, de afwijzing op het wachtwoordpad is
// generiek (geen account-enumeratie), en de foutmelding is gekoppeld via aria-describedby.
//
// De teststub-acties zitten in ./login-test-stubs.tsx (eigen "use client"-bestand, zie het
// commentaar daar): deze testfile draait server-side onder vitest-plugin-rsc en mag zelf
// géén kale functies als action-prop aan PasswordLoginForm meegeven — dat is precies wat de
// RSC-brug weigert ("Functions cannot be passed directly to Client Components").
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { MagicLinkForm } from "./magic-link-form";
import {
  PasswordLoginFormGenericError,
  PasswordLoginFormIdle,
} from "./login-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Zelfde omlijsting en schikking als app/login/page.tsx: wachtwoord open en eerst, de
// magic link achter een <details>-onthulling. `children` is gewone React-compositie (geen
// action-prop), dus dit stuit niet op de RSC-functiegrens.
function LoginChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spec, calculation and quotation tool — Brink Licht.
        </p>
      </div>
      {children}
      <details className="rounded-lg border border-foreground/10 px-3 py-2.5 text-sm">
        <summary className="cursor-pointer list-none font-medium text-brand-blue">
          Use a magic link instead
        </summary>
        <div className="mt-3">
          <MagicLinkForm />
        </div>
      </details>
    </main>
  );
}

const idleScreen = (
  <LoginChrome>
    <PasswordLoginFormIdle />
  </LoginChrome>
);

const errorScreen = (
  <LoginChrome>
    <PasswordLoginFormGenericError />
  </LoginChrome>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`login (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(idleScreen);
      await expect
        .element(page.getByRole("heading", { name: "Lumen Logic" }))
        .toBeInTheDocument();
      await page.screenshot({ path: `./login.${theme}.${device}.test.png` });
    });
  }
}

// G32-bewijs: het wachtwoordformulier (hoofdpad) én de magic link (secundair pad) staan
// allebei op het scherm — de magic link is niet verwijderd.
test("beide inlogpaden staan er: wachtwoord (hoofdpad) én magic link (secundair)", async () => {
  const { container } = await renderServer(idleScreen);
  // "Email" komt twee keer voor (het wachtwoordformulier én het email-veld van de
  // verborgen magic-link-vorm binnen de <details>) — .first() pakt het wachtwoordveld,
  // dat als eerste in de DOM staat.
  await expect
    .element(page.getByLabelText("Email").first())
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Password")).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Sign in" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Use a magic link instead"))
    .toBeInTheDocument();
  // De magic-link-knop staat in de DOM (binnen de <details>), ook al is het paneel
  // standaard dicht — de existentie is het bewijs dat het pad niet weg is.
  const magicLinkButton = Array.from(
    container.querySelectorAll("button"),
  ).find((b) => b.textContent === "Send magic link");
  expect(magicLinkButton).toBeTruthy();
  // Het wachtwoordpad is het hoofdpad: primaire knop-variant (default), niet outline.
  const signInButton = page.getByRole("button", { name: "Sign in" }).query();
  expect(signInButton?.getAttribute("data-variant")).toBe("default");
  // De magic-link-knop is secundair (kit §6 outline-variant).
  expect(magicLinkButton?.getAttribute("data-variant")).toBe("outline");
});

// De onthulling werkt: na het openklappen is het e-mailveld van de magic link bereikbaar.
test("magic link wordt zichtbaar na het openklappen van de onthulling", async () => {
  const { container } = await renderServer(idleScreen);
  await expect
    .element(page.getByRole("heading", { name: "Lumen Logic" }))
    .toBeInTheDocument();
  const details = container.querySelector("details") as HTMLDetailsElement;
  expect(details.open).toBe(false);
  details.open = true;
  await expect
    .element(page.getByLabelText("Email").nth(1))
    .toBeInTheDocument();
});

// Hydration-wachtlus (zelfde patroon als components/dossier/pdf-upload.test.tsx en
// components/activate/activate.test.tsx): vóór hydratatie zou een klik op "Sign in" een
// native GET-submit doen die de testpagina wegnavigeert.
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

test("verkeerde inloggegevens: generieke afwijzing, gekoppeld via aria-describedby, geen account-enumeratie", async () => {
  await renderServer(errorScreen);
  await wachtOpHydratatie();
  await userEvent.type(page.getByLabelText("Email").first(), "onbekend@brink.nl");
  await userEvent.type(page.getByLabelText("Password"), "iets-verkeerds");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect
    .element(page.getByText("Invalid email or password."))
    .toBeInTheDocument();

  // Kern van de non-enumeratie-eis: geen woord dat verraadt WAT er precies mis was
  // (onbekend adres, verkeerd wachtwoord, nog geen wachtwoord gezet) — één melding.
  for (const verboden of [
    /unknown/i,
    /no account/i,
    /does not exist/i,
    /no password/i,
    /not activated/i,
  ]) {
    expect(document.body.textContent).not.toMatch(verboden);
  }

  const emailInput = document.querySelector<HTMLInputElement>("#login-email");
  const passwordInput =
    document.querySelector<HTMLInputElement>("#login-password");
  expect(emailInput?.getAttribute("aria-invalid")).toBe("true");
  expect(passwordInput?.getAttribute("aria-invalid")).toBe("true");
  expect(emailInput?.getAttribute("aria-describedby")).toBe("login-error");
  expect(passwordInput?.getAttribute("aria-describedby")).toBe("login-error");
  // De stub-actie (in login-test-stubs.tsx) telt zijn aanroepen via een window-teller:
  // module-exports komen door de RSC-testbrug als client-referentie aan, niet als de
  // vi.fn()-waarde zelf, dus een gewone toHaveBeenCalledWith kan hier niet.
  expect(window.__signInCalls).toEqual([
    { email: "onbekend@brink.nl", password: "iets-verkeerds" },
  ]);
});

// Foutstaat in beeld: licht/donker × mobiel/desktop, ná de afwijzing.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`login foutstaat (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(errorScreen);
      await wachtOpHydratatie();
      await userEvent.type(page.getByLabelText("Email").first(), "onbekend@brink.nl");
      await userEvent.type(page.getByLabelText("Password"), "iets-verkeerds");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect
        .element(page.getByText("Invalid email or password."))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./login-error.${theme}.${device}.test.png`,
      });
    });
  }
}
