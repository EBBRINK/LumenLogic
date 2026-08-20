// De prijsloze estimate op het SCHERM (sprint 3.2b).
//
// Twee soorten bewijs, en de eerste is de eis: er staat nul bedragen in de GERENDERDE
// DOM — niet "de prop stond op false", niet "de tak werd niet genomen", maar: lees de
// tekst die een externe gebruiker daadwerkelijk ziet en zoek er een bedrag in. De
// tweede is de gewone huisregel: licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { computeEstimate, type EstimateHeader, type EstimateLine } from "@/lib/repo/estimate";
import { toPricelessEstimate } from "@/lib/repo/estimate-extern";
import { QuoteView } from "./quote-view";
import { ExternalQuoteView } from "./quote-view-extern";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const header: EstimateHeader = {
  quoteNumber: "BL-2026-0042",
  quoteDate: "2026-07-07",
  customer: "Deerns",
  projectRef: "PRJ-42",
  author: "tester@voorbeeld.nl",
  validUntil: "2026-08-07",
};

// Álle statussen, twee zones, een regel zonder aantal, een verlopen dagprijs mét
// terugval en een paarse regel met een prijs die nooit had mogen meetellen. Elke manier
// waarop dit systeem een bedrag op het scherm zet, staat hierin.
const lines: EstimateLine[] = [
  {
    id: "l1", fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12,
    productName: "SASSO 100 SQ SP CEIL 2700K", sku: "L360-SASSO100",
    unitPrice: "310.00", brandText: "XAL", productText: "SASSO 100",
  },
  {
    id: "l2", fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8,
    productName: "SCAVA WALL SURF 1.0 3000K", sku: "L092-SCAVA",
    unitPrice: "226.00", brandText: "Wever & Ducré", productText: "SCAVA 1.0",
    autoAccepted: true,
    deviations: [
      { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
    ],
  },
  {
    id: "l3", fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5,
    productName: null, sku: null, unitPrice: null, brandText: "Kreon", productText: "Prologe 80",
  },
  {
    id: "l4", fixtureCode: "Lv700", zone: "A-08", status: "groen", quantity: 3,
    productName: "SPLITBOX 3 TRIMLESS 2700K", sku: "L210-SPLITBOX",
    unitPrice: "120.00", dayPriceExpiredOn: "2020-06-30",
    brandText: "Delta Light", productText: "SPLITBOX 3", manuallyChosen: true,
  },
  {
    id: "l5", fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3,
    productName: null, sku: null, unitPrice: null, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)",
  },
  {
    id: "l6", fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2,
    productName: "Wandcontactdoos wit", sku: "WCD-01", unitPrice: "500.00",
    brandText: null, productText: "WCD",
  },
  {
    id: "l7", fixtureCode: "Lp302", zone: "B-02", status: "groen", quantity: null,
    productName: "SASSO 60 2700K", sku: "L360-SASSO60", unitPrice: "100.00",
    brandText: "XAL", productText: "SASSO 60",
  },
  {
    id: "l8", fixtureCode: "Lo400", zone: "B-02", status: "open", quantity: 4,
    productName: null, sku: null, unitPrice: null, brandText: "Modular", productText: "Smart Tubed 82",
  },
];

const estimate = toPricelessEstimate({
  dossier: { name: "Ziekenhuis Noord" },
  header,
  lines,
  computed: computeEstimate(header, lines),
});

/**
 * Dezelfde bedragen-zeef als lib/pdf/estimate-extern.test.ts: op de VORM van een bedrag
 * (euroteken of twee decimalen), niet op losse cijfers — aantallen, zones (A-08),
 * artikelcodes en productnamen dragen die ook.
 */
const BEDRAG_PATRONEN: { naam: string; patroon: RegExp }[] = [
  { naam: "euroteken", patroon: /€/ },
  { naam: "bedrag met decimaalkomma", patroon: /\d[\d.]*,\d{2}(?!\d)/ },
  { naam: "bedrag met decimaalpunt", patroon: /\d+\.\d{2}(?!\d)/ },
];

function bedragenIn(tekst: string): string[] {
  return BEDRAG_PATRONEN.filter(({ patroon }) => patroon.test(tekst)).map(
    ({ naam, patroon }) => `${naam}: ${tekst.match(patroon)?.[0]}`,
  );
}

