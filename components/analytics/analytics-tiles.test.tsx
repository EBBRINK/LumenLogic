// White-box RSC-render tests van de negen Analytics-tegels (sprint 2.1 + 2.2).
// Patroon overgenomen uit components/data/event-log-block.test.tsx: vitest/browser +
// renderServer, licht/donker × mobiel/desktop, screenshots naast de testfile.
//
// Twee series screenshots, want besluit 4 ("geen data = No data yet") is een UI-belofte en
// moet dus zíchtbaar bewijs krijgen, niet alleen een assert:
//   - analytics-tiles.{theme}.{device}.test.png        — gevulde data
//   - analytics-tiles-empty.{theme}.{device}.test.png  — een volledig lege AnalyticsTiles
// En een derde, kleine serie:
//   - analytics-tiles-full.{theme}.desktop.test.png    — gevulde data, alle drie de blokken
//     in beeld (zie FULL_VIEWPORT hieronder; geen duplicaat van de eerste serie)
//
// LET OP bij het bekijken van de PNG's: de screenshot-omgeving schildert alléén de band tot
// aan de viewporthoogte; alles daaronder blijft wit/leeg op een verder wél volledig hoge
// canvas. Dat geldt voor élke screenshot in deze repo (vgl. components/data/*.test.png) en is
// dus geen layoutfout van deze pagina. Gevolg: op mobiel (812 px) zijn blok B en C niet in
// beeld; het volledige bewijs voor besluit 4 staat daarom op de desktop-PNG's, waar alle
// negen tegels binnen 800 px passen.
//
// De fixture is de echte meting van 30 jul 2026 (docs/plan-2.1-2.2-analytics.md §1 en §3),
// niet iets verzonnens: 1.428 events over 2–21 jul, 23 actors · matcher blauw 133 / rood 64 /
// groen 57 / open 22 / geel 11 / paars 11 (samen 298) · spec-regels 204 met 88/110/139/146/18
// gaten · 11 van 26 unieke zoekopdrachten zonder resultaat · 13 dossiers, 1 offerte, 3 regels.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import type { AnalyticsTiles } from "@/lib/repo/analytics-tiles";
import { AnalyticsTilesView } from "./analytics-tiles";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

/**
 * Extra hoge desktop-viewport voor de twee `-full`-screenshots onderaan. NIET dubbelop met
 * `viewports.desktop`: de screenshot-omgeving schildert alleen de band tot aan de
 * viewporthoogte, dus op 800 px staat van de GEVULDE pagina alleen blok A ("Steering") in
 * beeld. Blok B ("Where revenue is left on the table") en blok C ("Projects") vielen daar
 * onder en waren daardoor nooit mét data bekeken; alleen de lége pagina past binnen 800 px.
 *
 * 1600 px is hoger dan het headless browservenster (720 px). Dat is precies de bedoeling:
 * vitest schaalt de tester-iframe dan naar het venster in plaats van hem af te kappen, dus
 * de hele pagina komt op de PNG. Gemeten gevolg: de PNG is 576×720 (1280 × 720/1600 = 576)
 * en dus kleiner dan de andere screenshots — dat is de schaal, geen afgekapte render.
 */
const FULL_VIEWPORT = { width: 1280, height: 1600 } as const;

const EMPTY = "No data yet";

/**
 * Hoe vaak "No data yet" op het scherm staat. Via `expect.poll` en niet via een kale
 * `expect(...all()).toHaveLength(n)`: `renderServer` streamt, dus een synchrone telling direct
 * na de render telt een DOM die nog leeg is (gemeten: 0 in plaats van 9). Poll wacht mee.
 */
function verwachtLegeTegels(n: number) {
  return expect.poll(() => page.getByText(EMPTY).all().length).toBe(n);
}

