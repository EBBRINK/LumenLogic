// White-box RSC-render/screenshottests van de gedeelde lege toestand (UX-audit 30 jul,
// A6). De audit vond vijf dialecten voor "hier staat niets"; dit component is de enige
// die er nog mag zijn. De tests pinnen de twee dingen vast waarop de dialecten uiteen
// liepen: WIE tekent het kader ("framed" vs "inline") en of er een actie ís.
// Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { EmptyState } from "./empty-state";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

const gallery = (
  <Screen>
    <EmptyState
      title="No versions saved yet."
      description="Save the first version once the luminaire schedule is ready for the construction site."
      action={
        <form action="/noop">
          <Button type="submit" size="sm">
            Save new version
          </Button>
        </form>
      }
    />
    <EmptyState
      title="Nothing to review — all lines are unambiguous."
      description="Lines only appear here when a human verdict is needed."
      action={null}
    />
    <Card>
      <CardHeader>
        <CardTitle>Pending uploads</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState variant="inline" title="No pending uploads." action={null} />
      </CardContent>
    </Card>
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`empty-state (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(gallery);
      await expect
        .element(page.getByText("No versions saved yet."))
        .toBeInTheDocument();
      await page.screenshot({ path: `./empty-state.${theme}.${device}.test.png` });
    });
  }
}

test("framed tekent zijn eigen gestreepte kader; inline nooit", async () => {
  await renderServer(gallery);
  await expect
    .element(page.getByText("No pending uploads."))
    .toBeInTheDocument();

  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
  expect(all).toHaveLength(3);

  const framed = all.filter((e) => e.dataset.variant === "framed");
  const inline = all.filter((e) => e.dataset.variant === "inline");
  expect(framed).toHaveLength(2);
  expect(inline).toHaveLength(1);

  for (const el of framed) {
    expect(el.className).toContain("border-dashed");
  }
  // Kader binnen een kader is precies de fout die dialect 4 opleverde: de inline-variant
  // tekent daarom niets, want zijn <Card> doet dat al.
  expect(inline[0].className).not.toContain("border-dashed");
  expect(inline[0].closest('[data-slot="card"]')).not.toBeNull();
});

test("de actie-slot rendert de knop; action={null} laat geen leeg blok achter", async () => {
  await renderServer(gallery);
  await expect
    .element(page.getByRole("button", { name: "Save new version" }))
    .toBeInTheDocument();

  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
  const withAction = all.filter((e) => e.querySelector("form"));
  expect(withAction).toHaveLength(1);
  // De twee bewuste `action={null}`-gevallen hebben precies twee kinderen (titel +
  // uitleg) resp. één (alleen titel) — geen lege actie-container.
  const zonder = all.filter((e) => !e.querySelector("form"));
  expect(zonder.map((e) => e.children.length)).toEqual([2, 1]);
});

// ── Bronscan: keert de kale grijze regel terug? ─────────────────────────────
// De tests hierboven meten dit component. Dat het bestáát heeft de vorige dialecten niet
// tegengehouden: reviewzwerm 2.5a (C1) vond zeven schermen die nog steeds hun eigen
// `<p className="text-sm text-muted-foreground">` neerzetten als er niets was — precies
// het dialect dat empty-state.tsx bovenaan als DE fout benoemt. Vijf daarvan zijn omgezet.
//
// WAT DEZE SCAN WÉL IS: een ratel tegen precies het dialect dat net geveegd is — een
// leegte-vertakking die binnen een handvol regels op een muted regel uitkomt. Hij vangt
// terugval in dezelfde schrijfwijze, en houdt de uitzonderingenlijst hieronder eerlijk.
//
// WAT HIJ NIET IS: een detector van lege toestanden. Hij leest tekst, geen code, en een
// zesde variant kán er langs. Bekende ontsnappingen, gemeten op 1 aug (elk met een
// handgeschreven overtreding geverifieerd):
//   • meer dan zes code-regels tussen de vertakking en de muted regel. Het venster
//     oprekken naar tien vindt inderdaad één extra echt geval
//     (`version-history.tsx:135`, "No differences"), maar dat is een aparte melding;
//     ruimer dan dat en je vangt de gevúlde tak van het volgende blok.
//   • `<span>` in plaats van `<p>`/`<div>` — bewust NIET meegenomen: `<span
//     className="text-xs text-muted-foreground">no role</span>` in een tabelcel
//     (`memberships-block.tsx:67`, `org-members.tsx:145`, `status-badge.tsx:41`) is een
//     waarde-terugval binnen een gevúld scherm, geen lege toestand. Meenemen kost drie
//     valse positieven en levert er nul echte op.
//   • twee stappen indirectie (`const n = rijen.length` → `const leeg = n === 0` → tak),
//     of een vlag die uit een andere functie/hook komt.
//   • de muted klassen samengesteld uit een variabele of een template-literal.
//   • een eigen wrapper-component dat het dialect verstopt.
// Wie hier groen ziet, weet dus dát dit dialect niet terug is — niet dat er nergens een
// lege toestand buiten `EmptyState` om is geschreven.
//
// De scan leest broncode via `import.meta.glob(..., "?raw")`; de tests draaien in een
// echte browser, dus `node:fs` is hier niet beschikbaar (zelfde truc als
// huisstijl.test.tsx en container-breedte.test.ts).
const RAW: Record<string, string> = {
  ...(import.meta.glob("/app/**/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/components/**/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

/**
 * De leegte-TAK: `if (x.length === 0) {`, `{x.length === 0 ? (`, `… && (`, `!x.length`.
 * De test op de VERTAKKING is nodig, niet cosmetisch, en het venster begint altijd op de
 * vertakking — nooit op de toekenning. `const isEmpty = lines.length === 0;`
 * (`evaluation-panel.tsx:62`) heeft zes regels lager een KPI-label in muted staan; zou de
 * toekenning zelf als tak tellen, dan was dat een valse positieve. Dat onderscheid was in
 * reviewzwerm 2.5a precies het verschil tussen de twintig gemelde en de zeven echte
 * gevallen, en een valse positieve dwingt de volgende sessie de ratel te verzwakken.
 */
const LEEGTE_TAK = /\.length\s*(?:===\s*0|<\s*1)|!\s*[\w$.?[\]]+\.length\b/;
const VERTAKKING = /\bif\s*\(|\?|&&/;
/**
 * Het dialect zelf: een element dat volledig op de secundaire kleur staat. Twee
 * lookaheads in plaats van één volgorde, want `text-muted-foreground text-sm` is
 * dezelfde regel als `text-sm text-muted-foreground`; `text-xs` telt mee; en de klassen
 * mogen in een `cn(…)` staan in plaats van kaal in `className="…"`.
 */
const KALE_GRIJZE_REGEL =
  /className=[^=]*"(?=[^"]*\btext-(?:sm|xs)\b)(?=[^"]*\btext-muted-foreground\b)[^"]*"/;
/** `<p>` en `<div>`. Géén `<span>` — zie de kop van deze sectie. */
const DIALECT_TAG = /<(?:p|div)\b/;
const DIALECT_TAG_ALLEEN = /<(?:p|div)\s*$/;

function isCommentaar(regel: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(regel);
}

/**
 * De regelnummers (0-based) waarop een leegte-vertakking staat — direct, of via één stap
 * indirectie. Die ene stap is er omdat een verse kale grijze lege staat in
 * `brand-load-queue.tsx` in de vlag-vorm (`const leeg = rijen.length === 0;` … `if (leeg)`)
 * de vorige versie van deze scan straal voorbijliep.
 *
 * Twee vormen van indirectie, allebei één stap diep:
 *   • vlag   — `const leeg = rijen.length === 0;`  → later `if (leeg)` / `{leeg ? (` / `leeg && (`
 *   • teller — `const n = rijen.length;`           → later `if (n === 0)` / `!n`
 * De vertakking is het startpunt van het venster, niet de toekenning.
 */
function leegteTakken(regels: string[]): number[] {
  const takken = new Set<number>();
  const vlaggen = new Set<string>();
  const tellers = new Set<string>();

  for (let i = 0; i < regels.length; i++) {
    const r = regels[i];
    if (isCommentaar(r)) continue;
    if (LEEGTE_TAK.test(r) && VERTAKKING.test(r)) takken.add(i);
    if (!VERTAKKING.test(r)) {
      const vlag =
        /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]*(?:\.length\s*(?:===\s*0|<\s*1)|!\s*[\w$.?[\]]+\.length\b)/.exec(
          r,
        );
      if (vlag) vlaggen.add(vlag[1]);
    }
    const teller =
      /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[\w$.?[\]]+\.length\s*;/.exec(r);
    if (teller) tellers.add(teller[1]);
  }

  for (let i = 0; i < regels.length; i++) {
    const r = regels[i];
    if (isCommentaar(r) || !VERTAKKING.test(r)) continue;
    for (const naam of vlaggen) {
      // `if (leeg)`, `{leeg ? (`, `leeg && (` — maar NIET `!leeg &&`: dat is de gevulde tak.
      if (
        new RegExp(
          `(?:\\bif\\s*\\(\\s*|\\{\\s*|&&\\s*|\\(\\s*)${naam}\\b\\s*(?:\\)|\\?|&&)`,
        ).test(r)
      ) {
        takken.add(i);
      }
    }
    for (const naam of tellers) {
      if (new RegExp(`\\b${naam}\\s*===\\s*0\\b|!\\s*${naam}\\b`).test(r)) takken.add(i);
    }
  }
  return [...takken].sort((a, b) => a - b);
}

/**
 * Regelnummers waar een leegte-tak binnen zes CODE-regels op een kale grijze regel
 * uitkomt. Zes: het dialect is `if (…) { return ( <p …> )` of `{… ? ( <p …> )` — meer
 * ruimte dan dat en je vangt de gevulde tak van het volgende blok. Commentaar telt niet
 * mee in dat venster; anders schuift een toelichting boven de tak (en die staat er bij
 * een bewuste keuze juist wél) de treffer stilletjes buiten bereik.
 */
function kaleGrijzeLegeStaten(src: string): number[] {
  const regels = src.split("\n");
  const treffers = new Set<number>();
  for (const i of leegteTakken(regels)) {
    let gezien = 0;
    for (let j = i; j < regels.length && gezien < 6; j++) {
      const r = regels[j];
      if (isCommentaar(r) || r.trim() === "") continue;
      gezien++;
      if (/<EmptyState/.test(r)) break; // de tak is al omgezet
      if (DIALECT_TAG.test(r) && KALE_GRIJZE_REGEL.test(r)) {
        treffers.add(j + 1);
        break;
      }
      // Meerregelige tag: `<p` op zijn eigen regel, className eronder.
      if (DIALECT_TAG_ALLEEN.test(r) && KALE_GRIJZE_REGEL.test(regels[j + 1] ?? "")) {
        treffers.add(j + 2);
        break;
      }
    }
  }
  return [...treffers].sort((a, b) => a - b);
}

/**
 * De bekende, bewust openstaande gevallen — met het AANTAL per bestand, niet met
 * regelnummers (die verschuiven bij elke bewerking en zouden de lijst laten verjaren).
 *
 * DEZE LIJST MAG ALLEEN KRIMPEN. De tweede test hieronder eist dat elk bestand hier nog
 * precies zoveel échte treffers heeft; zet je er één om, dan moet het getal omlaag of de
 * regel weg. Zet er NOOIT iets bij om een test groen te krijgen — een nieuwe lege staat
 * hoort `EmptyState` te gebruiken, dat is waar dit component voor bestaat.
 */
const BEKEND_OPEN: Record<string, { aantal: number; waarom: string }> = {
  // ── De zeven bestanden die HANDOVER.md:2779-2783 noemt ──
  // Daar staan ze als "een handvol lege regels buiten de audit-lijst … kandidaat voor
  // een volgende veegbeurt", zónder aantal. De elf hieronder is de telling van DEZE scan
  // over die zeven bestanden (1+2+1+3+1+1+2), geen citaat uit HANDOVER.md.
  "/components/dossier/spec-line-table.tsx": { aantal: 1, waarom: "veegbeurt 2" },
  "/components/dossier/werkvoorbereider-view.tsx": { aantal: 2, waarom: "veegbeurt 2" },
  "/components/dossier/deviation-table.tsx": { aantal: 1, waarom: "veegbeurt 2" },
  "/components/data/enrichment-panels.tsx": { aantal: 3, waarom: "veegbeurt 2" },
  "/components/data/price-list-status.tsx": { aantal: 1, waarom: "veegbeurt 2" },
  "/components/data/custom-fields-table.tsx": { aantal: 1, waarom: "veegbeurt 2" },
  "/components/analytics-view.tsx": { aantal: 2, waarom: "veegbeurt 2" },

  // ── Vers werk van reviewzwerm-blok 3, in een andere worktree ──
  // quote-view.tsx is per sprint 2 (restjes) omgezet naar <EmptyState> (framed, bewuste
  // `action={null}`); die regel is dus weg — de lijst mag alleen krimpen. Bewijs staat in
  // components/dossier/quote-view-leeg.test.tsx.
  "/components/admin/brands-list-block.tsx": {
    aantal: 1,
    waarom: "blok 3, andere worktree",
  },

  // ── Grensgevallen: gemeld, besluit nog niet genomen ──
  // Allebei geen lege LIJST maar een gegevensstand binnen een gevuld scherm — dezelfde
  // soort als de drie die de weerlegger van de C1-lijst afvoerde (een KPI-label, een
  // inleiding). Ze staan hier omdat de scan ze niet van een echte lege staat kan
  // onderscheiden, niet omdat ze zeker fout zijn.
  "/components/catalog-search.tsx": {
    aantal: 1,
    waarom: "‘None.’ onder een sectiekop mét telling — waarde, geen lege lijst",
  },
  "/components/dossier/match-candidates.tsx": {
    aantal: 1,
    waarom: "‘geen oordelen vastgelegd’ in het bewijsblok van een kandidaat",
  },
};

const bronBestanden = () =>
  Object.entries(RAW).filter(([pad]) => !pad.endsWith(".test.tsx"));

test("geen nieuwe kale grijze regel als lege toestand", () => {
  const nieuw: string[] = [];
  for (const [pad, src] of bronBestanden()) {
    const treffers = kaleGrijzeLegeStaten(src);
    if (treffers.length === 0) continue;
    const bekend = BEKEND_OPEN[pad]?.aantal ?? 0;
    if (treffers.length > bekend) {
      nieuw.push(
        `${pad}: ${treffers.length} kale grijze lege staten (regel ${treffers.join(", ")}), ` +
          `${bekend} bekend en toegestaan`,
      );
    }
  }
  expect(
    nieuw,
    "Een lege toestand hoort <EmptyState> te zijn (components/ui/empty-state.tsx). " +
      "Zet de tak om in plaats van dit bestand op de lijst te zetten:\n" +
      nieuw.join("\n"),
  ).toEqual([]);
});

test("de uitzonderingenlijst verjaart niet: elk pad is nog een échte overtreding", () => {
  const verlopen: string[] = [];
  for (const [pad, { aantal }] of Object.entries(BEKEND_OPEN)) {
    const src = RAW[pad];
    if (src === undefined) {
      verlopen.push(`${pad}: bestaat niet meer — regel weghalen`);
      continue;
    }
    const treffers = kaleGrijzeLegeStaten(src).length;
    if (treffers < aantal) {
      verlopen.push(
        `${pad}: nog ${treffers} treffer(s), lijst zegt ${aantal} — getal verlagen of regel weghalen`,
      );
    }
  }
  expect(verlopen, verlopen.join("\n")).toEqual([]);
});
