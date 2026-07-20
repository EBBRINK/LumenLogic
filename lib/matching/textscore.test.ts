// Puur (geen DB): het positiegewicht dat de tekstrelevantie-ordening stuurt.
import { expect, test } from "vitest";
import { tokenWeight } from "./textscore";

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
