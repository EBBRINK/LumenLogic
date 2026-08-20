// White-box render-tests van de werkbank-schermen met fixture-data (licht/donker ×
// mobiel/desktop). Minimaal: assert op zichtbare tekst/structuur; screenshots als bonus.
//
// IA-opschoning 12 aug 2026: de Data-hub, de dekkingsmeter ("Tier 1 coverage 82%") en het
// verrijkings-steekproefscherm zijn opgeheven, en met hen de tests en opnamen die ze
// vastpinden. Wat hier staat zijn de schermen die zijn blijven bestaan — inladen,
// prijslijsten en evaluatie — nu onder /admin respectievelijk /brand-management.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandLoadQueue, type QueueRow } from "./brand-load-queue";
import { PriceListStatusTable, type PriceListRow } from "./price-list-status";
import { EvaluationPanel, type EvalLine, type EvalRunRow } from "./evaluation-panel";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const queue: QueueRow[] = [
  { id: "q1", displayName: "Occhio", frequency: 5, status: "wachtend", loadedAt: null },
  { id: "q2", displayName: "Flos", frequency: 2, status: "ingeladen", loadedAt: "2026-07-02T09:00:00Z" },
  // UX-audit 30 jul (bug #12): dít is de vervuiling waar de bevinding over gaat — een
  // Nederlandse zonenaam die de importparser als merk las. "Mark as loaded" zou voor deze
  // rij een leugen zijn; er valt niets in te laden.
  { id: "q3", displayName: "Vergaderruimte", frequency: 9, status: "wachtend", loadedAt: null },
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
  inladen: (
    <Screen>
      <BrandLoadQueue
        rows={queue}
        markLoadedAction={noopAction}
        dismissAction={noopAction}
      />
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
  // UX-audit bug #4: de lege stand is precies de stand die vandaag in productie staat.
  "evaluatie-leeg": (
    <Screen>
      <EvaluationPanel lines={[]} runs={[]} measureAction={noopAction} />
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
        // `document.body` bestaat altijd, ook als de boom nog niets heeft getekend — het
        // inlaadscherm bevat sinds de bevestigingsdialoog een client-component, en die
        // eerste render leverde een blanco PNG op. Wachten tot er écht tekst staat.
        await expect
          .poll(() => document.body.textContent?.trim().length ?? 0, {
            timeout: 5000,
          })
          .toBeGreaterThan(20);
        await page.screenshot({ path: `./data-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// UX-audit 30 jul (bug #9): op productie staan hier zes cijfers ("74608 of 211317") —
// één ononderbroken brij. De kleine fixture hierboven kon dat niet laten zien, deze wel.
// ── UX-audit 30 jul, bug #12: een eerlijke actie voor rijen die nooit een merk waren ──
test("inlaadwachtrij: elke wachtende rij biedt óók 'Not a brand'", async () => {
  await renderServer(
    <Screen>
      <BrandLoadQueue
        rows={queue}
        markLoadedAction={noopAction}
        dismissAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Vergaderruimte")).toBeInTheDocument();
  // Twee wachtende rijen (q1, q3) → twee knoppen; de ingeladen rij (q2) krijgt er geen.
  expect(
    page.getByRole("button", { name: "Not a brand" }).elements().length,
  ).toBe(2);
});

// Reviewzwerm 2.5a C1: de lege wachtrij stond op een kale grijze regel — het dialect dat
// components/ui/empty-state.tsx afschaft. De assertie hangt aan `data-slot="empty-state"`
// en niet aan de zin: alleen zo bewijst hij dat het GEDEELDE component rendert en niet dat
// er toevallig dezelfde woorden staan.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`lege inlaadwachtrij: de gedeelde lege toestand, framed, zonder eigen actie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <BrandLoadQueue
            rows={[]}
            markLoadedAction={noopAction}
            dismissAction={noopAction}
          />
        </Screen>,
      );
      await expect
        .element(page.getByText(/No brands in the queue/))
        .toBeInTheDocument();

      const leeg = document.querySelector<HTMLElement>('[data-slot="empty-state"]');
      expect(
        leeg,
        "geen [data-slot=empty-state]: terug op de kale grijze regel",
      ).not.toBeNull();
      // "framed": op /admin/loading staat het blok direct in <main>, zonder <Card>.
      expect(leeg!.dataset.variant).toBe("framed");
      expect(leeg!.className).toContain("border-dashed");
      // Bewuste `action={null}`: de wachtrij vult zichzelf vanuit de matcher, er is hier
      // niets te starten — dus ook geen leeg actie-blok.
      expect(leeg!.children.length).toBe(1);
      expect(leeg!.querySelector("form")).toBeNull();

      await page.screenshot({ path: `./data-inladen-leeg.${theme}.${device}.test.png` });
    });
  }
}

