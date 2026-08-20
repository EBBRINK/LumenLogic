// Parser-naad (goal-import-meer-formaten): koprij-detectie, rij-mapping,
// sourcePage = 1-gebaseerd rijnummer, en het markdown-controlespoor.
import { expect, test } from "vitest";
import {
  detectHeader,
  parseSpecLinesFromRows,
  rowsToMarkdown,
} from "./parse-rows";

const BRANDS = ["XAL", "iGuzzini", "Axo Light"];

test("koprij herkend: kolommen op naam, data eronder, sourcePage = echt rijnummer", () => {
  const rows = [
    ["Armaturenstaat gebouw B", "", "", ""], // titelrij vóór de kop
    ["Code", "Aantal", "Fabricaat", "Type", "Kelvin", "IP"],
    ["Lp301", "12", "XAL", "SASSO 100", "3000", "44"],
    ["", "", "", "", "", ""], // lege rij — telt mee in de nummering
    ["Lw201", "4", "", "iGuzzini Laser Blade 2700K", "", ""],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BRANDS);
  expect(headerRow).toBe(1);
  expect(lines).toHaveLength(2);

  expect(lines[0]).toMatchObject({
    fixtureCode: "Lp301",
    quantity: 12,
    brandText: "XAL",
    productText: "SASSO 100",
    reqKelvin: 3000,
    reqIp: "44",
    sourcePage: 3, // rij 3 in het bronbestand, niet "eerste dataregel = 1"
  });

  // geen merk-kolomwaarde → splitBrandType op de omschrijving (zelfde helper als PDF),
  // en de inline 2700K wordt deterministisch gelezen omdat de Kelvin-kolom leeg is
  expect(lines[1]).toMatchObject({
    fixtureCode: "Lw201",
    brandText: "iGuzzini",
    productText: "Laser Blade 2700K",
    reqKelvin: 2700,
    sourcePage: 5,
  });
});

test("expliciete kolomwaarde wint van de inline lezing", () => {
  const rows = [
    ["code", "aantal", "merk", "type", "kelvin"],
    ["Lp001", "2", "XAL", "SASSO 4000K", "3000"],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BRANDS);
  expect(lines[0].reqKelvin).toBe(3000); // kolom, niet de 4000K uit de tekst
});

test("zonder koprij: positioneel als de CSV-plak-flow (code · aantal · merk · type)", () => {
  const rows = [
    ["Lp301", "12", "XAL", "SASSO 100"],
    ["Lp301", "9", "XAL", "dubbel — eerste rij wint"],
    ["Lw002", "", "", ""],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BRANDS);
  expect(headerRow).toBeNull();
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({
    fixtureCode: "Lp301",
    quantity: 12,
    brandText: "XAL",
    sourcePage: 1,
  });
  // geen aantal → default 1 (zoals de PDF-inhoudsopgave)
  expect(lines[1]).toMatchObject({ fixtureCode: "Lw002", quantity: 1, sourcePage: 3 });
});

test("één kopwoord in een gewone rij maakt nog geen koprij", () => {
  const rows = [
    ["Lp301", "1", "XAL", "Type A"], // "Type A" ≠ kop; 1 treffer is te dun
    ["Lp302", "2", "XAL", "Type B"],
  ];
  expect(detectHeader(rows).headerRow).toBeNull();
  expect(parseSpecLinesFromRows(rows, BRANDS).lines).toHaveLength(2);
});

test("artikelnummer-kolom komt onaangetast in reqArticleCode", () => {
  const rows = [
    ["code", "artikelnummer", "omschrijving"],
    ["Lp301", "21012 0298", "Downlight"],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BRANDS);
  // spaties horen bij de code zoals de klant hem opschreef (normaliseren doet de matcher)
  expect(lines[0].reqArticleCode).toBe("21012 0298");
});

test("rowsToMarkdown: nette tabel met scheidingsregel, pipes ge-escaped", () => {
  const md = rowsToMarkdown([
    ["Code", "Type"],
    ["Lp301", "SASSO | PRO"],
  ]);
  expect(md).toBe(
    "| Code | Type |\n| --- | --- |\n| Lp301 | SASSO \\| PRO |",
  );
});

