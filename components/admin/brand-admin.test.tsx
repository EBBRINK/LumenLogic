// White-box RSC-tests van het merkbeheer-scherm (sprint 1.5) met fixture-data. Eigen
// testbestand, bewust NIET toegevoegd aan admin.test.tsx: dat zou de vier bestaande PNG's
// invalideren.
//
// Wat hier wordt afgedwongen zijn de vier besluiten die stil kapot kunnen gaan:
//   1. de dubbelcheck WAARSCHUWT en blokkeert niet (Flos, Flos Architectural en Flos SOFT
//      Architectural delen code L028 — dat zijn drie echte merken);
//   2. de ingetypte waarden overleven die waarschuwing, óók zonder JavaScript
//      (`defaultValue={state.values?.x ?? …}`) — vergeet je dat, dan typt de gebruiker
//      alles opnieuw en is de waarschuwing een straf;
//   3. bij een blokkade is er GEEN verwijderknop maar WEL de levensfase-uitweg (G4), en
//      de blokkade noemt de prijslijst bij naam mét het aantal prijsregels — bij 405 van
//      de 437 merken is die lege lijst de enige blocker;
//   4. de cascade-bevestiging noemt het outreach-record uit sprint 1.4 in gewone taal.
//
// De server actions worden hier als no-op doorgegeven: dit is een render-test van het
// scherm, niet van de actie-brug (die heeft zijn eigen tests aan de repo-kant).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import type { BrandDeleteImpact } from "@/lib/repo/brands";
import type {
  BrandDeleteState,
  BrandFormState,
} from "@/app/admin/brands/actions";
import { BrandForm, type BrandFormAction } from "./brand-form";
import {
  BrandDeleteBlock,
  type BrandDeleteAction,
} from "./brand-delete-block";
import { BrandFilterBar } from "./brand-filter-bar";
import { BrandsTierBlock, type BrandTierRow } from "./brands-tier-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// De actie wordt in deze tests nooit uitgevoerd; alleen de referentie moet geldig zijn.
const formAction = noopAction as unknown as BrandFormAction;
const deleteAction = noopAction as unknown as BrandDeleteAction;

const brand = {
  id: "b-flos-soft",
  name: "Flos SOFT Architectural",
  brandCode: "L028",
  country: "IT",
  website: "https://flos.com",
  descriptionNl: "Architecturale lijn van Flos.",
  lifecycle: "actief" as const,
  // Onbekend milieuveld: null blijft null (geen 0, geen "onbekend").
  factoryLocation: null,
  factoryDistanceKm: null,
};

// De dubbelstand zoals createBrandAction hem teruggeeft: niets geschreven, twee
// bestaande merken gevonden, en de ingetypte waarden reizen mee terug.
const duplicateState: BrandFormState = {
  status: "duplicate",
  token: "b-flos:b-flos-arch",
  matches: [
    { id: "b-flos", name: "Flos", brandCode: "L028", on: ["brand_code"] },
    {
      id: "b-flos-arch",
      name: "Flos Architectural",
      brandCode: "L028",
      on: ["brand_code"],
    },
  ],
  values: {
    name: "Flos SOFT Architectural",
    brandCode: "L028",
    country: "IT",
    website: "https://flos.com",
    descriptionNl: "Derde Flos-ingang, eigen prijslijst.",
    lifecycle: "actief",
    factoryLocation: "Bovezzo, Italië",
    factoryDistanceKm: "980",
  },
};

// Het normale geval: 405 van de 437 merken worden geblokkeerd door precies één lege
// prijslijst die de import heeft aangemaakt.
const blockedImpact: BrandDeleteImpact = {
  blocked: true,
  blockers: { products: 0, priceLists: 1, enrichmentRuns: 0, leads: 0 },
  cascades: {
    brandRelations: 1,
    brandAliases: 0,
    brandFieldVisibility: 0,
    brandUploads: 0,
  },
  priceListName: "Brutoprijslijst Tronconi",
  priceRowCount: 0,
};

// Een merk dat in deze sessie is aangemaakt: geen prijslijst, dus wél verwijderbaar.
const freeImpact: BrandDeleteImpact = {
  blocked: false,
  blockers: { products: 0, priceLists: 0, enrichmentRuns: 0, leads: 0 },
  cascades: {
    brandRelations: 1,
    brandAliases: 2,
    brandFieldVisibility: 1,
    brandUploads: 0,
  },
  priceListName: null,
  priceRowCount: 0,
};

