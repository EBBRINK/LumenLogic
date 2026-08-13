// White-box RSC-tests van het voorstel-scherm van het retour-pad (sprint 1.2,
// docs/plan-1-2-retourpad.md besluit 4). Fixture-data, geen database: de diff-engine heeft
// zijn eigen pure tests (lib/template-diff.test.ts) — hier staat de vraag of het SCHERM de
// besluiten eerlijk vertelt.
//
// WAT HIER ECHT WORDT AFGEDWONGEN zijn de vinkje-defaults, want die zijn het ontwerp:
//   new              → vinkje AAN   (DB was leeg; additief)
//   changed          → vinkje UIT   (DB gevuld: bestaand wint, tenzij aangevinkt)
//   conflict/clear   → vinkje UIT   (het merk wil wissen; zelfde klasse als changed)
//   unprocessable / not_storable / price_clear → GEEN vinkje (niet toepasbaar)
//   ambiguous_duplicate + geblokkeerd nieuw product → GEEN vinkje
//   nieuw product    → één vinkje op PRODUCTniveau, default UIT
// Een omgeslagen default is geen opmaakdetail maar stille schade aan de catalogus, dus
// staat elke default hier als losse assert — niet als screenshot-oordeel.
//
// De fixture is met de hand geschreven en niet door diffTemplateRows gehaald: dan zou een
// bug in de engine deze test stil kunnen laten vergroenen op een voorstel dat er niet is.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import type { AfwijzingsReden, RijWaarschuwing } from "@/lib/excel-validate";
import { afwijzingsTekst } from "@/lib/excel-validate-messages";
import type { ProductDiff, TemplateProposal as TemplateProposalData } from "@/lib/template-diff";
import { TemplateProposal } from "./template-proposal";
import { KaartMetFormatAfwijzing } from "./template-upload-test-stubs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// ── De fixture: élke categorie uit besluit 4, één keer ───────────────────────

// Eén eigen veld (sprint 1.8). De sleutel wordt hier LETTERLIJK geschreven en niet met
// eigenVeldKey() gebouwd: deze test moet breken als de sleutelvorm verandert, want dat is
// precies wat het scherm en de apply-laag uit elkaar zou laten lopen.
const EIGEN_ID = "6f1a3d2c-8b44-4c1e-9f77-2a5b6c7d8e90";
const EIGEN_VELD = `custom:${EIGEN_ID}`;

