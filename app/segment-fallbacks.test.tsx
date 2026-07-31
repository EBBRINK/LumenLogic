// White-box RSC-tests van de SEGMENT-foutgrenzen (reviewzwerm 2.5a, B16).
// Zusterbestand van app/fallbacks.test.tsx — dat bewaakt de drie WORTEL-fallbacks
// (error/global-error/not-found); dit bewaakt de drie segmentgrenzen die er tot deze
// sprint niet waren: app/projects/error.tsx, app/data/error.tsx, app/admin/error.tsx.
//
// WAT HIER PRECIES BEWEZEN WORDT, in twee stappen — want "de fout landt op het
// segmentscherm" bestaat uit twee onafhankelijke delen:
//
//  1. DE GRENS BESTAAT OP HET JUISTE PAD. Next kiest bij een fout de dichtstbijzijnde
//     error.tsx boven de kapotte route; welke dat is, is puur een bestandspad-conventie.
//     De glob-test hieronder meet dus exact het ding dat B16 constateerde ("geen enkele
//     segment-error.tsx") en gaat rood zodra er één verdwijnt of verkeerd komt te staan.
//     Dit is een bestandssysteem-assertie, geen mock: import.meta.glob wordt door Vite
//     bij het bouwen van de test opgelost tegen de échte boom.
//  2. HET SCHERM IS EEN ANDER SCHERM DAN DE WORTELFALLBACK. Elke grens rendert de
//     sectienaam in de kop en een weg terug naar die sectie, en NIET het generieke
//     "Something went wrong" van app/error.tsx. Zo is aan het scherm zelf te zien dat de
//     fout in die sectie bleef in plaats van de hele pagina mee te trekken.
//
// De twee harnasgrenzen uit fallbacks.test.tsx gelden hier onverkort: props van een
// client-component gaan door een RSC-payload en moeten serialiseerbaar zijn, dus geen
// echte Error-instantie en geen reset-closure — dat de knop reset() aanroept is met deze
// harnas niet te testen.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import RootError from "./error";
import AdminError from "./admin/error";
import DataError from "./data/error";
import ProjectsError from "./projects/error";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Zelfde canvas als fallbacks.test.tsx: de root-layout is niet meegerenderd (die trekt
// next/font mee), dus de achtergrond wordt hier nagebootst.
function canvas(children: React.ReactNode) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {children}
    </div>
  );
}

const DB_FOUT = {
  name: "Error",
  message: 'invalid input syntax for type uuid: "nope"',
  digest: "3068925283",
} as unknown as Error & { digest?: string };

const GEEN_RESET = undefined as unknown as () => void;

const SEGMENTEN = [
  {
    pad: "./projects/error.tsx",
    Boundary: ProjectsError,
    kop: "Projects could not be loaded",
    terug: { label: "Back to projects", href: "/projects" },
  },
  {
    pad: "./data/error.tsx",
    Boundary: DataError,
    kop: "Data could not be loaded",
    terug: { label: "Back to data", href: "/data" },
  },
  {
    pad: "./admin/error.tsx",
    Boundary: AdminError,
    kop: "Admin could not be loaded",
    terug: { label: "Back to admin", href: "/admin" },
  },
] as const;

// ── 1. De grenzen staan er, op het juiste pad ────────────────────────────────

test("elk zwaar segment heeft een eigen error.tsx — niet alleen de wortel", () => {
  // Vite lost dit bij het bouwen op tegen de echte app-boom. Vóór B16 stond hier
  // uitsluitend "./error.tsx" in.
  const gevonden = Object.keys(import.meta.glob("./**/error.tsx"));

  expect(gevonden).toContain("./error.tsx"); // de wortelgrens blijft
  for (const { pad } of SEGMENTEN) {
    expect(gevonden).toContain(pad);
  }
});

// ── 2. Het segmentscherm is niet het wortelscherm ────────────────────────────

