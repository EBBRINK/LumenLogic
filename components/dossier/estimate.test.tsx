// White-box RSC-tests van de estimate-tab (§3.8). Fixture-gedreven, klein en
// deterministisch. Kernchecks (ijzeren regels): groen/geel/samen kloppen, blauw/rood/
// paars/open staan als p.m. en tellen NOOIT mee in het totaal, een regel zonder aantal
// wordt p/st, en de aanvraag-/zonevolgorde blijft intact. Plus licht/donker ×
// mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Button } from "@/components/ui/button";
import { noopAction } from "@/lib/test-actions";
import { NUMBER_PENDING } from "@/lib/repo/estimate";
import { QuoteView } from "./quote-view";
import type { EstimateHeader, EstimateLine } from "./quote-view";
import { PrintButton, XisPushDialog } from "./xis-push-dialog";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const header: EstimateHeader = {
  quoteNumber: null, // nog niet gegenereerd → NUMBER_PENDING in het nummerveld
  quoteDate: "2026-07-07",
  customer: "Deerns",
  projectRef: "PRJ-42",
  author: "tester@voorbeeld.nl",
  validUntil: "2026-08-07",
};

// Gegroepeerd per zone, álle zes de statussen (inclusief open — de normale stand van
// een verse import), één groene regel zónder aantal, en twee regels met een VERLOPEN
// dagprijs (A7): één die op de catalogusprijs terugvalt en één die dat niet kan.
const zonedLines: EstimateLine[] = [
  // Zone A-08
  {
    id: "l1", fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12,
    productName: "SASSO 100 SQ SP CEIL 2700K", sku: "L360-SASSO100",
    unitPrice: "310.00", brandText: "XAL", productText: "SASSO 100",
  },
  {
    id: "l2", fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8,
    productName: "SCAVA WALL SURF 1.0 3000K", sku: "L092-SCAVA",
    unitPrice: "226.00", brandText: "Wever & Ducré", productText: "SCAVA 1.0",
    deviations: [
      { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
    ],
  },
  {
    id: "l3", fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5,
    productName: null, sku: null, unitPrice: null, brandText: "Kreon", productText: "Prologe 80",
  },
  // Zone B-02
  {
    id: "l4", fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3,
    productName: null, sku: null, unitPrice: null, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)",
  },
  {
    // paars mét prijs én aantal → zou 2×500=1000 zijn als het (fout) mee zou tellen.
    id: "l5", fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2,
    productName: "Wandcontactdoos wit", sku: "WCD-01", unitPrice: "500.00",
    brandText: null, productText: "WCD",
  },
  {
    // groene regel zónder aantal → p/st i.p.v. regeltotaal, telt niet mee.
    id: "l6", fixtureCode: "Lp302", zone: "B-02", status: "groen", quantity: null,
    productName: "SASSO 60 2700K", sku: "L360-SASSO60", unitPrice: "100.00",
    brandText: "XAL", productText: "SASSO 60",
  },
  {
    // open = nog niet gematcht, de normale stand na een import. Krijgt "p.m." in de
    // regeltotaalkolom en moet dus óók in de verantwoording en in de open-punten
    // staan — dat deed hij niet (A4).
    id: "l7", fixtureCode: "Lo400", zone: "B-02", status: "open", quantity: 4,
    productName: null, sku: null, unitPrice: null,
    brandText: "Modular", productText: "Smart Tubed 82",
  },
  {
    // A7: de dagprijs op deze regel is verlopen, dus de stukprijs is de CATALOGUSprijs
    // (120) en er hoort een merkteken bij dat dat zegt. 3×120 = 360 telt gewoon mee.
    id: "l8", fixtureCode: "Lv700", zone: "B-02", status: "groen", quantity: 3,
    productName: "SPLITBOX 3 TRIMLESS 2700K", sku: "L210-SPLITBOX",
    unitPrice: "120.00", brandText: "Delta Light", productText: "SPLITBOX 3",
    dayPriceExpiredOn: "2020-06-30",
  },
  {
    // A7, het eerlijke gat: dagprijs verlopen én geen catalogusprijs om op terug te
    // vallen (het product zat in een prijslijst die óók verliep — ijzeren regel 3, dus
    // het valt uit visible_products). Regeltotaal "—", en het merkteken legt uit waarom
    // daar geen bedrag staat. Nooit stilzwijgend leeg.
    id: "l9", fixtureCode: "Ld800", zone: "B-02", status: "groen", quantity: 4,
    productName: null, sku: null, unitPrice: null,
    brandText: "Delta Light", productText: "SPLITBOX 1",
    dayPriceExpiredOn: "2020-06-30",
  },
];

