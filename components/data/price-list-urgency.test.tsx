// White-box render-test van het urgentie-overzicht en van de ingeklapte compleetheidscheck
// (licht/donker × mobiel/desktop). De formule zelf is elders getest; hier gaat het erom dat
// het scherm de uitkomst ook wérkelijk toont — volgorde, reden per rij, en kolomkoppen die
// omsorteren.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { PriceListUrgencyTable } from "./price-list-urgency-table";
import { BrandScorecard } from "./brand-scorecard";
import {
  GEEN_VRAAG,
  parseUrgencyQuery,
  type BrandDemandSignals,
  type BrandUrgencyRow,
} from "@/lib/price-list-urgency";
import { FIELD_CATALOG, scorecardAggregate } from "@/lib/field-catalog";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function vraag(over: Partial<BrandDemandSignals>): BrandDemandSignals {
  return { ...GEEN_VRAAG, ...over };
}

function merk(over: Partial<BrandUrgencyRow>): BrandUrgencyRow {
  return {
    brandId: "b",
    brandName: "Merk",
    brandCode: null,
    lifecycle: "actief",
    priceListId: "pl",
    priceListName: "Prijslijst",
    validUntil: "2026-09-01",
    daysLeft: 12,
    replacedAt: null,
    priceCount: 40,
    productCount: 40,
    demand: { ...GEEN_VRAAG },
    ...over,
  };
}

// Het Vesoi-geval uit de demosessie van 12 augustus, als fixture: een lijst die een jaar
// verlopen is en waar niemand naar vraagt, naast een merk dat over twaalf dagen verloopt en
// in 28 projecten zit. Sorteren op vervaldatum zet Vesoi bovenaan; dat is precies de fout.
const rijen: BrandUrgencyRow[] = [
  merk({
    brandId: "vesoi",
    brandName: "Vesoi",
    priceListName: "Prijslijst Vesoi",
    validUntil: "2025-08-20",
    daysLeft: -365,
  }),
  merk({
    brandId: "delta",
    brandName: "Delta Light",
    priceListName: "Prijslijst Delta",
    daysLeft: 12,
    demand: vraag({ projects12m: 28, lines12m: 140 }),
  }),
  merk({
    brandId: "kreon",
    brandName: "Kreon",
    priceListId: null,
    priceListName: null,
    validUntil: null,
    daysLeft: null,
    priceCount: 0,
    productCount: 0,
    demand: vraag({ requestedNotInCatalogue: 4 }),
  }),
  merk({
    brandId: "itre",
    brandName: "Itre",
    priceListName: "Prijslijst Itre",
    validUntil: "2027-01-01",
    daysLeft: 178,
    priceCount: 0,
    demand: vraag({ searches12m: 3 }),
  }),
  merk({
    brandId: "lucente",
    brandName: "Lucente",
    priceListName: "Prijslijst Lucente",
    validUntil: "2027-01-01",
    daysLeft: 178,
    lifecycle: "bestaat_niet_meer",
  }),
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

// Delta Light met vulling in één categorie: het voorbeeld uit de sessie — "Light source &
// fitting" toont meteen Light source, Light source included en Max wattage.
const scorecard = scorecardAggregate(
  { light_source: 8, light_source_included: 8, max_wattage: 4, kelvin: 0 },
  8,
  FIELD_CATALOG,
);

const screens = {
  "prijslijst-urgentie": (
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>
  ),
  "prijslijst-op-dagen": (
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({ sort: "days" })} />
    </Screen>
  ),
  "compleetheid-ingeklapt": (
    <Screen>
      <BrandScorecard aggregate={scorecard} />
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
        await expect
          .poll(() => document.body.textContent?.trim().length ?? 0, { timeout: 5000 })
          .toBeGreaterThan(20);
        await page.screenshot({
          path: `./price-list-urgency-${name}.${theme}.${device}.test.png`,
        });
      });
    }
  }
}

