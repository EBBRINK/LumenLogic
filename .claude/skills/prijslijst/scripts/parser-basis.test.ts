// LETTERLIJKE KOPIE uit productie (lumenlogic/lib/enrichment/parser.test.ts), stand 9786dc5.
// Alleen de imports zijn aangepast: vitest → bun:test, en @/lib/enrichment → ./.
//
// Waarom deze kopie in de skill zit: `parser.ts` en `verdenking.ts` zijn hier een FORK met
// skill-lokale patches (zie PARSERVERSIE). Deze suite bewaakt dat die patches geen bestaand
// gedrag breken; `parser.test.ts` ernaast bewaakt de patches zelf. Loopt hier iets rood, dan
// is de fork uit de pas gelopen met productie en niet andersom.
// H-03: deterministische naam-parser. Kern: echte catalogus-namen correct ontleden en —
// belangrijker — nooit een gokwaarde afgeven (ontbrekend ≠ fout).
import { expect, test } from "bun:test";
import { FIELDS, parseProductName } from "./parser";

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

// ── Vermenigvuldiging mét bereik, en vermogen per meter (vierde zwermronde) ──
test("2x6/9W levert niets: 9 is het vermogen per module, niet van het armatuur", () => {
  // Gemeten 122 producten, alle W&D. Het 2.0-armatuur draagt er twee, dus 18 W — de parser las
  // 9 en dat is structureel de helft te laag. De 1.0-variant zonder vermenigvuldiging klopt wél.
  expect(
    parseProductName("RON CEILING REC 2.0 LED 2700K B 2X6/9W 350/500mA 17V CRI90").maxWattage,
  ).toBeUndefined();
  expect(
    parseProductName("RONY ADJUST CEILING REC 1.0 LED 2700K B 6/9W 350/500mA 17V").maxWattage,
  ).toBe(9);
});

test("een vermogen per meter is geen armatuurvermogen", () => {
  // 147 producten (Kreon 113, W&D 20, XAL 14). Het totaal hangt van de lengte af.
  expect(
    parseProductName("JANE 2000 IP40 LIGHT ROPE 14,4W/M LED 3000K 48VDC").maxWattage,
  ).toBeUndefined();
  // Vaste-lengtevarianten dragen wél een totaal en blijven staan.
  expect(parseProductName("ILANE CEILING REC 2.0m LED 3000K 30W 48V CRI90").maxWattage).toBe(30);
});

// ── De W die bij het volgende woord hoort (31 jul) ──────────────────────────
// Timo vond in de CLS-steekproef: `CLS LDC-407 W-DMX 1-4 kanaals 700mA LED driver` kreeg
// maxWattage 407. De 407 is het typenummer LDC-407 en de W hoort bij W-DMX, het draadloze
// DMX-protocol. Een 4-kanaals 700 mA driver zit rond de 50 W.
//
// De regel die dit vangt bestond al in smallere vorm (`W-W`, de kleurcode warm-white) en is
// veralgemeend naar élk letterachtervoegsel. Catalogusbreed dragen 1.173 namen die vorm en geen
// ervan is een vermogen: 48× `W-W`, 1.124 XAL-bestelcodes en deze ene driver.
test("een W met een koppelteken en letters erachter is geen eenheid", () => {
  expect(parseProductName("CLS LDC-407 W-DMX 1-4 kanaals 700mA LED driver").maxWattage).toBeUndefined();
  expect(parseProductName("EASY KAP 80 W-W RND GOLD DW LED ARRAY C95 13W").maxWattage).toBe(13);
  // XAL's bestelcode: 305W- is de code, 12,5W het echte vermogen even verderop.
  expect(
    parseProductName("UNICO-000 305W-E040-E040 XAL UNICO L2 BASIC CEIL 12,5W 3000K").maxWattage,
  ).toBe(12.5);
});

// De keerzijde: een W die gewoon de eenheid is mag niet sneuvelen.
test("een gewone wattage blijft staan, ook naast koppeltekens elders in de naam", () => {
  expect(parseProductName("PANEL 40W 3000K DALI").maxWattage).toBe(40);
  expect(parseProductName("SPOT 1x10W 3000K").maxWattage).toBe(10);
  expect(parseProductName("STREX SUSP 1.0 LED 8W 2700K B-B 220-240VAC").maxWattage).toBe(8);
  expect(parseProductName("DOWNLIGHT 24V 12W 3000K 1-10V DIM").maxWattage).toBe(12);
});

// ── Flos' korte kleurcode (4 aug) ───────────────────────────────────────────
// "30KC90" = 3000 K, CRI 90. Elke naam hieronder staat letterlijk zo in de catalogus; de
// vertaling zelf is niet geraden maar afgelezen uit vijf productlijnen die BEIDE notaties
// dragen (zie de meting bij KELVIN_KORT_RE in parser.ts).
test("korte kleurcode — twee cijfers is ×100, één cijfer is ×1000", () => {
  expect(parseProductName("L.SHADOW SPOT MRM WH 30KC90 SP")).toMatchObject({ kelvin: 3000, cri: 90 });
  expect(parseProductName("L.SHADOW SPOT MRM BK 27KC90 MD")).toMatchObject({ kelvin: 2700, cri: 90 });
  expect(parseProductName("WORKM.SUSP. UP&DW HE AP T-LED 35K C90 WF")).toMatchObject({ kelvin: 3500, cri: 90 });
  expect(parseProductName("UT SPOT TR 57 BLACK FL LED ARR 3K C90 DA")).toMatchObject({ kelvin: 3000, cri: 90 });
  expect(parseProductName("INFINITY 25 SURFACE L1000 4K C90 AN.SILV")).toMatchObject({ kelvin: 4000, cri: 90 });
  expect(parseProductName("GLOWING TR SUSP. L1200 BK 22K90 CB")).toMatchObject({ kelvin: 2200, cri: 90 });
  expect(parseProductName("SPOT MRM WHT POWER LED 50K C90 MD")).toMatchObject({ kelvin: 5000, cri: 90 });
});

