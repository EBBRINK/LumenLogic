// White-box RSC-test van het PIN-blok (/admin/users, besluit G26). Licht/donker ×
// mobiel/desktop, plus gerichte asserts op wat de harde lat van sprint 3.1 vraagt: de PIN
// staat er voluit ná het aanmaken, de vervaldatum klopt, een gebruiker zónder verse PIN
// toont wél status maar NOOIT de code, en de "je ziet dit maar één keer"-waarschuwing staat
// er. Twee toestanden in de screenshots: het scherm mét een net aangemaakte PIN, en het
// scherm met een lijst gebruikers in verschillende PIN-statussen — exact wat de bouwopdracht
// vraagt. Zelfde patroon als components/settings/settings.test.tsx en
// components/dossier/pdf-upload.test.tsx (die laatste voor de reden achter de losse
// "use client"-stubs, zie pin-block-stubs.tsx).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { FIXED_EXPIRES_AT_ISO, FIXED_PIN } from "./pin-block-fixtures";
import {
  PinBlockLeeg,
  PinBlockMetFout,
  PinBlockMetSessieRedirect,
  PinBlockScreen,
} from "./pin-block-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Users</h1>
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── Toestand 1: lijst gebruikers in verschillende PIN-statussen ──────────────────
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`pin-blok: statuslijst (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <PinBlockScreen />
        </Screen>,
      );
      await expect.element(page.getByText("PIN status")).toBeInTheDocument();
      await page.screenshot({
        path: `./pin-block-status.${theme}.${device}.test.png`,
      });
    });
  }
}

test("statuslijst: elke toestand toont zijn label als tekst, NOOIT een 8-cijferige code", async () => {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("No PIN issued")).toBeInTheDocument();
  await expect
    .element(page.getByText("Active", { exact: true }))
    .toBeInTheDocument();
  // exact: true — anders matcht dit ook de losse regel "activated 15 Jul 2026, …"
  // die eronder staat (Playwright's tekst-matcher is standaard een substring-match).
  await expect
    .element(page.getByText("Activated", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Expired", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Locked (max attempts used)"))
    .toBeInTheDocument();
  // De statuslijst komt van getActivationPinStatus (draagt de hash niet eens mee) —
  // er staat dus per constructie geen enkele 8-cijferige reeks op het scherm.
  expect(document.body.textContent).not.toMatch(/\b\d{8}\b/);
});

test("een bestaande gebruiker zonder verse PIN toont status én resterende pogingen, maar geen code", async () => {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await expect
    .element(page.getByText("actief@voorbeeld.nl"))
    .toBeInTheDocument();
  // .first(): zowel de 'actief'- als de 'geblokkeerd'-rij tonen "… attempts left".
  await expect
    .element(page.getByText(/attempts left/).first())
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain(FIXED_PIN);
});

test("lege lijst toont een nette melding in plaats van een leeg gat", async () => {
  await renderServer(
    <Screen>
      <PinBlockLeeg />
    </Screen>,
  );
  await expect.element(page.getByText("No members yet.")).toBeInTheDocument();
});

// ── Toestand 2: het moment ná het aanmaken van een PIN ────────────────────────────
async function issueEnWacht() {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("nieuw@voorbeeld.nl");
  await page
    .getByRole("button", { name: "Create account & issue PIN" })
    .click();
  await expect
    .element(page.getByText("PIN for nieuw@voorbeeld.nl"))
    .toBeInTheDocument();
}

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`pin-blok: net aangemaakte PIN (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await issueEnWacht();
      await page.screenshot({
        path: `./pin-block-issued.${theme}.${device}.test.png`,
      });
    });
  }
}

test("net aangemaakte PIN: staat voluit, met vervaldatum en de eenmalige-waarschuwing", async () => {
  await issueEnWacht();
  // data-testid: de PIN staat zowel voluit in het weergavevak als (ingebed in de
  // begeleidende zin) in het mailsjabloon-textarea — een tekst-locator zonder scope
  // raakt dus meerdere elementen. Het weergavevak is de bron van waarheid hier.
  await expect
    .element(page.getByTestId("pin-value"))
    .toHaveTextContent(FIXED_PIN);
  await expect
    .element(page.getByText(/You can only see this once/))
    .toBeInTheDocument();
  // "Valid until" + jaartal: het exacte uur/dag hangt af van de tijdzone van de
  // testrunner (formatDateTime gebruikt geen vaste timeZone), dus alleen het jaartal
  // toetsen — de precieze notatie is een presentatiedetail, geen gedragscontract.
  await expect.element(page.getByText(/Valid until.*2026/)).toBeInTheDocument();
});

test("het mailsjabloon bevat de PIN en de vervaldatum, en heeft zijn eigen kopieerknop", async () => {
  await issueEnWacht();
  const template = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Email template for the user"]',
  );
  expect(template?.value).toContain(FIXED_PIN);
  expect(template?.value).toContain("Your Lumen Logic account is ready");
  await expect
    .element(page.getByRole("button", { name: "Copy email text" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Copy PIN" }))
    .toBeInTheDocument();
});

test("reissue vanaf de statuslijst toont dezelfde eenmalige PIN-weergave", async () => {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  // .first(): elke rij behalve 'geen' toont "Issue new PIN"; de eerste is de
  // 'actief'-rij (actief@voorbeeld.nl) — het gedrag is hetzelfde voor elke rij.
  await page
    .getByRole("button", { name: "Issue new PIN" })
    .first()
    .click();
  await expect
    .element(page.getByTestId("pin-value"))
    .toHaveTextContent(FIXED_PIN);
  await expect
    .element(page.getByText(/You can only see this once/))
    .toBeInTheDocument();
});

test("uitgifte-fout blijft zichtbaar op het scherm en toont geen PIN", async () => {
  await renderServer(
    <Screen>
      <PinBlockMetFout />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("fout@voorbeeld.nl");
  await page
    .getByRole("button", { name: "Create account & issue PIN" })
    .click();
  await expect
    .element(page.getByText("Testfout: uitgifte geweigerd."))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain(FIXED_PIN);
});

// Liegende-import-melding-klasse van bug (lib/next-action-result.ts): requireSession()
// redirect naar /login bij een verlopen sessie. Die rejection is geen fout — callAction()
// moet hem als 'signedOut' classificeren, niet als een generieke mislukking, en er mag
// nooit een PIN verschijnen omdat er niets is uitgegeven.
test("een verlopen sessie tijdens het uitgeven meldt zich eerlijk als 'signedOut', geen PIN getoond", async () => {
  await renderServer(
    <Screen>
      <PinBlockMetSessieRedirect />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("sessie@voorbeeld.nl");
  await page
    .getByRole("button", { name: "Create account & issue PIN" })
    .click();
  await expect
    .element(page.getByText(/session expired/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain(FIXED_PIN);
});

// Sanity op de fixture zelf: als de export ooit verandert zonder de assert-strings hierboven
// mee te wijzigen, valt dat hier meteen op in plaats van via een stille mismatch.
test("fixture-sanity: FIXED_EXPIRES_AT_ISO is de datum die de asserts hierboven verwachten", () => {
  expect(FIXED_EXPIRES_AT_ISO).toBe("2026-08-06T14:32:00.000Z");
});
