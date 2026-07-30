// White-box RSC-render/screenshottests van de review-wachtrij met fixture-data
// (klein, deterministisch). Licht/donker × mobiel/desktop, plus expliciete asserts op
// alle kaarttypes (stap 7): geel-kaart, "welke van deze N"-kaart, variantkaart met
// échte catalogus-kleuren, variant-fallback (kandidatenlijst — nooit verzonnen
// kleuren) en de rood-sectie "Not found — link manually" met zoekveld,
// resultaten en link-knop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { ReviewQueue } from "./review-queue";
import type { RedLinkLine, ReviewItem } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const pending: ReviewItem[] = [
  // Geel met één schone kandidaat → gewone geel-kaart (accepteer/afwijs).
  {
    id: "s1",
    fixtureCode: "Lp301",
    brandText: "XAL",
    productText: "SASSO 100",
    status: "geel",
    reviewKind: "geel",
    deviations: [
      {
        field: "Kelvin",
        requested: 2700,
        delivered: 3000,
        verdict: "geel",
        note: "300K koeler dan gevraagd",
      },
    ],
    candidates: [
      {
        productId: "p1",
        name: "SASSO 100 SQ SP CEIL 3000K",
        brandName: "XAL",
        articleCode: "L360-SASSO100",
        list: "aantoonbaar",
        deviations: [
          { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "gevraagd 2700, geleverd 3000" },
        ],
      },
    ],
    reqColor: null,
  },
  // Geel met ≥2 schone kandidaten → "welke van deze N"-kaart met keuzeknoppen.
  {
    id: "s2",
    fixtureCode: "Lk410",
    brandText: "XAL",
    productText: "VELA ROUND",
    status: "geel",
    reviewKind: "geel",
    deviations: [
      { field: "watt", requested: 12, delivered: 14, verdict: "geel", note: "gevraagd 12, geleverd 14" },
    ],
    candidates: [
      {
        productId: "p2",
        name: "VELA ROUND 600",
        brandName: "XAL",
        articleCode: "L450-VELA600",
        list: "aantoonbaar",
        deviations: [
          { field: "watt", requested: 12, delivered: 14, verdict: "geel", note: "gevraagd 12, geleverd 14" },
        ],
      },
      {
        productId: "p3",
        name: "VELA ROUND 900",
        brandName: "XAL",
        articleCode: "L450-VELA900",
        list: "aantoonbaar",
        deviations: [
          { field: "watt", requested: 12, delivered: 16, verdict: "geel", note: "gevraagd 12, geleverd 16" },
        ],
      },
      {
        productId: "p4",
        name: "VELA ROUND 1200",
        brandName: "XAL",
        articleCode: "L450-VELA1200",
        list: "onvolledig", // niet schoon → telt niet mee voor de N-keuze-drempel
        deviations: [
          { field: "watt", requested: 12, delivered: null, verdict: "onbekend", note: "geen data voor watt" },
        ],
      },
    ],
    reqColor: null,
  },
  // Variantkeuze met échte kleurvarianten uit de catalogus.
  {
    id: "s3",
    fixtureCode: "Lw201",
    brandText: "Marset",
    productText: "DISCOCO 53",
    status: "groen",
    reviewKind: "variant",
    deviations: null,
    reqColor: "zwart",
    variants: [
      { productId: "v1", color: "white", name: "DISCOCO 53 WHITE" },
      { productId: "v2", color: "black/gold", name: "DISCOCO 53 BLACK/GOLD" },
    ],
    candidates: [],
  },
  // Variantkeuze zónder gevonden varianten → fallback op de kandidatenlijst.
  {
    id: "s4",
    fixtureCode: "Ls001",
    brandText: "TAL",
    productText: "TAGLIO CORNER",
    status: "groen",
    reviewKind: "variant",
    deviations: null,
    reqColor: "wit",
    variants: [],
    candidates: [
      {
        productId: "p5",
        name: "TAGLIO CORNER",
        brandName: "TAL",
        articleCode: "T-TAGLIO",
        list: "aantoonbaar",
        deviations: [],
      },
    ],
  },
];