// De CRI zonder C ertussen, vastgeplakt achter de kelvin. HC is géén CRI-aanduiding: van de
// 624 HC-namen dragen er 312 een 90 en 312 een 98, dus het getal is de variabele en HC een
// vaste optiecode van de WORKM-lijn.
test("korte kleurcode — de CRI mag zonder C, ook met een lettercode erachter", () => {
  expect(parseProductName("WORKM.IN-TR LARGE FS BK 40K98HC")).toMatchObject({ kelvin: 4000, cri: 98 });
  expect(parseProductName("WORKM.TR SMALL HE BK 30K90HC DA")).toMatchObject({ kelvin: 3000, cri: 90 });
  expect(parseProductName("MY SPOT 25-S ZRT PRO BK 27K90SP NODIM")).toMatchObject({ kelvin: 2700, cri: 90 });
});

// De kale vorm zonder CRI. Komt vooral voor doordat Flos-namen op 40 tekens worden afgekapt
// (6.424 van de 18.263 namen zijn exact 40 lang), waardoor het CRI-deel wegvalt.
test("korte kleurcode — kale vorm levert wél kelvin en géén geraden CRI", () => {
  const s = parseProductName("JOHNNY80 1L TRIM RND BK SPPOWER LED 27K");
  expect(s.kelvin).toBe(2700);
  expect(s.cri).toBeUndefined();
});

// De C-vorm die los staat, zonder K ervoor.
test("losse C-vorm is CRI, naast een kelvin in de lange notatie", () => {
  expect(parseProductName("UT SPOT TRACK 86 WHITE LED ARR C80 3000K")).toMatchObject({ kelvin: 3000, cri: 80 });
  expect(parseProductName("EASY KAP 80 W-W RND GOLD DW LED ARRAY C95 13W").cri).toBe(95);
});

// ── Wat de regel bewust NIET leest ──────────────────────────────────────────
// Alle vier gemeten valse positieven uit de catalogus. Ze zijn het bestaansrecht van de twee
// eisen (K vast aan het getal, en géén letter direct achter de K).
test("korte kleurcode — kilolumen, typecodes en hoeken blijven ongelezen", () => {
  // Sylvania's kilolumen: 68 namen. "19KLM" is 19.000 lumen, geen 1900 K.
  expect(parseProductName("KUBIXX 4000K 19KLM SMAL PIR").kelvin).toBe(4000);
  expect(parseProductName("RAIDEN IP66 40KLM 830 A-SYMMETRISCH").kelvin).toBeUndefined();
  expect(parseProductName("Areum Floor 14KLM 92W 13700lm 840 Alu").kelvin).toBeUndefined();
  // Een spatie vóór de K: de enige Flos-naam met die vorm is een driver, geen armatuur.
  expect(parseProductName("ALIM.LED AC/DC TCI MP32 K2110-240V 50/60").kelvin).toBeUndefined();
  // Artemide's 90° is een HOEK. 101 namen; met een spatie-tolerantie na de C zou dit CRI 90 worden.
  const hoek = parseProductName("A.24 C 90° CORNER DIFF. MOD. 3000K WHITE");
  expect(hoek.kelvin).toBe(3000);
  expect(hoek.cri).toBeUndefined();
  // De C uit een woord ("ECLECTIC 90") of uit een bestelcode — nooit een CRI.
  expect(parseProductName("ECLECTIC 90 FIX CONE BL LED-A 27K C90 SP")).toMatchObject({ kelvin: 2700, cri: 90 });
  expect(parseProductName("EASY KAP 80 ADJ.RND BLACK QR-CBC51 GX5.3").cri).toBeUndefined();
  expect(parseProductName("PROLONGADOR T INTER. DALI BLANCO XTSC 635-3").cri).toBeUndefined();
  expect(parseProductName("DRIVER HELVAR LC43MINI-CC-300-1050 CON T").cri).toBeUndefined();
  // Onder de 80 is elke kale C<nn> in deze catalogus een maat- of typecode.
  expect(parseProductName("DISCOCO C 68 WHITE").cri).toBeUndefined();
  expect(parseProductName("DRO 2.0 SUSPENSION SET E14 B max. 6W C35 220-240VAC").cri).toBeUndefined();
  // Buiten 2000–8000 blijft de kelvin leeg, ook in de korte vorm.
  expect(parseProductName("PANEL 19K C90").kelvin).toBeUndefined();
  expect(parseProductName("PANEL 9K C90").kelvin).toBeUndefined();
});

// De lange vorm moet zich exact gedragen als vóór deze wijziging: geen enkele naam in de
// catalogus combineert de twee vormen met een verschillende waarde (gemeten: 0 van 18.263).
test("de lange vorm blijft leidend en verandert niet", () => {
  expect(parseProductName("FIND ME 2 BLACK POWER LED 3000K CRI90")).toMatchObject({ kelvin: 3000, cri: 90 });
  expect(parseProductName("JUNCOS 250MM BLACK 3000K CRI 80 2.2W")).toMatchObject({ kelvin: 3000, cri: 80 });
});
