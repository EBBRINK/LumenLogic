// White-box render-tests van de data-werkbank-schermen met fixture-data (licht/donker ×
// mobiel/desktop). Minimaal: assert op zichtbare tekst/structuur; screenshots als bonus.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { CoverageMeter } from "./coverage-meter";
import {
  BrandPicker,
  EnrichmentRunsTable,
  SampleReview,
  type EnrichBrand,
  type EnrichRunRow,
  type SampleItem,
} from "./enrichment-panels";
import { BrandLoadQueue, type QueueRow } from "./brand-load-queue";
import { DataCards } from "./data-cards";
import {
  isCoverageGap,
  PriceListStatusTable,
  type PriceListRow,
} from "./price-list-status";
import { EvaluationPanel, type EvalLine, type EvalRunRow } from "./evaluation-panel";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const brands: EnrichBrand[] = [
  { id: "b1", name: "Delta Light", productCount: 42, enriched: 10 },
  { id: "b2", name: "XAL", productCount: 18, enriched: 0 },
];

const runs: EnrichRunRow[] = [
  {
    id: "r1",
    brandName: "Delta Light",
    status: "gepubliceerd",
    counts: { producten: 42, geparsed: 61, steekproef: 20, toegepast: 55 },
    sampleErrorRate: "0.0500",
    createdAt: "2026-07-01T10:00:00Z",
  },
  {
    id: "r2",
    brandName: "XAL",
    status: "steekproef",
    counts: { producten: 18, geparsed: 24, steekproef: 8 },
    sampleErrorRate: null,
    createdAt: "2026-07-05T12:00:00Z",
  },
];

const sampleItems: SampleItem[] = [
  { id: "i1", productName: "SASSO 100 17,9W 3000K", field: "kelvin", value: "3000", sampleVerdict: "goed" },
  { id: "i2", productName: "SASSO 100 17,9W 3000K", field: "maxWattage", value: "17.9", sampleVerdict: null },
  { id: "i3", productName: "SPY 39 IP54 CRI90", field: "cri", value: "90", sampleVerdict: "fout" },
];

const queue: QueueRow[] = [
  { id: "q1", displayName: "Occhio", frequency: 5, status: "wachtend", loadedAt: null },
  { id: "q2", displayName: "Flos", frequency: 2, status: "ingeladen", loadedAt: "2026-07-02T09:00:00Z" },
];

// UX-audit 30 jul (bug #3): pl4 en pl5 zijn de gevallen die de badge liet liegen — een lijst
// met een prima datum maar 0 producten. Voor de matcher is dat exact hetzelfde gat als een
// verlopen lijst (ijzeren regel 3). pl4 hangt bovendien aan een merk dat niet meer bestaat,
// zoals 'Lucente (BESTAAT NIET MEER)' in de brondata.
const priceLists: PriceListRow[] = [
  { id: "pl1", name: "Prijslijst Occhio", brandName: "Occhio", validUntil: "2026-06-01", productCount: 30, daysLeft: -36, bucket: "verlopen", lifecycle: null },
  { id: "pl2", name: "Prijslijst XAL", brandName: "XAL", validUntil: "2026-07-10", productCount: 18, daysLeft: 3, bucket: "7", lifecycle: "actief" },
  { id: "pl3", name: "Prijslijst Delta", brandName: "Delta Light", validUntil: "2027-01-01", productCount: 42, daysLeft: 178, bucket: "ok", lifecycle: "actief" },
  { id: "pl4", name: "Prijslijst Lucente", brandName: "Lucente", validUntil: "2026-12-01", productCount: 0, daysLeft: 124, bucket: "ok", lifecycle: "bestaat_niet_meer" },
  { id: "pl5", name: "Prijslijst Itre", brandName: "Itre", validUntil: "2026-08-20", productCount: 0, daysLeft: 21, bucket: "30", lifecycle: "actief" },
];

// Verlopen ÉN 0 producten — het geval dat de precedentie in rowState() vastlegt. Losse
// fixture, want in `priceLists` hierboven hangt "alleen pl1 is verlopen" aan meerdere tests.
// pl3 rijdt mee als controle: één rij die niets aan de hand heeft.
const verlopenEnLeeg: PriceListRow[] = [
  { id: "pl6", name: "Prijslijst Kreon", brandName: "Kreon", validUntil: "2026-06-01", productCount: 0, daysLeft: -36, bucket: "verlopen", lifecycle: "actief" },
  priceLists[2],
];

const evalLines: EvalLine[] = [
  { id: "e1", fixtureCode: "EV-A", brandText: "XAL", productText: "SASSO 100", expectedStatus: "groen" },
  { id: "e2", fixtureCode: "EV-B", brandText: "Occhio", productText: "Mito", expectedStatus: "blauw" },
];