// ─── Bestek-kopwoorden (goal-bestek-kopwoorden) ────────────────────────────────
// De koprij van de armaturenstaat van woning Bos, letterlijk zoals gemeten in
// docs/probleem-bestek-kopwoorden.md. Kolom D is leeg in het origineel.
// Bewust óók als literal in scripts/gen-test-armaturenstaat.ts: een test die zijn
// verwachting uit de code onder test importeert, toetst niets meer.
const BOS_HEADER = [
  "Ruimtenr.",
  "Ruimtenaam",
  "Toelichting",
  "",
  "Aantal",
  "Functie",
  "Codering",
  "Soort",
  "Fabrikant/type",
  "Accessoire",
  "Power supply",
  "Montagewijze",
];
const BESTEK_BRANDS = ["Delta Light", "Louis Poulsen", "CTO"];

test("bestek-koprij: Ruimtenaam/Codering/Fabrikant-type worden herkend", () => {
  const { headerRow, columns } = detectHeader([BOS_HEADER]);
  expect(headerRow).toBe(0);
  expect(columns.get(1)).toBe("zone"); // Ruimtenaam
  expect(columns.get(4)).toBe("quantity"); // Aantal
  expect(columns.get(6)).toBe("fixtureCode"); // Codering
  expect(columns.get(8)).toBe("productText"); // Fabrikant/type
  // Toelichting, Functie, Soort, Accessoire, Power supply en Montagewijze dragen
  // geen veld dat wij hebben — onherkend is hier het juiste antwoord.
  expect(columns.size).toBe(4);
});

test("tiebreak: exact wint van deelwoord, dus Ruimtenaam (B) en niet Ruimtenr. (A)", () => {
  const rows = [
    BOS_HEADER,
    ["1.01", "Woonkamer", "", "", "6", "", "9", "", "Delta Light Spy 39", "", "", ""],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BESTEK_BRANDS);
  expect(headerRow).toBe(0);
  // kolom A is de eerste kolom met een deelwoord-treffer op "ruimte", maar zone is
  // dan al exact geclaimd door kolom B — anders bond de zone aan het volgnummer
  expect(lines[0].zone).toBe("Woonkamer");
  expect(lines[0].fixtureCode).toBe("9");
  expect(lines[0].quantity).toBe(6);
});

test("Fabrikant/type: één kolom, merk eruit gesplitst zoals het PDF-pad", () => {
  const rows = [
    BOS_HEADER,
    ["", "Hal", "", "", "3", "", "12", "", "Louis Poulsen Toldbod 155", "", "", ""],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BESTEK_BRANDS);
  expect(lines[0]).toMatchObject({
    brandText: "Louis Poulsen",
    productText: "Toldbod 155",
  });
});

test("deelwoord-pass: prefix bindt, langste sleutel wint, korte sleutels doen niet mee", () => {
  const rows = [
    ["Zonenaam", "Merktype aanduiding", "Raster", "Naam ruimte", "Aantal"],
    ["Woonkamer", "Delta Light Spy 39", "x", "y", "2"],
  ];
  const { columns } = detectHeader(rows);
  expect(columns.get(0)).toBe("zone"); // deelwoord: zonenaam begint met "zone"
  // binnen één cel wint de langste sleutel: "merktype" (productText) van "merk"
  expect(columns.get(1)).toBe("productText");
  // "ra" is < 4 tekens en doet alleen exact mee — Raster bindt dus geen cri
  expect(columns.has(2)).toBe(false);
  // prefix, geen substring: de sleutel moet vooraan staan
  expect(columns.has(3)).toBe(false);
  expect(columns.get(4)).toBe("quantity");
});

test("drempel: twee deelwoord-treffers zonder exacte treffer is geen koprij", () => {
  // "Code 12" begint met "code", "Type A" met "type" — zonder de exacte-eis zou
  // deze datarij zichzelf tot koprij bombarderen en alles erboven wegvallen
  const rows = [
    ["Code 12", "2", "XAL", "Type A"],
    ["Code 13", "1", "XAL", "Type B"],
  ];
  expect(detectHeader(rows).headerRow).toBeNull();
  expect(parseSpecLinesFromRows(rows, BRANDS).lines).toHaveLength(2);
});

