// Het voorfilter moet de benoemde faalvormen vangen én van echte namen afblijven. Elke test
// hieronder is één faalvorm uit docs/probleem-steekproef-zwerm.md.
import { expect, test } from "vitest";
import { parseProductName } from "./parser";
import { verdenkingen, vormenMetMeerdereWaarden } from "./verdenking";

const vlaggen = (naam: string) =>
  verdenkingen(naam, parseProductName(naam)).map((v) => `${v.veld}:${v.soort}`);

test("schone XAL-naam levert geen enkele verdenking", () => {
  expect(vlaggen("SASSO 60 RD 150 SP CRI90 SUSP 1500 10,2W cob LED 2700K 220-240V")).toEqual([]);
  expect(vlaggen("FINA SPOT LINE 100 RD SP CRI95 1,4W LED 3000K 24VDC")).toEqual([]);
});

// De ernstigste faalvorm, en sinds 30 jul BIJ DE BRON gerepareerd in plaats van gevlagd.
// Deze test las eerst `expect(...dimmable).toBe("DIM")` — hij legde de bug vast als gedrag.
// Gemeten aanleiding: 3.635 namen ontkennen dimbaarheid en 3.164 daarvan zouden op een lege
// kolom landen (XAL 2.810). Vlaggen was niet genoeg: `verdenking.ts` hangt aan nul
// productiepaden, dus die vlag hield niets tegen.
test("ontkenning: NON-DIM levert GEEN dimbaarheid meer", () => {
  for (const naam of [
    "SPOT 20W 3000K NON-DIM",
    "SPOT 20W 3000K NON DIM",
    "SPOT 20W 3000K NOT DIMMABLE",
    "SPOT 20W 3000K EXCL DIM",
    "THROUGH WIRING CONNECTION BOX NON DIM 3-POLE",
  ]) {
    expect(parseProductName(naam).dimmable).toBeUndefined();
  }
  // …en dus valt er ook niets meer te vlaggen: het filter mag geen verdenking verzinnen over
  // een veld dat leeg bleef. De vlagregel blijft in verdenking.ts staan als regressietoets.
  expect(vlaggen("SPOT 20W 3000K NON-DIM")).not.toContain("dimmable:ontkenning");
});

// De ontkenning wint óók van een expliciet protocol. Gemeten zijn dat 26 namen in de hele
// catalogus, en het zijn stuk voor stuk varianten-opsommingen: de naam somt op wát er
// leverbaar is, dus voor dít artikel is geen van beide lezingen een feit.
test("ontkenning wint van een expliciet protocol (varianten-opsomming)", () => {
  expect(
    parseProductName("TRACK LINEAR CONNECTOR NON DIM/ZIGBEE/DALI 48VDC").dimmable,
  ).toBeUndefined();
  expect(
    parseProductName("MOVE IT 25 TRACK CURVE CONNECTOR R300 DALI NON DIM / DALI 48VDC").dimmable,
  ).toBeUndefined();
  // Tegenproef: zonder ontkenning blijft DALI gewoon DALI.
  expect(parseProductName("TRACK LINEAR CONNECTOR ZIGBEE/DALI 48VDC").dimmable).toBe("DALI");
});

// Tegenproef: "DIMMER" is géén dimbaarheidstoken voor de parser (\bDIM\b vereist een
// woordgrens en die zit niet tussen DIM en MER), dus daar valt niets te vlaggen. Het filter
// mag geen verdenking verzinnen over een veld dat leeg bleef.
test("EXCL. DIMMER levert geen dimbaarheid en dus geen vlag", () => {
  expect(parseProductName("SPOT 20W 3000K EXCL. DIMMER").dimmable).toBeUndefined();
  expect(vlaggen("SPOT 20W 3000K EXCL. DIMMER")).not.toContain("dimmable:ontkenning");
});

test("tunable white: bereik en losse aanduiding", () => {
  // "2700-6500K": alleen 6500 wordt door K gevolgd, dus de parser pakt die — willekeurig.
  expect(parseProductName("PANEL 40W 2700-6500K DALI").kelvin).toBe(6500);
  expect(vlaggen("PANEL 40W 2700-6500K DALI")).toContain("kelvin:bereik");
  expect(vlaggen("PANEL 40W 3000K TW DALI")).toContain("kelvin:tunable-white");
  expect(vlaggen("PANEL 40W 3000K DIM TO WARM")).toContain("kelvin:tunable-white");
});

