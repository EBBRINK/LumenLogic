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
import { PriceListExpiryNotice } from "./price-list-expiry-notice";
import {
  FIELD_CATALOG,
  INTERNAL_BUCKET_KEY,
  type CategorieScore,
  type Compleetheidsniveau,
  type FieldCoverage,
  type NiveauTotaal,
  type ScorecardAggregate,
} from "@/lib/field-catalog";

// Bouwt een ScorecardAggregate-fixture rechtstreeks uit FIELD_CATALOG, volgens dezelfde
// regels als scorecardAggregate() straks toepast (G9-G12: categorie 1-10 = excelColumns(),
// categorie 11 apart en niet meegewogen, per-veld gewogen — nooit per categorie gemiddeld).
// Puur voor deze RSC-tests: geen aanroep naar lib/repo/brand-relations.ts, dat blijft van
// agent 1 (rekenkant).
const NIVEAUS: Compleetheidsniveau[] = ["must", "wanna", "nice"];

function niveauTotaal(
  fields: FieldCoverage[],
  niveau: Compleetheidsniveau,
): NiveauTotaal {
  const relevant = fields.filter((f) => f.niveau === niveau && f.measurable);
  const measurableFields = relevant.length;
  const coverageSum = relevant.reduce((sum, f) => sum + (f.ratio ?? 0), 0);
  const fullyFilledFields = relevant.filter((f) => f.ratio === 1).length;
  return {
    niveau,
    measurableFields,
    coverageSum,
    ratio: measurableFields > 0 ? coverageSum / measurableFields : 0,
    fullyFilledFields,
  };
}

function fixtureAggregate(
  filledByField: Record<string, number>,
  productCount: number,
): ScorecardAggregate {
  const categories: CategorieScore[] = [...FIELD_CATALOG]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => {
      const inTotals = bucket.key !== INTERNAL_BUCKET_KEY;
      // Categorie 1-10 = uitsluitend de Excel-velden van die bucket (G9); categorie 11
      // is per definitie het complement en heeft er dus geen te filteren.
      const bucketFields = inTotals
        ? bucket.fields.filter((f) => f.inExcel && !f.internalOnly)
        : bucket.fields;
      const fields: FieldCoverage[] = bucketFields.map((f) => {
        const measurable = f.measure.kind !== "none";
        const filled = Math.min(filledByField[f.key] ?? 0, productCount);
        const ratio = measurable
          ? productCount > 0
            ? filled / productCount
            : 0
          : null;
        return {
          key: f.key,
          labelEn: f.labelEn,
          niveau: f.niveau,
          internalOnly: f.internalOnly,
          measurable,
          filled,
          ratio,
        };
      });
      const perNiveau = Object.fromEntries(
        NIVEAUS.map((n) => [n, niveauTotaal(fields, n)]),
      ) as Record<Compleetheidsniveau, NiveauTotaal>;
      const measurableFields = fields.filter((f) => f.measurable).length;
      const unmeasurableFields = fields.length - measurableFields;
      const coverageSum = NIVEAUS.reduce(
        (sum, n) => sum + perNiveau[n].coverageSum,
        0,
      );
      return {
        bucketKey: bucket.key,
        order: bucket.order,
        labelEn: bucket.labelEn,
        inTotals,
        fields,
        measurableFields,
        unmeasurableFields,
        coverageSum,
        ratio: measurableFields > 0 ? coverageSum / measurableFields : 0,
        perNiveau,
      };
    });

  const templateCategories = categories.filter((c) => c.inTotals);
  const totals = Object.fromEntries(
    NIVEAUS.map((n) => {
      const measurableFields = templateCategories.reduce(
        (sum, c) => sum + c.perNiveau[n].measurableFields,
        0,
      );
      const coverageSum = templateCategories.reduce(
        (sum, c) => sum + c.perNiveau[n].coverageSum,
        0,
      );
      const fullyFilledFields = templateCategories.reduce(
        (sum, c) => sum + c.perNiveau[n].fullyFilledFields,
        0,
      );
      return [
        n,
        {
          niveau: n,
          measurableFields,
          coverageSum,
          ratio: measurableFields > 0 ? coverageSum / measurableFields : 0,
          fullyFilledFields,
        },
      ];
    }),
  ) as Record<Compleetheidsniveau, NiveauTotaal>;

  const scoredFieldCount = templateCategories.reduce(
    (sum, c) => sum + c.fields.length,
    0,
  );

  return {
    productCount,
    hasProducts: productCount > 0,
    categories,
    totals,
    templateFieldCount: scoredFieldCount,
    scoredFieldCount,
  };
}

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const TODAY = "2026-07-14";

