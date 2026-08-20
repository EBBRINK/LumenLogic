// Knophiërarchie — de huisregel uit DESIGN.md §6 vastgepind (UX-audit 30 jul, A13).
//
// De regel: ÉÉN primary (`variant="default"`, navy) per scherm, en dat is de actie met
// het zwaarste gevolg. Alles daaronder is `outline`; `secondary` is een neutraal vlak
// zonder actiegewicht en hoort nooit op een `type="submit"` — op 50% opacity is het niet
// van disabled te onderscheiden, en precies daardoor lazen twee echte Save-knoppen op
// /settings als uitgeschakeld.
//
// Twee soorten toets in dit bestand:
//   1. Een BRONSCAN. Hij loopt vanaf elke page/layout door de .tsx-importgraaf en telt
//      de navy knoppen per scherm. Handmatig nalopen dreef terug; een scan niet.
//   2. Een GERENDERDE meting van de disabled-behandeling (cursor, tooltip, hover).
//
// De scan leest broncode via `import.meta.glob(..., "?raw")` — de tests draaien in een
// echte browser (playwright), dus `node:fs` is hier niet beschikbaar.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Button } from "./ui/button";

// ── Bronbestanden ───────────────────────────────────────────────────────────────────
// Sleutels zijn root-relatief ("/app/projects/[id]/page.tsx"). Het patroon zelf bevat
// geen blokhaken, dus de dynamische routemappen komen gewoon via `**` mee.
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

const bron = (pad: string) => RAW[pad.startsWith("/") ? pad : `/${pad}`];

/** Lost een import-specifier op naar een sleutel in RAW; null als het geen .tsx is. */
function resolveerImport(spec: string, vanuit: string): string | null {
  let basis: string;
  if (spec.startsWith("@/")) basis = `/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const delen = vanuit.split("/").slice(0, -1);
    for (const deel of spec.split("/")) {
      if (deel === ".") continue;
      else if (deel === "..") delen.pop();
      else delen.push(deel);
    }
    basis = delen.join("/");
  } else return null; // pakket uit node_modules
  for (const kandidaat of [`${basis}.tsx`, `${basis}/index.tsx`]) {
    if (RAW[kandidaat] != null) return kandidaat;
  }
  return null;
}

type Knop = { bestand: string; regel: number; variant: string; label: string };

/**
 * Een kaal navy vlak: `bg-primary` als losse utility, inclusief de prefixen en suffixen
 * die niets aan het navy vlak veranderen.
 *
 * TELT MEE: `bg-primary`, `!bg-primary`, `bg-primary/90` (opacity is nog steeds navy),
 * en media-/thema-prefixen die dezelfde knop in een andere context beschrijven:
 * `dark:bg-primary`, `sm:bg-primary`, `dark:sm:bg-primary`.
 *
 * TELT NIET MEE: statusvariant-prefixen — `hover:`, `focus:`, `focus-visible:`,
 * `active:`, `disabled:`, `group-hover:` en varianten daarvan — want die beschrijven een
 * ándere toestand, niet de rusttoestand van de knop. Evenmin `bg-primary-foreground` en
 * `bg-primary-hover`: een koppelteken-suffix is een andere kleur, geen navy vlak.
 * Beide vormen staan echt in `components/ui/` (badge.tsx, button.tsx); een valse positief
 * daar dwingt de volgende sessie om deze guard te verzwakken.
 *
 * TOT 2026-07-31 (reviewzwerm 2.5a, B8) stonden hier twee lookarounds die te breed
 * blokkeerden: `(?![\w/-])` wees niet alleen `-foreground` af maar ook `/90`, en
 * `(?<![\w:/-])` wees niet alleen `hover:` af maar élk prefix, dus ook `dark:` en `sm:`.
 * Drie schrijfwijzen van een kale navy knop glipten daardoor langs de bewaker.
 *
 * BEKENDE ONTSNAPPINGEN, bewust open (duurder dan deze guard, niet gevraagd — vaar hier
 * dus geen valse zekerheid op): een letterlijke kleurwaarde `bg-[#1A1F3A]`; een klassen-
 * reeks die via een template-literal met backticks wordt opgebouwd; en constanten die in
 * `components/ui/**` staan (dat pad is met opzet uitgezonderd, zie de tweede test).
 */
const KAAL_NAVY =
  /(?<![\w:/-])(?:(?!(?:[\w-]+-)?(?:hover|focus|focus-visible|active|disabled|visited|target):)[\w-]+:)*bg-primary(?:\/\d+)?(?![\w/-])/;

/**
 * Alle knop-aanroepen in één bestand, met hun variant en zichtbare label.
 *
 * WAAROM OOK `<button>` MET KLEINE LETTER (reviewzwerm 2.5a, B8): tot 2026-07-31 matchte
 * dit alleen `/<Button\b/` en was de test groen op 6/6 terwijl er op vier schermen een
 * handgebouwde navy knop stond die de scan simpelweg niet zag. De regel gold daardoor
 * feitelijk niet, en "groen" betekende niets. Een `<button className="… bg-primary …">`
 * ís een primary — of hij nu door button.tsx komt of niet.
 */
function knoppenIn(bestand: string): Knop[] {
  const src = bron(bestand) ?? "";
  const uit: Knop[] = [];
  const re = /<(Button|button)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const component = m[1] === "Button";
    // Einde van de openings-tag zoeken: een '>' op accolade-diepte 0.
    let i = m.index + m[0].length;
    let diepte = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") diepte++;
      else if (c === "}") diepte--;
      else if (c === ">" && diepte === 0) break;
      i++;
    }
    const tag = src.slice(m.index, i + 1);
    // Geen `s`-vlag: tsconfig staat op ES2017, en `[^}]` matcht regeleindes toch al.
    const vm = tag.match(/variant=(?:"([a-z]+)"|\{([^}]*)\})/);
    // <Button> zonder variant-prop = de defaultVariant van button.tsx, dus navy. Een
    // kaal <button> heeft geen varianten; daar beslist de klassenreeks: navy vlak of niet.
    const variant = component
      ? vm
        ? (vm[1] ?? vm[2]!.replace(/\s+/g, " ").trim())
        : "default"
      : KAAL_NAVY.test(tag)
        ? "default"
        : "handgebouwd";
    const rest = src.slice(i + 1);
    const eind = rest.indexOf(component ? "</Button>" : "</button>");
    const label = rest
      .slice(0, eind < 0 ? 60 : eind)
      .replace(/<[^>]*\/>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    uit.push({
      bestand,
      regel: src.slice(0, m.index).split("\n").length,
      variant,
      label,
    });
  }
  return uit;
}

