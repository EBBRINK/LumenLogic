// Consistentietoetsen op de grondwaarheid-config (puur, geen DB, geen PDF's):
// de aantallen kloppen (31/49/20/18), codes zijn uniek, en elke mapping verwijst
// alleen naar codes die de case ook echt kent. Zo kan de config nooit stilletjes
// uit de pas lopen met wat het meetscript (scripts/eval-testset.ts) verwacht.
import { expect, test } from "vitest";
import { GRONDWAARHEID, grondwaarheidByKey } from "./grondwaarheid";

const VERWACHTE_N: Record<string, number> = {
  raadhuis: 31,
  kvk: 48, // was 49; kaal L010 bleek een prozavoorbeeld, geen armatuurregel
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

// bekendeExtraCodes (stap 3 fase B): codes die de bron wél bevat maar die buiten
// de grondwaarheid-scope vallen — per definitie disjunct van de codes-lijst
// (anders was het geen "extra") en uniek.
test("bekendeExtraCodes zijn uniek, niet leeg en disjunct van de codes", () => {
  for (const c of GRONDWAARHEID) {
    const extra = c.bekendeExtraCodes ?? [];
    expect(new Set(extra).size, `${c.key}: dubbele extra codes`).toBe(extra.length);
    for (const code of extra) {
      expect(code.trim().length, `${c.key}: lege extra code`).toBeGreaterThan(0);
      expect(c.codes, `${c.key}: ${code} staat óók in codes`).not.toContain(code);
    }
  }
  // De geverifieerde lijsten (16 jul): raadhuis NV-sectie + sensoren, kvk de rail.
  expect(grondwaarheidByKey("raadhuis")!.bekendeExtraCodes).toHaveLength(11);
  expect(grondwaarheidByKey("kvk")!.bekendeExtraCodes).toEqual(["T001"]);
});

test("dordrecht: aantallen dekken exact de 18 codes", () => {
  const d = grondwaarheidByKey("dordrecht")!;
  expect(d.aantallen).toBeDefined();
  expect(Object.keys(d.aantallen!).sort()).toEqual([...d.codes].sort());
  for (const [code, n] of Object.entries(d.aantallen!)) {
    expect(n, `${code}: aantal moet positief zijn`).toBeGreaterThan(0);
  }
});

// Bijgewerkt 16 jul (stap 1-verificatie): de aanname "boek is één merk (XAL)" is
// weerlegd tegen de tekstlaag — het boek voert zes fabricaten en 10 maatwerk-records
// zonder fabricaat. De 4 geoffreerde codes zijn wél allemaal XAL.
test("raadhuis: verwachte merken volgen de geverifieerde fabricaatkolom", () => {
  const r = grondwaarheidByKey("raadhuis")!;
  const perMerk = Object.entries(r.verwachtMerkPerCode).reduce<
    Record<string, number>
  >((acc, [, merk]) => ({ ...acc, [merk]: (acc[merk] ?? 0) + 1 }), {});
  expect(perMerk).toEqual({ XAL: 4, Bega: 8, Exenia: 1, Trilux: 6, Barthelme: 2 });
  // de vier geoffreerde codes (de keuze-mapping) zijn allemaal XAL
  for (const code of Object.keys(r.keuze)) {
    expect(r.verwachtMerkPerCode[code]).toBe("XAL");
  }
});

// TNO gevuld op 16 jul (stap 3 fase B): dertien codes met een letterlijk in de
// tekstlaag geverifieerde merkkolom; de n.t.b.-familie (Lr001*), de "te bepalen"-
// regels (Ls002/Ls003) en het "-"-merk (Lp101) hebben bewust GEEN entry.
test("tno: verwachte merken volgen de geverifieerde merkkolom", () => {
  const t = grondwaarheidByKey("tno")!;
  const perMerk = Object.entries(t.verwachtMerkPerCode).reduce<
    Record<string, number>
  >((acc, [, merk]) => ({ ...acc, [merk]: (acc[merk] ?? 0) + 1 }), {});
  expect(perMerk).toEqual({
    XAL: 4,
    Philips: 1,
    Intralight: 2,
    MOOOI: 1,
    Muuto: 1,
    "Led linear": 1,
    Oblure: 2,
    Pantone: 1,
  });
  for (const code of ["Lr001", "Lr001B", "Lr001C", "Lr001_N", "Ls002", "Ls003", "Lp101"]) {
    expect(t.verwachtMerkPerCode[code], `${code} hoort geen entry te hebben`).toBeUndefined();
  }
});
