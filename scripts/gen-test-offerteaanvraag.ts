// Genereert een realistische offerteaanvraag als PDF MÉT tekstlaag: de mail zoals een klant
// hem stuurt, met per merk een tabel omschrijving · artikelnummer · aantal.
//
// Verschil met scripts/gen-test-armaturenboek.ts: dat is een ARMATURENBOEK (armatuurcodes
// Lp301/Ls004, één regel per positie, specs inline). Dit is de andere vorm die binnenkomt —
// een mail met bestelregels op artikelnummer, zonder armatuurcode, met begroeting en
// afsluiting eromheen die de parser moet negeren. Zes merken, 19 regels, 138 stuks.
//
//   bun scripts/gen-test-offerteaanvraag.ts
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Regel = [omschrijving: string, artikelnummer: string, aantal: number];

const MERKEN: { merk: string; regels: Regel[] }[] = [
  {
    merk: "Astro Lighting",
    regels: [
      ["Plafond inbouw KOTO Recessed richtbare spot Zwart PAR16", "1478003", 26],
      ["Wand opbouw TORO Glas E27", "1461001", 2],
      ["Wand opbouw VERSAILLES 370 LED12W 2700K Brons Niet dimbaar", "1380109", 2],
      ["Plafond inbouw MINIMA Slimline Ound Fixed Fire-rated IP65 Zwart PAR16", "1249035", 28],
    ],
  },
  {
    merk: "Tekna Nautic",
    regels: [
      ["Wand opbouw exterieur ESSEX No.94 Clear glass Dark Bronze LED5W E27 2200K fase-afsnij dimbaar", "N094DBR222HG", 2],
      ["Hanglamp LOFT Pendant No.86 Dark Bronze Rod 1200mm LED6W E27 2700K fase-afsnij dimbaar", "N086DBRL60185", 2],
      ["Hanglamp ILFORD No.99 Clear glass Dark Bronze LED5W E27 2200K fase-afsnij dimbaar", "N099DBR222HG", 1],
      ["Wand opbouw ANNET Gauze No.113 Clear glass Dark Bronze LED5W E27 2200K fase-afsnij dimbaar", "N113DBR222GD1", 8],
      ["Wand opbouw SPREADERLIGHT 230V No.030 Dark Bronze LED4W 2700K fase-afsnij dimbaar", "N030DBR", 10],
    ],
  },
  {
    merk: "Modular",
    regels: [
      ["Plafond inbouw SMART LOTIS ASY Recessed 48 1x LED1,5W 2700K Bronze", "12890114", 4],
      ["LED Driver Constant Current Trailing Edge 500mA 5-10W Niet dimbaar Minimaal 4 armaturen", "12404930", 1],
      ["Installation housing", "10889530", 4],
      ["Plaster kit 100x125-45", "12290730", 4],
    ],
  },
  {
    merk: "Aromas del Campo",
    regels: [
      ["Hanglamp NUMU Chroom/Glas LED10W 2700K Fase-afsnij dimbaar", "C1343", 2],
      ["Hanglamp ELMA Zwart/Antiekgoud/Glas LED6W 2700K Fase-afsnij dimbaar", "C1312/S", 2],
    ],
  },
  {
    merk: "Deltalight",
    regels: [
      ["Plafond semi-recessed LUNELLE 52 Clip LED6W 2700K Bruin Brons 92730 BRBB", "32812 9220 BRBB", 14],
      ["LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar", "21012 0298", 14],
    ],
  },
  {
    merk: "Trizo21",
    regels: [
      ["Wand opbouw Trizo21 BOULO W in MATT Glass LED9W 2700K IP50 (voor betonnen wand)", "BLWIM 1122", 6],
      ["LED Driver Triac 230V", "D 3WT", 6],
    ],
  },
];

const AANHEF = [
  "Goedemorgen Eduard,",
  "",
  "Ik hoop dat het goed gaat met je.",
  "",
  "Zou ik van onderstaande armaturen een offerte van jou mogen ontvangen.",
  "Graag met bruto- en nettoprijzen en geschatte levertijden.",
];

const AFSLUITING = ["Alvast bedankt.", "", "Met vriendelijke groet,", "Kind Regards,"];

// A4 liggend: de omschrijvingen lopen tot ~95 tekens en moeten op één regel passen, want
// een afgebroken omschrijving levert een tekstlaag op waarin de kolommen niet meer op
// volgorde staan — precies wat de parser wél moet kunnen vertrouwen.
const BREEDTE = 842;
const HOOGTE = 595;
const MARGE = 45;
const X_ARTIKEL = 600;
const X_AANTAL = 770;
const ONDERGRENS = 50;

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grijs = rgb(0.35, 0.35, 0.35);

  let page = doc.addPage([BREEDTE, HOOGTE]);
  let y = HOOGTE - MARGE;

  // Nieuwe pagina zodra er onderaan geen `nodig` punten meer over zijn. De aanroeper geeft
  // op hoeveel hij nodig heeft, zodat een merkkop nooit als laatste regel achterblijft.
  function ruimte(nodig: number) {
    if (y - nodig >= ONDERGRENS) return;
    page = doc.addPage([BREEDTE, HOOGTE]);
    y = HOOGTE - MARGE;
  }

  function regel(tekst: string, opts: { size?: number; vet?: boolean; x?: number } = {}) {
    const size = opts.size ?? 10;
    ruimte(size + 4);
    page.drawText(tekst, {
      x: opts.x ?? MARGE,
      y,
      size,
      font: opts.vet ? bold : font,
      color: rgb(0, 0, 0),
    });
    y -= size + 5;
  }

  for (const r of AANHEF) regel(r, { size: 11 });
  y -= 14;

  for (const { merk, regels } of MERKEN) {
    // Kop + kolomkop + minstens één regel bij elkaar houden.
    ruimte(58);
    regel(merk, { size: 12, vet: true });
    y -= 2;

    ruimte(16);
    page.drawText("Omschrijving", { x: MARGE, y, size: 9, font: bold, color: grijs });
    page.drawText("Artikelnummer", { x: X_ARTIKEL, y, size: 9, font: bold, color: grijs });
    page.drawText("Aantal", { x: X_AANTAL, y, size: 9, font: bold, color: grijs });
    y -= 15;

    for (const [omschrijving, artikel, aantal] of regels) {
      ruimte(15);
      page.drawText(omschrijving, { x: MARGE, y, size: 9, font });
      page.drawText(artikel, { x: X_ARTIKEL, y, size: 9, font });
      page.drawText(String(aantal), { x: X_AANTAL, y, size: 9, font });
      y -= 15;
    }
    y -= 12;
  }

  y -= 10;
  for (const r of AFSLUITING) regel(r, { size: 11 });

  const pad = "docs/examples/test-offerteaanvraag.pdf";
  writeFileSync(pad, await doc.save());

  const regels = MERKEN.reduce((n, m) => n + m.regels.length, 0);
  const stuks = MERKEN.reduce(
    (n, m) => n + m.regels.reduce((s, [, , a]) => s + a, 0),
    0,
  );
  console.log(
    `✓ ${pad} — ${doc.getPageCount()} pagina's, ${MERKEN.length} merken, ${regels} regels, ${stuks} stuks`,
  );
}

await main();
