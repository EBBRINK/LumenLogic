// Tests bij lib/template-diff.ts. Puur: geen database, geen PGlite — de engine krijgt de
// catalogus als parameter, dus deze suite draait in milliseconden.
//
// De belangrijkste twee tests staan bovenaan en heten ook zo: KOLOM ONTBRAK vs. CEL LEEG.
// Verwar die twee en de tool stelt voor bestaande data te wissen omdat een merk een kolom
// niet meestuurde. De rest van dit bestand dekt de categorieën, de normalisatie en de
// rondgang template → validator → diff (1.1-discipline: de drie mogen niet uiteenlopen).
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { getTableColumns } from "drizzle-orm";
import { products } from "@/db/schema";
import { catalogusMet, eigenVeldKey, type EigenVeldDef } from "@/lib/custom-fields";
import {
  excelColumns,
  FIELD_CATALOG,
  type CatalogBucket,
} from "@/lib/field-catalog";
import { buildMasterTemplateXlsx } from "@/lib/excel-template";
import {
  EERSTE_DATARIJ,
  validateFilledTemplateXlsx,
  WERKBLAD_NAAM,
  type FormatGeldig,
  type GelezenRij,
  type RijWaarschuwing,
} from "@/lib/excel-validate";
import {
  diffTemplateRows,
  doelType,
  fieldSelectionKey,
  newProductSelectionKey,
  normaliseer,
  SCHRIJF_MAPPING,
  type BestaandProduct,
  type FieldProposal,
  type ProductDiff,
} from "./template-diff";

/** Het vaste deel van de catalogus — wat elke bestaande test hier bedoelt. */
const CATALOGUS = FIELD_CATALOG;

/** Geen eigen velden: de stand van vóór sprint 1.8. Bewust een lege Set en geen weggelaten
 *  argument — "er zijn er geen" is een uitspraak, geen ontbrekende parameter. */
const GEEN_EIGEN: ReadonlySet<string> = new Set();

// ── Gereedschap ─────────────────────────────────────────────────────────────

/** Eén bestaand product; `velden` is gesleuteld op products-KOLOM (Drizzle-property). */
function bestaand(
  code: string,
  velden: Record<string, string | null> = {},
  grossPrice: string | null = null,
  eigenWaarden: Record<string, string | null> = {},
): Map<string, BestaandProduct> {
  return new Map([
    [
      code,
      {
        id: `id-${code}`,
        name: `Product ${code}`,
        supplierArticleCode: code,
        velden,
        eigenWaarden,
        grossPrice,
      },
    ],
  ]);
}

function rij(nr: number, velden: Record<string, string>): GelezenRij {
  return { rij: nr, velden };
}

function alleen(rows: ProductDiff[]): ProductDiff {
  expect(rows).toHaveLength(1);
  return rows[0];
}

function veld(diff: ProductDiff, fieldKey: string): FieldProposal | undefined {
  if (diff.kind === "ambiguous_duplicate") throw new Error("geen veldgroep");
  return diff.fields.find((f) => f.fieldKey === fieldKey);
}

// ── De belangrijkste regel: aanwezigheid draagt betekenis ───────────────────

test("KOLOM ONTBRAK: cri zit niet in velden → géén voorstel, ook niet als de DB gevuld is", () => {
  const { rows, counts } = diffTemplateRows(
    // De kolom stond niet in het bestand: de key is per constructie afwezig.
    [rij(4, { supplier_article_code: "A-1", kelvin: "3000" })],
    bestaand("A-1", { cri: "90", kelvin: "3000" }),
    [],
    GEEN_EIGEN,
  );
  const diff = alleen(rows);
  expect(diff.kind).toBe("known");
  expect(veld(diff, "cri")).toBeUndefined();
  // Niet als unchanged, niet als conflict, niet als iets — er is geen entry.
  expect(diff.kind === "known" && diff.fields.map((f) => f.fieldKey)).toEqual([
    "kelvin",
  ]);
  expect(counts.conflicts).toBe(0);
});

