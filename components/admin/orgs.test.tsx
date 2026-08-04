// White-box RSC-test van het organisatieblok op /admin/users (sprint 3.2c) plus de
// "+ New organization"-uitbreiding van het PIN-formulier. Licht/donker × mobiel/desktop,
// en daarnaast gerichte asserts op wat de besluiten van 4 aug vragen:
//
//   3. er is nergens een intern/extern-keuze — ook niet als optie die je kunt aanklikken;
//   4b. de organisatiekeuze in het PIN-formulier heeft een "+ New organization"-optie die
//       de naam-, plan- en zetelvelden tevoorschijn haalt;
//   6. de zetellimiet heeft een standaardwaarde (5) in plaats van een lege "unlimited";
//   8. het type staat naast élke organisatienaam — in de lijst, in de dropdown én in de
//      PIN-statuslijst, want aan dat veld hangt de zichtbaarheid van geld.
//
// Screenshots per BLOK (data-testid) op de ware apparaatviewport, om dezelfde reden als in
// pin-block.test.tsx: een kale paginascreenshot snijdt op 375px af of schaalt onleesbaar
// terug.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { orgRows } from "./orgs-block-fixtures";
import {
  OrgsBlockLeeg,
  OrgsBlockMetFout,
  OrgsBlockScreen,
  PinBlockMetNieuweOrg,
} from "./orgs-block-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Organization members
        </h1>
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

async function screenshotBlock(testId: string, path: string) {
  await page.screenshot({ element: page.getByTestId(testId), path });
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── Toestand 1: de organisatielijst met het aanmaakformulier ──────────────────
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`organisatieblok (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <OrgsBlockScreen />
        </Screen>,
      );
      await expect.element(page.getByText("TEST 123")).toBeInTheDocument();
      await screenshotBlock(
        "orgs-card",
        `./orgs-block.${theme}.${device}.test.png`,
      );
    });
  }
}

// ── Toestand 2: nog geen enkele organisatie ────────────────────────────────────
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`organisatieblok leeg (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <OrgsBlockLeeg />
        </Screen>,
      );
      await expect
        .element(page.getByText("No organizations yet."))
        .toBeInTheDocument();
      await screenshotBlock(
        "orgs-card",
        `./orgs-block-leeg.${theme}.${device}.test.png`,
      );
    });
  }
}

// ── Toestand 3: het PIN-formulier met de nieuwe-organisatie-velden open ────────
async function kiesNieuweOrganisatie() {
  await renderServer(
    <Screen>
      <PinBlockMetNieuweOrg />
    </Screen>,
  );
  // selectOptions matcht op waarde óf zichtbare optietekst.
  await page.getByLabelText("Organization").selectOptions("+ New organization…");
  await expect.element(page.getByTestId("new-org-fields")).toBeInTheDocument();
}

// ⚠️ Twee maten, om dezelfde reden als in pin-block.test.tsx. Het hele "Issue a PIN"-blok
// mét de nieuwe-organisatie-velden open is op 375px hóger dan de viewport, en een
// screenshot daarvan snijdt de rollen en de knop eraf — precies de valkuil die dat bestand
// beschrijft. Het nieuwe element (de fieldset) past wél op elke maat en krijgt daarom de
// volledige licht/donker × mobiel/desktop-serie; het volledige blok staat er op desktop
// naast, voor de context van de dropdown erboven en de rollen eronder.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`nieuwe-organisatie-velden (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await kiesNieuweOrganisatie();
      await screenshotBlock(
        "new-org-fields",
        `./pin-block-nieuwe-org-velden.${theme}.${device}.test.png`,
      );
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`PIN-formulier met nieuwe organisatie (${theme}, desktop)`, async () => {
    await page.viewport(viewports.desktop.width, viewports.desktop.height);
    if (theme === "dark") document.documentElement.classList.add("dark");
    await kiesNieuweOrganisatie();
    await screenshotBlock(
      "pin-issue-card",
      `./pin-block-nieuwe-org.${theme}.desktop.test.png`,
    );
  });
}

