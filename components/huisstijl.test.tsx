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

test("specimen hangt aan de tokenlaag, niet aan losse kleuren", async () => {
  await render(controls, "Specimen — bediening");
  const root = getComputedStyle(document.documentElement);
  // Deze tokens moeten bestaan; hun wáárden worden in stap 1 vastgelegd.
  for (const token of [
    "--background",
    "--foreground",
    "--primary",
    "--muted-foreground",
    "--border",
    "--input",
    "--ring",
    "--radius",
  ]) {
    expect(
      root.getPropertyValue(token).trim(),
      `token ${token} is niet gedefinieerd`,
    ).not.toBe("");
  }
});