const rows: ProductDiff[] = [
  // Bestaand product met de volle waaier: new, changed, alle drie de conflictsoorten
  // die op een veld kunnen landen, één unchanged (mag NIET renderen) en een prijs.
  {
    kind: "known",
    rij: 4,
    articleCode: "ART-100",
    productId: "p-100",
    productName: "Downlight Alpha 3000K",
    fields: [
      // DB leeg → vinkje AAN
      { kind: "new", fieldKey: "kelvin", doel: { kind: "kolom", kolom: "kelvin" }, next: "3000", nextRuw: "3000" },
      // DB gevuld, ander → vinkje UIT
      { kind: "changed", fieldKey: "cri", doel: { kind: "kolom", kolom: "cri" }, prev: "80", next: "90", nextRuw: "90" },
      // Cel leeg, DB gevuld → wissen; vinkje UIT
      { kind: "conflict", fieldKey: "color_1", reden: { code: "clear", doel: { kind: "kolom", kolom: "color1" }, prev: "Black" } },
      // Celtekst past niet in het kolomtype → geen vinkje
      {
        kind: "conflict",
        fieldKey: "lumen_output",
        reden: { code: "unprocessable", doel: { kind: "kolom", kolom: "lumenOutput" }, ruw: "warm-ish", kolomType: "int" },
      },
      // Geen schrijf-mapping → ontvangen, niet opslagbaar; geen vinkje
      {
        kind: "conflict",
        fieldKey: "photobiological_safety",
        reden: { code: "not_storable", ruw: "RG1" },
      },
      // Genormaliseerd gelijk → mag NIET als rij verschijnen (telt alleen mee)
      { kind: "unchanged", fieldKey: "material_1", doel: { kind: "kolom", kolom: "material1" }, waarde: "Aluminium" },
      // Sprint 1.8: een EIGEN veld van Stefan. Het staat niet in FIELD_CATALOG, dus zijn
      // label komt uit de eigenVeldLabels-map van de pagina — zonder die map zou het
      // scherm hier de kale sleutel `custom:<uuid>` tonen.
      {
        kind: "new",
        fieldKey: EIGEN_VELD,
        doel: { kind: "custom", fieldId: EIGEN_ID },
        next: "35",
        nextRuw: "35",
      },
    ],
    price: { kind: "changed", prev: "199", next: "210.5", nextRuw: "210,50" },
    waarschuwingen: [],
  },
  // Prijs wissen: nooit toepasbaar (een product zonder prijs verdwijnt uit élke zoekactie).
  {
    kind: "known",
    rij: 5,
    articleCode: "ART-200",
    productId: "p-200",
    productName: "Spot Beta",
    fields: [],
    price: { kind: "conflict", reden: { code: "price_clear", prev: "88" } },
    waarschuwingen: [],
  },
  // Nieuw product: één vinkje op productniveau, default UIT.
  {
    kind: "new_product",
    rij: 6,
    articleCode: "ART-300",
    fields: [
      { kind: "new", fieldKey: "name_en", doel: { kind: "kolom", kolom: "nameEn" }, next: "Pendant Gamma", nextRuw: "Pendant Gamma" },
      { kind: "new", fieldKey: "kelvin", doel: { kind: "kolom", kolom: "kelvin" }, next: "2700", nextRuw: "2700" },
    ],
    price: { kind: "new", next: "349", nextRuw: "349,00" },
    blocked: null,
    waarschuwingen: [
      { code: "onbekende_artikelcode", rij: 6, artikelcode: "ART-300" },
    ],
  },
  // Geblokkeerd nieuw product: products.name is NOT NULL → geen vinkje, wél tonen.
  {
    kind: "new_product",
    rij: 7,
    articleCode: "ART-400",
    fields: [
      { kind: "new", fieldKey: "kelvin", doel: { kind: "kolom", kolom: "kelvin" }, next: "4000", nextRuw: "4000" },
    ],
    price: null,
    blocked: { code: "missing_name" },
    waarschuwingen: [
      { code: "must_veld_leeg", rij: 7, fieldKey: "name_en", labelEn: "Product name (English)" },
      { code: "onbekende_artikelcode", rij: 7, artikelcode: "ART-400" },
    ],
  },
  // Het bestand spreekt zichzelf tegen: niets uit deze rijen is toepasbaar.
  { kind: "ambiguous_duplicate", articleCode: "ART-500", rijen: [8, 9] },
];

const waarschuwingen: RijWaarschuwing[] = [
  { code: "must_veld_leeg", rij: 7, fieldKey: "name_en", labelEn: "Product name (English)" },
  { code: "onbekende_artikelcode", rij: 6, artikelcode: "ART-300" },
  { code: "onbekende_artikelcode", rij: 7, artikelcode: "ART-400" },
  { code: "dubbele_artikelcode", rij: 8, artikelcode: "ART-500", ookOpRijen: [9] },
  { code: "dubbele_artikelcode", rij: 9, artikelcode: "ART-500", ookOpRijen: [8] },
];

const proposal: TemplateProposalData = {
  rows,
  counts: {
    newFields: 5, // kelvin(4) + eigen veld(4) + name_en(6) + kelvin(6) + kelvin(7)
    changedFields: 1, // cri(4)
    conflicts: 4, // clear + unprocessable + not_storable + price_clear
    unchangedFields: 1, // material_1(4)
    newProducts: 2, // ART-300 + ART-400 (ook de geblokkeerde)
    knownProducts: 2,
    ambiguous: 1,
    priceLines: 2, // changed(4) + new(6)
  },
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

/** Zonder actieve prijslijst: dan — en alleen dan — vraagt het formulier naam + geldigheid
 *  uit (besluit 1). Een verzonnen einddatum maakt een merk stil onzichtbaar. */
const voorstel = (
  <Screen>
    <TemplateProposal
      brandId="b-occhio"
      uploadId="u-1"
      filename="occhio-template-ingevuld.xlsx"
      rowCount={6}
      proposal={proposal}
      waarschuwingen={waarschuwingen}
      activePriceList={null}
      eigenVeldLabels={{ [EIGEN_VELD]: "Recycled content (%)" }}
      approveAction={noopAction}
      rejectAction={noopAction}
    />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

/** Alle checkboxes van het formulier, op naam — het contract met de apply-laag. */
const vinkjes = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
const vinkje = (naam: string) =>
  document.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${naam}"]`);
/** De <li> van één veldvoorstel binnen één rij. */
const veldRij = (rij: number, fieldKey: string) =>
  document.querySelector<HTMLElement>(
    `section[data-rij="${rij}"] li[data-veld="${fieldKey}"]`,
  );

// ── Screenshots: licht/donker × mobiel/desktop ──────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`template-voorstel (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(voorstel);
      // Content-assert vóór de capture: een kale body-assert gaf blanco PNG's.
      await expect.element(page.getByText("Template proposal")).toBeInTheDocument();
      await expect
        .element(page.getByText("Downlight Alpha 3000K"))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Approve checked changes" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./data-template-voorstel.${theme}.${device}.test.png`,
      });
    });
  }
}

