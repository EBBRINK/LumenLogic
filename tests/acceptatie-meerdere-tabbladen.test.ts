// Acceptatienaad van goal-meerdere-tabbladen: het échte werkboek door het échte pad.
// De armaturenstaat van een woning draagt twee UITVOERINGEN van dezelfde plattegrond —
// blad "Delta Light" en blad "Wever en Ducre", elk 42 regels voor dezelfde plafonds.
// Vandaag verdween het tweede blad zonder een woord; optellen zou elke ruimte twee keer
// verlichten. Zie docs/probleem-meerdere-tabbladen.md.
import { expect, test } from "vitest";
import staatUrl from "@/docs/examples/test-armaturenstaat-woning.xlsx?url";
import { parseSpecLinesFromRows } from "@/lib/table/parse-rows";
import { sheetsFromXlsx } from "@/lib/table/rows-from-xlsx";
import { chooseSheet, summarizeSheets } from "@/lib/table/sheet-choice";

const BRANDS = ["Delta Light", "CTO Lighting", "Louis Poulsen", "Wever & Ducré"];

async function lees() {
  const bytes = new Uint8Array(await (await fetch(staatUrl)).arrayBuffer());
  const sheets = await sheetsFromXlsx(bytes);
  return { sheets, samenvatting: summarizeSheets(sheets) };
}

test("het werkboek biedt twee bladen aan, met naam en regelaantal", async () => {
  const { samenvatting } = await lees();
  expect(chooseSheet(samenvatting)).toEqual({
    kind: "choose",
    sheets: [
      { index: 1, name: "Delta Light", lines: 42 },
      { index: 2, name: "Wever en Ducre", lines: 42 },
    ],
    skipped: 0, // dit werkboek heeft geen legenda- of sjabloonblad
  });
});

test("blad 2 kiezen levert 42 regels en 86 armaturen — niet 84 en 172", async () => {
  const { sheets } = await lees();
  const blad2 = sheets.find((s) => s.index === 2);
  const { lines } = parseSpecLinesFromRows(blad2?.rows ?? [], BRANDS);

  expect(lines).toHaveLength(42);
  // hetzelfde controlegetal als blad 1: het bestek telt zichzelf op rij 102 op
  expect(lines.reduce((n, l) => n + (l.quantity ?? 0), 0)).toBe(86);
  expect(Number(blad2?.rows[101]?.[4])).toBe(86);

  // 49 Wever en Ducre-spots, plus de zes plekken waar de Spy 39 blijft staan
  const stuks = (fragment: string) =>
    lines
      .filter((l) => (l.productText ?? "").includes(fragment))
      .reduce((n, l) => n + (l.quantity ?? 0), 0);
  expect(stuks("18486LQ3")).toBe(49);
  expect(stuks("Spy 39")).toBe(6);
});

test("de twee bladen zijn alternatieven: samen zouden ze elke ruimte dubbel verlichten", async () => {
  const { sheets } = await lees();
  const perBlad = sheets.map((s) => parseSpecLinesFromRows(s.rows, BRANDS).lines);
  const [blad1, blad2] = perBlad;

  // Regel voor regel dezelfde rijnummers, coderingen, ruimtes en aantallen — alleen het
  // product verschilt. Dát is waarom optellen fout is en kiezen goed.
  expect(blad1.map((l) => [l.sourcePage, l.fixtureCode, l.zone, l.quantity])).toEqual(
    blad2.map((l) => [l.sourcePage, l.fixtureCode, l.zone, l.quantity]),
  );
  // rij 57 is op blad 1 een NIME II en op blad 2 een Wever en Ducre: geen enkele regel
  // van blad 2 is uit blad 1 af te leiden
  const rij57 = (regels: typeof blad1) =>
    regels.find((l) => l.sourcePage === 57)?.productText;
  expect(rij57(blad1)).toContain("NIME II");
  expect(rij57(blad2)).toContain("18486LQ3");

  // Samenvoegen zou 84 regels en 172 armaturen geven — precies het dubbele.
  const samen = [...blad1, ...blad2];
  expect(samen).toHaveLength(84);
  expect(samen.reduce((n, l) => n + (l.quantity ?? 0), 0)).toBe(172);
});

test("het eerste blad blijft wat de fallback pakt, zodat oud gedrag oud gedrag blijft", async () => {
  const { samenvatting } = await lees();
  // Zonder herkenbare bladen zou de fallback blad 1 pakken; dat is exact wat
  // rowsFromXlsx vóór deze feature deed en wat de bestek-kopwoorden-naad meet.
  const geenData = samenvatting.map((s) => ({ ...s, headerRow: null }));
  expect(chooseSheet(geenData)).toEqual({ kind: "fallback", index: 1 });
});
