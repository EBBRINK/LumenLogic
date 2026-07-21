// Puur (geen DB): het positiegewicht dat de tekstrelevantie-ordening stuurt.
import { expect, test } from "vitest";
import {
  suppressedFieldsFor,
  tokenizeWithSpans,
  tokenWeight,
} from "./textscore";
import { specSpans } from "@/lib/enrichment/parser";

test("token 0 (de typeaanduiding) weegt 1,0", () => {
  expect(tokenWeight(0)).toBe(1);
});

test("het gewicht loopt strikt monotoon af — vroeg identificeert, laat is proza", () => {
  const ws = [0, 1, 2, 3, 10, 50].map(tokenWeight);
  for (let i = 1; i < ws.length; i++) {
    expect(ws[i]).toBeLessThan(ws[i - 1]);
  }
});

test("late tokens tellen nog steeds mee (zwak positief, nooit nul of negatief)", () => {
  expect(tokenWeight(100)).toBeGreaterThan(0);
});

test("de eerste twee tokens samen verslaan elk later enkel token — familie wint", () => {
  // SASSO(0) + PRO(1) moet zwaarder wegen dan één willekeurig generiek token verderop,
  // zodat een generiek-token-rijk vreemd product de typeaanduiding niet inhaalt.
  expect(tokenWeight(0) + tokenWeight(1)).toBeGreaterThan(tokenWeight(3));
});

// ── Dubbeltelling-poort (docs/goal-wattage-dubbeltelling.md) ─────────────────

// Helper: welke tokens zouden onderdrukt worden voor deze gevraagde velden?
function onderdrukt(text: string, velden: string[]): string[] {
  const spans = specSpans(text);
  const set = new Set(velden);
  return tokenizeWithSpans(text)
    .map((t, i) => (suppressedFieldsFor(t, i, spans, set).length > 0 ? t.text : null))
    .filter((x): x is string => x !== null);
}

test("de wattage-token wordt onderdrukt als watt gevraagd is", () => {
  const t = "SASSO PRO 100 LED 2810 lm 104 lm/W 27 W 3000K";
  expect(onderdrukt(t, ["maxWattage"])).toContain("27");
});

test("'100' in SASSO PRO 100 blijft ALTIJD staan — de valkuil", () => {
  const t = "SASSO PRO 100 LED 2810 lm 27 W 3000K";
  // niet onderdrukt als watt gevraagd is (100 is geen wattage-span)…
  expect(onderdrukt(t, ["maxWattage"])).not.toContain("100");
  // …en ook niet als er niets gevraagd is
  expect(onderdrukt(t, [])).toEqual([]);
});

test("'L90' is levensduur, geen CRI — niet onderdrukken", () => {
  const t = "SASSO PRO 100 3000K CRI 90 SDCM 3 L90 50.000 uur";
  const uit = onderdrukt(t, ["cri"]);
  expect(uit).not.toContain("L90");
  expect(uit).toContain("90"); // de échte CRI-waarde wél
});

test("een veld dat NIET gevraagd is, onderdrukt niets", () => {
  const t = "SASSO PRO 100 27 W 3000K";
  expect(onderdrukt(t, ["kelvin"])).not.toContain("27");
  expect(onderdrukt(t, ["kelvin"])).toContain("3000K");
});

test("posities 0 en 1 zijn onaantastbaar (Bega's 24786W is een typenummer)", () => {
  const t = "24786W BEGA downlight 3000K";
  expect(onderdrukt(t, ["maxWattage"])).not.toContain("24786W");
});

test("tokenizeWithSpans reproduceert exact de tokenlijst van fetchCandidates", () => {
  for (const t of [
    "SASSO PRO 100 FL ADJ DALI 27W",
    "  dubbele   spaties en een A losse letter  ",
    "",
  ]) {
    expect(tokenizeWithSpans(t).map((x) => x.text)).toEqual(
      t.split(/\s+/).filter((x) => x.length >= 2),
    );
  }
});
