// De valpositie mag de val niet verraden. Zie de toelichting in zwerm-meng.ts.
import { describe, expect, it } from "vitest";
import { meng } from "./zwerm-meng";

/** Deterministische pseudo-hash; de suite draait in de browser, dus geen node:crypto. */
function hash(s: string): Uint8Array {
  const uit = new Uint8Array(32);
  let h = 0x811c9dc5;
  for (let i = 0; i < 32; i++) {
    for (let j = i; j < s.length; j += 32) h = Math.imul(h ^ s.charCodeAt(j), 0x01000193) >>> 0;
    uit[i] = (h ^ (h >>> 13)) & 0xff;
  }
  return uit;
}

const echt = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ veld: "cri", waarde: String(80 + (i % 20)), id: `e${i}` }));
const nep = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ veld: "cri", waarde: "99", id: `v${i}` }));

/** Posities (0-gebaseerd) van de ingevoegde cellen in de gemengde lijst. */
const posities = (gemengd: { id: string }[]) =>
  gemengd.flatMap((c, i) => (c.id.startsWith("v") ? [i] : []));

describe("meng", () => {
  it("levert elke cel precies één keer terug en houdt de volgorde van de echte cellen", () => {
    const e = echt(197);
    const v = nep(9);
    const uit = meng(e, v, hash);
    expect(uit).toHaveLength(206);
    expect(uit.filter((c) => c.id.startsWith("v")).map((c) => c.id)).toEqual(v.map((c) => c.id));
    expect(uit.filter((c) => c.id.startsWith("e")).map((c) => c.id)).toEqual(e.map((c) => c.id));
  });

  it("plaatst de vallen NIET op een vaste stap — dit is de bug uit de Kreon-scherf", () => {
    // Oud gedrag: stap = floor(197 / 10) = 19 ⇒ posities 19, 39, 59 … oftewel c0020, c0040, …
    const p = posities(meng(echt(197), nep(9), hash));
    const afstanden = p.slice(1).map((x, i) => x - p[i]);
    expect(new Set(afstanden).size).toBeGreaterThan(1);
    expect(p.every((x) => (x + 1) % 20 === 0)).toBe(false);
  });

  it("houdt ze wél over de hele scherf gespreid — precies één per emmer", () => {
    const p = posities(meng(echt(200), nep(10), hash));
    expect(p).toHaveLength(10);
    p.forEach((pos, i) => {
      // emmer i beslaat de echte cellen [i*20, i*20+19]; eerder ingevoegde cellen schuiven de
      // index met maximaal i op.
      expect(pos).toBeGreaterThanOrEqual(i * 20 + i);
      expect(pos).toBeLessThanOrEqual((i + 1) * 20 + i);
    });
  });

  it("is reproduceerbaar: dezelfde invoer geeft dezelfde scherf", () => {
    expect(posities(meng(echt(197), nep(9), hash))).toEqual(
      posities(meng(echt(197), nep(9), hash)),
    );
  });

  it("verschilt zodra de inhoud van de echte cellen verschilt", () => {
    const e = echt(197);
    const anders = e.map((c, i) => (i === 3 ? { ...c, waarde: "97" } : c));
    expect(posities(meng(e, nep(9), hash))).not.toEqual(posities(meng(anders, nep(9), hash)));
  });

  it("verdraagt de randgevallen: geen extra, en meer extra dan echte cellen", () => {
    expect(meng(echt(5), [], hash)).toHaveLength(5);
    expect(meng(echt(3), nep(7), hash)).toHaveLength(10);
    expect(meng([], nep(3), hash)).toHaveLength(3);
  });
});