/** Elk scherm = een page.tsx of layout.tsx plus alles wat het via .tsx importeert. */
function schermen(): { scherm: string; knoppen: Knop[] }[] {
  const paginas = Object.keys(RAW)
    .filter(
      (p) =>
        p.startsWith("/app/") &&
        (p.endsWith("/page.tsx") || p.endsWith("/layout.tsx")) &&
        // Analytics is buiten bereik van deze sweep.
        !p.startsWith("/app/analytics/"),
    )
    .sort();
  return paginas.map((pagina) => {
    const gezien = new Set<string>();
    const knoppen: Knop[] = [];
    const stapel = [pagina];
    while (stapel.length > 0) {
      const bestand = stapel.pop()!;
      if (gezien.has(bestand)) continue;
      gezien.add(bestand);
      knoppen.push(...knoppenIn(bestand));
      const src = bron(bestand) ?? "";
      const re = /from\s+["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        // Alleen dóór .tsx-bestanden lopen. Een server-action-module (.ts) importeert
        // soms een component voor zijn types; die rendert het scherm niet.
        const r = resolveerImport(m[1], bestand);
        if (r != null) stapel.push(r);
      }
    }
    return { scherm: pagina, knoppen };
  });
}

/** Telt een aanroep als navy? Ook de ternaries waarvan één tak "default" is. */
const isPrimary = (k: Knop) =>
  k.variant === "default" || /["']default["']/.test(k.variant);

// ── Allowlist ───────────────────────────────────────────────────────────────────────
// Elke regel hier is een navy knop die NIET meetelt in het budget van zijn scherm, met
// de reden erbij. Alleen de drie categorieën uit DESIGN.md §6 zijn geldige redenen:
// een dialoog is een eigen scherm, een herhaalde beslis-kaart heeft één primary per
// item, en een filterchip die "default" gebruikt toont een stand en niet een actie.
//
// Voeg hier NIETS aan toe om een test groen te krijgen. Als een nieuw scherm twee navy
// knoppen heeft, is er één te veel.
const NIET_MEETELLEN: { bestand: string; label: string; reden: string }[] = [
  // — Dialogen: een eigen scherm. De trigger op de pagina eronder is niet de zware actie.
  {
    bestand: "/components/dossier/xis-push-dialog.tsx",
    label: "Send to XIS",
    reden:
      "Zit ín de XIS-dialoog; de trigger op /projects/[id]/quote is een outline die alleen opent.",
  },
  {
    bestand: "/components/dossier/new-dossier-form.tsx",
    label: "Create project",
    reden:
      "Zit ín de nieuw-project-dialoog; 'New project' op /projects is de trigger ernaast.",
  },
  {
    bestand: "/components/confirm-action-dialog.tsx",
    label: "{confirmLabel}",
    reden:
      "De bevestigknop ín ConfirmActionDialog; default alleen waar de aanroeper confirmVariant='default' zet.",
  },
  // — Herhaalde beslis-kaarten: één primary per review-item, niet per pagina.
  {
    bestand: "/components/dossier/review-queue.tsx",
    label: "Choose this",
    reden: "Primary van de KeuzeCard — één per reviewregel.",
  },
  {
    bestand: "/components/dossier/review-queue.tsx",
    label: "Accept as proposal",
    reden: "Primary van de GeelCard — één per reviewregel.",
  },
  {
    bestand: "/components/dossier/review-queue.tsx",
    label: "Confirm",
    reden: "Primary van de OnvolledigCard — één per reviewregel.",
  },
  {
    bestand: "/components/dossier/review-queue.tsx",
    label: "Checked",
    reden: "Primary van de OcrCard — één per reviewregel.",
  },
  {
    bestand: "/components/dossier/review-queue.tsx",
    label: "Link this product",
    reden: "Primary van de RedLinkCard — één per niet-gevonden regel.",
  },
  // — Filterchips: `default` is hier de ACTIEVE STAND van een schakelaar, geen actie.
  //   Ze dragen de stand ook via aria-current en (bij projecten) een teal stip, dus
  //   kleur is niet het enige onderscheid.
  {
    bestand: "/components/dossier/status-filter.tsx",
    label: "",
    reden: "Statusfilter op /projects: navy = de actieve chip, geen actie.",
  },
  {
    bestand: "/components/data/brand-relations-controls.tsx",
    label: "",
    reden: "Statusfilter op /brand-management: navy = de actieve chip, geen actie.",
  },
];

const uitgezonderd = (k: Knop) =>
  NIET_MEETELLEN.some(
    (a) => a.bestand === k.bestand && (a.label === "" || k.label.includes(a.label)),
  );

test("elk scherm heeft hoogstens één primary-knop", () => {
  const alle = schermen();
  expect(alle.length, "geen enkele pagina gevonden — staat de glob goed?").toBeGreaterThan(
    20,
  );

  const overtredingen: string[] = [];
  for (const { scherm, knoppen } of alle) {
    const primaries = knoppen.filter((k) => isPrimary(k) && !uitgezonderd(k));
    if (primaries.length > 1) {
      overtredingen.push(
        `${scherm} heeft ${primaries.length} primaries:\n` +
          primaries
            .map((k) => `      · ${k.bestand}:${k.regel} — "${k.label}"`)
            .join("\n"),
      );
    }
  }

  expect(
    overtredingen,
    "DESIGN.md §6: één primary per scherm, en dat is de zwaarste actie. " +
      "Zet de lichtere op variant=\"outline\" — of, als dit echt een dialoog, een " +
      "herhaalde beslis-kaart of een filterchip is, zet hem in NIET_MEETELLEN mét reden.",
  ).toEqual([]);
});

test("een navy vlak komt uit button.tsx, niet uit een handgeschreven klassenreeks", () => {
  // De andere helft van B8. De telling hierboven ziet nu ook `<button className="…
  // bg-primary …">`, maar zo'n knop is ook los van het budget fout: hij mist wat
  // button.tsx sinds 4d6e5a8 wél doet — `--primary-hover`, `active:bg-primary-active`
  // en `disabled:cursor-not-allowed`. Vijf plekken deden dat (brand-relation-form,
  // brand-message-block, custom-field-form, admin/brand-form, app/admin/brands/page),
  // en één ervan was een <Link>, dus een test die alleen naar knoppen kijkt mist hem.
  //
  // Daarom hier: geen enkel element buiten components/ui/ draagt `bg-primary` als losse
  // utility. Wie een navy vlak wil, gebruikt <Button> (met `asChild` voor een link).
  const fouten: string[] = [];
  for (const bestand of Object.keys(RAW)) {
    if (!bestand.startsWith("/app/") && !bestand.startsWith("/components/")) continue;
    if (bestand.endsWith(".test.tsx")) continue;
    // components/ui/ is juist de plek waar de tokens wél mogen staan.
    if (bestand.startsWith("/components/ui/")) continue;
    const src = bron(bestand)!;
    src.split("\n").forEach((regel, i) => {
      // Commentaarregels die de klasse noemen (zoals deze uitleg) zijn geen code.
      if (/^\s*(\/\/|\*|\/\*)/.test(regel)) return;
      if (KAAL_NAVY.test(regel)) fouten.push(`${bestand}:${i + 1}`);
    });
  }
  expect(
    fouten,
    "handgebouwd navy vlak — gebruik <Button> (of <Button asChild> om een link). " +
      "Zie DESIGN.md §6: de knopvarianten staan in components/ui/button.tsx.",
  ).toEqual([]);
});

test("een echte submit staat nooit op het neutrale secondary-vlak", () => {
  // Dit is de andere helft van A13: `secondary` op 50% opacity is niet van disabled te
  // onderscheiden. `secondary` blijft bestaan voor schakelaarstanden (aria-pressed) en
  // inerte navigatie (pager, terug-link) — die zijn geen submit.
  const fouten: string[] = [];
  for (const bestand of Object.keys(RAW)) {
    if (!bestand.startsWith("/app/") && !bestand.startsWith("/components/")) continue;
    if (bestand.endsWith(".test.tsx")) continue; // fixtures, geen schermen
    if (bestand.startsWith("/components/analytics/")) continue;
    const src = bron(bestand)!;
    const re = /<Button\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      let i = m.index + m[0].length;
      let diepte = 0;
      while (i < src.length) {
        const c = src[i];
        if (c === "{") diepte++;
        else if (c === "}") diepte--;
        else if (c === ">" && diepte === 0) break;
        i++;
      }
      const tag = src.slice(m.index, i + 1);
      if (!/type="submit"/.test(tag)) continue;
      if (!/variant="secondary"/.test(tag)) continue; // ternaries = schakelaarstand
      fouten.push(`${bestand}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  expect(
    fouten,
    "DESIGN.md §6: een submit is een actie — gebruik variant=\"outline\" (of default " +
      "als dit de zwaarste actie van het scherm is). Het neutrale secondary-vlak leest " +
      "als uitgeschakeld.",
  ).toEqual([]);
});

// ── De disabled-behandeling, gemeten in de browser ──────────────────────────────────

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const specimen = (
  <div className="flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground">
    <h1 className="text-xl font-semibold">Knophiërarchie — specimen</h1>
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Eén primary, de rest outline
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Import PDF</Button>
        <Button variant="outline">Add line</Button>
        <Button variant="outline">Import lines</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
    </section>
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Aan naast uit — per variant
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="aan-default">Publish</Button>
        <Button data-testid="uit-default" disabled title="2 rows still need a verdict">
          Publish
        </Button>
        <Button data-testid="aan-outline" variant="outline">
          Search
        </Button>
        <Button data-testid="uit-outline" variant="outline" disabled>
          Search
        </Button>
        <Button data-testid="aan-secondary" variant="secondary">
          Next
        </Button>
        <Button data-testid="uit-secondary" variant="secondary" disabled>
          Next
        </Button>
      </div>
    </section>
  </div>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// renderServer rendert asynchroon door; eerst op de kop wachten, anders zijn de
// querySelectors hieronder nog leeg (zelfde reden als in huisstijl.test.tsx).
async function render(stand: "light" | "dark", viewport: keyof typeof viewports) {
  // Binnen één test rendert deze helper meerdere keren (licht/donker × mobiel/desktop);
  // zonder cleanup stapelen de specimens en vindt de locator drie koppen.
  await cleanup();
  document.documentElement.classList.toggle("dark", stand === "dark");
  const { width, height } = viewports[viewport];
  await page.viewport(width, height);
  await renderServer(specimen);
  await expect
    .element(
      page.getByRole("heading", { level: 1, name: "Knophiërarchie — specimen" }),
    )
    .toBeInTheDocument();
}

test("disabled is voelbaar anders: not-allowed-cursor en een bereikbare reden", async () => {
  await render("light", "desktop");
  for (const variant of ["default", "outline", "secondary"] as const) {
    const uit = document.querySelector<HTMLElement>(
      `[data-testid="uit-${variant}"]`,
    )!;
    const stijl = getComputedStyle(uit);
    // Kit §6 blijft leidend voor de opacity; hier komt alleen gedrag bij.
    expect(stijl.opacity, `${variant}: kit §6 schrijft 50% opacity voor`).toBe("0.5");
    expect(stijl.cursor, `${variant}: disabled hoort not-allowed te wijzen`).toBe(
      "not-allowed",
    );
    // Dit is de reden dat `disabled:pointer-events-none` eruit moest: met
    // pointer-events: none is de knop geen muis-doelwit, dus zowel de cursor als de
    // `title` met de reden ("2 rows still need a verdict") bereikte niemand.
    expect(
      stijl.pointerEvents,
      `${variant}: pointer-events moet aan blijven, anders is er geen cursor en geen tooltip`,
    ).not.toBe("none");
  }

  const uitDefault = document.querySelector<HTMLElement>(
    '[data-testid="uit-default"]',
  )!;
  expect(uitDefault.title).toBe("2 rows still need a verdict");
});

test("geen enkele variant laat zijn hover-stijl los op een uitgeschakelde knop", () => {
  // `disabled:pointer-events-none` is uit button.tsx gehaald zodat de cursor en de
  // reden-tooltip werken (zie de test hierboven). Daarmee gaat wél :hover weer matchen
  // op een uitgeschakelde knop, want CSS kent dat onderscheid niet. Elke hover-utility
  // in de varianten moet dus `not-disabled:` voorop hebben.
  const src = bron("/components/ui/button.tsx")!;
  const blok = src.slice(src.indexOf("variants: {"), src.indexOf("size: {"));
  const ongedekt = [...blok.matchAll(/(?<!not-disabled:)\bhover:[\w[\]/.-]+/g)].map(
    (m) => m[0],
  );
  expect(
    ongedekt,
    "elke hover-utility in een knopvariant hoort `not-disabled:hover:…` te zijn, " +
      "anders reageert een uitgeschakelde knop alsnog op de muis",
  ).toEqual([]);
});

test("de not-disabled-guard komt ook echt in de CSS terecht", async () => {
  // Een verkeerd gespelde variant (`not_disabled:`, `notdisabled:`) levert stilzwijgend
  // géén regel op; dan is de bronscan hierboven groen terwijl er in de browser niets
  // gebeurt. Deze test loopt daarom de echte stylesheet na.
  //
  // Waarom geen live hover-meting: Tailwind zet de hover-regel binnen
  // `@media (hover: hover)` én binnen een `@layer`, genest met `&`-selectors. De
  // gerenderde muispositie in deze harness is niet betrouwbaar genoeg om daarop te
  // meten; de regelstructuur wél.
  await render("light", "desktop");

  const ketens: string[] = [];
  const loop = (regels: CSSRuleList, pad: string) => {
    for (const regel of Array.from(regels)) {
      const sel = (regel as CSSStyleRule).selectorText;
      const nieuw = sel != null ? `${pad}${sel}` : pad;
      if (sel != null) ketens.push(nieuw);
      const kinderen = (regel as CSSGroupingRule).cssRules;
      if (kinderen != null) loop(kinderen, nieuw);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      loop(sheet.cssRules, "");
    } catch {
      /* cross-origin sheet — overslaan */
    }
  }

  const primaryHover = ketens.filter((k) => k.includes("not-disabled\\:hover\\:bg-primary-hover"));
  expect(
    primaryHover.length,
    "de klasse not-disabled:hover:bg-primary-hover levert geen enkele CSS-regel op — " +
      "waarschijnlijk een typefout in de variantnaam",
  ).toBeGreaterThan(0);
  expect(
    primaryHover.some((k) => k.includes(":not(:disabled)") && k.includes(":hover")),
    "de hover-regel van de primary hoort achter :not(:disabled) te zitten",
  ).toBe(true);
});

test("screenshots knophiërarchie", async () => {
  for (const stand of ["light", "dark"] as const) {
    for (const viewport of ["mobile", "desktop"] as const) {
      await render(stand, viewport);
      await page.screenshot({
        path: `./knophierarchie.${stand}.${viewport}.test.png`,
      });
    }
  }
});
