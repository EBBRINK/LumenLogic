// White-box RSC-test van /activate: het scherm waar de meeste externe gebruikers Lumen
// Logic voor het eerst zien (PIN → wachtwoord, sprint 3.1). Licht/donker × mobiel/desktop,
// plus gerichte asserts op de kwaliteitslat uit sprint3-1-briefing.md §3a/§3b: acht
// invoervakjes in twee groepen van vier, de foutstaat via aria-invalid ÉN op het echte
// invoerelement (niet alleen de presentatie-divs), en dat de generieke afwijzing ("invalid")
// altijd dezelfde tekst toont — dat is precies wat account-enumeratie voorkomt (het scherm
// mag nooit verraden of een e-mailadres bestaat).
//
// De testacties zelf staan in ./activate-test-stubs.tsx (een "use client"-bestand): de
// vitest-RSC-testbrug staat geen kale functies toe die van dit (server-)testbestand naar de
// "use client" ActivateForm oversteken — alleen echte server-referenties ("use server") of
// functies die al binnen een client-module zijn gedefinieerd. Zie de uitleg bovenaan dat
// bestand en components/dossier/pdf-upload-test-stubs.tsx voor hetzelfde patroon.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-factory";
import { PIN_LENGTH } from "@/lib/repo/activation";
import {
  ActivateFormIdle,
  ActivateFormInvalid,
  ActivateFormMismatchCheck,
  ActivateFormWeakPassword,
} from "./activate-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const sizes = {
  pinLength: PIN_LENGTH,
  minPasswordLength: MIN_PASSWORD_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
};

// Zelfde omlijsting als app/activate/page.tsx: gecentreerde kolom, max-w-lg (de 8-cijferige
// InputOTP in twee groepen van vier past niet binnen max-w-sm — zie de toelichting daar).
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <main className="flex w-full max-w-lg flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activate your account with the code Brink emailed you.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Hydration-wachtlus (zelfde patroon als components/dossier/pdf-upload.test.tsx): vóór
// hydratatie zou een klik op "Activate account" een native GET-submit doen die de
// testpagina wegnavigeert. We wachten tot React zijn props aan het formulier heeft
// gehangen en interacteren pas daarna.
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

async function vulFormulierIn(opts?: { pin?: string; wachtwoord?: string }) {
  const pin = opts?.pin ?? "12345678";
  const wachtwoord = opts?.wachtwoord ?? "een-heel-lang-wachtwoord";
  await userEvent.type(
    page.getByLabelText("Email address"),
    "onbekend@voorbeeld.nl",
  );
  await userEvent.type(page.getByLabelText("Activation code"), pin);
  await userEvent.type(page.getByLabelText("New password"), wachtwoord);
  await userEvent.type(page.getByLabelText("Confirm password"), wachtwoord);
}

