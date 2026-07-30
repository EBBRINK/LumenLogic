// White-box RSC-tests voor de vier UX-audit-punten op /projects (bak 2, item 8):
// zichtbare kaart-hover, een legenda bij de bolletjes, "Last edited" + zoekveld, en het
// aanmaakformulier in een dialoog.
//
// De screenshots bouwen het scherm na zoals app/projects/page.tsx het samenstelt (de
// pagina zelf is DB-backed en dus niet met fixtures te renderen) — zelfde truc als de
// `Projectkop` in project-status.test.tsx.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DossierList, StatusLegend, type DossierListItem } from "./dossier-list";
import { NewDossierDialog } from "./new-dossier-form";
import { StatusFilter } from "./status-filter";
import { emptyCounts } from "./status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Vaste datums: de screenshots en de "Last edited"-assertie moeten deterministisch zijn.
// formatDate pint Europe/Amsterdam, dus dit is ongeacht TZ "30 Jul 2026".
const dossiers: DossierListItem[] = [
  {
    id: "d1",
    name: "Ziekenhuis Noord",
    customer: "Deerns",
    phase: "tender",
    status: "concept",
    counts: { ...emptyCounts(), groen: 9, geel: 2, blauw: 2, rood: 1 },
    updatedAt: "2026-07-30T09:15:00Z",
  },
  {
    id: "d2",
    name: "Kantoor Zuid",
    customer: "BAM Bouw",
    phase: "awarded",
    status: "gegund",
    counts: { ...emptyCounts(), groen: 4, paars: 1 },
    updatedAt: "2026-07-02T14:40:00Z",
  },
  {
    id: "d3",
    name: "Museum Oost",
    customer: null,
    phase: "tender",
    status: "offerte",
    counts: { ...emptyCounts(), groen: 6, blauw: 1, open: 3 },
    updatedAt: "2026-06-11T08:00:00Z",
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </div>
  );
}

// De kop van /projects zoals de pagina hem samenstelt: titel + ondertitel links, de
// "New project"-dialoogknop rechts, daaronder zoekveld + filterrij, dan de legenda.
function Projectlijst() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Choose a project or create a new one. New = Concept; the safety phase
            stays Tender by default (safe).
          </p>
        </div>
        <NewDossierDialog action={noopAction} />
      </header>
      <div className="mb-6 flex flex-col gap-3">
        <form
          method="get"
          action="/projects"
          role="search"
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor="q" className="sr-only">
            Search projects
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            placeholder="Search project or customer"
            className="w-full sm:w-72"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <StatusFilter active="alle" />
      </div>
      <StatusLegend className="mb-4" />
      <DossierList dossiers={dossiers} />
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`projectlijst-ux (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <Projectlijst />
        </Screen>,
      );
      await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
      await page.screenshot({
        path: `./projectlijst-ux.${theme}.${device}.test.png`,
      });
    });

    // De twee nieuwe standen apart op de foto: de uitgeklapte legenda (dít is wat
    // vroeger alleen in een `title` zat) en de aanmaakdialoog (die de vaste kolom
    // naast de lijst vervangt).
    test(`projectlijst-legenda-open (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <Projectlijst />
        </Screen>,
      );
      await expect.element(page.getByText("Dot colours")).toBeInTheDocument();
      document.querySelector("details")!.open = true;
      await page.screenshot({
        path: `./projectlijst-legenda-open.${theme}.${device}.test.png`,
      });
    });

    test(`projectlijst-nieuw-dialoog (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <Projectlijst />
        </Screen>,
      );
      await page.getByRole("button", { name: "New project" }).click();
      await expect.element(page.getByLabelText("Project name")).toBeInTheDocument();
      // De open-animatie duurt 100ms (DESIGN.md §8); zonder deze pauze staat er een
      // half uitgezoomde dialoog op de foto.
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({
        path: `./projectlijst-nieuw-dialoog.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── 1. De hover, nagemeten ─────────────────────────────────────────────────────────
// De audit mat op de oude klasse `hover:bg-muted/50` een verschil van 1,038:1 met de
// ruststand — onzichtbaar. Deze test pint de twee dragers van de nieuwe stand vast:
// het vlak (--card → --accent) en de ring (foreground/10 → --ring). De ring is in
// Tailwind een box-shadow, dus die meten we daar.
const HOVER_KLEUREN = {
  light: {
    rust: "rgb(255, 255, 255)", // --card
    hover: "rgb(240, 242, 245)", // --accent, in globals.css aangemerkt als "hover-vlak"
    ring: "rgb(45, 90, 140)", // --ring #2D5A8C
  },
  dark: {
    rust: "rgb(26, 31, 58)", // --card #1A1F3A
    hover: "rgb(42, 49, 69)", // --accent #2A3145
    ring: "rgb(27, 168, 154)", // --ring #1BA89A (O10)
  },
} as const;

for (const theme of ["light", "dark"] as const) {
  const k = HOVER_KLEUREN[theme];
  test(`projectkaart ${theme}: hover verandert vlak én ring zichtbaar`, async () => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderServer(
      <Screen>
        {/* Rustpunt ver van de kaarten: de muisaanwijzer blijft tussen tests staan
            waar hij stond, dus zonder dit staat de kaart bij de tweede thema-ronde
            al ín de hover-stand en meten we de ruststand nooit. */}
        <h1 className="mb-40 text-2xl">Projects</h1>
        <DossierList dossiers={dossiers} />
      </Screen>,
    );
    const link = page.getByRole("link", { name: /Ziekenhuis Noord/ });
    await expect.element(link).toBeInTheDocument();
    await page.getByRole("heading", { name: "Projects" }).hover();
    const kaart = document.querySelector<HTMLElement>('[data-slot="card"]')!;
    expect(kaart, "geen kaart gevonden").not.toBeNull();

    // Pollen en niet één keer lezen: de kaart draagt een 150ms-transitie, dus een
    // meting vlak na de render kan er middenin vallen (dat scheelt een eenheid in de
    // oklab-interpolatie en maakt de test grillig).
    await expect.poll(() => getComputedStyle(kaart).backgroundColor).toBe(k.rust);
    const rustBg = getComputedStyle(kaart).backgroundColor;
    expect(
      getComputedStyle(kaart).boxShadow,
      `ruststand ring in ${theme} draagt al de ringkleur`,
    ).not.toContain(k.ring);

    await link.hover();
    // De kleurtransitie is 150ms; poll tot hij uitgespeeld is.
    await expect.poll(() => getComputedStyle(kaart).backgroundColor).toBe(k.hover);
    expect(
      getComputedStyle(kaart).boxShadow,
      `hover-ring in ${theme}`,
    ).toContain(k.ring);
    // En de hover is écht een verandering, niet toevallig dezelfde waarde.
    expect(rustBg, `vlak in rust ≠ vlak bij hover (${theme})`).not.toBe(k.hover);

    // Eén foto met de bovenste kaart in hover en de twee eronder in rust — dat is de
    // voor/na-vergelijking die de audit op de oude stand niet kon maken.
    await page.screenshot({ path: `./projectkaart-hover.${theme}.test.png` });
  });
}

