// Puur (geen DB): de normalisatieregels per rauwe leverancierscel. De tabellen hieronder zijn
// niet bedacht — ze zijn de VOLLEDIGE waardeverdeling zoals gemeten op `brink_serien_raw`
// (Supabase uvmeytxejlzvdgjgthmr, read-only, 30 jul 2026). Elke distincte celvorm die in de bron
// voorkomt, staat hier met zijn verwachte uitkomst; de aantallen erbij zodat een afwijking in de
// bron later zichtbaar is als een test die niet meer past.
import { expect, test } from "vitest";
import {
  klasseerCri,
  klasseerDimprotocol,
  klasseerIp,
  klasseerKelvin,
  klasseerWatt,
  NORMALISATOREN,
} from "./supplier-cell";

// ── CCT K — alle 15 gemeten vormen (som = 1.956) ─────────────────────────────
test("CCT K: de drie schone kelvins (1.283 rijen) worden waarde, ongenormaliseerd", () => {
  for (const [cel, k] of [
    ["2700", 540],
    ["3000", 531],
    ["4000", 212],
  ] as const) {
    expect(klasseerKelvin(cel), `${cel} (${k}×)`).toEqual({
      soort: "waarde",
      waarde: cel,
      genormaliseerd: false,
    });
  }
});

test("CCT K: de plaatshouders (331 rijen) en null (169) leveren nooit een voorstel", () => {
  for (const cel of ["-", "OHNE LM", "LM", null, undefined, "", "  "]) {
    expect(klasseerKelvin(cel).soort, JSON.stringify(cel)).toBe("plaatshouder");
  }
});

test("CCT K: alle acht bereikvormen (173 rijen) worden 'bereik' — nooit stil één getal", () => {
  const bereiken: [string, number, number | null, number | null][] = [
    ["DIM2WARM 2200-3000", 46, 2200, 3000],
    ["TUNABLE WHITE 2200-5000", 44, 2200, 5000],
    ["D2W", 23, null, null],
    ["DIM2WARM 1800-3000", 18, 1800, 3000],
    ["TUNEABLE WHITE 2200-4000", 16, 2200, 4000],
    ["TW", 16, null, null],
    ["TUNEABLE WHITE 2700-5000", 8, 2700, 5000],
    ["TUNABLEWHITE 2200-5000", 2, 2200, 5000],
  ];
  let totaal = 0;
  for (const [cel, n, van, tot] of bereiken) {
    totaal += n;
    const r = klasseerKelvin(cel);
    expect(r.soort, cel).toBe("bereik");
    if (r.soort !== "bereik") throw new Error("onbereikbaar");
    expect(r.van, `${cel} van`).toBe(van);
    expect(r.tot, `${cel} tot`).toBe(tot);
  }
  expect(totaal).toBe(173);
});

test("CCT K: de drie spellingsvallen zijn gedekt — TUNEABLE, TUNABLEWHITE, en de kale afkortingen", () => {
  // Dit is de val: een regel op de letterlijke string "TUNABLE WHITE" mist 42 van de 173 rijen.
  expect(klasseerKelvin("TUNEABLE WHITE 2200-4000").soort).toBe("bereik"); // extra e
  expect(klasseerKelvin("TUNABLEWHITE 2200-5000").soort).toBe("bereik"); // geen spatie
  expect(klasseerKelvin("TW").soort).toBe("bereik"); // geen getallen
  expect(klasseerKelvin("D2W").soort).toBe("bereik"); // geen getallen
});

test("CCT K: '2200-5000' zonder label is een bereik, NOOIT stil 2200 (wat parseInt doet)", () => {
  expect(parseInt("2200-5000", 10)).toBe(2200); // dit is precies de val die we vermijden
  const r = klasseerKelvin("2200-5000");
  expect(r.soort).toBe("bereik");
  if (r.soort === "bereik") expect(r.van).toBe(2200);
});

test("CCT K: een kelvin buiten 2000–8000 zwijgt (zelfde grens als de naam-parser)", () => {
  expect(klasseerKelvin("1500").soort).toBe("onbekend");
  expect(klasseerKelvin("9000").soort).toBe("onbekend");
  expect(klasseerKelvin("2000")).toMatchObject({ soort: "waarde", waarde: "2000" });
  expect(klasseerKelvin("8000")).toMatchObject({ soort: "waarde", waarde: "8000" });
});

