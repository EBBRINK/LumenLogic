// Consistentietoetsen op de grondwaarheid-config (puur, geen DB, geen PDF's):
// de aantallen kloppen (31/49/20/18), codes zijn uniek, en elke mapping verwijst
// alleen naar codes die de case ook echt kent. Zo kan de config nooit stilletjes
// uit de pas lopen met wat het meetscript (scripts/eval-testset.ts) verwacht.
import { expect, test } from "vitest";
import { GRONDWAARHEID, grondwaarheidByKey } from "./grondwaarheid";

const VERWACHTE_N: Record<string, number> = {
  raadhuis: 31,
  kvk: 49,
  tno: 20,
  dordrecht: 18,
};

test("alle vier cases bestaan, met de juiste N", () => {
  expect(GRONDWAARHEID.map((c) => c.key).sort()).toEqual(
    ["dordrecht", "kvk", "raadhuis", "tno"],
  );
  for (const [key, n] of Object.entries(VERWACHTE_N)) {
    const c = grondwaarheidByKey(key);
    expect(c, key).toBeDefined();
    expect(c!.codes.length, `${key}: N`).toBe(n);
  }
});

test("codes zijn uniek binnen elke case", () => {
  for (const c of GRONDWAARHEID) {
    expect(new Set(c.codes).size, `${c.key}: dubbele codes`).toBe(c.codes.length);
  }
});

test("keuze-codes zijn een deelverzameling van de codes, artikelCodes nooit leeg", () => {
  for (const c of GRONDWAARHEID) {
    for (const [code, k] of Object.entries(c.keuze)) {
      expect(c.codes, `${c.key}: keuze-code ${code} onbekend`).toContain(code);
      expect(k.artikelCodes.length, `${c.key}/${code}: lege artikelCodes`).toBeGreaterThan(0);
      for (const ac of k.artikelCodes) {
        expect(ac.trim().length, `${c.key}/${code}: lege artikelcode`).toBeGreaterThan(0);
      }
      expect(["zeker", "setje"]).toContain(k.zekerheid);
      expect(k.herkomst.trim().length, `${c.key}/${code}: herkomst leeg`).toBeGreaterThan(0);
    }
  }
});

test("verwachtMerkPerCode-codes zijn een deelverzameling van de codes", () => {
  for (const c of GRONDWAARHEID) {
    for (const [code, merk] of Object.entries(c.verwachtMerkPerCode)) {
      expect(c.codes, `${c.key}: merk-code ${code} onbekend`).toContain(code);
      expect(merk.trim().length, `${c.key}/${code}: leeg merk`).toBeGreaterThan(0);
    }
  }
});

test("dordrecht: aantallen dekken exact de 18 codes", () => {
  const d = grondwaarheidByKey("dordrecht")!;
  expect(d.aantallen).toBeDefined();
  expect(Object.keys(d.aantallen!).sort()).toEqual([...d.codes].sort());
  for (const [code, n] of Object.entries(d.aantallen!)) {
    expect(n, `${code}: aantal moet positief zijn`).toBeGreaterThan(0);
  }
});

test("raadhuis: alle 31 codes verwachten XAL (boek is één merk)", () => {
  const r = grondwaarheidByKey("raadhuis")!;
  expect(Object.keys(r.verwachtMerkPerCode).sort()).toEqual([...r.codes].sort());
  expect(new Set(Object.values(r.verwachtMerkPerCode))).toEqual(new Set(["XAL"]));
});