const evalRuns: EvalRunRow[] = [
  {
    id: "run1",
    label: "baseline",
    hitRate: "0.5000",
    results: [
      { lineId: "e1", expected: "groen", got: "groen", hit: true },
      { lineId: "e2", expected: "blauw", got: "rood", hit: false },
    ],
    createdAt: "2026-07-03T08:00:00Z",
  },
  {
    id: "run2",
    label: "na tweak",
    hitRate: "1.0000",
    results: [
      { lineId: "e1", expected: "groen", got: "groen", hit: true },
      { lineId: "e2", expected: "blauw", got: "blauw", hit: true },
    ],
    createdAt: "2026-07-06T08:00:00Z",
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const screens = {
  "data-overzicht": (
    <Screen>
      <CoverageMeter total={120} covered={78} ratio={0.65} />
      <div className="mt-6">
        <BrandPicker brands={brands} startAction={noopAction} />
        <EnrichmentRunsTable runs={runs} />
      </div>
    </Screen>
  ),
  "verrijking-steekproef": (
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>
  ),
  inladen: (
    <Screen>
      <BrandLoadQueue rows={queue} markLoadedAction={noopAction} />
    </Screen>
  ),
  prijslijsten: (
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>
  ),
  evaluatie: (
    <Screen>
      <EvaluationPanel lines={evalLines} runs={evalRuns} measureAction={noopAction} />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./data-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

test("dekkingsmeter toont het percentage en de telling", async () => {
  await renderServer(
    <Screen>
      <CoverageMeter total={120} covered={78} ratio={0.65} />
    </Screen>,
  );
  await expect.element(page.getByText("65%")).toBeInTheDocument();
  await expect
    .element(page.getByText(/78 of 120 products/))
    .toBeInTheDocument();
});

// De steekproefpoort (20 jul): zolang één rij geen oordeel heeft weigert publishRun, dus de
// UI zegt dat en zet de knop uit — beter dan de gebruiker tegen een servererror laten lopen.
// sampleItems bevat bewust één onbeoordeelde rij (i2) én één 'fout' (i3); de openstaande
// review wint, want die blokkeert.
test("steekproef met onbeoordeelde rij: publiceren geblokkeerd", async () => {
  await renderServer(
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/1 sample row\(s\) still need a verdict/))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Publish" }))
    .toBeDisabled();
});

test("steekproef volledig beoordeeld: publiceren mag, mét fout-waarschuwing", async () => {
  const beoordeeld: SampleItem[] = sampleItems.map((it) =>
    it.sampleVerdict == null ? { ...it, sampleVerdict: "goed" as const } : it,
  );
  await renderServer(
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={beoordeeld}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: "Publish" }))
    .toBeEnabled();
  await expect
    .element(page.getByText(/1 item\(s\) marked incorrect/))
    .toBeInTheDocument();
});

test("gepubliceerde run toont geen goed/fout-knoppen meer", async () => {
  await renderServer(
    <Screen>
      <SampleReview
        runId="r1"
        status="gepubliceerd"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  expect(page.getByRole("button", { name: "Publish" }).query()).toBeNull();
});

// Sprint 1.6 (deel B): de "inline"-variant van PriceListExpiryNotice hoort bij de
// bestaande verlopen-rij (pl1, Occhio) en nergens anders — dit scherm gaat over lijsten,
// niet over merken, dus bewust geen banner of pil.
test("prijslijsten: de verlopen rij draagt de gedeelde verloop-waarschuwing met einddatum", async () => {
  await renderServer(
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>,
  );
  // Eén regex die de hele waarschuwing-zin matcht — "01-06-2026" komt ook los voor in de
  // "Valid until"-kolom, dus een losse datum-match zou ambigu zijn.
  await expect
    .element(
      page.getByText(/Occhio delivered prices — the list expired on 01-06-2026/),
    )
    .toBeInTheDocument();
  expect(page.getByText(/extension/i).all()).toHaveLength(1); // alleen pl1 is verlopen
});

// UX-audit 30 jul, bug #3. Dit is de kern van de bevinding: de badge mocht niet langer
// uitsluitend uit de datum volgen. Groen betekent "hier is niets aan de hand", en dat is
// onwaar zodra de matcher nul producten uit de lijst haalt (ijzeren regel 3).
test("prijslijsten: geldig met 0 producten is amber, niet groen", async () => {
  await renderServer(
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Valid · 0 products"))
    .toBeInTheDocument();
  // Bijna-verlopen én leeg: de dekking komt erbij, de datum verdwijnt niet uit het label.
  await expect
    .element(page.getByText("Expires in 21 d · 0 products"))
    .toBeInTheDocument();

  // De tint per rij, niet alleen de tekst: pl4 mag geen groene badge dragen en pl3 (42
  // producten, ruim geldig) moet groen blijven.
  const tintOf = (text: string) =>
    [...document.querySelectorAll("td span")].find(
      (el) => el.textContent === text,
    )?.className ?? "";
  expect(tintOf("Valid · 0 products")).toContain("bg-status-amber-tint");
  expect(tintOf("Valid · 0 products")).not.toContain("bg-status-green-tint");
  expect(tintOf("178 d valid")).toContain("bg-status-green-tint");

  // De telling boven de tabel noemt beide gaten. Bewust géén "valid" in die tekst: pl5
  // verloopt over 21 dagen en is dus niet "valid with 0 products", alleen "with 0 products".
  await expect
    .element(page.getByText(/1 expired · 2 with 0 products — coverage gaps/))
    .toBeInTheDocument();
});

// UX-audit 30 jul, vervolg op bug #3: de kop mag de badges één regel lager niet tegenspreken.
// pl5 draagt "Expires in 21 d · 0 products"; zei de kop dan "1 expiring soon" (alleen pl2),
// dan verdween pl5 uit de verlengplanning terwijl zijn eigen badge zegt dat hij verloopt. De
// tint van een rij is exclusief, de tellingen zijn dat niet.
test("prijslijsten: de bijna-verlopen-telling laat een lege lijst niet vallen", async () => {
  await renderServer(
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>,
  );
  // pl2 (7 dagen) + pl5 (30 dagen, 0 producten) = 2. Uit `bucket`, niet uit de tint.
  await expect.element(page.getByText("2 expiring soon")).toBeInTheDocument();
  expect(page.getByText("1 expiring soon").query()).toBeNull();
  // ...en die lege bijna-verlopen lijst staat óók bij de dekkingsgaten. Dubbel geteld in de
  // twee tellers, precies één keer in de tabel — dat is de bedoeling.
  await expect
    .element(page.getByText(/2 with 0 products/))
    .toBeInTheDocument();
});

// De precedentie in rowState() is dragend en stond tot 30 jul in geen enkele test: geen fixture
// was verlopen ÉN leeg. Draai de twee ifs om en deze rij wordt 'leeg' — label "Expires in -36 d
// · 0 products" (negatieve dagen), tint amber i.p.v. grijs, en de colSpan-uitlegregel eronder
// verdwijnt omdat die op state === "verlopen" hangt. Alle 28 tests bleven daarbij groen.
test("prijslijsten: verlopen wint van leeg — grijs, dagen positief, uitleg blijft staan", async () => {
  await renderServer(
    <Screen>
      <PriceListStatusTable rows={verlopenEnLeeg} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Expired (36 d ago)")) // niet "Expires in -36 d · 0 products"
    .toBeInTheDocument();
  const badge = [...document.querySelectorAll("td span")].find(
    (el) => el.textContent === "Expired (36 d ago)",
  );
  expect(badge?.className).toContain("bg-status-grey-tint");
  expect(badge?.className).not.toContain("bg-status-amber-tint");

  // De vervolgrij met de gedeelde verloop-uitleg hoort er nog te staan — over de volle breedte.
  await expect
    .element(
      page.getByText(/Kreon delivered prices — the list expired on 01-06-2026/),
    )
    .toBeInTheDocument();
  expect(document.querySelector('td[colspan="5"]')).not.toBeNull();

  // En de kop telt deze rij één keer, als verlopen — niet ook als lege lijst.
  await expect
    .element(page.getByText("1 expired — coverage gap"))
    .toBeInTheDocument();
});

// UX-audit 30 jul, vervolg op bug #3: /data en /data/price-lists mogen niet uit elkaar lopen.
// De hub-badge telde alleen `bucket === "verlopen"` en las op productiedata "1", terwijl het
// scherm waar hij naar linkt 31 dekkingsgaten meldde. Hij gebruikt nu isCoverageGap uit
// price-list-status.tsx — dezelfde predicate als de tint van de rij, geen tweede kopie.
test("data-hub: de prijslijst-badge telt élk dekkingsgat, niet alleen de verlopen lijsten", async () => {
  const gaps = priceLists.filter(isCoverageGap).length;
  expect(gaps).toBe(3); // pl1 verlopen + pl4/pl5 met 0 producten
  // De oude, liegende telling — bewijs dat de badge hier echt van afwijkt.
  expect(priceLists.filter((p) => p.bucket === "verlopen").length).toBe(1);

  await renderServer(
    <Screen>
      <DataCards badge={{ "/data/price-lists": gaps }} />
    </Screen>,
  );
  await expect
    .element(page.getByText("3", { exact: true }))
    .toBeInTheDocument();
});

// Eén presentatie voor de levensfase (components/admin/brand-lifecycle-badge.tsx), dezelfde
// als /admin/brands: 'actief' krijgt géén badge, de afwijking wel.
test("prijslijsten: een merk dat niet meer bestaat draagt zijn levensfase-badge", async () => {
  await renderServer(
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>,
  );
  await expect.element(page.getByText("No longer exists")).toBeInTheDocument();
  const badges = [...document.querySelectorAll('td [data-slot="badge"]')];
  expect(badges).toHaveLength(1); // alleen pl4; pl5 is 'actief' en pl1–pl3 dragen niets
});

test("evaluatie toont de laatste score en per-regel-diff", async () => {
  await renderServer(
    <Screen>
      <EvaluationPanel lines={evalLines} runs={evalRuns} measureAction={noopAction} />
    </Screen>,
  );
  // laatste run = "na tweak" met 100% (verschijnt in de scorekaart én de historie-tabel)
  await expect.element(page.getByText("100%").first()).toBeInTheDocument();
  await expect.element(page.getByText("hit").first()).toBeInTheDocument();
});