/**
 * De staart van het scherm apart in beeld. De capture stopt (harness-eigenaardigheid, ook
 * zichtbaar in de bestaande data-merkrelatie-detail-PNG's) na ~700px content, dus zónder
 * deze tweede fixture is er geen enkele screenshot waarop het geblokkeerde product, de
 * dubbele-code-groep, de prijslijst-fieldset en de Approve/Reject-knoppen te zien zijn —
 * precies de delen waar de meeste tekst een besluit moet dragen.
 */
const staart: TemplateProposalData = {
  rows: rows.slice(2), // ART-300 (nieuw), ART-400 (geblokkeerd), dubbele code
  counts: {
    newFields: 3,
    changedFields: 0,
    conflicts: 0,
    unchangedFields: 0,
    newProducts: 2,
    knownProducts: 0,
    ambiguous: 1,
    priceLines: 1,
  },
};

for (const theme of ["light", "dark"] as const) {
  test(`template-voorstel staart — geblokkeerd, dubbel, prijslijst (${theme}, desktop)`, async () => {
    await page.viewport(viewports.desktop.width, viewports.desktop.height);
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderServer(
      <Screen>
        <TemplateProposal
          brandId="b-occhio"
          uploadId="u-1"
          filename="occhio-template-ingevuld.xlsx"
          rowCount={4}
          proposal={staart}
          waarschuwingen={waarschuwingen}
          activePriceList={null}
          approveAction={noopAction}
          rejectAction={noopAction}
        />
      </Screen>,
    );
    await expect.element(page.getByText("New price list")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Reject" }))
      .toBeInTheDocument();
    await page.screenshot({
      path: `./data-template-voorstel-staart.${theme}.desktop.test.png`,
    });
  });
}

// ── Besluit 4: de defaults ──────────────────────────────────────────────────

test("new staat default AAN; changed en conflict/clear hebben een vinkje dat default UIT staat", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();

  // new → aan. De value is "" : de DB was leeg, dus prevSeen is null.
  const nieuw = vinkje("r4.kelvin");
  expect(nieuw).not.toBeNull();
  expect(nieuw!.checked).toBe(true);
  expect(nieuw!.value).toBe("");

  // changed → uit, en de value ÍS de getoonde oude waarde (de stale-guard).
  const gewijzigd = vinkje("r4.cri");
  expect(gewijzigd).not.toBeNull();
  expect(gewijzigd!.checked).toBe(false);
  expect(gewijzigd!.value).toBe("80");

  // conflict/clear → wél een vinkje (wissen kán), maar uit; value = de oude waarde.
  const wissen = vinkje("r4.color_1");
  expect(wissen).not.toBeNull();
  expect(wissen!.checked).toBe(false);
  expect(wissen!.value).toBe("Black");
});

test("niet-toepasbare conflicts hebben GEEN vinkje: unprocessable, not_storable, price_clear", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();

  expect(vinkje("r4.lumen_output")).toBeNull();
  expect(vinkje("r4.photobiological_safety")).toBeNull();
  expect(vinkje("r5.list_price_excl_vat")).toBeNull();

  // Ze worden wél getoond — "niet opslagbaar" is een mededeling, geen weglating.
  expect(veldRij(4, "lumen_output")?.dataset.reden).toBe("unprocessable");
  expect(veldRij(4, "photobiological_safety")?.dataset.reden).toBe("not_storable");
  expect(veldRij(5, "list_price_excl_vat")?.dataset.reden).toBe("price_clear");

  // "not storable" heet eerlijk "received — cannot be stored", en de rauwe waarde staat er.
  await expect
    .element(page.getByText(/Received — cannot be stored: we have no field for this yet/))
    .toBeInTheDocument();
  await expect.element(page.getByText("RG1")).toBeInTheDocument();
  // Een prijs wissen kan niet: dat zou het product uit élke zoekactie laten verdwijnen.
  await expect
    .element(page.getByText(/Clearing a price is not supported here/))
    .toBeInTheDocument();
});

