// Screenshot-tests voor run 2/3-schermen: werkvoorbereider (gelijkwaardigheidsengine),
// armaturenboek (projectleider) en analytics (Fase-2-fundament). Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { AnalyticsView } from "@/components/analytics-view";
import { ArmaturenboekView } from "./armaturenboek-view";
import { WerkvoorbereiderView } from "./werkvoorbereider-view";
import type { WerkvoorbereiderLine } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const merkOpgave = "merk-opgave";
const wvLines: WerkvoorbereiderLine[] = [
  {
    specLineId: "s1", fixtureCode: "Lp301", quantity: 12,
    referenceName: "SASSO 100 SQ SP CEIL 3000K", referenceBrand: "XAL",
    alternatives: [
      {
        id: "a1", name: "Esprit ceiling CRI90 3000K", brandName: "Kreon",
        articleCode: "KR-ESP", kelvin: 3000, grossPrice: "699.00",
        equivalenceScore: 3, rationale: "Gelijkwaardig spot 3000K — beter op garantie, levensduur (epd)",
        technical: [
          { label: "Kleurtemperatuur", reference: "3000", candidate: "3000", verdict: "equal", source: merkOpgave },
          { label: "CRI", reference: null, candidate: "90", verdict: "unknown", source: merkOpgave },
          { label: "IP-waarde", reference: "IP20", candidate: "IP20", verdict: "equal", source: merkOpgave },
        ],
        sustainability: [
          { label: "Garantie", reference: "36 mnd", candidate: "120 mnd", verdict: "better", source: merkOpgave },
          { label: "Repareerbaarheid", reference: "C", candidate: "A", verdict: "unknown", source: merkOpgave },
          { label: "Levensduur (EPD)", reference: "35000 u", candidate: "100000 u", verdict: "better", source: merkOpgave },
          { label: "Herkomst", reference: "Oostenrijk", candidate: "België", verdict: "unknown", source: merkOpgave },
        ],
      },
    ],
  },
];

const armatuurRows = [
  { fixtureCode: "Lp301", quantity: 12, brand: "XAL", productName: "SASSO 100 SQ SP CEIL 3000K", articleCode: "L360048-33100111S", kelvin: 3000, cri: null, ip: null, status: "groen" as const },
  { fixtureCode: "Lw201", quantity: 8, brand: "Wever & Ducré", productName: "SCAVA WALL SURF 1.0", articleCode: "L092W350188W3", kelvin: null, cri: 90, ip: null, status: "geel" as const },
  { fixtureCode: "Ls001", quantity: 4, brand: null, productName: null, articleCode: null, kelvin: null, cri: null, ip: null, status: "rood" as const },
];

const analytics = {
  totalEvents: 33,
  actionCounts: [
    { action: "search", count: 17 }, { action: "match", count: 5 },
    { action: "suggestions", count: 4 }, { action: "quote_generated", count: 3 },
    { action: "dossier_created", count: 2 }, { action: "no_match", count: 2 },
  ],
  topSearches: [
    { query: "SASSO 100", count: 5 }, { query: "INFINITE PRO", count: 3 },
    { query: "SCAVA 1.0", count: 3 },
  ],
  topMatched: [
    { brand: "XAL", name: "SASSO 100 SQ SP CEIL 3000K", count: 2 },
    { brand: "Wever & Ducré", name: "SCAVA WALL SURF 1.0", count: 1 },
  ],
  recent: [
    { action: "match", entity: "spec_line", actor: "hello@brink", createdAt: "", payload: { productId: "x" } },
    { action: "search", entity: "spec_line", actor: "hello@brink", createdAt: "", payload: { query: "SASSO 100" } },
  ],
};

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>;
}

afterEach(() => document.documentElement.classList.remove("dark"));

const screens = {
  werkvoorbereiding: (
    <Screen>
      <WerkvoorbereiderView dossierName="Deerns armaturenboek (demo)" lines={wvLines} />
    </Screen>
  ),
  armaturenboek: (
    <Screen>
      <ArmaturenboekView dossierName="Deerns armaturenboek (demo)" customer="Deerns" rows={armatuurRows} />
    </Screen>
  ),
  analytics: (
    <Screen>
      <AnalyticsView data={analytics} />
    </Screen>
  ),
} as const;

