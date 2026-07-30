// Hoofdnavigatie (sprint 1.3-B): "Brand relations" → /data/brand-relations als hoofdingang naast
// het merkportaal ("Brand portal" → /brand). De actieve sectie wordt centraal bepaald
// (longest-prefix-wint), anders lichten op /data/brand-relations zowel "Data" als
// "Brand relations" op. Pure resolver-tests + screenshots licht/donker × mobiel/desktop.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { THEME_STORAGE_KEY } from "@/lib/theme";
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

test("navigatie-items: Brand relations staat tussen Catalog en Data, labels zijn uniek", () => {
  const labels = NAV_ITEMS.map((i) => i.label);
  expect(labels.indexOf("Brand relations")).toBe(labels.indexOf("Catalog") + 1);
  expect(labels.indexOf("Brand relations")).toBe(labels.indexOf("Data") - 1);
  expect(new Set(labels).size).toBe(labels.length);
  expect(NAV_ITEMS.find((i) => i.label === "Brand relations")?.href).toBe(
    "/data/brand-relations",
  );
  expect(NAV_ITEMS.find((i) => i.label === "Brand portal")?.href).toBe("/brand");
  // Het oude label "Brand" bestaat niet meer.
  expect(labels).not.toContain("Brand");
});

// ── Gerenderde balk ──────────────────────────────────────────────────────────