// Zonder zones → één lijst.
const flatLines: EstimateLine[] = [
  {
    id: "f1", fixtureCode: "A1", zone: null, status: "groen", quantity: 10,
    productName: "Prod A", sku: "SKU-A", unitPrice: "50.00", brandText: "XAL", productText: "A",
  },
  {
    id: "f2", fixtureCode: "A2", zone: null, status: "geel", quantity: 4,
    productName: "Prod B", sku: "SKU-B", unitPrice: "25.00", brandText: "XAL", productText: "B",
  },
  {
    id: "f3", fixtureCode: "A3", zone: null, status: "blauw", quantity: 2,
    productName: null, sku: null, unitPrice: null, brandText: "Kreon", productText: "C",
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

const screens = {
  "estimate-zones": (
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={header}
        lines={zonedLines}
        actions={
          <button type="button" className="rounded border px-2 py-1 text-sm">
            Print / PDF
          </button>
        }
      />
    </Screen>
  ),
  "estimate-flat": (
    <Screen>
      <QuoteView
        dossierName="Kantoor Zuid"
        phase="awarded"
        header={{ ...header, quoteNumber: "BL-2026-0042" }}
        lines={flatLines}
      />
    </Screen>
  ),
  // Actiebalk zoals de offerte-pagina hem samenstelt (zelfde opbouw als
  // app/projects/[id]/quote/page.tsx): ververs-knop, printknop en de
  // downloadknop "Download PDF" die naar de PDF-route wijst.
  "estimate-downloadknop": (
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={header}
        lines={zonedLines}
        actions={
          <>
            <form action={noopAction}>
              <Button type="submit" variant="secondary" size="sm">
                Ververs estimate
              </Button>
            </form>
            <PrintButton />
            <Button asChild variant="outline" size="sm">
              <a href="/projects/d1/quote/pdf" download>
                Download PDF
              </a>
            </Button>
          </>
        }
      />
    </Screen>
  ),
  // UX-audit bug #6: kop zonder datum/geldigheid. Zo stelt de offerte-pagina de
  // actiebalk dan samen — alléén "Generate estimate"; Print, Download PDF en → To XIS
  // zijn afwezig, niet uitgegrijsd.
  "estimate-kop-incompleet": (
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={{ ...header, quoteDate: null, validUntil: null }}
        lines={zonedLines}
        actions={
          <form action={noopAction}>
            <Button type="submit" variant="secondary" size="sm">
              Generate estimate
            </Button>
          </form>
        }
      />
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
        // Twee asserties met elk een eigen taak; ze vervangen elkaar niet.
        //
        // 1. INHOUD (reviewzwerm 2.5a, B11): een SKU uit de regels van QuoteView zelf,
        //    niet uit de <Screen>-wrapper. `expect.element(document.body)` bleef groen
        //    bij een lege render, en dat was de hele bevinding.
        await expect
          .element(
            page.getByText(name === "estimate-flat" ? "SKU-B" : "L360-SASSO100").first(),
          )
          .toBeInTheDocument();
        // 2. VOLLEDIGHEID (A4/A7): wachten tot de STAART van het document er is. De
        //    RSC-stream levert dit stuk in delen en de voettekst is het laatste
        //    element, dus die is het startsein voor de schoten — inclusief het tweede
        //    schot onder de vouw hieronder. Een SKU staat bovenaan en bewijst dus niet
        //    dat de p.m.-verantwoording al geflusht is.
        await expect
          .element(page.getByText(/Request order is preserved/).first())
          .toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
        // Chromium schiet alleen wat in beeld staat: alles onder de vouw komt blanco
        // uit de capture. De p.m.-verantwoording en "Open items & actions" staan
        // juist onderaan, dus daar hoort een tweede schot bij — anders bewijst deze
        // test niets over precies het blok dat het klantstuk verantwoordt.
        if (document.body.scrollHeight > viewport.height) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((r) => setTimeout(r, 60));
          await page.screenshot({ path: `./${name}.${theme}.${device}.onderkant.test.png` });
        }
      });
    }
  }
}