test("CEL LEEG: cri staat er wél maar is leeg terwijl de DB gevuld is → wissen-voorstel (conflict/clear)", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", cri: "" })],
    bestaand("A-1", { cri: "90" }),
    [],
    GEEN_EIGEN,
  );
  const voorstel = veld(alleen(rows), "cri");
  expect(voorstel).toEqual({
    kind: "conflict",
    fieldKey: "cri",
    reden: { code: "clear", doel: { kind: "kolom", kolom: "cri" }, prev: "90" },
  });
  expect(counts.conflicts).toBe(1);
});

// ── Categorieën ─────────────────────────────────────────────────────────────

test("new: DB leeg, cel gevuld en verwerkbaar", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", kelvin: "3000" })],
    bestaand("A-1", { kelvin: null }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "kelvin")).toEqual({
    kind: "new",
    fieldKey: "kelvin",
    doel: { kind: "kolom", kolom: "kelvin" },
    next: "3000",
    nextRuw: "3000",
  });
  expect(counts.newFields).toBe(1);
});

test("changed: DB gevuld, cel gevuld en anders → oud→nieuw", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", kelvin: "4000" })],
    bestaand("A-1", { kelvin: "3000" }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "kelvin")).toEqual({
    kind: "changed",
    fieldKey: "kelvin",
    doel: { kind: "kolom", kolom: "kelvin" },
    prev: "3000",
    next: "4000",
    nextRuw: "4000",
  });
  expect(counts.changedFields).toBe(1);
});

test("unchanged: cel gelijk aan DB → telt mee, geen voorstel-categorie", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", kelvin: "3000" })],
    bestaand("A-1", { kelvin: "3000" }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "kelvin")?.kind).toBe("unchanged");
  expect(counts.unchangedFields).toBe(1);
  expect(counts.changedFields).toBe(0);
});

test("cel leeg + DB leeg → unchanged, niets te wissen", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", cri: "" })],
    bestaand("A-1", { cri: null }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "cri")).toEqual({
    kind: "unchanged",
    fieldKey: "cri",
    doel: { kind: "kolom", kolom: "cri" },
    waarde: "",
  });
  expect(counts.conflicts).toBe(0);
});

test("conflict/unprocessable: 'abc' in kelvin past niet in het kolomtype", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", kelvin: "abc" })],
    bestaand("A-1", { kelvin: null }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "kelvin")).toEqual({
    kind: "conflict",
    fieldKey: "kelvin",
    reden: {
      code: "unprocessable",
      doel: { kind: "kolom", kolom: "kelvin" },
      ruw: "abc",
      kolomType: "int",
    },
  });
  expect(counts.conflicts).toBe(1);
});

test("conflict/not_storable: een key zonder schrijf-mapping wordt getoond, niet weggegooid", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", stock: "12" })],
    bestaand("A-1"),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "stock")).toEqual({
    kind: "conflict",
    fieldKey: "stock",
    reden: { code: "not_storable", ruw: "12" },
  });
});

test("conflict/price_clear: lege prijscel bij gevulde prijs is nooit toepasbaar (regel 3)", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", list_price_excl_vat: "" })],
    bestaand("A-1", {}, "196.00"),
    [],
    GEEN_EIGEN,
  );
  const diff = alleen(rows);
  expect(diff.kind === "known" && diff.price).toEqual({
    kind: "conflict",
    reden: { code: "price_clear", prev: "196" },
  });
});

test("de sleutel zelf is nooit een veldvoorstel", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1" })],
    bestaand("A-1"),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "supplier_article_code")).toBeUndefined();
});

// ── Normalisatie ────────────────────────────────────────────────────────────

test("normalisatie: '12,5' uit het bestand ≡ '12.50' uit numeric(8,2) → unchanged", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", height_cm: "12,5" })],
    bestaand("A-1", { heightCm: "12.50" }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "height_cm")?.kind).toBe("unchanged");
  expect(counts.changedFields).toBe(0);
});

