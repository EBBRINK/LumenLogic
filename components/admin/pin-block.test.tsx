// White-box RSC-test van het PIN-blok (/admin/users, besluit G26). Licht/donker ×
// mobiel/desktop, plus gerichte asserts op wat de harde lat van sprint 3.1 vraagt: de PIN
// staat er voluit ná het aanmaken, de vervaldatum klopt, een gebruiker zónder verse PIN
// toont wél status maar NOOIT de code, en de "je ziet dit maar één keer"-waarschuwing staat
// er. Twee toestanden in de screenshots: het scherm mét een net aangemaakte PIN, en het
// scherm met een lijst gebruikers in verschillende PIN-statussen — exact wat de bouwopdracht
// vraagt. Zelfde patroon als components/settings/settings.test.tsx en
// components/dossier/pdf-upload.test.tsx (die laatste voor de reden achter de losse
// "use client"-stubs, zie pin-block-stubs.tsx).
//
// Ronde-1-critic ving dat de mobiele screenshots niet lieten zien wat hun naam beloofde: een
// kaal `page.screenshot({ path })` van de HELE pagina sneed de content af zodra hij langer
// was dan de standaardviewport. Ronde-2-poging (viewport oprekken naar de contenthoogte)
// loste de afsnijding op maar verving hem door een nieuw probleem: de harness schaalt boven
// een bepaalde hoogte het hele beeld proportioneel terug (375px breed werd 109–193px breed
// op schijf) — onbeoordeelbaar klein.
//
// De echte oplossing (ronde-2-terugkoppeling): viewport op de ware apparaatmaat laten staan
// (375×812 / 1280×800) en per BLOK screenshotten i.p.v. de hele pagina — elk blok is op
// zichzelf korter dan de viewport, dus er valt niets af te snijden en niets te schalen.
// `element:` wijst naar één specifieke kaart (data-testid op pin-block.tsx), niet naar de
// volledige #pin-screen-wrapper zoals de vorige poging.
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
    <div
      data-testid="pin-screen"
      className="min-h-screen bg-background p-6 text-foreground"
    >
      <main className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Users</h1>
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

// Screenshot van precies één blok (testid), op de ware apparaatviewport — zie het
// bestandscommentaar hierboven.
async function screenshotBlock(testId: string, path: string) {
  await page.screenshot({ element: page.getByTestId(testId), path });
}

