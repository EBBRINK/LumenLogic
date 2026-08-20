// Acceptatienaad van goal-bestek-kopwoorden: een écht bestek door het échte pad.
// Geen mocks, geen losse rijen-literal — rowsFromXlsx leest de fixture uit
// docs/examples en parseSpecLinesFromRows maakt er spec-regels van, precies zoals
// finishTableImportAction dat doet.
//
// De meetlat komt uit docs/probleem-bestek-kopwoorden.md: dit bestand leverde 9
// onzinregels op uit 102 bronrijen, en geen van de 42 dataregels kwam erdoor.
import { expect, test } from "vitest";
// Geanonimiseerde armaturenstaat (scripts/gen-test-armaturenstaat.ts). Productdata is
// echt; alleen projectnaam, adres en opdrachtgever zijn verzonnen.
import staatUrl from "@/docs/examples/test-armaturenstaat-woning.xlsx?url";
import { parseSpecLinesFromRows } from "@/lib/table/parse-rows";
import { rowsFromXlsx } from "@/lib/table/rows-from-xlsx";

// De merken zoals ze in de CATALOGUS staan — met spatie en accenten. Het bestek
// schrijft ze anders op ("Deltalight" aan elkaar, "Toldbold" met een l te veel), en dat
// is precies wat deze test moet bewijzen: splitBrandType normaliseert beide kanten
// (lowercase, alleen [a-z0-9]), dus de spelling van de bestekschrijver mag afwijken
// zonder dat het merk verdwijnt. Het gaat om 53 van de 86 stuks.
const BRANDS = ["Delta Light", "CTO Lighting", "Louis Poulsen"];

async function lees() {
  const bytes = new Uint8Array(await (await fetch(staatUrl)).arrayBuffer());
  const rows = await rowsFromXlsx(bytes);
  return { rows, ...parseSpecLinesFromRows(rows, BRANDS) };
}

test("bestek woning: 42 spec-regels in plaats van 9, koprij op rij 8", async () => {
  const { lines, headerRow } = await lees();
  expect(headerRow).toBe(7); // 0-gebaseerd → rij 8 zoals de gebruiker hem in Excel ziet
  expect(lines).toHaveLength(42);
  // 31 unieke coderingen op 40 regels die er één dragen: de negen dubbele (Wand 3x,
  // Plint 2x, 9/12/19/20/21/32 elk 2x) blijven aparte regels — dát is wat de dedup
  // vroeger stil weggooide.
  const codes = lines.map((l) => l.fixtureCode).filter((c) => c.length > 0);
  expect(codes).toHaveLength(40);
  expect(new Set(codes).size).toBe(31);
});

test("bestek woning: het bestek telt zichzelf op 86, en dat halen we exact", async () => {
  const { lines, rows } = await lees();
  // Bron-invariant, geen aanname: rij 102 van het bestek draagt zelf "Aantallen" met
  // het getal 86 ernaast. De som over onze spec-regels moet daaraan gelijk zijn.
  const totaalregel = rows[101];
  expect(totaalregel[0]).toBe("Aantallen");
  expect(Number(totaalregel[4])).toBe(86);
  expect(lines.reduce((n, l) => n + (l.quantity ?? 0), 0)).toBe(86);
  // en die totaalregel zelf is géén armatuur: hij heeft een aantal maar geen product
  expect(lines.some((l) => l.quantity === 86)).toBe(false);
  expect(lines.some((l) => l.sourcePage === 102)).toBe(false);
});

test("bestek woning: zone uit Ruimtenaam, op élke regel, ook de doorgevulde", async () => {
  const { lines } = await lees();
  expect(lines.filter((l) => !l.zone)).toEqual([]);
  // de eerste regel: rij 10, Garage, codering 16 — kolom A (Ruimtenr.) is leeg en
  // mag de codering dus nooit dragen
  expect(lines[0]).toMatchObject({
    fixtureCode: "16",
    zone: "Garage",
    quantity: 4,
    sourcePage: 10,
  });
  // samengevoegde cel: rij 17 heeft géén ruimtenaam en erft die van rij 16
  expect(lines.find((l) => l.sourcePage === 17)).toMatchObject({
    fixtureCode: "Wand",
    zone: "Verkeersruimte",
  });
});