/**
 * Renderen én wáchten tot de DOM er echt staat.
 *
 * `renderServer()` keert terug voordat React heeft gecommit, dus een synchrone
 * `document.querySelector` direct erna leest een lege `<body>`. Dat is hier geen detail:
 * élke assertie in dit bestand heeft de vorm "er staat GEEN bedrag", en die is op een
 * lege body gratis waar. Zonder deze wachtstap zou dit bestand een prijslek nooit
 * kunnen zien — precies waar het voor bestaat. (De eerste versie deed dit fout; de
 * omgekeerde toets op het interne scherm hieronder heeft dat opgevangen.)
 */
async function toonEnWacht(ui: React.ReactElement, anker: string) {
  await renderServer(ui);
  await expect.element(page.getByText(anker, { exact: false })).toBeInTheDocument();
}

// ── Het vangnet onder de test ────────────────────────────────────────────────

test("het INTERNE scherm valt wél door de bedragen-zeef (anders bewijst de test hieronder niets)", async () => {
  await toonEnWacht(
    <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={lines} />,
    "Request order is preserved",
  );
  expect(bedragenIn(document.body.textContent ?? "").length).toBeGreaterThan(0);
});

// ── De eis ────────────────────────────────────────────────────────────────────

test("het EXTERNE scherm toont nul bedragen, en wél regels, aantallen en statussen", async () => {
  await toonEnWacht(
    <ExternalQuoteView estimate={estimate} phase="tender" />,
    "Request order is preserved",
  );
  const tekst = document.body.textContent ?? "";

  expect(
    bedragenIn(tekst),
    "er staat een bedrag op het externe scherm — dat is een prijslek naar de partij " +
      "die de prijzen juist niet mag zien (ijzeren regel 1 en 4)",
  ).toEqual([]);

  // De geldkolommen bestaan niet, ook niet leeg.
  expect(tekst).not.toContain("Unit price");
  expect(tekst).not.toContain("Line total");
  expect(tekst).not.toContain("Combined");
  expect(tekst).not.toContain("Shown, not totaled");
  expect(tekst).not.toContain("Gross prices");
  // "p.m." en "ea." zijn de twee plaatshouders die op de plek van een BEDRAG staan.
  expect(tekst).not.toContain("p.m.");
  // Het vervalmerkteken van de dagprijs gaat over welke prijsbron gebruikt is.
  expect(tekst).not.toContain("day price expired");

  // Zes koppen, niet acht.
  const koppen = Array.from(document.querySelectorAll("thead th")).map((th) =>
    th.textContent?.trim(),
  );
  expect(koppen).toEqual(["#", "Code", "Product", "SKU", "Quantity", "Status"]);

  // Wat er wél hoort te staan — anders is "nul bedragen" ook waar voor een leeg vel.
  expect(tekst).toContain("Ziekenhuis Noord");
  expect(tekst).toContain("BL-2026-0042");
  expect(tekst).toContain("Lp301");
  expect(tekst).toContain("SASSO 100 SQ SP CEIL 2700K");
  expect(tekst).toContain("L360-SASSO100");
  expect(tekst).toContain("Zone A-08");
  expect(tekst).toContain("Zone B-02");
  // Afwijkingsnotitie en merktekens: spec-transparantie blijft (C-07).
  expect(tekst).toContain("3000K i.p.v. 2700K");
  expect(tekst).toContain("automatically accepted near-match");
  expect(tekst).toContain("manually chosen");
  // Open punten met de prijsloze zinnen.
  expect(tekst).toContain("Open items & actions");
  expect(tekst).toContain("brand still to be loaded");
  expect(tekst).toContain("Pricing is not included");

  // Álle vier de p.m.-regels staan in de verantwoording — prijsloos mag geen synoniem
  // worden voor "korter". Dit is dezelfde eis als A4 op het interne stuk: wat niet
  // meetelt, staat verantwoord.
  const punten = Array.from(document.querySelectorAll("section > ul > li")).map((li) =>
    li.textContent?.trim(),
  );
  expect(punten).toHaveLength(4);
  for (const code of ["Lb110", "Lr050", "Lx900", "Lo400"]) {
    expect(punten.some((p) => p?.startsWith(code)), code).toBe(true);
  }
});

