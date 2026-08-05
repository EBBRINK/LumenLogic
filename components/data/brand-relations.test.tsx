// White-box RSC-tests van het merkrelaties-overzicht (stap 3/4) met fixture-data:
// default-status zichtbaar, filters (status + "geen reactie"), kaart-badge op /data.
// Screenshots licht/donker × mobiel/desktop.
//
// Herbouw 30 jul (UX-audit bak 2 item 10): de vier punten van die herbouw hebben elk hun
// eigen assertie — badge-die-op-klik-editeert, paginering met de stand in de URL, bulkactie
// via ConfirmActionDialog, en wat er met de drie informatieloze kolommen gebeurd is.
// Het filteren zit niet langer in de component maar in lib/brand-relations-view.ts; dat
// wordt hier puur getoetst, zónder browser.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import {
  BrandRelationsTable,
  type BrandRelationTableRow,
} from "./brand-relations-table";
import {
  BrandRelationsPager,
  BrandRelationsToolbar,
} from "./brand-relations-controls";
import {
  BRAND_RELATIONS_PAGE_SIZE,
  brandRelationsHref,
  filterBrandRelationRows,
  pageSlice,
  pageWindow,
  parseBrandRelationsQuery,
  type BrandRelationBaseRow,
  type BrandRelationsQuery,
} from "@/lib/brand-relations-view";
import { niveauLabel } from "@/lib/niveau-labels";
import { DataCards } from "./data-cards";
import { blokKleur } from "./mini-scorecard";
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

const basisRijen: BrandRelationBaseRow[] = [
  {
    brandId: "b-flos",
    brandName: "Flos",
    brandCode: "L010",
    status: "niet_benaderd",
    lastContactAt: null,
    productCount: 42,
    priceListIndicator: "aanwezig_geldig",
    sharedBrandCode: false,
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
  },
];

const dekking: Record<string, number | null> = {
  "b-flos": 0.62,
  "b-occhio": 0.07,
  "b-xal": 1,
  "b-kaal": null, // 0 producten → n/a
};

const rows: BrandRelationTableRow[] = basisRijen.map((r) => ({
  ...r,
  completeness: dekking[r.brandId] ?? null,
}));

const ALLES: BrandRelationsQuery = {
  q: "",
  status: "alle",
  noResponse: false,
  page: 1,
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

// Het scherm zoals de RSC het samenstelt: werkbalk (server) + tabel (client) + pager.
// De actions blijven `noopAction`: een gewone functie mag de rendergrens niet over
// ("Functions cannot be passed directly to Client Components"), dus een spy die de
// FormData afvangt kan hier niet. Wat er naar de server gaat is daarom wit-op-zwart in
// de DOM gepind (de verborgen velden van de bevestigingsdialoog) en aan de schrijfkant in
// lib/repo/brand-relations.test.ts.
function Overzicht({
  query = ALLES,
  paginaRijen = rows,
  totaal = rows.length,
  gefilterd = rows.length,
}: {
  query?: BrandRelationsQuery;
  paginaRijen?: BrandRelationTableRow[];
  totaal?: number;
  gefilterd?: number;
}) {
  const window = pageWindow(gefilterd, query.page);
  return (
    <Screen>
      <div className="space-y-4">
        <BrandRelationsToolbar
          query={query}
          window={window}
          totalCount={totaal}
        />
        <BrandRelationsTable
          rows={paginaRijen}
          updateAction={noopAction}
          bulkAction={noopAction}
        />
        <BrandRelationsPager query={query} window={window} />
      </div>
    </Screen>
  );
}

const overzicht = <Overzicht />;

// renderServer() geeft terug vóór de client-tabel er staat; een synchrone DOM-telling
// meteen daarna telt nul. Alle tests die zélf in de DOM kijken wachten hierop.
async function wachtOpTabel() {
  await expect
    .element(page.getByLabelText("Select all brands on this page"))
    .toBeInTheDocument();
}

function selects(): NodeListOf<HTMLSelectElement> {
  return document.querySelectorAll("tbody select");
}

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
      await expect
        .element(page.getByText("Showing 1–4 of 4 brands"))
        .toBeInTheDocument();
      await expect.element(page.getByText("Occhio")).toBeInTheDocument();
      await page.screenshot({
        path: `./data-merkrelaties.${theme}.${device}.test.png`,
      });
    });
  }
}

