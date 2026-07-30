// Themaschakelaar (UX-audit 30 jul). Dark mode is verplicht (DESIGN.md O3 / G24) en het
// .dark-tokenblok in globals.css was compleet, maar er was geen enkele weg naartoe.
//
// Deze tests pinnen de vier eigenschappen die het besluit vroeg:
//  1. zónder opgeslagen keuze is de app LICHT — de systeemvoorkeur telt niet mee
//     (DESIGN.md O13: de dark-paren zijn nooit op contrast nagerekend, dus niemand
//     mag er ongevraagd in belanden);
//  2. een expliciete keuze wint, rommel in de opslag niet;
//  3. de klik zet de klasse om én bewaart hem;
//  4. het init-script overleeft een herlading en is idempotent.
//
// De screenshots licht/donker × mobiel/desktop van de knop in de échte balk staan in
// site-nav.test.tsx — daar hangt hij aan de --nav-*-tokens waar hij op moet werken.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { DARK_CLASS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";

// Exact wat app/layout.tsx als eerste kind van <body> injecteert. Het script draait
// daar vóór de eerste paint; hier draaien we hem op verzoek, zodat "overleeft een
// herlading" een echte assertie wordt en geen aanname.
function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

const isDark = () => document.documentElement.classList.contains(DARK_CLASS);

afterEach(() => {
  document.documentElement.classList.remove(DARK_CLASS);
  localStorage.removeItem(THEME_STORAGE_KEY);
});

test("zonder opgeslagen keuze is de app licht — niet de systeemvoorkeur", () => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.classList.remove(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(false);

  // DIT is de assertie die het besluit vasthoudt: het script mag de systeemvoorkeur
  // niet eens raadplegen. Een latere "verbetering" die prefers-color-scheme alsnog
  // inbouwt, laat deze regel vallen — en dat is de bedoeling (DESIGN.md O13).
  expect(THEME_INIT_SCRIPT).not.toContain("prefers-color-scheme");
  expect(THEME_INIT_SCRIPT).not.toContain("matchMedia");
});

test("de knop raadpleegt de systeemvoorkeur ook niet bij het monteren", async () => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  const echt = window.matchMedia.bind(window);
  const bevraagd: string[] = [];
  window.matchMedia = ((q: string) => {
    bevraagd.push(q);
    return echt(q);
  }) as typeof window.matchMedia;
  try {
    await renderServer(<ThemeToggle />);
    await expect
      .element(page.getByRole("button", { name: "Dark mode" }))
      .toBeInTheDocument();
    // Geen matchMedia-luisteraar in subscribe(): de klasse op <html> is de enige bron.
    expect(bevraagd.filter((q) => q.includes("prefers-color-scheme"))).toEqual(
      [],
    );
  } finally {
    window.matchMedia = echt;
  }
  expect(isDark()).toBe(false);
});

test("een expliciete keuze wint, rommel in de opslag valt terug op licht", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  document.documentElement.classList.remove(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(true);

  localStorage.setItem(THEME_STORAGE_KEY, "light");
  runInitScript();
  expect(isDark()).toBe(false);

  // Rommel is géén keuze en mag niet in een derde stand eindigen: dan geldt licht.
  localStorage.setItem(THEME_STORAGE_KEY, "paars");
  document.documentElement.classList.add(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(false);

  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.classList.add(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(false);
});

test("de klik zet de klasse om, bewaart de keuze en overleeft een herlading", async () => {
  // Startstand: geen keuze → licht.
  localStorage.removeItem(THEME_STORAGE_KEY);
  runInitScript();

  await renderServer(<ThemeToggle />);
  const btn = page.getByRole("button", { name: "Dark mode" });
  await expect.element(btn).toHaveAttribute("aria-pressed", "false");

  await btn.click();
  expect(isDark()).toBe(true);
  await expect.element(btn).toHaveAttribute("aria-pressed", "true");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

  // "Overleeft een herlading" = precies wat het init-script bij de volgende paint doet.
  // Twee keer draaien mag de keuze niet omgooien (het script is idempotent).
  document.documentElement.classList.remove(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(true);
  runInitScript();
  expect(isDark()).toBe(true);

  await btn.click();
  expect(isDark()).toBe(false);
  await expect.element(btn).toHaveAttribute("aria-pressed", "false");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  document.documentElement.classList.add(DARK_CLASS);
  runInitScript();
  expect(isDark()).toBe(false);
});

test("het icoon hangt aan CSS, niet aan state — anders klapt het na hydratie om", async () => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  runInitScript();
  await renderServer(<ThemeToggle />);
  // renderServer rendert asynchroon door; eerst wachten, anders is de DOM nog leeg.
  await expect
    .element(page.getByRole("button", { name: "Dark mode" }))
    .toBeInTheDocument();
  const btn = page
    .getByRole("button", { name: "Dark mode" })
    .element() as HTMLElement;

  // Beide iconen staan altijd in de DOM; de dark:-variant kiest er één.
  const svgs = btn.querySelectorAll("svg");
  expect(svgs.length).toBe(2);
  const visible = () =>
    [...btn.querySelectorAll("svg")].filter(
      (s) => getComputedStyle(s).display !== "none",
    ).length;
  expect(visible()).toBe(1);
  document.documentElement.classList.add(DARK_CLASS);
  expect(visible()).toBe(1);

  // Decoratief: de knop heet "Dark mode", de iconen mogen dat niet nóg eens zeggen.
  for (const svg of svgs) expect(svg.getAttribute("aria-hidden")).toBe("true");
});