test("meerdere waarden voor hetzelfde veld: de parser nam de eerste", () => {
  expect(vlaggen("DOWNLIGHT 3000K/4000K 20W")).toContain("kelvin:meerdere-waarden");
  expect(vlaggen("SPOT CRI80 CRI90 15W 3000K")).toContain("cri:meerdere-waarden");
  expect(vlaggen("WALL IP20 IP44 12W 3000K")).toContain("ipValue:meerdere-waarden");
  // Twee keer dezelfde waarde is herhaling van hetzelfde feit, geen twijfel.
  expect(vlaggen("SPOT CRI90 CRI90 15W 3000K")).not.toContain("cri:meerdere-waarden");
});

test("bundelhoek versus kantelhoek", () => {
  expect(vlaggen("SPOT 30° TILT 15W 3000K")).toContain("beamAngle:kantelhoek");
  expect(vlaggen("SPOT ADJUSTABLE 24° 15W 3000K")).toContain("beamAngle:kantelhoek");
  expect(vlaggen("SPOT 20-60° 15W 3000K")).toContain("beamAngle:bereik");
  expect(vlaggen("SPOT 24° 15W 3000K")).not.toContain("beamAngle:kantelhoek");
});

test("waarden buiten het gebruikelijke bereik", () => {
  // De parser accepteert CRI 1–100; 30 is technisch geldig maar praktisch onzin.
  expect(vlaggen("SPOT CRI30 15W 3000K")).toContain("cri:buiten-bereik");
  expect(vlaggen("SPOT 2000lm 15W 3000K IP99")).toContain("ipValue:onbekende-klasse");
});

test("accessoire-context vlagt élk gevuld veld van die naam", () => {
  const v = vlaggen("TRACK SPOT 15W 3000K EXCL DRIVER");
  expect(v).toContain("maxWattage:accessoire-context");
  expect(v).toContain("kelvin:accessoire-context");
});

test("afgekapte naam", () => {
  expect(vlaggen("SASSO 60 RD CRI90 10,2W 2700K -")).toContain("kelvin:afgekapt");
  expect(vlaggen("SASSO 60 RD CRI90 10,2W 2700K DALI")).not.toContain("kelvin:afgekapt");
});

// Over een leeg veld valt niets te zeggen — ontbrekend ≠ fout, ook hier niet.
test("velden die de parser niet vulde worden nooit gevlagd", () => {
  expect(vlaggen("MELAMPO BRONZE")).toEqual([]);
  expect(vlaggen("DISCOCO 53 BLACK/GOLD")).toEqual([]);
});

test("naamvormen met meerdere waarden", () => {
  const vormen = vormenMetMeerdereWaarden([
    { field: "cri", vorm: "spot # cri# #w", value: "80" },
    { field: "cri", vorm: "spot # cri# #w", value: "90" },
    { field: "cri", vorm: "lamp # cri# #w", value: "90" },
    { field: "cri", vorm: "lamp # cri# #w", value: "90" },
  ]);
  expect([...vormen.keys()]).toEqual(["cri|spot # cri# #w"]);
  expect(vormen.get("cri|spot # cri# #w")).toEqual(new Set(["80", "90"]));
});

