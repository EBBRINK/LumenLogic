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

// [rijnummer, ruimtenaam (leeg = leeg), aantal, codering, fabrikant/type, toelichting]
type Regel = [number, string, number, string, string, string?];

const SPY = "Deltalight Spy 39 Trimless 24121 9220 B";
const HELI = "Deltalight Heli X Screen 930 12711 9300 N";
const NTB = "N.t.b.";

const REGELS: Regel[] = [
  // — BEGANE GROND (tussenkopje op rij 9) —
  [10, "Garage", 4, "16", NTB],
  [13, "Bijkeuken", 3, "1", SPY],
  [16, "Verkeersruimte", 5, "2", SPY],
  [17, "", 1, "Wand", NTB],
  [20, "Slaapkamer", 4, "3", SPY],
  [21, "", 1, "4", SPY],
  [22, "", 2, "7a", NTB],
  [25, "Badkamer", 5, "5a", SPY],
  [26, "", 1, "Plint", HELI],
  [29, "Toilet", 1, "5c", SPY],
  [30, "", 1, "Plint", HELI],
  [32, "Douche", 1, "20", SPY],
  [35, "Keuken", 2, "8", SPY],
  [36, "", 2, "9", SPY],
  [37, "", 2, "9", "Decoratief"], // zelfde codering, ánder armatuur
  [40, "Trapkast", 1, "14", NTB],
  [43, "Trap laag deel", 2, "Wand", NTB],
  [46, "Toilet", 1, "33", SPY],
  [49, "Kantoor", 3, "13", SPY],
  [52, "Gang", 2, "10", SPY],
  [55, "Woonkamer", 1, "11", "CTO Lighting Trevi Pendant Mulit 6, kleur n.t.b."],
  [56, "", 1, "12", SPY],
  [57, "", 2, "12", "Deltalight NIME II Trimless 92752"], // idem
  // — VERDIEPING (tussenkopje op rij 60) —
  [61, "Chillruimte", 2, "32", SPY],
  [62, "Trapgat", 1, "32", SPY],
  [65, "Berging", 2, "31", NTB],
  [68, "Trap hoog deel", 2, "Wand", NTB],
  [69, "", 2, "18", SPY],
  [72, "Badkamer", 2, "21", SPY],
  [73, "", 2, "21", SPY],
  [76, "Douche", 1, "20", SPY],
  [79, "Vide", 4, "30", SPY],
  [82, "Overloop", 3, "19", NTB],
  [83, "", 1, "19", SPY],
  [86, "Slaapkamer rechts", 4, "24", SPY],
  [87, "", 1, "25", NTB],
  [88, "", 1, "26", NTB],
  [91, "Slaapkamer links", 3, "27", SPY],
  [92, "", 1, "28b", NTB],
  [93, "", 1, "29", NTB],
  // — BUITEN (tussenkopje op rij 96) — twee regels ZONDER codering, wel met product —
  [97, "Buiten", 3, "", "Louis Poulsen Toldbold 155 Zwart", "Gevel"],
  [99, "Terras", 2, "", NTB, "Pergola"],
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

const ARMATURENSTAAT_FIXTURE = "docs/examples/test-armaturenstaat-woning.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Armaturenstaat");

  for (const [nr, a, b] of KOLOM_A) {
    ws.getCell(nr, 1).value = a;
    if (b) ws.getCell(nr, 2).value = b;
  }
  KOPRIJ.forEach((k, i) => {
    if (k) ws.getCell(KOPRIJ_NR, i + 1).value = k;
  });
  for (const [nr, ruimte, aantal, code, type, toelichting] of REGELS) {
    // kolom A (Ruimtenr.) blijft leeg, precies als in het bronbestand
    if (ruimte) ws.getCell(nr, 2).value = ruimte;
    if (toelichting) ws.getCell(nr, 3).value = toelichting;
    ws.getCell(nr, 5).value = aantal;
    if (code) ws.getCell(nr, 7).value = code;
    ws.getCell(nr, 9).value = type;
  }
  // Totaalregel op rij 102: het bestek telt zichzelf op. Kolom A draagt het woord,
  // kolom E het getal — géén codering en géén product, dus dit is GEEN spec-regel.
  // Dat is meteen de controle-invariant van de acceptatietest: de som van de aantallen
  // over de dataregels moet exact dit getal zijn.
  ws.getCell(102, 1).value = "Aantallen";
  ws.getCell(102, 5).value = REGELS.reduce((n, r) => n + r[2], 0);

  await wb.xlsx.writeFile(ARMATURENSTAAT_FIXTURE);
  const codes = new Set(REGELS.filter((r) => r[3]).map((r) => r[3]));
  const spy = REGELS.filter((r) => r[4] === SPY).reduce((n, r) => n + r[2], 0);
  console.log(
    `${ARMATURENSTAAT_FIXTURE}: ${REGELS.length} dataregels, ` +
      `${REGELS.reduce((n, r) => n + r[2], 0)} armaturen, ${codes.size} unieke coderingen, ` +
      `${spy} Spy 39, ${REGELS.filter((r) => !r[1]).length} regels zonder ruimtenaam`,
  );
}

main();
