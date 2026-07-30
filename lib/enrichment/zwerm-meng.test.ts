// De valpositie mag de val niet verraden. Zie de toelichting in zwerm-meng.ts.
import { describe, expect, it } from "vitest";
import { controleerVallen, meng, scheidTweelingen } from "./zwerm-meng";

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

describe("scheidTweelingen", () => {
  type C = { id: string; soort: "echt" | "val" | "tegenproef"; bron?: C };
  const soortVan = (c: C) => c.soort;
  const bronVan = (c: C) => c.bron ?? null;

  /** Bouwt een lijst waarin elke val direct naast zijn bron staat — de Lombardo-situatie. */
  function naastElkaar(nEcht: number, elke: number) {
    const rij: C[] = [];
    for (let i = 0; i < nEcht; i++) {
      const e: C = { id: `e${i}`, soort: "echt" };
      rij.push(e);
      if (i % elke === elke - 1) rij.push({ id: `v${i}`, soort: "val", bron: e });
    }
    return rij;
  }
  const scherf = (i: number, maat: number) => Math.floor(i / maat);
  function tweelingenInEenScherf(rij: C[], maat: number) {
    const pos = new Map<C, number>();
    rij.forEach((c, i) => pos.set(c, i));
    return rij.filter(
      (c) => c.soort === "val" && c.bron && scherf(pos.get(c)!, maat) === scherf(pos.get(c.bron)!, maat),
    ).length;
  }

  it("haalt de val bij zijn bron vandaan", () => {
    const maat = 50;
    const rij = naastElkaar(400, 20);
    expect(tweelingenInEenScherf(rij, maat)).toBeGreaterThan(15); // de bug
    const uit = scheidTweelingen(rij, maat, soortVan, bronVan);
    expect(tweelingenInEenScherf(uit.rij, maat)).toBe(0);
    expect(uit.rest).toBe(0);
    expect(uit.geruild).toBeGreaterThan(0);
  });

  it("verliest geen enkele cel en houdt de lengte gelijk", () => {
    const rij = naastElkaar(400, 20);
    const uit = scheidTweelingen(rij, 50, soortVan, bronVan);
    expect(uit.rij).toHaveLength(rij.length);
    expect(new Set(uit.rij.map((c) => c.id)).size).toBe(rij.length);
  });

  it("laat elke scherf vallen houden — recall blijft een uitspraak over élke scherf", () => {
    const maat = 50;
    const uit = scheidTweelingen(naastElkaar(400, 20), maat, soortVan, bronVan);
    const perScherf = new Map<number, number>();
    uit.rij.forEach((c, i) => {
      if (c.soort === "val") perScherf.set(scherf(i, maat), (perScherf.get(scherf(i, maat)) ?? 0) + 1);
    });
    const scherven = Math.ceil(uit.rij.length / maat);
    for (let s = 0; s < scherven; s++) expect(perScherf.get(s) ?? 0).toBeGreaterThan(0);
  });

  it("meldt eerlijk als er te weinig scherven zijn in plaats van stil te falen", () => {
    // Alles in één scherf: er ís geen andere scherf om naartoe te ruilen.
    const rij = naastElkaar(20, 10);
    const uit = scheidTweelingen(rij, 1000, soortVan, bronVan);
    expect(uit.geruild).toBe(0);
    expect(uit.rest).toBe(2);
  });

  it("is reproduceerbaar", () => {
    const a = scheidTweelingen(naastElkaar(400, 20), 50, soortVan, bronVan).rij.map((c) => c.id);
    const b = scheidTweelingen(naastElkaar(400, 20), 50, soortVan, bronVan).rij.map((c) => c.id);
    expect(a).toEqual(b);
  });
});

