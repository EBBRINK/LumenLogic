// Genereert de geanonimiseerde armaturenstaat-fixture voor de acceptatietest van
// goal-bestek-kopwoorden. Draai: bun scripts/gen-test-armaturenstaat.ts
//
// Dit script ÍS de anonimisering. De productdata (coderingen, aantallen, ruimtenamen,
// fabrikant/type) komt letterlijk uit het bronbestand — woning Bos, 27-6-2026, gemeten
// in docs/probleem-bestek-kopwoorden.md. Alleen projectnaam, adres en opdrachtgever zijn
// verzonnen; het bronbestand zelf gaat niet in git.
//
// Twee eigenschappen van dit bestand die de hele klus verklaren, en die de fixture dus
// MOET houden:
//   • Ruimtenaam is SPAARZAAM gevuld: 16 van de 40 regels hebben een lege kolom B. Het
//     is een samengevoegde-cel-layout — de ruimtenaam staat alleen op de eerste regel
//     van elke ruimte en geldt door tot de volgende.
//   • Codering is GEEN sleutel maar een groeps-/positielabel. Rij 37 ("Decoratief") en
//     rij 57 ("NIME II Trimless") zijn aantoonbaar andere armaturen dan de rij erboven
//     met dezelfde codering. Elke dedup die codering als sleutel behandelt, gooit ze weg.
//   • Kolom A (Ruimtenr.) is overal leeg. Daardoor reproduceert de fixture ook de
//     KAPOTTE uitgangssituatie exact: positioneel gelezen levert hij de 9 onzinregels
//     uit het probleemdocument (Project:, Opdrachtgever:, Betreft:, Projectnr.:,
//     Ruimtenr., BEGANE GROND, VERDIEPING, BUITEN, Aantallen).
import ExcelJS from "exceljs";

// De dataregels. Beide tabbladen delen REGEL VOOR REGEL hetzelfde rijnummer, dezelfde
// ruimtenaam, hetzelfde aantal en dezelfde codering — alleen de productkolom verschilt.
// Die kolom staat daarom apart per blad, zodat het verschil tussen de twee uitvoeringen
// in één oogopslag te reviewen is. Niet afgeleid van elkaar: blad 2 wijkt op plekken af
// die je niet kunt uitrekenen (rij 57 is op blad 1 een NIME II en op blad 2 een W&D).
// [rijnummer, ruimtenaam (leeg = leeg), aantal, codering, toelichting]
type Basis = [number, string, number, string, string?];

const SPY = "Deltalight Spy 39 Trimless 24121 9220 B";
const WD = "Wever en Ducre trimless 1.0 18486LQ3";
const HELI = "Deltalight Heli X Screen 930 12711 9300 N";
const NIME = "Deltalight NIME II Trimless 92752";
const CTO = "CTO Lighting Trevi Pendant Mulit 6, kleur n.t.b.";
const TOLD = "Louis Poulsen Toldbold 155 Zwart";
const DECO = "Decoratief";
const NTB = "N.t.b.";

const BASIS: Basis[] = [
  // — BEGANE GROND (tussenkopje op rij 9) —
  [10, "Garage", 4, "16"],
  [13, "Bijkeuken", 3, "1"],
  [16, "Verkeersruimte", 5, "2"],
  [17, "", 1, "Wand"],
  [20, "Slaapkamer", 4, "3"],
  [21, "", 1, "4"],
  [22, "", 2, "7a"],
  [25, "Badkamer", 5, "5a"],
  [26, "", 1, "Plint"],
  [29, "Toilet", 1, "5c"],
  [30, "", 1, "Plint"],
  [32, "Douche", 1, "20"],
  [35, "Keuken", 2, "8"],
  [36, "", 2, "9"],
  [37, "", 2, "9"], // zelfde codering als rij 36, ánder armatuur
  [40, "Trapkast", 1, "14"],
  [43, "Trap laag deel", 2, "Wand"],
  [46, "Toilet", 1, "33"],
  [49, "Kantoor", 3, "13"],
  [52, "Gang", 2, "10"],
  [55, "Woonkamer", 1, "11"],
  [56, "", 1, "12"],
  [57, "", 2, "12"], // idem
  // — VERDIEPING (tussenkopje op rij 60) —
  [61, "Chillruimte", 2, "32"],
  [62, "Trapgat", 1, "32"],
  [65, "Berging", 2, "31"],
  [68, "Trap hoog deel", 2, "Wand"],
  [69, "", 2, "18"],
  [72, "Badkamer", 2, "21"],
  [73, "", 2, "21"],
  [76, "Douche", 1, "20"],
  [79, "Vide", 4, "30"],
  [82, "Overloop", 3, "19"],
  [83, "", 1, "19"],
  [86, "Slaapkamer rechts", 4, "24"],
  [87, "", 1, "25"],
  [88, "", 1, "26"],
  [91, "Slaapkamer links", 3, "27"],
  [92, "", 1, "28b"],
  [93, "", 1, "29"],
  // — BUITEN (tussenkopje op rij 96) — twee regels ZONDER codering, wel met product —
  [97, "Buiten", 3, "", "Gevel"],
  [99, "Terras", 2, "", "Pergola"],
];

