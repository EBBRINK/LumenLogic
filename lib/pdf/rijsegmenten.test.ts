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

// ── Code achteraan de rij (offerteaanvraag) ─────────────────────────────────
// Gemeten in docs/probleem-artikelnummer-matching.md, meting 3: bij een
// offerteaanvraag (kolommen omschrijving · artikelnummer · aantal) staat de
// code ACHTERAAN, en dan levert "van de code tot het volgende anker" de staart
// van de eigen rij plus de omschrijving van de vólgende. De Delta Light-
// driverregel kreeg zo IP50 van een Trizo21-regel en 2700K van de regel erboven.
//
// Deze pagina is letterlijk de tekstlaag van scripts/gen-test-offerteaanvraag.ts,
// pagina 2 — de fixture waar de meting op draaide.
const AANVRAAG =
  "Deltalight\n" +
  "Omschrijving Artikelnummer Aantal\n" +
  "Plafond semi-recessed LUNELLE 52 Clip LED6W 2700K Bruin Brons 92730 BRBB 32812 9220 BRBB 14\n" +
  "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar 21012 0298 14\n" +
  "Trizo21\n" +
  "Omschrijving Artikelnummer Aantal\n" +
  "Wand opbouw Trizo21 BOULO W in MATT Glass LED9W 2700K IP50 (voor betonnen wand) BLWIM 1122 6\n" +
  "LED Driver Triac 230V D 3WT 6";

test("code achteraan: een segment blijft binnen zijn eigen rij", () => {
  const segmenten = vindRijSegmenten(AANVRAAG, [
    "32812 9220 BRBB",
    "21012 0298",
    "BLWIM 1122",
  ]);
  // De driver heeft in zijn eigen regel géén kleurtemperatuur en géén IP staan.
  // Vóór deze fix stond hier kelvin 2700 (van de regel erboven) en IP50 (van
  // Trizo21, twee blokken lager) — de gemeten oorzaak van een foute match.
  const driver = segmenten.get("21012 0298")!;
  expect(driver).not.toContain("Trizo21");
  expect(parseProductName(driver)).toEqual({ maxWattage: 20 });
  // De buurregels houden hun éigen specs — er gaat niets verloren.
  expect(parseProductName(segmenten.get("32812 9220 BRBB")!)).toMatchObject({
    maxWattage: 6,
    kelvin: 2700,
  });
  expect(parseProductName(segmenten.get("BLWIM 1122")!)).toMatchObject({
    maxWattage: 9,
    kelvin: 2700,
    ipValue: "IP50",
  });
});

test("code vooraan blijft de oude snede houden — ook met één afwijkend anker", () => {
  // De layout-toets is een meerderheid over de héle pagina, geen regel per code.
  // Zonder die meerderheid zou één code midden in een zin het armaturenboek-pad
  // omzetten, en daar loopt een rij over veel tekstregels: gemeten verliezen dan
  // 108 van 108 segmenten al hun specvelden.
  const pagina = PAGINA.replace("Lr301 Raadzaal", "Lr301 Raadzaal") + "\nzie ook Lw001 in de legenda";
  const segmenten = vindRijSegmenten(pagina, ["Lr301", "Lw001"]);
  expect(segmenten.get("Lr301")!.startsWith("Lr301 ")).toBe(true);
  expect(parseProductName(segmenten.get("Lr301")!)).toMatchObject({
    maxWattage: 27,
    kelvin: 3000,
    ipValue: "IP20",
  });
});

test("offerteaanvraag: het artikelnummer komt heel mee en de specs blijven eigen", async () => {
  // De hele keten van modelregel → SpecLineInput, met een code die spaties draagt.
  // Vóór 11 aug hield `fixture_code` er "21012" van over en verdween "0298"; de specs
  // kwamen deels van een regel van een ánder merk.
  const modelregels = [
    {
      armatuurcode: "21012 0298",
      merk: "Deltalight",
      type: "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar",
      ruweTekst:
        "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar 21012 0298 14",
      codeValid: false,
      artikelnummer: "21012 0298",
      pagina: 2,
    },
  ];
  const verrijkt = verrijkRegelsMetSegment(
    modelregels.map((r) => ({ ...r, pagina: 2 })),
    [{ pageNumber: 2, text: AANVRAAG }],
  );
  const regel = regelToSpecLine(
    modelregels[0] as OcrRegel,
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    verrijkt[0].segmentTekst,
  );

  // De code compleet, in beide velden — fixture_code is in dit documenttype de
  // identificatie van de regel (besluit Timo), req_article_code is wat de matcher leest.
  expect(regel.fixtureCode).toBe("21012 0298");
  expect(regel.reqArticleCode).toBe("21012 0298");
  // Zijn eigen 20 W, en géén kleurtemperatuur of IP van de buren.
  expect(regel.reqWatt).toBe(20);
  expect(regel.reqKelvin).toBeNull();
  expect(regel.reqIp).toBeNull();
});

