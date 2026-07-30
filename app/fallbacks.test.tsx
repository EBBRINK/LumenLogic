// White-box RSC-tests van de twee root-fallbacks (UX-audit 30 jul, bug #1):
// not-found.tsx en error.tsx. Tot deze sprint had de app géén van de twee: een
// onbekende URL gaf Next' kale "404 | This page could not be found." en een
// serverfout een volledige 500-pagina buiten de navbalk en buiten de huisstijl.
//
// Een root loading.tsx is bewust NIET meegekomen. Gemeten op de dev-server
// (Next 16.2.10, zelfde URL met en zonder het bestand): een root
// loading-boundary commit de HTTP-status vóór de pagina resolveert, dus
// /products/<geen-uuid> gaf 200 in plaats van 404 en een uitgelogde /projects
// 200 in plaats van 307. Dat sloopt precies wat deze bug repareert. Wachtstand
// voor de trage schermen (/data/brand-relations scant ~210k rijen) hoort dus
// gescopeerd in een route-group, niet in de root.
//
// Screenshots licht/donker × mobiel/desktop, zoals elke feature. De belangrijkste
// assertie staat bij error.tsx: de foutmelding zelf mag NIET in beeld komen.
//
// TWEE GRENZEN VAN DE HARNAS, gemeten op 30 jul (vitest-plugin-rsc 0.2.3), zodat een
// volgende bouwer ze niet nóg eens uitzoekt:
//  1. Een SERVER-component die next/link importeert is hier niet in te laden — de
//     react-server-build van Link klapt met "client reference export is called on
//     server". Daarom staat er in not-found.tsx een kale <a>; zie de toelichting daar.
//  2. renderServer stuurt props van een CLIENT-component door een RSC-payload, dus
//     ze moeten serialiseerbaar zijn. Een echte Error-instantie en een kale
//     reset-closure zijn dat niet: het scherm rendert dan leeg. error.tsx krijgt hier
//     dus een serialiseerbare fout-stand-in en reset=undefined. Gevolg: dat de knop
//     reset() aanroept is met deze harnas NIET te testen — die regel is één
//     onClick={reset} en staat onbewaakt.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import ErrorBoundary from "./error";
import NotFound from "./not-found";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// De root-layout is niet meegerenderd (die trekt next/font mee); het canvas eromheen
// wordt hier nagebootst, zodat de kleuren in de screenshot echt die van de app zijn.
function canvas(children: React.ReactNode) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {children}
    </div>
  );
}

// De fout zoals productie hem gooide (bug #1: de uuid-cast). Precies deze tekst mag
// de gebruiker nooit zien. Als plat object i.p.v. new Error() — zie grens 2 hierboven.
const DB_FOUT = {
  name: "Error",
  message: 'invalid input syntax for type uuid: "nope"',
  digest: "3068925283",
} as unknown as Error & { digest?: string };

const GEEN_RESET = undefined as unknown as () => void;

// ── 404 ──────────────────────────────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`not-found: uitleg + weg terug (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(canvas(<NotFound />));

      await expect
        .element(page.getByRole("heading", { name: "This page does not exist" }))
        .toBeInTheDocument();
      const terug = page.getByRole("link", { name: "Back to projects" });
      await expect.element(terug).toBeInTheDocument();
      expect(terug.element().getAttribute("href")).toBe("/projects");

      await page.screenshot({ path: `./not-found.${theme}.${device}.test.png` });
    });
  }
}

// ── Foutgrens ────────────────────────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`error: twee uitwegen (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        canvas(<ErrorBoundary error={DB_FOUT} reset={GEEN_RESET} />),
      );

      await expect
        .element(page.getByRole("heading", { name: "Something went wrong" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Try again" }))
        .toBeInTheDocument();
      const terug = page.getByRole("link", { name: "Back to projects" });
      await expect.element(terug).toBeInTheDocument();
      expect(terug.element().getAttribute("href")).toBe("/projects");

      await page.screenshot({ path: `./error.${theme}.${device}.test.png` });
    });
  }
}

test("error: de databasefout lekt niet naar de gebruiker, de digest wél", async () => {
  await renderServer(canvas(<ErrorBoundary error={DB_FOUT} reset={GEEN_RESET} />));
  await expect
    .element(page.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();

  const tekst = document.body.textContent ?? "";
  // Dít is de regressie die deze test moet tegenhouden: "even de melding erbij
  // zetten om te kunnen debuggen" zet Postgres' kolomtaal op het scherm.
  expect(tekst).not.toContain("invalid input syntax");
  expect(tekst).not.toContain("uuid");
  // De digest is Next' eigen hash, geen inhoud — die is juist nodig om de melding
  // aan een serverlog te kunnen koppelen.
  expect(tekst).toContain("3068925283");
});

test("error: zonder digest blijft de referentieregel weg", async () => {
  await renderServer(
    canvas(<ErrorBoundary error={{ name: "E", message: "x" } as Error} reset={GEEN_RESET} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();
  expect(document.body.textContent ?? "").not.toContain("Reference:");
});