/** Gevulde data — de meting van 30 jul 2026. */
const gevuld: AnalyticsTiles = {
  period: {
    from: "2026-07-02T09:41:00Z",
    to: "2026-07-21T14:23:00Z",
    totalEvents: 1428,
    actors: 23,
    activeDays: 9,
  },
  consideredProducts: [
    {
      brand: "XAL",
      name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K 220-240V",
      list: "aantoonbaar",
      count: 64,
    },
    {
      brand: "XAL",
      name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K 220-240V",
      list: "onvolledig",
      count: 21,
    },
    // Merkloos product: toetst de "Unknown brand"-terugval in de meta-regel.
    { brand: null, name: "SASSO 60 Adjustable", list: "onbekend", count: 7 },
  ],
  // De zes matcher-statussen; samen 298 matched_status-events.
  statusSplit: [
    { status: "blauw", count: 133 },
    { status: "rood", count: 64 },
    { status: "groen", count: 57 },
    { status: "open", count: 22 },
    { status: "geel", count: 11 },
    { status: "paars", count: 11 },
  ],
  // Kleine volumes; de grootste cel is kelvin/groen met 22 (plan §2).
  breakdown: [
    { field: "kelvin", verdict: "groen", count: 22 },
    { field: "watt", verdict: "rood", count: 18 },
    { field: "lumen", verdict: "geel", count: 14 },
    { field: "beamAngle", verdict: "onbekend", count: 6 },
  ],
  specGaps: [
    { field: "quantity", missing: 88, total: 204 },
    { field: "kelvin", missing: 110, total: 204 },
    { field: "watt", missing: 139, total: 204 },
    { field: "lumen", missing: 146, total: 204 },
    { field: "brand", missing: 18, total: 204 },
  ],
  searchHealth: { total: 26, withoutResults: 11 },
  brandsNotInCatalogue: [
    { brand: "Trilux", lines: 9 },
    { brand: "ETAP", lines: 8 },
    { brand: "BEGA", lines: 8 },
    { brand: "NORKA", lines: 5 },
    { brand: "Philips", lines: 4 },
    { brand: "Zumtobel", lines: 3 },
    { brand: "ewo", lines: 3 },
  ],
  // Vandaag staat de hele wachtrij op 'wachtend' (plan §3, tegel 7).
  brandLoadQueue: [
    { brand: "BEGA", demand: 16, status: "wachtend" },
    { brand: "ETAP", demand: 16, status: "wachtend" },
    { brand: "Trilux", demand: 16, status: "wachtend" },
    { brand: "Philips", demand: 8, status: "wachtend" },
  ],
  unmetDemand: [
    { query: "INFINITE PRO", count: 3 },
    { query: "i40", count: 2 },
    { query: "ORIONNOVA", count: 2 },
    { query: "PHANTOM DELUXE", count: 1 },
  ],
  projects: { dossiers: 13, quotes: 1, quoteLines: 3, specLines: 204 },
};

