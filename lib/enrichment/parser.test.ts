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

// ── Vier valse wattages (30 jul, gevonden door de agent-zwerm op Flos) ───────
// Alle vier zijn echte namen uit de catalogus. WATT_RE is `(\d+)\s*(?:watt|w)\b` en die
// spatie plus de losse `w` maken hem gulzig genoeg om een CRI, een typemaat, een lampvoet en
// een per-lichtbron-vermogen als wattage te lezen.
test("parseWatt zwijgt bij een CRI met een losse kleurcode-W erachter", () => {
  expect(parseProductName("UT SPOT DOW NT 86 FL DA LED ARR 3K C90 W").maxWattage).toBeUndefined();
});

test("parseWatt zwijgt bij een typemaat gevolgd door de kleurcode W-W", () => {
  expect(parseProductName("EASY KAP 80 W-W RND BLK DWLED ARRAY C95").maxWattage).toBeUndefined();
});

test("parseWatt zwijgt bij een lampvoet gevolgd door een kleurcode", () => {
  expect(
    parseProductName("EASY KAP 105 EVO WW RND QR-CBC51 GX5.3 W").maxWattage,
  ).toBeUndefined();
});

// Bij "12X3W" is 3 het vermogen per LED en 36 dat van het armatuur. Wij vullen NIET 36 in:
// dat zou een productbesluit zijn (twaalf bronnen in één armatuur, of een set van twaalf?) en
// de ijzeren regel is ontbrekend ≠ fout. Een lege kolom kan een betere bron later nog vullen.
test("parseWatt zwijgt bij meerdere lichtbronnen, maar niet bij één", () => {
  expect(parseProductName("CIRCLE OF LIGHT D300 LED 12X3W").maxWattage).toBeUndefined();
  expect(parseProductName("TEAR DROP MEDIUM TC-TEL 2X26W").maxWattage).toBeUndefined();
  // "1x10W" is ÉÉN lichtbron van 10 W — daar is 10 het juiste vermogen en zwijgen zou
  // 1.412 goede waarden kosten. Dit onderscheid kostte mij een meetfout van 87 rijen.
  expect(parseProductName("Works IP65 1x10W LED | Batten Light Fitting").maxWattage).toBe(10);
});

test("de reparatie raakt gewone namen niet", () => {
  expect(parseProductName("SASSO 100 17,9W 3000K").maxWattage).toBeCloseTo(17.9, 2);
  expect(parseProductName("EASY KAP 80 FIX RND BLACK PAR 16 GZ10 Max 8W").maxWattage).toBe(8);
  expect(parseProductName("ENTERO 24W DALI 2700K 36deg").maxWattage).toBe(24);
});

// ── De losse W is bijna nooit een eenheid (30 jul, zwerm op Wever & Ducré) ───
// Eén regel voor een familie die eerder als losse uitzonderingen groeide. Gemeten vóór het
// bouwen: 140 landende voorstellen catalogusbreed (W&D 134, Sylvania 4, Marset 2).
test("een typecode gevolgd door een losse W is geen wattage", () => {
  // GEWIJZIGD 30 jul: deze assertie eiste eerst `undefined` voor de RONY-naam. Dat was het
  // gedrag van de eerste, NAAMNIVEAU-versie van de regel, en die gooide met de verkeerde
  // waarde ook de goede weg — `max. 12W` staat gewoon in dezelfde naam. De spanversie slaat
  // alleen de valse span (PAR16 W) over en pakt de volgende kandidaat. Zie de test
  // "een valse span wordt overgeslagen, niet de hele naam".
  expect(
    parseProductName("RONY ADJUST CEILING REC 1.0 PAR16 W max. 12W GU10 100-240VAC").maxWattage,
  ).toBe(12);
  // Zonder tweede kandidaat blijft het resultaat leeg:
  expect(parseProductName("PLANO 1.0 SURF BOX PAR16 W").maxWattage).toBeUndefined();
  expect(parseProductName("EASY KAP 105 EVO WW RND QR-CBC51 GX5.3 W").maxWattage).toBeUndefined();
  expect(parseProductName("GINGER A XL42 W.CANOPY OAK").maxWattage).toBeUndefined();
  // Een IP-KLASSE als vermogen — dit vond de zwerm en het stond op geen enkele lijst.
  expect(parseProductName("LIFESAFE PRO TS 700 IP65 W EM3 NM DA").maxWattage).toBeUndefined();
});

test("een decimale typemaat met een losse W is geen wattage", () => {
  // Een écht decimaal vermogen schrijft de eenheid VAST ("17,9W"), nooit los.
  expect(parseProductName("ODREY SHADE 4.0 W").maxWattage).toBeUndefined();
  expect(parseProductName("ILANE CEILING SURF 2.0 W 2.0m").maxWattage).toBeUndefined();
  expect(parseProductName("1-PHASE TRACK ADAPTER 1.0 W for suspended").maxWattage).toBeUndefined();
});

