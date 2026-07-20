// Deterministische rijsegment-verrijking (gat B, 20 jul): de door het model
// geleverde codes zijn ankers; het échte rijsegment komt uit de server-side
// paginatekst en parseProductName leest daar de specs — geen verzin-risico.
// De tests pinnen de anker-randgevallen vast: meermaals voorkomende codes,
// gelijmde codes, suffix-codes, gemiste tussencodes, en de merge-volgorde
// (modeltekst wint — het segment vult alleen lege velden bij).
import { expect, test } from "vitest";
import { parseProductName } from "@/lib/enrichment/parser";
import { regelToSpecLine } from "@/lib/repo/ocr";
import type { OcrRegel } from "@/lib/ai/ocr";
import { verrijkRegelsMetSegment, vindRijSegmenten } from "./rijsegmenten";

// Synthetische Raadhuis-achtige pagina: twee rijen mét specs, in de echte
// kolomvolgorde (locatie · montagewijze · fabricaat · type · maten · specs).
const PAGINA =
  "Lr301 Raadzaal Inbouw Downlight XAL SASSO PRO 100 112x106mm (ØxH) " +
  "n.t.b. IP20 / - LED 2810 lm 104 lm/W 27 W Middelbreed stralend (39°) " +
  "3000K CRI ≥ 90 SDCM ≤ 3 DALI-2 Dimbaar " +
  "Lw001 Toilet Wand Lineair XAL STRETTA WALL 600x80x40mm (LxWxH) " +
  "IP44 / - LED 1340 lm 102 lm/W 13,1 W Zeer breedstralend (180°) " +
  "3000K CRI ≥ 90 DALI-2 Dimbaar";

function regel(armatuurcode: string, ruweTekst: string): OcrRegel {
  return { armatuurcode, merk: "XAL", type: null, ruweTekst, codeValid: true };
}

test("het rijsegment loopt van de code tot het volgende anker en parseert de specs", () => {
  const segmenten = vindRijSegmenten(PAGINA, ["Lr301", "Lw001"]);
  const lr301 = segmenten.get("Lr301")!;
  expect(lr301.startsWith("Lr301 ")).toBe(true);
  expect(lr301).not.toContain("Lw001"); // eindigt op het volgende anker
  expect(parseProductName(lr301)).toMatchObject({
    maxWattage: 27,
    kelvin: 3000,
    cri: 90,
    ipValue: "IP20",
    beamAngle: 39,
    lumenOutput: 2810,
    dimmable: "DALI",
  });
  // De laatste rij loopt tot het einde van de pagina (komma-notatie parseert).
  expect(parseProductName(segmenten.get("Lw001")!)).toMatchObject({
    maxWattage: 13.1,
    ipValue: "IP44",
  });
});

test("afgekapte ruwe_tekst + segment → req_*-velden gevuld (het Lr301-geval)", () => {
  // Exact het live-geval: het model kapte ruwe_tekst af vóór de spec-sectie.
  const afgekapt = regel(
    "Lr301",
    "Lr301 Raadzaal Inbouw Downlight XAL SASSO PRO 100 112x106mm (ØxH)",
  );
  const segment = vindRijSegmenten(PAGINA, ["Lr301", "Lw001"]).get("Lr301");
  const zonder = regelToSpecLine(afgekapt, 1, "run", ["XAL"]);
  const met = regelToSpecLine(afgekapt, 1, "run", ["XAL"], segment);
  expect(zonder.reqKelvin).toBeNull(); // het gat: zonder segment niets
  expect(met).toMatchObject({
    reqKelvin: 3000,
    reqCri: 90,
    reqIp: "IP20",
    reqWatt: 27,
    reqLumen: 2810,
    reqBeamAngle: 39,
    reqDimmable: "DALI",
  });
});