// Mini-scorecard-fixture: 10 blokjes met oplopende dekking + één grijs blokje.
const blokken: BucketBlok[] = Array.from({ length: 10 }, (_, i) => ({
  key: `b${i + 1}`,
  labelEn: `Bucket ${i + 1}`,
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
    scorecard: null, // 0 producten → n/a
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
      await expect.element(page.getByText("4 of 4 brands")).toBeInTheDocument();
      await expect.element(page.getByText("Occhio")).toBeInTheDocument();
      await page.screenshot({
        path: `./data-merkrelaties.${theme}.${device}.test.png`,
      });
    });
  }
}

test("default-status 'Niet benaderd' zichtbaar; dubbele-code-badge en prijslijst-badges", async () => {
  await renderServer(overzicht);
  const flosStatus = page.getByLabelText("Status of Flos");
  await expect.element(flosStatus).toHaveValue("niet_benaderd");
  // K8: beide L052-merken dragen de badge.
  expect(page.getByText("duplicate code").all()).toHaveLength(2);
  await expect.element(page.getByText("Expired")).toBeInTheDocument();
  await expect.element(page.getByText("Missing")).toBeInTheDocument();
  await expect.element(page.getByText("4 of 4 brands")).toBeInTheDocument();
});

test("statusfilter en zoeken beperken de lijst", async () => {
  await renderServer(overzicht);
  await page.getByLabelText("Filter by status").selectOptions("Data received");
  await expect.element(page.getByText("1 of 4 brands")).toBeInTheDocument();
  await expect.element(page.getByText("XAL")).toBeInTheDocument();
  expect(page.getByText("Flos").query()).toBeNull();

  await page.getByLabelText("Filter by status").selectOptions("All statuses");
  await page.getByLabelText("Search by brand name").fill("occ");
  await expect.element(page.getByText("1 of 4 brands")).toBeInTheDocument();
  await expect.element(page.getByText("Occhio")).toBeInTheDocument();
});

test("'geen reactie'-filter: alléén benaderd + laatste contact ouder dan de drempel", async () => {
  await renderServer(overzicht);
  await page.getByText(/No response/).click();
  await expect.element(page.getByText("1 of 4 brands")).toBeInTheDocument();
  await expect.element(page.getByText("Occhio")).toBeInTheDocument();
  expect(page.getByText("Merk Kaal").query()).toBeNull(); // recent contact
});

test("kaart op /data: 'Event log' aanwezig; Loading en Brand relations niet meer", async () => {
  await renderServer(
    <Screen>
      <DataCards badge={{ "/data/enrichment": 3 }} />
    </Screen>,
  );
  await expect.element(page.getByText("Event log")).toBeInTheDocument();
  await expect.element(page.getByText("3", { exact: true })).toBeInTheDocument();
  expect(page.getByText("Loading").query()).toBeNull();
  expect(page.getByText("Brand relations").query()).toBeNull();
});

test("mini-scorecard: n/a bij 0 producten en donkergroen bij 100% must", async () => {
  await renderServer(overzicht);
  await expect.element(page.getByText("n/a")).toBeInTheDocument();
  // Kleurfunctie (pure): donkergroen alleen bij mustComplete + ratio 1.
  expect(blokKleur({ key: "x", labelEn: "x", ratio: 1, mustComplete: true }))
    .toBe("hsl(142 72% 26%)");
  expect(blokKleur({ key: "x", labelEn: "x", ratio: 0.5, mustComplete: false }))
    .toBe("hsl(55 65% 45%)");
  expect(blokKleur({ key: "x", labelEn: "x", ratio: null, mustComplete: false }))
    .toBeUndefined();
});

// ── Detailpagina (stap 5): volledige scorecard + relatieformulier ────────────