test("normalisatie: 'Yes' en 'ja' worden allebei boolean true → onderling unchanged", () => {
  expect(normaliseer("Yes", "bool")).toBe("true");
  expect(normaliseer("ja", "bool")).toBe("true");
  expect(normaliseer("NEE", "bool")).toBe("false");
  expect(normaliseer("misschien", "bool")).toBeNull();

  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", light_source_included: "Yes" })],
    bestaand("A-1", { lightSourceIncluded: "true" }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "light_source_included")?.kind).toBe("unchanged");
});

test("normalisatie: integer-kolom eist een geheel getal; tekst trimt maar behoudt casing", () => {
  expect(normaliseer("3000.5", "int")).toBeNull();
  expect(normaliseer("3000", "int")).toBe("3000");
  expect(normaliseer("  Aluminium ", "text")).toBe("Aluminium");
  // Een case-wijziging ÍS een wijziging: het merk koos die schrijfwijze.
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", color_1: "aluminium" })],
    bestaand("A-1", { color1: "Aluminium" }),
    [],
    GEEN_EIGEN,
  );
  expect(veld(alleen(rows), "color_1")?.kind).toBe("changed");
});

// ── Producten ───────────────────────────────────────────────────────────────

test("onbekende artikelcode → new_product-voorstel", () => {
  const { rows, counts } = diffTemplateRows(
    [rij(4, { supplier_article_code: "B-9", name_en: "Spot 40", kelvin: "3000" })],
    bestaand("A-1"),
    [],
    GEEN_EIGEN,
  );
  const diff = alleen(rows);
  expect(diff.kind).toBe("new_product");
  expect(diff.kind === "new_product" && diff.blocked).toBeNull();
  expect(veld(diff, "kelvin")?.kind).toBe("new");
  expect(counts.newProducts).toBe(1);
  expect(newProductSelectionKey(4)).toBe("np.r4");
});

test("nieuw product zonder Product name (English) → blocked missing_name (products.name is NOT NULL)", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "B-9", name_en: "", kelvin: "3000" })],
    new Map(),
    [],
    GEEN_EIGEN,
  );
  const diff = alleen(rows);
  expect(diff.kind === "new_product" && diff.blocked).toEqual({ code: "missing_name" });
});

test("nieuw product zonder artikelcode → blocked missing_article_code", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "", name_en: "Spot 40" })],
    new Map(),
    [],
    GEEN_EIGEN,
  );
  const diff = alleen(rows);
  expect(diff.kind === "new_product" && diff.blocked).toEqual({
    code: "missing_article_code",
  });
});

test("dubbele artikelcode in het bestand → ambiguous_duplicate, één entry voor de groep", () => {
  const waarschuwingen: RijWaarschuwing[] = [
    { code: "dubbele_artikelcode", rij: 4, artikelcode: "A-1", ookOpRijen: [5] },
    { code: "dubbele_artikelcode", rij: 5, artikelcode: "A-1", ookOpRijen: [4] },
  ];
  const { rows, counts } = diffTemplateRows(
    [
      rij(4, { supplier_article_code: "A-1", kelvin: "3000" }),
      rij(5, { supplier_article_code: "A-1", kelvin: "4000" }),
    ],
    bestaand("A-1", { kelvin: "2700" }),
    waarschuwingen,
    GEEN_EIGEN,
  );
  expect(alleen(rows)).toEqual({
    kind: "ambiguous_duplicate",
    articleCode: "A-1",
    rijen: [4, 5],
  });
  expect(counts.ambiguous).toBe(1);
  // Geen enkel veldvoorstel uit een zichzelf tegensprekend bestand.
  expect(counts.changedFields + counts.newFields).toBe(0);
});

