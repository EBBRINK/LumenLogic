// White-box RSC-render/interactietests voor het status- en fasemodel (B6, stap 4) —
// vervangt de oude lifecycle-tests, met behoud van het gedekte gedrag: archiveren
// vraagt een VERPLICHTE reden, archief toont read-only-taal, en het lijstfilter draagt
// aria-current. Plus licht/donker × mobiel/desktop screenshots van de projectlijst
// (statusbadges + filter) en de projectkop (status- en XIS-fase-controls).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DossierList } from "./dossier-list";
import { PhaseBadge } from "./phase-badge";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectStatusControls } from "./project-status-controls";
import { StatusFilter, type ProjectStatusFilter } from "./status-filter";
import { StatusTally } from "./status-badge";
import { emptyCounts } from "./status";
import type { DossierSummary } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Alle zes statussen in één lijst — de badge-taal moet op elk scherm hetzelfde zijn.
const dossiers: DossierSummary[] = [
  { id: "d1", name: "Ziekenhuis Noord", customer: "Deerns", phase: "tender", status: "concept", counts: { ...emptyCounts(), groen: 9, geel: 2 } },
  { id: "d2", name: "Kantoor Zuid", customer: "BAM Bouw", phase: "tender", status: "estimate_gestuurd", counts: { ...emptyCounts(), groen: 4 } },
  { id: "d3", name: "School West", customer: "Heijmans", phase: "tender", status: "offerte", counts: { ...emptyCounts(), groen: 6, blauw: 1 } },
  { id: "d4", name: "Museum Oost", customer: "Gemeente", phase: "awarded", status: "gegund", counts: { ...emptyCounts(), groen: 12 } },
  { id: "d5", name: "Hotel Centrum", customer: "Van Wijnen", phase: "tender", status: "niet_gegund", counts: { ...emptyCounts(), groen: 3, rood: 2 } },
  { id: "d6", name: "Vervallen project", customer: null, phase: "tender", status: "archief" },
];

// Nagebouwde projectkop (zelfde opbouw als app/projects/[id]/layout.tsx) — zo staat
// de header mét status-dropdown, XIS-fase-select en afgeleide fase-badge op de foto.
function Projectkop({
  status,
  xisPhase,
  phase,
  archivedReason,
}: {
  status: DossierSummary["status"];
  xisPhase: React.ComponentProps<typeof ProjectStatusControls>["xisPhase"];
  phase: "tender" | "awarded";
  archivedReason?: string | null;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Ziekenhuis Noord</h1>
          <ProjectStatusBadge status={status} />
          <PhaseBadge phase={phase} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Deerns</span>
          <StatusTally counts={{ ...emptyCounts(), groen: 9, geel: 2 }} />
        </div>
      </div>
      <ProjectStatusControls
        dossierId="d1"
        status={status}
        xisPhase={xisPhase}
        archivedReason={archivedReason}
        statusAction={noopAction}
        xisPhaseAction={noopAction}
      />
    </header>
  );
}

const screens = {
  "projectlijst-status": (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Projecten</h1>
      <div className="mb-6">
        <StatusFilter active="alle" />
      </div>
      <DossierList dossiers={dossiers} />
    </Screen>
  ),
  "projectkop-status": (
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>
  ),
  "projectkop-gegund": (
    <Screen>
      <Projectkop status="gegund" xisPhase="deal_making" phase="awarded" />
    </Screen>
  ),
  "projectkop-archief": (
    <Screen>
      <Projectkop
        status="archief"
        xisPhase="lost"
        phase="tender"
        archivedReason="verloren tender"
      />
    </Screen>
  ),
  // De filterrij als knoppen, met de actieve stand op drie plekken in de rij: vooraan
  // (default), in het midden en achteraan. Zo staat op één foto of de actieve chip
  // overal even goed leesbaar is, én hoe de rij afbreekt op mobiel.
  "projectfilter-knoppen": (
    <Screen>
      <div className="flex flex-col gap-6">
        <StatusFilter active="alle" />
        <StatusFilter active="estimate_gestuurd" />
        <StatusFilter active="archief" />
      </div>
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// Lijst: elke status verschijnt als badge; de afgeleide fase-badge staat ernaast.
test("projectlijst: statusbadge per project, in de vaste badge-taal", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={dossiers} />
    </Screen>,
  );
  for (const label of [
    "Concept",
    "Estimate sent",
    "Quote",
    "Won", // let op: staat er 2× — als statusbadge én als fase-badge (awarded)
    "Lost",
    "Archived",
  ]) {
    await expect
      .element(page.getByText(label, { exact: true }).first())
      .toBeInTheDocument();
  }
});

