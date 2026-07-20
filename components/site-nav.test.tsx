// Hoofdnavigatie (sprint 1.3-B): "Brands" → /data/brand-relations als hoofdingang naast
// het merkportaal ("Brand portal" → /brand). De actieve sectie wordt centraal bepaald
// (longest-prefix-wint), anders lichten op /data/brand-relations zowel "Data" als
// "Brands" op. Pure resolver-tests + screenshots licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { activeNavHref, NAV_ITEMS } from "./nav-items";
import { NavBar } from "./nav-link";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// ── Pure resolver ────────────────────────────────────────────────────────────

test("actieve sectie: longest-prefix wint op /data/brand-relations", () => {
  // De regressie: vóór 1.3-B matchte /data óók en lichtten er twee items op.
  expect(activeNavHref("/data/brand-relations")).toBe("/data/brand-relations");
  expect(activeNavHref("/data/brand-relations")).not.toBe("/data");
  expect(activeNavHref("/data/brand-relations/b-flos")).toBe(
    "/data/brand-relations",
  );
});

test("actieve sectie: bestaand gedrag blijft intact", () => {
  expect(activeNavHref("/data")).toBe("/data");
  expect(activeNavHref("/data/imports")).toBe("/data");
  expect(activeNavHref("/projects")).toBe("/projects");
  expect(activeNavHref("/projects/p-1")).toBe("/projects");
  expect(activeNavHref("/catalog/123")).toBe("/catalog");
  expect(activeNavHref("/brand")).toBe("/brand");
  expect(activeNavHref("/brand/dashboard")).toBe("/brand");
  expect(activeNavHref("/login")).toBeNull();
  expect(activeNavHref("")).toBeNull();
  // Geen valse prefix-treffer op een pad dat alleen als string begint met een item.
  expect(activeNavHref("/branding")).toBeNull();
});

test("navigatie-items: Brands staat tussen Catalog en Data, labels zijn uniek", () => {
  const labels = NAV_ITEMS.map((i) => i.label);
  expect(labels.indexOf("Brands")).toBe(labels.indexOf("Catalog") + 1);
  expect(labels.indexOf("Brands")).toBe(labels.indexOf("Data") - 1);
  expect(new Set(labels).size).toBe(labels.length);
  expect(NAV_ITEMS.find((i) => i.label === "Brands")?.href).toBe(
    "/data/brand-relations",
  );
  expect(NAV_ITEMS.find((i) => i.label === "Brand portal")?.href).toBe("/brand");
  // Het oude label "Brand" bestaat niet meer.
  expect(labels).not.toContain("Brand");
});

// ── Gerenderde balk ──────────────────────────────────────────────────────────

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const nav = (
  <div className="min-h-screen bg-background text-foreground">
    <NavBar email="timo@brinklicht.nl" pathname="/data/brand-relations" />
  </div>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`hoofdnavigatie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(nav);
      await expect
        .element(page.getByRole("link", { name: "Brands" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("link", { name: "Brand portal" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./site-nav.${theme}.${device}.test.png`,
      });
    });
  }
}

test("gerenderde balk markeert alleen Brands op /data/brand-relations", async () => {
  await renderServer(nav);
  await expect
    .element(page.getByRole("link", { name: "Brands" }))
    .toHaveAttribute("aria-current", "page");
  expect(
    page.getByRole("link", { name: "Data", exact: true }).element(),
  ).not.toHaveAttribute("aria-current");
});