test("de regel raakt de twee vormen NIET waar het getal wél het vermogen is", () => {
  // De letter vóór het getal is hier de vermenigvuldigings-x: 10 W is het vermogen van één
  // lichtbron. 87 gevallen, TossB 84 — zwijgen zou die allemaal kosten.
  expect(parseProductName("Works IP65 1x10W LED | Batten Light Fitting").maxWattage).toBe(10);
  // En hier zit de W VAST aan het getal, dus is hij de eenheid: een T5-buis van 13 W.
  expect(parseProductName("F13W T5 fluorscentie lamp 840 Aircraft").maxWattage).toBe(13);
  expect(parseProductName("Molla Vetri Componi200W").maxWattage).toBe(200);
});

// ── Per span beoordelen, niet per naam (30 jul, tweede versie) ───────────────
// De eerste versie wees de hele naam af zodra er ergens een typemaat-W in stond. Gemeten:
// 16 namen verloren daardoor een AANWEZIGE juiste waarde. Erger nog, het produceerde precies
// de willekeur die dit spoor moest wegnemen — twee producten uit één familie kregen een
// verschillende uitkomst omdat de kleurcode toevallig W was.
test("een valse span wordt overgeslagen, niet de hele naam", () => {
  expect(parseProductName("SIRRO SPOT INSET 1.0 W max. 12W").maxWattage).toBe(12);
  expect(parseProductName("BOX INNER REFLECTOR 1.0 W max. 10W").maxWattage).toBe(10);
  expect(
    parseProductName("RONY ADJUST CEILING REC 1.0 PAR16 W max. 12W GU10").maxWattage,
  ).toBe(12);
});

test("dezelfde familie geeft dezelfde uitkomst, ongeacht de kleurcode", () => {
  // Dit is de willekeurtoets. B en W zijn kleurcodes; het armatuur is hetzelfde.
  const b = parseProductName("SUSP SINGLE CEILING BASE SURF 1.1 B ROUND incl. driver 4W");
  const w = parseProductName("SUSP SINGLE CEILING BASE SURF 1.1 W ROUND incl. driver 4W");
  // De KERN van deze test is de symmetrie: de kleurcode mag de uitkomst niet bepalen.
  expect(b.maxWattage).toBe(w.maxWattage);
  // GEWIJZIGD 30 jul: de verwachte waarde was 4, en dat was toen juist. Inmiddels weten we dat
  // die 4 het vermogen van de MEEGELEVERDE DRIVER is (40 producten, alle W&D, geen daarvan
  // draagt daarnaast een eigen wattage), dus het juiste antwoord is voor allebei leeg. De
  // symmetrie-assertie erboven is onveranderd en blijft de eigenlijke bewaker.
  expect(b.maxWattage).toBeUndefined();

  // Een armatuur mét fitting houdt zijn lampbelasting wél, ook symmetrisch over de kleurcode.
  expect(parseProductName("BLIEK CEILING REC 1.0 PAR16 B max. 12W GU10").maxWattage).toBe(
    parseProductName("BLIEK CEILING REC 1.0 PAR16 W max. 12W GU10").maxWattage,
  );
});

test("zonder tweede kandidaat blijft de naam zwijgen", () => {
  expect(parseProductName("ODREY SHADE 4.0 W").maxWattage).toBeUndefined();
  expect(parseProductName("UT SPOT DOW NT 86 FL DA LED ARR 3K C90 W").maxWattage).toBeUndefined();
});

// ── "incl. driver 4W" is het vermogen van de driver ─────────────────────────
// Gevonden bij het uitsplitsen van de 145 waarden die de span-versie terugwon: 132 daarvan
// waren terecht (`max. 12W` bij een GU10-fitting), 13 brachten een waarde terug die de zwerm
// al had afgekeurd. Gemeten: 40 producten, alle Wever & Ducré, en geen enkele draagt daarnaast
// een eigen wattage — een plafondbasis heeft er ook geen.
test("een wattage direct achter 'incl. driver' hoort bij de driver", () => {
  for (const n of [
    "SUSP SINGLE CEILING BASE SURF 1.1 B ROUND incl. driver 4W",
    "SUSP SINGLE CEILING BASE SURF 1.1 W ROUND incl. driver 4W",
    "3-PHASE TRACK ADAPTER 1.1 W incl. driver 10W 250mA",
  ]) {
    expect(parseProductName(n).maxWattage).toBeUndefined();
  }
});

test("een armatuur dat zijn driver alleen VERMELDT houdt zijn eigen wattage", () => {
  // Kreon heeft 1.806 van deze vorm: "driver incl." zónder getal ernaast. De 12W is het
  // armatuur. Het verschil met de regel hierboven is de volgorde in de tekst.
  expect(parseProductName("Esprit floor, marble base, driver incl., carrara 12W").maxWattage).toBe(12);
});

test("de lampbelasting bij een fitting blijft gewoon staan", () => {
  expect(parseProductName("BLIEK CEILING REC 1.0 PAR16 W max. 12W GU10 100-240VAC").maxWattage).toBe(12);
  expect(parseProductName("BISHOP CEILING SUSP 4.0 E27 W max. 25W A60/G95").maxWattage).toBe(25);
});
