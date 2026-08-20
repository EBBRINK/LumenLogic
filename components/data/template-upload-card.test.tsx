// White-box RSC-tests van de upload-kaart sinds de directe import
// (docs/goal-template-upload-direct-import.md): drie verplichte prijslijst-velden naast de
// bestandskeuze, een knop die eerlijk "Check & import" zegt, en kaarttekst die de
// vervang-semantiek benoemt (bestand wint, oude lijst op archief, ontbrekende producten
// uit de zoekresultaten). De format-afwijzings-draad wordt in
// template-proposal.test.tsx al door de stub getest; hier staat de FORMULIERVORM centraal.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { KaleKaart } from "./template-upload-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

const kaart = (
  <Screen>
    <KaleKaart brandId="b-deltalight" />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

test("de drie prijslijst-velden zijn aanwezig én verplicht — de enige menselijke invoer van de import", async () => {
  await renderServer(kaart);
  // Eerst wachten tot de kaart er echt staat — een kale querySelector direct na de render
  // kijkt naar een nog lege DOM (zelfde les als de blanco-PNG-noot hieronder).
  await expect
    .element(page.getByRole("button", { name: "Check & import" }))
    .toBeInTheDocument();
  for (const [naam, type] of [
    ["priceListName", "text"],
    ["priceListValidFrom", "date"],
    ["priceListValidUntil", "date"],
  ] as const) {
    const veld = document.querySelector<HTMLInputElement>(`input[name="${naam}"]`);
    expect(veld, `veld ${naam} ontbreekt`).not.toBeNull();
    expect(veld!.required, `veld ${naam} moet required zijn`).toBe(true);
    expect(veld!.type).toBe(type);
  }
  const bestand = document.querySelector<HTMLInputElement>('input[name="template"]');
  expect(bestand!.required).toBe(true);
});

test("de knop en de kaarttekst beloven wat het pad echt doet: checken én importeren, vervang-semantiek", async () => {
  await renderServer(kaart);
  await expect
    .element(page.getByRole("button", { name: "Check & import" }))
    .toBeInTheDocument();
  // De drie beloften van de vervang-semantiek, expliciet op het scherm — dit is de
  // eerlijkheid die het goedkeurscherm verving.
  await expect
    .element(page.getByText(/replaces this brand's data/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/previous price\s*list is archived/))
    .toBeInTheDocument();
  // Sinds regel 3 herschreven is (19 aug, migratie 0022) verdwijnen die producten
  // niet meer — ze blijven vindbaar, rood, zonder prijs. De kaart belooft dat nu ook.
  await expect
    .element(page.getByText(/not in the file stay findable/))
    .toBeInTheDocument();
});

// ── Screenshots: licht/donker × mobiel/desktop ──────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`upload-kaart directe import (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(kaart);
      // Content-assert vóór de capture: een kale body-assert gaf blanco PNG's.
      await expect
        .element(page.getByText("Upload filled template"))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Check & import" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./data-template-upload-kaart.${theme}.${device}.test.png`,
      });
    });
  }
}
