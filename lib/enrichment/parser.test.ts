// H-03: deterministische naam-parser. Kern: echte catalogus-namen correct ontleden en —
// belangrijker — nooit een gokwaarde afgeven (ontbrekend ≠ fout).
import { expect, test } from "vitest";
import { FIELDS, parseProductName } from "@/lib/enrichment/parser";

test("SASSO — watt (komma-decimaal), kelvin en DALI; de kale 1500 blijft ongeparsed", () => {
  const s = parseProductName("SASSO 100 RD FL SUSP 1500 DALI 17,9W 3000K");
  expect(s.maxWattage).toBe(17.9);
  expect(s.kelvin).toBe(3000);
  expect(s.dimmable).toBe("DALI");
  // 1500 is dubbelzinnig (maat óf lumen) → geen expliciete 'lm' → bewust niet als lumen
  expect(s.lumenOutput).toBeUndefined();
  // 100 is geen kelvin (buiten bereik, geen K) en geen watt
  expect(s.beamAngle).toBeUndefined();
});

test("VELA — watt, kelvin, cri, ip en beam angle samen", () => {
  const s = parseProductName("VELA ROUND 600 24W 4000K CRI90 IP44 36deg");
  expect(s.maxWattage).toBe(24);
  expect(s.kelvin).toBe(4000);
  expect(s.cri).toBe(90);
  expect(s.ipValue).toBe("IP44");
  expect(s.beamAngle).toBe(36);
  // 600 zonder 'lm' → geen lumen
  expect(s.lumenOutput).toBeUndefined();
});

test("watt met punt-decimaal en 'Watt'-schrijfwijze", () => {
  expect(parseProductName("DOWNLIGHT 12.5W").maxWattage).toBe(12.5);
  expect(parseProductName("SPOT 9 Watt 2700K").maxWattage).toBe(9);
});

test("lege / niets-herkenbare naam → leeg object", () => {
  const s = parseProductName("SNOOT LONG 100 FOR SASSO 100 / KARO 100");
  expect(s).toEqual({});
  expect(parseProductName("")).toEqual({});
});

test("kelvin buiten 2000–8000 wordt genegeerd", () => {
  expect(parseProductName("UV LAMP 9000K").kelvin).toBeUndefined();
  expect(parseProductName("WARM 1500K").kelvin).toBeUndefined();
  expect(parseProductName("PANEL 2700 K").kelvin).toBe(2700); // spatie + ondergrens
  expect(parseProductName("HIGHBAY 8000k").kelvin).toBe(8000); // bovengrens + lowercase
});

test("IP-varianten normaliseren naar IPxx", () => {
  expect(parseProductName("BOLLARD IP65").ipValue).toBe("IP65");
  expect(parseProductName("WALL IP 44").ipValue).toBe("IP44");
  expect(parseProductName("TRACK IP20 3000K").ipValue).toBe("IP20");
});

test("cri via CRI, Ra en met ≥/>=", () => {
  expect(parseProductName("STRIP Ra90").cri).toBe(90);
  expect(parseProductName("LINEAR CRI≥80").cri).toBe(80);
  expect(parseProductName("PANEL CRI >= 97").cri).toBe(97);
  expect(parseProductName("COB CRI100").cri).toBe(100);
});

// OCR-armaturenboeken zetten vaak een dubbele punt tussen label en waarde
// ("CRI: ≥90", "IP: 44") — de regex moet die ":" tussen label en ≥-teken tolereren.
test("cri met OCR-labelstijl dubbele punt", () => {
  expect(parseProductName("SASSO CRI: ≥ 90").cri).toBe(90);
  expect(parseProductName("SASSO CRI:90").cri).toBe(90); // zonder spaties
  expect(parseProductName("SASSO Ra: 95").cri).toBe(95);
  // regressie: de oude vorm zonder dubbele punt blijft werken
  expect(parseProductName("SASSO CRI ≥ 90").cri).toBe(90);
});

test("ip-waarde met OCR-labelstijl dubbele punt", () => {
  expect(parseProductName("WALL IP: 44").ipValue).toBe("IP44");
  expect(parseProductName("WALL IP:65").ipValue).toBe("IP65"); // zonder spaties
  // regressie: de oude vorm zonder dubbele punt blijft werken
  expect(parseProductName("BOLLARD IP 44").ipValue).toBe("IP44");
});

// Watt/kelvin/beam angle/lumen ankeren niet op het labelwoord zelf (bv. "Vermogen",
// "Kleurtemperatuur") maar op getal+eenheid — een dubbele punt vóór het label speelt
// daarom geen rol. Test dit expliciet zodat het gedrag toekomstbestendig is vastgelegd.
test("watt/kelvin/beam angle/lumen blijven werken met een labelstijl dubbele punt ervoor", () => {
  expect(parseProductName("Vermogen: 17,9 W").maxWattage).toBe(17.9);
  expect(parseProductName("Kleurtemperatuur: 3000K").kelvin).toBe(3000);
  expect(parseProductName("Bundelhoek: 36deg").beamAngle).toBe(36);
  expect(parseProductName("Lichtstroom: 1200 lumen").lumenOutput).toBe(1200);
});

test("beam angle via deg, ° en 'graden'", () => {
  expect(parseProductName("SPOT 24deg").beamAngle).toBe(24);
  expect(parseProductName("SPOT 60°").beamAngle).toBe(60);
  expect(parseProductName("SPOT 15 graden").beamAngle).toBe(15);
});

test("lumen alleen met expliciete eenheid", () => {
  expect(parseProductName("PANEL 3600lm 4000K").lumenOutput).toBe(3600);
  expect(parseProductName("DOWNLIGHT 1200 lumen").lumenOutput).toBe(1200);
  // los getal zonder eenheid → geen lumen
  expect(parseProductName("PANEL 600 4000K").lumenOutput).toBeUndefined();
});

test("dimprotocollen: DALI/TRIAC/PHASE/1-10V/DIM, specifiek vóór generiek", () => {
  expect(parseProductName("DRIVER 1-10V 24W").dimmable).toBe("1-10V");
  expect(parseProductName("DIM TRIAC LED").dimmable).toBe("TRIAC"); // TRIAC wint van kaal DIM
  expect(parseProductName("PHASE CUT SPOT").dimmable).toBe("PHASE");
  expect(parseProductName("DIMMABLE SPOT").dimmable).toBe("DIM");
  expect(parseProductName("FIXED 4000K").dimmable).toBeUndefined();
});

test("meerdere kale getallen leiden nergens toe zonder eenheid/label", () => {
  const s = parseProductName("MODULE 100 200 300 400");
  expect(s).toEqual({});
});

test("FIELDS bevat exact de zeven ondersteunde velden en presence = geparsed", () => {
  expect([...FIELDS]).toEqual([
    "maxWattage",
    "kelvin",
    "cri",
    "ipValue",
    "beamAngle",
    "lumenOutput",
    "dimmable",
  ]);
  // per-veld "geparsed?" = key aanwezig; niet-herkende velden zitten er niet in
  const s = parseProductName("SPOT 24W");
  expect(Object.keys(s)).toEqual(["maxWattage"]);
  expect("kelvin" in s).toBe(false);
});