test("ambiguous_duplicate en geblokkeerd nieuw product hebben GEEN vinkje", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();

  // Dubbele artikelcode: één groep, geen enkel vinkje, en de rijnummers staan erbij.
  expect(vinkje("np.r8")).toBeNull();
  expect(vinkje("np.r9")).toBeNull();
  await expect
    .element(page.getByText(/This article code appears on rows/))
    .toBeInTheDocument();

  // ART-400 mist een naam → products.name is NOT NULL → niets aan te maken.
  expect(vinkje("np.r7")).toBeNull();
  await expect
    .element(page.getByText(/We cannot create this product without a name/))
    .toBeInTheDocument();
  // De ontvangen waarde blijft wél zichtbaar; alleen niet aanvinkbaar.
  expect(veldRij(7, "kelvin")).not.toBeNull();
  expect(vinkje("r7.kelvin")).toBeNull();
});

test("nieuw product: één vinkje op PRODUCTniveau, default UIT — en geen vinkjes per veld", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();

  const product = vinkje("np.r6");
  expect(product).not.toBeNull();
  expect(product!.checked).toBe(false);

  // Alles van dit product hangt aan dat ene vinkje: geen veld- en geen prijsvinkje.
  // Een half aangemaakt product is geen bedoelde uitkomst.
  expect(vinkje("r6.name_en")).toBeNull();
  expect(vinkje("r6.kelvin")).toBeNull();
  expect(vinkje("r6.list_price_excl_vat")).toBeNull();
  // De velden staan er wél — je vinkt niet blind een product aan.
  expect(veldRij(6, "name_en")).not.toBeNull();
  expect(veldRij(6, "kelvin")).not.toBeNull();

  await expect
    .element(page.getByText(/a typo here silently creates a duplicate product/))
    .toBeInTheDocument();
});

test("het formulier bevat precies de vinkjes van besluit 4 — niet meer, niet minder", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();
  // Deze assert is het vangnet onder alle bovenstaande: een nieuw vinkje dat er stil
  // bij komt (of een dat verdwijnt) breekt hier, ook als niemand er een test bij schreef.
  expect(vinkjes().map((v) => v.name).sort()).toEqual([
    "np.r6",
    "r4.color_1",
    "r4.cri",
    `r4.${EIGEN_VELD}`,
    "r4.kelvin",
    "r4.list_price_excl_vat",
  ]);
  // Van die zes staan er precies twee aan: r4.kelvin en het eigen veld — beide `new`.
  // Een eigen veld volgt exact dezelfde defaults als een catalogusveld; een eigen regel
  // ervoor zou een tweede soort waarheid over dit scherm invoeren.
  expect(vinkjes().filter((v) => v.checked).map((v) => v.name)).toEqual([
    "r4.kelvin",
    `r4.${EIGEN_VELD}`,
  ]);
});

// ── Sprint 1.8: een eigen veld van Stefan op dit scherm ─────────────────────

test("eigen veld: label uit de map, sleutel in de selectie, defaults als elk ander veld", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();

  // Het label komt uit eigenVeldLabels — niet uit FIELD_CATALOG, waar het per
  // constructie nooit in staat.
  await expect
    .element(page.getByText("Recycled content (%)"))
    .toBeInTheDocument();
  expect(page.getByText(EIGEN_VELD).query()).toBeNull();

  // De selectie-sleutel draagt de dubbele punt ongeschonden (plan §1): de apply-laag
  // parseert hem nooit terug uit de samengestelde string.
  const vink = vinkje(`r4.${EIGEN_VELD}`);
  expect(vink).not.toBeNull();
  expect(vink!.checked).toBe(true);
  expect(vink!.value).toBe("");
  expect(veldRij(4, EIGEN_VELD)?.dataset.soort).toBe("new");
});

test("eigen veld zonder label in de map valt terug op de sleutel — zichtbaar, niet stil", async () => {
  await renderServer(
    <Screen>
      <TemplateProposal
        brandId="b-occhio"
        uploadId="u-1"
        filename="occhio-template-ingevuld.xlsx"
        rowCount={6}
        proposal={proposal}
        waarschuwingen={waarschuwingen}
        activePriceList={null}
        approveAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();
  // Geen map meegegeven (of het veld is intussen weg): dan staat de kale sleutel er, en
  // is het meteen te zien dat er een label ontbreekt. Een lege cel zou de rij laten
  // lijken op iets zonder naam en dus zonder betekenis.
  await expect.element(page.getByText(EIGEN_VELD)).toBeInTheDocument();
});

test("unchanged verschijnt niet als rij, wél in de telling", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("Downlight Alpha 3000K")).toBeInTheDocument();
  expect(veldRij(4, "material_1")).toBeNull();
  expect(page.getByText("Aluminium").query()).toBeNull();
  await expect.element(page.getByText(/unchanged/)).toBeInTheDocument();
});