test("bestek woning: merk gesplitst uit Fabrikant/type, ook zonder merkkolom", async () => {
  const { lines } = await lees();
  const stuks = (fragment: string) =>
    lines
      .filter((l) => (l.productText ?? "").includes(fragment))
      .reduce((n, l) => n + (l.quantity ?? 0), 0);

  expect(stuks("Spy 39")).toBe(53);
  expect(stuks("Heli X")).toBe(2);
  expect(stuks("NIME II")).toBe(2);
  expect(stuks("Toldbold")).toBe(3);
  expect(stuks("Trevi")).toBe(1);

  expect(lines.find((l) => l.sourcePage === 55)).toMatchObject({
    brandText: "CTO Lighting",
    productText: "Trevi Pendant Mulit 6, kleur n.t.b.",
  });
  expect(lines.find((l) => l.sourcePage === 13)).toMatchObject({
    brandText: "Delta Light", // canonieke catalogusnaam, niet de spelling uit het bestek
    productText: "Spy 39 Trimless 24121 9220 B",
  });
  // onbekend merk blijft eerlijk onbekend, met de volledige tekst als type
  expect(lines.find((l) => l.sourcePage === 10)).toMatchObject({
    brandText: null,
    productText: "N.t.b.",
  });
});

test("bestek woning: dezelfde codering op een ánder armatuur overleeft", async () => {
  const { lines } = await lees();
  // rij 36 en 37 dragen allebei codering 9, maar rij 37 is een ander armatuur;
  // idem rij 56/57 met codering 12. Dedup op codering gooide deze twee weg.
  expect(lines.filter((l) => l.fixtureCode === "9").map((l) => l.productText)).toEqual([
    "Spy 39 Trimless 24121 9220 B",
    "Decoratief",
  ]);
  expect(lines.filter((l) => l.fixtureCode === "12").map((l) => l.productText)).toEqual([
    "Spy 39 Trimless 24121 9220 B",
    "NIME II Trimless 92752",
  ]);
});

test("bestek woning: een regel zonder codering blijft een armatuur", async () => {
  const { lines } = await lees();
  // rij 97 en 99 staan onder BUITEN en hebben wél een aantal en een product, maar geen
  // positiecode. Samen 5 van de 86 stuks; zonder deze twee klopt het controlegetal niet.
  const zonderCode = lines.filter((l) => l.fixtureCode === "");
  expect(zonderCode).toHaveLength(2);
  expect(zonderCode[0]).toMatchObject({
    sourcePage: 97,
    zone: "Buiten",
    quantity: 3,
    brandText: "Louis Poulsen",
    productText: "Toldbold 155 Zwart",
  });
  expect(zonderCode[1]).toMatchObject({ sourcePage: 99, zone: "Terras", quantity: 2 });
});

test("bestek woning: kopregels en tussenkopjes leveren géén spec-regel", async () => {
  const { lines, rawRows } = await lees();
  expect(rawRows).toBe(102); // het blad zoals de gebruiker het in Excel ziet
  // Project:/Opdrachtgever:/Betreft:/Projectnr.: staan bóven de koprij; BEGANE GROND,
  // VERDIEPING, BUITEN en Aantallen staan in kolom A en hebben geen codering én geen
  // product. Vroeger waren dit — positioneel gelezen — precies de 9 regels die de
  // import opleverde.
  for (const tekst of [
    "Project:",
    "Opdrachtgever:",
    "Betreft:",
    "Projectnr.:",
    "Ruimtenr.",
    "BEGANE GROND",
    "VERDIEPING",
    "BUITEN",
    "Aantallen",
  ]) {
    expect(lines.map((l) => l.fixtureCode)).not.toContain(tekst);
    expect(lines.map((l) => l.productText)).not.toContain(tekst);
  }
  expect(lines.every((l) => (l.sourcePage ?? 0) > 7)).toBe(true);
});