test("met koprij is elke rij een eigen regel: geen dedup op codering", () => {
  // In een tabelbestek is "Codering" een groeps-/positielabel, geen sleutel: dezelfde
  // codering staat bewust twee keer, soms zelfs op een ánder armatuur. Het positionele
  // pad houdt zijn dedup wél (zie de CSV-plak-test hierboven).
  const rows = [
    ["Codering", "Ruimtenaam", "Aantal", "Fabrikant/type"],
    ["9", "Woonkamer", "4", "Delta Light Spy 39"],
    ["9", "Keuken", "2", "Delta Light Spy 39"],
    ["9", "", "2", "Decoratief"],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BESTEK_BRANDS);
  expect(lines).toHaveLength(3);
  expect(lines.map((l) => [l.zone, l.productText])).toEqual([
    ["Woonkamer", "Spy 39"],
    ["Keuken", "Spy 39"],
    ["Keuken", "Decoratief"], // ruimtenaam doorgevuld uit de rij erboven
  ]);
});

test("zone vult door over samengevoegde cellen heen, tot de volgende ruimte", () => {
  const rows = [
    BOS_HEADER,
    ["", "", "", "", "", "", "", "", "", "", "", ""], // sectierij zonder inhoud
    ["", "Badkamer", "", "", "5", "", "5a", "", "Delta Light Spy 39", "", "", ""],
    ["", "", "", "", "1", "", "Plint", "", "Delta Light Heli X", "", "", ""],
    ["", "Toilet", "", "", "1", "", "5c", "", "Delta Light Spy 39", "", "", ""],
    ["", "", "", "", "1", "", "Plint", "", "Delta Light Heli X", "", "", ""],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BESTEK_BRANDS);
  expect(lines.map((l) => [l.fixtureCode, l.zone])).toEqual([
    ["5a", "Badkamer"],
    ["Plint", "Badkamer"],
    ["5c", "Toilet"],
    ["Plint", "Toilet"], // dezelfde codering, andere ruimte — allebei blijven staan
  ]);
});

test("deelwoord: is het veld van de langste sleutel bezet, dan bindt de kortere", () => {
  // "fabrikanttypeaanduiding" begint zowel met "fabrikanttype" (productText) als met
  // "fabrikant" (brandText). De langste is bezet door de buurkolom, dus wint de
  // kortste die nog vrij is — de kolom draagt tenslotte wél een fabrikant.
  const { columns } = detectHeader([
    ["Fabrikant/type", "Fabrikanttype-aanduiding", "Aantal"],
  ]);
  expect(columns.get(0)).toBe("productText");
  expect(columns.get(1)).toBe("brandText");
  expect(columns.get(2)).toBe("quantity");
});

test("zone vult NIET door op het positionele pad", () => {
  // Zonder koprij is er geen zone-kolom; POSITIONAL kent alleen code/aantal/merk/type.
  const rows = [
    ["Lp301", "2", "XAL", "SASSO 100"],
    ["Lp302", "1", "XAL", "SASSO 200"],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BRANDS);
  expect(headerRow).toBeNull();
  expect(lines.every((l) => l.zone === null)).toBe(true);
});

test("het regelaantal hangt NIET van de merkenlijst af (goal-meerdere-tabbladen N3)", () => {
  // Hier leunt de hele client/server-consistentie op: de browser heeft geen catalogus
  // en telt dus met een lege merkenlijst, de server telt mét. Zouden die twee kunnen
  // verschillen, dan toont de keuzelijst andere aantallen dan er geïmporteerd worden.
  // brandNames stuurt alléén de merk/type-splitsing, nooit of een rij een regel is.
  const rows = [
    BOS_HEADER,
    ["", "Hal", "", "", "3", "", "12", "", "Louis Poulsen Toldbod 155", "", "", ""],
    ["", "", "", "", "1", "", "13", "", "Delta Light Spy 39", "", "", ""],
    ["", "Zolder", "", "", "2", "", "", "", "Onbekend merk pendel", "", "", ""],
    ["", "Totaal", "", "", "6", "", "", "", "", "", "", ""],
  ];
  const met = parseSpecLinesFromRows(rows, BESTEK_BRANDS);
  const zonder = parseSpecLinesFromRows(rows, []);
  expect(met.lines).toHaveLength(3);
  expect(zonder.lines).toHaveLength(met.lines.length);
  // de splitsing verschilt wél — dat is precies wat brandNames doet
  expect(met.lines[0].brandText).toBe("Louis Poulsen");
  expect(zonder.lines[0].brandText).toBeNull();
});