// OCR-controle (bouwstap 7/8): een regel uit een beeld-PDF mét herkomst — de kaart
// toont het paginanummer en linkt naar het opgeslagen paginabeeld (de échte bron, B6),
// plus de ruwe tabelregel zoals de import hem las (UX-audit 30 jul).
const ocrItem: ReviewItem = {
  id: "s5",
  fixtureCode: "Ld105",
  brandText: "XAL",
  productText: "UNICO Q4 2700K",
  status: "groen",
  reviewKind: "ocr",
  deviations: null,
  reqColor: null,
  sourcePage: 14,
  importRunId: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
  hasPageImage: true,
  sourceText: "Ld105  XAL  UNICO Q4 2700K  IP20  9W  650lm  36°  wit",
};

// Zelfde run, andere pagina — en van DIE pagina staat geen beeld in ocr_page_images
// (vision-fout/budgetstop halen de beeldrij weer weg, dus een run kan een deel van
// zijn pagina's in beeld hebben). De run-brede vlag liet hier tóch de beeldlink
// renderen → kale 404 (UX-audit 30 jul, bug #2). Verwacht: de tekstlink.
// De brontekst is hier bewust een ECHTE boekregel-lengte (~350 tekens, zoals een
// detailpagina in het Deerns-boek): zo laat de screenshot op 375px zien dat het
// citaat in rust twee regels blijft en uitklapbaar is (reviewronde 2, 30 jul).
const ocrItemZonderBeeld: ReviewItem = {
  ...ocrItem,
  id: "s6",
  fixtureCode: "Ld106",
  sourcePage: 15,
  hasPageImage: false,
  sourceText:
    "Ld106  XAL  UNICO Q4 3000K  IP20  9W  650lm  36°  zwart  " +
    "inbouwspot vierkant 68x68 mm inbouwdiepte 95 mm  driver extern DALI dimbaar  " +
    "CRI ≥ 90  MacAdam step 3  behuizing aluminium gepoedercoat  " +
    "levensduur L80B10 50.000 h  bestelnummer 1234-5678-90  positie plafond gang 1.04",
};

// Aanroeper die de vlag niet meestuurt (fixture/oudere code). Er is dan geen bewijs
// dát het paginabeeld bestaat, dus de kaart valt terug op de tekstlink — nooit op een
// mogelijke 404 (reviewronde 2, 30 jul: de "onbekend → tóch de beeldlink"-tak is weg).
const ocrItemZonderVlag: ReviewItem = {
  ...ocrItem,
  id: "s7",
  fixtureCode: "Ld107",
  sourcePage: 16,
  hasPageImage: undefined,
  sourceText: "Ld107  XAL  UNICO Q4 4000K  IP44  12W  900lm  60°  wit",
};

const done: ReviewItem[] = [
  {
    id: "s9",
    fixtureCode: "Ld202",
    brandText: "Kreon",
    productText: "Holon 80",
    status: "groen",
    reviewKind: "geel",
    deviations: null,
    reqColor: null,
    reviewedAt: "14-07-2026",
    reviewedBy: "eduard@brinklicht.nl",
    reviewDecision: "accepteer",
  },
];