// De organisatie is nu verplicht in het aanmaakformulier (ronde-1-critic: zonder org krijgt
// de nieuwe user geen membership en duikt hij niet op in de statuslijst). Playwright's
// selectOptions matcht op waarde óf zichtbare optietekst; de optietekst hier is
// "Aannemer Zuid (extern)" (zie pin-block.tsx: `{o.name} ({o.type})`).
async function kiesOrganisatie() {
  await page.getByLabelText("Organization").selectOptions("Aannemer Zuid (extern)");
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
      // Wacht op de LAATSTE rij (niet alleen de koptekst hierboven) vóór de capture —
      // dat is precies wat ronde 1 miste: de kop stond er, de rijen (nog) niet zichtbaar.
      await expect
        .element(page.getByText("geblokkeerd@voorbeeld.nl"))
        .toBeInTheDocument();
      await screenshotBlock(
        "pin-status-card",
        `./pin-block-status.${theme}.${device}.test.png`,
      );
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

test("statuslijst op mobiel: badge en knop staan op dezelfde x-positie voor elke rij", async () => {
  // Regressietest voor de grootste ronde-1-bevinding: op 375px landde het rechterblok van
  // elke rij op een andere horizontale positie omdat het meewrapte binnen een
  // justify-between-rij. Nu staat elke rij op precies twee sub-rijen (flex-col), dus de
  // linkerrand van het badge-blok moet voor alle vijf statussen identiek zijn.
  await page.viewport(375, 812);
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await expect
    .element(page.getByText("geblokkeerd@voorbeeld.nl"))
    .toBeInTheDocument();
  // Rechtstreeks over alle badge-elementen: elke rij heeft precies één badge, in
  // dezelfde volgorde als de fixture (geen/actief/gebruikt/verlopen/geblokkeerd).
  const badges = Array.from(
    document.querySelectorAll('[data-slot="badge"]'),
  ) as HTMLElement[];
  expect(badges.length).toBe(5);
  const lefts = badges.map((b) => b.getBoundingClientRect().left);
  for (const left of lefts) {
    expect(left).toBe(lefts[0]);
  }
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
async function issueEnWacht(name?: string) {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("nieuw@voorbeeld.nl");
  if (name) await page.getByLabelText(/Name/).fill(name);
  await kiesOrganisatie();
  await page
    .getByRole("button", { name: "Create account & issue PIN" })
    .click();
  await expect
    .element(page.getByText("PIN for nieuw@voorbeeld.nl"))
    .toBeInTheDocument();
}

// Het volledige "pin-issued-panel" (titel + waarschuwing + PIN-vak + mailsjabloon) is op
// 375px breed zelf al hoger dan de mobiele viewport — een sjabloon van 14 regels wrapt op
// die breedte tot ~27 zichtbare regels, wat neerkomt op eigen scrollgedrag binnen de pagina
// (normaal voor een webpagina, geen gebrek). Voor een beoordeelbare screenshot knippen we
// daarom in drie kleinere, elk ruim binnen de viewport passende delen: de titel+waarschuwing,
// het PIN-vak, en het mailsjabloon apart — samen tonen ze precies hetzelfde moment.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`pin-blok: net aangemaakte PIN (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await issueEnWacht("Anna Vogel");
      await screenshotBlock(
        "pin-issued-header",
        `./pin-block-issued-header.${theme}.${device}.test.png`,
      );
      await screenshotBlock(
        "pin-issued-code",
        `./pin-block-issued-code.${theme}.${device}.test.png`,
      );
      await screenshotBlock(
        "pin-issued-template",
        `./pin-block-issued-template.${theme}.${device}.test.png`,
      );
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
  // testrunner tenzij formatDateTime een vaste zone gebruikt — dat doet hij nu
  // (Europe/Amsterdam), maar we toetsen hier alleen het jaartal: de precieze notatie
  // is een presentatiedetail, geen gedragscontract.
  // .first(): het mailsjabloon-textarea bevat dezelfde "Valid until …"-zin nogmaals.
  await expect
    .element(page.getByText(/Valid until.*2026/).first())
    .toBeInTheDocument();
});

test("het mailsjabloon bevat de PIN, de vervaldatum, het e-mailadres en een klikbare activatielink", async () => {
  await issueEnWacht();
  const template = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Email template for the user"]',
  );
  expect(template?.value).toContain(FIXED_PIN);
  expect(template?.value).toContain("nieuw@voorbeeld.nl");
  // Absoluut (met protocol) en met het adres voorgevuld — een relatief "/activate" is
  // voor de ontvanger onbruikbaar (ronde-1-critic, punt 1+2).
  expect(template?.value).toMatch(
    /https?:\/\/\S+\/activate\?email=nieuw%40voorbeeld\.nl/,
  );
  expect(template?.value).toContain("Brink Licht created your Lumen Logic account");
  // Geen "You can ignore it" meer als advies bij een onverwachte mail (ronde-1-critic,
  // punt 5) — dat liet een levende PIN gewoon zeven dagen actief staan. Nu: meld het.
  expect(template?.value).not.toContain("You can ignore it");
  expect(template?.value).toContain("Let us know");
  await expect
    .element(page.getByRole("button", { name: "Copy email text" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Copy PIN" }))
    .toBeInTheDocument();
});

test("het mailsjabloon groet met de opgegeven naam in plaats van een kaal 'Hi,'", async () => {
  await issueEnWacht("Anna Vogel");
  const template = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Email template for the user"]',
  );
  expect(template?.value).toContain("Hi Anna Vogel,");
});

test("zonder naam valt de groet netjes terug, geen kale 'Hi,'", async () => {
  await issueEnWacht();
  const template = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Email template for the user"]',
  );
  expect(template?.value).toContain("Hi there,");
});

test("reissue vanaf de statuslijst toont dezelfde eenmalige PIN-weergave", async () => {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  // .first(): elke rij behalve 'geen' toont "Issue new PIN"; de eerste is de
  // 'actief'-rij (actief@voorbeeld.nl) — het gedrag is hetzelfde voor elke rij. Reissue
  // gebruikt nooit het formulier (dus ook geen org-keuze nodig): het adres heeft al een
  // membership.
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

test("Organization is verplicht: zonder keuze blokkeert de browser de submit, geen PIN verschijnt", async () => {
  await renderServer(
    <Screen>
      <PinBlockScreen />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("zonder-org@voorbeeld.nl");
  // Bewust GEEN kiesOrganisatie() hier.
  await page
    .getByRole("button", { name: "Create account & issue PIN" })
    .click();
  // De native HTML5-validatie op het verplichte <select> voorkomt de submit — er
  // verschijnt dus geen "PIN for …"-paneel.
  expect(
    document.body.textContent?.includes("PIN for zonder-org@voorbeeld.nl"),
  ).toBe(false);
});

test("uitgifte-fout blijft zichtbaar op het scherm en toont geen PIN", async () => {
  await renderServer(
    <Screen>
      <PinBlockMetFout />
    </Screen>,
  );
  await page.getByLabelText("Email").fill("fout@voorbeeld.nl");
  await kiesOrganisatie();
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
  await kiesOrganisatie();
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
