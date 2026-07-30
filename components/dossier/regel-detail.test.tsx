// White-box RSC-tests van het regel-detailscherm (§3.6): de kandidaten-kant
// (MatchCandidates, twee lijsten + afronding) en de transparantietabel (DeviationTable).
// Fixture-data, klein en deterministisch; licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DeviationTable } from "./deviation-table";
import { MatchCandidates, type RegelCandidate } from "./match-candidates";
import type { Deviation } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const provable: RegelCandidate[] = [
  {
    id: "p1",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K",
    brandName: "XAL",
    articleCode: "L360-SASSO100",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 2700,
    cri: 90,
    ipValue: "IP20",
    lumenOutput: 1200,
    grossPrice: "310.00",
    matchKind: "fuzzy",
    list: "aantoonbaar",
    chosen: true,
    deviations: [
      { field: "kelvin", requested: 2700, delivered: 2700, verdict: "groen" },
    ],
  },
  {
    id: "p2",
    name: "SASSO 100 RD SP CEIL 25W LED 3000K",
    brandName: "XAL",
    articleCode: "L360-SASSO100-RD",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 3000,
    cri: 90,
    ipValue: "IP20",
    lumenOutput: 1800,
    grossPrice: "345.00",
    matchKind: "fuzzy",
    list: "aantoonbaar",
    deviations: [],
  },
];

const incomplete: RegelCandidate[] = [
  {
    id: "p3",
    name: "SCAVA WALL SURF 1.0 LED 3000K",
    brandName: "Wever & Ducré",
    articleCode: "L092-SCAVA",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Wand",
    kelvin: 3000,
    cri: null,
    ipValue: null,
    lumenOutput: null,
    grossPrice: "226.00",
    matchKind: "fuzzy",
    list: "onvolledig",
    deviations: [
      { field: "cri", requested: 90, delivered: null, verdict: "onbekend" },
      { field: "ip", requested: "IP44", delivered: null, verdict: "onbekend" },
      // UX-audit 30 jul (bug #8): dit zijn de twee velden waarvan de camelCase-sleutel
      // letterlijk op het scherm stond. Ze horen in élke fixture die de pillen rendert.
      {
        field: "beamAngle",
        requested: 24,
        delivered: null,
        verdict: "onbekend",
      },
      {
        field: "dimmable",
        requested: "DALI",
        delivered: null,
        verdict: "onbekend",
      },
    ],
  },
];

