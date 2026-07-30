// Adversariële unit-tests op de tolerantietabel (docs/matching-regelset.md).
// Pure functies, geen DB. We toetsen de GRENZEN van elke tolerantie exact zoals de
// regelset ze vaststelt (W ±10%/±40%, lumen ±15%/±40%, beam ±10°/±25°, IP nooit lager,
// kelvin exact, maat exact/±5%, vorm exact) plus de harde regels (ontbrekend ≠ afwijkend,
// strengste telt).
import { expect, test } from "vitest";
import {
  fieldLabel,
  fieldLabelTitle,
  judgeWatt,
  judgeLumen,
  judgeBeamAngle,
  judgeIp,
  judgeKelvin,
  judgeCri,
  judgeSize,
  judgeShape,
  judgeDimmable,
  parseIp,
  normalizeSku,
  worstVerdict,
  hasRed,
  hasYellow,
  hasUnknown,
} from "./tolerances";
import type { MatchDeviation } from "@/db/schema";

// ── Vermogen: ±10% groen, 10–40% geel, >40% rood ─────────────────────────────
test("watt: 10%-grens is groen, net erboven geel, 40%-grens geel, erboven rood", () => {
  expect(judgeWatt(100, 100)).toBe("groen"); // exact
  expect(judgeWatt(100, 110)).toBe("groen"); // precies +10%
  expect(judgeWatt(100, 90)).toBe("groen"); // symmetrisch -10%
  expect(judgeWatt(100, 111)).toBe("geel"); // net boven 10%
  expect(judgeWatt(100, 140)).toBe("geel"); // precies +40%
  expect(judgeWatt(100, 141)).toBe("rood"); // net boven 40%
  expect(judgeWatt(100, 200)).toBe("rood");
});

test("watt: ontbrekende geleverde waarde is onbekend, nooit rood", () => {
  expect(judgeWatt(100, null)).toBe("onbekend");
});

// ── Lumen: ±15% groen, 15–40% geel, >40% rood ────────────────────────────────
test("lumen: 15%-grens groen, erboven geel, 40%-grens geel, erboven rood", () => {
  expect(judgeLumen(1000, 1150)).toBe("groen"); // +15%
  expect(judgeLumen(1000, 850)).toBe("groen"); // -15%
  expect(judgeLumen(1000, 1151)).toBe("geel");
  expect(judgeLumen(1000, 1400)).toBe("geel"); // +40%
  expect(judgeLumen(1000, 1401)).toBe("rood");
});

test("lumen: ontbrekend = onbekend", () => {
  expect(judgeLumen(1000, null)).toBe("onbekend");
});

// ── Beam angle: ±10° groen, 10–25° geel, >25° rood (absoluut, in graden) ──────
test("beam angle: 10°-grens groen, erboven geel, 25°-grens geel, erboven rood", () => {
  expect(judgeBeamAngle(30, 30)).toBe("groen");
  expect(judgeBeamAngle(30, 40)).toBe("groen"); // +10°
  expect(judgeBeamAngle(30, 20)).toBe("groen"); // -10°
  expect(judgeBeamAngle(30, 41)).toBe("geel"); // +11°
  expect(judgeBeamAngle(30, 55)).toBe("geel"); // +25°
  expect(judgeBeamAngle(30, 56)).toBe("rood"); // +26°
});

// ── IP-klasse: nooit lager dan gevraagd ──────────────────────────────────────
test("IP: lager dan gevraagd = ALTIJD rood, gelijk of hoger = groen (geen geel)", () => {
  expect(judgeIp("IP44", "IP20")).toBe("rood"); // lager → rood
  expect(judgeIp("IP20", "IP44")).toBe("groen"); // hoger → voldoet
  expect(judgeIp("IP44", "IP44")).toBe("groen"); // gelijk → voldoet
  expect(judgeIp("IP65", "IP54")).toBe("rood"); // net lager → rood, geen tolerantie
});

