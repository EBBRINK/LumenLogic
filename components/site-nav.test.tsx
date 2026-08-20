// Hoofdnavigatie (sprint 1.3-B): "Brand management" → /brand-management als hoofdingang
// naast het merkportaal ("Brand portal" → /brand). De actieve sectie wordt centraal
// bepaald (longest-prefix-wint). Pure resolver-tests + screenshots licht/donker ×
// mobiel/desktop.
//
// IA-opschoning 12 aug 2026: "Brand relations" heet "Brand management", "Data" is uit de
// balk verdwenen (alles eronder heeft een eigen huis) en "Settings" staat niet meer in de
// balk maar in het accountmenu onder het e-mailadres.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ACCOUNT_ITEMS, activeNavHref, NAV_ITEMS } from "./nav-items";
import { magBij, niveauVoor } from "@/lib/route-allowlist";
import { decideToegang, type Toegang } from "@/lib/repo/toegang";
import { NavBar } from "./nav-link";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// ── Pure resolver ────────────────────────────────────────────────────────────

test("actieve sectie: de merksectie licht op, ook op een subpad", () => {
  expect(activeNavHref("/brand-management")).toBe("/brand-management");
  expect(activeNavHref("/brand-management/b-flos")).toBe("/brand-management");
  expect(activeNavHref("/brand-management/price-lists")).toBe(
    "/brand-management",
  );
});