const deviations: Deviation[] = [
  { field: "kelvin", requested: 2700, delivered: 2700, verdict: "groen", note: "exact" },
  { field: "straalhoek", requested: 12, delivered: 13, verdict: "geel", note: "1° breder" },
  { field: "ip", requested: "IP44", delivered: null, verdict: "onbekend" },
  // Idem voor de transparantietabel: de Field-kolom toonde `beamAngle`, en de Verdict-cel
  // zei twee keer "no data" (badge + note).
  {
    field: "beamAngle",
    requested: 24,
    delivered: null,
    verdict: "onbekend",
    note: "no data for beam angle",
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

const candidatesScreen = (
  <Screen>
    <h3 className="mb-3 text-sm font-medium">Kandidaten</h3>
    <MatchCandidates
      dossierId="d1"
      specLine={{
        id: "s1",
        fixtureCode: "Lp301",
        brandText: "XAL",
        productText: "SASSO 100",
      }}
      provable={provable}
      incomplete={incomplete}
      chooseAction={noopAction}
      setLineStatusAction={noopAction}
      setDayPriceAction={noopAction}
      runMatchAction={noopAction}
    />
  </Screen>
);

const deviationScreen = (
  <Screen>
    <h3 className="mb-3 text-sm font-medium">Afwijkingen</h3>
    <DeviationTable deviations={deviations} />
  </Screen>
);

// ── Screenshots (licht/donker × mobiel/desktop) ──────────────────────────────
const screens = {
  "regel-kandidaten": candidatesScreen,
  "regel-afwijkingen": deviationScreen,
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

// ── Inhoudelijke asserts ─────────────────────────────────────────────────────
// NB: page.getByText matcht standaard case-insensitive/substring (Playwright). Voor de
// knoppen gebruiken we getByRole zodat de kop "…zet op inlaadlijst" niet meebotst; voor
// koppen exact:true.
test("MatchCandidates: beide lijsten met hun kop verschijnen", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByText("Provably compliant", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Possible — data incomplete", { exact: true }))
    .toBeInTheDocument();
});

test("MatchCandidates: prijzen worden getoond (nooit gesorteerd)", async () => {
  await renderServer(candidatesScreen);
  // Regel 2: prijs is zichtbaar op elke kandidaat.
  await expect.element(page.getByText("310,00")).toBeInTheDocument();
  await expect.element(page.getByText("345,00")).toBeInTheDocument();
  await expect.element(page.getByText("226,00")).toBeInTheDocument();
});

// UX-audit 30 jul (item 3): de prijs stond rechtsboven als zwaarste element van de kaart,
// terwijl van de match zélf niets zichtbaar was. Deze test pint de omkering vast: de prijs
// mag niet groter of vetter zijn dan de match-onderbouwing.
test("MatchCandidates: prijs is niet zwaarder dan de match-onderbouwing", async () => {
  await renderServer(candidatesScreen);
  // Eerst wachten tot de render geflusht is; .element() leest synchroon.
  await expect
    .element(page.getByText("1 of 1 requested fields within margin"))
    .toBeInTheDocument();
  const samenvatting = page
    .getByText("1 of 1 requested fields within margin")
    .element();
  const prijs = page.getByText("310,00").element();
  const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
  const gewicht = (el: Element) => parseInt(getComputedStyle(el).fontWeight, 10);
  expect(px(prijs)).toBeLessThanOrEqual(px(samenvatting));
  expect(gewicht(prijs)).toBeLessThan(gewicht(samenvatting));
});

// Het luide element is nu de onderbouwing: wélke velden zijn getoetst en binnen welke
// marge. Geen verzonnen getal — de engine levert per veld een oordeel, dus dát staat er.
test("MatchCandidates: elke kaart onderbouwt de match per veld", async () => {
  await renderServer(candidatesScreen);
  // Aantoonbare kandidaat p1: één gevraagd veld, exact geleverd.
  await expect
    .element(page.getByText("1 of 1 requested fields within margin"))
    .toBeInTheDocument();
  await expect.element(page.getByText("Kelvin 2700: exact")).toBeInTheDocument();
  // Onvolledige kandidaat p3: vier velden, geen enkele bewezen, alle vier zonder data.
  await expect
    .element(
      page.getByText("0 of 4 requested fields within margin · 4 without data"),
    )
    .toBeInTheDocument();
  // Er staat nergens een score-percentage: de matcher produceert er geen.
  expect(document.body.textContent).not.toMatch(/\d+\s*%/);
});

// Kandidaat p2 heeft een lege verdicts-lijst. Een lege ruimte zou als instemming lezen;
// de kaart zegt daarom dat er niets is vastgelegd.
test("MatchCandidates: zonder oordelen zegt de kaart dát, in plaats van niets", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByText("No field-level verdicts recorded for this candidate."))
    .toBeInTheDocument();
});

test("MatchCandidates: onvolledige kandidaat toont 'geen data' per onbekend veld", async () => {
  await renderServer(candidatesScreen);
  await expect.element(page.getByText("CRI: no data")).toBeInTheDocument();
  await expect.element(page.getByText("IP: no data")).toBeInTheDocument();
});

// UX-audit 30 jul (bug #8): de pillen droegen de ruwe veldsleutel. NB: page.getByText is
// case-insensitive substring, dus alleen een positieve assert bewijst hier niets over de
// vorm — de negatieve gaat daarom over de rauwe DOM-tekst.
test("MatchCandidates: de pillen dragen een leesbaar label, geen code-identifier", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByText("beam angle: no data"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("dimmability: no data"))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("beamAngle");
  expect(document.body.textContent).not.toContain("dimmable");
});

// UX-audit 30 jul (item 5): twee van de drie knoppen heetten naar een kleur ("Set to Red",
// "Set to Purple") en vertelden dus niets over het gevolg. Ze zeggen nu wat er gebeurt.
// De BADGE ernaast houdt de kleurnaam — dat is O13 (het geprinte `word` moet het kleurwoord
// blijven, FUNCTIONEEL-ONTWERP §577) en die kant mag niet meebewegen.
test("MatchCandidates: afrondings-knoppen benoemen het gevolg, badges de kleur", async () => {
  await renderServer(candidatesScreen);
  for (const naam of [
    "Report back to customer",
    "Add to load list",
    "Mark as outside assortment",
  ]) {
    await expect
      .element(page.getByRole("button", { name: naam }))
      .toBeInTheDocument();
  }
  // Geen kleurnaam meer op een knop.
  for (const knop of document.querySelectorAll("button")) {
    expect(knop.textContent).not.toMatch(/Set to (Red|Purple)/);
  }
  // O13 blijft staan: de statusbadges dragen nog steeds hun kleurwoord.
  for (const woord of ["Red", "Blue", "Purple"]) {
    await expect
      .element(page.getByText(woord, { exact: true }))
      .toBeInTheDocument();
  }
  await expect
    .element(page.getByText("Spot price on this line", { exact: true }))
    .toBeInTheDocument();
});

