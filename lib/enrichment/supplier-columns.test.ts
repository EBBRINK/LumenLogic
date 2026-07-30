// Puur (geen DB): de gecureerde kolom→veld-tabel. Dit zijn de tests MET TANDEN — ze bestaan om
// stille drift tegen te houden, naar het model van lib/field-catalog.test.ts (dat faalt als een
// migratie een kolom toevoegt zonder regel).
import { expect, test } from "vitest";
import { FIELDS } from "./parser";
import { NORMALISATOREN } from "./supplier-cell";
import {
  beoordeeldeKolommen,
  overzetbareKolommen,
  sourceLabel,
  SUPPLIER_COLUMNS,
  SUPPLIER_SOURCE_PREFIX,
} from "./supplier-columns";

test("elke ingang is compleet: veld bestaat, motivatie niet leeg, oordeel gezet", () => {
  for (const k of SUPPLIER_COLUMNS) {
    const id = `${k.merk} / ${k.kolom}`;
    expect(k.beschrijft, `${id}: beschrijft ontbreekt`).toBeTruthy();
    expect(k.bewijs.trim().length, `${id}: bewijs is leeg`).toBeGreaterThan(40);
    if (k.veld !== null) {
      expect(FIELDS as readonly string[], `${id}: '${k.veld}' is geen matchveld`).toContain(k.veld);
    }
  }
});

test("alleen een 'armatuur'-kolom heeft een doelveld — val 2 is hier de poort", () => {
  for (const k of SUPPLIER_COLUMNS) {
    const id = `${k.merk} / ${k.kolom}`;
    if (k.beschrijft === "armatuur") {
      expect(k.veld, `${id}: armatuur zonder doelveld`).not.toBeNull();
    } else {
      expect(k.veld, `${id}: ${k.beschrijft} mag nooit een matchveld vullen`).toBeNull();
    }
  }
});

test("elke armatuur-kolom noemt een bestaande normalisator; elke afgewezen kolom geen", () => {
  for (const k of SUPPLIER_COLUMNS) {
    const id = `${k.merk} / ${k.kolom}`;
    if (k.beschrijft === "armatuur") {
      expect(k.normalisator, `${id}: geen normalisator`).not.toBeNull();
      expect(Object.keys(NORMALISATOREN), `${id}: onbekende normalisator`).toContain(
        k.normalisator,
      );
    } else {
      expect(k.normalisator, `${id}: afgewezen kolom hoort geen normalisator te hebben`).toBeNull();
    }
  }
});

test("geen dubbele (merk, kolom) en geen twee kolommen naar hetzelfde veld binnen één merk", () => {
  const gezien = new Set<string>();
  const veldPerMerk = new Set<string>();
  for (const k of SUPPLIER_COLUMNS) {
    const sleutel = `${k.merk}|${k.kolom}`;
    expect(gezien.has(sleutel), `dubbele ingang ${sleutel}`).toBe(false);
    gezien.add(sleutel);
    if (k.veld) {
      const vs = `${k.merk}|${k.veld}`;
      expect(veldPerMerk.has(vs), `${k.merk}: twee kolommen vullen ${k.veld}`).toBe(false);
      veldPerMerk.add(vs);
    }
  }
});

// ── Fail-closed: dit is de val-2-poort, en hij moet dicht zijn ───────────────
test("een kolom die niet in de tabel staat, levert nooit een voorstel", () => {
  const kolommen = overzetbareKolommen("Serien Lighting").map((k) => k.kolom);
  expect(kolommen).not.toContain("Gewicht (netto)");
  expect(kolommen).not.toContain("EEK");
  expect(kolommen).not.toContain("Warennummer");
  // en een merk dat helemaal niet in de tabel staat, levert een lege lijst
  expect(overzetbareKolommen("Lombardo")).toEqual([]);
});

test("Schutzklasse gaat NIET naar ipValue — de val die naast Schutzart ligt", () => {
  const serien = overzetbareKolommen("Serien Lighting");
  const ip = serien.find((k) => k.veld === "ipValue");
  expect(ip?.kolom, "ipValue moet uit Schutzart komen").toBe("Schutzart");
  // Schutzklasse is beoordeeld en afgewezen — niet vergeten.
  const klasse = beoordeeldeKolommen("Serien Lighting").find((k) => k.kolom === "Schutzklasse");
  expect(klasse, "Schutzklasse moet als beoordeeld vastliggen").toBeDefined();
  expect(klasse?.veld).toBeNull();
  expect(klasse?.beschrijft).toBe("elektrische-klasse");
});

test("Muuto's BULB-kolommen staan vast als lichtbron en vullen niets", () => {
  const muuto = beoordeeldeKolommen("Muuto");
  expect(muuto.length, "de drie BULB SPECIFICATION-kolommen horen vastgelegd").toBe(3);
  for (const k of muuto) {
    expect(k.beschrijft).toBe("lichtbron");
    expect(k.veld).toBeNull();
  }
  expect(overzetbareKolommen("Muuto")).toEqual([]);
});

// ── De vijf Serien-kolommen die wél overgezet worden ────────────────────────
test("Serien zet exact vijf kolommen over, op de gemeten velden", () => {
  const paren = overzetbareKolommen("Serien Lighting")
    .map((k) => `${k.kolom}->${k.veld}`)
    .sort();
  expect(paren).toEqual(
    [
      "CCT K->kelvin",
      "CRI Ra->cri",
      "Regelung->dimmable",
      "Schutzart->ipValue",
      "Systemleistung W->maxWattage",
    ].sort(),
  );
});

test("de LED-restrictie staat precies op de drie kolommen waar de meting hem eist", () => {
  const perKolom = new Map(
    overzetbareKolommen("Serien Lighting").map((k) => [k.kolom, k.alleenGeintegreerdeLed]),
  );
  // Gemeten: 0 van de 114 verwisselbare-fitting-rijen heeft een schone CCT-waarde; 22 dragen
  // tóch een Systemleistung en 4 een CRI — dat is dan de lamp, niet het armatuur.
  expect(perKolom.get("CCT K")).toBe(true);
  expect(perKolom.get("Systemleistung W")).toBe(true);
  expect(perKolom.get("CRI Ra")).toBe(true);
  // Schutzart is gemeten gevuld óók zónder LED (106/114) — dat is juist het bewijs dat hij de
  // behuizing beschrijft. Regelung idem (114/114).
  expect(perKolom.get("Schutzart")).toBe(false);
  expect(perKolom.get("Regelung")).toBe(false);
});

test("het source-label draagt de kolomnaam, zodat herkomst per veld herleidbaar blijft", () => {
  expect(sourceLabel("CCT K")).toBe("supplier-column:CCT K");
  expect(sourceLabel("CCT K").startsWith(SUPPLIER_SOURCE_PREFIX)).toBe(true);
});

test("het label valt buiten UNCONFIRMED_TIER2_SOURCES — anders wordt niets ooit groen", () => {
  // engine.ts:197 is een exacte-string-set met alleen 'optic-code'. Deze test legt de BESLISSING
  // vast (een leverancierskolom is de eigen opgave van de fabrikant, dus groen-waardig), niet
  // alleen het huidige gedrag.
  const UNCONFIRMED = new Set(["optic-code"]);
  expect(UNCONFIRMED.has(sourceLabel("CCT K"))).toBe(false);
  expect(UNCONFIRMED.has(SUPPLIER_SOURCE_PREFIX)).toBe(false);
});
