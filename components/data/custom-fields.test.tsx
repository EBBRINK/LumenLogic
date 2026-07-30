// White-box RSC-tests van het beheerscherm voor EIGEN PRODUCTVELDEN (sprint 1.8).
// Fixture-data, geen database: lib/repo/custom-fields.ts heeft zijn eigen tests — hier
// staat de vraag of het SCHERM de besluiten eerlijk vertelt.
//
// WAT HIER ECHT WORDT AFGEDWONGEN:
//  1. De must-zin. `must` betekent op een eigen veld iets ANDERS dan op een catalogusveld:
//     zwaarste weging in de scorecard, maar nooit een bestandsafwijzing (plan §2). Draait
//     die zin ooit om, dan kost één klik van Stefan elk merkbestand dat al onderweg is.
//  2. Alle vier de tekstvelden verplicht — rij 3 van het Excel is de instructie, en een
//     kolom zonder instructie is een kolom die niemand invult.
//  3. De archiveer-bevestiging noemt een VERS aantal producten met een waarde én zegt dat
//     die waarden bewaard blijven.
//  4. Het read-only overzicht van de bestaande catalogusvelden staat er — dát is waar je
//     ziet dat je veld er al is, en een botsende kolomkop maakt élk ingevuld merkbestand
//     onleesbaar.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import {
  FIELD_CATALOG,
  INTERNAL_BUCKET_KEY,
  templateBuckets,
} from "@/lib/field-catalog";
import {
  CatalogFieldsOverview,
  CustomFieldsTable,
  type CatalogusOverzichtBucket,
  type EigenVeldRij,
} from "./custom-fields-table";
import { CustomFieldForm, type BucketOptie } from "./custom-field-form";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Het overzicht toont exact wat het merk-Excel vraagt: templateBuckets() over de
// catalogus, dus zónder bucket 11 (intern) — die vragen we per definitie niet.
const overzichtBuckets: CatalogusOverzichtBucket[] = templateBuckets(
  FIELD_CATALOG,
).map(({ bucket, fields }) => ({
  key: bucket.key,
  order: bucket.order,
  labelEn: bucket.labelEn,
  fields: fields.map((f) => ({
    key: f.key,
    labelEn: f.labelEn,
    niveau: f.niveau,
  })),
}));

const CATALOGUS_VELDEN = overzichtBuckets.reduce(
  (n, b) => n + b.fields.length,
  0,
);

const buckets: BucketOptie[] = FIELD_CATALOG.filter(
  (b) => b.key !== INTERNAL_BUCKET_KEY,
)
  .sort((a, b) => a.order - b.order)
  .map((b) => ({ key: b.key, labelEn: b.labelEn, order: b.order }));

const rows: EigenVeldRij[] = [
  {
    id: "6f1a3d2c-8b44-4c1e-9f77-2a5b6c7d8e90",
    labelEn: "Recycled content (%)",
    instructionEn: "Share of recycled material in percent, e.g. 35.",
    niveau: "wanna",
    bucketKey: "duurzaamheid_milieu",
    bucketOrder: 10,
    bucketLabelEn: "Sustainability / environment",
    productsWithValue: 128,
    createdAt: "2026-07-15T09:12:00.000Z",
    archivedAt: null,
  },
  {
    id: "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    labelEn: "Housing origin",
    instructionEn: "Country where the housing is made, e.g. Italy.",
    niveau: "must",
    bucketKey: "duurzaamheid_milieu",
    bucketOrder: 10,
    bucketLabelEn: "Sustainability / environment",
    productsWithValue: 0,
    createdAt: "2026-07-18T14:03:00.000Z",
    archivedAt: null,
  },
  {
    id: "aa11bb22-cc33-4d44-8e55-ff6677889900",
    labelEn: "Trial field",
    instructionEn: "Temporary field, no longer in use.",
    niveau: "nice",
    bucketKey: "documentatie_links",
    bucketOrder: 9,
    bucketLabelEn: "Documentation / links",
    productsWithValue: 3,
    createdAt: "2026-07-02T08:00:00.000Z",
    archivedAt: "2026-07-19T11:30:00.000Z",
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

// Dezelfde samenstelling als app/data/fields/page.tsx, minus de database.
const scherm = (
  <Screen>
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fields</h1>
        <p className="mt-2 text-sm">
          <span className="font-medium">Brand Excel:</span>{" "}
          <span className="tabular-nums">{CATALOGUS_VELDEN}</span> +{" "}
          <span className="tabular-nums">2</span> columns
        </p>
      </header>
      <CatalogFieldsOverview buckets={overzichtBuckets} />
      <CustomFieldsTable
        rows={rows}
        buckets={buckets}
        createAction={noopAction}
        updateAction={noopAction}
        telAction={noopAction}
        archiveerAction={noopAction}
      />
    </div>
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── Screenshots: licht/donker × mobiel/desktop ──────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`eigen velden (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(scherm);
      // Content-assert vóór de capture: een kale body-assert gaf elders blanco PNG's.
      await expect
        .element(page.getByText("Recycled content (%)"))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Add field" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./data-eigen-velden.${theme}.${device}.test.png`,
      });
    });
  }
}

