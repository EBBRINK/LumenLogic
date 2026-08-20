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
      <DossierList dossiers={dossiers} />
      <StatusLegend className="mt-8" />
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

    // De aanmaakdialoog apart op de foto (die vervangt de vaste kolom naast de
    // lijst). De legenda hoeft geen eigen "open"-foto meer: hij stáát open, en zit
    // dus al op de projectlijst-foto hierboven.
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
    // ÓÓK pollen, en niet één keer lezen zoals hier eerst stond: vlak en ring hebben
    // dezelfde 150ms, maar de achtergrond rondt eerder op zijn eindwaarde af dan de
    // ring. Wie de ring meteen ná de bg-poll uitleest, betrapt de laatste
    // transitiestap, en die serialiseert Chromium als `oklab(…)` in plaats van
    // `rgb(…)` — de assertie faalde dan op de vorm van de string terwijl de kleur
    // klopte. (De ring ís een box-shadow; daar meten we hem.)
    await expect
      .poll(() => getComputedStyle(kaart).boxShadow, {
        message: `hover-ring in ${theme}`,
      })
      .toContain(k.ring);
    // En de hover is écht een verandering, niet toevallig dezelfde waarde.
    expect(rustBg, `vlak in rust ≠ vlak bij hover (${theme})`).not.toBe(k.hover);

    // Eén foto met de bovenste kaart in hover en de twee eronder in rust — dat is de
    // voor/na-vergelijking die de audit op de oude stand niet kon maken.
    await page.screenshot({ path: `./projectkaart-hover.${theme}.test.png` });
  });
}

// ── 2. De legenda ──────────────────────────────────────────────────────────────────
// Demo Brink Licht 12 aug, twee klachten in één test vastgepind:
//   • hij was een `<details>` die je moest openklappen → nu altijd open, geen pijltje;
//   • de kop was de kleurnaam ("Yellow", zegt de gebruiker niets) → nu de betekenis.
// De beschrijvende zin erachter is onveranderd; dat is de derde assertie.
test("legenda: altijd open, met de betekenis als kop", async () => {
  await renderServer(
    <Screen>
      <StatusLegend />
    </Screen>,
  );
  // Eerst wachten tot de legenda er staat: een `querySelector` die te vroeg draait
  // vindt niets en zou de "geen <details>"-assertie gratis laten slagen.
  await expect.element(page.getByText("Dot colours")).toBeInTheDocument();
  // Geen uitklapper meer — de uitleg is zichtbaar zonder één handeling.
  expect(document.querySelector("details"), "geen uitklapbare legenda meer").toBe(
    null,
  );

  // De koppen zijn de betekenissen (STATUS[...].name), niet de kleurnamen.
  for (const naam of [
    "Match",
    "Attention",
    "Awaiting brand",
    "Invalid product",
    "Out of scope",
    "Open",
  ]) {
    await expect
      .element(page.getByText(naam, { exact: true }).first())
      .toBeInTheDocument();
  }
  // En de kleurnaam staat er níet meer als kop. "Green"/"Yellow" blijven wél de
  // badge- en printtaal (STATUS[...].label/.word, DESIGN.md O13) — die worden hier
  // alleen niet meer in de legenda herhaald.
  for (const kleur of ["Green", "Yellow", "Blue", "Red", "Purple"]) {
    expect(
      page.getByText(kleur, { exact: true }).elements().length,
      `kleurnaam ${kleur} niet meer als legenda-kop`,
    ).toBe(0);
  }

  // De zin achter het label staat er onveranderd, zonder klik.
  await expect
    .element(
      page.getByText(
        "Brand not in the catalog yet — data gap, our action (load the brand).",
      ),
    )
    .toBeInTheDocument();
});