// ── Functionele checks (kern) ────────────────────────────────────────────────
test("totalen: groen + geel apart, samen = groen + geel", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  // groen 12×310 + 3×120 (Lv700, A7: catalogus want de dagprijs verliep) = 4.080,00 ;
  // geel 8×226 = 1.808,00 ; samen = 5.888,00. Vóór A7 stond hier groen 3.720,00 en
  // samen 5.528,00 — de A7-regels zijn erbij gekomen, niet veranderd.
  await expect.element(page.getByText(/4\.080,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/1\.808,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/5\.888,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText("Combined (green + yellow)")).toBeInTheDocument();
});

test("blauw/rood/paars/open: p.m., NOOIT in het totaal opgeteld", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("p.m.").first()).toBeInTheDocument();
  // paars (2×500) mag NERGENS als regeltotaal (1.000,00) verschijnen…
  expect(page.getByText(/1\.000,00/).query()).toBeNull();
  // …en het samen-totaal blijft 5.888,00, niet 6.888,00 (5888 + paars 1000).
  expect(page.getByText(/6\.888,00/).query()).toBeNull();
  // de niet-opgeteld-regel benoemt de aantallen expliciet — élke niet-tellende status,
  // dus ook open. Stond open er niet bij, dan kreeg de klant "p.m." naast een regel die
  // in geen enkel getal terugkwam (A4).
  await expect.element(page.getByText(/blue 1/)).toBeInTheDocument();
  await expect.element(page.getByText(/red 1/)).toBeInTheDocument();
  await expect.element(page.getByText(/purple 1/)).toBeInTheDocument();
  await expect.element(page.getByText(/open 1/)).toBeInTheDocument();
  // Eén regel, alle vier de statussen — precies zoals hij op de PDF staat.
  await expect
    .element(page.getByText(/Shown, not totaled \(blue 1 · red 1 · purple 1 · open 1\)/))
    .toBeInTheDocument();

  // De voettekst legt p.m. uit voor élke niet-tellende status (zelfde string als de PDF).
  const voettekst = (document.body.textContent ?? "").replace(/\s+/g, " ");
  expect(voettekst).toContain(
    "blue, red, purple and open are shown as p.m. — displayed, not totaled",
  );
});

test("regel zonder aantal → p/st i.p.v. regeltotaal", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("ea.")).toBeInTheDocument();
});

test("zones: gegroepeerd met zone-koppen, aanvraagvolgorde behouden", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("Zone A-08")).toBeInTheDocument();
  await expect.element(page.getByText("Zone B-02")).toBeInTheDocument();
});

// Élke p.m.-status krijgt een punt in deze lijst — anders staat er "p.m." naast een
// regel waar de klant nergens een uitleg bij vindt. Paars en open ontbraken hier (A4).
test("open punten & acties: blauw = inladen (ons), rood = terug naar klant, paars gemeld, open nog niet gematcht", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText(/load brand/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/back to\s+customer/)).toBeInTheDocument();
  await expect.element(page.getByText(/outside assortment/)).toBeInTheDocument();
  await expect.element(page.getByText(/not matched yet/)).toBeInTheDocument();
  // merken-inladen-lijst met frequentie (blauw-merk Kreon 1×).
  await expect.element(page.getByText(/Kreon — 1×/)).toBeInTheDocument();

  // Elke p.m.-regel uit de fixture staat er met zijn code: blauw, rood, paars, open.
  // `section > ul` = de p.m.-lijst zelf (de merken-inladen-lijst zit een div dieper).
  const lijst = document.querySelectorAll("section > ul > li");
  const codes = [...lijst].map((li) => li.textContent?.trim().split(" ")[0]);
  expect(codes).toEqual(["Lb110", "Lr050", "Lx900", "Lo400"]);
});