// ── Het artikelnummer compleet maken (rechtergrens) ─────────────────────────
// Gemeten: het model levert het nummer soms half. "21012 0298" kwam binnen als
// "21012", "BLWIM 1122" als "BLWIM". Twee promptrondes kregen dat niet dicht;
// de rechtergrens is wél hard — het aantal is het laatste veld van de rij.

function aanvraagRegel(over: Partial<OcrRegel> = {}): OcrRegel {
  return {
    armatuurcode: "21012 0298",
    merk: "Deltalight",
    type: "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar",
    ruweTekst:
      "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar 21012 0298 14",
    codeValid: false,
    aantal: 14,
    artikelnummer: "21012 0298",
    ...over,
  } as OcrRegel;
}

const DRIVERREGEL =
  "LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar 21012 0298 14";

test("half geleverd artikelnummer wordt aangevuld tot aan het aantal", () => {
  const regel = regelToSpecLine(
    aanvraagRegel({ artikelnummer: "21012" }),
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    DRIVERREGEL,
  );
  expect(regel.reqArticleCode).toBe("21012 0298");
  // Eén bron: de code op de regel komt uit hetzelfde veld, nooit meer twee waarheden.
  expect(regel.fixtureCode).toBe("21012 0298");
});

test("een compleet artikelnummer blijft ongemoeid — nooit het aantal erbij", () => {
  const regel = regelToSpecLine(
    aanvraagRegel(),
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    DRIVERREGEL,
  );
  expect(regel.reqArticleCode).toBe("21012 0298");
});

test("het model spreekt zichzelf tegen → het artikelnummer wint van de armatuurcode", () => {
  // Gemeten op de LUNELLE-regel: artikelnummer juist, armatuurcode een stuk uit de
  // omschrijving. Vóór deze fix stond dat verkeerde stuk op het scherm.
  const rij =
    "Plafond semi-recessed LUNELLE 52 Clip LED6W 2700K Bruin Brons 92730 BRBB 32812 9220 BRBB 14";
  const regel = regelToSpecLine(
    aanvraagRegel({
      armatuurcode: "92730 BRBB",
      artikelnummer: "32812 9220 BRBB",
      type: "Plafond semi-recessed LUNELLE 52 Clip LED6W 2700K Bruin Brons",
      ruweTekst: rij,
    }),
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    rij,
  );
  expect(regel.fixtureCode).toBe("32812 9220 BRBB");
  expect(regel.reqArticleCode).toBe("32812 9220 BRBB");
  // ⚠️ De linkergrens wordt NIET geraden: de omschrijving eindigt hier zelf op
  // "92730 BRBB", dus naar links doorlopen zou dat meeslikken.
  expect(regel.reqArticleCode).not.toContain("92730");
});

test("een armaturenboek levert geen artikelnummer en houdt zijn positiecode", () => {
  const regel = regelToSpecLine(
    regel301(),
    1,
    crypto.randomUUID(),
    ["XAL"],
    undefined,
  );
  expect(regel.fixtureCode).toBe("Lr301");
  expect(regel.reqArticleCode).toBeNull();
});

function regel301(): OcrRegel {
  return {
    armatuurcode: "Lr301",
    merk: "XAL",
    type: "SASSO PRO 100",
    ruweTekst: "Lr301 XAL SASSO PRO 100 3000K IP20",
    codeValid: true,
    aantal: null,
  } as OcrRegel;
}

test("geen bewijsbare rechtergrens → niets verlengen", () => {
  // Geen aantal gelezen: dan weten we niet waar het veld ophoudt. Een halve code is
  // beter dan een code met de staart van de rij eraan geplakt.
  const regel = regelToSpecLine(
    aanvraagRegel({ artikelnummer: "21012", aantal: null }),
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    DRIVERREGEL,
  );
  expect(regel.reqArticleCode).toBe("21012");
});

test("aantal klopt niet met de staart van de rij → niets verlengen", () => {
  const regel = regelToSpecLine(
    aanvraagRegel({ artikelnummer: "21012", aantal: 7 }),
    2,
    crypto.randomUUID(),
    ["Deltalight"],
    DRIVERREGEL, // eindigt op "14", niet op "7"
  );
  expect(regel.reqArticleCode).toBe("21012");
});
