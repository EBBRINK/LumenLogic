// Invariant-tests op de vier codestijl-fixtures (stap 0, docs/goal-import-ai-leesroute.md).
// Ontwerpprincipe: alleen asserts die vóór én ná de geplande stappen 1–6 gelden.
// Concreet: stap 1 verandert splitBrandType (bekend merk overal herkennen; geen bekend
// merk → brandText null) — dus hier GEEN asserts op het eerste-woord-fallback-merk.
// Stap 3 voegt een AI-leesroute toe maar verruimt CODE/parseTocText NIET (vangrail:
// "geen nieuwe regex als oplossing"). Deze tests moeten dus door alle stappen heen
// groen blijven.
import { expect, test } from "vitest";
import { CODE, parseTocText } from "./armaturenboek";
import {
  DEERNS_FIXTURE,
  DORDRECHT_FIXTURE,
  KVK_FIXTURE,
  TNO_FIXTURE,
} from "./codestijl-fixtures";

const BRANDS = ["XAL", "Muuto"];

// — deerns: de bewezen huisstijl, blijft het deterministische snelpad —

test("deerns: parseTocText leest alle codes, ontdubbelt en stript bladzijdenummers", () => {
  const lines = parseTocText(DEERNS_FIXTURE, BRANDS);
  // alle zes codes; Ls004 staat twee keer in de fixture maar levert één regel (dedup)
  expect(lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lp302", "Ls004", "Lt105", "Lw201-a", "Lr220",
  ]);
  // record begint met een bekend merk → dat merk als brand (prefix-herkenning blijft
  // ook na stap 1 gelden); trailing bladzijdenummer ("8") is uit de type-tekst gestript
  expect(lines[0]).toMatchObject({
    fixtureCode: "Lp301",
    brandText: "XAL",
    productText: "ORBIS 90 rond inbouw",
    quantity: 1,
  });
});

// — kvk: codes als L004 (hoofdletter direct gevolgd door cijfers) —
// Koppelcontract O2 (docs/probleem-import-leest-verkeerd.md): CODE wordt gedeeld door
// de tekstroute én de OCR (lib/ai/ocr.ts). Regex-verruiming is een ingetrokken route
// (vangrails in docs/goal-import-ai-leesroute.md: "geen nieuwe regex als 'oplossing'
// voor O2 — bewezen doodlopend"); de kvk-stijl gaat in stap 3 via de AI-leesroute.

test("kvk: CODE matcht de L004-stijl niet en parseTocText levert 0 regels", () => {
  for (const code of ["L004", "L005", "L010a"]) {
    expect(CODE.test(code)).toBe(false);
  }
  expect(parseTocText(KVK_FIXTURE, BRANDS)).toHaveLength(0);
});

// — tno: brede tabel met ruimtenaam-kolom (O1) en suffix-varianten (O2) —

test("tno: CODE accepteert de basiscode wél, de suffix-varianten niet", () => {
  expect(CODE.test("Lr001")).toBe(true);
  for (const code of ["Lr001B", "Lr001C", "Lr001_N", "Lp601a", "Lp601b"]) {
    expect(CODE.test(code)).toBe(false);
  }
});

test("tno: suffix-varianten worden opgeslokt in het record van hun voorganger", () => {
  const lines = parseTocText(TNO_FIXTURE, BRANDS);
  // precies de wél-matchende codes worden regels: alleen Lr001
  expect(lines).toHaveLength(1);
  expect(lines[0].fixtureCode).toBe("Lr001");
  // de vijf variantrijen zijn geen eigen regels; hun code-tekst zit in de ruwe rest
  // van het Lr001-record
  for (const code of ["Lr001B", "Lr001C", "Lr001_N", "Lp601a", "Lp601b"]) {
    expect(lines[0].productText).toContain(code);
  }
  // Stap 1 (O1-fix): het fixture-merk "Fenolux" staat niet in de BRANDS-testarray,
  // dus splitBrandType claimt niets — brandText is null (eerlijk onbekend), niet
  // langer de ruimtenaam "Vergaderruimte" (de oude eerste-woord-gok).
  expect(lines[0].brandText).toBeNull();
});

// — dordrecht: korte lettercodes, merk+type al ingevuld in de tabel —

test("dordrecht: lettercodes matchen CODE niet en parseTocText levert 0 regels", () => {
  for (const code of ["Ad", "C1", "Tn1", "B", "J"]) {
    expect(CODE.test(code)).toBe(false);
  }
  expect(parseTocText(DORDRECHT_FIXTURE, BRANDS)).toHaveLength(0);
});