test("actieve sectie: bestaand gedrag blijft intact", () => {
  expect(activeNavHref("/admin")).toBe("/admin");
  expect(activeNavHref("/admin/fields")).toBe("/admin");
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

test("navigatie-items: Brand management staat ná Catalog, labels zijn uniek", () => {
  const labels = NAV_ITEMS.map((i) => i.label);
  expect(labels.indexOf("Brand management")).toBe(labels.indexOf("Catalog") + 1);
  expect(new Set(labels).size).toBe(labels.length);
  expect(NAV_ITEMS.find((i) => i.label === "Brand management")?.href).toBe(
    "/brand-management",
  );
  expect(NAV_ITEMS.find((i) => i.label === "Brand portal")?.href).toBe("/brand");
  // Het oude label "Brand" bestaat niet meer.
  expect(labels).not.toContain("Brand");
});

// ── IA-opschoning 12 aug 2026 (demosessie Brink Licht) ───────────────────────
//
// Drie besluiten die alleen als assertie blijven staan. Zonder deze test is
// "Data staat niet meer in de balk" een commit-bericht en geen eigenschap.

test("de balk draagt geen Data en geen Brand relations meer", () => {
  const labels = NAV_ITEMS.map((i) => i.label);
  expect(labels).not.toContain("Data");
  expect(labels).not.toContain("Brand relations");
  // En er wijst ook geen item meer naar een pad onder de opgeheven werkbank.
  for (const it of NAV_ITEMS) {
    expect(it.href.startsWith("/data"), it.href).toBe(false);
  }
});

test("Settings staat niet in de balk maar in het accountmenu", () => {
  expect(NAV_ITEMS.map((i) => i.label)).not.toContain("Settings");
  expect(ACCOUNT_ITEMS.find((i) => i.label === "Settings")?.href).toBe(
    "/settings",
  );
});

// ── Gerenderde balk ──────────────────────────────────────────────────────────

afterEach(() => {
  document.documentElement.classList.remove("dark");
  // De balk bevat sinds 30 jul de themaschakelaar; die schrijft in localStorage.
  localStorage.removeItem(THEME_STORAGE_KEY);
});

// Intern ziet géén "Organizations" in het accountmenu — dat scherm is voor hem een kaart
// op /admin. Zo rendert SiteNav het ook (zie de filter daar), dus dat is de stand die de
// screenshots horen te tonen.
const INTERNE_ACCOUNT_ITEMS = ACCOUNT_ITEMS.filter(
  (it) => !it.href.startsWith("/admin/"),
);

const nav = (
  <div className="min-h-screen bg-background text-foreground">
    <NavBar
      email="timo@brinklicht.nl"
      pathname="/brand-management"
      accountItems={INTERNE_ACCOUNT_ITEMS}
    />
  </div>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`hoofdnavigatie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(nav);
      await expect
        .element(page.getByRole("link", { name: "Brand management" }))
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
    .element(page.getByRole("link", { name: "Brand management" }))
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

test("gerenderde balk markeert alleen Brand management op /brand-management", async () => {
  await renderServer(nav);
  await expect
    .element(page.getByRole("link", { name: "Brand management" }))
    .toHaveAttribute("aria-current", "page");
  expect(
    document.querySelectorAll('nav [aria-current="page"]').length,
  ).toBe(1);
});

// ── Het accountmenu (IA-opschoning, punt 7) ──────────────────────────────────

test("het accountmenu opent onder de accountnaam en draagt Settings", async () => {
  await renderNav();
  // Geen enkele Settings-link in de bálk — dat is de helft van de eis.
  expect(document.querySelectorAll('nav a[href="/settings"]').length).toBe(0);

  const trigger = page.getByRole("button", { name: "Account and settings" });
  await expect.element(trigger).toBeInTheDocument();
  // Het e-mailadres is de knop geworden, niet zomaar een label ernaast.
  expect(trigger.element().textContent).toContain("timo@brinklicht.nl");
  await trigger.click();
  await expect
    .element(page.getByRole("menuitem", { name: "Settings" }))
    .toHaveAttribute("href", "/settings");
});

// Het open menu is een eigen visuele stand (portal, eigen vlak op de pagina in plaats van
// op de navy balk) en krijgt daarom zijn eigen opnamen, licht/donker × mobiel/desktop.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`accountmenu open (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderNav();
      await page.getByRole("button", { name: "Account and settings" }).click();
      await expect
        .element(page.getByRole("menuitem", { name: "Settings" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./account-menu.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── 3.2a: de balk toont alleen wat deze kijker mag bereiken ──────────────────
//
// Zonder deze filter houdt een extern account een menu met Brand management, Analytics,
// Brand portal en Admin — vier links die allemaal op een 404 uitkomen, want die
// routes staan in de allowlist op niveau `intern`. De filter zelf zit in
// `components/site-nav.tsx` en gebruikt dezelfde `ROUTE_NIVEAUS` als de poort; hier wordt
// vastgelegd wat dat oplevert, en dat de balk het ook echt zo rendert.

const zichtbaarVoor = (toegang: Toegang) =>
  NAV_ITEMS.filter((it) => magBij(toegang, niveauVoor(it.href))).map(
    (it) => it.label,
  );

const INTERN = decideToegang("timo@brinklicht.nl", [
  { orgId: "org-brink", orgType: "intern", roles: [] },
]);
const EXTERN_ADMIN = decideToegang("baas@installateur.nl", [
  { orgId: "org-klant", orgType: "extern", roles: ["org_admin"] },
]);
const EXTERN_LID = decideToegang("jan@installateur.nl", [
  { orgId: "org-klant", orgType: "extern", roles: ["calculator"] },
]);

test("intern ziet de hele balk", () => {
  // De contra-test: zonder deze zou een filter die per ongeluk álles wegsnijdt ook groen zijn.
  expect(zichtbaarVoor(INTERN)).toEqual(NAV_ITEMS.map((i) => i.label));
});

test("extern houdt Projects en Catalog over — de rest is intern", () => {
  expect(zichtbaarVoor(EXTERN_LID)).toEqual(["Projects", "Catalog"]);
  // Een externe org_admin ziet dezelfde bálk: /admin/users en /admin/organizations staan
  // wél op `org_admin`, maar het NAV-item wijst naar /admin (het dashboard) en dat is en
  // blijft intern. Zijn weg naar het organisatiescherm loopt via het accountmenu.
  expect(zichtbaarVoor(EXTERN_ADMIN)).toEqual(["Projects", "Catalog"]);
  for (const weg of [
    "Data",
    "Brand management",
    "Analytics",
    "Brand portal",
    "Admin",
    "Settings",
  ]) {
    expect(zichtbaarVoor(EXTERN_LID), weg).not.toContain(weg);
  }
});

test("het accountmenu is de weg van een externe beheerder naar zijn organisaties", () => {
  // De regressie die deze test uitsluit: /admin/organizations (tot 12 aug
  // /settings/organization) verhuisde naar Admin, en /admin staat op `intern`. Zonder de
  // regel in ACCOUNT_ITEMS + de filter in site-nav.tsx zou een externe org_admin geen
  // enkele link naar dat scherm meer hebben — precies UX-audit bug #11, opnieuw.
  const voor = (toegang: Toegang) =>
    ACCOUNT_ITEMS.filter((it) => magBij(toegang, niveauVoor(it.href))).map(
      (it) => it.label,
    );
  expect(voor(EXTERN_ADMIN)).toContain("Organizations");
  expect(voor(EXTERN_LID)).toEqual(["Settings"]);
  expect(voor(INTERN)).toContain("Organizations"); // mág erbij…
  // …maar SiteNav laat hem voor intern weg: daar is /admin de ene ingang.
  expect(INTERNE_ACCOUNT_ITEMS.map((i) => i.label)).toEqual(["Settings"]);
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`hoofdnavigatie extern (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background text-foreground">
          <NavBar
            email="jan@installateur.nl"
            pathname="/projects"
            items={NAV_ITEMS.filter((it) =>
              magBij(EXTERN_LID, niveauVoor(it.href)),
            )}
            accountItems={ACCOUNT_ITEMS.filter((it) =>
              magBij(EXTERN_LID, niveauVoor(it.href)),
            )}
          />
        </div>,
      );
      await expect
        .element(page.getByRole("link", { name: "Projects" }))
        .toBeInTheDocument();
      // Wat er NIET staat is de hele eis — een screenshot alleen zou dat niet vastleggen.
      expect(
        document.querySelectorAll('nav a[href^="/admin"]').length,
        "Admin staat nog in de balk voor een extern account",
      ).toBe(0);
      await page.screenshot({
        path: `./site-nav.extern.${theme}.${device}.test.png`,
      });
    });
  }
}
