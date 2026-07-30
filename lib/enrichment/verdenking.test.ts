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

// De ernstigste: de parser leest 'DIM' uit 'NON-DIM' omdat het streepje een woordgrens is.
test("ontkenning: NON-DIM leest als dimbaar en moet gevlagd worden", () => {
  expect(parseProductName("SPOT 20W 3000K NON-DIM").dimmable).toBe("DIM");
  expect(vlaggen("SPOT 20W 3000K NON-DIM")).toContain("dimmable:ontkenning");
  expect(vlaggen("SPOT 20W 3000K NOT DIMMABLE")).toContain("dimmable:ontkenning");
  expect(vlaggen("SPOT 20W 3000K EXCL DIM")).toContain("dimmable:ontkenning");
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