test("code-match is HOOFDLETTERGEVOELIG: 'a-1' vindt 'A-1' niet en wordt een nieuw product", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "a-1", name_en: "Spot 40" })],
    bestaand("A-1"),
    [],
    GEEN_EIGEN,
  );
  // Consistent met products_brand_sac_uniq en codeVoorLookup(): een valse "bekend" zou stil
  // in het verkeerde product schrijven. Een valse "nieuw product?" kost een mens twee seconden.
  expect(alleen(rows).kind).toBe("new_product");
});

test("code-match trimt wel: ' A-1 ' is A-1", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: " A-1 ", kelvin: "3000" })],
    bestaand("A-1", { kelvin: "2700" }),
    [],
    GEEN_EIGEN,
  );
  expect(alleen(rows).kind).toBe("known");
});

// ── De schrijf-mapping ──────────────────────────────────────────────────────

test("name_en landt op nameEn en NIET op name (de briefing wees measure.column aan; die is fout)", () => {
  expect(SCHRIJF_MAPPING.name_en).toBe("nameEn");
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", name_en: "Downlight X" })],
    bestaand("A-1", { nameEn: null }),
    [],
    GEEN_EIGEN,
  );
  const voorstel = veld(alleen(rows), "name_en");
  expect(voorstel?.kind === "new" && voorstel.doel).toEqual({
    kind: "kolom",
    kolom: "nameEn",
  });
  // products.name is onze hoofdnaam (XIS-import) en wordt door het retour-pad nooit
  // overschreven bij een BESTAAND product.
  expect(Object.values(SCHRIJF_MAPPING)).not.toContain("name");
});

test("elke waarde in SCHRIJF_MAPPING is een bestaande kolom op products", () => {
  const kolommen = new Set(Object.keys(getTableColumns(products)));
  for (const [fieldKey, kolom] of Object.entries(SCHRIJF_MAPPING)) {
    expect(kolommen.has(kolom), `${fieldKey} → ${kolom} bestaat niet op products`).toBe(
      true,
    );
  }
});

test("elke sleutel in SCHRIJF_MAPPING is een bestaande catalog-key", () => {
  const keys = new Set(excelColumns(CATALOGUS).map(({ field }) => field.key));
  for (const fieldKey of Object.keys(SCHRIJF_MAPPING)) {
    expect(keys.has(fieldKey), `${fieldKey} staat niet in de veldcatalogus`).toBe(true);
  }
});

test("selectie-sleutels zijn op rijnummer gesleuteld", () => {
  expect(fieldSelectionKey(4, "kelvin")).toBe("r4.kelvin");
  expect(newProductSelectionKey(12)).toBe("np.r12");
});

// ── RONDGANG: template → validator → diff ───────────────────────────────────

function alsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Kolomnummer van een catalog-key, gevonden via de koprij zelf — nooit een index hardcoden. */
function kolomVan(ws: ExcelJS.Worksheet, fieldKey: string): number {
  const kol = excelColumns(CATALOGUS).find(({ field }) => field.key === fieldKey);
  if (!kol) throw new Error(`onbekende fieldKey in test: ${fieldKey}`);
  for (let c = 1; c <= ws.columnCount; c++) {
    if (String(ws.getRow(2).getCell(c).value ?? "") === kol.field.labelEn) return c;
  }
  throw new Error(`kolom niet gevonden voor ${fieldKey}`);
}

/** Het ÉCHTE template van lib/excel-template.ts, programmatisch ingevuld. Geen handgetypte
 *  kolomlijst — zelfde fixture-discipline als excel-validate.test.ts. */
