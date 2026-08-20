// White-box tests voor PriceListExpiryNotice (sprint 1.6, deel B): één gedeelde component,
// drie omhulsels, exact dezelfde inhoud. Ijzeren regel 2 (geld nooit in een meting) staat
// hier hard getest: nooit een €-teken, "EUR" of een decimaal bedrag in de output.
import { page } from "vitest/browser";
import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { PriceListExpiryNotice } from "./price-list-expiry-notice";

const VARIANTS = ["banner", "inline", "badge"] as const;

for (const variant of VARIANTS) {
  test(`${variant}: toont de einddatum en het woord 'extension' bij een verlopen lijst`, async () => {
    await renderServer(
      <PriceListExpiryNotice
        indicator="verlopen"
        validUntil="2026-07-13"
        variant={variant}
        brandName="ZZTEST QA-14"
      />,
    );
    await expect.element(page.getByText(/extension/i)).toBeInTheDocument();
    await expect.element(page.getByText(/13-07-2026/)).toBeInTheDocument();
    // Het merk hééft geleverd — de tekst mag nooit lezen als "nooit aangeleverd".
    await expect.element(page.getByText(/delivered/i)).toBeInTheDocument();
  });
}

test("rendert niets bij een geldige prijslijst ('aanwezig_geldig')", async () => {
  await renderServer(
    <div>
      <span>sentinel</span>
      <PriceListExpiryNotice
        indicator="aanwezig_geldig"
        validUntil="2027-07-21"
        variant="banner"
        brandName="Foo"
      />
    </div>,
  );
  await expect.element(page.getByText("sentinel")).toBeInTheDocument();
  expect(page.getByText(/extension/i).query()).toBeNull();
});

test("rendert niets bij 'verloopt_binnenkort' of 'ontbreekt' — alleen 'verlopen' toont iets", async () => {
  for (const indicator of ["verloopt_binnenkort", "ontbreekt"] as const) {
    await renderServer(
      <div>
        <span>sentinel-{indicator}</span>
        <PriceListExpiryNotice
          indicator={indicator}
          validUntil={indicator === "ontbreekt" ? null : "2026-08-20"}
          variant="inline"
        />
      </div>,
    );
    await expect
      .element(page.getByText(`sentinel-${indicator}`))
      .toBeInTheDocument();
    expect(page.getByText(/extension/i).query()).toBeNull();
  }
});

test("ijzeren regel 2: geen bedrag — geen €, geen 'EUR', geen decimaal getal in de tekst", async () => {
  await renderServer(
    <PriceListExpiryNotice
      indicator="verlopen"
      validUntil="2026-07-13"
      variant="banner"
      brandName="ZZTEST QA-14"
    />,
  );
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/€/);
  expect(text).not.toMatch(/\bEUR\b/i);
  // Decimaal bedrag zoals "129,50" of "129.50" — de datum (13-07-2026) matcht dit niet.
  expect(text).not.toMatch(/\d+[.,]\d{2}\b/);
});

test("badge: href maakt de badge klikbaar naar het merk", async () => {
  await renderServer(
    <PriceListExpiryNotice
      indicator="verlopen"
      validUntil="2026-07-13"
      variant="badge"
      brandName="ZZTEST QA-14"
      href="/brand-management/b-qa14"
    />,
  );
  // Eerst wachten tot de render door is, pas daarna de DOM ruw bevragen (precedent
  // elders in de codebase: een kale query() vóór de render race verliest weleens).
  await expect.element(page.getByText(/extension/i)).toBeInTheDocument();
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href="/brand-management/b-qa14"]',
  );
  expect(link).not.toBeNull();
  expect(link?.textContent).toMatch(/extension/i);
});

test("zonder brandName valt de tekst terug op 'This brand'", async () => {
  await renderServer(
    <PriceListExpiryNotice
      indicator="verlopen"
      validUntil="2026-07-13"
      variant="inline"
    />,
  );
  await expect.element(page.getByText(/^This brand/)).toBeInTheDocument();
});
