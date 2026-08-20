// White-box RSC-test van de admin-kaartenhub (IA-opschoning 12 aug 2026), met screenshots
// licht/donker × mobiel/desktop.
//
// Waarom deze test bestaat: de hub is na de opschoning van drie naar acht kaarten gegaan
// omdat de Data-werkbank is opgeheven. Wélke hoeken er zijn, is dus een besluit en geen
// implementatiedetail — en het is precies het soort lijst dat stilletjes terugkruipt naar
// de oude indeling. `adminCards()` is puur, dus dat besluit is hier zonder database vast
// te leggen.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { adminCards, AdminCards } from "./admin-cards";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const TELLINGEN = {
  brands: 438,
  uploads: 2,
  memberships: 7,
  fields: 3,
  waiting: 12,
};

const cards = adminCards(TELLINGEN);

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-7xl">{children}</main>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── De samenstelling, puur ───────────────────────────────────────────────────

test("de verhuisde schermen hebben allemaal een ingang op Admin", () => {
  const hrefs = cards.map((c) => c.href);
  // Punt 3 (Fields), punt 5 (Event logs) en de twee schermen die met de opgeheven
  // werkbank meekwamen. Zonder deze kaarten zijn ze alleen nog via de URL bereikbaar.
  expect(hrefs).toContain("/admin/fields");
  expect(hrefs).toContain("/admin/event-log");
  expect(hrefs).toContain("/admin/loading");
  expect(hrefs).toContain("/admin/evaluation");
  // Punt 7: organisaties stonden op /settings en horen bij beheer.
  expect(hrefs).toContain("/admin/organizations");
  // Geen enkele kaart wijst nog naar de opgeheven werkbank, en het
  // verrijkings-steekproefscherm bestaat niet meer (punt 6).
  for (const href of hrefs) {
    expect(href.startsWith("/data"), href).toBe(false);
    expect(href.includes("enrichment"), href).toBe(false);
  }
  // Eén ingang per scherm — een dubbele kaart is precies wat deze opschoning wegnam.
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("een kaart zonder telling toont geen lege tellingregel", () => {
  const eventLog = cards.find((c) => c.href === "/admin/event-log")!;
  expect(eventLog.count).toBeUndefined();
  const fields = cards.find((c) => c.href === "/admin/fields")!;
  expect(fields.count).toBe("3 own fields");
});

// ── Gerenderd ────────────────────────────────────────────────────────────────

test("elke kaart is een link met zijn titel als toegankelijke naam", async () => {
  await renderServer(
    <Screen>
      <AdminCards cards={cards} />
    </Screen>,
  );
  await expect
    .element(page.getByRole("link", { name: /Fields/ }))
    .toHaveAttribute("href", "/admin/fields");
  await expect
    .element(page.getByRole("link", { name: /Event log/ }))
    .toHaveAttribute("href", "/admin/event-log");
  await expect
    .element(page.getByRole("link", { name: /Organizations/ }))
    .toHaveAttribute("href", "/admin/organizations");
  // De telling staat op de kaart, niet alleen in de code.
  await expect.element(page.getByText("12 waiting")).toBeInTheDocument();
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`admin-kaarten (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <AdminCards cards={cards} />
        </Screen>,
      );
      // Wachten op échte inhoud vóór de opname: een kale body-assert gaf blanco PNG's.
      await expect
        .element(page.getByText("Evaluation", { exact: true }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./admin-kaarten.${theme}.${device}.test.png`,
      });
    });
  }
}