// ── 3. De datum per kaart ──────────────────────────────────────────────────────────
// Het label was "Last edited" en dat was onwaar: `project_dossiers.updated_at` heeft
// geen `$onUpdate` en beweegt alleen bij setStatus / setXisPhase / setDossierOrg. Een
// PDF importeren of regels bewerken schrijft naar `spec_lines.updated_at` — een middag
// importwerk liet de datum dus staan onder een label dat "laatst bewerkt" beloofde.
// Deze test pint het label vast op wat de kolom wél bijhoudt, in beide richtingen: de
// nieuwe tekst moet er staan én de oude belofte mag niet terugsluipen.
test("kaart: de datum draagt het label van wat de kolom bijhoudt", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={dossiers} />
    </Screen>,
  );
  await expect
    .element(page.getByText("Status or phase changed 30 Jul 2026"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Status or phase changed 02 Jul 2026"))
    .toBeInTheDocument();
  // "Last edited" belooft dat élke bewerking de datum verzet; dat doet deze kolom niet.
  expect(
    document.body.textContent,
    "het label belooft weer meer dan de kolom waarmaakt",
  ).not.toContain("Last edited");
});

// Zonder datum geen lege regel en geen "—": de kaart zwijgt liever dan te gokken.
test("kaart: geen datumregel als updatedAt ontbreekt", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={[{ ...dossiers[0], updatedAt: undefined }]} />
    </Screen>,
  );
  await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("changed");
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