// Het ingeklapte overzicht apart in beeld: dicht is het één regel, en juist de open stand
// draagt de les "deze 66 bestaan al".
for (const theme of ["light", "dark"] as const) {
  test(`catalogusoverzicht open (${theme}, desktop)`, async () => {
    await page.viewport(1280, 1600);
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderServer(
      <Screen>
        <CatalogFieldsOverview buckets={overzichtBuckets} />
      </Screen>,
    );
    await page.getByText(/Fields we already ask for/).click();
    await expect
      .element(page.getByText("Supplier article code"))
      .toBeInTheDocument();
    await page.screenshot({
      path: `./data-eigen-velden-catalogus.${theme}.desktop.test.png`,
    });
  });
}

// ── Het overzicht van wat we al vragen ──────────────────────────────────────

test("read-only overzicht: alle Excel-velden, per bucket, zonder bucket 11", async () => {
  await renderServer(scherm);
  await expect
    .element(page.getByText(`Fields we already ask for (${CATALOGUS_VELDEN})`))
    .toBeInTheDocument();
  // DoD-anker: dit getal is excelColumns().length — vandaag 66.
  expect(CATALOGUS_VELDEN).toBe(66);
  // Bucket 11 hoort er niet bij: die velden vragen we nooit aan een merk.
  expect(
    document.querySelector(`[data-bucket="${INTERNAL_BUCKET_KEY}"]`),
  ).toBeNull();
  await expect
    .element(page.getByText("10. Sustainability / environment").first())
    .toBeInTheDocument();
  // De waarschuwing waarom je hier eerst kijkt.
  await expect
    .element(page.getByText(/makes every filled brand file unreadable/))
    .toBeInTheDocument();
});

test("kolomteller maakt de groei zichtbaar", async () => {
  await renderServer(scherm);
  await expect.element(page.getByText("Brand Excel:")).toBeInTheDocument();
  await expect.element(page.getByText("66", { exact: true })).toBeInTheDocument();
});

// ── De tabel ────────────────────────────────────────────────────────────────

test("tabel: labels, categorie, niveau, aantal producten met waarde en aanmaakdatum", async () => {
  await renderServer(scherm);
  await expect.element(page.getByText("Your own fields (2)")).toBeInTheDocument();
  // Het NL-label bestaat niet meer — noch in de fixture, noch op het scherm. Deze
  // negatieve assertie is de wachter tegen herintroductie (DoD 1).
  expect(page.getByText("Gerecycled materiaal (%)").query()).toBeNull();
  await expect
    .element(page.getByText("Recycled content (%)"))
    .toBeInTheDocument();
  await expect.element(page.getByText("128")).toBeInTheDocument();
  await expect.element(page.getByText("2026-07-15")).toBeInTheDocument();
  await expect
    .element(page.getByText("10. Sustainability / environment").first())
    .toBeInTheDocument();
});

// UX-audit 30 jul (item 4): must/wanna/nice is intern jargon en stond ruw op het scherm —
// als pil in de tabel, in de read-only catalogus en als radiokeuze. De weergave is nu
// Required/Requested/Optional; de OPGESLAGEN waarde blijft ongewijzigd (dat pint de
// value-assertie in de formuliertest hieronder vast).
test("niveaus staan als leesbaar label op het scherm, nooit als ruwe enum", async () => {
  await renderServer(scherm);
  await expect.element(page.getByText("Requested").first()).toBeInTheDocument();
  const tekst = document.body.textContent ?? "";
  // Woordgrenzen + kleine letter: "Must be unique." in de labelhint is gewoon Engels,
  // de enum-waarde `must` is dat niet.
  for (const jargon of ["wanna", "must", "nice"]) {
    expect(tekst, jargon).not.toMatch(new RegExp(`\\b${jargon}\\b`));
  }
});

test("gearchiveerde velden staan er apart bij, met de belofte dat waarden blijven", async () => {
  await renderServer(scherm);
  await expect.element(page.getByText("Archived (1)")).toBeInTheDocument();
  await expect.element(page.getByText("Trial field")).toBeInTheDocument();
  await expect
    .element(page.getByText(/Values that brands\s+already delivered are still stored/))
    .toBeInTheDocument();
  // Een gearchiveerd veld heeft geen bewerk- of archiveerknop meer: het is uit de vraag.
  const rij = document.querySelector<HTMLElement>(
    '[data-veld="aa11bb22-cc33-4d44-8e55-ff6677889900"]',
  );
  expect(rij).not.toBeNull();
  expect(rij!.querySelector("button")).toBeNull();
});

// ── Archiveren ──────────────────────────────────────────────────────────────