// ── Samenvatting, select-all en de prijslijst-fieldset ──────────────────────

test("waarschuwingsbanner komt van de 1.1-renderer, niet uit eigen proza", async () => {
  await renderServer(voorstel);
  // samenvattingsTekst(): vat 1.1-waarschuwingen samen i.p.v. losse rode regels.
  await expect
    .element(page.getByText(/The format is correct — 6 product rows/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/2 possibly new product\(s\)/))
    .toBeInTheDocument();
  // waarschuwingsTekst() per rij, bij de groep waar hij over gaat. Letterlijk de zin van
  // de renderer: "Product name (English)" alléén zou óók de blokkade-tekst raken.
  await expect
    .element(page.getByText('Row 7: "Product name (English)" is empty. This is a required field.'))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/Row 6: we do not know article code "ART-300" yet/))
    .toBeInTheDocument();
  // En de belofte die het hele scherm draagt.
  await expect
    .element(page.getByText(/Nothing is saved yet/))
    .toBeInTheDocument();
});

test("'Select all new products' telt alleen de aanvinkbare nieuwe producten", async () => {
  await renderServer(voorstel);
  // ART-400 is geblokkeerd en heeft geen vinkje → de knop mag hem niet meetellen,
  // anders belooft "(2)" iets wat de knop niet kan waarmaken.
  await expect
    .element(page.getByRole("button", { name: "Select all new products (1)" }))
    .toBeInTheDocument();

  await page.getByRole("button", { name: "Select all new products (1)" }).click();
  expect(vinkje("np.r6")!.checked).toBe(true);
  // De knop raakt niets anders aan: changed blijft uit.
  expect(vinkje("r4.cri")!.checked).toBe(false);
});

test("zonder actieve prijslijst vraagt het formulier naam + geldigheid uit (verplicht)", async () => {
  await renderServer(voorstel);
  await expect.element(page.getByText("New price list")).toBeInTheDocument();
  for (const naam of ["priceListName", "priceListValidFrom", "priceListValidUntil"]) {
    const veld = document.querySelector<HTMLInputElement>(`[name="${naam}"]`);
    expect(veld, naam).not.toBeNull();
    // Verplicht: een prijslijst zonder einddatum voedt ijzeren regel 3 niet.
    expect(veld!.required, naam).toBe(true);
  }
  // Afwijzen mag nooit stuklopen op die verplichte velden — je wijst juist af.
  const reject = document.querySelector<HTMLButtonElement>(
    'button[formnovalidate]',
  );
  expect(reject?.textContent).toContain("Reject");
});

test("mét actieve prijslijst geen fieldset maar de naam van de lijst waarop wordt bijgeschreven", async () => {
  await renderServer(
    <Screen>
      <TemplateProposal
        brandId="b-occhio"
        uploadId="u-1"
        filename="occhio-template-ingevuld.xlsx"
        rowCount={6}
        proposal={proposal}
        waarschuwingen={waarschuwingen}
        activePriceList={{ name: "Price list 2026", validUntil: "2026-12-31" }}
        approveAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Prices will be added to price list/))
    .toBeInTheDocument();
  await expect.element(page.getByText("Price list 2026")).toBeInTheDocument();
  // Besluit 1: dit is een GEDEELTELIJKE bijwerking — de onaangeraakte producten
  // houden hun prijs. Dat moet er staan, want het tegendeel is de hazard.
  await expect
    .element(page.getByText(/Products you do not touch keep their current price/))
    .toBeInTheDocument();
  expect(page.getByText("New price list").query()).toBeNull();
  expect(document.querySelector('[name="priceListName"]')).toBeNull();
});

test("geen prijsvoorstellen → geen prijslijst-fieldset", async () => {
  await renderServer(
    <Screen>
      <TemplateProposal
        brandId="b-occhio"
        uploadId="u-1"
        filename="leeg.xlsx"
        rowCount={0}
        proposal={{ rows: [], counts: { ...proposal.counts, priceLines: 0 } }}
        waarschuwingen={[]}
        activePriceList={null}
        approveAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/This file changes nothing/))
    .toBeInTheDocument();
  expect(page.getByText("New price list").query()).toBeNull();
});