// Ankerassertie per scherm: iets dat aantoonbaar uit de component zélf komt (uit de
// fixture-data, niet uit de <Screen>-wrapper hierboven). `await expect.element(...)`
// retryt, dus het wacht de streamende RSC-render af. Zonder dit anker was
// `expect.element(document.body)` de enige assertie — en die is per definitie waar:
// met alle drie de views op `return null` bleven deze 12 tests groen (gemeten).
const anchors: Record<keyof typeof screens, string | RegExp> = {
  // Naam van het alternatief, uit EquivalenceTable — dus dieper dan de kop.
  werkvoorbereiding: "Esprit ceiling CRI90 3000K",
  // Artikelnummer van de groene regel; komt alleen uit de tabelrij.
  armaturenboek: "L360048-33100111S",
  // Een zoekterm uit de topSearches-lijst.
  analytics: "INFINITE PRO",
};

// Mobiel anker erbij waar het gewone anker wél in de DOM staat maar niet op de fóto. De
// armaturenboek-tabel zit op 375px in `overflow-x-auto`: Art. no., Color temp., CRI, IP en
// Status vallen buiten beeld, dus het artikelnummer hierboven bewijst niets over wat de
// menselijke poort (de screenshot bekijken) te zien krijgt. De productkolom is er wél, dus
// daar ankeren we mobiel bij. NB: de horizontale overloop zelf is een aparte bevinding en
// wordt hier niet opgelost — dit anker meet alleen eerlijk wat er nú op de foto staat.
const mobileAnchors: Partial<Record<keyof typeof screens, string | RegExp>> = {
  armaturenboek: "no match in catalog", // productkolom van de rode (onopgeloste) regel
};

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect
          .element(page.getByText(anchors[name as keyof typeof screens]).first())
          .toBeInTheDocument();
        const mobiel =
          device === "mobile"
            ? mobileAnchors[name as keyof typeof screens]
            : undefined;
        if (mobiel) {
          await expect.element(page.getByText(mobiel).first()).toBeInTheDocument();
        }
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// ── Inhoudstests: deze drie schermen hadden vóór 2.5a nul inhoudelijke dekking ──────
// WerkvoorbereiderView, ArmaturenboekView en AnalyticsView kwamen in géén enkel ander
// testbestand voor; het hele bestand had één `expect`, en die was de tautologie.

test("WerkvoorbereiderView: toont de gelijkwaardigheidsvergelijking met verdicts en score", async () => {
  await renderServer(
    <Screen>
      <WerkvoorbereiderView dossierName="Deerns armaturenboek (demo)" lines={wvLines} />
    </Screen>,
  );
  // Rolkop + fase: value engineering leeft alleen in gegund-stand (ijzeren regel 4).
  await expect.element(page.getByText("Work preparation")).toBeInTheDocument();
  await expect.element(page.getByText("Awarded")).toBeInTheDocument();
  // De referentieregel: code, aantal en het referentieproduct.
  await expect
    .element(page.getByText(/Lp301 · 12× XAL SASSO 100 SQ SP CEIL 3000K/))
    .toBeInTheDocument();
  // Het alternatief zelf: merk, naam, score en onderbouwing.
  await expect.element(page.getByText("Kreon")).toBeInTheDocument();
  await expect.element(page.getByText("Esprit ceiling CRI90 3000K")).toBeInTheDocument();
  await expect.element(page.getByText(/equivalence 3\.0/)).toBeInTheDocument();
  await expect
    .element(page.getByText(/beter op garantie, levensduur \(epd\)/))
    .toBeInTheDocument();
  // Prijs staat er informatief, mét het bordje dat hij niet meeweegt (regel 2).
  await expect.element(page.getByText("€ 699,00")).toBeInTheDocument();
  await expect
    .element(page.getByText("price — not in the weighting"))
    .toBeInTheDocument();
  // De verdict-labels, geteld: 2× better (garantie, levensduur), 2× equal
  // (kleurtemperatuur, IP), 3× "no data" (CRI, repareerbaarheid, herkomst).
  // `expect.poll`, want renderServer streamt (zie analytics-tiles.test.tsx:52-57).
  await expect.poll(() => page.getByText("↑ better").all().length).toBe(2);
  await expect.poll(() => page.getByText("= equal").all().length).toBe(2);
  await expect.poll(() => page.getByText("— no data").all().length).toBe(3);
  // Beide vergelijkingsblokken staan er; duurzaamheid is geen bijlage.
  // `exact: true`: de inleiding bovenaan bevat óók het woord "sustainability".
  await expect.element(page.getByText("Technical", { exact: true })).toBeInTheDocument();
  await expect
    .element(page.getByText("Sustainability", { exact: true }))
    .toBeInTheDocument();
  // De brongegevens per veld blijven zichtbaar (herleidbaarheid).
  await expect.poll(() => page.getByText(merkOpgave).all().length).toBe(7);
});