// Rood zonder match: één kaart waar al gezocht is (resultaten + link-knoppen), één
// kaart in ruststand (alleen het zoekveld — het systeem suggereert niets).
const rood: RedLinkLine[] = [
  {
    id: "r1",
    fixtureCode: "Lr701",
    brandText: "Flos",
    productText: "ORIONNOVA QX5 SPECIAL",
    noMatchReason: "merk in catalogus, maar geen passend product gevonden",
    searchQuery: "bellhop",
    results: [
      {
        id: "q1",
        name: "Bellhop Glass C2",
        brandName: "Flos",
        articleCode: "F-BELL-C2",
        grossPrice: "185.00",
      },
      {
        id: "q2",
        name: "Bellhop Wall",
        brandName: "Flos",
        articleCode: "F-BELL-W",
        grossPrice: "240.00",
      },
    ],
  },
  {
    id: "r2",
    fixtureCode: "Lp601",
    brandText: "XAL",
    productText: "PHANTOMDELUXE ZX9000",
    noMatchReason: null,
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Twee screenshot-sets (de pagina is langer dan het viewport): de geel/N-keuze-kant
// en de variant/rood-kant — zo staan álle kaarttypes op beeld.
const shots = {
  "review-queue": (
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={pending.slice(0, 2)} // geel-kaart + "welke van deze N"-kaart
        done={done}
        decideAction={noopAction}
        linkAction={noopAction}
      />
    </Screen>
  ),
  "review-variant-rood": (
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={pending.slice(2)} // variantkaart (echte kleuren) + variant-fallback
        done={[]}
        rood={rood} // rood-kaart met zoekveld + resultaten + link-knop
        decideAction={noopAction}
        linkAction={noopAction}
      />
    </Screen>
  ),
  "review-ocr": (
    <Screen>
      <ReviewQueue
        dossierId="d1"
        // Drie OcrCards: mét paginabeeld ("View page image"), zonder beeld van die
        // pagina (lange brontekst, clamp + "show all") en zonder vlag — alle drie
        // met hun ruwe brontekst.
        pending={[ocrItem, ocrItemZonderBeeld, ocrItemZonderVlag]}
        done={[]}
        decideAction={noopAction}
        linkAction={noopAction}
      />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(shots)) {
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

test("review-queue toont alle kaarttypes met hun beslis-acties", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={pending}
        done={done}
        rood={rood}
        decideAction={noopAction}
        linkAction={noopAction}
      />
    </Screen>,
  );
  // Titel telt wachtend (pending + rood-linken) en afgerond.
  await expect
    .element(page.getByText(/6 pending, 1 done/))
    .toBeInTheDocument();

  // Geel-kaart én N-keuze-kaart dragen accepteer + afwijzen (met required redenveld).
  expect(
    page.getByRole("button", { name: /Accept as proposal/ }).elements().length,
  ).toBe(2);
  expect(page.getByRole("button", { name: /Reject/ }).elements().length).toBe(2);
  await expect
    .element(page.getByText(/Reason \(required/).first())
    .toBeInTheDocument();

  // N-keuze: alleen de schone kandidaten als keuzeknop (2), plus de variant-fallback (1).
  await expect
    .element(page.getByText(/2 matching candidates — which should it be/))
    .toBeInTheDocument();
  expect(page.getByRole("button", { name: /Choose this/ }).elements().length).toBe(3);
  await expect.element(page.getByText("VELA ROUND 900")).toBeInTheDocument();

  // Variantkaart: échte catalogus-kleuren als knop — geen verzonnen standaardlijst.
  await expect
    .element(page.getByRole("button", { name: /black\/gold/ }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: /white/ }))
    .toBeInTheDocument();
  expect(page.getByText("aluminium").query()).toBeNull(); // oude STANDARD_FINISHES weg

  // Variant-fallback benoemt de fallback expliciet.
  await expect
    .element(page.getByText(/No color variants of this product/))
    .toBeInTheDocument();

  // Rood-sectie: eigen kop, zoekveld en link-knoppen bij de gevonden resultaten.
  await expect
    .element(page.getByText(/Not found — link manually \(2\)/))
    .toBeInTheDocument();
  await expect
    .element(
      page.getByRole("textbox", {
        name: /Search comparable product for Lr701/,
      }),
    )
    .toBeInTheDocument();
  expect(
    page.getByRole("button", { name: /Link this product/ }).elements().length,
  ).toBe(2);
  // het systeem doet hier no suggestions — dat staat er letterlijk bij
  await expect
    .element(page.getByText(/deliberately makes\s+no suggestions/))
    .toBeInTheDocument();

  // Afgerond item draagt het audit-spoor mét de nieuwe uitkomst-taal.
  await expect
    .element(page.getByText(/accepted → green/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/eduard@brinklicht\.nl/))
    .toBeInTheDocument();
});

// OcrCard (bouwstap 7/8): paginanummer + link naar het opgeslagen paginabeeld in een
// nieuw tabblad — de href draagt exact /projects/<id>/ocr-image/<runId>/<page>.
test("ocr-kaart toont paginanummer en linkt naar het paginabeeld", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[ocrItem]}
        done={[]}
        decideAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/OCR import can misread characters/))
    .toBeInTheDocument();
  await expect.element(page.getByText(/Read from page/)).toBeInTheDocument();

  const link = page.getByRole("link", { name: /View page image/ });
  await expect.element(link).toBeInTheDocument();
  const el = link.element() as HTMLAnchorElement;
  expect(el.getAttribute("href")).toBe(
    `/projects/d1/ocr-image/${ocrItem.importRunId}/14`,
  );
  expect(el.getAttribute("target")).toBe("_blank"); // boek náást de review

  // De kaart toont de ruwe tabelregel: zonder dat citaat is "is de lezing correct?"
  // een vraag zonder materiaal (UX-audit 30 jul).
  await expect
    .element(page.getByText(/UNICO Q4 2700K\s+IP20\s+9W/))
    .toBeInTheDocument();

  // De bevestig-actie blijft de bestaande 'gecontroleerd'-knop.
  await expect
    .element(page.getByRole("button", { name: /Checked/ }))
    .toBeInTheDocument();
});