// A-09 blijft: er wordt geen nummer gereserveerd. UX-audit bug #6 zat in de WEERGAVE —
// `BL-2026-{nummer volgt}` is Nederlands mét accolades op een Engelstalig klantstuk dat
// letterlijk zo naar de printer en de PDF gaat, en leest als een onvervulde
// sjabloonvariabele.
test("kopblok: zonder offertenummer staat er een Engelse zin, geen sjabloonhaken", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText(NUMBER_PENDING)).toBeInTheDocument();
  const tekst = document.body.textContent ?? "";
  expect(tekst).not.toContain("nummer volgt");
  expect(tekst).not.toContain("{");
  // De zin moet kloppen met wat de software doet: nextQuoteNumber kent het nummer toe
  // bij GENEREREN en bewaart het (lib/repo/dossiers.ts). "on sending" was schoon
  // Engels én onwaar, op een document dat de klant leest.
  expect(tekst).not.toContain("on sending");
});

// ── Kopblokpoort (UX-audit bug #6) ───────────────────────────────────────────
//
// Print / Download PDF / → To XIS stonden live terwijl Date en Valid until op "—"
// stonden: een onvolledig klantstuk ging stilzwijgend naar de printer. De knoppen
// worden nu op de pagina weggelaten; QuoteView zégt waaróm, en die melding staat
// bewust NIET op print:hidden.
test("kop incompleet: melding noemt de ontbrekende velden en verwijst naar Edit header", async () => {
  await renderServer(
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={{ ...header, quoteDate: null, validUntil: null }}
        lines={zonedLines}
        headerEditable
      />
    </Screen>,
  );
  const melding = page.getByRole("status");
  await expect.element(melding).toBeInTheDocument();
  const tekst = melding.element().textContent ?? "";
  expect(tekst).toContain("Complete the quote header");
  expect(tekst).toContain("Date and Valid until");
  expect(tekst).toContain("Edit header");
  // De melding moet mee naar papier — dat is het hele punt.
  expect(melding.element().className).not.toContain("print:hidden");
});

// Herstel 2026-07-30. De melding stuurde je naar "Edit header" ook als dat blok er
// helemaal niet stond: vóór genereren rendert KopblokBewerken niets (er is nog geen
// offerte-rij). Een instructie die naar een onbestaande knop wijst is erger dan geen
// instructie — dan zoekt de gebruiker net zo lang tot hij denkt dat de app stuk is.
test("kop incompleet zónder bewerkbaar kopblok: de melding wijst naar Generate estimate, niet naar Edit header", async () => {
  await renderServer(
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={{ ...header, quoteDate: null, validUntil: null }}
        lines={zonedLines}
      />
    </Screen>,
  );
  const melding = page.getByRole("status");
  await expect.element(melding).toBeInTheDocument();
  const tekst = melding.element().textContent ?? "";
  expect(tekst).toContain("Generate estimate");
  expect(tekst).not.toContain("Edit header");
});

// Het tweede besluit: een BEVROREN offerte is het verstuurde document. Geen poort, dus
// ook geen banner die zegt dat het stuk niet geprint kan worden — de printknop staat er
// naast, en het kopblok is op slot (updateQuoteHeader weigert, "Edit header" is weg).
test("kop incompleet maar bevroren: geen melding — het stuk is al de deur uit", async () => {
  await renderServer(
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={{ ...header, quoteDate: null, validUntil: null }}
        lines={zonedLines}
        frozen
      />
    </Screen>,
  );
  // Eerst wachten tot er écht iets staat — anders is "geen banner" vacuüm waar zolang
  // de render nog niet geflusht is, en pint deze test niets.
  await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
  expect(page.getByRole("status").query()).toBeNull();
  expect(document.body.textContent ?? "").not.toContain("Complete the quote header");
});

test("kop incompleet met alleen een lege geldigheid: één veld genoemd, enkelvoud", async () => {
  await renderServer(
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={{ ...header, validUntil: null }}
        lines={zonedLines}
      />
    </Screen>,
  );
  const melding = page.getByRole("status");
  await expect.element(melding).toBeInTheDocument();
  const tekst = melding.element().textContent ?? "";
  expect(tekst).toContain("Valid until is still empty");
  expect(tekst).not.toContain("Date and");
});