test("álle acht regels staan er, in aanvraagvolgorde — er wordt niets weggelaten", async () => {
  // Prijsloos mag geen synoniem worden voor "ingekort". De aanvraagvolgorde is heilig
  // (BUILD-PLAN §4.3) en geldt hier net zo goed.
  await toonEnWacht(
    <ExternalQuoteView estimate={estimate} phase="tender" />,
    "Request order is preserved",
  );
  const codes = Array.from(document.querySelectorAll("tbody tr"))
    .map((tr) => tr.querySelectorAll("td")[1]?.textContent?.trim())
    .filter((c): c is string => !!c && /^L/.test(c));
  expect(codes).toEqual([
    "Lp301",
    "Lw201",
    "Lb110",
    "Lv700",
    "Lr050",
    "Lx900",
    "Lp302",
    "Lo400",
  ]);
});

test("statuskleuren blijven zichtbaar: elke regel draagt zijn badge", async () => {
  await toonEnWacht(
    <ExternalQuoteView estimate={estimate} phase="tender" />,
    "Request order is preserved",
  );
  // De statuscel is de laatste kolom; StatusBadge hangt zijn betekenis in een Hint
  // (`role="tooltip"`), dus dat is meteen het bewijs dat het de gedeelde badge is en
  // geen los stukje tekst. Stond hier eerst als `span[title]` — sinds de demo van
  // 12 aug is dat geen `title` meer, want de browservertraging daarvan (~2 s) is niet
  // in te stellen; zie components/ui/hint.tsx.
  const badges = Array.from(
    document.querySelectorAll('tbody tr > td:last-child [role="tooltip"]'),
  ).map((tip) => tip.previousElementSibling!);
  expect(badges).toHaveLength(8); // acht regels, acht badges
  const woorden = badges.map((b) => b.textContent?.trim());
  for (const w of ["Green", "Yellow", "Blue", "Red", "Purple", "Open"]) {
    expect(woorden, `status ${w} hoort zichtbaar te zijn`).toContain(w);
  }
  // En het bolletje dat de kleur draagt zit erin (DESIGN.md §11: kleur is nooit het
  // enige onderscheid — het woord staat ernaast, en dat is hierboven al getoetst).
  expect(
    badges.filter((b) => b.querySelector("span[aria-hidden]")),
  ).toHaveLength(8);
});

test("een leeg dossier krijgt de gedeelde lege toestand, zonder bedragen", async () => {
  const leeg = toPricelessEstimate({
    dossier: { name: "Leeg project" },
    header,
    lines: [],
    computed: computeEstimate(header, []),
  });
  await toonEnWacht(
    <ExternalQuoteView estimate={leeg} phase="tender" />,
    "No spec lines yet.",
  );

  expect(document.querySelector('[data-slot="empty-state"]')).not.toBeNull();
  expect(bedragenIn(document.body.textContent ?? "")).toEqual([]);
});

// ── Licht/donker × mobiel/desktop ─────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`estimate extern (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background p-6 text-foreground">
          <main className="mx-auto w-full max-w-7xl">
            <ExternalQuoteView estimate={estimate} phase="tender" />
          </main>
        </div>,
      );
      // 1. INHOUD: een SKU uit de regels zelf, niet uit de wrapper (B11).
      await expect
        .element(page.getByText("L360-SASSO100").first())
        .toBeInTheDocument();
      // 2. VOLLEDIGHEID: de RSC-stream levert dit stuk in delen en de voettekst is het
      //    laatste element — die is dus het startsein voor de schoten. Zelfde aanpak als
      //    components/dossier/estimate.test.tsx; een SKU staat bovenaan en bewijst niets
      //    over de open-punten-lijst onderaan.
      await expect
        .element(page.getByText(/Request order is preserved/).first())
        .toBeInTheDocument();
      // De screenshot is het zicht; deze assertie is het bewijs dat er ook in déze
      // stand (donker, mobiel) geen bedrag doorheen glipt — over het HELE document,
      // niet alleen over wat er toevallig in beeld staat.
      expect(bedragenIn(document.body.textContent ?? "")).toEqual([]);
      await page.screenshot({
        path: `./estimate-extern.${theme}.${device}.test.png`,
      });
      // Chromium schiet alleen wat in beeld staat. "Open items & actions" en de
      // voettekst staan onder de vouw, dus daar hoort een tweede schot bij.
      if (document.body.scrollHeight > viewport.height) {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 60));
        await page.screenshot({
          path: `./estimate-extern.${theme}.${device}.onderkant.test.png`,
        });
      }
    });
  }
}
