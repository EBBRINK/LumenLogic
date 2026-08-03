// White-box RSC-test van de LEGE merkenlijst (UX-audit 30 jul, A6 — laatste twee
// restjes van sprint 2). Eigen testbestand om dezelfde reden die bovenaan
// brand-admin.test.tsx staat: een fixture toevoegen aan een bestaand bestand
// invalideert daar de PNG's, en de gevulde lijst wordt daar al geschoten.
//
// De kern van deze test is de variantkeuze. BrandsListBlock rendert zijn lege tak ín
// een <CardContent>; "framed" zou daar een gestreept kader BINNEN een kaart zetten en
// dat is precies de fout die de twee-varianten-API moet voorkomen. Daarom meten we
// niet alleen dat de variant "inline" heet, maar ook dat er echt een kaart omheen zit
// én dat dit component zelf geen tweede rand tekent.
//
// De `action={null}` is hier óók een meting: /admin/brands HEEFT een "New brand"-knop,
// maar die staat in de paginakop. Deze test pint vast dat de lege toestand hem niet
// dubbel neerzet. Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Button } from "@/components/ui/button";
import { BrandFilterBar } from "./brand-filter-bar";
import { BrandsListBlock } from "./brands-list-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-7xl">
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

// De paginakop van /admin/brands, nagebouwd naar app/admin/brands/page.tsx. Hij hoort
// hier omdat de `action={null}` een uitspraak DOET over deze knop: hij bestaat, hij
// staat één blok hoger, en daarom staat hij niet nog een keer in de lege toestand.
// Zonder de kop in beeld is dat een bewering; mét de kop is het een meting.
//
// Gewone <a> in plaats van next/link — precedent brands-list-block.tsx zelf: de
// RSC-testbrug struikelt over de client-referentie van Link.
function PaginaKop() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
        <p className="text-sm text-muted-foreground">
          Add, edit and delete brands.
        </p>
      </div>
      <Button asChild>
        <a href="/admin/brands/new">New brand</a>
      </Button>
    </header>
  );
}

// Mét de filterbalk erboven, zoals app/admin/brands/page.tsx hem rendert: die balk
// telt "0 brands" en draagt dus de reden wanneer de leegte van een filter komt. Zonder
// die context zou de screenshot een halve waarheid zijn.
const leegScherm = (
  <Screen>
    <PaginaKop />
    <BrandFilterBar q="" phase="" shown={0} total={437} />
    <BrandsListBlock brands={[]} />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

function emptyStates(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`merkenlijst leeg (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(leegScherm);
      // Inhoud uit BrandsListBlock zelf, niet uit de <Screen>-wrapper.
      await expect.element(page.getByText("No brands yet.")).toBeInTheDocument();
      await expect
        .element(page.getByRole("link", { name: "New brand" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-list-leeg.${theme}.${device}.test.png`,
      });
    });
  }
}

test("de lege merkenlijst is het gedeelde component in de inline-vorm", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No brands yet.")).toBeInTheDocument();

  const alle = emptyStates();
  expect(alle).toHaveLength(1);
  const [leeg] = alle;

  expect(leeg.dataset.variant).toBe("inline");
  // Kader in kader: de kaart tekent het vlak, dit component tekent er geen tweede rand
  // omheen. Beide helften horen bij dezelfde meting — "inline" heten is niet genoeg.
  expect(leeg.closest('[data-slot="card"]')).not.toBeNull();
  expect(leeg.className).not.toContain("border-dashed");
  expect(leeg.className).not.toContain("border");
});

test("bewuste action={null}: 'New brand' staat in de paginakop, niet dubbel hier", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No brands yet.")).toBeInTheDocument();

  const [leeg] = emptyStates();
  // Titel + uitleg, en niets meer.
  expect(leeg.children.length).toBe(2);
  expect(leeg.querySelector("a")).toBeNull();
  expect(leeg.querySelector("button")).toBeNull();
  expect(leeg.querySelector("form")).toBeNull();

  // De uitweg bestaat wél en staat precies één keer op het scherm — in de paginakop,
  // buiten de lege toestand. Dát is de reden voor `action={null}`; een tweede treffer
  // hier zou betekenen dat de knop alsnog gedupliceerd is.
  const naarNieuw = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href="/admin/brands/new"]'),
  );
  expect(naarNieuw).toHaveLength(1);
  expect(leeg.contains(naarNieuw[0])).toBe(false);
  // De uitleg noemt de twee herkomsten van een merk — import en handmatig — zodat de
  // afwezige knop geen doodlopende leegte is maar een verwijzing.
  const uitleg = leeg.children[1] as HTMLElement;
  expect(uitleg.textContent).toContain("import");
  expect(uitleg.textContent).toContain("New brand");
});

test("de titel staat niet meer volledig op de secundaire kleur", async () => {
  await renderServer(leegScherm);
  await expect.element(page.getByText("No brands yet.")).toBeInTheDocument();

  const [leeg] = emptyStates();
  const titel = leeg.children[0] as HTMLElement;
  expect(titel.textContent).toBe("No brands yet.");
  expect(titel.className).not.toContain("text-muted-foreground");
  expect(titel.className).toContain("font-medium");
});