async function bouwIngevuldTemplate(
  rijen: Record<string, string | number>[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(alsArrayBuffer(await buildMasterTemplateXlsx(CATALOGUS)) as never);
  const ws = wb.getWorksheet(WERKBLAD_NAAM)!;
  rijen.forEach((waarden, i) => {
    for (const [fieldKey, waarde] of Object.entries(waarden)) {
      ws.getRow(EERSTE_DATARIJ + i).getCell(kolomVan(ws, fieldKey)).value = waarde;
    }
  });
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

test("RONDGANG: template bouwen → invullen → validator → diff levert een kloppend voorstel", async () => {
  const bytes = await bouwIngevuldTemplate([
    {
      supplier_article_code: "A-1",
      name_en: "Downlight A",
      category: "Indoor lighting > Downlights",
      list_price_excl_vat: "210,00",
      kelvin: "4000",
      cri: "90",
    },
    {
      supplier_article_code: "B-9",
      name_en: "Downlight B",
      category: "Indoor lighting > Downlights",
      list_price_excl_vat: "129.50",
    },
  ]);

  const res = (await validateFilledTemplateXlsx(bytes, CATALOGUS, {
    knownArticleCodes: new Set(["A-1"]),
  })) as FormatGeldig;
  expect(res.ok, "het echte template moet zijn eigen validator passeren").toBe(true);

  const { rows, counts } = diffTemplateRows(
    res.rijen,
    bestaand("A-1", { kelvin: "3000", cri: null }, "196.00"),
    res.waarschuwingen,
    GEEN_EIGEN,
  );

  expect(rows.map((r) => r.kind)).toEqual(["known", "new_product"]);

  const [a, b] = rows;
  // Bestaand product: kelvin wijzigt, cri is nieuw, prijs wijzigt (met NL-decimaalteken).
  expect(veld(a, "kelvin")?.kind).toBe("changed");
  expect(veld(a, "cri")?.kind).toBe("new");
  expect(a.kind === "known" && a.price).toEqual({
    kind: "changed",
    prev: "196",
    next: "210",
    // nextRuw is de cel zoals het merk hem typte; `next` is de genormaliseerde vorm.
    nextRuw: "210,00",
  });
  // Alle overige template-kolommen stonden er wél maar zijn leeg, en de DB is daar ook leeg:
  // unchanged, geen enkel wissen-voorstel. Dit is de rondgang-belofte in één assertie.
  expect(counts.conflicts).toBe(0);

  // Onbekende code: nieuw-product-voorstel mét de 1.1-waarschuwing erbij.
  expect(b.kind === "new_product" && b.blocked).toBeNull();
  expect(b.kind !== "ambiguous_duplicate" && b.waarschuwingen.map((w) => w.code)).toEqual([
    "onbekende_artikelcode",
  ]);
  expect(counts.newProducts).toBe(1);
  expect(counts.priceLines).toBe(2);
});

// ── Sprint 1.8: eigen velden in de diff ──────────────────────────────────────

const EIGEN: EigenVeldDef = {
  id: "44444444-4444-4444-8444-444444444444",
  labelNl: "Gerecycled aandeel (%)",
  labelEn: "Recycled content (%)",
  instructieNl: "Percentage gerecycled materiaal, bv. 35.",
  instructionEn: "Share of recycled material in percent, e.g. 35.",
  niveau: "wanna",
  bucketKey: "duurzaamheid_milieu",
  createdAt: "2026-07-21T10:00:00.000Z",
  archivedAt: null,
};
const EIGEN_KEY = eigenVeldKey(EIGEN);
const EIGEN_ACTIEF: ReadonlySet<string> = new Set([EIGEN_KEY]);

test("1.8: een eigen veld is GEEN not_storable meer — dat was de scherpste bevinding van fase 1", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "35" })],
    bestaand("A-1"),
    [],
    EIGEN_ACTIEF,
  );
  expect(veld(alleen(rows), EIGEN_KEY)).toEqual({
    kind: "new",
    fieldKey: EIGEN_KEY,
    doel: { kind: "custom", fieldId: EIGEN.id },
    next: "35",
    nextRuw: "35",
  });
});

test("1.8: een eigen veld raakt NOOIT een products-kolom (SCHRIJF_MAPPING blijft ongemoeid)", () => {
  expect(Object.keys(SCHRIJF_MAPPING).some((k) => k.startsWith("custom:"))).toBe(false);
  // En het doel is per type geen kolom: de compiler kan hier niet per ongeluk een
  // kolomnaam uit halen.
  expect(doelType({ kind: "custom", fieldId: EIGEN.id })).toBe("text");
});