// Negatieve controle: een complete kop mag geen waarschuwing tonen — anders staat er
// straks op élk klantstuk een blokje dat er niet hoort.
test("kop compleet: geen waarschuwing", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("Estimate").first()).toBeInTheDocument();
  expect(page.getByRole("status").query()).toBeNull();
  expect(document.body.textContent ?? "").not.toContain("Complete the quote header");
});

test("downloadknop staat naast de printknop en wijst naar de PDF-route", async () => {
  await renderServer(screens["estimate-downloadknop"]);
  const link = page.getByRole("link", { name: "Download PDF" });
  await expect.element(link).toBeInTheDocument();
  await expect.element(link).toHaveAttribute("href", "/projects/d1/quote/pdf");
  await expect.element(link).toHaveAttribute("download");
  await expect
    .element(page.getByRole("button", { name: "Print / PDF" }))
    .toBeInTheDocument();
});

test("zonder zones → één lijst, geen zone-koppen", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Kantoor Zuid" phase="awarded" header={header} lines={flatLines} />
    </Screen>,
  );
  // groen 10×50 = 500,00 ; geel 4×25 = 100,00 ; samen = 600,00
  await expect.element(page.getByText(/600,00/).first()).toBeInTheDocument();
  expect(page.getByText(/^Zone\b/).query()).toBeNull();
});

// B3: automatically accepted near-match → subtiel label bij de afwijkingsnotitie.
test("auto-door: label op de estimate-regel, alleen bij autoAccepted", async () => {
  const lines: EstimateLine[] = [
    {
      id: "a1", fixtureCode: "Lk410", zone: null, status: "geel", quantity: 6,
      productName: "VELA ROUND 600 opbouw 3000K", sku: "L450-VELA600",
      unitPrice: "412.00", brandText: "XAL", productText: "VELA ROUND",
      autoAccepted: true,
      deviations: [
        { field: "watt", requested: 12, delivered: 14, verdict: "geel", note: "requested 12, delivered 14" },
      ],
    },
    {
      // gewone gele regel zonder auto-door → géén label
      id: "a2", fixtureCode: "Lw201", zone: null, status: "geel", quantity: 8,
      productName: "SCAVA WALL SURF 1.0 3000K", sku: "L092-SCAVA",
      unitPrice: "226.00", brandText: "Wever & Ducré", productText: "SCAVA 1.0",
      deviations: [
        { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
      ],
    },
  ];
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={lines} />
    </Screen>,
  );
  const labels = page.getByText("automatically accepted near-match");
  await expect.element(labels).toBeInTheDocument();
  expect(labels.elements().length).toBe(1); // alléén de auto-regel draagt het label
  // de afwijkingsnotitie blijft er gewoon naast staan
  await expect.element(page.getByText(/requested 12, delivered 14/)).toBeInTheDocument();
});

// A7: verlopen dagprijs → merkteken op de estimate-regel. Dit is het scherm waar de
// calculator naar kijkt vóór hij op "Download PDF" drukt; stond hier niets, dan zag hij
// de € 199,00 van vier maanden geleden en had hij geen enkele reden om te twijfelen.
test("A7: verlopen dagprijs → merkteken op de regel, met de datum en wat er in plaats komt", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  // Lv700: er ís een catalogusprijs om op terug te vallen.
  await expect
    .element(page.getByText("day price expired 30 Jun 2020 — catalogue price used instead"))
    .toBeInTheDocument();
  // Ld800: die is er niet — dan geen prijs, en de zin zegt precies dát.
  await expect
    .element(page.getByText("day price expired 30 Jun 2020 — no catalogue price to fall back on"))
    .toBeInTheDocument();

  // De stukprijs die de klant leest is de catalogusprijs (120,00) en het regeltotaal
  // 3×120 = 360,00. Een regel zónder merkteken krijgt er ook geen.
  await expect.element(page.getByText(/120,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/360,00/).first()).toBeInTheDocument();
  expect(page.getByText(/day price expired/).elements().length).toBe(2);

  // Een gewone regel (Lp301, geen dagprijs) draagt geen merkteken — anders staat er
  // straks op élke regel een waarschuwing en betekent hij niets meer.
  const tekst = document.body.textContent ?? "";
  expect(tekst).toContain("Lp301");
  expect(tekst.match(/day price expired/g)).toHaveLength(2);
});