// Bug #2 (UX-audit 30 jul): dezelfde run, een pagina zónder beeldrij. De vlag is nu
// per pagina, dus deze kaart mag GEEN beeldlink dragen — die gaf een kale 404 —
// maar de bestaande tekst-fallback naar het markdown-controlespoor van de run.
test("ocr-kaart zonder beeld van díe pagina linkt naar de brontekst, niet naar het beeld", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[ocrItemZonderBeeld]}
        done={[]}
        decideAction={noopAction}
      />
    </Screen>,
  );
  expect(page.getByRole("link", { name: /View page image/ }).query()).toBeNull();

  const link = page.getByRole("link", { name: /View source text/ });
  await expect.element(link).toBeInTheDocument();
  const el = link.element() as HTMLAnchorElement;
  expect(el.getAttribute("href")).toBe(
    `/projects/d1/import/${ocrItemZonderBeeld.importRunId}`,
  );
  expect(el.getAttribute("target")).toBe("_blank");

  // Paginanummer én brontekst blijven staan — de reviewer weet waar het vandaan komt.
  await expect.element(page.getByText(/Read from page/)).toBeInTheDocument();
  await expect
    .element(page.getByText(/UNICO Q4 3000K\s+IP20\s+9W/))
    .toBeInTheDocument();
});

// Reviewronde 2 (30 jul): de "onbekend → tóch de beeldlink"-tak was gedocumenteerd maar
// ongetest, en was de énige tak die nog een kale 404 kón opleveren. Hij is weg: zonder
// bewijs dat het beeld bestaat linkt de kaart naar de brontekst.
test("ocr-kaart zonder hasPageImage-vlag linkt naar de brontekst, niet naar het beeld", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[ocrItemZonderVlag]}
        done={[]}
        decideAction={noopAction}
      />
    </Screen>,
  );
  expect(page.getByRole("link", { name: /View page image/ }).query()).toBeNull();
  await expect
    .element(page.getByRole("link", { name: /View source text/ }))
    .toBeInTheDocument();
});

// F4 (reviewronde 2, 30 jul): de kaart beweerde "volledige tekst in de title", maar die
// title droeg dezelfde al op 240 tekens gekapte string — dubbel afgekapt, en op 375px
// (geen hover) helemaal onbereikbaar. Nu: de héle regel staat één keer in de DOM,
// zichtbaar op twee regels, en uitklappen haalt de clamp weg.
test("brontekst: hele regel in de DOM, uitklappen haalt de afkapping weg", async () => {
  await page.viewport(375, 812); // de telefoon waar geen hover bestaat
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[ocrItemZonderBeeld]}
        done={[]}
        decideAction={noopAction}
      />
    </Screen>,
  );
  const quote = page.getByText(/bestelnummer 1234-5678-90/);
  await expect.element(quote).toBeInTheDocument();
  const el = quote.element() as HTMLElement;
  // Geen afgekapte kopie: de tekst in de DOM is exact de meegegeven brontekst, en
  // er staat géén title-attribuut meer dat "de rest" belooft.
  expect(el.textContent).toBe(ocrItemZonderBeeld.sourceText);
  expect(el.closest("[title]")).toBeNull();

  // In rust twee regels: er valt méér tekst binnen dan er te zien is, en de kaart
  // biedt de uitklap-affordance aan.
  const details = el.closest("details") as HTMLDetailsElement;
  const showAll = page.getByText("show all", { exact: true }).element();
  const showLess = page.getByText("show less", { exact: true }).element();
  expect(details.open).toBe(false);
  expect(el.scrollHeight).toBeGreaterThan(el.clientHeight);
  expect(getComputedStyle(showAll).display).not.toBe("none");
  expect(getComputedStyle(showLess).display).toBe("none");

  // Uitgeklapt staat de hele regel er — de clamp is weg (geen overloop meer).
  details.open = true;
  expect(el.scrollHeight).toBe(el.clientHeight);
  expect(getComputedStyle(showAll).display).toBe("none");
  expect(getComputedStyle(showLess).display).not.toBe("none");
});

test("review-queue lege staat", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue dossierId="d1" pending={[]} done={[]} decideAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Nothing to review/))
    .toBeInTheDocument();
});