for (const { Boundary, kop, terug } of SEGMENTEN) {
  test(`${kop}: eigen scherm, eigen weg terug — niet de wortelfallback`, async () => {
    const { container } = await renderServer(
      canvas(<Boundary error={DB_FOUT} reset={GEEN_RESET} />),
    );

    await expect
      .element(page.getByRole("heading", { name: kop }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeInTheDocument();
    const link = page.getByRole("link", { name: terug.label });
    await expect.element(link).toBeInTheDocument();
    expect(link.element().getAttribute("href")).toBe(terug.href);

    // DE KERNASSERTIE van B16: dit is aantoonbaar níét het scherm van app/error.tsx.
    // Kwam de fout daar alsnog uit, dan stond hier "Something went wrong" — en had de
    // gebruiker de hele pagina verloren in plaats van één sectie.
    expect(container.textContent ?? "").not.toContain("Something went wrong");
  });
}

test("de wortelfallback blijft het generieke scherm — het paar is te onderscheiden", async () => {
  // Tegenproef bij de assertie hierboven: zonder deze test zou "Something went wrong"
  // overal weg kunnen zijn en zou de vergelijking niets meten. De wortelgrens noemt geen
  // sectie — hij weet niet welke, en dat is precies het verschil.
  const { container } = await renderServer(
    canvas(<RootError error={DB_FOUT} reset={GEEN_RESET} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();
  const tekst = container.textContent ?? "";
  expect(tekst).toContain("Something went wrong");
  for (const { kop } of SEGMENTEN) {
    expect(tekst).not.toContain(kop);
  }
});

// ── 3. Lekken doet het segmentscherm net zo min ──────────────────────────────

test("segmentgrens: de databasefout lekt niet, de digest wél", async () => {
  await renderServer(canvas(<DataError error={DB_FOUT} reset={GEEN_RESET} />));
  await expect
    .element(page.getByRole("heading", { name: "Data could not be loaded" }))
    .toBeInTheDocument();

  const tekst = document.body.textContent ?? "";
  // Dezelfde regressie als bij app/error.tsx: "even de melding erbij om te kunnen
  // debuggen" zet Postgres' kolomtaal op het scherm.
  expect(tekst).not.toContain("invalid input syntax");
  expect(tekst).not.toContain("uuid");
  expect(tekst).toContain("3068925283");
});

test("segmentgrens: zonder digest blijft de referentieregel weg", async () => {
  await renderServer(
    canvas(
      <ProjectsError error={{ name: "E", message: "x" } as Error} reset={GEEN_RESET} />,
    ),
  );
  await expect
    .element(page.getByRole("heading", { name: "Projects could not be loaded" }))
    .toBeInTheDocument();
  expect(document.body.textContent ?? "").not.toContain("Reference:");
});

// ── 4. Opnamen ───────────────────────────────────────────────────────────────
//
// De drie schermen zijn één component met een andere sectienaam (app/segment-error.tsx),
// dus licht/donker × mobiel/desktop staat één keer volledig — op Projects. Voor Data en
// Admin volstaat één opname elk: die bewijzen de bedrading (kop + weg terug), niet
// nogmaals de vormgeving. Twaalf bijna identieke PNG's zijn geen bewijs maar ruis.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`projects-error: opname (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(canvas(<ProjectsError error={DB_FOUT} reset={GEEN_RESET} />));
      await expect
        .element(page.getByRole("heading", { name: "Projects could not be loaded" }))
        .toBeInTheDocument();
      await page.screenshot({ path: `./projects-error.${theme}.${device}.test.png` });
    });
  }
}

test("data-error: opname (light, desktop)", async () => {
  await page.viewport(viewports.desktop.width, viewports.desktop.height);
  await renderServer(canvas(<DataError error={DB_FOUT} reset={GEEN_RESET} />));
  await expect
    .element(page.getByRole("heading", { name: "Data could not be loaded" }))
    .toBeInTheDocument();
  await page.screenshot({ path: "./data-error.light.desktop.test.png" });
});

test("admin-error: opname (dark, mobile)", async () => {
  await page.viewport(viewports.mobile.width, viewports.mobile.height);
  document.documentElement.classList.add("dark");
  await renderServer(canvas(<AdminError error={DB_FOUT} reset={GEEN_RESET} />));
  await expect
    .element(page.getByRole("heading", { name: "Admin could not be loaded" }))
    .toBeInTheDocument();
  await page.screenshot({ path: "./admin-error.dark.mobile.test.png" });
});