// renderServer() geeft de boom niet synchroon terug; de screenshot-tests hierboven wachten
// daarom al op tekst. De tests hieronder lezen de DOM rechtstreeks (volgorde van rijen,
// href van een kolomkop) en moeten dus hetzelfde wachten doen.
async function toon(ui: React.ReactNode): Promise<void> {
  await renderServer(ui);
  await expect
    .poll(() => document.body.textContent?.trim().length ?? 0, { timeout: 5000 })
    .toBeGreaterThan(20);
}

function merknamenInVolgorde(): string[] {
  // De merknaam is het eerste tekstknooppunt van de cel; daarna volgen de levensfase-badge
  // en de reden-regel, en die horen hier niet in.
  return [...document.querySelectorAll("tbody tr td:first-child")].map(
    (cel) => cel.firstChild?.textContent?.trim() ?? "",
  );
}

test("regel 1 is wat als eerste actie nodig heeft, niet de oudste vervaldatum", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>,
  );
  const namen = merknamenInVolgorde();
  // Verloopt over twaalf dagen en zit in 28 projecten — dít is het werk van vandaag.
  expect(namen[0]).toBe("Delta Light");
  // Het merk dat een jaar verlopen is en waar niemand naar vraagt zakt onder de twee
  // dekkingsgaten waar wél vraag naar is, en onder het merk zonder lijst.
  expect(namen.indexOf("Vesoi")).toBeGreaterThan(namen.indexOf("Kreon"));
  expect(namen.indexOf("Vesoi")).toBeGreaterThan(namen.indexOf("Itre"));
  // Maar niet onder een merk waar niets mee aan de hand is: verlopen blijft verlopen.
  expect(namen.indexOf("Vesoi")).toBeLessThan(namen.indexOf("Lucente"));
});

test("elke rij draagt zijn eigen reden", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>,
  );
  const tekst = document.body.textContent ?? "";
  expect(tekst).toContain("expires in 12 days · 28 projects");
  expect(tekst).toContain("expired 365 days ago");
  expect(tekst).toContain("no price list · 4 requests without a product");
  expect(tekst).toContain("price list has 0 products · 3 searches");
});

test("de kolomkoppen sorteren om, en de oude volgorde is één klik weg", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>,
  );
  const dagenKop = [...document.querySelectorAll("thead a")].find(
    (a) => a.textContent?.includes("Days"),
  );
  expect(dagenKop?.getAttribute("href")).toBe("/data/price-lists?sort=days&dir=asc");
});

test("op dagen gesorteerd staat het langst verlopen bovenaan", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({ sort: "days" })} />
    </Screen>,
  );
  expect(merknamenInVolgorde()[0]).toBe("Vesoi");
});

test("de kop telt de dekkingsgaten en noemt de merken zonder énige lijst apart", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>,
  );
  // Vesoi (verlopen), Kreon (geen lijst), Itre (0 producten) = 3.
  expect(document.body.textContent).toContain("3 coverage gaps · 1 without any price list");
});

test("geld komt in dit scherm niet voor — de kop zegt dat ook", async () => {
  await toon(
    <Screen>
      <PriceListUrgencyTable rows={rijen} query={parseUrgencyQuery({})} />
    </Screen>,
  );
  expect(document.body.textContent).toContain("never price or margin");
});

test("een categorie met vulling toont zijn gevulde velden al ingeklapt", async () => {
  await toon(
    <Screen>
      <BrandScorecard aggregate={scorecard} />
    </Screen>,
  );
  const koppen = [...document.querySelectorAll("summary")];
  const lichtbron = koppen.find((k) => k.textContent?.includes("Light source & fitting"));
  expect(lichtbron).toBeDefined();
  // De teller, en de namen van de gevulde velden — zonder één klik.
  expect(lichtbron?.textContent).toContain("filled");
  expect(lichtbron?.textContent).toContain("Max wattage");
  // Alles staat dicht: de 66 velden onder elkaar waren juist het probleem.
  expect([...document.querySelectorAll("details")].every((d) => !d.open)).toBe(true);
});
