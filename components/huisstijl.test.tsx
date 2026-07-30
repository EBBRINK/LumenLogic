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
  for (const token of Object.keys(LIGHT_TOKENS)) {
    expect(
      logoColours,
      `logo-kleur in ${token} — hoort alleen in de logobestanden`,
    ).not.toContain(root.getPropertyValue(token).trim().toLowerCase());
  }
});