const confirmState: BrandDeleteState = {
  status: "confirm",
  impact: freeImpact,
};

const tierRows: BrandTierRow[] = [
  {
    id: "b1",
    name: "Delta Light",
    brandCode: "L041",
    lifecycle: "actief",
    disclosureTier: "tier1",
    productCount: 42,
    overrides: { gross_price: false },
  },
  {
    id: "b2",
    name: "Itre",
    brandCode: "L077",
    lifecycle: "slapend",
    disclosureTier: "tier2",
    productCount: 0,
    overrides: {},
  },
  {
    id: "b3",
    name: "Tronconi",
    brandCode: null,
    lifecycle: "bestaat_niet_meer",
    disclosureTier: "tier3",
    productCount: 0,
    // Sprint 1.6 (deel B): verlopen prijslijst → PriceListExpiryNotice-badge in de rij.
    priceListValidUntil: "2024-01-01",
    overrides: {},
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-3xl">
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

const formScreen = (
  <Screen>
    <section className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
      <h2 className="mb-3 font-medium">New brand</h2>
      <BrandForm mode="create" action={formAction} />
    </section>
  </Screen>
);

// Aparte schermopname: op 375px valt alles onder de eerste schermhoogte weg, en juist de
// waarschuwing is wat beoordeeld moet worden.
const duplicateScreen = (
  <Screen>
    <section className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
      <h2 className="mb-3 font-medium">New brand — duplicate warning</h2>
      <BrandForm
        mode="create"
        action={formAction}
        initialState={duplicateState}
      />
    </section>
  </Screen>
);

const deleteScreen = (
  <Screen>
    <BrandDeleteBlock
      brandId="b-tronconi"
      brandName="Tronconi"
      lifecycle="actief"
      impact={blockedImpact}
      deleteAction={deleteAction}
      setLifecycleAction={noopAction}
    />
    <BrandDeleteBlock
      brandId="b-vers"
      brandName="Nieuw Merk"
      lifecycle="actief"
      impact={freeImpact}
      deleteAction={deleteAction}
      setLifecycleAction={noopAction}
      initialState={confirmState}
    />
  </Screen>
);

// De lijst met filterbalk: hier moet je op 375px zien dat de badge + merkcode de rij niet
// verder laten overlopen dan hij al deed (G3 — daarom geen extra kolom en geen tweede
// select).
const listScreen = (
  <Screen>
    <BrandFilterBar q="" phase="" shown={3} total={437} />
    <BrandsTierBlock
      brands={tierRows}
      setTierAction={noopAction}
      setFieldVisibilityAction={noopAction}
    />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`merkformulier (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(formScreen);
      await expect
        .element(page.getByText("Create brand"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-form.${theme}.${device}.test.png`,
      });
    });

    test(`dubbelwaarschuwing (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(duplicateScreen);
      await expect
        .element(page.getByText("Yes, create anyway"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-duplicate.${theme}.${device}.test.png`,
      });
    });

    test(`merkenlijst met filterbalk (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(listScreen);
      // exact: true — sinds 1.6 draagt deze rij ook de verloop-badge, en die begint
      // met de merknaam ("Tronconi delivered prices — …"), dus een losse substring-
      // match op "Tronconi" is nu ambigu.
      await expect
        .element(page.getByText("Tronconi", { exact: true }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-list.${theme}.${device}.test.png`,
      });
    });

    test(`merk verwijderen (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(deleteScreen);
      await expect
        .element(page.getByText("Brutoprijslijst Tronconi", { exact: false }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-delete.${theme}.${device}.test.png`,
      });
    });
  }
}

test("dubbelcheck: waarschuwt met link naar het bestaande merk en blokkeert niet", async () => {
  await renderServer(
    <Screen>
      <BrandForm
        mode="create"
        action={formAction}
        initialState={duplicateState}
      />
    </Screen>,
  );
  await expect
    .element(page.getByTestId("brand-duplicate-warning"))
    .toBeInTheDocument();

  const link = document.querySelector<HTMLAnchorElement>(
    'a[href="/admin/brands/b-flos"]',
  );
  expect(link).not.toBeNull();
  expect(link?.textContent).toContain("Flos");
  expect(
    document.querySelector('a[href="/admin/brands/b-flos-arch"]'),
  ).not.toBeNull();

  // Niet blokkeren: de knop bestaat, is niet uitgeschakeld en zegt "anyway".
  const submit = document.querySelector<HTMLButtonElement>(
    'form button[type="submit"]',
  );
  expect(submit).not.toBeNull();
  expect(submit?.disabled).toBe(false);
  expect(submit?.textContent).toContain("anyway");

  // De bevestigingssleutel reist mee terug het formulier in.
  const token = document.querySelector<HTMLInputElement>(
    'input[name="confirmToken"]',
  );
  expect(token?.value).toBe("b-flos:b-flos-arch");
});

