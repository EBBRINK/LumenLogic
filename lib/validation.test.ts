// De gedeelde invoerlaag (reviewzwerm 2.5a, A10). Deze tests pinnen de bouwstenen waar de
// conventie op leunt — vooral de twee die de review als losse gevallen had gemeld: een
// enum-waarde die niet ongecontroleerd een pgEnum in mag (C3) en een bedrag dat niet
// negatief mag zijn (C4).
import { expect, test } from "vitest";
import {
  MAX_PRICE,
  formToObject,
  parseForm,
  z,
  zBoundedInt,
  zEnumFrom,
  zOptionalNumber,
  zOptionalText,
  zPrice,
  zUuid,
} from "@/lib/validation";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

test("zUuid: alleen een canonieke uuid komt erdoor", () => {
  expect(zUuid.safeParse(UUID).success).toBe(true);
  for (const rommel of ["", "nope", "'; drop table leads; --", "------------------------------------", `${UUID} `]) {
    expect(zUuid.safeParse(rommel).success).toBe(false);
  }
});

// C3: dít is de check die ontbrak. Een onbekende waarde hoort hier te stranden, niet in
// Postgres als `invalid input value for enum review_kind` (22P02).
test("zEnumFrom: onbekende waarden stranden vóór de database", () => {
  const kind = zEnumFrom(["geel", "variant", "onvolledig", "ocr"] as const);
  for (const goed of ["geel", "variant", "onvolledig", "ocr"]) {
    expect(kind.safeParse(goed).success).toBe(true);
  }
  for (const fout of ["rood", "", "GEEL", "geel; drop table spec_lines"]) {
    expect(kind.safeParse(fout).success).toBe(false);
  }
});

// C4: geld.
test("zPrice: nul mag, negatief niet, absurd groot niet", () => {
  expect(zPrice.safeParse("0").success).toBe(true);
  expect(zPrice.safeParse("310.00").success).toBe(true);
  expect(zPrice.safeParse("310,50")).toMatchObject({ success: true, data: 310.5 });

  expect(zPrice.safeParse("-1").success).toBe(false);
  expect(zPrice.safeParse("-5000").success).toBe(false);
  expect(zPrice.safeParse("-0,01").success).toBe(false);
  expect(zPrice.safeParse(String(MAX_PRICE + 1)).success).toBe(false);
  expect(zPrice.safeParse("").success).toBe(false);
  expect(zPrice.safeParse("gratis").success).toBe(false);
  expect(zPrice.safeParse("Infinity").success).toBe(false);
});

test("zBoundedInt: de grenzen tellen aan beide kanten", () => {
  const paginaNr = zBoundedInt(1, 500);
  expect(paginaNr.safeParse("1").success).toBe(true);
  expect(paginaNr.safeParse("500").success).toBe(true);
  expect(paginaNr.safeParse("0").success).toBe(false);
  expect(paginaNr.safeParse("501").success).toBe(false);
  expect(paginaNr.safeParse("999999").success).toBe(false);
  expect(paginaNr.safeParse("-3").success).toBe(false);
  expect(paginaNr.safeParse("weg").success).toBe(false);
});

test("zOptionalText / zOptionalNumber: leeg veld wordt null, geen lege string", () => {
  expect(zOptionalText.parse("  ")).toBeNull();
  expect(zOptionalText.parse(" XAL ")).toBe("XAL");
  expect(zOptionalNumber.parse("")).toBeNull();
  expect(zOptionalNumber.parse("2,5")).toBe(2.5);
  expect(zOptionalNumber.safeParse("appel").success).toBe(false);
});

test("formToObject: meerdere waarden onder één sleutel worden een array", () => {
  const fd = new FormData();
  fd.append("zone", "A-08");
  fd.append("zone", "B-01");
  fd.set("naam", "Ziekenhuis Noord");
  expect(formToObject(fd)).toEqual({ zone: ["A-08", "B-01"], naam: "Ziekenhuis Noord" });
});

test("parseForm: geeft een union terug en throwt nooit", () => {
  const schema = z.object({ dossierId: zUuid, prijs: zPrice });

  const goed = new FormData();
  goed.set("dossierId", UUID);
  goed.set("prijs", "12,50");
  expect(parseForm(schema, goed)).toEqual({ ok: true, data: { dossierId: UUID, prijs: 12.5 } });

  const fout = new FormData();
  fout.set("dossierId", "nope");
  fout.set("prijs", "-1");
  const r = parseForm(schema, fout);
  expect(r.ok).toBe(false);
});

// De ingezonden waarde mag niet in de foutmelding belanden: die kan klantdata bevatten en
// komt anders via een log of een scherm naar buiten.
test("parseForm: de foutmelding lekt de ingezonden waarde niet", () => {
  const schema = z.object({ notitie: zUuid });
  const fd = new FormData();
  fd.set("notitie", "Deerns — Ziekenhuis Noord, contactpersoon 06-12345678");
  const r = parseForm(schema, fd);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toContain("notitie");
    expect(r.error).not.toContain("Deerns");
    expect(r.error).not.toContain("06-12345678");
  }
});