// ── Besluit 8: het type staat naast élke organisatienaam ──────────────────────

test("besluit 8: elke organisatie in de lijst draagt haar type", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("Brink Licht")).toBeInTheDocument();

  const types = Array.from(
    document.querySelectorAll('[data-testid="org-type"]'),
  ).map((b) => b.textContent);
  // Eén badge per organisatie, in dezelfde volgorde — niet "meestal wel".
  expect(types).toEqual(orgRows.map((o) => o.type));
  expect(types).toContain("intern");
  expect(types).toContain("extern");
});

test("besluit 8: de PIN-statuslijst noemt naam én type, niet alleen de naam", async () => {
  await renderServer(
    <Screen>
      <PinBlockMetNieuweOrg />
    </Screen>,
  );
  await expect
    .element(page.getByText("gebruikt@voorbeeld.nl"))
    .toBeInTheDocument();

  // Dit is de regel die vóór 3.2c "Brink Licht · org_admin" was: de organisatie waar het
  // prijszicht aan hangt, zonder dat je kon zien wélk type het was.
  const statuslijst = document.querySelector(
    '[data-testid="pin-status-card"]',
  )!;
  expect(statuslijst.textContent).toContain("Brink Licht (intern) · org_admin");
  expect(statuslijst.textContent).toContain("Aannemer Zuid (extern)");
});

// ── Besluit 3: nergens een intern/extern-keuze ────────────────────────────────

test("besluit 3: geen enkel formulierveld waarmee je het type kiest", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("Aannemer Zuid")).toBeInTheDocument();

  // Geen veld dat 'type' heet, en geen optie met de waarde 'intern' — een knop die per
  // ongeluk aangeklikt kan worden is precies het risico dat besluit 3 wegneemt.
  const velden = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input[name], select[name]",
    ),
  ).map((v) => v.name);
  expect(velden).not.toContain("type");
  expect(velden).not.toContain("orgType");
  const opties = Array.from(document.querySelectorAll("option")).map(
    (o) => o.value,
  );
  expect(opties).not.toContain("intern");
  expect(opties).not.toContain("extern");

  // En het scherm zegt met zoveel woorden wat er gebeurt, zodat niemand hoeft te raden.
  expect(document.body.textContent).toContain("is external");
  expect(document.body.textContent).toContain("cannot be changed afterwards");
});

test("besluit 3: het type van een bestaande organisatie is niet te bewerken (G42)", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("TEST 123")).toBeInTheDocument();

  // Per organisatie precies één formulier, en dat gaat over zetels — nergens een tweede
  // knop die het type aanraakt.
  const formulieren = Array.from(
    document.querySelectorAll('[data-testid="orgs-list"] form'),
  );
  expect(formulieren).toHaveLength(orgRows.length);
  for (const f of formulieren) {
    const namen = Array.from(
      f.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]"),
    ).map((v) => v.name);
    expect(namen).toEqual(["seatLimit"]);
  }
});

// ── Besluit 6: een standaardwaarde in plaats van een lege 'unlimited' ─────────

test("besluit 6: het aanmaakformulier staat standaard op 5 zetels, niet op leeg", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("Aannemer Zuid")).toBeInTheDocument();

  const zetels = document.querySelector<HTMLInputElement>("#org-seats")!;
  expect(zetels.value).toBe("5");
  expect(zetels.required).toBe(true);
  expect(zetels.min).toBe("1");
  // "unlimited" is via dit scherm niet te kiezen: dat bestaat alleen nog voor Brink Licht
  // zelf, en juist de lege standaardwaarde was de verrassing die besluit 6 wegneemt.
  expect(zetels.placeholder).toBe("");
});