// Reviewzwerm 2.5a C1: "dit bestand verandert niets" stond op een kale grijze regel — het
// dialect dat components/ui/empty-state.tsx afschaft. De assertie hangt aan
// `data-slot="empty-state"` en niet aan de zin hierboven: alleen zo bewijst hij dat het
// GEDEELDE component rendert en niet dat er toevallig dezelfde woorden staan.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`een voorstel zonder rijen krijgt de gedeelde lege toestand (framed, geen eigen actie) (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <TemplateProposal
            brandId="b-occhio"
            uploadId="u-1"
            filename="leeg.xlsx"
            rowCount={0}
            proposal={{ rows: [], counts: { ...proposal.counts, priceLines: 0 } }}
            waarschuwingen={[]}
            activePriceList={null}
            approveAction={noopAction}
            rejectAction={noopAction}
          />
        </Screen>,
      );
      await expect
        .element(page.getByText(/This file changes nothing/))
        .toBeInTheDocument();

      const leeg = document.querySelector<HTMLElement>('[data-slot="empty-state"]');
      expect(
        leeg,
        "geen [data-slot=empty-state]: terug op de kale grijze regel",
      ).not.toBeNull();
      // "framed": het blok staat los in het formulier, niet in een <Card>.
      expect(leeg!.dataset.variant).toBe("framed");
      expect(leeg!.className).toContain("border-dashed");
      // Bewuste `action={null}`: Reject en Approve staan in de voettekst van hetzelfde
      // formulier; de lege staat biedt ze geen tweede keer aan.
      expect(leeg!.children.length).toBe(1);
      await expect
        .element(page.getByRole("button", { name: "Reject" }))
        .toBeInTheDocument();

      await page.screenshot({
        path: `./template-voorstel-leeg.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── De upload-kaart: format-afwijzing ───────────────────────────────────────

/** Werkblad ontbreekt: het merk stuurde zijn eigen Excel terug i.p.v. onze template —
 *  het vaakst voorkomende echte geval. De zin komt van de 1.1-renderer, hier serverside
 *  gerenderd zoals de echte action hem rendert (zie de kop van de stub). */
const AFWIJZINGS_REDEN: AfwijzingsReden = {
  code: "werkblad_ontbreekt",
  verwacht: "Product data",
  gevondenWerkbladen: ["Tabelle1", "Preisliste 2026"],
};
const AFWIJZINGS_TEKST = afwijzingsTekst(AFWIJZINGS_REDEN);

test("upload-kaart toont bij een format-afwijzing de zin van de 1.1-renderer", async () => {
  await renderServer(
    <Screen>
      <KaartMetFormatAfwijzing reden={AFWIJZINGS_REDEN} tekst={AFWIJZINGS_TEKST} />
    </Screen>,
  );
  const invoer = page.getByLabelText("Choose filled template (.xlsx)");
  await expect.element(invoer).toBeInTheDocument();

  // Sinds de directe import (goal-doc 11 aug 2026) zijn de prijslijst-velden verplicht:
  // zonder invulling blokkeert de native `required`-validatie de submit.
  await userEvent.type(page.getByLabelText("Price list name"), "Price list 2026");
  await userEvent.fill(page.getByLabelText("Valid from"), "2026-01-01");
  await userEvent.fill(page.getByLabelText("Valid until"), "2026-12-31");
  await userEvent.upload(
    invoer,
    new File([new Uint8Array([1, 2, 3, 4])], "occhio-eigen-lijst.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  await page.getByRole("button", { name: "Check & import" }).click();

  await expect.element(page.getByText("This file was not accepted")).toBeInTheDocument();
  // Letterlijk afwijzingsTekst(reden) — geen overgetypte kopie die stil kan afwijken.
  await expect.element(page.getByText(AFWIJZINGS_TEKST)).toBeInTheDocument();
  // De belofte van besluit 6: een format-afwijzing raakt de relatiestatus niet.
  await expect
    .element(page.getByText(/The brand relationship status is unchanged/))
    .toBeInTheDocument();
  // De getypeerde reden reist mee, zodat de kaart per code kan differentiëren zonder
  // de zin te parsen.
  expect(
    document.querySelector('[role="alert"]')?.getAttribute("data-reden"),
  ).toBe("werkblad_ontbreekt");

  await page.screenshot({ path: "./data-template-upload-afwijzing.test.png" });
});