// Stap 7 (herontwerp 2026-07-14): een menskeuze uit de review (accepteer/N-keuze/
// variant/handmatige link) → merkteken "handmatig gekozen" op de estimate-regel.
test("review-keuze: merkteken 'handmatig gekozen' op de estimate-regel", async () => {
  const lines: EstimateLine[] = [
    {
      id: "m1", fixtureCode: "Lk410", zone: null, status: "groen", quantity: 6,
      productName: "VELA ROUND 600", sku: "L450-VELA600",
      unitPrice: "412.00", brandText: "XAL", productText: "VELA ROUND",
      manuallyChosen: true,
      deviations: [
        { field: "watt", requested: 12, delivered: 14, verdict: "geel", note: "requested 12, delivered 14" },
      ],
    },
    {
      // gewone groene regel zonder menskeuze → géén merkteken
      id: "m2", fixtureCode: "Lp301", zone: null, status: "groen", quantity: 12,
      productName: "SASSO 100 SQ SP CEIL 2700K", sku: "L360-SASSO100",
      unitPrice: "310.00", brandText: "XAL", productText: "SASSO 100",
    },
  ];
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={lines} />
    </Screen>,
  );
  const labels = page.getByText("manually chosen");
  await expect.element(labels).toBeInTheDocument();
  expect(labels.elements().length).toBe(1);
  // de geaccepteerde afwijking blijft als notitie zichtbaar (C-07)
  await expect.element(page.getByText(/requested 12, delivered 14/)).toBeInTheDocument();
});

// ── XIS-dialoog achter de kopblokpoort (herstel 2026-07-30) ──────────────────
//
// De eerste poging verborg de hele XisPushDialog zodra de kop incompleet was. Die
// dialoog is echter óók de enige plek waar "Already sent — {datum} ({omgeving},
// {status})" staat: het exportspoor verdween dan mee. De dialoog blijft nu staan;
// alleen de verzendknop gaat weg.
const preflight = { productLines: 11, textLines: 3, newProducts: 1, total: 14 };

test("XIS-dialoog gepoort: geen verzendknop, wél de reden en de pre-flight", async () => {
  await renderServer(
    <Screen>
      <XisPushDialog
        dossierId="d1"
        preflight={preflight}
        action={noopAction}
        blockedReason="The quote header is incomplete (Valid until). Fill it in before sending to XIS."
      />
    </Screen>,
  );
  await page.getByRole("button", { name: "→ To XIS" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Export to XIS" }))
    .toBeInTheDocument();
  // De pre-flight blijft leesbaar — dat is informatie, geen uitgang.
  await expect.element(page.getByText("Article lines")).toBeInTheDocument();
  // De uitgang zelf is weg, met de reden erbij.
  expect(page.getByRole("button", { name: "Send to XIS" }).query()).toBeNull();
  await expect
    .element(page.getByText(/The quote header is incomplete \(Valid until\)/))
    .toBeInTheDocument();
});

test("XIS-dialoog gepoort mét bestaande export: het verzendspoor blijft zichtbaar", async () => {
  await renderServer(
    <Screen>
      <XisPushDialog
        dossierId="d1"
        preflight={preflight}
        action={noopAction}
        existing={{ environment: "sandbox", createdAt: "12 juli 2026", status: "verstuurd" }}
        blockedReason="The quote header is incomplete (Valid until). Fill it in before sending to XIS."
      />
    </Screen>,
  );
  await page.getByRole("button", { name: "→ To XIS" }).click();
  await expect.element(page.getByText(/Already sent — 12 juli 2026/)).toBeInTheDocument();
  await expect.element(page.getByText(/sandbox, verstuurd/)).toBeInTheDocument();
  expect(page.getByRole("button", { name: "Send to XIS" }).query()).toBeNull();
});

test("XIS-dialoog niet gepoort: de verzendknop staat er gewoon", async () => {
  await renderServer(
    <Screen>
      <XisPushDialog dossierId="d1" preflight={preflight} action={noopAction} />
    </Screen>,
  );
  await page.getByRole("button", { name: "→ To XIS" }).click();
  await expect
    .element(page.getByRole("button", { name: "Send to XIS" }))
    .toBeInTheDocument();
});
