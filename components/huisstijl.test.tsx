// Huisstijl-specimen (2.0b stap 0): twee bladen met alle primitives naast elkaar, zodat de
// token-flip en de componentgeometrie in screenshots te beoordelen zijn zonder door dertig
// schermtests te spitten. Zie docs/plan-2.0b-huisstijl-implementatie.md §8.
//
// Twee bladen en niet één: het specimen is samen hoger dan 812px, en een viewport groter dan
// het browservenster wordt door de browsermodus verkleind in plaats van vergroot — dan lever
// je onleesbare mini-PNG's op. Zo past elk blad binnen de gewone viewports (375x812 /
// 1280x800, gelijk aan site-nav.test.tsx).
//
// De white-box-assertions op tokenwaarden en geometrie komen in stap 1 en 2 mee (ze zouden
// hier per definitie rood zijn — dit is de before-run). Wat hier al wél getoetst wordt is de
// structuur: staat elk specimen er, en hangt het aan de tokenlaag.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const BUTTON_VARIANTS = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const;

const BUTTON_SIZES = [
  "default",
  "xs",
  "sm",
  "lg",
  "icon",
  "icon-xs",
  "icon-sm",
  "icon-lg",
] as const;

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const;

function Sheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Secundaire tekst — muted-foreground.
        </p>
      </header>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

const controls = (
  <Sheet title="Specimen — bediening">
    <Section title="Knop-varianten">
      <div className="flex flex-wrap items-center gap-2">
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button disabled>disabled</Button>
      </div>
    </Section>

    <Section title="Knop-maten">
      <div className="flex flex-wrap items-center gap-2">
        {BUTTON_SIZES.map((size) => (
          <Button key={size} size={size} aria-label={`maat ${size}`}>
            {size.startsWith("icon") ? "●" : size}
          </Button>
        ))}
      </div>
    </Section>

    <Section title="Invoervelden">
      <div className="grid max-w-xl gap-3">
        <Input placeholder="Leeg veld met placeholder" />
        <Input defaultValue="Ingevulde waarde" />
        <Input data-testid="input-focus" defaultValue="Veld met focus" />
        <Input aria-invalid defaultValue="Veld met fout" />
        <Input disabled defaultValue="Uitgeschakeld veld" />
      </div>
    </Section>
  </Sheet>
);

const surfaces = (
  <Sheet title="Specimen — vlakken">
    <Section title="Kaarten">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Standaardkaart</CardTitle>
            <CardDescription>Beschrijving in muted-foreground.</CardDescription>
          </CardHeader>
          <CardContent>Inhoud van de kaart.</CardContent>
          <CardFooter>Voettekst</CardFooter>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Datakaart (sm)</CardTitle>
            <CardDescription>KPI-variant.</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-heading text-2xl font-bold">1.284</span>
          </CardContent>
        </Card>
      </div>
    </Section>

    <Section title="Badges">
      <div className="flex flex-wrap items-center gap-2">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>
    </Section>

    <Section title="Tabel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Merk</TableHead>
            <TableHead>Artikelcode</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Flos</TableCell>
            <TableCell>F-1024-BK</TableCell>
            <TableCell>
              <Badge variant="secondary">actief</Badge>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Artemide</TableCell>
            <TableCell>A-2210-WH</TableCell>
            <TableCell>
              <Badge variant="destructive">verlopen</Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Section>
  </Sheet>
);

const SHEETS = [
  { id: "bediening", title: "Specimen — bediening", node: controls },
  { id: "vlakken", title: "Specimen — vlakken", node: surfaces },
] as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// renderServer rendert asynchroon door; eerst op een element wachten, anders zijn de
// querySelectors in de structuurtests nog leeg.
async function render(node: React.ReactNode, title: string) {
  await renderServer(node);
  await expect
    .element(page.getByRole("heading", { level: 1, name: title }))
    .toBeInTheDocument();
}