// ── Screenshots: rusttoestand ────────────────────────────────────────────────
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`activate (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <ActivateFormIdle {...sizes} />
        </Screen>,
      );
      await expect
        .element(page.getByText("Activate your account", { exact: true }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./activate.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── Screenshots: foutstaten (ronde-1-bevinding van de critic: deze waren nooit met het
// oog beoordeeld, terwijl dit de staat is die een gebruiker het vaakst ziet) ────────────
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`activate PIN-fout (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <ActivateFormInvalid {...sizes} />
        </Screen>,
      );
      await wachtOpHydratatie();
      await vulFormulierIn();
      await page.getByRole("button", { name: "Activate account" }).click();
      await expect
        .element(page.getByText(/This code doesn't work/))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./activate-pin-error.${theme}.${device}.test.png`,
      });
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`activate zwak wachtwoord (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <ActivateFormWeakPassword {...sizes} />
        </Screen>,
      );
      await wachtOpHydratatie();
      await vulFormulierIn({ wachtwoord: "twaalf-tekens" });
      await page.getByRole("button", { name: "Activate account" }).click();
      await expect
        .element(page.getByText(/That password won't do/))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./activate-weak-password.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── Structuur- en gedragstests ───────────────────────────────────────────────

test("acht invoervakjes voor de PIN, in twee groepen van vier", async () => {
  const { container } = await renderServer(
    <Screen>
      <ActivateFormIdle {...sizes} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Activate your account", { exact: true }))
    .toBeInTheDocument();
  const slots = container.querySelectorAll('[data-slot="input-otp-slot"]');
  expect(slots.length).toBe(8);
  const groups = container.querySelectorAll('[data-slot="input-otp-group"]');
  expect(groups.length).toBe(2);
  expect(
    groups[0].querySelectorAll('[data-slot="input-otp-slot"]').length,
  ).toBe(4);
  expect(
    groups[1].querySelectorAll('[data-slot="input-otp-slot"]').length,
  ).toBe(4);
  // Geen enkel vakje begint fout gemarkeerd, en het echte invoerelement (waar
  // hulpsoftware naar kijkt) evenmin.
  for (const slot of slots) {
    expect(slot.getAttribute("aria-invalid")).toBe("false");
  }
  const otpInput = document.querySelector<HTMLInputElement>("#activate-pin");
  expect(otpInput?.getAttribute("aria-invalid")).toBe("false");
  // De stub is nooit aangeroepen — er is niet op "Activate account" geklikt.
  expect(window.__activateCalls).toBe(0);
});

test("PIN-fout: generieke afwijzing, aria-invalid op het ÉCHTE invoerelement, geen reden die het adres verraadt", async () => {
  const { container } = await renderServer(
    <Screen>
      <ActivateFormInvalid {...sizes} />
    </Screen>,
  );
  await wachtOpHydratatie();
  await vulFormulierIn();
  await page.getByRole("button", { name: "Activate account" }).click();

  await expect
    .element(page.getByText(/This code doesn't work/))
    .toBeInTheDocument();

  // Kern van de non-enumeratie-eis (§3a): geen woord dat verraadt WAT er precies mis was
  // (onbekend adres, verlopen, al gebruikt, geblokkeerd) — één melding voor alles.
  for (const verboden of [
    /unknown/i,
    /no account/i,
    /does not exist/i,
    /expired/i,
    /already used/i,
    /too many attempts/i,
    /blocked/i,
  ]) {
    expect(document.body.textContent).not.toMatch(verboden);
  }

  // ⚠️ Het ÉCHTE invoerelement, niet de presentatie-divs: InputOTPSlot is een <div> zonder
  // rol, dat ziet hulpsoftware niet. Vóór deze fix (critic, ronde 1) stond aria-invalid
  // alleen op de acht slot-divs en bleef #activate-pin zelf op aria-invalid: null — voor
  // een schermlezer was het veld dus nooit afgekeurd. Dit is de doorslaggevende assert.
  const otpInput = document.querySelector<HTMLInputElement>("#activate-pin");
  expect(otpInput?.getAttribute("aria-invalid")).toBe("true");
  expect(otpInput?.getAttribute("aria-describedby")).toBe(
    "activate-pin-error",
  );

  // De visuele foutstaat op de acht vakjes blijft ook gedekt (dat werkte al, en blijft
  // werken — dit is geen vervanging van de assert hierboven, een aanvulling).
  const slots = container.querySelectorAll('[data-slot="input-otp-slot"]');
  expect(slots.length).toBe(8);
  for (const slot of slots) {
    expect(slot.getAttribute("aria-invalid")).toBe("true");
  }
  expect(window.__activateCalls).toBe(1);
});

test("onvolledige code: client-side melding, geen serveraanroep, ander id dan de PIN-afwijzing", async () => {
  await renderServer(
    <Screen>
      <ActivateFormInvalid {...sizes} />
    </Screen>,
  );
  await wachtOpHydratatie();
  await userEvent.type(
    page.getByLabelText("Email address"),
    "onbekend@voorbeeld.nl",
  );
  // Maar drie van de acht cijfers — geen volledige code.
  await userEvent.type(page.getByLabelText("Activation code"), "123");
  await userEvent.type(
    page.getByLabelText("New password"),
    "een-heel-lang-wachtwoord",
  );
  await userEvent.type(
    page.getByLabelText("Confirm password"),
    "een-heel-lang-wachtwoord",
  );
  await page.getByRole("button", { name: "Activate account" }).click();

  await expect
    .element(page.getByText(`Enter all ${PIN_LENGTH} digits.`))
    .toBeInTheDocument();
  // Geen woord van de échte (server-)afwijzing — dit ging nooit naar de server.
  expect(document.body.textContent).not.toContain("This code doesn't work");
  const otpInput = document.querySelector<HTMLInputElement>("#activate-pin");
  expect(otpInput?.getAttribute("aria-invalid")).toBe("true");
  expect(otpInput?.getAttribute("aria-describedby")).toBe(
    "activate-pin-incomplete",
  );
  // De stub (die reason:"invalid" zou teruggeven) is niet aangeroepen.
  expect(window.__activateCalls).toBe(0);
});

test("zwak wachtwoord: eigen alert bij het wachtwoordveld, andere tekst dan de PIN-afwijzing, nooit alleen kleur", async () => {
  await renderServer(
    <Screen>
      <ActivateFormWeakPassword {...sizes} />
    </Screen>,
  );
  await wachtOpHydratatie();
  await vulFormulierIn({ wachtwoord: "twaalf-tekens" });
  await page.getByRole("button", { name: "Activate account" }).click();

  await expect
    .element(page.getByText(/That password won't do/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("This code doesn't work");

  const passwordInput = document.querySelector<HTMLInputElement>(
    "#activate-password",
  );
  expect(passwordInput?.getAttribute("aria-invalid")).toBe("true");
  // aria-describedby wijst nu naar de FOUTPARAGRAAF (niet meer naar de altijd-aanwezige
  // hint die alleen van tekst/kleur wisselde) — die nieuwe paragraaf heeft role="alert",
  // dus een schermlezer krijgt hem daadwerkelijk aangekondigd.
  expect(passwordInput?.getAttribute("aria-describedby")).toBe(
    "activate-password-error",
  );
  const errorEl = document.querySelector("#activate-password-error");
  expect(errorEl).not.toBeNull();
  expect(errorEl?.getAttribute("role")).toBe("alert");
  // De neutrale hint blijft ernaast bestaan (was voorheen dezelfde paragraaf) — er zijn nu
  // dus twee zinnen, niet één die alleen van kleur wisselt.
  expect(document.body.textContent).toContain(
    "characters — no other rules.",
  );
  // De PIN-vakjes blijven ongemoeid — dit ging over het wachtwoord, niet over de PIN.
  const slots = document.querySelectorAll('[data-slot="input-otp-slot"]');
  for (const slot of slots) {
    expect(slot.getAttribute("aria-invalid")).toBe("false");
  }
  const otpInput = document.querySelector<HTMLInputElement>("#activate-pin");
  expect(otpInput?.getAttribute("aria-invalid")).toBe("false");
});

test("wachtwoorden komen niet overeen: client-side melding, de server wordt niet aangeroepen", async () => {
  await renderServer(
    <Screen>
      <ActivateFormMismatchCheck {...sizes} />
    </Screen>,
  );
  await wachtOpHydratatie();
  await userEvent.type(
    page.getByLabelText("Email address"),
    "onbekend@voorbeeld.nl",
  );
  await userEvent.type(page.getByLabelText("Activation code"), "12345678");
  await userEvent.type(
    page.getByLabelText("New password"),
    "een-heel-lang-wachtwoord",
  );
  await userEvent.type(
    page.getByLabelText("Confirm password"),
    "iets-anders-heel-lang",
  );
  await page.getByRole("button", { name: "Activate account" }).click();

  await expect
    .element(page.getByText("Passwords don't match."))
    .toBeInTheDocument();
  expect(window.__activateCalls).toBe(0);
});