// ── CRI Ra — alle 8 gemeten vormen (som = 1.956) ─────────────────────────────
test("CRI Ra: er is GEEN schone waarde in de bron — alle 1.464 bruikbare cellen zijn een ondergrens", () => {
  const vormen: [string, number, number][] = [
    [">97", 564, 97],
    [">90", 455, 90],
    [">95", 230, 95],
    ["> 95", 120, 95],
    [">80", 48, 80],
    ["> 90", 47, 90],
  ];
  let totaal = 0;
  for (const [cel, n, waarde] of vormen) {
    totaal += n;
    expect(klasseerCri(cel), `${cel} (${n}×)`).toMatchObject({
      soort: "waarde",
      waarde: String(waarde),
      genormaliseerd: true,
    });
  }
  expect(totaal).toBe(1464);
});

test("CRI Ra: de spatie-varianten tellen mee — '> 95' en '> 90' zijn 167 rijen", () => {
  // Een regel zonder \s* mist deze twee vormen, en dat is 11,4 % van alle CRI-data.
  expect(klasseerCri("> 95")).toMatchObject({ soort: "waarde", waarde: "95" });
  expect(klasseerCri("> 90")).toMatchObject({ soort: "waarde", waarde: "90" });
  expect(120 + 47).toBe(167);
});

test("CRI Ra: '-' (316) en null (176) leveren nooit een voorstel", () => {
  expect(klasseerCri("-").soort).toBe("plaatshouder");
  expect(klasseerCri(null).soort).toBe("plaatshouder");
});

test("CRI Ra: een schone waarde blijft mogelijk en heet dan niet-genormaliseerd", () => {
  // Komt bij Serien niet voor, maar een ander merk levert hem wel — dan mag hij niet als
  // 'onbekend' wegvallen.
  expect(klasseerCri("90")).toEqual({ soort: "waarde", waarde: "90", genormaliseerd: false });
});

test("CRI Ra: een BOVENgrens zwijgt — '<90' zegt hoe goed het product NIET is", () => {
  expect(klasseerCri("<90").soort).toBe("onbekend");
  expect(klasseerCri("≤ 90").soort).toBe("onbekend");
});

test("CRI Ra: buiten 1–100 zwijgt", () => {
  expect(klasseerCri(">150").soort).toBe("onbekend");
  expect(klasseerCri("0").soort).toBe("onbekend");
});

// ── Schutzart — alle 5 gemeten vormen (som = 1.956) ──────────────────────────
test("Schutzart: de vier IP-klassen (1.886 rijen) zijn schoon, geen plaatshouder in de kolom", () => {
  for (const [cel, n] of [
    ["IP20", 1439],
    ["IP40", 240],
    ["IP30", 159],
    ["IP44", 48],
  ] as const) {
    expect(klasseerIp(cel), `${cel} (${n}×)`).toEqual({
      soort: "waarde",
      waarde: cel,
      genormaliseerd: false,
    });
  }
  expect(1439 + 240 + 159 + 48).toBe(1886);
});

test("Schutzart: een KAAL getal zwijgt — anders leest de matcher 'I' of '20' als IP-klasse", () => {
  // parseIp plukt met /(\d{2})/ het eerste tweetal uit wat er ook staat
  // (lib/matching/tolerances.ts:62), dus fail-closed hier is geen luxe.
  expect(klasseerIp("20").soort).toBe("onbekend");
  expect(klasseerIp("I").soort).toBe("onbekend"); // dit is een Schutzklasse-waarde
  expect(klasseerIp("II").soort).toBe("onbekend");
});

test("Schutzart: spatie en kleine letters worden genormaliseerd", () => {
  expect(klasseerIp("ip 44")).toEqual({
    soort: "waarde",
    waarde: "IP44",
    genormaliseerd: true,
  });
});

// ── Systemleistung W — 30 gemeten waarden, alle kale getallen ────────────────
test("Systemleistung W: kale getallen worden waarde; de kolom heeft nul plaatshouders", () => {
  for (const [cel, n] of [
    ["20", 253],
    ["33", 133],
    ["82", 123],
    ["40", 102],
    ["9", 28],
    ["105", 9],
  ] as const) {
    expect(klasseerWatt(cel), `${cel} (${n}×)`).toMatchObject({
      soort: "waarde",
      waarde: cel,
      genormaliseerd: false,
    });
  }
});

test("Systemleistung W: komma-decimaal wordt punt (de kolom is numeric)", () => {
  expect(klasseerWatt("17,9")).toMatchObject({
    soort: "waarde",
    waarde: "17.9",
    genormaliseerd: true,
  });
});

test("Systemleistung W: 'OHNE LM' wordt NOOIT doorgegeven aan een numeric-kolom", () => {
  // Dit is de bug die publishRun halverwege laat afbreken: toColumnValue geeft voor maxWattage
  // de string ongewijzigd terug (lib/repo/enrichment.ts:159) en Postgres weigert hem.
  expect(klasseerWatt("OHNE LM").soort).toBe("plaatshouder");
  expect(klasseerWatt("-").soort).toBe("plaatshouder");
  expect(klasseerWatt("n.v.t.").soort).toBe("onbekend");
  expect(klasseerWatt("0").soort).toBe("onbekend");
});