test("besluit 6/7: de zetellimiet naast een organisatie toont haar huidige waarde", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockScreen />
    </Screen>,
  );
  await expect.element(page.getByText("TEST 123")).toBeInTheDocument();

  // De klant met een limiet: het getal staat er.
  const test123 = document.querySelector<HTMLInputElement>("#seats-org-2")!;
  expect(test123.value).toBe("1");
  // Brink Licht heeft er geen. Dan staat er eerlijk niets, met "unlimited" als uitleg —
  // geen verzonnen getal dat bij opslaan ineens een limiet zou zetten.
  const brink = document.querySelector<HTMLInputElement>("#seats-org-brink")!;
  expect(brink.value).toBe("");
  expect(brink.placeholder).toBe("unlimited");

  // En de bezetting staat erbij, zodat "vol" zichtbaar is vóór je een PIN probeert.
  const lijst = document.querySelector('[data-testid="orgs-list"]')!;
  expect(lijst.textContent).toContain("1/1 seats");
  expect(lijst.textContent).toContain("3/5 seats");
  expect(lijst.textContent).toContain("4 members, no seat limit");
});

// ── Besluit 4b: de één-klik-velden verschijnen alleen als je erom vraagt ───────

test("besluit 4b: de nieuwe-organisatie-velden staan er pas na het kiezen van de optie", async () => {
  await renderServer(
    <Screen>
      <PinBlockMetNieuweOrg />
    </Screen>,
  );
  await expect.element(page.getByText("Issue a PIN")).toBeInTheDocument();

  // Dicht: de gewone gang van zaken is een bestaande organisatie kiezen.
  expect(document.querySelector('[data-testid="new-org-fields"]')).toBeNull();

  await page.getByLabelText("Organization").selectOptions("+ New organization…");
  const velden = document.querySelector('[data-testid="new-org-fields"]')!;
  expect(velden).not.toBeNull();
  expect(
    velden.querySelector<HTMLInputElement>("#pin-new-org-seats")!.value,
  ).toBe("5");
  // Besluit 5 staat er in gewone taal bij: één klik doet twee dingen, en ze slagen of
  // falen samen.
  expect(velden.textContent).toContain("isn't created either");

  // G36, eerste zin: een verse organisatie heeft nog geen beheerder, dus deze eerste
  // persoon wordt het — vastgezet, niet als suggestie.
  const orgAdmin = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="roles"]',
    ),
  ).find((b) => b.value === "org_admin")!;
  expect(orgAdmin.checked).toBe(true);
  expect(orgAdmin.disabled).toBe(true);
});

test("besluit 2: zonder recht om organisaties aan te maken is de optie er niet", async () => {
  // Dit is de externe org_admin-stand van het PIN-blok (canCreateOrgs is default false).
  const { PinBlockAlsOrgAdmin } = await import("./pin-block-stubs");
  await renderServer(
    <Screen>
      <PinBlockAlsOrgAdmin />
    </Screen>,
  );
  await expect.element(page.getByText("Issue a PIN")).toBeInTheDocument();

  const opties = Array.from(document.querySelectorAll("option")).map(
    (o) => o.textContent,
  );
  expect(opties).not.toContain("+ New organization…");
  expect(document.querySelector('[data-testid="new-org-fields"]')).toBeNull();
});

// ── De weigering van de server komt op het scherm terecht ─────────────────────

test("een weigering van de server staat als foutmelding in het formulier", async () => {
  await renderServer(
    <Screen>
      <OrgsBlockMetFout />
    </Screen>,
  );
  await page.getByLabelText("Name").fill("Nieuwe Klant");
  await page.getByRole("button", { name: "Create" }).click();

  await expect
    .element(page.getByText("Testfout: aanmaken geweigerd."))
    .toBeInTheDocument();
  // De rol="alert" is het verschil tussen "er staat ergens rode tekst" en "een
  // schermlezer meldt het".
  expect(document.querySelector('[role="alert"]')!.textContent).toContain(
    "Testfout",
  );
});