// ── 2. De legenda ──────────────────────────────────────────────────────────────────
test("legenda: dichtgeklapt de zes kleurnamen, uitgeklapt de betekenissen", async () => {
  await renderServer(
    <Screen>
      <StatusLegend />
    </Screen>,
  );
  // Dicht: de namen staan er (O13 — de statussen HETEN de kleuren, dus dit zijn de
  // labels uit status.ts en geen verzonnen synoniemen).
  for (const naam of ["Green", "Yellow", "Blue", "Red", "Purple", "Open"]) {
    await expect
      .element(page.getByText(naam, { exact: true }).first())
      .toBeInTheDocument();
  }
  const details = document.querySelector("details")!;
  expect(details.open, "legenda staat dichtgeklapt").toBe(false);

  // De betekenis was hiervoor alleen een `title` (hover-only, op touch onbereikbaar).
  // Nu staat hij in de DOM zodra je de legenda opent — tikbaar, dus ook op touch.
  const uitleg =
    "Brand not in the catalog yet — data gap, our action (load the brand).";
  await page.getByText("Dot colours").click();
  expect(details.open, "legenda opent op klik").toBe(true);
  await expect.element(page.getByText(uitleg)).toBeInTheDocument();
});

// ── 3. "Last edited" per kaart ─────────────────────────────────────────────────────
test("kaart: toont Last edited in het ene datumformaat van de app", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={dossiers} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Last edited 30 Jul 2026"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Last edited 02 Jul 2026"))
    .toBeInTheDocument();
});

// Zonder datum geen lege regel en geen "—": de kaart zwijgt liever dan te gokken.
test("kaart: geen Last edited-regel als updatedAt ontbreekt", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={[{ ...dossiers[0], updatedAt: undefined }]} />
    </Screen>,
  );
  await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Last edited");
});

// ── 4. Het aanmaakformulier in een dialoog ─────────────────────────────────────────
test("New project: knop opent de dialoog met het volledige formulier", async () => {
  await renderServer(
    <Screen>
      <NewDossierDialog
        action={noopAction}
        organizations={[{ id: "o1", name: "Deerns" }]}
      />
    </Screen>,
  );
  const knop = page.getByRole("button", { name: "New project" });
  await expect.element(knop).toBeInTheDocument();
  // Dicht: het formulier staat niet op de pagina (dat was juist het probleem).
  expect(document.querySelector("form"), "formulier staat vooraf al open").toBeNull();

  await knop.click();
  await expect.element(page.getByRole("dialog")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Project name")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Customer")).toBeInTheDocument();
  // De XIS-fase blijft in het formulier staan, met zijn eigen default 'Start'. Dat is
  // een ANDER veld dan de afgeleide veiligheidsstand op de kaart (beide heten "Tender"
  // in een van hun standen) — niet gelijktrekken.
  await expect.element(page.getByLabelText("XIS phase")).toHaveValue("start");
  await expect.element(page.getByLabelText("Organization")).toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Create project" }))
    .toBeInTheDocument();
});

// De lege lijst verwees naar het formulier "on the right" — dat staat er niet meer.
test("lege lijst: de tekst wijst naar de knop, niet naar een kolom die weg is", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={[]} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Use .New project. to create one/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("on the right");
});
