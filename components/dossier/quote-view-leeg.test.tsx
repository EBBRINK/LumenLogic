// White-box RSC-test van de LEGE estimate-tab (UX-audit 30 jul, A6 — laatste twee
// restjes van sprint 2). Eigen testbestand en bewust niet in estimate.test.tsx: die
// bestanden schieten de gevúlde tab en hebben acht PNG's die hier niets mee te maken
// hebben; een fixture erbij zou ze allemaal invalideren (zelfde reden als de kop van
// brand-admin.test.tsx).
//
// Wat deze test vastpint is niet "er staat tekst" — dat deed de kale grijze regel ook.
// Het gaat om de drie dingen waarop de vijf dialecten uiteen liepen:
//   1. het IS het gedeelde component (`data-slot="empty-state"`);
//   2. WIE tekent het kader — hier "framed", want dit blok staat op kaal canvas en er
//      is geen <Card> omheen die dat al doet;
//   3. de actie is een BEWUSTE `null` — geen lege actie-container die stilletjes
//      wegvalt, en dus ook geen knop die naar het Lines-tabblad wijst dat als tab al
//      vlak boven dit document staat.
// Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { QuoteView } from "./quote-view";
import type { EstimateHeader } from "./quote-view";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Kopblok compleet: dan staat de amber "Complete the quote header"-banner er NIET, en
// is de lege toestand het enige wat er onder de kop te zien is. Precies wat we meten.
const header: EstimateHeader = {
  quoteNumber: "OFF-2026-0042",
  quoteDate: "2026-07-07",
  customer: "Deerns",
  projectRef: "PRJ-42",
  author: "tester@voorbeeld.nl",
  validUntil: "2026-08-07",
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

const leegScherm = (
  <Screen>
    <QuoteView
      dossierName="Ziekenhuis Noord"
      phase="tender"
      header={header}
      lines={[]}
    />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

function emptyStates(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`estimate leeg (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(leegScherm);
      // Inhoud uit QuoteView zelf, niet uit de <Screen>-wrapper (reviewzwerm 2.5a,
      // B11: `expect.element(document.body)` bleef groen bij een lege render).
      await expect
        .element(page.getByText("No spec lines yet."))
        .toBeInTheDocument();
      // De voettekst is het laatste element van de RSC-stream — dat is het startsein
      // voor het schot, anders schiet Chromium een half document.
      await expect
        .element(page.getByText(/Request order is preserved/).first())
        .toBeInTheDocument();
      await page.screenshot({
        path: `./estimate-leeg.${theme}.${device}.test.png`,
      });
    });
  }
}

test("de lege estimate is het gedeelde component in de framed-vorm", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No spec lines yet.")).toBeInTheDocument();

  const alle = emptyStates();
  expect(alle).toHaveLength(1);
  const [leeg] = alle;

  // 1. Het IS EmptyState, en het is de framed-variant — niet per ongeluk inline.
  expect(leeg.dataset.variant).toBe("framed");
  // 2. Framed betekent: dit component tekent het kader zelf.
  expect(leeg.className).toContain("border-dashed");
  // 3. En dat mág hier, want er zit geen kaart omheen die het al deed. Dit is de
  //    meting waarop de variantkeuze rust, niet de aanname.
  expect(leeg.closest('[data-slot="card"]')).toBeNull();
});

test("bewuste action={null}: geen knop, geen lege actie-container", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No spec lines yet.")).toBeInTheDocument();

  const [leeg] = emptyStates();
  // Titel + uitleg, en niets meer. Een derde kind zou de actie-container zijn.
  expect(leeg.children.length).toBe(2);
  expect(leeg.querySelector("form")).toBeNull();
  expect(leeg.querySelector("a")).toBeNull();
  expect(leeg.querySelector("button")).toBeNull();
});

test("de titel staat niet meer volledig op de secundaire kleur", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No spec lines yet.")).toBeInTheDocument();

  // Het afgeschafte dialect was één <p> waarin titel én uitleg samen muted waren. Nu
  // draagt de titel voorgrondkleur en staat alleen de uitleg muted — dat verschil is
  // de hele opbrengst van A6, dus het hoort gemeten te worden.
  const [leeg] = emptyStates();
  const titel = leeg.children[0] as HTMLElement;
  expect(titel.textContent).toBe("No spec lines yet.");
  expect(titel.className).not.toContain("text-muted-foreground");
  expect(titel.className).toContain("font-medium");
});