test("default-status 'Niet benaderd' zichtbaar; dubbele-code-badge en prijslijst-badges", async () => {
  await renderServer(overzicht);
  await expect
    .element(page.getByLabelText("Change status of Flos"))
    .toHaveTextContent("Not approached");
  // K8: beide L052-merken dragen de badge.
  expect(page.getByText("duplicate code").all()).toHaveLength(2);
  await expect.element(page.getByText("Expired")).toBeInTheDocument();
  await expect.element(page.getByText("Missing")).toBeInTheDocument();
  await expect
    .element(page.getByText("Showing 1–4 of 4 brands"))
    .toBeInTheDocument();
});

// ── Punt 1: badge die op klik editeerbaar wordt ──────────────────────────────

test("punt 1: geen enkele combobox in rust; klikken op de badge levert er precies één", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  // Dit is de kern van de bevinding: 438 rijen × een gemonteerde <select>. Vier rijen,
  // nul comboboxen — de status staat er als badge.
  expect(selects()).toHaveLength(0);
  await expect
    .element(page.getByLabelText("Change status of Flos"))
    .toHaveTextContent("Not approached");

  await page.getByLabelText("Change status of Flos").click();
  await expect
    .element(page.getByLabelText("Status of Flos"))
    .toHaveValue("niet_benaderd");
  // Eén open editor op de hele pagina, niet één per rij.
  expect(selects()).toHaveLength(1);
});

test("punt 1: de editor houdt exact de bestaande statusvocabulaire", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  await page.getByLabelText("Change status of Occhio").click();
  const editor = selects()[0];
  expect([...editor.options].map((o) => o.value)).toEqual([
    "niet_benaderd",
    "benaderd",
    "wacht_op_data",
    "data_ontvangen",
    "verwerkt",
    "afgewezen",
  ]);
  expect([...editor.options].map((o) => o.textContent)).toEqual([
    "Not approached",
    "Approached",
    "Awaiting data",
    "Data received",
    "Processed",
    "Declined",
  ]);
});

test("punt 1: kiezen sluit de editor weer — de badge is de ruststand", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  await page.getByLabelText("Change status of Flos").click();
  await page.getByLabelText("Status of Flos").selectOptions("Awaiting data");
  await expect.poll(() => selects().length).toBe(0);
});

// ── Punt 2: paginering, met de stand in de URL ───────────────────────────────

test("punt 2: 438 merken leveren 25 rijen op de pagina, niet 438", async () => {
  const veel: BrandRelationTableRow[] = Array.from({ length: 438 }, (_, i) => ({
    brandId: `b-${i}`,
    brandName: `Brand ${String(i).padStart(3, "0")}`,
    brandCode: `L${String(i).padStart(3, "0")}`,
    status: "niet_benaderd",
    lastContactAt: null,
    productCount: i,
    priceListIndicator: "aanwezig_geldig",
    sharedBrandCode: false,
    completeness: null,
  }));
  const window = pageWindow(veel.length, 1);
  expect(window.pageCount).toBe(18);
  const pagina = pageSlice(veel, window);
  expect(pagina).toHaveLength(BRAND_RELATIONS_PAGE_SIZE);

  await renderServer(
    <Overzicht paginaRijen={pagina} totaal={438} gefilterd={438} />,
  );
  await wachtOpTabel();
  // Meting, geen schatting: 25 datarijen in de body, en nul comboboxen.
  expect(document.querySelectorAll("tbody tr")).toHaveLength(25);
  expect(selects()).toHaveLength(0);
  await expect
    .element(page.getByText("Showing 1–25 of 438 brands"))
    .toBeInTheDocument();
  await expect.element(page.getByText("Page 1 of 18")).toBeInTheDocument();
});

test("punt 2: pager en filters dragen de hele stand in de URL", () => {
  const query: BrandRelationsQuery = {
    q: "occ",
    status: "benaderd",
    noResponse: true,
    page: 3,
  };
  // Bladeren houdt zoekterm én filters vast.
  expect(brandRelationsHref(query, { page: 4 })).toBe(
    "/data/brand-relations?q=occ&status=benaderd&noresponse=1&page=4",
  );
  // Een andere selectie zet de pagina terug op 1 — anders sta je op pagina 3 van 1.
  expect(brandRelationsHref(query, { status: "verwerkt" })).toBe(
    "/data/brand-relations?q=occ&status=verwerkt&noresponse=1",
  );
  // Heen en weer: de URL is de enige bron van waarheid.
  expect(
    parseBrandRelationsQuery({
      q: "occ",
      status: "benaderd",
      noresponse: "1",
      page: "3",
    }),
  ).toEqual(query);
  // Onzin uit de URL valt terug op de veilige stand, hij crasht niet.
  expect(
    parseBrandRelationsQuery({ status: "bestaat_niet", page: "-4" }),
  ).toEqual(ALLES);
});