// UX-audit 30 jul (item 12): dit is de enige plek waar de belofte nog hoort te staan —
// hier valt de status daadwerkelijk te kiezen. De uitleg-flourish in de kop is weg.
test("MatchCandidates: de 'niets stil weglaten'-belofte staat er precies één keer", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByText("Every line keeps a status — nothing is silently omitted."))
    .toBeInTheDocument();
  const tekst = document.body.textContent ?? "";
  expect(tekst.match(/silently omitted/g)).toHaveLength(1);
  expect(tekst).not.toContain("Resolve it honestly");
  expect(tekst).not.toContain("Report explicitly, don't omit");
});

test("MatchCandidates: zonder kandidaten verschijnt de 'draai de matcher'-knop", async () => {
  await renderServer(
    <Screen>
      <MatchCandidates
        dossierId="d1"
        specLine={{
          id: "s1",
          fixtureCode: "Lp301",
          brandText: "XAL",
          productText: "SASSO 100",
        }}
        provable={[]}
        incomplete={[]}
        chooseAction={noopAction}
        setLineStatusAction={noopAction}
        setDayPriceAction={noopAction}
        runMatchAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: "Run the matcher" }))
    .toBeInTheDocument();
});

test("DeviationTable: kolommen + een afwijking (gevraagd 12, geleverd 13) zichtbaar", async () => {
  await renderServer(deviationScreen);
  await expect
    .element(page.getByText("Requested", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Delivered", { exact: true }))
    .toBeInTheDocument();
  // De afwijking straalhoek: gevraagd 12, geleverd 13.
  await expect.element(page.getByText("12", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("13", { exact: true })).toBeInTheDocument();
  // Onbekend veld = eerlijke grijze vlag "geen data", nooit stil weggelaten.
  await expect.element(page.getByText("no data", { exact: true }).first()).toBeInTheDocument();
});

// UX-audit 30 jul (bug #8) + REPARATIE 30 jul (bevindingen 3 en 7), drie dingen in één rij:
//  1. de Field-kolom toonde `beamAngle` — nu een leesbaar label;
//  2. de Field-kolom had daarna vier conventies in vier rijen (`kelvin` · `Straalhoek` ·
//     `IP` · `beam angle`). Eén conventie: begin-van-de-regel, afkortingen intact;
//  3. de rij zei drie keer "no data" (grijze Delivered-cel, badge, note). De eerste ronde
//     haalde alleen de nóte weg, dus het AANGRENZENDE paar — "no data" grijs, pal gevolgd
//     door "● no data" — bleef staan, en dat was nu juist de klacht.
test("DeviationTable: de Field-kolom heeft één conventie", async () => {
  await renderServer(deviationScreen);
  // Eerst wachten tot de render geflusht is; querySelectorAll leest synchroon.
  await expect
    .element(page.getByText("Beam angle", { exact: true }))
    .toBeInTheDocument();
  const velden = Array.from(
    document.querySelectorAll("tbody tr td:first-child"),
  ).map((td) => td.textContent);
  expect(velden).toEqual(["Kelvin", "Straalhoek", "IP", "Beam angle"]);
  expect(document.body.textContent).not.toContain("beamAngle");
});

test("DeviationTable: 'no data' staat één keer per rij", async () => {
  await renderServer(deviationScreen);
  await expect
    .element(page.getByText("no data", { exact: true }).first())
    .toBeInTheDocument();
  // De rijen zonder geleverde waarde (ip, beamAngle) zeggen het via de badge; de
  // Delivered-cel toont het gewone streepje.
  for (const rij of Array.from(document.querySelectorAll("tbody tr"))) {
    const treffers = (rij.textContent ?? "").match(/no data/g) ?? [];
    expect(treffers.length, rij.textContent ?? "").toBeLessThanOrEqual(1);
  }
  expect(document.body.textContent).not.toContain("no data for beam angle");
  // En de note zit niet meer in een `title`: een tooltip is niet bereikbaar met
  // toetsenbord of touch, dus dat is geen weergave.
  expect(
    document.querySelector('[title="no data for beam angle"]'),
  ).toBeNull();
});

// REPARATIE 30 jul, bevinding 7, de andere helft: bij "onbekend" mét een geleverde waarde
// onderdrukte de eerste ronde de note óók — die rij verloor daarmee haar enige uitleg.
test("DeviationTable: 'onbekend' mét een waarde houdt zijn uitleg", async () => {
  await renderServer(
    <Screen>
      <DeviationTable
        deviations={[
          {
            field: "ip",
            requested: "IP44",
            delivered: "IP20",
            verdict: "onbekend",
            note: "brand data incomplete — value not verifiable",
          },
        ]}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/brand data incomplete/))
    .toBeInTheDocument();
});

test("DeviationTable: leeg → eerlijke uitleg i.p.v. niets", async () => {
  await renderServer(
    <Screen>
      <DeviationTable deviations={[]} />
    </Screen>,
  );
  await expect
    .element(page.getByText("No deviations recorded yet", { exact: false }))
    .toBeInTheDocument();
});