// Filter: zeven opties (Alle + zes statussen), de actieve draagt aria-current;
// default "All" zonder query (toont alles behálve archief — dat is de repo-kant).
test("statusfilter: zeven opties, de actieve draagt aria-current", async () => {
  await renderServer(
    <Screen>
      <StatusFilter active="archief" />
    </Screen>,
  );
  for (const label of [
    "All",
    "Concept",
    "Estimate sent",
    "Quote",
    "Won",
    "Lost",
    "Archived",
  ]) {
    await expect
      .element(page.getByRole("link", { name: label, exact: true }))
      .toBeInTheDocument();
  }
  await expect
    .element(page.getByRole("link", { name: "Archived" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(page.getByRole("link", { name: "All" }))
    .not.toHaveAttribute("aria-current");
  await expect
    .element(page.getByRole("link", { name: "Lost" }))
    .toHaveAttribute("href", "/projects?filter=niet_gegund");
});

// ── Filterrij als knoppen ────────────────────────────────────────────────────
// De rij is van tekst-met-onderstreep naar echte knoppen gegaan. Deze tests pinnen
// de vier dragers van de actieve stand vast (kit §11: kleur nooit de enige drager)
// en de maatkeuze uit besluit O9. Zakt hier iets weg, dan is de actief/inactief-
// leesbaarheid stiller geworden — dat is een regressie, geen smaakkwestie.

// Hulpje: de knop hoort de <a> zelf te zijn (Button asChild), niet een wrapper.
// Zit er een <button> om de link, dan is asChild eraf gevallen en verliest de rij
// zijn href/aria-current — vandaar de expliciete selector op a[data-slot="button"].
function chip(href: string): HTMLAnchorElement {
  const el = document.querySelector<HTMLAnchorElement>(
    `a[data-slot="button"][href="${href}"]`,
  );
  expect(el, `filterchip ${href} is geen Button-link`).not.toBeNull();
  return el!;
}

// renderServer rendert asynchroon door: zonder eerst op een element te wachten zijn
// de querySelectors hieronder nog leeg. Zelfde escape als in huisstijl.test.tsx.
async function renderFilter(active: ProjectStatusFilter) {
  await renderServer(
    <Screen>
      <StatusFilter active={active} />
    </Screen>,
  );
  await expect
    .element(page.getByRole("link", { name: "All", exact: true }))
    .toBeInTheDocument();
}

const ACTIVE = "/projects?filter=estimate_gestuurd";
const INACTIVE = "/projects?filter=concept";

// [vlak actief, label actief, vlak inactief, label inactief] per stand. Dark draait
// het actieve vlak om: wit met navy label (besluit O10) — navy op canvas #0F1626 zou
// ~1,3:1 zijn en de chip laten verdwijnen.
const CHIP_KLEUREN = {
  light: ["rgb(26, 31, 58)", "rgb(255, 255, 255)", "rgb(240, 242, 245)", "rgb(26, 31, 58)"],
  dark: ["rgb(255, 255, 255)", "rgb(26, 31, 58)", "rgb(42, 49, 69)", "rgb(255, 255, 255)"],
} as const;

// --input per stand: #D0D6E0 in light, #3A4254 in dark.
const INPUT_RAND = {
  light: "rgb(208, 214, 224)",
  dark: "rgb(58, 66, 84)",
} as const;

for (const theme of ["light", "dark"] as const) {
  const [activeBg, activeFg, inactiveBg, inactiveFg] = CHIP_KLEUREN[theme];
  test(`filterrij ${theme}: actieve chip is gevuld en het label draait mee`, async () => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    await renderFilter("estimate_gestuurd");
    const active = getComputedStyle(chip(ACTIVE));
    const inactive = getComputedStyle(chip(INACTIVE));

    // Drager 1 — vulling. Het verschil tússen de twee vlakken is 14,4:1 (light) /
    // 12,9:1 (dark), dus de stand is ook in grijswaarde te zien.
    expect(active.backgroundColor, `actief vlak in ${theme}`).toBe(activeBg);
    expect(inactive.backgroundColor, `inactief vlak in ${theme}`).toBe(inactiveBg);
    expect(active.color, `actief label in ${theme}`).toBe(activeFg);
    expect(inactive.color, `inactief label in ${theme}`).toBe(inactiveFg);

    // Drager 2 — gewicht: semibold (600) tegen medium (500).
    expect(active.fontWeight, `actief gewicht in ${theme}`).toBe("600");
    expect(inactive.fontWeight, `inactief gewicht in ${theme}`).toBe("500");

    // Drager 3 — rand: inactief heeft de --input-rand, actief is transparant. Exact
    // vastgepind, niet als "niet-transparant": dat laatste blijft ook groen als de rand
    // per ongeluk een willekeurige andere kleur krijgt.
    expect(active.borderTopColor, `actieve rand in ${theme}`).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(inactive.borderTopColor, `inactieve rand in ${theme}`).toBe(
      INPUT_RAND[theme],
    );
  });
}

test("filterrij: alleen de actieve chip draagt de teal accentstip", async () => {
  // Drager 4 — vorm. De stip is het teal-accent uit de navbalk (O12), zodat de
  // pagina één taal spreekt; aria-hidden, want de stand staat al in aria-current.
  await renderFilter("estimate_gestuurd");
  const dots = document.querySelectorAll('a[data-slot="button"] span[aria-hidden]');
  expect(dots.length, "precies één accentstip in de rij").toBe(1);
  expect(chip(ACTIVE).contains(dots[0]), "de stip zit op de actieve chip").toBe(
    true,
  );
  expect(getComputedStyle(dots[0]).backgroundColor).toBe("rgb(27, 168, 154)"); // --brand-teal
  // De stip mag de toegankelijke naam niet vervuilen.
  await expect
    .element(page.getByRole("link", { name: "Estimate sent", exact: true }))
    .toBeInTheDocument();
});

test("filterrij: chips blijven op de compacte 28px-maat (besluit O9)", async () => {
  // O9 beperkt de 44px-eis tot default/lg/formuliervelden en laat dense controls
  // compact. Een filterrij van zeven opties is zo'n control. Gaat deze test om naar
  // 44px, dan is dat een besluit — geen opruimactie.
  await renderFilter("alle");
  expect(chip(INACTIVE).dataset.size).toBe("sm");
  expect(chip(INACTIVE).offsetHeight, "chiphoogte").toBe(28);
});

test("filterrij: geen chip breder dan de kolom op 320px", async () => {
  // De rij heeft `flex-wrap`, dus hij kan alléén overlopen als één chip breder is dan
  // zijn container. Dát is hier de assertie — een `scrollWidth <= clientWidth` op het
  // document zou ook groen blijven als de chips verdubbelden, en pint dus niets.
  // (De ~333px-overloop in HANDOVER.md zit in de site-navbalk, niet in deze rij.)
  await page.viewport(320, 640);
  try {
    await renderFilter("estimate_gestuurd");
    const rij = chip(ACTIVE).parentElement!;
    const ruimte = rij.clientWidth;
    for (const el of Array.from(rij.children) as HTMLElement[]) {
      expect(
        el.getBoundingClientRect().width,
        `chip "${el.textContent}" past niet in ${ruimte}px`,
      ).toBeLessThanOrEqual(ruimte);
    }
    // En de rij breekt dus af in plaats van te schuiven.
    expect(rij.scrollWidth, "rijbreedte").toBeLessThanOrEqual(rij.clientWidth);
  } finally {
    // Niet laten weglekken naar de volgende test/bestand — de screenshottests
    // zetten hun eigen viewport, maar de assertietests hierboven niet.
    await page.viewport(viewports.desktop.width, viewports.desktop.height);
  }
});

// De focus-ring op de chips. Kit §11 eist "altijd zichtbaar" op elk interactief element;
// de rij zit op het paginacanvas, dus --ring is hier de juiste token (blauw 7,1:1 in
// light, teal 6,1:1 in dark — geen navy-balk-uitzondering nodig). De assertie is de
// gerénderde randkleur en niet alleen "activeElement": de knopklassen komen uit
// button.tsx, dus zonder deze meting zou een gesloopte `focus-visible:border-ring`
// hier groen blijven. De screenshot is er om hem te kunnen bekíjken, niet als bewijs.
const RING_KLEUR = {
  light: "rgb(45, 90, 140)", // --ring #2D5A8C
  dark: "rgb(27, 168, 154)", // --ring #1BA89A (O10)
} as const;

for (const theme of ["light", "dark"] as const) {
  test(`filterrij ${theme}: focus verkleurt de rand naar --ring`, async () => {
    await page.viewport(viewports.desktop.width, 240);
    try {
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderFilter("estimate_gestuurd");
      const el = chip(INACTIVE);
      const rustKleur = getComputedStyle(el).borderTopColor;
      el.focus();
      expect(document.activeElement, "chip is focusbaar").toBe(el);
      // :focus-visible wordt pas in het volgende frame doorgerekend.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await expect
        .poll(() => getComputedStyle(el).borderTopColor)
        .toBe(RING_KLEUR[theme]);
      // En de focus-stand is echt een verandering t.o.v. de ruststand.
      expect(rustKleur, "rand in rust ≠ rand bij focus").not.toBe(
        RING_KLEUR[theme],
      );
      await page.screenshot({ path: `./projectfilter-focus.${theme}.test.png` });
    } finally {
      await page.viewport(viewports.desktop.width, viewports.desktop.height);
    }
  });
}

// Kop: status-dropdown met de zes statussen + XIS-fase-select met de tien NL-labels.
test("projectkop: status-dropdown en XIS-fase-select met alle opties", async () => {
  await renderServer(
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>,
  );
  const status = page.getByLabelText("Status");
  await expect.element(status).toBeInTheDocument();
  const xis = page.getByLabelText("XIS phase");
  await expect.element(xis).toBeInTheDocument();
  // De tien XIS-fasen als nette NL-labels.
  for (const label of [
    "Start", "Engineering", "Calculations", "Presenting", "Tender",
    "Deal making", "Deliver", "Aftersales", "Win", "Lost",
  ]) {
    await expect
      .element(page.getByRole("option", { name: label }).first())
      .toBeInTheDocument();
  }
});

// Archiveren vraagt eerst een VERPLICHTE reden (gedrag uit de oude lifecycle-test):
// archief kiezen opent de dialoog, de submit staat uit tot er een reden is ingevuld.
test("status archief kiezen vraagt een requirede reden voordat het door kan", async () => {
  await renderServer(
    <Screen>
      <Projectkop status="concept" xisPhase="start" phase="tender" />
    </Screen>,
  );
  await page.getByLabelText("Status").selectOptions("Archived");
  await expect.element(page.getByText(/Reason \(required\)/)).toBeInTheDocument();
  const submit = page.getByRole("button", { name: "Yes, archive" });
  await expect.element(submit).toBeDisabled();
  await page.getByLabelText(/Reason \(required\)/).fill("verloren tender");
  await expect.element(submit).toBeEnabled();
});

// Archief = read-only: de reden staat in de kop, de XIS-fase-select staat op slot;
// alleen via de status-dropdown kom je eruit (heropenen).
test("projectkop archief: toont de reden en zet de XIS-fase-select op slot", async () => {
  await renderServer(
    <Screen>
      <Projectkop
        status="archief"
        xisPhase="lost"
        phase="tender"
        archivedReason="verloren tender"
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Archived: verloren tender/))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("XIS phase")).toBeDisabled();
  await expect.element(page.getByLabelText("Status")).toBeEnabled();
});
