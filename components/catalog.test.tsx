// White-box RSC-render van het losse catalogus-zoekscherm met fixture-data. Licht/donker ×
// mobiel/desktop. Assert op zichtbare structuur: merk-select, beide resultaatlijsten, en dat
// een product met prijs zichtbaar is. Ontbrekende-data-vlag en de "nog niet gezocht"-staat
// hebben eigen asserts.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  CatalogSearch,
  type CatalogResult,
  type CatalogValues,
} from "./catalog-search";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const brands = ["Glamox", "Wever & Ducré", "XAL"];

const values: CatalogValues = {
  brand: "XAL",
  q: "SASSO 100",
  kelvin: "2700",
  cri: "90",
  ip: "",
};

const aantoonbaar: CatalogResult[] = [
  {
    id: "p1",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K 220-240V",
    brandName: "XAL",
    articleCode: "L360048-2191",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 2700,
    cri: 90,
    ipValue: "IP20",
    lumenOutput: 1200,
    grossPrice: "310.00",
    matchKind: "fuzzy",
  },
  {
    id: "p2",
    name: "SASSO 100 RD SP CEIL 25W LED 2700K 220-240V",
    brandName: "XAL",
    articleCode: "L360048-2192",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 2700,
    cri: 92,
    ipValue: "IP20",
    lumenOutput: 1800,
    grossPrice: "345.00",
    matchKind: "fuzzy",
  },
];

const onvolledig: CatalogResult[] = [
  {
    id: "p3",
    name: "SASSO 100 TRIM SP CEIL LED 220-240V",
    brandName: "XAL",
    articleCode: "L360048-9000",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: null,
    cri: null,
    ipValue: "IP20",
    lumenOutput: null,
    grossPrice: "180.00",
    matchKind: "fuzzy",
    missing: ["color temp.", "CRI"],
  },
];

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const searchedUi = (
  <div className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="mb-4 text-2xl font-semibold tracking-tight">Catalogus</h1>
    <CatalogSearch
      brands={brands}
      values={values}
      aantoonbaar={aantoonbaar}
      onvolledig={onvolledig}
      searched
      filtersActive
    />
  </div>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`catalogus (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(searchedUi);
      await expect.element(document.body).toBeInTheDocument();
      // merk-select + beide lijsten + een geprijsd product zichtbaar
      await expect.element(page.getByTestId("brand-select")).toBeInTheDocument();
      await expect.element(page.getByText("Provably compliant")).toBeInTheDocument();
      await expect
        .element(page.getByText("Possible — data incomplete"))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("SASSO 100 SQ SP CEIL 17,9W cob LED 2700K 220-240V"))
        .toBeInTheDocument();
      await expect.element(page.getByText("€ 310,00")).toBeInTheDocument();
      await page.screenshot({ path: `./catalog.${theme}.${device}.test.png` });
    });
  }
}

test("brand-select toont alle merken als opties", async () => {
  await renderServer(searchedUi);
  for (const b of brands) {
    await expect.element(page.getByRole("option", { name: b })).toBeInTheDocument();
  }
  await expect
    .element(page.getByRole("option", { name: "All brands" }))
    .toBeInTheDocument();
});

test("onvolledig-item benoemt de ontbrekende data (nooit stil weggelaten)", async () => {
  await renderServer(searchedUi);
  await expect
    .element(page.getByText("no data for: color temp., CRI"))
    .toBeInTheDocument();
});

// UX-audit 30 jul (item 12): de lijstnoot eindigde met "They are never silently omitted."
// Dat is beleid dat hier niet te kiezen valt — het scherm bewíjst het al met de regel
// hierboven ("no data for: …"). De belofte staat nog op één plek: het afrondingsblok in
// components/dossier/match-candidates.tsx. De noot die zegt wát de lijst is, blijft.
test("de lijstnoot zegt wat de lijst is, zonder het beleid voor te lezen", async () => {
  await renderServer(searchedUi);
  await expect
    .element(page.getByText(/No data is not a rejection/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("silently omitted");
});

test("nog niet gezocht: prompt zichtbaar, geen resultaatlijsten", async () => {
  await renderServer(
    <div className="min-h-screen bg-background p-6 text-foreground">
      <CatalogSearch brands={brands} searched={false} />
    </div>,
  );
  await expect
    .element(page.getByText("Choose a brand or type free text and search the catalog."))
    .toBeInTheDocument();
  expect(page.getByText("Provably compliant").query()).toBeNull();
});