const filledByField: Record<string, number> = {
  supplier_article_code: 2,
  name_en: 2,
  category: 1,
  list_price_excl_vat: 2,
  kelvin: 2,
  cri: 1,
  color_1: 1,
};
const detailAggregate = fixtureAggregate(filledByField, 2);

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
      <BrandScorecard aggregate={detailAggregate} />
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
        .element(page.getByRole("button", { name: "Save" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("9. Documentation / links"))
        .toBeInTheDocument();
      // Geldige prijslijst → PriceListExpiryNotice-banner blijft afwezig (DoD 4b).
      expect(page.getByText(/extension/i).query()).toBeNull();
      await page.screenshot({
        path: `./data-merkrelatie-detail.${theme}.${device}.test.png`,
      });
    });
  }
}

// DoD 4b: dezelfde merkpagina, maar met een VERLOPEN prijslijst — de banner (variant
// "banner" van PriceListExpiryNotice) moet zichtbaar zijn, mét einddatum en "extension",
// terwijl de rest van de pagina (formulier, scorecard) ongewijzigd blijft.
const detailVerlopenPrijslijst = (
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
      <section>
        <h2 className="mb-3 font-medium">Completeness</h2>
        <div className="mb-4">
          <PriceListExpiryNotice
            indicator="verlopen"
            validUntil="2026-07-13"
            variant="banner"
            brandName="Occhio"
          />
        </div>
        <BrandScorecard aggregate={detailAggregate} />
      </section>
    </div>
  </Screen>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`merkrelatie-detail met verlopen prijslijst (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(detailVerlopenPrijslijst);
      await expect
        .element(page.getByText(/Occhio delivered prices/))
        .toBeInTheDocument();
      // Zelfde race als de andere matrix-tests: wacht tot de HELE scorecard (t/m
      // categorie 10) is doorgerenderd vóór de full-page capture, anders vangt de
      // screenshot een halfklaar grid met een lege staart.
      await expect
        .element(page.getByText("9. Documentation / links"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./data-merkrelatie-detail-verlopen-prijslijst.${theme}.${device}.test.png`,
      });
    });
  }
}

test("merkpagina met verlopen prijslijst: banner toont einddatum en 'extension'", async () => {
  await renderServer(detailVerlopenPrijslijst);
  await expect
    .element(page.getByText(/Occhio delivered prices — the list expired on 13-07-2026/))
    .toBeInTheDocument();
  await expect.element(page.getByText(/extension/i)).toBeInTheDocument();
});

test("merkpagina met geldige prijslijst: banner is afwezig (DoD 4b, tweede stand)", async () => {
  await renderServer(
    <Screen>
      <section>
        <h2 className="mb-3 font-medium">Completeness</h2>
        <PriceListExpiryNotice
          indicator="aanwezig_geldig"
          validUntil="2027-07-21"
          variant="banner"
          brandName="Occhio"
        />
        <BrandScorecard aggregate={detailAggregate} />
      </section>
    </Screen>,
  );
  await expect
    .element(page.getByText("1. Basics & identity"))
    .toBeInTheDocument();
  expect(page.getByText(/extension/i).query()).toBeNull();
});

test("detail-scorecard: dekkings-%, grijze niet-meetbare velden, interne velden en legenda", async () => {
  await renderServer(detail);
  // Legenda met de donkergroen-definitie (Timo-besluit 1).
  await expect
    .element(page.getByText(/Dark green = all must fields 100%/))
    .toBeInTheDocument();
  // Dekkingspercentages: kelvin 100%, cri 50%.
  await expect
    .element(page.getByTitle(/Color temperature \(K\): 100% of products/))
    .toBeInTheDocument();
  await expect
    .element(page.getByTitle(/CRI: 50% of products/))
    .toBeInTheDocument();
  // Niet-meetbaar veld: sinds 1.6 staan de twee kolomloze 🔒-velden uitsluitend in
  // categorie 11 (G10). EAN-code is measurable en staat in categorie 1.
  await expect
    .element(page.getByTitle(/Purchase price excl\. VAT: not measurable yet/))
    .toBeInTheDocument();
  expect(page.getByTitle(/EAN code: not measurable yet/).query()).toBeNull();
  // Bucket 9 is volledig meetbaar, maar staat er nog steeds (categorie 1-10).
  await expect
    .element(page.getByText("9. Documentation / links"))
    .toBeInTheDocument();
  // Interne 🔒-velden dragen een slotje (aria-label "internal") — sinds 1.6 staan alle
  // zes uitsluitend in categorie 11, dus dit telt exact, niet "minstens".
  expect(page.getByLabelText("internal").all()).toHaveLength(6);
});