test("merge: wat het model wél leverde wint (eerste-match-wint), het segment vult alleen aan", () => {
  // Model las een ándere kelvin dan het segment noemt (bv. uit een genoteerde
  // typeaanduiding): de modeltekst staat vóór in de parse-input en wint.
  const metEigenKelvin = regel("Lr301", "Lr301 XAL SASSO PRO 100 2700K");
  const segment = vindRijSegmenten(PAGINA, ["Lr301", "Lw001"]).get("Lr301");
  const line = regelToSpecLine(metEigenKelvin, 1, "run", ["XAL"], segment);
  expect(line.reqKelvin).toBe(2700); // model wint
  expect(line.reqWatt).toBe(27); // segment vult het ontbrekende veld bij
});

test("meermaals voorkomende code: het spec-rijke tabelvoorkomen wint van het kale label", () => {
  // Plattegrond-achtig kaal label eerst, daarna de echte tabelrij.
  const pagina =
    "Zie plattegrond: L004 bij de entree. Meer proza hier. " +
    "L004 Downlight 3000K 21 W IP44 " +
    "L005 Pendel 2700K";
  const seg = vindRijSegmenten(pagina, ["L004", "L005"]).get("L004")!;
  expect(parseProductName(seg)).toMatchObject({ kelvin: 3000, maxWattage: 21 });
});

test("suffix-codes: Lr001 zuigt het Lr001B-voorkomen niet aan", () => {
  const pagina = "Lr001B Basis variant 4000K 12 W einde " + "Lr001 Basis 3000K 8 W";
  const segmenten = vindRijSegmenten(pagina, ["Lr001", "Lr001B"]);
  expect(parseProductName(segmenten.get("Lr001")!)).toMatchObject({
    kelvin: 3000,
    maxWattage: 8,
  });
  expect(parseProductName(segmenten.get("Lr001B")!)).toMatchObject({
    kelvin: 4000,
    maxWattage: 12,
  });
});

test("gelijmde code (unpdf-artefact): alleen een linkergrens is genoeg als fallback", () => {
  const pagina = "keuze L017of L018, zie tabel: L017of 3000K 9 W";
  // "L017" komt uitsluitend gelijmd voor — de rechtergrens is preferent, niet
  // verplicht, dus het voorkomen wordt tóch gevonden.
  const seg = vindRijSegmenten(pagina, ["L017", "L018"]).get("L017");
  expect(seg).toBeDefined();
});

test("gemiste tussencode: segment loopt door, maar eerste-match-wint pakt de juiste specs eerst", () => {
  // Het model leverde alleen Lr301 en Lw001 — de tussenliggende rij (Lr302,
  // niet geleverd) wordt opgeslokt in het Lr301-segment. De specs van Lr301
  // staan vóór die van Lr302, dus eerste-match-wint leest de juiste.
  const pagina =
    "Lr301 XAL SASSO 3000K 27 W " +
    "Lr302 XAL SASSO 2700K 14 W " +
    "Lw001 XAL STRETTA 4000K";
  const seg = vindRijSegmenten(pagina, ["Lr301", "Lw001"]).get("Lr301")!;
  expect(seg).toContain("Lr302"); // opgeslokt — geaccepteerd, B7-review vangt het
  expect(parseProductName(seg)).toMatchObject({ kelvin: 3000, maxWattage: 27 });
});

test("verrijkRegelsMetSegment: per pagina de juiste tekst, ontbrekende pagina = geen segment", () => {
  const regels = [
    { armatuurcode: "Lr301", pagina: 1 },
    { armatuurcode: "Lw001", pagina: 1 },
    { armatuurcode: "Xx999", pagina: 7 }, // pagina bestaat niet
  ];
  const verrijkt = verrijkRegelsMetSegment(regels, [
    { pageNumber: 1, text: PAGINA },
  ]);
  expect(verrijkt[0].segmentTekst).toContain("SASSO PRO 100");
  expect(verrijkt[1].segmentTekst).toContain("STRETTA WALL");
  expect(verrijkt[2].segmentTekst).toBeUndefined();
});

test("code niet in de paginatekst → geen segment, regel blijft ongemoeid", () => {
  const segmenten = vindRijSegmenten(PAGINA, ["Zz123"]);
  expect(segmenten.has("Zz123")).toBe(false);
});