// ── 5. De statuschips wissen de zoekterm niet meer ─────────────────────────────────
// Het scherm bewaart twee dingen in de URL: `?filter=` en `?q=`. De chips bouwden hun
// href als basePath + "?filter=…" en konden er geen tweede parameter bij dragen — wie
// eerst zocht en dáárna op een status klikte, was zijn zoekterm kwijt zonder melding.
// Deze tests pinnen beide richtingen: mét zoekterm draagt élke chip hem mee (ook "All"),
// en zónder zoekterm blijft de href precies zoals hij was.
function chipHref(naam: string): string {
  const el = [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find(
    (a) => a.textContent?.trim() === naam,
  );
  expect(el, `filterchip "${naam}" niet gevonden`).not.toBeUndefined();
  return el!.getAttribute("href")!;
}

test("statuschips: dragen de zoekterm mee naar elke status", async () => {
  await renderServer(
    <Screen>
      <StatusFilter active="alle" params={{ q: "noord" }} />
    </Screen>,
  );
  await expect
    .element(page.getByRole("link", { name: "All", exact: true }))
    .toBeInTheDocument();
  expect(chipHref("Lost"), "statuschip wist de zoekterm").toBe(
    "/projects?filter=niet_gegund&q=noord",
  );
  expect(chipHref("All"), "de All-chip wist de zoekterm").toBe(
    "/projects?q=noord",
  );
  // Geen enkele chip mag de term laten vallen.
  for (const naam of ["Concept", "Estimate sent", "Quote", "Won", "Archived"]) {
    expect(chipHref(naam), `chip "${naam}" wist de zoekterm`).toContain(
      "q=noord",
    );
  }
});

test("statuschips: zonder zoekterm blijft de href kaal", async () => {
  await renderServer(
    <Screen>
      <StatusFilter active="alle" params={{ q: "" }} />
    </Screen>,
  );
  await expect
    .element(page.getByRole("link", { name: "All", exact: true }))
    .toBeInTheDocument();
  expect(chipHref("All")).toBe("/projects");
  expect(chipHref("Lost")).toBe("/projects?filter=niet_gegund");
});

test("statuschips: een term met spatie en accent overleeft de href heel", async () => {
  const term = "café & co";
  await renderServer(
    <Screen>
      <StatusFilter active="concept" params={{ q: term }} />
    </Screen>,
  );
  await expect
    .element(page.getByRole("link", { name: "All", exact: true }))
    .toBeInTheDocument();
  const href = chipHref("Won");
  const sp = new URLSearchParams(href.split("?")[1]);
  expect(sp.get("q"), `zoekterm verminkt in ${href}`).toBe(term);
  expect(sp.get("filter")).toBe("gegund");
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

// Reviewzwerm 2.5a C1: dit was een kale grijze regel — het dialect dat
// components/ui/empty-state.tsx afschaft. De assertie hangt aan `data-slot` en niet
// aan de zin hierboven: alleen zo bewijst hij dat het GEDEELDE component rendert en
// niet dat er toevallig dezelfde woorden staan.
for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`lege lijst: de gedeelde lege toestand, framed, geen kale grijze regel (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <DossierList dossiers={[]} />
        </Screen>,
      );
      await expect
        .element(page.getByText(/Use .New project. to create one/))
        .toBeInTheDocument();

      const leeg = document.querySelector<HTMLElement>('[data-slot="empty-state"]');
      expect(
        leeg,
        "geen [data-slot=empty-state]: terug op de kale grijze regel",
      ).not.toBeNull();
      // "framed": de lijst staat op /projects op het kale canvas, niet in een <Card>.
      expect(leeg!.dataset.variant).toBe("framed");
      expect(leeg!.className).toContain("border-dashed");
      expect(leeg!.textContent).toContain("No projects yet.");
      // De titel staat op voorgrondkleur; de oude regel was in zijn geheel muted.
      expect(leeg!.querySelector("p")!.className).not.toContain("text-muted-foreground");

      await page.screenshot({ path: `./projectlijst-leeg.${theme}.${device}.test.png` });
    });
  }
}

// De zoek-tak vertelt een ander verhaal dan de lege database, en moet dezelfde vorm
// krijgen — anders is de veegbeurt alleen op de default-tekst gedaan.
test("lege lijst na zoeken: eigen zin, zelfde gedeelde vorm", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={[]} emptyMessage="No project matches “ziekenhuis”." />
    </Screen>,
  );
  await expect
    .element(page.getByText(/No project matches/))
    .toBeInTheDocument();
  const leeg = document.querySelector<HTMLElement>('[data-slot="empty-state"]');
  expect(leeg, "geen [data-slot=empty-state]: terug op de kale grijze regel").not.toBeNull();
  expect(leeg!.dataset.variant).toBe("framed");
  // Bewuste `action={null}`: alleen titel, geen leeg actie-blok.
  expect(leeg!.children.length).toBe(1);
});

// ── 5. De tooltip-vertraging ───────────────────────────────────────────────────────
// Demo Brink Licht 12 aug: "die tooltip komt pas na twee seconden, dan ben ik al aan
// het scrollen." De uitleg zat in een `title` en die vertraging is browser-eigen en
// niet in te stellen — vandaar components/ui/hint.tsx. Deze test meet de vertraging
// in de hover-stand écht na (0,3 s), en pint tegelijk vast dat er géén `title` meer
// naast staat: twee tooltips over elkaar is erger dan één trage.
test("tooltip: 300ms in plaats van de browser-vertraging, en geen dubbele title", async () => {
  await renderServer(
    <Screen>
      <Projectlijst />
    </Screen>,
  );
  await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
  const groen = "We have the product; all specs within the green margin.";
  // De telling op de eerste kaart draagt de uitleg; de legenda onderaan draagt
  // dezelfde zin, dus we pakken hem via de tooltip-rol.
  const tips = document.querySelectorAll<HTMLElement>('[role="tooltip"]');
  const tip = [...tips].find((t) => t.textContent === groen)!;
  expect(tip, "tooltip staat in de DOM, ook zonder hover").toBeTruthy();
  expect(getComputedStyle(tip).opacity, "onzichtbaar in rust").toBe("0");

  const trigger = tip.parentElement!;
  expect(trigger.getAttribute("title"), "geen tweede, trage browser-tooltip").toBe(
    null,
  );

  await page.elementLocator(trigger).hover();
  await expect
    .poll(() => getComputedStyle(tip).transitionDelay, {
      message: "vertraging in de hover-stand",
    })
    .toBe("0.3s");
  // En hij komt er ook echt: 300 ms wachten + 100 ms overgang.
  await expect
    .poll(() => getComputedStyle(tip).opacity, { timeout: 2000 })
    .toBe("1");
  await page.screenshot({ path: "./projectlijst-tooltip.light.test.png" });
});