test("WerkvoorbereiderView: lege staten worden benoemd, niet stil weggelaten", async () => {
  await renderServer(
    <Screen>
      <WerkvoorbereiderView dossierName="Leeg dossier" lines={[]} />
    </Screen>,
  );
  await expect
    .element(page.getByText("No matched lines to optimize yet."))
    .toBeInTheDocument();

  await renderServer(
    <Screen>
      <WerkvoorbereiderView
        dossierName="Zonder alternatieven"
        lines={[{ ...wvLines[0], alternatives: [] }]}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("No equivalent alternatives in the catalog."))
    .toBeInTheDocument();
});

test("ArmaturenboekView: alle drie de statussen staan erin, met hun aantallen", async () => {
  await renderServer(
    <Screen>
      <ArmaturenboekView
        dossierName="Deerns armaturenboek (demo)"
        customer="Deerns"
        rows={armatuurRows}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Luminaire schedule")).toBeInTheDocument();
  // `exact: true`: anders matcht dit ook de dossiernaam in de <h1> erboven.
  await expect.element(page.getByText("Deerns", { exact: true })).toBeInTheDocument();
  // Drie codes, drie aantallen — niets valt weg.
  for (const [code, qty] of [
    ["Lp301", "12"],
    ["Lw201", "8"],
    ["Ls001", "4"],
  ]) {
    await expect.element(page.getByText(code, { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText(qty, { exact: true })).toBeInTheDocument();
  }
  // De drie statuslabels, elk precies één keer (badge-taal uit status.ts).
  for (const label of ["Green", "Yellow", "Red"]) {
    await expect.poll(() => page.getByText(label, { exact: true }).all().length).toBe(1);
  }
});

test("ArmaturenboekView: de rode regel zonder match wordt eerlijk benoemd", async () => {
  await renderServer(
    <Screen>
      <ArmaturenboekView
        dossierName="Deerns armaturenboek (demo)"
        customer={null}
        rows={armatuurRows}
      />
    </Screen>,
  );
  // Groen/geel dragen product + artikelnummer …
  await expect
    .element(page.getByText("SASSO 100 SQ SP CEIL 3000K", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("L360048-33100111S", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("L092W350188W3", { exact: true }))
    .toBeInTheDocument();
  // … de rode regel krijgt tekst in plaats van een leeg vakje.
  await expect
    .element(page.getByText("no match in catalog", { exact: true }))
    .toBeInTheDocument();
  // Ontbrekende specs blijven eerlijk een streepje; Lp301 draagt 3000K, Lw201 CRI 90.
  await expect.element(page.getByText("3000K", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("90", { exact: true })).toBeInTheDocument();
  await expect
    .element(page.getByText(/unresolved lines are listed honestly/))
    .toBeInTheDocument();
});

test("AnalyticsView: toont de tellingen, de typeverdeling en de top-lijsten", async () => {
  await renderServer(
    <Screen>
      <AnalyticsView data={analytics} />
    </Screen>,
  );
  // Het totaal uit de fixture, als los getal in de tegel.
  await expect.element(page.getByText("Logged events")).toBeInTheDocument();
  await expect.element(page.getByText("33", { exact: true })).toBeInTheDocument();
  // De actie-codes worden vertaald naar leesbare labels mét hun telling
  // (whitespace-loze concatenatie in de badge: "Search17").
  await expect.element(page.getByText(/Search\s*17/)).toBeInTheDocument();
  await expect.element(page.getByText(/Suggestions \(awarded\)\s*4/)).toBeInTheDocument();
  await expect.element(page.getByText(/Project created\s*2/)).toBeInTheDocument();
  // Top-zoekopdrachten: alle drie de query's, met hun aantal.
  await expect.element(page.getByText("Most searched")).toBeInTheDocument();
  for (const q of ["SASSO 100", "INFINITE PRO", "SCAVA 1.0"]) {
    await expect.element(page.getByText(q, { exact: true })).toBeInTheDocument();
  }
  // Top-gematchte producten: merk staat apart van de naam.
  await expect.element(page.getByText("Most matched products")).toBeInTheDocument();
  await expect
    .element(page.getByText(/Wever & Ducré SCAVA WALL SURF 1\.0/))
    .toBeInTheDocument();
  // Recente activiteit: de zoekopdracht staat als citaat in de regel.
  await expect.element(page.getByText("Recent activity")).toBeInTheDocument();
  await expect.element(page.getByText(/“SASSO 100”/)).toBeInTheDocument();
});

test("AnalyticsView: lege lijsten krijgen een expliciete tekst", async () => {
  await renderServer(
    <Screen>
      <AnalyticsView
        data={{ ...analytics, topSearches: [], topMatched: [], recent: [] }}
      />
    </Screen>,
  );
  await expect.element(page.getByText("No searches yet.")).toBeInTheDocument();
  await expect.element(page.getByText("No matches yet.")).toBeInTheDocument();
});