test("1.8: eigen velden zijn altijd tekst — '35 %' is geen conflict maar gewoon de waarde", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "35 %" })],
    bestaand("A-1"),
    [],
    EIGEN_ACTIEF,
  );
  const v = veld(alleen(rows), EIGEN_KEY);
  expect(v?.kind).toBe("new");
  expect(v?.kind === "new" && v.next).toBe("35 %");
});

test("1.8: changed/unchanged/clear werken op de huidige waarde uit custom_values", () => {
  const basis = bestaand("A-1", {}, null, { [EIGEN.id]: "20" });

  const changed = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "35" })],
    basis,
    [],
    EIGEN_ACTIEF,
  );
  expect(veld(alleen(changed.rows), EIGEN_KEY)).toMatchObject({
    kind: "changed",
    prev: "20",
    next: "35",
  });

  const gelijk = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "20" })],
    basis,
    [],
    EIGEN_ACTIEF,
  );
  expect(veld(alleen(gelijk.rows), EIGEN_KEY)?.kind).toBe("unchanged");

  // Lege cel bij een gevulde waarde = wissen-voorstel, precies als bij een kolom.
  const leeg = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "" })],
    basis,
    [],
    EIGEN_ACTIEF,
  );
  expect(veld(alleen(leeg.rows), EIGEN_KEY)).toEqual({
    kind: "conflict",
    fieldKey: EIGEN_KEY,
    reden: { code: "clear", doel: { kind: "custom", fieldId: EIGEN.id }, prev: "20" },
  });
});

test("1.8: een GEARCHIVEERD eigen veld in een oude snapshot wordt not_storable, niet stil geschreven", () => {
  const { rows } = diffTemplateRows(
    [rij(4, { supplier_article_code: "A-1", [EIGEN_KEY]: "35" })],
    bestaand("A-1"),
    [],
    new Set(), // het veld bestaat niet meer / is gearchiveerd
  );
  expect(veld(alleen(rows), EIGEN_KEY)).toEqual({
    kind: "conflict",
    fieldKey: EIGEN_KEY,
    reden: { code: "not_storable", ruw: "35" },
  });
});

test("1.8: RONDGANG met een eigen veld — template → validator → diff", async () => {
  const cat = catalogusMet([EIGEN]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(alsArrayBuffer(await buildMasterTemplateXlsx(cat)) as never);
  const ws = wb.getWorksheet(WERKBLAD_NAAM)!;
  const kolom = (fieldKey: string) => {
    const kol = excelColumns(cat).find(({ field }) => field.key === fieldKey)!;
    for (let c = 1; c <= ws.columnCount; c++) {
      if (String(ws.getRow(2).getCell(c).value ?? "") === kol.field.labelEn) return c;
    }
    throw new Error(`kolom niet gevonden voor ${fieldKey}`);
  };
  const waarden: Record<string, string> = {
    supplier_article_code: "A-1",
    name_en: "Downlight A",
    category: "Indoor lighting > Downlights",
    list_price_excl_vat: "129.50",
    [EIGEN_KEY]: "35",
  };
  for (const [key, waarde] of Object.entries(waarden)) {
    ws.getRow(EERSTE_DATARIJ).getCell(kolom(key)).value = waarde;
  }
  const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);

  const res = (await validateFilledTemplateXlsx(bytes, cat, {
    knownArticleCodes: new Set(["A-1"]),
  })) as FormatGeldig;
  expect(res.ok).toBe(true);

  const { rows } = diffTemplateRows(
    res.rijen,
    bestaand("A-1"),
    res.waarschuwingen,
    EIGEN_ACTIEF,
  );
  expect(veld(alleen(rows), EIGEN_KEY)).toMatchObject({
    kind: "new",
    doel: { kind: "custom", fieldId: EIGEN.id },
    next: "35",
  });
});