for (const sheet of SHEETS) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`specimen ${sheet.id} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await render(sheet.node, sheet.title);

        // Focus-state vastzetten zodat hij op de screenshot staat.
        document
          .querySelector<HTMLInputElement>('[data-testid="input-focus"]')
          ?.focus();

        await page.screenshot({
          path: `./huisstijl-${sheet.id}.${theme}.${device}.test.png`,
        });
      });
    }
  }
}

test("specimen dekt elke knop-variant, knop-maat en badge-variant", async () => {
  await render(controls, "Specimen — bediening");
  for (const variant of BUTTON_VARIANTS) {
    expect(
      document.querySelector(`[data-slot="button"][data-variant="${variant}"]`),
      `knop-variant ${variant} ontbreekt in het specimen`,
    ).not.toBeNull();
  }
  for (const size of BUTTON_SIZES) {
    expect(
      document.querySelector(`[data-slot="button"][data-size="${size}"]`),
      `knop-maat ${size} ontbreekt in het specimen`,
    ).not.toBeNull();
  }

  await render(surfaces, "Specimen — vlakken");
  for (const variant of BADGE_VARIANTS) {
    expect(
      document.querySelector(`[data-slot="badge"][data-variant="${variant}"]`),
      `badge-variant ${variant} ontbreekt in het specimen`,
    ).not.toBeNull();
  }
});

// ── Tokenwaarden (stap 1) ────────────────────────────────────────────────────
// Deze waarden staan letterlijk in de brand kit. Faalt hier iets, dan is de
// tokenlaag afgeweken van de bron — niet de test aanpassen, de CSS.

const LIGHT_TOKENS = {
  "--background": "#ffffff",
  "--foreground": "#1a1a1a",
  "--primary": "#1a1f3a", // §7 navy
  "--primary-foreground": "#ffffff",
  "--secondary": "#f0f2f5",
  "--muted": "#f5f7fa",
  "--muted-foreground": "#8e9ba8", // §3, bewuste AA-afwijking (DESIGN.md O8)
  "--destructive": "#d84c4c",
  "--border": "#e5e9f0",
  "--input": "#d0d6e0",
  "--ring": "#2d5a8c", // §11 blauw in light
  "--brand-navy": "#1a1f3a",
  "--brand-blue": "#2d5a8c",
  "--brand-teal": "#1ba89a",
  "--brand-slate": "#3f4a5c",
  "--success": "#1ba89a",
  "--warning": "#ff9500",
  // Navigatiebalk (DESIGN.md O12). Staan hier én in DARK_TOKENS met dezelfde
  // waarden: dat is de assertie die vastlegt dat de balk mode-invariant is.
  "--nav": "#1a1f3a",
  "--nav-foreground": "#ffffff",
  "--nav-muted": "#b0b8c4",
  "--nav-accent": "#1ba89a",
  "--nav-border": "#3a4254",
} as const;

// Statuskleuren staan APART van LIGHT_TOKENS/DARK_TOKENS, want ze komen niet uit de
// brand kit: het zijn de bevroren Tailwind-hues die de code al gebruikte (besluit
// Timo 2026-07-30, DESIGN.md O13). Die scheiding is de bedoeling — LIGHT_TOKENS is
// "wat de kit voorschrijft", dit is "wat er staat tot Eduard een statusramp levert".
// De waarden zijn letterlijk uit node_modules/tailwindcss/theme.css overgenomen, dus
// deze test is tegelijk de controle dat er niets is verschoven bij het omzetten.
const STATUS_TOKENS_LIGHT = {
  "--status-green-tint": "oklch(95% 0.052 163.051)", // emerald-100
  "--status-green-ink": "oklch(43.2% 0.095 166.913)", // emerald-800
  "--status-green-dot": "oklch(69.6% 0.17 162.48)", // emerald-500
  "--status-amber-tint": "oklch(96.2% 0.059 95.617)", // amber-100
  "--status-amber-ink": "oklch(47.3% 0.137 46.201)", // amber-800
  "--status-blue-tint": "oklch(95.1% 0.026 236.824)", // sky-100
  "--status-blue-ink": "oklch(44.3% 0.11 240.79)", // sky-800
  "--status-red-tint": "oklch(94.1% 0.03 12.58)", // rose-100
  "--status-purple-tint": "oklch(94.3% 0.029 294.588)", // violet-100
  "--status-grey-tint": "oklch(96.8% 0.007 247.896)", // slate-100
  "--status-orange-ink": "oklch(47% 0.157 37.304)", // orange-800
} as const;

const STATUS_TOKENS_DARK = {
  "--status-green-tint": "oklch(26.2% 0.051 172.552)", // emerald-950
  "--status-green-ink": "oklch(84.5% 0.143 164.978)", // emerald-300
  "--status-amber-tint": "oklch(27.9% 0.077 45.635)", // amber-950
  "--status-blue-ink": "oklch(82.8% 0.111 230.318)", // sky-300
  "--status-purple-ink": "oklch(81.1% 0.111 293.571)", // violet-300
  "--status-grey-ink": "oklch(86.9% 0.022 252.894)", // slate-300
} as const;

const DARK_TOKENS = {
  "--background": "#0f1626", // §14
  "--foreground": "#ffffff",
  "--card": "#1a1f3a",
  "--primary": "#ffffff", // besluit O10: wit vlak op donker
  "--primary-foreground": "#1a1f3a",
  "--muted": "#2a3145",
  "--muted-foreground": "#b0b8c4",
  "--border": "#3a4254",
  "--ring": "#1ba89a", // besluit O10: teal in dark
  // Identiek aan light: de balk blijft in dark hetzelfde navy vlak. Overschrijft
  // iemand deze tokens later in .dark, dan valt deze test om. Zie DESIGN.md O12.
  "--nav": "#1a1f3a",
  "--nav-foreground": "#ffffff",
  "--nav-muted": "#b0b8c4",
  "--nav-accent": "#1ba89a",
  "--nav-border": "#3a4254",
} as const;

test("tokenwaarden light komen letterlijk uit de brand kit", async () => {
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  for (const [token, value] of Object.entries(LIGHT_TOKENS)) {
    expect(root.getPropertyValue(token).trim(), `${token} in light`).toBe(value);
  }
});

test("tokenwaarden dark komen uit kit §14 plus de vastgelegde besluiten", async () => {
  document.documentElement.classList.add("dark");
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  for (const [token, value] of Object.entries(DARK_TOKENS)) {
    expect(root.getPropertyValue(token).trim(), `${token} in dark`).toBe(value);
  }
});

test("statuskleuren zijn de bevroren Tailwind-hues, niet bijgestemd (O13)", async () => {
  // Besluit Timo 2026-07-30: het mechanisme ging om (paletklassen → tokens), de
  // kleuren niet. Deze test is het bewijs dat de omzetting waardevrij was: elke
  // waarde staat letterlijk in node_modules/tailwindcss/theme.css. Gaat hij om,
  // dan is er iemand aan de statuskleuren gaan draaien — en dat is een besluit
  // dat bij Eduard hoort, niet in een commit.
  await render(controls, "Specimen — bediening");
  let root = getComputedStyle(document.documentElement);
  for (const [token, value] of Object.entries(STATUS_TOKENS_LIGHT)) {
    expect(root.getPropertyValue(token).trim(), `${token} in light`).toBe(value);
  }

  document.documentElement.classList.add("dark");
  await render(controls, "Specimen — bediening");
  root = getComputedStyle(document.documentElement);
  for (const [token, value] of Object.entries(STATUS_TOKENS_DARK)) {
    expect(root.getPropertyValue(token).trim(), `${token} in dark`).toBe(value);
  }
});

test("elk statustoken rendert identiek aan de Tailwind-klasse die het vervangt", async () => {
  // Dit is het echte bewijs dat de omzetting niets veranderd heeft: niet de tokenstring
  // vergelijken, maar de gerénderde kleur van de oude klasse naast die van het nieuwe
  // token. Zakt hier iets weg, dan is er bij het vervangen een tint verschoven.
  const PAIRS = [
    ["bg-emerald-100", "bg-status-green-tint"],
    ["bg-emerald-500", "bg-status-green-dot"],
    ["bg-amber-100", "bg-status-amber-tint"],
    ["bg-amber-500", "bg-status-amber-dot"],
    ["bg-sky-100", "bg-status-blue-tint"],
    ["bg-sky-500", "bg-status-blue-dot"],
    ["bg-rose-100", "bg-status-red-tint"],
    ["bg-rose-500", "bg-status-red-dot"],
    ["bg-violet-100", "bg-status-purple-tint"],
    ["bg-violet-500", "bg-status-purple-dot"],
    ["bg-slate-100", "bg-status-grey-tint"],
    ["bg-slate-400", "bg-status-grey-dot"],
    ["bg-orange-100", "bg-status-orange-tint"],
    // De randparen lopen de andere kant op dan de inkt: licht in light, donker in dark.
    ["bg-sky-300", "bg-status-blue-border"],
    ["bg-amber-300", "bg-status-amber-border"],
  ] as const;

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") document.documentElement.classList.add("dark");
    // De dark-tegenhangers zijn andere shades, dus de paren wisselen mee.
    const pairs =
      theme === "light"
        ? PAIRS
        : ([
            ["bg-emerald-950", "bg-status-green-tint"],
            ["bg-amber-950", "bg-status-amber-tint"],
            ["bg-sky-950", "bg-status-blue-tint"],
            ["bg-rose-950", "bg-status-red-tint"],
            ["bg-violet-950", "bg-status-purple-tint"],
            ["bg-slate-800", "bg-status-grey-tint"],
            ["bg-orange-950", "bg-status-orange-tint"],
            ["bg-sky-800", "bg-status-blue-border"],
            ["bg-amber-900", "bg-status-amber-border"],
          ] as const);

    await renderServer(
      <div>
        <h1 className="sr-only">{`Specimen — tokenpariteit ${theme}`}</h1>
        {pairs.map(([oud, nieuw]) => (
          <div key={oud}>
            <span data-testid={`oud-${oud}`} className={oud}>
              x
            </span>
            <span data-testid={`nieuw-${oud}`} className={nieuw}>
              x
            </span>
          </div>
        ))}
      </div>,
    );
    await expect
      .element(
        page.getByRole("heading", { level: 1, name: `Specimen — tokenpariteit ${theme}` }),
      )
      .toBeInTheDocument();

    for (const [oud] of pairs) {
      const a = document.querySelector<HTMLElement>(`[data-testid="oud-${oud}"]`)!;
      const b = document.querySelector<HTMLElement>(`[data-testid="nieuw-${oud}"]`)!;
      expect(
        getComputedStyle(b).backgroundColor,
        `${oud} (${theme}) is niet meer dezelfde kleur als zijn token`,
      ).toBe(getComputedStyle(a).backgroundColor);
    }
    document.documentElement.classList.remove("dark");
  }
});

test("de statuskleuren zijn geen kit-kleuren, en dat is expliciet", async () => {
  // Vangnet tegen een goedbedoelde "opruimactie": iemand die de statustokens naar
  // het kit-palet trekt. Dat kan niet zonder afgeleide kleuren (kit-blauw haalt op
  // de navy kaart 2,09:1) én het maakt de geprinte statuswoorden onwaar — "Yellow"
  // zou oranje worden. Zie DESIGN.md O13.
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  const kitColours = ["#1ba89a", "#ff9500", "#d84c4c", "#8e9ba8", "#2d5a8c"];
  for (const token of Object.keys(STATUS_TOKENS_LIGHT)) {
    expect(
      kitColours,
      `${token} staat op een kit-kleur — dat is een besluit voor Eduard, niet voor een commit`,
    ).not.toContain(root.getPropertyValue(token).trim().toLowerCase());
  }
});

test("de tokens landen ook echt op de elementen, niet alleen op :root", async () => {
  // Tokenwaarden kloppen niet automatisch met wat je ziet: er kan een variant of
  // een hardgecodeerde klasse tussen zitten. Daarom de computed kleur op het vlak
  // zelf, licht én donker.
  await render(surfaces, "Specimen — vlakken");
  const sheetLight = document.querySelector<HTMLElement>(".bg-background");
  const cardLight = document.querySelector<HTMLElement>('[data-slot="card"]');
  expect(getComputedStyle(sheetLight!).backgroundColor).toBe("rgb(255, 255, 255)");
  expect(getComputedStyle(cardLight!).backgroundColor).toBe("rgb(255, 255, 255)");

  document.documentElement.classList.add("dark");
  await render(surfaces, "Specimen — vlakken");
  const sheetDark = document.querySelector<HTMLElement>(".bg-background");
  const cardDark = document.querySelector<HTMLElement>('[data-slot="card"]');
  // #0F1626 en #1A1F3A uit kit §14.
  expect(getComputedStyle(sheetDark!).backgroundColor).toBe("rgb(15, 22, 38)");
  expect(getComputedStyle(cardDark!).backgroundColor).toBe("rgb(26, 31, 58)");
});

test("radius-schaal levert exact de kit-waarden 4/6/8px", async () => {
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  // rounded-lg moet 6px worden (knop, input, KPI) en rounded-xl 8px (kaart,
  // dialog) zonder dat er één component voor radius is aangepast.
  expect(root.getPropertyValue("--radius").trim()).toBe("0.375rem");
  expect(root.getPropertyValue("--radius-sm").trim()).toBe("0.25rem");
  expect(root.getPropertyValue("--radius-md").trim()).toBe("0.375rem");
  expect(root.getPropertyValue("--radius-xl").trim()).toBe("0.5rem");

  const card = document.querySelector('[data-slot="card"]');
  const input = document.querySelector('[data-slot="input"]');
  if (input) expect(getComputedStyle(input).borderRadius).toBe("6px");
  if (card) expect(getComputedStyle(card).borderRadius).toBe("8px");
});

// ── Geometrie (stap 2) ──────────────────────────────────────────────────────

test("knop en invoerveld halen de kit-maten: 44px hoog, radius 6px", async () => {
  await render(controls, "Specimen — bediening");
  const button = document.querySelector<HTMLElement>(
    '[data-slot="button"][data-size="default"]',
  );
  const input = document.querySelector<HTMLElement>('[data-slot="input"]');
  const buttonStyle = getComputedStyle(button!);
  const inputStyle = getComputedStyle(input!);

  expect(buttonStyle.height, "knophoogte kit §7").toBe("44px");
  expect(inputStyle.height, "veldhoogte kit §7").toBe("44px");
  expect(buttonStyle.borderRadius, "knopradius kit §7").toBe("6px");
  expect(inputStyle.borderRadius, "veldradius kit §7").toBe("6px");
  expect(buttonStyle.fontSize, "knoptekst kit §7 (15px)").toBe("15px");
  expect(buttonStyle.fontWeight, "knoptekst kit §7 (600)").toBe("600");
});

test("de compacte knopmaten blijven bewust onder 44px (O9)", async () => {
  // Dit is een vastgelegde afwijking van kit §7, geen vergissing: 56 plekken in
  // dense tabellen en toolbars. Deze test bestaat om te voorkomen dat iemand ze
  // later "corrigeert" naar 44px.
  await render(controls, "Specimen — bediening");
  for (const size of ["xs", "sm", "icon-xs", "icon-sm"] as const) {
    const el = document.querySelector<HTMLElement>(
      `[data-slot="button"][data-size="${size}"]`,
    );
    const height = Number.parseFloat(getComputedStyle(el!).height);
    expect(height, `maat ${size} hoort compact te blijven`).toBeLessThan(44);
  }
});

test("het invoerveld heeft een grijs vlak dat bij focus wit wordt", async () => {
  await render(controls, "Specimen — bediening");
  const input = document.querySelector<HTMLElement>('[data-slot="input"]');
  // Kit §7: veld #F5F7FA, bij focus #FFFFFF.
  expect(getComputedStyle(input!).backgroundColor).toBe("rgb(245, 247, 250)");
  input!.focus();
  expect(document.activeElement).toBe(input);
  // :focus-visible wordt pas in het volgende frame doorgerekend.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await expect
    .poll(() => getComputedStyle(input!).backgroundColor)
    .toBe("rgb(255, 255, 255)");
});

test("het logo-palet zit niet in de interface-tokens", async () => {
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  // Violet/magenta horen bij het logo, niet bij de UI (DESIGN.md §1). Als ze hier
  // opduiken, is het logo-palet de interface in gesijpeld.
  const logoColours = ["#7c5cff", "#ec5cd6", "#7321d6"];
  // Ook over de statustokens: --status-purple-* is violet-500 (oklch 292,7°) en NIET
  // het logo-violet #7C5CFF. Deze guard is precies de plek om dat vast te leggen.
  for (const token of [
    ...Object.keys(LIGHT_TOKENS),
    ...Object.keys(STATUS_TOKENS_LIGHT),
  ]) {
    expect(
      logoColours,
      `logo-kleur in ${token} — hoort alleen in de logobestanden`,
    ).not.toContain(root.getPropertyValue(token).trim().toLowerCase());
  }
});