test("archiveren vraagt om bevestiging: geen archivering zonder VERSE telling", async () => {
  await renderServer(scherm);
  await expect
    .element(page.getByText("Recycled content (%)"))
    .toBeInTheDocument();
  await page.getByText("Archive", { exact: true }).first().click();

  // Eén klik archiveert nooit: er komt een bevestiging, en die noemt het veld bij naam.
  await expect
    .element(page.getByLabelText("Archive Recycled content (%)"))
    .toBeInTheDocument();
  // De belofte die het verschil maakt tussen archiveren en wissen.
  await expect
    .element(
      page.getByText(
        /Those values are kept, but they no longer count towards any scorecard/,
      ),
    )
    .toBeInTheDocument();

  // De telling wordt VERS opgehaald: de bevestiging noemt pas een getal als de server
  // het net heeft geteld — het aantal uit de tabel is van de vorige page-render. In deze
  // harness draait geen server, dus blijft hij op "counting" staan en is doorzetten
  // onmogelijk. Precies het gedrag dat we willen: geen archivering op een getal dat we
  // niet hebben.
  await expect
    .element(page.getByText(/Counting products with a value/))
    .toBeInTheDocument();
  const knop = page.getByRole("button", { name: "Archive field" });
  await expect.element(knop).toBeInTheDocument();
  await expect.element(knop).toBeDisabled();

  // En er is altijd een weg terug uit de bevestiging.
  await expect
    .element(page.getByRole("button", { name: "Cancel" }))
    .toBeInTheDocument();
});

// ── Het formulier ───────────────────────────────────────────────────────────

test("formulier: twee verplichte tekstvelden, niveau default 'wanna', 10 categorieën", async () => {
  await renderServer(
    <Screen>
      <CustomFieldForm
        waarden={null}
        buckets={buckets}
        submitAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: "Add field" }))
    .toBeInTheDocument();
  for (const naam of ["labelEn", "instructionEn"]) {
    const veld = document.querySelector<HTMLInputElement>(`[name="${naam}"]`);
    expect(veld, naam).not.toBeNull();
    expect(veld!.required, naam).toBe(true);
  }
  // Wachters tegen herintroductie: het formulier vraagt geen Nederlands meer (DoD 1).
  for (const naam of ["labelNl", "instructieNl"]) {
    expect(
      document.querySelector<HTMLInputElement>(`[name="${naam}"]`),
      naam,
    ).toBeNull();
  }
  // Default 'wanna': `must` mag nooit de stand zijn waar je per ongeluk in blijft staan.
  const wanna = document.querySelector<HTMLInputElement>(
    'input[name="niveau"][value="wanna"]',
  );
  expect(wanna!.checked).toBe(true);
  // De categorie-select kent de 10 template-buckets en nooit "intern".
  const select = document.querySelector<HTMLSelectElement>(
    'select[name="bucketKey"]',
  );
  expect(select!.options.length).toBe(10);
  expect(
    Array.from(select!.options).map((o) => o.value),
  ).not.toContain(INTERNAL_BUCKET_KEY);
});

test("Required-uitleg: zwaarste weging, GEEN bestandsafwijzing", async () => {
  await renderServer(
    <Screen>
      <CustomFieldForm
        waarden={null}
        buckets={buckets}
        submitAction={noopAction}
      />
    </Screen>,
  );
  // De zin die niet mag omdraaien (plan §2). Hij hoort pas te verschijnen als je must
  // kiest — dán is het een besluit, geen achtergrondruis.
  await expect
    .element(page.getByRole("button", { name: "Add field" }))
    .toBeInTheDocument();
  expect(page.getByText(/never rejected because of it/).query()).toBeNull();
  // Item 4: het radiolabel heet "Required"; de verstuurde waarde blijft `must`.
  const knop = page.getByRole("radio", { name: "Required" });
  await knop.click();
  expect(
    document.querySelector<HTMLInputElement>('input[name="niveau"]:checked')!
      .value,
  ).toBe("must");
  await expect
    .element(page.getByText(/weighs the heaviest in the scorecard/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/never rejected because of it/))
    .toBeInTheDocument();
  // De uitleg opent met het weergavelabel, niet met de enum.
  await expect
    .element(page.getByText(/^Required = weighs the heaviest/))
    .toBeInTheDocument();
});

test("bewerken toont de bestaande waarden en de opslaan-knop van een bestaand veld", async () => {
  await renderServer(scherm);
  await expect
    .element(page.getByText("Recycled content (%)"))
    .toBeInTheDocument();
  await page.getByText("Edit").first().click();
  await expect
    .element(page.getByRole("button", { name: "Save field" }))
    .toBeInTheDocument();
  const labelEn = document.querySelector<HTMLInputElement>(
    'form input[name="labelEn"]',
  );
  expect(labelEn!.value).toBe("Recycled content (%)");
  const id = document.querySelector<HTMLInputElement>('input[name="id"]');
  expect(id!.value).toBe("6f1a3d2c-8b44-4c1e-9f77-2a5b6c7d8e90");
});