describe("scheidTweelingen — de ruil mag geen nieuwe tweeling maken", () => {
  type C = { id: string; soort: "echt" | "val" | "tegenproef"; bron?: C };
  it("gebruikt nooit een broncel als ruilpartner", () => {
    // Gezien bij XAL: 1 van de 11 vallen stond na de reparatie alsnog naast zijn bron, doordat
    // een latere ruil die bron in de scherf van een al verhuisde val zette.
    const maat = 10;
    const rij: C[] = [];
    for (let i = 0; i < 60; i++) {
      const e: C = { id: `e${i}`, soort: "echt" };
      rij.push(e);
      if (i % 6 === 5) rij.push({ id: `v${i}`, soort: "val", bron: e });
    }
    const uit = scheidTweelingen(rij, maat, (c) => c.soort, (c) => c.bron ?? null);
    const pos = new Map<C, number>();
    uit.rij.forEach((c, i) => pos.set(c, i));
    const naast = uit.rij.filter(
      (c) =>
        c.soort === "val" &&
        c.bron &&
        Math.floor(pos.get(c)! / maat) === Math.floor(pos.get(c.bron)! / maat),
    );
    expect(naast).toHaveLength(0);
  });
});

describe("scheidTweelingen — de verhuisde val mag niet vooraan klonteren", () => {
  type C = { id: string; soort: "echt" | "val" | "tegenproef"; bron?: C };
  it("spreidt de verhuisde vallen over de doelscherf", () => {
    // Gezien bij XAL: alle vijf de vallen van scherf 1 kwamen op positie 1–5 terecht en alle zes
    // van scherf 2 op 0–5, omdat de ruilpartner de laagste vrije index was. De agent zag ze
    // meteen ("allemaal direct na c0001, aan het begin van de scherf").
    const maat = 40;
    const rij: C[] = [];
    for (let i = 0; i < 240; i++) {
      const e: C = { id: `e${i}`, soort: "echt" };
      rij.push(e);
      if (i % 20 === 19) rij.push({ id: `v${i}`, soort: "val", bron: e });
    }
    const uit = scheidTweelingen(rij, maat, (c) => c.soort, (c) => c.bron ?? null);
    const binnenScherf = uit.rij.flatMap((c, i) => (c.soort === "val" ? [i % maat] : []));
    // niet allemaal in de eerste tien plekken van hun scherf
    expect(binnenScherf.filter((p) => p < 10).length).toBeLessThan(binnenScherf.length);
    expect(Math.max(...binnenScherf)).toBeGreaterThan(10);
  });
});

describe("controleerVallen — de vier lekken die we al een keer gemist hebben", () => {
  const cel = (id: string, vorm = id) => ({ id, vorm });
  const isVal = (c: { id: string }) => c.id.startsWith("v");
  const sleutel = (c: { vorm: string }) => c.vorm;
  /** n cellen waarvan die op de posities in `valOp` een val zijn. */
  const bouw = (n: number, valOp: number[], vormVan?: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => cel(valOp.includes(i) ? `v${i}` : `e${i}`, vormVan?.(i) ?? `vorm${i}`));

  it("zwijgt bij een gezonde scherf", () => {
    expect(controleerVallen([bouw(120, [7, 23, 44, 71, 103])], isVal, sleutel)).toEqual([]);
  });

  it("ziet de vaste stap terug (de Kreon-bug)", () => {
    const k = controleerVallen([bouw(200, [19, 39, 59, 79, 99])], isVal, sleutel);
    expect(k.join(" ")).toMatch(/VASTE STAP van 20/);
  });

  it("ziet de klontering vooraan (de XAL-bug)", () => {
    const k = controleerVallen([bouw(120, [0, 1, 2, 3, 4, 5])], isVal, sleutel);
    expect(k.join(" ")).toMatch(/klonteren/);
  });

  it("ziet de tweeling in dezelfde scherf (de Lombardo-bug)", () => {
    // v10 en e11 delen dezelfde vorm: dat is de val naast zijn origineel.
    const rij = bouw(120, [10, 30, 60, 95], (i) => (i === 10 || i === 11 ? "zelfde" : `vorm${i}`));
    const k = controleerVallen([rij], isVal, sleutel);
    expect(k.join(" ")).toMatch(/naast een cel met dezelfde naam en vorm/);
  });

  it("ziet een scherf zonder enkele val", () => {
    const k = controleerVallen([bouw(50, [])], isVal, sleutel);
    expect(k.join(" ")).toMatch(/geen enkele val/);
  });
});