// ── BLOCKER, reparatie 30 jul ─────────────────────────────────────────────────────────
// "Not a brand" was één klik op een ghost-knop en daarachter een harde delete: geen undo,
// geen archief, geen scherm waar een afgevoerde rij nog te zien is, en de frequency (over
// álle projecten opgeteld) weg. Twee commits eerder is ConfirmActionDialog gebouwd voor
// precies dit gevaar en aangesloten op twee mínder ingrijpende deletes.
test("inlaadwachtrij: 'Not a brand' vraagt eerst, en submit niets vóór de bevestiging", async () => {
  await renderServer(
    <Screen>
      <BrandLoadQueue
        rows={queue}
        markLoadedAction={noopAction}
        dismissAction={noopAction}
      />
    </Screen>,
  );

  await expect.element(page.getByText("Vergaderruimte")).toBeInTheDocument();

  // Vóór de bevestiging is er GEEN form dat de rij kan afvoeren: de enige queueId-formulieren
  // in de tabel zijn die van "Mark as loaded" (twee wachtende rijen).
  const idsVooraf = Array.from(document.querySelectorAll("form"))
    .map((f) => f.querySelector<HTMLInputElement>('input[name="queueId"]')?.value)
    .filter(Boolean);
  expect(idsVooraf).toHaveLength(2);

  // De knop draagt het gewicht van zijn gevolg: destructive, niet ghost.
  const trigger = page.getByRole("button", { name: "Not a brand" }).last();
  expect(trigger.element().className).toContain("destructive");

  await trigger.click();

  // De vraag noemt het doel bij naam en zegt wat er verdwijnt — inclusief de telling.
  await expect
    .element(page.getByText("Remove Vergaderruimte from the queue?"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/requested 9× across all projects/))
    .toBeInTheDocument();
  await expect.element(page.getByText(/no undo and no archive/)).toBeInTheDocument();
  // Er is een weg terug.
  await expect
    .element(page.getByRole("button", { name: "Cancel" }))
    .toBeInTheDocument();

  // Pas nu bestaat het formulier dat de rij écht afvoert, met het juiste id.
  const idsNa = Array.from(document.querySelectorAll("form"))
    .map((f) => f.querySelector<HTMLInputElement>('input[name="queueId"]')?.value)
    .filter(Boolean);
  expect(idsNa).toContain("q3");
  expect(idsNa).toHaveLength(3);

  await page.screenshot({ path: "./data-inladen-bevestiging.light.test.png" });
});

// Zonder de actie mag de knop er niet zijn — het blok blijft bruikbaar voor aanroepers
// die hem (nog) niet meegeven, zonder een dode knop te tonen.
test("inlaadwachtrij: zonder dismissAction verschijnt de knop niet", async () => {
  await renderServer(
    <Screen>
      <BrandLoadQueue rows={queue} markLoadedAction={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("Vergaderruimte")).toBeInTheDocument();
  expect(page.getByRole("button", { name: "Not a brand" }).query()).toBeNull();
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

// UX-audit 30 jul, bug #4. De oude lege stand was een doodloper: een uitgegrijsde
// "Measure hit-rate" naast de tekst "Click 'Measure hit-rate' to run the evaluation
// set" — een opdracht die niet uit te voeren was. En er is geen enkel UI-pad om de set
// te vullen (addEvaluationLines in lib/repo/evaluation.ts heeft nul aanroepers buiten
// zijn eigen test), dus die zin kon ook nooit waar worden.
test("evaluatie leeg: geen meetknop, geen klik-hierop-opdracht, wél waar regels vandaan komen", async () => {
  await renderServer(
    <Screen>
      <EvaluationPanel lines={[]} runs={[]} measureAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText("The evaluation set is empty"))
    .toBeInTheDocument();

  // De dode knop is wég, niet uitgegrijsd (zelfde lijn als BrandDeleteBlock).
  expect(page.getByRole("button", { name: "Measure hit-rate" }).query()).toBeNull();
  // En het label-invoerveld van dat formulier dus ook.
  expect(document.querySelector('input[name="label"]')).toBeNull();

  const tekst = document.body.textContent ?? "";
  // Dít was de leugen: klik op iets wat niet kan.
  expect(tekst).not.toContain("Click “Measure hit-rate”");
  expect(tekst).not.toContain("No measurement run yet");
  // En dit is wat er in de plaats komt: waar regels vandaan komen.
  expect(tekst).toContain("evaluation_lines");
});

// Negatieve controle: met regels blijft de meting gewoon bereikbaar én blijft de
// instructie staan — die is dán waar. Zonder deze test kan "verberg het formulier"
// doorslaan naar "verberg het altijd".
test("evaluatie met regels maar zonder meting: knop actief, instructie blijft", async () => {
  await renderServer(
    <Screen>
      <EvaluationPanel lines={evalLines} runs={[]} measureAction={noopAction} />
    </Screen>,
  );
  const knop = page.getByRole("button", { name: "Measure hit-rate" });
  await expect.element(knop).toBeInTheDocument();
  await expect.element(knop).toBeEnabled();
  await expect
    .element(page.getByText(/No measurement run yet/))
    .toBeInTheDocument();
});
