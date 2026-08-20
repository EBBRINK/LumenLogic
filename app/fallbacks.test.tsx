// White-box RSC-tests van de twee root-fallbacks (UX-audit 30 jul, bug #1):
// not-found.tsx en error.tsx. Tot deze sprint had de app géén van de twee: een
// onbekende URL gaf Next' kale "404 | This page could not be found." en een
// serverfout een volledige 500-pagina buiten de navbalk en buiten de huisstijl.
//
// Een root loading.tsx is bewust NIET meegekomen. Gemeten op de dev-server
// (Next 16.2.10, zelfde URL met en zonder het bestand): een root
// loading-boundary commit de HTTP-status vóór de pagina resolveert, dus
// /products/<geen-uuid> gaf 200 in plaats van 404 en een uitgelogde /projects
// 200 in plaats van 307. Dat sloopt precies wat deze bug repareert.
//
// CORRECTIE op het vorige advies hier ("dan gescopeerd in een route-group"): dat
// werkt niet. Zowel requireUuid() als requireSession() (die redirect("/login")
// doet) draaien BINNEN de pagina, dus ónder elke loading-boundary op layout-niveau
// — een route-group-loading.tsx loopt tegen exact dezelfde muur en commit de status
// net zo hard. Wachtstand voor de trage schermen (/brand-management scant ~210k
// rijen) hoort daarom in een <Suspense>-grens BINNEN de pagina, ná de sessie- en
// uuid-check: dan staat de status al vast voordat de fallback in beeld komt.
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
import GlobalError from "./global-error";
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

// ── Foutgrens boven de root-layout ───────────────────────────────────────────
//
// app/error.tsx hangt ÓNDER app/layout.tsx en vangt die layout dus niet. Klapt de layout
// zelf — en die haalt next/font/google over het netwerk op — of klapt error.tsx, dan gaf
// Next zonder global-error.tsx alsnog zijn eigen kale ongestileerde 500-pagina: precies
// het symptoom waar bug #1 over gaat, één niveau hoger. Deze grens ontbrak in de eerste
// ronde en is er nu.
//
// DERDE HARNASGRENS, gemeten op 30 jul (vitest-plugin-rsc 0.2.3), en de reden dat hier
// GEEN licht/donker-paar staat maar twee opnamen. global-error VERVANGT de root-layout en
// rendert dus zijn eigen <html>/<body> — Next eist dat daar. Wat de harnas ermee doet:
//  · renderServer hangt de boom in een container-<div>; React laat <html> en <body> dan
//    VALLEN. Na de render staat er geen genest <html>/<body> meer in de DOM (nagemeten met
//    querySelector), alleen hun kinderen. React logt daarbij "In HTML, <html> cannot be a
//    child of <div>" — console-ruis van de harnas, geen defect: de inhoud rendert en alle
//    assertions hieronder draaien er overheen. Ga die melding dus NIET "oplossen" door het
//    <html> uit global-error.tsx te halen; daar is het verplicht.
//  · Met de <body> vallen ook zijn klassen weg (bg-background text-foreground), dus de
//    donkere stand is hier niet op te wekken: een `dark`-opname wás een lichte opname met
//    een donkere bestandsnaam. Nagemeten: --background op de buitenste html stond wél op
//    #0f1626, de inhoud pakte hem alleen niet meer op.
//  · canvas() eromheen zetten als plaatsvervangend <body> lost dat NIET op — dan rendert
//    React de boom helemaal niet meer en lopen alle zes tests in een timeout. Ook gemeten;
//    niet opnieuw proberen.
// Twee eerlijke opnamen dus, mobiel + desktop, in de stand die de harnas kan tonen. De
// donkere stand van dit scherm is één-op-één die van error.tsx — zelfde markup, zelfde
// tokens — en die staat hierboven wél in vier opnamen.
for (const [device, viewport] of Object.entries(viewports)) {
  test(`global-error: eigen shell, zelfde uitwegen (${device})`, async () => {
    await page.viewport(viewport.width, viewport.height);
    await renderServer(<GlobalError error={DB_FOUT} reset={GEEN_RESET} />);

    await expect
      .element(page.getByRole("heading", { name: "Something went wrong" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeInTheDocument();
    const terug = page.getByRole("link", { name: "Back to projects" });
    await expect.element(terug).toBeInTheDocument();
    expect(terug.element().getAttribute("href")).toBe("/projects");

    await page.screenshot({ path: `./global-error.${device}.test.png` });
  });
}

test("global-error: lekt net zo min als error.tsx — digest wél, melding niet", async () => {
  // Dezelfde regressie als bij error.tsx ("even de melding erbij voor het debuggen"),
  // en juist hier verleidelijker: dit is het scherm waarop niets meer werkt.
  await renderServer(<GlobalError error={DB_FOUT} reset={GEEN_RESET} />);
  await expect
    .element(page.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();

  const tekst = document.body.textContent ?? "";
  expect(tekst).not.toContain("invalid input syntax");
  expect(tekst).not.toContain("uuid");
  expect(tekst).toContain("3068925283");
});

test("global-error: zonder digest blijft de referentieregel weg", async () => {
  await renderServer(
    <GlobalError error={{ name: "E", message: "x" } as Error} reset={GEEN_RESET} />,
  );
  await expect
    .element(page.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();
  expect(document.body.textContent ?? "").not.toContain("Reference:");
});