afterEach(() => {
  document.documentElement.classList.remove("dark");
  // De balk bevat sinds 30 jul de themaschakelaar; die schrijft in localStorage.
  localStorage.removeItem(THEME_STORAGE_KEY);
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
        .element(page.getByRole("link", { name: "Brand relations" }))
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

// renderServer rendert asynchroon door; eerst op een element wachten, anders zijn
// de querySelectors hieronder nog leeg. Zelfde patroon als huisstijl.test.tsx.
async function renderNav() {
  await renderServer(nav);
  await expect
    .element(page.getByRole("link", { name: "Brand relations" }))
    .toBeInTheDocument();
}

// ── Merkkleuren in de balk (sprint 2.0b, DESIGN.md O11/O12) ──────────────────
// De balk is een navy vlak in een wit canvas: een bewuste toevoeging bovenop de
// kit. Deze assertions staan er zodat een latere bouwer hem niet "terugzet naar
// de kit" — dat zou een regressie zijn, geen correctie.

for (const theme of ["light", "dark"] as const) {
  test(`balk is navy met leesbare items (${theme})`, async () => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderNav();
    const header = document.querySelector("header")!;
    // Mode-invariant: in béide standen hetzelfde navy vlak. De --nav-*-tokens
    // worden bewust niet in .dark overschreven.
    expect(getComputedStyle(header).backgroundColor).toBe("rgb(26, 31, 58)");

    const active = document.querySelector('[aria-current="page"]')!;
    const sActive = getComputedStyle(active);
    expect(sActive.color).toBe("rgb(255, 255, 255)"); // 16,1:1 op navy
    expect(sActive.borderBottomColor).toBe("rgb(27, 168, 154)"); // teal, 5,5:1
    expect(sActive.borderBottomWidth).toBe("2px");
    expect(sActive.fontWeight).toBe("500");

    // Dit is de assertie die #B0B8C4 vastzet. Een "opruimactie" naar
    // --muted-foreground (#8E9BA8) laat hem falen — en dat is de bedoeling.
    const inactive = page
      .getByRole("link", { name: "Catalog", exact: true })
      .element();
    const sInactive = getComputedStyle(inactive);
    expect(sInactive.color).toBe("rgb(176, 184, 196)"); // 8,1:1 op navy
    // 2px gereserveerd op inactief: geen hoogtesprong bij navigeren.
    expect(sInactive.borderBottomWidth).toBe("2px");
  });
}

test("in de balk staat alleen het beeldmerk, en dat bestand wordt echt geserveerd", async () => {
  await renderNav();
  const header = document.querySelector("header")!;
  const imgs = header.querySelectorAll("img");
  // Eén beeldmerk. Géén lockup: dat bevat het #0A0A0A-woordmerk (1,23:1 op navy).
  expect(imgs.length).toBe(1);
  const img = imgs[0] as HTMLImageElement;
  expect(img.getAttribute("src")).toBe("/brand/lumenlogic_logo.svg");
  // alt="" houdt de toegankelijke naam van de link precies "Lumen Logic".
  expect(img.getAttribute("alt")).toBe("");
  await expect
    .element(page.getByRole("link", { name: "Lumen Logic" }))
    .toBeInTheDocument();
  // Faalt luid als het bestand ontbreekt, in plaats van als kapot-plaatje-icoon
  // in een screenshot te belanden.
  await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
});

test("de focus-outline in de balk is teal, niet blauw", async () => {
  // Blauw #2D5A8C haalt op navy 2,27:1 en faalt kit §11 ("altijd zichtbaar").
  // Let op: dit moet écht toetsenbordfocus zijn. Een kale el.focus() zet op een
  // <a> geen :focus-visible (anders dan op een tekstveld, waar het altijd matcht),
  // en dan meet je de globale outline-ring/50 uit globals.css in plaats van deze.
  await renderNav();
  await userEvent.keyboard("{Tab}");
  const focused = document.activeElement as HTMLElement;
  expect(focused.tagName).toBe("A");
  expect(focused.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(focused).outlineColor).toBe("rgb(27, 168, 154)");
  expect(getComputedStyle(focused).outlineWidth).toBe("2px");
});

// ── Themaschakelaar in de balk (DESIGN.md O3/G24, O9, O10/O12) ───────────────
// De knop is de énige toevoeging aan de balk. Gemeten in deze harnas bij viewport
// 375, vóór en ná: document.body.scrollWidth 595 → 651 (+56 = 32px knop + de gap-6
// naar het groepje ernaast), balkhoogte onveranderd 73px. De balk liep daar dus al
// over en loopt nu 56px verder over. NIET hier gerepareerd: dat is week 3 (besluit
// G21, vier rollen), en het getal staat hier zodat die sprint het niet opnieuw hoeft
// te meten. Vandaar ook geen assertie op scrollWidth — die zou week 3 in de weg staan.

test("de themaschakelaar staat in de balk, is een echte knop en meldt zijn stand", async () => {
  await renderNav();
  const btn = page.getByRole("button", { name: "Dark mode" }).element();
  expect(btn.tagName).toBe("BUTTON");
  expect(btn.getAttribute("type")).toBe("button");
  // Geen opgeslagen keuze → licht, dus de knop staat uit (DESIGN.md O13).
  expect(btn.getAttribute("aria-pressed")).toBe("false");
  // 32px: bewuste compacte maat, DESIGN.md O9 (44px geldt voor default/lg/velden).
  const r = btn.getBoundingClientRect();
  expect(r.width).toBe(32);
  expect(r.height).toBe(32);
});

test("de themaschakelaar is met Tab bereikbaar en heeft een tealen ring", async () => {
  await renderNav();
  const btn = page
    .getByRole("button", { name: "Dark mode" })
    .element() as HTMLElement;
  for (let i = 0; i < 20 && document.activeElement !== btn; i++) {
    await userEvent.keyboard("{Tab}");
  }
  expect(document.activeElement).toBe(btn);
  expect(btn.matches(":focus-visible")).toBe(true);
  // Blauw #2D5A8C haalt op de navy balk 2,3:1 — teal, net als NavLink (O10/O12).
  // Pollen en niet meteen lezen: Tailwind v4 zet outline-color in transition-colors,
  // dus een directe getComputedStyle vangt de ring halverwege de overgang nog op de
  // globale outline-ring/50.
  await expect
    .poll(() => getComputedStyle(btn).outlineColor)
    .toBe("rgb(27, 168, 154)");
  expect(getComputedStyle(btn).outlineWidth).toBe("2px");
});

test("de balk klikt zichzelf naar dark en terug", async () => {
  // De hele reden dat dit bestaat: vanuit de balk moet je bij het .dark-tokenblok
  // kunnen komen. Zonder deze weg maakte elke sprint dark-screenshots van een stand
  // die geen gebruiker kon bereiken.
  await renderNav();
  const btn = page.getByRole("button", { name: "Dark mode" });
  await btn.click();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await expect.element(btn).toHaveAttribute("aria-pressed", "true");
  await btn.click();
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("gerenderde balk markeert alleen Brand relations op /data/brand-relations", async () => {
  await renderServer(nav);
  await expect
    .element(page.getByRole("link", { name: "Brand relations" }))
    .toHaveAttribute("aria-current", "page");
  expect(
    page.getByRole("link", { name: "Data", exact: true }).element(),
  ).not.toHaveAttribute("aria-current");
});