// ── Het product IS zelf een onderdeel (30 jul, na de zwerm op Flos) ──────────
// Het verschil met `accessoire-context` is het hele punt: dat patroon matcht overal in de naam
// en vlagt 3.700 gewone armaturen die netjes vermelden dat hun driver meegeleverd is. Deze
// regel is verankerd aan het BEGIN en raakt 453 producten die werkelijk een los onderdeel zijn.
test("een voeding of driver aan het begin van de naam vlagt ELK veld", () => {
  const naam = "POW.SUPPLY SURF. 96W BK END ZEROTRACK PR";
  expect(vlaggen(naam)).toContain("maxWattage:product-is-onderdeel");

  // Meertalig: de zwerm vond de Italiaanse, Spaanse en afgekorte vormen, die de bestaande
  // Engelse woordenlijst allemaal miste.
  for (const n of [
    "ALIM.LED 24V-60W TRIAC 200-240V CVT-60-2",
    "ALIMENT.LED 24V-120W DC 90-305V 50/60Hz",
    "ALIMT.LED 24V-120W 0/1-10VPWM-120-24-OL3",
    "EQUIPO DC 20W 500mA WU S 110-240V",
    "TRANSF ALED-8W DC350mA/24VARDITI",
    "REMOTE KIT 150W GLOWING TR",
  ]) {
    expect(vlaggen(n).some((v) => v.endsWith(":product-is-onderdeel"))).toBe(true);
  }
});

test("een armatuur dat zijn driver alleen VERMELDT wordt niet als onderdeel gevlagd", () => {
  // Dit is de valse positief die het anker voorkomt: 3.700 gewone armaturen tegenover 453
  // echte onderdelen. Zonder anker zou dit product zijn wattage verliezen.
  const naam = "Esprit floor, marble base, driver incl., carrara 12W";
  expect(vlaggen(naam)).not.toContain("maxWattage:product-is-onderdeel");
  expect(parseProductName(naam).maxWattage).toBe(12);
});

test("een onderdeel laat ook zijn IP en dimprotocol vallen, niet alleen het vermogen", () => {
  // Zo'n doos BEZIT werkelijk een IP-klasse en een dimprotocol — alledrie waar over de doos,
  // alledrie onwaar over een armatuur. Gemeten is ipValue met 5,4 % zelfs het zwaarst geraakte
  // veld, niet maxWattage (0,3 %).
  const v = vlaggen("POWER SUPPLY BOX IP67 24V 50W TRIAC");
  expect(v).toContain("ipValue:product-is-onderdeel");
  expect(v).toContain("maxWattage:product-is-onderdeel");
  expect(v).toContain("dimmable:product-is-onderdeel");
});

// De bovengrens van maxWattage is gemeten, niet gekozen. Boven 999 W bestaat in deze catalogus
// geen echt armatuur — het zwaarste is 850 W. Van de 16 voorstellen daarboven zijn er 15
// railprofielen en is er 1 een typefout in de bronlijst (Sylvania Rocks 2254W bij 41.800 lm =
// 18,5 lm/W, waar diezelfde familie 177-189 lm/W haalt).
test("boven 999 W: railprofielen en typefouten vallen af, echte armaturen niet", () => {
  expect(vlaggen("T.MAGNET EVO SUSP. UP&DOWNPROFILE 1000 W")).toContain("maxWattage:buiten-bereik");
  expect(vlaggen("T.MAGNET EVO SURF-SUSP POTPROFILE 3000 W")).toContain("maxWattage:buiten-bereik");
  expect(vlaggen("Rocks IP65 2254W 41800lm 840 Breed SSA03N")).toContain("maxWattage:buiten-bereik");
  expect(vlaggen("Versus 4 LED 3K 850W Nero")).not.toContain("maxWattage:buiten-bereik");
  expect(vlaggen("Rocks IP65 142W 26000lm 840 Gang DALI")).not.toContain("maxWattage:buiten-bereik");
});

// Twee samenstellingen mogen ook verderop in de naam staan. Aanleiding: de zwerm vond
// `BELT SURF. POWER 96W 48V BLACK`, de voeding van het 48 V BELT-rail, die met de
// productfamilie begint en dus buiten het anker viel. Gemeten vóór het bouwen: precies één
// extra product in de hele catalogus, en geen enkele naam met een kaal "POWER".
test("POWER SUPPLY en SURF. POWER tellen ook verderop in de naam", () => {
  expect(vlaggen("BELT SURF. POWER 96W 48V BLACK")).toContain("maxWattage:product-is-onderdeel");
  expect(vlaggen("ZEROTRACK POWER SUPPLY 96W END")).toContain("maxWattage:product-is-onderdeel");
});