test("dubbelcheck: de ingevulde waarden overleven de waarschuwing (werkt zonder JS)", async () => {
  await renderServer(
    <Screen>
      <BrandForm
        mode="create"
        action={formAction}
        initialState={duplicateState}
      />
    </Screen>,
  );
  await expect
    .element(page.getByTestId("brand-duplicate-warning"))
    .toBeInTheDocument();

  const val = (name: string) =>
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
  expect(val("name")).toBe("Flos SOFT Architectural");
  expect(val("brandCode")).toBe("L028");
  expect(val("country")).toBe("IT");
  expect(val("website")).toBe("https://flos.com");
  expect(
    document.querySelector<HTMLTextAreaElement>('textarea[name="descriptionNl"]')
      ?.value,
  ).toBe("Derde Flos-ingang, eigen prijslijst.");
  expect(
    document.querySelector<HTMLSelectElement>('select[name="lifecycle"]')?.value,
  ).toBe("actief");
  // Milieuvelden overleven de dubbelwaarschuwing net zo goed als de rest.
  expect(val("factoryLocation")).toBe("Bovezzo, Italië");
  expect(val("factoryDistanceKm")).toBe("980");
});

test("merkformulier: het Environment-kopje rendert, en een leeg km-veld heeft waarde \"\", nooit \"0\"", async () => {
  await renderServer(formScreen);
  await expect.element(page.getByText("Environment")).toBeInTheDocument();
  const km = document.querySelector<HTMLInputElement>(
    'input[name="factoryDistanceKm"]',
  );
  expect(km).not.toBeNull();
  expect(km?.value).toBe("");
  expect(
    document.querySelector<HTMLInputElement>('input[name="factoryLocation"]')
      ?.value,
  ).toBe("");
});

test("blokkade: geen verwijderknop, wél de levensfase-uitweg in hetzelfde blok", async () => {
  await renderServer(
    <Screen>
      <BrandDeleteBlock
        brandId="b-tronconi"
        brandName="Tronconi"
        lifecycle="actief"
        impact={blockedImpact}
        deleteAction={deleteAction}
        setLifecycleAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByTestId("brand-delete-block"))
    .toBeInTheDocument();

  // Afwezig, niet disabled: een dode knop leert niets.
  expect(document.querySelector('[data-testid="brand-delete-button"]')).toBeNull();
  expect(
    document.querySelector('[data-testid="brand-lifecycle-escape"]'),
  ).not.toBeNull();
  await expect
    .element(page.getByText("Mark as discontinued instead"))
    .toBeInTheDocument();
});

test("blokkade: noemt de prijslijst bij naam met het aantal prijsregels, en niets op nul", async () => {
  await renderServer(
    <Screen>
      <BrandDeleteBlock
        brandId="b-tronconi"
        brandName="Tronconi"
        lifecycle="actief"
        impact={blockedImpact}
        deleteAction={deleteAction}
        setLifecycleAction={noopAction}
      />
    </Screen>,
  );
  const blockers = await page.getByTestId("brand-delete-blockers");
  await expect.element(blockers).toBeInTheDocument();
  const text = document.querySelector<HTMLElement>(
    '[data-testid="brand-delete-blockers"]',
  )!.textContent!;
  expect(text).toContain("1 price list");
  expect(text).toContain("Brutoprijslijst Tronconi");
  expect(text).toContain("0 price rows");
  // Alleen posten die niet nul zijn: producten/runs/leads staan er niet.
  expect(text).not.toContain("product");
  expect(text).not.toContain("lead");
  expect(text).not.toContain("enrichment");
});