test("IP: parser leest IP20/ip 44/44 en faalt veilig naar onbekend", () => {
  expect(parseIp("IP20")).toBe(20);
  expect(parseIp("ip 44")).toBe(44);
  expect(parseIp("65")).toBe(65);
  expect(parseIp("onleesbaar")).toBeNull();
  expect(judgeIp("IP44", null)).toBe("onbekend"); // geen data → onbekend, niet rood
  expect(judgeIp("onbekend", "IP44")).toBe("onbekend"); // gevraagde onleesbaar → geen oordeel
});

// ── Kleurtemperatuur: exact ───────────────────────────────────────────────────
test("kelvin: exact groen, elke afwijking rood (geen geel), ontbrekend onbekend", () => {
  expect(judgeKelvin(3000, 3000)).toBe("groen");
  expect(judgeKelvin(3000, 2700)).toBe("rood");
  expect(judgeKelvin(3000, 3001)).toBe("rood"); // ook 1K verschil = rood
  expect(judgeKelvin(3000, null)).toBe("onbekend");
});

// ── Lengte/afmeting: exact groen, <±5% geel, >5% rood ────────────────────────
test("afmeting: exact groen, binnen 5% geel, daarboven rood", () => {
  expect(judgeSize(100, 100)).toBe("groen"); // exact
  expect(judgeSize(100, 104)).toBe("geel"); // 4%
  expect(judgeSize(100, 96)).toBe("geel"); // -4%
  expect(judgeSize(100, 106)).toBe("rood"); // 6%
  expect(judgeSize(100, null)).toBe("onbekend");
});

// ── Vorm: exact (genormaliseerd), geen conversie ─────────────────────────────
test("vorm: gelijk (na normalisatie) groen, anders rood, ontbrekend onbekend", () => {
  expect(judgeShape("rond", "round")).toBe("groen"); // alias
  expect(judgeShape("vierkant", "square")).toBe("groen");
  expect(judgeShape("rond", "vierkant")).toBe("rood"); // geen conversie
  expect(judgeShape("rond", null)).toBe("onbekend");
});

// ── CRI (minimum) en dimbaarheid (protocol) — aannames uit HANDOVER ───────────
test("cri: gelijk of hoger groen, lager rood, ontbrekend onbekend", () => {
  expect(judgeCri(90, 90)).toBe("groen");
  expect(judgeCri(90, 95)).toBe("groen");
  expect(judgeCri(90, 80)).toBe("rood");
  expect(judgeCri(90, null)).toBe("onbekend");
});

test("dimbaarheid: match groen, ander protocol geel, ontbrekend onbekend", () => {
  expect(judgeDimmable("DALI", "DALI")).toBe("groen");
  expect(judgeDimmable("DALI", "1-10V")).toBe("geel");
  expect(judgeDimmable("DALI", null)).toBe("onbekend");
});

// ── Strengste telt + SKU-normalisatie ────────────────────────────────────────
test("worstVerdict: rood > geel > onbekend > groen", () => {
  const dev = (verdict: MatchDeviation["verdict"]): MatchDeviation => ({
    field: "x",
    requested: "a",
    delivered: "b",
    verdict,
  });
  expect(worstVerdict([dev("groen"), dev("geel"), dev("rood")])).toBe("rood");
  expect(worstVerdict([dev("groen"), dev("geel"), dev("onbekend")])).toBe("geel");
  expect(worstVerdict([dev("groen"), dev("onbekend")])).toBe("onbekend");
  expect(worstVerdict([dev("groen"), dev("groen")])).toBe("groen");
  expect(worstVerdict([])).toBe("groen");
  expect(hasRed([dev("rood")])).toBe(true);
  expect(hasYellow([dev("geel")])).toBe(true);
  expect(hasUnknown([dev("onbekend")])).toBe(true);
});

