// Tests bij lib/custom-fields.ts — de pure laag van sprint 1.8. Geen database: dat is het
// hele punt van deze module (de catalogus reist als parameter door de pure laag).
import { expect, test } from "vitest";
import { FIELD_CATALOG, excelColumns } from "@/lib/field-catalog";
import { normLabel } from "@/lib/excel-validate";
import {
  EIGEN_VELD_PREFIX,
  alsCatalogField,
  catalogusMet,
  eigenVeldIdVan,
  eigenVeldKey,
  isEigenVeldKey,
  labelBotsing,
  type EigenVeldDef,
} from "./custom-fields";

function def(over: Partial<EigenVeldDef> = {}): EigenVeldDef {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    labelEn: "Recycled content (%)",
    instructionEn: "Share of recycled material in percent, e.g. 35.",
    niveau: "wanna",
    bucketKey: "duurzaamheid_milieu",
    createdAt: "2026-07-21T10:00:00.000Z",
    archivedAt: null,
    ...over,
  };
}

// ── De sleutel ──────────────────────────────────────────────────────────────

test("de sleutel is prefix + uuid en kan per constructie niet botsen met een catalog-key", () => {
  const d = def();
  expect(eigenVeldKey(d)).toBe(`${EIGEN_VELD_PREFIX}${d.id}`);
  expect(isEigenVeldKey(eigenVeldKey(d))).toBe(true);
  expect(eigenVeldIdVan(eigenVeldKey(d))).toBe(d.id);
  expect(eigenVeldIdVan("kelvin")).toBeNull();
  expect(isEigenVeldKey("kelvin")).toBe(false);

  // Catalog-keys zijn ^[a-z0-9_]+$ en bevatten dus nooit een dubbele punt. Dát is de
  // garantie, niet "we hebben ze nagelopen".
  for (const bucket of FIELD_CATALOG) {
    for (const f of bucket.fields) {
      expect(f.key, `catalog-key ${f.key}`).toMatch(/^[a-z0-9_]+$/);
    }
  }
});

test("de sleutel overleeft hernoemen — dát is waarom hij geen slug van het label is", () => {
  const voor = def();
  const na = { ...voor, labelEn: "Recycled aluminium (%)" };
  expect(eigenVeldKey(na)).toBe(eigenVeldKey(voor));
});

// ── Als catalogusveld ───────────────────────────────────────────────────────

