// White-box RSC-tests van de twee meldingen die uit de demo van 12 aug 2026 komen:
// de rode markering bij een vervallen product (ijzeren regel 3, herschreven) en de
// driver-waarschuwing. Fixture-data, licht/donker × mobiel/desktop.
//
// De harde eis die hier bewezen wordt: er staat NOOIT een bedrag bij een vervallen product.
// De view levert `gross_price` al als NULL — deze tests bewaken de tweede helft, namelijk
// dat het scherm er ook geen bedrag omheen verzint.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { DriverWaarschuwing } from "./driver-waarschuwing";
import { VervallenMarkering } from "./vervallen-markering";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const ui = (
  <div className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="mb-4 text-2xl font-semibold tracking-tight">
      Expired products &amp; drivers
    </h1>
    <div className="flex max-w-xl flex-col items-start gap-4">
      <VervallenMarkering
        toestand="prijslijst_verlopen"
        stempel={{ name: "Price list 2025", validUntil: "2025-12-31" }}
        brandName="Wever &amp; Ducré"
        variant="badge"
      />
      <VervallenMarkering
        toestand="prijslijst_verlopen"
        stempel={{ name: "Price list 2025", validUntil: "2025-12-31" }}
        brandName="Wever &amp; Ducré"
        variant="inline"
      />
      <VervallenMarkering
        toestand="uit_prijslijst"
        stempel={{ name: "Price list 2025", validUntil: "2025-12-31" }}
        variant="badge"
      />
      <VervallenMarkering
        toestand="uit_prijslijst"
        stempel={{ name: "Price list 2025", validUntil: "2025-12-31" }}
        variant="inline"
      />
      <DriverWaarschuwing merken={["Wever & Ducré"]} variant="regel" />
      <DriverWaarschuwing
        merken={["Flos Architectural", "Lombardo", "Wever & Ducré"]}
        variant="overzicht"
      />
    </div>
  </div>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`vervallen-markering + driver-waarschuwing (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(ui);
      // ⚠️ Eerst een awaitende matcher, dán pas synchroon in de DOM kijken: renderServer
      // keert terug vóór de stream is uitgespoeld, en `document.body.textContent` is op
      // dat moment nog leeg. Gekost: één ronde raadselachtig lege snapshots.
      // `.first()`: badge én inline-variant staan allebei op dit scherm en dragen
      // hetzelfde label — dat is precies wat de test wil zien, niet een probleem.
      await expect
        .element(page.getByText("Price list expired").first())
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Discontinued").first())
        .toBeInTheDocument();
      await expect
        .element(page.getByText(/check whether one is needed here/).first())
        .toBeInTheDocument();
      await page.screenshot({
        path: `./vervallen-markering.${theme}.${device}.test.png`,
      });
    });
  }
}

test("de melding noemt de laatst bekende prijslijst — dat was de vraag uit de demo", async () => {
  await renderServer(ui);
  await expect.element(page.getByText("Discontinued").first()).toBeInTheDocument();
  // Verlopen lijst: het MERK plus de datum ("bel om een verlenging").
  expect(document.body.textContent).toContain("expired on 31-12-2025");
  // Uit de lijst gevallen: de LIJST plus de datum ("zoek een vervanger").
  expect(document.body.textContent).toContain(
    "No longer included in the price list of 31-12-2025 (Price list 2025)",
  );
});

test("nergens een bedrag — de hele wijziging bestaat eruit dat er geen prijs meer is", async () => {
  await renderServer(ui);
  await expect.element(page.getByText("Discontinued").first()).toBeInTheDocument();
  const tekst = document.body.textContent ?? "";
  expect(tekst).toContain("no current price");
  expect(tekst).not.toMatch(/[€$£]/);
  expect(tekst).not.toMatch(/\d+[.,]\d{2}\b/);
});

test("een actueel product rendert niets — de aanroeper hoeft er niet om heen te bouwen", async () => {
  await renderServer(
    <div data-testid="leeg" className="bg-background p-6">
      <VervallenMarkering
        toestand="actueel"
        stempel={{ name: "Price list 2026", validUntil: "2026-12-31" }}
        variant="inline"
      />
      <DriverWaarschuwing merken={[]} variant="overzicht" />
    </div>,
  );
  await expect.element(page.getByTestId("leeg")).toBeInTheDocument();
  const leeg = document.querySelector('[data-testid="leeg"]');
  expect(leeg).not.toBeNull();
  expect(leeg!.textContent).toBe("");
});

test("één merk enkelvoud, meerdere merken opgesomd — de zin blijft leesbaar", async () => {
  await renderServer(
    <div className="bg-background p-6">
      <DriverWaarschuwing merken={["Marset"]} variant="regel" />
      <DriverWaarschuwing merken={["Marset", "TossB"]} variant="regel" />
      <DriverWaarschuwing merken={["Marset", "TossB", "Lombardo"]} variant="regel" />
    </div>,
  );
  await expect.element(page.getByText(/Marset sells/).first()).toBeInTheDocument();
  const tekst = document.body.textContent ?? "";
  expect(tekst).toContain("Marset sells drivers and accessories as separate items");
  expect(tekst).toContain("Marset and TossB sell drivers");
  expect(tekst).toContain("Marset, TossB and Lombardo sell drivers");
});
