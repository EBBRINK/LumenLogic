// Puur (geen DB): de gecureerde optiekcode-tabel. De scherpe randen zijn de woordgrens
// (substring-matching zou honderden rijen een verkeerde hoek geven) en de ambiguïteitsregel.
import { expect, test } from "vitest";
import {
  CONFIRMED_CODES,
  OPTIC_BEAM_ANGLES,
  opticBeamAngle,
  opticCodesIn,
} from "./optic-code";

test("de bevestigde codes (FL/WF) leveren hun hoek", () => {
  expect(opticBeamAngle("SASSO PRO 100 FL ADJ DALI 27W cob LED 3000K")).toBe(39);
  expect(opticBeamAngle("SASSO PRO 100 WF ADJ DALI 26,5W cob LED 3000K")).toBe(57);
});

// Besluit Timo 20 jul: ME/SP worden niet voorgesteld zolang hun tabelwaarde de bestaande
// catalogusdata (48x ME en 48x SP, beide op 30 graden) tegenspreekt.
test("ME en SP worden NIET voorgesteld tot het retourpad ze bevestigt", () => {
  expect(opticBeamAngle("ARY ADJ ME SUSP 1500 ROD 8,4W LED 2700K")).toBeUndefined();
  expect(opticBeamAngle("BO 32 1L SP CRI90 INTRACK DALI 10,7W cob LED")).toBeUndefined();
  // maar de kennis staat wel vastgelegd
  expect(OPTIC_BEAM_ANGLES.ME).toBe(25);
  expect(OPTIC_BEAM_ANGLES.SP).toBe(15);
  expect(CONFIRMED_CODES).toEqual(["FL", "WF"]);
});

// Herkenning kijkt naar alle vier: een naam met FL en ME blijft dubbelzinnig.
test("dubbelzinnigheid telt ook mee met een niet-bevestigde code", () => {
  expect(opticCodesIn("SASSO FL ME ADJ")).toEqual(["FL", "ME"]);
  expect(opticBeamAngle("SASSO FL ME ADJ")).toBeUndefined();
});

test("woordgrens: FL matcht NIET in FLEX, REFLECTOR of FLOOD", () => {
  expect(opticCodesIn("INS 100 660-1171 FLEX CRI90 HIGH LUMEN DALI")).toEqual([]);
  expect(opticCodesIn("INS 100 1171 CRI90 DALI INCL.REFLECTOR 27,5W")).toEqual([]);
  expect(opticBeamAngle("SASSO 100 FLOOD 15W")).toBeUndefined();
  // SP mag niet matchen in 'SUSP' — dat token staat in honderden XAL-namen.
  expect(opticCodesIn("ARY ADJ SUSP 1500 ROD 8,4W LED 2700K")).toEqual([]);
});

test("cijfers en leestekens gelden als grens", () => {
  expect(opticCodesIn("BO 32 1L SP CRI90 INTRACK")).toEqual(["SP"]);
  expect(opticBeamAngle("SASSO 100 RD FL CRI90 ADJ S-RECS 15,2W")).toBe(39);
});

test("meer dan één code → zwijgen, niet gokken", () => {
  expect(opticCodesIn("SASSO FL WF ADJ")).toEqual(["FL", "WF"]);
  expect(opticBeamAngle("SASSO FL WF ADJ")).toBeUndefined();
});

test("geen code → undefined (ontbrekend ≠ fout)", () => {
  expect(opticBeamAngle("STRETTA 600 IP44 CRI90 HPO SURF DALI 13W")).toBeUndefined();
  expect(opticBeamAngle("")).toBeUndefined();
});

test("de tabel bevat precies de vier afgesproken codes", () => {
  expect(OPTIC_BEAM_ANGLES).toEqual({ FL: 39, WF: 57, ME: 25, SP: 15 });
});