test("SKU-normalisatie: interpunctie/spaties/case genegeerd", () => {
  expect(normalizeSku("SAS100-BK")).toBe("sas100bk");
  expect(normalizeSku("SAS100.BK")).toBe("sas100bk");
  expect(normalizeSku("sas 100 bk")).toBe("sas100bk");
});

// ── UX-audit 30 jul (bug #8): veldlabels voor de UI ──────────────────────────
// FIELD_LABELS bestond al, maar was privé en werd alleen gebruikt om note-zinnen te
// bouwen — de schermen toonden de ruwe sleutel. De fallback is de kern: een sleutel die
// hier ontbreekt mag NOOIT als camelCase-identifier op het scherm belanden.
test("fieldLabel: bekende sleutels krijgen hun vastgelegde label", () => {
  expect(fieldLabel("beamAngle")).toBe("beam angle");
  expect(fieldLabel("dimmable")).toBe("dimmability");
  expect(fieldLabel("cri")).toBe("CRI");
  expect(fieldLabel("ip")).toBe("IP");
});

test("fieldLabel: een onbekende sleutel wordt een zin, geen identifier", () => {
  // camelCase valt uit elkaar…
  expect(fieldLabel("kleurWeergaveIndex")).toBe("kleur weergave index");
  // …net als snake_case en kebab-case.
  expect(fieldLabel("nieuw_veld")).toBe("nieuw veld");
  expect(fieldLabel("nieuw-veld")).toBe("nieuw veld");
  // Cijfers blijven bij hun woord staan.
  expect(fieldLabel("tier2Source")).toBe("tier2 source");
});

// REPARATIE 30 jul, bevinding 3: de Field-kolom liet vier conventies in vier rijen zien
// (`kelvin` · `Straalhoek` · `IP` · `beam angle`) omdat de mapwaarden klein zijn en de
// fallback een hoofdletter zette. Eén conventie: fieldLabel() is ALTIJD midden-in-de-zin,
// fieldLabelTitle() zet de hoofdletter op de rendersite.
test("fieldLabel is overal midden-in-de-zin, fieldLabelTitle overal begin-van-de-regel", () => {
  // Gemengde herkomst: uit de map, uit de fallback, en een afkorting.
  expect(["kelvin", "beamAngle", "straalhoek", "ip"].map(fieldLabel)).toEqual([
    "kelvin",
    "beam angle",
    "straalhoek",
    "IP",
  ]);
  expect(
    ["kelvin", "beamAngle", "straalhoek", "ip"].map(fieldLabelTitle),
  ).toEqual(["Kelvin", "Beam angle", "Straalhoek", "IP"]);
});

// REPARATIE 30 jul, bevinding 4: fieldLabel() had geen afkortingentabel terwijl zijn
// zusterfunctie eventLabel() die wél had. Gemeten vóór de fix: "Ip", "Cri", "Ugr",
// "Ip rating", "2700 k".
test("fieldLabel: afkortingen en eenheden blijven staan", () => {
  expect(fieldLabel("IP")).toBe("IP");
  expect(fieldLabel("CRI")).toBe("CRI");
  expect(fieldLabel("UGR")).toBe("UGR");
  expect(fieldLabel("IP_RATING")).toBe("IP rating");
  expect(fieldLabelTitle("IP_RATING")).toBe("IP rating");
  // Een getal met een eenheidsletter is geen woord: "2700K" wordt geen "2700 k".
  expect(fieldLabel("2700K")).toBe("2700K");
});

test("fieldLabel: degenereerde invoer valt terug op de sleutel zelf", () => {
  // Let op wat hier gemeten wordt: de lege string gaat er ook leeg weer uit. Dat is
  // "zichzelf", maar het IS een lege cel — het commentaar hier beweerde eerder het
  // tegenovergestelde van wat de assert doet. Aanroepers met een mogelijk lege sleutel
  // moeten dus zelf een streepje neerzetten.
  expect(fieldLabel("")).toBe("");
  expect(fieldLabel("_")).toBe("_");
  expect(fieldLabel("-")).toBe("-");
});
