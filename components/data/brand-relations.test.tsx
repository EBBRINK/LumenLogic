// White-box RSC-tests van het merkrelaties-overzicht (stap 3/4) met fixture-data:
// default-status zichtbaar, filters (status + "geen reactie"), kaart-badge op /data,
// mini-scorecard. Screenshots licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import {
  BrandRelationsTable,
  type BrandRelationTableRow,
} from "./brand-relations-table";
import { DataCards } from "./data-cards";
import { blokKleur, type BucketBlok } from "./mini-scorecard";
import { BrandRelationForm } from "./brand-relation-form";
import { BrandScorecard } from "./brand-scorecard";
import { bucketScore, FIELD_CATALOG } from "@/lib/field-catalog";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const TODAY = "2026-07-14";

// Mini-scorecard-fixture: 10 blokjes met oplopende dekking + één grijs blokje.
const blokken: BucketBlok[] = Array.from({ length: 10 }, (_, i) => ({
  key: `b${i + 1}`,
  labelNl: `Bucket ${i + 1}`,
  ratio: i === 8 ? null : i / 9, // bucket 9 = nog niet meetbaar (grijs)
  mustComplete: i === 9,
}));

const rows: BrandRelationTableRow[] = [
  {
    brandId: "b-flos",
    brandName: "Flos",
    brandCode: "L010",
    status: "niet_benaderd",
    lastContactAt: null,
    productCount: 42,
    priceListIndicator: "aanwezig_geldig",
    sharedBrandCode: false,
    scorecard: blokken,
  },
  {
    brandId: "b-occhio",
    brandName: "Occhio",
    brandCode: "L052",
    status: "benaderd",
    lastContactAt: "2026-06-01", // 43 dagen geleden → "geen reactie"
    productCount: 30,
    priceListIndicator: "verlopen",
    sharedBrandCode: true,
    scorecard: blokken,
  },
  {
    brandId: "b-xal",
    brandName: "XAL",
    brandCode: "L052",
    status: "data_ontvangen",
    lastContactAt: "2026-07-10",
    productCount: 18,
    priceListIndicator: "verloopt_binnenkort",
    sharedBrandCode: true,
    scorecard: blokken,
  },
  {
    brandId: "b-kaal",
    brandName: "Merk Kaal",
    brandCode: null,
    status: "benaderd",
    lastContactAt: "2026-07-12", // recent → géén "geen reactie"
    productCount: 0,
    priceListIndicator: "ontbreekt",
    sharedBrandCode: false,
    scorecard: null, // 0 producten → n.v.t.
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

const overzicht = (
  <Screen>
    <BrandRelationsTable rows={rows} todayIso={TODAY} updateAction={noopAction} />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`merkrelaties-overzicht (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(overzicht);
      // Wacht op echte content vóór de capture — een kale body-assert gaf blanco PNG's.
      await expect.element(page.getByText("4 van 4 merken")).toBeInTheDocument();
      await expect.element(page.getByText("Occhio")).toBeInTheDocument();
      await page.screenshot({
        path: `./data-merkrelaties.${theme}.${device}.test.png`,
      });
    });
  }
}

test("default-status 'Niet benaderd' zichtbaar; dubbele-code-badge en prijslijst-badges", async () => {
  await renderServer(overzicht);
  const flosStatus = page.getByLabelText("Status van Flos");
  await expect.element(flosStatus).toHaveValue("niet_benaderd");
  // K8: beide L052-merken dragen de badge.
  expect(page.getByText("dubbele code").all()).toHaveLength(2);
  await expect.element(page.getByText("Verlopen")).toBeInTheDocument();
  await expect.element(page.getByText("Ontbreekt")).toBeInTheDocument();
  await expect.element(page.getByText("4 van 4 merken")).toBeInTheDocument();
});

test("statusfilter en zoeken beperken de lijst", async () => {
  await renderServer(overzicht);
  await page.getByLabelText("Filter op status").selectOptions("Data ontvangen");
  await expect.element(page.getByText("1 van 4 merken")).toBeInTheDocument();
  await expect.element(page.getByText("XAL")).toBeInTheDocument();
  expect(page.getByText("Flos").query()).toBeNull();

  await page.getByLabelText("Filter op status").selectOptions("Alle statussen");
  await page.getByLabelText("Zoek op merknaam").fill("occ");
  await expect.element(page.getByText("1 van 4 merken")).toBeInTheDocument();
  await expect.element(page.getByText("Occhio")).toBeInTheDocument();
});

test("'geen reactie'-filter: alléén benaderd + laatste contact ouder dan de drempel", async () => {
  await renderServer(overzicht);
  await page.getByText(/Geen reactie/).click();
  await expect.element(page.getByText("1 van 4 merken")).toBeInTheDocument();
  await expect.element(page.getByText("Occhio")).toBeInTheDocument();
  expect(page.getByText("Merk Kaal").query()).toBeNull(); // recent contact
});

test("kaart op /data: 'Merkrelaties' met badge-aantal (data ontvangen)", async () => {
  await renderServer(
    <Screen>
      <DataCards badge={{ "/data/brand-relations": 3 }} />
    </Screen>,
  );
  await expect.element(page.getByText("Merkrelaties")).toBeInTheDocument();
  await expect.element(page.getByText("3", { exact: true })).toBeInTheDocument();
});

test("mini-scorecard: n.v.t. bij 0 producten en donkergroen bij 100% must", async () => {
  await renderServer(overzicht);
  await expect.element(page.getByText("n.v.t.")).toBeInTheDocument();
  // Kleurfunctie (pure): donkergroen alleen bij mustComplete + ratio 1.
  expect(blokKleur({ key: "x", labelNl: "x", ratio: 1, mustComplete: true }))
    .toBe("hsl(142 72% 26%)");
  expect(blokKleur({ key: "x", labelNl: "x", ratio: 0.5, mustComplete: false }))
    .toBe("hsl(55 65% 45%)");
  expect(blokKleur({ key: "x", labelNl: "x", ratio: null, mustComplete: false }))
    .toBeUndefined();
});

// ── Detailpagina (stap 5): volledige scorecard + relatieformulier ────────────

const filledByField: Record<string, number> = {
  supplier_article_code: 2,
  name_nl: 2,
  category: 1,
  list_price_excl_vat: 2,
  kelvin: 2,
  cri: 1,
  color_1: 1,
};
const detailBuckets = [...FIELD_CATALOG]
  .sort((a, b) => a.order - b.order)
  .map((bucket) => ({ bucket, score: bucketScore(bucket, filledByField, 2) }));

const detail = (
  <Screen>
    <div className="space-y-8">
      <BrandRelationForm
        values={{
          brandId: "b-occhio",
          status: "benaderd",
          contactName: "Anna",
          contactEmail: "anna@occhio.de",
          lastContactAt: "2026-06-01",
          notes: "Toezegging: Excel volgt.",
        }}
        updateAction={noopAction}
      />
      <BrandScorecard
        buckets={detailBuckets}
        filledByField={filledByField}
        productCount={2}
        hasProducts
      />
    </div>
  </Screen>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`merkrelatie-detail (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(detail);
      // Zelfde race als bij het overzicht: wacht op gerenderde content.
      await expect
        .element(page.getByRole("button", { name: "Opslaan" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("9. Documentatie / links"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./data-merkrelatie-detail.${theme}.${device}.test.png`,
      });
    });
  }
}

test("detail-scorecard: dekkings-%, grijze niet-meetbare velden, interne velden en legenda", async () => {
  await renderServer(detail);
  // Legenda met de donkergroen-definitie (Timo-besluit 1).
  await expect
    .element(page.getByText(/Donkergroen = alle must-velden 100%/))
    .toBeInTheDocument();
  // Dekkingspercentages: kelvin 100%, cri 50%.
  await expect
    .element(page.getByTitle(/Kleurtemperatuur \(K\): 100% van de producten/))
    .toBeInTheDocument();
  await expect
    .element(page.getByTitle(/CRI: 50% van de producten/))
    .toBeInTheDocument();
  // Niet-meetbaar veld: EAN-code (kind none) grijs met uitleg.
  await expect
    .element(page.getByTitle(/EAN-code: nog niet meetbaar/))
    .toBeInTheDocument();
  // Bucket 9 volledig niet meetbaar.
  await expect
    .element(page.getByText("9. Documentatie / links"))
    .toBeInTheDocument();
  // Interne 🔒-velden dragen een slotje (aria-label "intern").
  expect(page.getByLabelText("intern").all().length).toBeGreaterThanOrEqual(5);
});

test("detail-formulier: relatievelden vooringevuld en opslaan-knop aanwezig", async () => {
  await renderServer(detail);
  await expect.element(page.getByLabelText("Status")).toHaveValue("benaderd");
  await expect.element(page.getByLabelText("Contactpersoon")).toHaveValue("Anna");
  await expect
    .element(page.getByLabelText("E-mail"))
    .toHaveValue("anna@occhio.de");
  await expect
    .element(page.getByLabelText("Laatste contact"))
    .toHaveValue("2026-06-01");
  await expect
    .element(page.getByRole("button", { name: "Opslaan" }))
    .toBeInTheDocument();
});

test("scorecard zonder producten toont n.v.t.-uitleg i.p.v. 0% rood", async () => {
  await renderServer(
    <Screen>
      <BrandScorecard
        buckets={detailBuckets}
        filledByField={{}}
        productCount={0}
        hasProducts={false}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/compleetheid n\.v\.t\./))
    .toBeInTheDocument();
});
