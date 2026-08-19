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
//
// LoginChrome komt uit ./login-chrome.tsx — dezelfde component die app/login/page.tsx
// gebruikt, geen handkopie. Golf-2-critic ronde 1 ving een handkopie die al binnen één
// ronde uit de pas liep (de focus-ring-klassen van de echte summary ontbraken hier).
import { cdp, page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { LoginChrome } from "./login-chrome";
import {
  PasswordLoginFormGenericError,
  PasswordLoginFormIdle,
} from "./login-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

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

// Wachtwoord-reset (docs/goal-wachtwoord-reset.md, bouwstap 5): de weg ernaartoe begint
// hier, onder het wachtwoordveld. Zonder deze link bestaat de hele flow voor een
// gebruiker niet — dit pint vast dat hij er staat én waarheen hij wijst.
test("de 'Forgot password?'-link staat onder het wachtwoordveld en wijst naar /forgot-password", async () => {
  const { container } = await renderServer(idleScreen);
  await expect
    .element(page.getByRole("heading", { name: "Lumen Logic" }))
    .toBeInTheDocument();
  const link = Array.from(container.querySelectorAll("a")).find(
    (a) => a.textContent === "Forgot password?",
  );
  expect(link?.getAttribute("href")).toBe("/forgot-password");
  // Onder het wachtwoordveld: link en veld delen dezelfde veld-wrapper.
  const veld = container.querySelector("#login-password");
  expect(link?.parentElement).toBe(veld?.parentElement);
});

// De onthulling is een echt bedieningselement (≥44px, DESIGN.md §6/§7): dit meet de
// werkelijke hoogte van de <summary>, niet alleen dat hij "er is". Golf-2-critic ronde 1
// mat 20px op productie — dit is de regressietest daarop.
test("de summary-knop is minimaal 44px hoog (DESIGN.md §6/§7)", async () => {
  const { container } = await renderServer(idleScreen);
  // Wachten tot de RSC-stream écht geschilderd heeft — zonder deze wait is de container
  // soms nog leeg vlak na renderServer(), en querySelector("summary") geeft dan null.
  await expect
    .element(page.getByRole("heading", { name: "Lumen Logic" }))
    .toBeInTheDocument();
  const summary = container.querySelector("summary") as HTMLElement;
  const height = summary.getBoundingClientRect().height;
  expect(height).toBeGreaterThanOrEqual(44);
});

// De onthulling werkt écht: een klik (geen programmatische .open = true) klapt hem open
// en het e-mailveld van de magic link wordt bereikbaar. Native <details>-gedrag heeft geen
// React-hydratatie nodig, dus geen wachtOpHydratatie() hier — wel wachten tot de RSC-stream
// geschilderd heeft (zelfde reden als hierboven).
test("magic link wordt zichtbaar na een klik op de onthulling", async () => {
  const { container } = await renderServer(idleScreen);
  await expect
    .element(page.getByRole("heading", { name: "Lumen Logic" }))
    .toBeInTheDocument();
  const details = container.querySelector("details") as HTMLDetailsElement;
  expect(details.open).toBe(false);
  await page.getByText("Use a magic link instead").click();
  expect(details.open).toBe(true);
  await expect
    .element(page.getByLabelText("Email").nth(1))
    .toBeInTheDocument();
});

// Screenshots met het paneel open — vóór deze ronde was de magic-link-vorm zelf op geen
// enkele opname te zien.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`login met magic link open (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(idleScreen);
      await page.getByText("Use a magic link instead").click();
      await expect
        .element(page.getByRole("button", { name: "Send magic link" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./login-magic-link-open.${theme}.${device}.test.png`,
      });
    });
  }
}

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

// G32-bewijs, écht: niet alleen dat de knop "Send magic link" in de DOM staat, maar dat
// een klik daadwerkelijk Better Auth's eigen route raakt met de juiste body. Dit is de
// duurste fout die deze sprint kan maken (G32) en verdient een test die faalt zodra iemand
// het magic-link-pad breekt, ook als de DOM-structuur toevallig intact blijft.
//
// ⚠️ Onderschept op CDP-netwerkniveau (Network.requestWillBeSent), NIET via
// vi.spyOn(window, "fetch")/vi.stubGlobal("fetch", …). Aantoonbaar geprobeerd: de mock
// bleef via beide routes correct als window.fetch/globalThis.fetch staan (bevestigd met
// identity-checks vlak vóór en ná de klik), maar authClient.signIn.magicLink() riep hem
// nooit aan — de aanroep landt ergens buiten het JS-realm dat dit testbestand kan pat
// chen, ook al delen ze dezelfde DOM. CDP zit op browserprocesniveau, onder elk realm.
test("magic link doet écht een POST naar Better Auth: precies één aanroep, juiste body", async () => {
  const session = cdp();
  const requests: { url: string; postData?: string }[] = [];
  const onRequest = (params: {
    request: { url: string; postData?: string };
  }) => {
    if (params.request.url.includes("/sign-in/magic-link")) {
      requests.push({
        url: params.request.url,
        postData: params.request.postData,
      });
    }
  };
  await session.send("Network.enable");
  session.on("Network.requestWillBeSent", onRequest);

  try {
    await renderServer(idleScreen);
    await wachtOpHydratatie();
    await page.getByText("Use a magic link instead").click();
    await expect
      .element(page.getByRole("button", { name: "Send magic link" }))
      .toBeInTheDocument();
    await userEvent.type(
      page.getByLabelText("Email").nth(1),
      "timo@jouwainstein.com",
    );
    await page.getByRole("button", { name: "Send magic link" }).click();

    await vi.waitFor(
      () => {
        if (requests.length === 0) throw new Error("nog geen aanroep");
      },
      { timeout: 10_000, interval: 100 },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/api/auth/sign-in/magic-link");
    const body = JSON.parse(requests[0].postData ?? "{}");
    expect(body).toMatchObject({
      email: "timo@jouwainstein.com",
      callbackURL: "/projects",
    });
  } finally {
    session.off("Network.requestWillBeSent", onRequest);
  }
});