test("punt 2: de pagerknoppen staan er echt en wijzen naar de buurpagina's", async () => {
  const query: BrandRelationsQuery = {
    q: "",
    status: "alle",
    noResponse: false,
    page: 2,
  };
  await renderServer(
    <Overzicht query={query} paginaRijen={rows} totaal={438} gefilterd={438} />,
  );
  await expect.element(page.getByText("Page 2 of 18")).toBeInTheDocument();
  await expect
    .element(page.getByRole("link", { name: "Previous", exact: true }))
    .toHaveAttribute("href", "/data/brand-relations");
  await expect
    .element(page.getByRole("link", { name: "Next", exact: true }))
    .toHaveAttribute("href", "/data/brand-relations?page=3");
});

test("statusfilter en zoeken beperken de lijst (puur, zoals de RSC het doet)", () => {
  const alleen = filterBrandRelationRows(
    basisRijen,
    { ...ALLES, status: "data_ontvangen" },
    TODAY,
  );
  expect(alleen.map((r) => r.brandName)).toEqual(["XAL"]);

  const gezocht = filterBrandRelationRows(basisRijen, { ...ALLES, q: "occ" }, TODAY);
  expect(gezocht.map((r) => r.brandName)).toEqual(["Occhio"]);

  // Zoeken op merkcode werkt ook — L052 wordt door twee merken gedeeld (K8).
  const opCode = filterBrandRelationRows(basisRijen, { ...ALLES, q: "l052" }, TODAY);
  expect(opCode.map((r) => r.brandName)).toEqual(["Occhio", "XAL"]);
});

test("'geen reactie'-filter: alléén benaderd + laatste contact ouder dan de drempel", () => {
  const geenReactie = filterBrandRelationRows(
    basisRijen,
    { ...ALLES, noResponse: true },
    TODAY,
  );
  expect(geenReactie.map((r) => r.brandName)).toEqual(["Occhio"]);
});