test("alsCatalogField: nooit matcher, nooit intern, altijd in het Excel, meting op fieldId", () => {
  const veld = alsCatalogField(def());
  // labelNl/instructie dragen hier het Engels: sinds 1.9 bestaat er voor een eigen veld
  // geen Nederlandse tekst meer, en dit is de compat-mapping voor het CatalogField-contract
  // (lib/field-catalog.ts blijft bewust onaangeraakt, zie sprint1-9-plan.md §6).
  expect(veld).toEqual({
    key: `${EIGEN_VELD_PREFIX}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    labelNl: "Recycled content (%)",
    labelEn: "Recycled content (%)",
    niveau: "wanna",
    matcher: false,
    internalOnly: false,
    inExcel: true,
    instructie: "Share of recycled material in percent, e.g. 35.",
    instructionEn: "Share of recycled material in percent, e.g. 35.",
    measure: { kind: "custom", fieldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  });
});

// ── catalogusMet ────────────────────────────────────────────────────────────

test("catalogusMet muteert FIELD_CATALOG niet — ook niet na twee aanroepen", () => {
  const voor = FIELD_CATALOG.flatMap((b) => b.fields).length;
  catalogusMet([def()]);
  catalogusMet([def()]);
  expect(FIELD_CATALOG.flatMap((b) => b.fields).length).toBe(voor);
  expect(excelColumns(FIELD_CATALOG)).toHaveLength(66);
});

test("catalogusMet sorteert op (createdAt, id) en zet de eigen velden achteraan hun bucket", () => {
  const nieuw = def({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", createdAt: "2026-08-01T00:00:00.000Z", labelEn: "C" });
  const oud = def({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", createdAt: "2026-07-01T00:00:00.000Z", labelEn: "B" });
  const cat = catalogusMet([nieuw, oud]);
  const bucket = cat.find((b) => b.key === "duurzaamheid_milieu")!;
  const keys = bucket.fields.map((f) => f.key);
  // De vier bestaande velden eerst, dan oud, dan nieuw.
  expect(keys.slice(0, 4)).toEqual([
    "warranty_months",
    "repairability",
    "epd_lifetime_hours",
    "country_of_origin",
  ]);
  expect(keys.slice(4)).toEqual([eigenVeldKey(oud), eigenVeldKey(nieuw)]);
});

test("catalogusMet: gelijke createdAt → id beslist, zodat de volgorde stabiel is", () => {
  const a = def({ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-07-01T00:00:00.000Z" });
  const b = def({ id: "22222222-2222-4222-8222-222222222222", createdAt: "2026-07-01T00:00:00.000Z" });
  const heen = catalogusMet([b, a]);
  const terug = catalogusMet([a, b]);
  const keysVan = (c: typeof heen) =>
    c.find((x) => x.key === "duurzaamheid_milieu")!.fields.map((f) => f.key);
  expect(keysVan(heen)).toEqual(keysVan(terug));
});

test("catalogusMet: een onbekende bucketKey laat het veld stil vallen i.p.v. een elfde bucket te maken", () => {
  const cat = catalogusMet([def({ bucketKey: "bestaat_niet" })]);
  expect(cat).toHaveLength(11);
  expect(excelColumns(cat)).toHaveLength(66);
});

// ── labelBotsing ────────────────────────────────────────────────────────────
//
// Waarom dit hard moet: twee kolommen die op hetzelfde veld matchen leveren
// `dubbele_kolomkop` op, en dat is een AFWIJZING VAN HET HELE BESTAND — voor élk merk
// tegelijk, tot iemand het veld hernoemt.

test("labelBotsing: botsing met een catalogusveld, ook bij afwijkende casing/witruimte", () => {
  expect(labelBotsing("Max wattage", [])).toEqual({
    met: "catalogus",
    bestaandLabelEn: "Max wattage",
  });
  expect(labelBotsing("  max   WATTAGE ", [])).toEqual({
    met: "catalogus",
    bestaandLabelEn: "Max wattage",
  });
  // Dezelfde normalisatie als de validator gebruikt — geen tweede kopie.
  expect(normLabel("  max   WATTAGE ")).toBe(normLabel("Max wattage"));
});

test("labelBotsing: botst ook met een 🔒-veld uit bucket 11", () => {
  // Dat veld staat niet in het Excel, maar wél in de scorecard; twee identieke labels op
  // één scherm is een leugen.
  expect(labelBotsing("Stock", [])?.met).toBe("catalogus");
});

test("labelBotsing: botsing tussen twee EIGEN velden — óók de weg waarlangs hernoemen misgaat", () => {
  const bestaand = def({ labelEn: "Recycled content (%)" });
  expect(labelBotsing("recycled content (%)", [bestaand])).toEqual({
    met: "eigen",
    bestaandLabelEn: "Recycled content (%)",
  });
  // negeerId: een veld botst niet met zichzelf, anders kan niets ooit hernoemd worden.
  expect(labelBotsing("Recycled content (%)", [bestaand], bestaand.id)).toBeNull();
});

test("labelBotsing: een GEARCHIVEERD eigen veld geeft zijn label vrij", () => {
  const weg = def({ archivedAt: "2026-07-22T00:00:00.000Z" });
  expect(labelBotsing("Recycled content (%)", [weg])).toBeNull();
});

test("labelBotsing: een vrij label is null, en een leeg label is geen botsing", () => {
  expect(labelBotsing("Recycled content (%)", [])).toBeNull();
  expect(labelBotsing("   ", [])).toBeNull();
});