test("een kaal POWER in een armatuurnaam blijft ongemoeid", () => {
  // Dit is waarom de term een SAMENSTELLING moet zijn en niet het losse woord.
  expect(parseProductName("BON JOUR 45 BLACK POWER LED 2700K CRI90 8W").maxWattage).toBe(8);
  expect(vlaggen("BON JOUR 45 BLACK POWER LED 2700K CRI90 8W")).not.toContain(
    "maxWattage:product-is-onderdeel",
  );
  expect(vlaggen("A.24 C POWER KITXRCS/C MOD240WDM BLK APP")).not.toContain(
    "maxWattage:product-is-onderdeel",
  );
});

// ── Losse vervanglamp en driver-met-typecode (30 jul, zwerm op Wever & Ducré) ─
// Allebei vooraf gemeten, want allebei is het kale woord te grof.
test("een losse vervanglamp wordt als onderdeel gevlagd", () => {
  for (const n of [
    "LAMP A60 LED 2700K CLEAR / GOLD MIRROR 5.5W E27 220-240VAC",
    "LAMP. GX53 8W 4000K DIM",
    "LAMP PAR16 LED 3000K B CRI90 5W",
    "Lampadina E14 2700K",
  ]) {
    expect(vlaggen(n).some((v) => v.endsWith(":product-is-onderdeel"))).toBe(true);
  }
});

test("een armatuur dat toevallig met LAMP begint blijft ongemoeid", () => {
  // De valse positief die de fitting-eis voorkomt: dit zijn Italiaanse armatuurtypes —
  // sospensione (hang), parete (wand), tavolo (tafel), terra (vloer).
  for (const n of [
    "LAMP. SOSP. GIOVE 3000K 12W",
    "LAMP. PAR. VELA 102,5 CM 2700K",
    "LAMP. TAVOLO ALBA 3000K",
    "LAMPADA ESAGONALE 52 S - ALU",
    "LAMP SHADE",
  ]) {
    expect(vlaggen(n)).not.toContain("kelvin:product-is-onderdeel");
    expect(vlaggen(n)).not.toContain("maxWattage:product-is-onderdeel");
  }
  expect(parseProductName("LAMP. SOSP. GIOVE 3000K 12W").kelvin).toBe(3000);
});

test("een driver met typecode wordt gevlagd, een armatuur dat zijn driver noemt niet", () => {
  expect(
    vlaggen("STREX SURF IN TRACK DRIVER D4 100W B 48V 220-240VAC").some((v) =>
      v.endsWith(":product-is-onderdeel"),
    ),
  ).toBe(true);
  // Kreon heeft 1.806 van deze; het zijn gewone armaturen.
  expect(vlaggen("Esprit floor, marble base, driver incl., carrara 12W")).not.toContain(
    "maxWattage:product-is-onderdeel",
  );
});

// ── Eén bron van waarheid voor de wattage-kandidaten (30 jul, tweede correctie) ─
// De parser sloeg de valse span over terwijl dit filter hem nog als tweede kandidaat telde.
// Gevolg: "… 1.1 B ROUND incl. driver 4W" landde en "… 1.1 W ROUND incl. driver 4W" werd
// geweerd op `meerdere-waarden` — zelfde armatuur, andere kleurcode, andere uitkomst. Dat is
// het Muuto-bezwaar waarmee deze opdracht begon, een laag opgeschoven.
test("dezelfde familie krijgt dezelfde vlaggen, ongeacht de kleurcode", () => {
  const b = vlaggen("SUSP SINGLE CEILING BASE SURF 1.1 B ROUND incl. driver 4W");
  const w = vlaggen("SUSP SINGLE CEILING BASE SURF 1.1 W ROUND incl. driver 4W");
  expect(w).toEqual(b);
  expect(w).not.toContain("maxWattage:meerdere-waarden");
});

test("een typemaat is geen tweede wattage-kandidaat, een echt tweede wattage wel", () => {
  expect(vlaggen("RONY ADJUST CEILING REC 1.0 PAR16 W max. 12W GU10")).not.toContain(
    "maxWattage:meerdere-waarden",
  );
  // Tegenproef: twee échte wattages moeten nog steeds vlaggen.
  expect(vlaggen("SPOT CRI80 15W 3000K 20W")).toContain("maxWattage:meerdere-waarden");
});