// Blad 1 "Delta Light": 53 Spy 39-spots.
const BLAD1 = [
  NTB, SPY, SPY, NTB, SPY, SPY, NTB, SPY, HELI, SPY, HELI, SPY, SPY, SPY, DECO,
  NTB, NTB, SPY, SPY, SPY, CTO, SPY, NIME, SPY, SPY, NTB, NTB, SPY, SPY, SPY,
  SPY, SPY, NTB, SPY, SPY, NTB, NTB, SPY, NTB, NTB, TOLD, NTB,
];

// Blad 2 "Wever en Ducre": dezelfde plattegrond, 49 W&D-spots — maar op zes plekken
// blijft de Spy 39 staan (toilet, douches, badkamer), dus 55 spots in totaal.
const BLAD2 = [
  NTB, WD, WD, NTB, WD, WD, NTB, WD, HELI, SPY, HELI, SPY, WD, WD, DECO,
  NTB, NTB, SPY, WD, WD, CTO, WD, WD, WD, WD, NTB, NTB, WD, SPY, WD,
  SPY, WD, NTB, WD, WD, NTB, NTB, WD, NTB, NTB, TOLD, NTB,
];

// Rijen met alleen kolom A gevuld. De vier kopregels bovenaan zijn verzonnen op de
// klantvelden na de projectcode; de tussenkopjes staan op hun echte rijnummers.
const KOLOM_A: [number, string, string][] = [
  [1, "Project:", "Woning Van Dijk, Beatrixlaan 12, Goes"],
  [2, "Opdrachtgever:", "Bouwbedrijf De Zeeuw B.V."],
  [3, "Betreft:", "Armaturenstaat nieuwbouw woonhuis"],
  [4, "Projectnr.:", "113-297"],
  [9, "BEGANE GROND", ""],
  [60, "VERDIEPING", ""],
  [96, "BUITEN", ""],
];

// De koprij zoals gemeten, letterlijk. Kolom D is leeg in het origineel.
const KOPRIJ_NR = 8;
const KOPRIJ = [
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

// De twee tabbladnamen zoals ze op de tabjes staan (blad 2 zonder accenten, zoals in
// het bronbestand). Ze zijn wat de gebruiker straks in de keuzelijst leest.
export const BLAD1_NAAM = "Delta Light";
export const BLAD2_NAAM = "Wever en Ducre";

const ARMATURENSTAAT_FIXTURE = "docs/examples/test-armaturenstaat-woning.xlsx";

function vulBlad(ws: ExcelJS.Worksheet, producten: string[]) {
  for (const [nr, a, b] of KOLOM_A) {
    ws.getCell(nr, 1).value = a;
    if (b) ws.getCell(nr, 2).value = b;
  }
  KOPRIJ.forEach((k, i) => {
    if (k) ws.getCell(KOPRIJ_NR, i + 1).value = k;
  });
  BASIS.forEach(([nr, ruimte, aantal, code, toelichting], i) => {
    // kolom A (Ruimtenr.) blijft leeg, precies als in het bronbestand
    if (ruimte) ws.getCell(nr, 2).value = ruimte;
    if (toelichting) ws.getCell(nr, 3).value = toelichting;
    ws.getCell(nr, 5).value = aantal;
    if (code) ws.getCell(nr, 7).value = code;
    ws.getCell(nr, 9).value = producten[i];
  });
  // Totaalregel op rij 102: het bestek telt zichzelf op. Kolom A draagt het woord,
  // kolom E het getal — géén codering en géén product, dus dit is GEEN spec-regel.
  // Dat is meteen de controle-invariant van de acceptatietests: de som van de aantallen
  // over de dataregels moet exact dit getal zijn, op allebei de bladen.
  ws.getCell(102, 1).value = "Aantallen";
  ws.getCell(102, 5).value = BASIS.reduce((n, r) => n + r[2], 0);
}

async function main() {
  if (BLAD1.length !== BASIS.length || BLAD2.length !== BASIS.length) {
    throw new Error(
      `productkolommen lopen niet gelijk met BASIS: ${BASIS.length} regels, ` +
        `blad 1 heeft er ${BLAD1.length} en blad 2 ${BLAD2.length}`,
    );
  }
  const wb = new ExcelJS.Workbook();
  vulBlad(wb.addWorksheet(BLAD1_NAAM), BLAD1);
  vulBlad(wb.addWorksheet(BLAD2_NAAM), BLAD2);
  await wb.xlsx.writeFile(ARMATURENSTAAT_FIXTURE);

  const stuks = (producten: string[], p: string) =>
    producten.reduce((n, x, i) => (x === p ? n + BASIS[i][2] : n), 0);
  const codes = new Set(BASIS.filter((r) => r[3]).map((r) => r[3]));
  console.log(
    `${ARMATURENSTAAT_FIXTURE}: 2 tabbladen, elk ${BASIS.length} dataregels en ` +
      `${BASIS.reduce((n, r) => n + r[2], 0)} armaturen, ${codes.size} unieke coderingen, ` +
      `${BASIS.filter((r) => !r[1]).length} regels zonder ruimtenaam\n` +
      `  ${BLAD1_NAAM}: ${stuks(BLAD1, SPY)} Spy 39\n` +
      `  ${BLAD2_NAAM}: ${stuks(BLAD2, WD)} Wever en Ducre + ${stuks(BLAD2, SPY)} Spy 39`,
  );
}

main();