test("de werkbalk toont het statusfilter als links met aria-current", async () => {
  await renderServer(
    <Overzicht query={{ ...ALLES, status: "benaderd" }} gefilterd={2} />,
  );
  await expect
    .element(page.getByRole("link", { name: "Approached", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(page.getByRole("link", { name: "Data received", exact: true }))
    .toHaveAttribute("href", "/data/brand-relations?status=data_ontvangen");
});

// Reviewzwerm 2.5a C1: een filter zonder treffers gaf een kale grijze regel — het dialect
// dat components/ui/empty-state.tsx afschaft. De assertie hangt aan
// `data-slot="empty-state"` en niet aan de zin: alleen zo bewijst hij dat het GEDEELDE
// component rendert en niet dat er toevallig dezelfde woorden staan.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`filter zonder treffers: de gedeelde lege toestand, framed, zonder eigen actie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Overzicht
          query={{ ...ALLES, q: "bestaat-niet" }}
          paginaRijen={[]}
          gefilterd={0}
        />,
      );
      await expect
        .element(page.getByText("No brands match the filters."))
        .toBeInTheDocument();

      const leeg = document.querySelector<HTMLElement>('[data-slot="empty-state"]');
      expect(
        leeg,
        "geen [data-slot=empty-state]: terug op de kale grijze regel",
      ).not.toBeNull();
      // "framed": de tabel staat in een space-y-kolom naast toolbar en pager, niet in een
      // <Card> die het kader al tekent.
      expect(leeg!.dataset.variant).toBe("framed");
      expect(leeg!.className).toContain("border-dashed");
      // Bewuste `action={null}`: het filter dat deze leegte maakt staat in de werkbalk
      // erboven, met zijn eigen wisknop.
      expect(leeg!.children.length).toBe(1);
      // En de tabel zelf is er niet — anders zou de lege staat naast een kop-zonder-rijen staan.
      expect(document.querySelector("tbody")).toBeNull();

      await page.screenshot({
        path: `./data-merkrelaties-leeg.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── Punt 3: bulkactie met één bevestiging ────────────────────────────────────

test("punt 3: selectie + bulkstatus gaat via één bevestiging, met de juiste lading", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  // Geen selectie → geen bulkbalk (het scherm blijft een lijst, geen formulier).
  expect(page.getByText(/selected/).query()).toBeNull();

  await page.getByLabelText("Select Flos").click();
  await page.getByLabelText("Select XAL").click();
  await expect.element(page.getByText("2 selected")).toBeInTheDocument();

  await page
    .getByLabelText("Status for the selected brands")
    .selectOptions("Processed");
  await page.getByRole("button", { name: "Apply to 2" }).click();

  // Eén bevestiging, en die noemt het doel bij naam — aantal én doelstatus.
  await expect
    .element(page.getByText(/Set 2 brands to “Processed”\?/))
    .toBeInTheDocument();
  // De lading die straks de server-action in gaat, wit-op-zwart in de DOM.
  const dialoog = document.querySelector('[role="dialog"]')!;
  expect(
    dialoog.querySelector<HTMLInputElement>('input[name="brandIds"]')!.value,
  ).toBe("b-flos,b-xal");
  expect(
    dialoog.querySelector<HTMLInputElement>('input[name="status"]')!.value,
  ).toBe("verwerkt");
  // Precies één bevestigknop — geen tweede pad langs de dialoog om.
  await expect
    .element(page.getByRole("button", { name: "Set 2 to Processed" }))
    .toBeInTheDocument();

  // Bevestigen sluit de dialoog én maakt de selectie leeg: één handeling, één gevolg.
  // (Dit is precies waarvoor ConfirmActionDialog een `onDone` gekregen heeft — de drie
  // oudere aanroepers laten hun trigger verdwijnen en sloten daardoor vanzelf.)
  await page.getByRole("button", { name: "Set 2 to Processed" }).click();
  await expect.poll(() => page.getByText("2 selected").query()).toBeNull();
  await expect
    .poll(() => document.querySelector('[role="dialog"]'))
    .toBeNull();
});

test("punt 3: 'alles op deze pagina' selecteert precies de zichtbare rijen", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  await page.getByLabelText("Select all brands on this page").click();
  await expect.element(page.getByText("4 selected")).toBeInTheDocument();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect.poll(() => page.getByText("4 selected").query()).toBeNull();
});

// ── Punt 4: de drie kolommen zonder informatie ───────────────────────────────

test("punt 4: 'Last contact' is geen kolom meer maar staat onder de statusbadge", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  // De kop is weg (was 438× "—")...
  expect(
    page.getByRole("columnheader", { name: "Last contact" }).query(),
  ).toBeNull();
  // ...maar de datum zelf is niet verdwenen: hij staat bij de status waar hij bij hoort,
  // en alleen bij merken die écht contact hebben gehad.
  await expect
    .element(page.getByText("Last contact 01-06-2026"))
    .toBeInTheDocument();
  expect(page.getByText(/Last contact/).all()).toHaveLength(3); // Flos heeft er geen
});

test("punt 4: 'Price list' tint alleen de uitzonderingen, niet de 437× 'Valid'", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  const valid = page.getByText("Valid").element();
  const expired = page.getByText("Expired").element();
  // Geldig = stille tekst zonder tint; de uitzonderingen dragen wél een badge.
  expect(valid.className).not.toContain("status-green-tint");
  expect(valid.className).toContain("text-muted-foreground");
  expect(expired.className).toContain("status-grey-tint");
  expect(page.getByText("Missing").element().className).toContain(
    "status-red-tint",
  );
});

test("punt 4: 'Completeness' is een percentage met link naar de scorecard, geen blokjesdiagram", async () => {
  await renderServer(overzicht);
  await wachtOpTabel();
  // Geen micro-diagram meer in de rij.
  expect(document.querySelectorAll("tbody .size-3")).toHaveLength(0);
  const pct = page.getByRole("link", { name: "62%" });
  await expect.element(pct).toBeInTheDocument();
  await expect
    .element(pct)
    .toHaveAttribute("href", "/data/brand-relations/b-flos");
  // 0 producten blijft "n/a" — geen 0% dat als slecht rapportcijfer leest.
  await expect.element(page.getByText("n/a")).toBeInTheDocument();
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

test("mini-scorecard-kleurfunctie blijft gelden voor het detailscherm", () => {
  // De blokjes zijn uit de OVERZICHTSRIJ verdwenen (punt 4), de kleurregel niet: het
  // detailscherm tekent de scorecard nog steeds op dezelfde gradient.
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
  // Legenda met de donkergroen-definitie (Timo-besluit 1). UX-audit 30 jul (item 4):
  // de legenda noemt het weergavelabel, niet de opgeslagen enum.
  await expect
    .element(page.getByText(/Dark green = all Required fields 100%/))
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
  // Het aria-label draagt sinds UX-audit-item 4 het WEERGAVELABEL (Required/Requested/
  // Optional), niet de opgeslagen enum; deze assertie stond nog op de enum en was daardoor
  // al rood vóór deze herbouw. Gerepareerd langs dezelfde map die de component gebruikt.
  for (const niveau of ["must", "wanna", "nice"] as const) {
    const total = page.getByLabelText(`Total ${niveauLabel(niveau)}`);
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