// ── Kap/reflector met de lampbelasting van het armatuur eronder ──────────────
// De COMBINATIE doet het werk, niet de term. `SHADE` alleen is een valstrik: "ROOMOR WALL SURF
// 1.0 PAR16 B NO SHADE max. 15W GU10" is een écht armatuur (31 namen), en bij een armatuur mét
// fitting is "max. 15W" juist de geldige lampbelasting.
test("een kap of reflector met max.-opgave maar zonder fitting is een onderdeel", () => {
  for (const n of [
    "RAY INNER COVER A max. 10W",
    "BOX INNER REFLECTOR 1 D max. 10W",
    "BISHOP 4.0 SHADE D max. 25W",
    "FLEXFY LED PLUG NON DIM D max. 14W 48V",
  ]) {
    expect(vlaggen(n).some((v) => v.endsWith(":product-is-onderdeel"))).toBe(true);
  }
});

test("dezelfde termen bij een armatuur MET fitting blijven ongemoeid", () => {
  for (const n of [
    "ROOMOR WALL SURF 1.0 PAR16 B NO SHADE max. 15W GU10 100-240VAC",
    "BISHOP CEILING SUSP 4.0 E27 D max. 25W A60/G95 220-240VAC",
    "BLIEK CEILING REC 1.0 PAR16 W max. 12W GU10",
  ]) {
    expect(vlaggen(n)).not.toContain("maxWattage:product-is-onderdeel");
  }
  expect(parseProductName("BLIEK CEILING REC 1.0 PAR16 W max. 12W GU10").maxWattage).toBe(12);
});

test("besturingsapparatuur draagt de schakellast, niet een armatuurvermogen", () => {
  expect(
    vlaggen("DIMMER FOR DIN RAIL IP30 230V max. 200W LED PHASE CUT").some((v) =>
      v.endsWith(":product-is-onderdeel"),
    ),
  ).toBe(true);
  expect(
    vlaggen("STREX DALI SELV DEVICE max. 300W 48V").some((v) =>
      v.endsWith(":product-is-onderdeel"),
    ),
  ).toBe(true);
});

// Draadloze besturingsmodule, gevonden in de derde zwermronde. Gemeten: 48 namen met
// "WIRELESS … CONTROL", 4 met een landend wattage. Het KALE woord CONTROL mag niet — dat
// raakt 128 namen waaronder TossB's "ROUND CONTROL MINI Arm 550mm - 6W LED", een armatuur.
test("een draadloze besturingsmodule is een onderdeel, een armatuur met CONTROL in de naam niet", () => {
  expect(
    vlaggen("STREX WIRELESS CASAMBI CONTROL B 8W").some((v) => v.endsWith(":product-is-onderdeel")),
  ).toBe(true);
  expect(
    vlaggen("ROUND CONTROL MINI Arm 550mm - 6W LED 2700K - Dim Triac"),
  ).not.toContain("maxWattage:product-is-onderdeel");
  expect(parseProductName("ROUND CONTROL MINI Arm 550mm - 6W LED 2700K").maxWattage).toBe(6);
});

// INNER COVER/REFLECTOR is ONDUBBELZINNIG een los inzetstuk: de fitting die er soms bij staat
// is de lamp waarvoor het stuk bedoeld is, niet een fitting op dít product. Die kregen door de
// fitting-uitzondering eerst ten onrechte geen vlag — de zwerm wees ze aan.
test("een inner reflector is een onderdeel, ook als er een lamptype in de naam staat", () => {
  for (const n of [
    "BOX MINI PAR16 INNER REFLECTOR B max. 10W",
    "RAY INNER COVER A max. 10W",
    "DOCUS INNER COVER G max. 10W",
  ]) {
    expect(vlaggen(n).some((v) => v.endsWith(":product-is-onderdeel"))).toBe(true);
  }
  // SHADE blijft de fitting-uitzondering houden: dit is een écht armatuur.
  expect(
    vlaggen("ROOMOR WALL SURF 1.0 PAR16 B NO SHADE max. 15W GU10 100-240VAC"),
  ).not.toContain("maxWattage:product-is-onderdeel");
});