/** Besluit 4: alles leeg, alle tellingen 0, geen periode. Negen keer "No data yet". */
const leeg: AnalyticsTiles = {
  period: { from: null, to: null, totalEvents: 0, actors: 0, activeDays: 0 },
  consideredProducts: [],
  statusSplit: [],
  breakdown: [],
  specGaps: [],
  searchHealth: { total: 0, withoutResults: 0 },
  brandsNotInCatalogue: [],
  brandLoadQueue: [],
  unmetDemand: [],
  projects: { dossiers: 0, quotes: 0, quoteLines: 0, specLines: 0 },
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">{children}</main>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`analytics-tiles gevuld (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <AnalyticsTilesView data={gevuld} />
        </Screen>,
      );
      await expect.element(document.body).toBeInTheDocument();
      // De eerlijke band bovenaan noemt de meetperiode én het aantal events.
      await expect
        .element(page.getByText(/Test period .*1,428 events/))
        .toBeInTheDocument();
      // Gevulde data: nergens de lege tak.
      await verwachtLegeTegels(0);
      await page.screenshot({
        path: `./analytics-tiles.${theme}.${device}.test.png`,
      });
    });

    test(`analytics-tiles leeg (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <AnalyticsTilesView data={leeg} />
        </Screen>,
      );
      await expect.element(document.body).toBeInTheDocument();
      // Besluit 4, zichtbaar: negen tegels, negen keer "No data yet", niets weggevallen.
      await verwachtLegeTegels(9);
      await page.screenshot({
        path: `./analytics-tiles-empty.${theme}.${device}.test.png`,
      });
    });
  }
}

// De twee screenshots waarop de HELE gevulde pagina staat — de enige plek waar blok B en C
// met echte data zichtbaar zijn (zie de toelichting bij FULL_VIEWPORT). Weggooien als
// "duplicaat van analytics-tiles.{theme}.desktop" mag niet: die twee tonen alleen blok A.
for (const theme of ["light", "dark"] as const) {
  test(`analytics-tiles gevuld, hele pagina (${theme}, desktop)`, async () => {
    await page.viewport(FULL_VIEWPORT.width, FULL_VIEWPORT.height);
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderServer(
      <Screen>
        <AnalyticsTilesView data={gevuld} />
      </Screen>,
    );
    await expect.element(document.body).toBeInTheDocument();
    await verwachtLegeTegels(0);

    // Blok B staat er én is gevuld: de kop, plus een merk dat alléén in
    // brandsNotInCatalogue voorkomt (NORKA, 5 spec-regels). Tellen via `expect.poll`,
    // want direct na `renderServer` streamt de RSC-render nog.
    await expect
      .element(page.getByText("Where revenue is left on the table"))
      .toBeInTheDocument();
    await expect
      .poll(() => page.getByText("NORKA", { exact: true }).all().length)
      .toBe(1);
    // En de derde tegel van blok B ("Unmet product demand") is ook echt gevuld.
    await expect
      .element(page.getByText("ORIONNOVA", { exact: true }))
      .toBeInTheDocument();

    // Blok C staat er én is gevuld: 13 dossiers uit `projects`. `exact: true`, anders
    // matcht "13" ook 133 (blauw) en 139 (watt-gat) uit blok A.
    await expect
      .poll(() => page.getByText("13", { exact: true }).all().length)
      .toBe(1);
    await expect
      .element(page.getByText("projects", { exact: true }))
      .toBeInTheDocument();

    await page.screenshot({
      path: `./analytics-tiles-full.${theme}.desktop.test.png`,
    });
  });
}

test("band: de testperiode staat er en noemt de events, actors en de eerlijke disclaimer", async () => {
  await renderServer(
    <Screen>
      <AnalyticsTilesView data={gevuld} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Test period 2.21 Jul 2026/))
    .toBeInTheDocument();
  await expect.element(page.getByText(/1,428 events/)).toBeInTheDocument();
  await expect.element(page.getByText(/23 actors/)).toBeInTheDocument();
  await expect
    .element(page.getByText(/our own test data, not user behaviour/))
    .toBeInTheDocument();
});

test("besluit 4: een volledig lege AnalyticsTiles rendert negen keer 'No data yet' zonder te crashen", async () => {
  await renderServer(
    <Screen>
      <AnalyticsTilesView data={leeg} />
    </Screen>,
  );
  await verwachtLegeTegels(9);
  // De koppen blijven staan: geen tegel verdwijnt stilzwijgend.
  for (const title of [
    "Most considered products",
    "Matcher status split",
    "Where matches break down",
    "Gaps in spec lines",
    "Queries without results",
    "Requested brands not in the catalogue",
    "Brand load queue by demand",
    "Unmet product demand",
    "Projects & quotes",
  ]) {
    await expect.element(page.getByText(title).first()).toBeInTheDocument();
  }
  // En de band crasht niet op from/to = null: hij begint dan gewoon bij de tellingen.
  await expect.element(page.getByText(/0 events/)).toBeInTheDocument();
});

test("DESIGN.md §7: elke statuskleur draagt ook een zichtbaar tekstlabel", async () => {
  await renderServer(
    <Screen>
      <AnalyticsTilesView data={gevuld} />
    </Screen>,
  );
  // Assert op de tekst, niet op de klasse: het bolletje is aria-hidden en puur decoratief,
  // dus de betekenis moet uit het label komen. Zes statussen = zes labels.
  for (const label of ["Blue", "Red", "Green", "Open", "Yellow", "Purple"]) {
    await expect.element(page.getByText(label).first()).toBeInTheDocument();
  }
  // Idem voor de veld-oordelen in "Where matches break down".
  await expect
    .element(page.getByText("Colour temperature").first())
    .toBeInTheDocument();
  await expect.element(page.getByText("Unknown").first()).toBeInTheDocument();
  // En voor de wachtrij: de status staat als woord in de meta-regel, niet als kleur.
  await expect
    .element(page.getByText(/Waiting · demand/).first())
    .toBeInTheDocument();
});

test("searchHealth met 0 mislukte query's is échte data, geen lege tegel", async () => {
  // Alleen `total = 0` is leeg. `{ total: 5, withoutResults: 0 }` betekent: vijf unieke
  // zoekopdrachten, allemaal raak — dat is het beste denkbare resultaat en mag nooit als
  // "No data yet" wegvallen. De rest van de fixture is leeg, dus de telling maakt het hard:
  // acht lege tegels in plaats van negen.
  await renderServer(
    <Screen>
      <AnalyticsTilesView
        data={{ ...leeg, searchHealth: { total: 5, withoutResults: 0 } }}
      />
    </Screen>,
  );
  await verwachtLegeTegels(8);
  // `exact: true` is hoofdlettergevoelig: dit is het kleine eenheidslabel onder het getal,
  // niet de kop "Queries without results" van dezelfde tegel.
  await expect
    .element(page.getByText("queries without results", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("0% of 5 queries"))
    .toBeInTheDocument();
});

test("gevulde tegels tonen de gemeten cijfers, ontdubbeld en met de juiste eenheid", async () => {
  await renderServer(
    <Screen>
      <AnalyticsTilesView data={gevuld} />
    </Screen>,
  );
  // Tegel 5 telt unieke querytekst; kop en eenheid zeggen allebei "queries".
  await expect
    .element(page.getByText("Queries without results", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("42% of 26 queries"))
    .toBeInTheDocument();
  // Tegel 1: merkloos product valt terug op "Unknown brand", de lijst wordt Engels.
  await expect
    .element(page.getByText(/Unknown brand · unknown/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/XAL · provable/))
    .toBeInTheDocument();
  // Tegel 4: gat + totaal + percentage staan in tekst naast het balkje.
  await expect
    .element(page.getByText(/146 of 204 · 72%/))
    .toBeInTheDocument();
  // Tegel 9: enkelvoud/meervoud klopt (1 quote, niet "1 quotes").
  await expect.element(page.getByText("quote", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("spec lines").first()).toBeInTheDocument();
});