test("detail-scorecard (G9-G12): categorie 1-10 met percentage, categorie 11 apart en niet meegewogen, drie totalen", async () => {
  await renderServer(detail);
  // G9: categorie 1-10 heeft een percentage naast de kop — niet het gemiddelde van de
  // drie niveaus (G12), maar de veldgewogen ratio uit de aggregatie zelf.
  await expect
    .element(page.getByText("1. Basics & identity"))
    .toBeInTheDocument();
  // G10: categorie "11. Internal" staat er, zichtbaar, en apart gemarkeerd.
  await expect.element(page.getByText("11. Internal")).toBeInTheDocument();
  await expect
    .element(page.getByText("not included in the totals"))
    .toBeInTheDocument();
  // Commercial hield na de verhuizing precies één veld over (G9/G12): het prijsveld.
  const commercialHeading = page.getByText("2. Commercial").query();
  const commercial = commercialHeading?.closest("section");
  expect(commercial).not.toBeNull();
  expect(commercial!.textContent).toContain("Gross list price excl. VAT");
  expect(commercial!.textContent).not.toContain("Stock");
  // DoD 4c: categorie 1-10 dekt exact excelColumns().length (66) velden.
  await expect
    .element(page.getByText(/66 fields requested in the brand Excel/))
    .toBeInTheDocument();
  // G11: drie totalen onderaan, veldgewogen over 1-10 — niet over 11.
  for (const niveau of ["must", "wanna", "nice"]) {
    const total = page.getByLabelText(`Total ${niveau}`);
    await expect.element(total).toBeInTheDocument();
    await expect.element(total).toHaveTextContent(/%/);
  }
});

test("detail-formulier: relatievelden vooringevuld en opslaan-knop aanwezig", async () => {
  await renderServer(detail);
  await expect.element(page.getByLabelText("Status")).toHaveValue("benaderd");
  await expect.element(page.getByLabelText("Contact", { exact: true })).toHaveValue("Anna");
  await expect
    .element(page.getByLabelText("Email"))
    .toHaveValue("anna@occhio.de");
  await expect
    .element(page.getByLabelText("Last contact"))
    .toHaveValue("2026-06-01");
  await expect
    .element(page.getByRole("button", { name: "Save" }))
    .toBeInTheDocument();
});

test("scorecard zonder producten toont n/a-uitleg i.p.v. 0% rood", async () => {
  await renderServer(
    <Screen>
      <BrandScorecard aggregate={fixtureAggregate({}, 0)} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/completeness n\/a/))
    .toBeInTheDocument();
});

// DoD 6 vraagt dat de PNG's zélf bekeken worden, en dat kon bij de scorecard niet:
// page.screenshot() schildert alleen wat binnen de viewport valt, en die is 800px
// hoog terwijl de volledige scorecard ~3000px is. Op de detail-PNG's is daardoor
// alles vanaf categorie 3 blanco — de assertions dekken het wél, het beeld niet.
// Daarom hier één capture op volle hoogte: dit is de enige PNG waarop de elf
// categorieën, de percentages en de drie totalen tegelijk te zien zijn.
// (De viewport-afkapping is een bestaande eigenschap van de harness en raakt élke
// pagina langer dan 800px; niet geïntroduceerd door 1.6 — zie rapport.)
for (const theme of ["light", "dark"] as const) {
  test(`scorecard volledig (${theme}, volle hoogte) — 11 categorieën + totalen`, async () => {
    await page.viewport(1280, 3200);
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderServer(
      <Screen>
        <BrandScorecard aggregate={detailAggregate} />
      </Screen>,
    );
    await expect
      .element(page.getByText("11. Internal"))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("10. Sustainability / environment"))
      .toBeInTheDocument();
    await page.screenshot({
      path: `./data-scorecard-volledig.${theme}.desktop.test.png`,
    });
  });
}