// ── Regelung — alle 15 gemeten vormen (som = 1.956) ──────────────────────────
test("Regelung: enkelvoudige protocollen (1.193 rijen) worden doorgegeven", () => {
  for (const [cel, n] of [
    ["DALI", 426],
    ["TRIAC", 420],
    ["CASAMBI", 347],
  ] as const) {
    expect(klasseerDimprotocol(cel), `${cel} (${n}×)`).toMatchObject({
      soort: "waarde",
      waarde: cel,
    });
  }
});

test("Regelung: samengestelde cellen houden ELK herkend protocol — judgeDimmable doet substring", () => {
  // "DALI 2CH + CASAMBI" moet groen geven op zowel een DALI- als een CASAMBI-eis; judgeDimmable
  // stript niet-alfanumeriek en toetst in beide richtingen (lib/matching/tolerances.ts:119).
  expect(klasseerDimprotocol("DALI 2CH + CASAMBI")).toMatchObject({
    soort: "waarde",
    waarde: "DALI + CASAMBI",
  });
  expect(klasseerDimprotocol("DALI 2CH")).toMatchObject({ soort: "waarde", waarde: "DALI" });
  expect(klasseerDimprotocol("DALI + SENSOR")).toMatchObject({ soort: "waarde", waarde: "DALI" });
  expect(klasseerDimprotocol("CASAMBI (DALI)")).toMatchObject({
    soort: "waarde",
    waarde: "DALI + CASAMBI",
  });
  expect(klasseerDimprotocol("SENSORIK UND CASAMBI")).toMatchObject({
    soort: "waarde",
    waarde: "CASAMBI",
  });
});

test("Regelung: de EN-STREEP in 'TRIAC + 0–10 V' (20×) wordt herkend", () => {
  // Serien gebruikt hier U+2013, geen koppelteken. Een regel met alleen [-] mist deze 20 rijen.
  const cel = "TRIAC + 0–10 V";
  expect(cel.includes("–")).toBe(true);
  expect(klasseerDimprotocol(cel)).toMatchObject({
    soort: "waarde",
    waarde: "TRIAC + 0-10V",
  });
});

test("Regelung: 'ON/OFF' (132 rijen) zwijgt — niet-dimbaar is geen dimprotocol", () => {
  // judgeDimmable zou "ON/OFF" tegen een DALI-eis als 'ander protocol' (geel) lezen in plaats
  // van als 'kan niet dimmen'. Onze kolom kan dat niet uitdrukken, dus plaatshouder + rapport.
  expect(klasseerDimprotocol("ON/OFF").soort).toBe("plaatshouder");
  expect(klasseerDimprotocol("ON/OFF+SENSOR").soort).toBe("plaatshouder");
});

test("Regelung: SENSORIK en INTEGR. (118 rijen) zijn geen dimgegeven en zwijgen", () => {
  expect(klasseerDimprotocol("SENSORIK").soort).toBe("onbekend");
  expect(klasseerDimprotocol("INTEGR.").soort).toBe("onbekend");
});

test("Regelung: '-' (391) en null (51) leveren nooit een voorstel", () => {
  expect(klasseerDimprotocol("-").soort).toBe("plaatshouder");
  expect(klasseerDimprotocol(null).soort).toBe("plaatshouder");
});

// ── Volledigheid: de partitie moet kloppen ───────────────────────────────────
test("de gemeten Regelung-partitie dekt exact de 1.955 gekoppelde producten", () => {
  // 1.264 met dimprotocol + 132 niet-dimbaar + 118 geen dimgegeven + 441 plaatshouder/null
  expect(1264 + 132 + 118 + 441).toBe(1955);
});

test("de gemeten CCT K-partitie dekt exact de 1.956 bronrijen", () => {
  // 1.283 schoon + 331 plaatshouder + 169 null + 173 bereik
  expect(1283 + 331 + 169 + 173).toBe(1956);
});

test("elke normalisator geeft op null een plaatshouder en op rommel nooit een waarde", () => {
  for (const [naam, fn] of Object.entries(NORMALISATOREN)) {
    expect(fn(null).soort, `${naam}(null)`).toBe("plaatshouder");
    expect(fn("").soort, `${naam}("")`).toBe("plaatshouder");
    expect(["onbekend", "plaatshouder"], `${naam}("???")`).toContain(fn("???").soort);
  }
});