test("cascade-bevestiging: noemt het outreach-record in gewone taal", async () => {
  await renderServer(
    <Screen>
      <BrandDeleteBlock
        brandId="b-vers"
        brandName="Nieuw Merk"
        lifecycle="actief"
        impact={freeImpact}
        deleteAction={deleteAction}
        setLifecycleAction={noopAction}
        initialState={confirmState}
      />
    </Screen>,
  );
  // Eerst wachten tot de render door is; pas daarna de DOM ruw bevragen.
  await expect
    .element(page.getByTestId("brand-delete-cascades"))
    .toBeInTheDocument();
  const cascades = document.querySelector<HTMLElement>(
    '[data-testid="brand-delete-cascades"]',
  );
  expect(cascades).not.toBeNull();
  const text = cascades!.textContent!;
  expect(text).toContain("the outreach record");
  expect(text).toContain("status, contact person, notes");
  expect(text).toContain("2 alternative names");
  // Tweede klik stuurt de bevestiging mee.
  expect(
    document.querySelector<HTMLInputElement>('input[name="confirm"]')?.value,
  ).toBe("1");
});

test("lijst: 'actief' krijgt geen badge, de andere twee wel; naam linkt naar het detail", async () => {
  await renderServer(
    <Screen>
      <BrandsTierBlock
        brands={tierRows}
        setTierAction={noopAction}
        setFieldVisibilityAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Delta Light")).toBeInTheDocument();
  await expect.element(page.getByText("Dormant")).toBeInTheDocument();
  await expect.element(page.getByText("No longer exists")).toBeInTheDocument();
  // Delta Light is actief → in die rij staat geen badge.
  const deltaCell = document
    .querySelector<HTMLAnchorElement>('a[href="/admin/brands/b1"]')
    ?.closest("td");
  expect(deltaCell).not.toBeNull();
  expect(deltaCell?.querySelector('[data-slot="badge"]')).toBeNull();
  expect(deltaCell?.textContent).toContain("L041");
  // De afwijkende fases dragen er wél een.
  const itreCell = document
    .querySelector<HTMLAnchorElement>('a[href="/admin/brands/b2"]')
    ?.closest("td");
  expect(itreCell?.querySelector('[data-slot="badge"]')).not.toBeNull();
});

test("lijst: verlopen prijslijst toont de gedeelde PriceListExpiryNotice-badge, niet bij een merk zonder datum", async () => {
  await renderServer(
    <Screen>
      <BrandsTierBlock
        brands={tierRows}
        setTierAction={noopAction}
        setFieldVisibilityAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText(/extension/i)).toBeInTheDocument();
  await expect.element(page.getByText(/01-01-2024/)).toBeInTheDocument();
  // Tronconi droeg de verlopen lijst; Delta Light en Itre hebben geen priceListValidUntil.
  const tronconiCell = document
    .querySelector<HTMLAnchorElement>('a[href="/admin/brands/b3"]')
    ?.closest("td");
  expect(tronconiCell?.textContent).toMatch(/extension/i);
  const deltaCell = document
    .querySelector<HTMLAnchorElement>('a[href="/admin/brands/b1"]')
    ?.closest("td");
  expect(deltaCell?.textContent).not.toMatch(/extension/i);
  // DoD 4b eist de waarschuwing op beeld, óók op /admin/brands. De reguliere
  // admin-screenshots hebben geen merk met verlopen lijst in hun fixture, dus die
  // laten hem per definitie niet zien — vandaar hier een eigen capture, met zowel
  // het merk mét (Tronconi) als de merken zónder waarschuwing in beeld.
  await page.screenshot({ path: "./admin-brands-verlopen-prijslijst.light.desktop.test.png" });
});

test("filterbalk: gewone GET-form met q en phase, geen client-state", async () => {
  await renderServer(
    <Screen>
      <BrandFilterBar q="tronc" phase="bestaat_niet_meer" shown={1} total={437} />
    </Screen>,
  );
  await expect.element(page.getByText("1 of 437 brands")).toBeInTheDocument();
  const form = document.querySelector<HTMLFormElement>(
    '[data-testid="brand-filter-bar"]',
  );
  expect(form).not.toBeNull();
  expect(form?.method).toBe("get");
  expect(
    document.querySelector<HTMLInputElement>('input[name="q"]')?.value,
  ).toBe("tronc");
  expect(
    document.querySelector<HTMLSelectElement>('select[name="phase"]')?.value,
  ).toBe("bestaat_niet_meer");
  await expect.element(page.getByText("1 of 437 brands")).toBeInTheDocument();
});
