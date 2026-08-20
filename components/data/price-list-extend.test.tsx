// White-box tests voor de verleng-sectie op /brand-management/price-lists (bevinding B3). De melding
// PriceListExpiryNotice zegt op vier schermen "what's needed now is an extension" — deze
// sectie is de plek waar die verlenging gebeurt. De tests toetsen echte inhoud (welk merk,
// welke datum, welke bediening), niet "het rendert".
//
// Screenshots licht/donker × mobiel/desktop, zelfde mechaniek als data-screens.test.tsx.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { PriceListStatusTable } from "./price-list-status";
import {
  extendNotice,
  PriceListExtendSection,
  type PriceListExtendRow,
} from "./price-list-extend";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Vaste datums: de screenshots moeten volgende maand nog hetzelfde beeld geven. `today` gaat
// er expliciet in, zodat de `min` van het datumveld ook niet meedrijft met de kalender.
const VANDAAG = new Date("2026-07-31T09:00:00Z");

const rows: PriceListExtendRow[] = [
  { id: "pl1", name: "Prijslijst Occhio", brandName: "Occhio", validUntil: "2026-06-01", productCount: 30, daysLeft: -60, bucket: "verlopen", lifecycle: null },
  { id: "pl2", name: "Prijslijst XAL", brandName: "XAL", validUntil: "2026-08-05", productCount: 18, daysLeft: 5, bucket: "7", lifecycle: "actief" },
  { id: "pl3", name: "Prijslijst Delta", brandName: "Delta Light", validUntil: "2027-01-01", productCount: 42, daysLeft: 154, bucket: "ok", lifecycle: "actief" },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Het scherm zoals het echt is: de statustabel met de verloop-melding, en daaronder de
// verleng-sectie. Zo laat de screenshot zien dat de melding en zijn ingang samen staan.
const screens = {
  "prijslijst-verlengen": (
    <Screen>
      <PriceListStatusTable rows={rows} />
      <PriceListExtendSection
        rows={rows}
        extendAction={noopAction}
        today={VANDAAG}
      />
    </Screen>
  ),
  "prijslijst-verlengen-bevestigd": (
    <Screen>
      <PriceListStatusTable rows={rows.slice(1)} />
      <PriceListExtendSection
        rows={rows.slice(1)}
        extendAction={noopAction}
        notice={extendNotice("ok", "2027-12-31")}
        today={VANDAAG}
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
        await expect
          .poll(() => document.body.textContent?.trim().length ?? 0, {
            timeout: 5000,
          })
          .toBeGreaterThan(20);
        await page.screenshot({ path: `./data-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

test("de verlopen lijst krijgt een verlengbediening met merk, lijstnaam en einddatum", async () => {
  await renderServer(
    <Screen>
      <PriceListExtendSection rows={rows} extendAction={noopAction} today={VANDAAG} />
    </Screen>,
  );
  // `exact`: de regel eronder ("Prijslijst Occhio · …") bevat de merknaam ook.
  await expect
    .element(page.getByText("Occhio", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/Prijslijst Occhio · expired on 01-06-2026/))
    .toBeInTheDocument();
  // De bediening zelf: één datumveld en één knop per verlengbare lijst.
  const veld = document.querySelector<HTMLInputElement>(
    'input[name="validUntil"]',
  );
  expect(veld?.type).toBe("date");
  expect(veld?.required).toBe(true);
  // Vandaag mag: de view toetst valid_until >= CURRENT_DATE (inclusief).
  expect(veld?.min).toBe("2026-07-31");
  const verborgen = document.querySelector<HTMLInputElement>(
    'input[name="priceListId"]',
  );
  expect(verborgen?.value).toBe("pl1");
  expect(page.getByRole("button", { name: "Extend" }).all()).toHaveLength(2);
});

test("alleen wat verlopen is of binnen 30 dagen verloopt komt in de sectie", async () => {
  await renderServer(
    <Screen>
      <PriceListExtendSection rows={rows} extendAction={noopAction} today={VANDAAG} />
    </Screen>,
  );
  // Occhio (verlopen) en XAL (nog 5 dagen) wel; Delta Light (154 dagen) niet — een lijst met
  // een half jaar te gaan heeft geen datumknop nodig.
  await expect
    .element(page.getByText("Occhio", { exact: true }))
    .toBeInTheDocument();
  await expect.element(page.getByText("XAL", { exact: true })).toBeInTheDocument();
  expect(page.getByText("Delta Light", { exact: true }).query()).toBeNull();
});

test("zonder verlengbare lijst en zonder melding verschijnt de sectie niet", async () => {
  await renderServer(
    <Screen>
      <span>sentinel</span>
      <PriceListExtendSection
        rows={[rows[2]]}
        extendAction={noopAction}
        today={VANDAAG}
      />
    </Screen>,
  );
  await expect.element(page.getByText("sentinel")).toBeInTheDocument();
  expect(page.getByText(/Extend a price list/).query()).toBeNull();
});

test("een vervangen lijst krijgt géén verlengformulier (die knop kan alleen falen)", async () => {
  // archivePriceList() zet replaced_at en laat valid_until in het verleden staan, dus zo'n
  // lijst leest als "verlopen" en kwam mee in de sectie — mét datumveld en Extend-knop,
  // terwijl extendPriceListValidity hem 100% van de tijd weigert met 'archived'. Zijn
  // prijsregels staan in het archief; wat hier nodig is, is een nieuwe lijst.
  const vervangen: PriceListExtendRow = {
    id: "pl4",
    name: "Prijslijst Modular 2020",
    brandName: "Modular",
    validUntil: "2020-12-31",
    productCount: 0,
    daysLeft: -2038,
    bucket: "verlopen",
    lifecycle: "actief",
    replacedAt: new Date("2021-01-04T10:00:00Z"),
  };

  await renderServer(
    <Screen>
      <PriceListExtendSection
        rows={[...rows, vervangen]}
        extendAction={noopAction}
        today={VANDAAG}
      />
    </Screen>,
  );

  // De sectie staat er wél (Occhio en XAL zijn gewoon verlengbaar), maar Modular niet.
  await expect
    .element(page.getByText("Occhio", { exact: true }))
    .toBeInTheDocument();
  expect(page.getByText("Modular", { exact: true }).query()).toBeNull();
  expect(
    document.querySelectorAll('input[name="priceListId"][value="pl4"]'),
  ).toHaveLength(0);
  // Twee verlengbare lijsten, dus precies twee knoppen — geen derde die alleen kan falen.
  expect(page.getByRole("button", { name: "Extend" }).all()).toHaveLength(2);
});

test("een verzonnen `until` uit de adresbalk komt niet in de groene zin terecht", async () => {
  // fmtDate() splitst op '-', dus "…-x-y" zou als "y-x-…" middenin een role="status"-zin
  // belanden: een bestuurbare valse succesmelding via een geprepareerde link. Alles wat
  // geen YYYY-MM-DD is valt terug op de zin zonder datum.
  const zonderDatum = "Extended — this price list is valid again.";
  expect(extendNotice("ok", "Your account has been deleted-01-2026")?.text).toBe(
    zonderDatum,
  );
  expect(extendNotice("ok", "a-b-c")?.text).toBe(zonderDatum);
  expect(extendNotice("ok", "2026-7-1")?.text).toBe(zonderDatum);
  expect(extendNotice("ok", "<script>")?.text).toBe(zonderDatum);
  // De echte datum werkt onveranderd.
  expect(extendNotice("ok", "2027-12-31")?.text).toMatch(/now valid until 31-12-2027/);

  await renderServer(
    <Screen>
      <PriceListExtendSection
        rows={rows}
        extendAction={noopAction}
        notice={extendNotice("ok", "Your account has been deleted-01-2026")}
        today={VANDAAG}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/this price list is valid again/))
    .toBeInTheDocument();
  const melding = document.querySelector('[role="status"]');
  expect(melding?.textContent).toBe(zonderDatum);
  expect(melding?.textContent).not.toMatch(/account has been deleted/i);
});

test("bevestiging na een geslaagde verlenging noemt de nieuwe einddatum", async () => {
  await renderServer(
    <Screen>
      <PriceListExtendSection
        rows={rows}
        extendAction={noopAction}
        notice={extendNotice("ok", "2027-12-31")}
        today={VANDAAG}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/now valid until 31-12-2027/))
    .toBeInTheDocument();
  await expect.element(page.getByText(/back in the matcher/)).toBeInTheDocument();
});

test("elke weigering krijgt zijn eigen zin — nooit een kale foutcode op het scherm", async () => {
  // De action stuurt alleen codes mee in de URL; dit is de vertaalslag. Verkorten heeft
  // bewust een eigen zin: het is een andere handeling, geen mislukte verlenging.
  expect(extendNotice("not_later", undefined)?.text).toMatch(/later than the current/i);
  expect(extendNotice("not_later", undefined)?.tone).toBe("warn");
  expect(extendNotice("archived", undefined)?.text).toMatch(/new price list, not a new date/i);
  expect(extendNotice("date_in_past", undefined)?.text).toMatch(/today or later/i);
  expect(extendNotice("before_start", undefined)?.text).toMatch(/start date/i);
  // Twee verschillende weigeringen, twee verschillende zinnen: 'before_start' gaat over de
  // datum die je koos, 'not_started' over de lijst zelf (die begint pas later, dus géén
  // einddatum helpt). Eén gedeelde code zou de tweede stilzwijgend laten slagen.
  expect(extendNotice("not_started", undefined)?.text).toMatch(
    /has not started yet/i,
  );
  expect(extendNotice("not_started", undefined)?.text).toMatch(
    /cannot bring its products back/i,
  );
  expect(extendNotice("not_started", undefined)?.tone).toBe("warn");
  expect(extendNotice("unknown_list", undefined)?.text).toMatch(/no longer exists/i);
  expect(extendNotice("invalid_date", undefined)?.text).toMatch(/end date/i);
  // Onzin uit de adresbalk toont niets — geen lege gele balk op een verzonnen code.
  expect(extendNotice("zomaar-wat", undefined)).toBeNull();
  expect(extendNotice(undefined, undefined)).toBeNull();

  await renderServer(
    <Screen>
      <PriceListExtendSection
        rows={rows}
        extendAction={noopAction}
        notice={extendNotice("not_later", undefined)}
        today={VANDAAG}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/only moves an end date forward/))
    .toBeInTheDocument();
});
