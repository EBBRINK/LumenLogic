// Tests bij lib/excel-validate.ts. Fixture-discipline (het punt van deze hele opzet):
// ELKE fixture — ook elke kapotte — is een mutatie van de échte buildMasterTemplateXlsx()-
// buffer. Er staat dus nergens, in module noch test, een handgetypte kolomlijst. Builder
// en validator kunnen daardoor niet uiteenlopen. Zelfde patroon als excel-template.test.ts
// (buffer terug-parsen, ArrayBuffer-cast, alles uit de catalog afleiden).
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { catalogusMet, type EigenVeldDef } from "@/lib/custom-fields";
import {
  excelColumns,
  FIELD_CATALOG,
  type CatalogBucket,
} from "@/lib/field-catalog";

/** Het vaste deel van de catalogus — wat elke bestaande test hier bedoelt. De 1.8-tests
 *  onderaan geven expliciet een catalogus mét eigen velden mee. */
const CATALOGUS = FIELD_CATALOG;
import { buildMasterTemplateXlsx } from "./excel-template";
import {
  EERSTE_DATARIJ,
  validateFilledTemplateXlsx,
  WERKBLAD_NAAM,
  type FormatAfgewezen,
  type FormatGeldig,
} from "./excel-validate";

// ── Fixture-gereedschap ─────────────────────────────────────────────────────

function alsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function laadTemplate(
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(alsArrayBuffer(await buildMasterTemplateXlsx(catalogus)) as never);
  return wb;
}

/** labelEn van een catalog-key — uit de catalog, nooit getypt. */
function labelVan(
  fieldKey: string,
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): string {
  const kol = excelColumns(catalogus).find(({ field }) => field.key === fieldKey);
  if (!kol) throw new Error(`onbekende fieldKey in test: ${fieldKey}`);
  return kol.field.labelEn;
}

/** Kolomnummer van een catalog-key, gevonden via de koprij zelf (nooit een index hardcoden). */
function kolomVan(
  ws: ExcelJS.Worksheet,
  fieldKey: string,
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): number {
  const label = labelVan(fieldKey, catalogus);
  for (let c = 1; c <= ws.columnCount; c++) {
    if (String(ws.getRow(2).getCell(c).value ?? "") === label) return c;
  }
  throw new Error(`kolom niet gevonden voor ${fieldKey}`);
}

/** De must-velden, runtime afgeleid — net als de module zelf. */
function mustKeys(
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): string[] {
  return excelColumns(catalogus)
    .filter(({ field }) => field.niveau === "must")
    .map(({ field }) => field.key);
}

/** Een geldige rij: alle must-velden gevuld. */
function rij(code: string, extra: Record<string, string | number | boolean> = {}) {
  return {
    supplier_article_code: code,
    name_en: `Downlight ${code}`,
    category: "Indoor lighting > Downlights",
    list_price_excl_vat: "129.50",
    ...extra,
  };
}

/**
 * Bouwt het échte template, vult het met rijen vanaf rij 4, en laat de test het daarna
 * kapotmaken. Elke negatieve fixture is zo een afwijking van het echte template.
 */
async function bouwIngevuldTemplate(
  rijen: Record<string, string | number | boolean>[],
  muteer?: (ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) => void,
  catalogus: readonly CatalogBucket[] = CATALOGUS,
): Promise<Uint8Array> {
  const wb = await laadTemplate(catalogus);
  const ws = wb.getWorksheet(WERKBLAD_NAAM)!;
  rijen.forEach((waarden, i) => {
    for (const [fieldKey, waarde] of Object.entries(waarden)) {
      ws.getRow(EERSTE_DATARIJ + i).getCell(kolomVan(ws, fieldKey, catalogus)).value =
        waarde;
    }
  });
  muteer?.(ws, wb);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function geldig(
  bytes: Uint8Array,
  context?: Parameters<typeof validateFilledTemplateXlsx>[2],
  catalogus: readonly CatalogBucket[] = CATALOGUS,
) {
  const res = await validateFilledTemplateXlsx(bytes, catalogus, context);
  expect(res.ok, `verwachtte een geldig format, kreeg: ${JSON.stringify((res as FormatAfgewezen).reden)}`).toBe(true);
  return res as FormatGeldig;
}

async function afgewezen(
  bytes: Uint8Array,
  catalogus: readonly CatalogBucket[] = CATALOGUS,
) {
  const res = await validateFilledTemplateXlsx(bytes, catalogus);
  expect(res.ok).toBe(false);
  return res as FormatAfgewezen;
}

// ── Rondgang & geldig format ────────────────────────────────────────────────

test("RONDGANG: de échte buildMasterTemplateXlsx()-buffer met testrijen passeert de validatie", async () => {
  const res = await geldig(
    await bouwIngevuldTemplate([rij("123-456-78"), rij("999-000-11")]),
    { knownArticleCodes: new Set(["123-456-78", "999-000-11"]) },
  );
  expect(res.werkblad).toBe(WERKBLAD_NAAM);
  expect(res.rijen).toHaveLength(2);
  expect(res.waarschuwingen).toEqual([]);
  expect(res.ontbrekendeOptioneleKolommen).toEqual([]);
  expect(res.onbekendeKolommen).toEqual([]);
});

test("RONDGANG: het kale gedownloade template (200 cosmetische invulrijen) is geldig met 0 datarijen", async () => {
  const res = await geldig(await buildMasterTemplateXlsx(CATALOGUS));
  expect(res.rijen).toEqual([]);
  expect(res.waarschuwingen).toEqual([]);
});

test("de herkende kolommen dekken exact excelColumns(CATALOGUS) — geen hardgecodeerde kolomlijst", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("A-1")]));
  expect(res.kolommen.map((k) => k.fieldKey)).toEqual(
    excelColumns(CATALOGUS).map(({ field }) => field.key),
  );
});

test("elke genormaliseerde labelEn is uniek — naam-herkenning kan niet botsen", () => {
  // De module draagt deze aanname over field-catalog.ts; hier wordt hij afgedwongen in
  // plaats van gehoopt. Zelfde normalisatie-kern als normLabel() in de module.
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const labels = excelColumns(CATALOGUS).map(({ field }) => norm(field.labelEn));
  expect(new Set(labels).size).toBe(labels.length);
});

test("rijnummers zijn Excel-rijnummers: de eerste datarij is rij 4", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("A-1"), rij("A-2")]));
  expect(res.rijen.map((r) => r.rij)).toEqual([4, 5]);
});

test("waarden komen binnen per catalog-key, niet per kolomindex", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("A-1", { kelvin: 3000 })]));
  expect(res.rijen[0].velden.supplier_article_code).toBe("A-1");
  expect(res.rijen[0].velden.name_en).toBe("Downlight A-1");
  expect(res.rijen[0].velden.kelvin).toBe("3000");
});

test("WIJZIGINGSDETECTOR: de must-velden zijn vandaag precies deze vier", () => {
  // De module leidt de must-set runtime af; deze test pint hem vast. Wijzigt dit, lees dan
  // de HANDOVER-notitie: een veld naar `must` promoveren wijst élk merkbestand af dat op
  // dat moment onderweg is. Bewuste beslissing, geen sluipende.
  expect(mustKeys().sort()).toEqual(
    ["category", "list_price_excl_vat", "name_en", "supplier_article_code"].sort(),
  );
});

// ── Format-afwijzing ────────────────────────────────────────────────────────

test("afwijzing: werkblad 'Product data' ontbreekt — de reden noemt de gevonden werkbladen", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.name = "Sheet1";
  });
  const res = await afgewezen(bytes);
  expect(res.reden.code).toBe("werkblad_ontbreekt");
  if (res.reden.code !== "werkblad_ontbreekt") throw new Error();
  expect(res.reden.verwacht).toBe(WERKBLAD_NAAM);
  expect(res.reden.gevondenWerkbladen).toContain("Sheet1");
  expect(res.reden.gevondenWerkbladen).toContain("Instructions");
});

test("werkbladnaam met andere hoofdletters en een spatie erachter wordt gewoon herkend", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.name = "product data ";
  });
  const res = await geldig(bytes);
  expect(res.werkblad).toBe("product data ");
});

test("afwijzing: hernoemde must-kolom — de reden noemt exact dat veld en geen ander", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(2).getCell(kolomVan(ws, "supplier_article_code")).value = "Article no";
  });
  const res = await afgewezen(bytes);
  expect(res.reden.code).toBe("must_kolommen_ontbreken");
  if (res.reden.code !== "must_kolommen_ontbreken") throw new Error();
  expect(res.reden.ontbrekend.map((k) => k.fieldKey)).toEqual(["supplier_article_code"]);
  expect(res.reden.ontbrekend[0].labelEn).toBe(labelVan("supplier_article_code"));
});

test("afwijzing: alle must-kolommen weg — één reden met alle vier", async () => {
  const bytes = await bouwIngevuldTemplate([], (ws) => {
    for (const key of mustKeys()) ws.getRow(2).getCell(kolomVan(ws, key)).value = null;
  });
  const res = await afgewezen(bytes);
  if (res.reden.code !== "must_kolommen_ontbreken") throw new Error("verkeerde reden");
  expect(res.reden.ontbrekend.map((k) => k.fieldKey).sort()).toEqual(mustKeys().sort());
});

test("afwijzing: rij 2 bevat geen enkel label van ons — geen waslijst van 66 kolommen", async () => {
  const bytes = await bouwIngevuldTemplate([], (ws) => {
    for (let c = 1; c <= ws.columnCount; c++) {
      ws.getRow(2).getCell(c).value = c === 1 ? "Artikel" : c === 2 ? "Prijs" : null;
    }
  });
  const res = await afgewezen(bytes);
  if (res.reden.code !== "koprij_niet_herkend") throw new Error("verkeerde reden");
  expect(res.reden.gelezenKoprij).toEqual(["Artikel", "Prijs"]);
  expect(res.reden.labelsGevondenOpRij).toBeNull();
});

test("afwijzing: labels op een andere rij (merk voegde een rij bovenaan in) — de reden zegt wáár ze staan", async () => {
  const bytes = await bouwIngevuldTemplate([], (ws) => {
    ws.spliceRows(1, 0, ["Prijslijst juni 2026"]); // alles schuift één omlaag → labels op rij 3
  });
  const res = await afgewezen(bytes);
  if (res.reden.code !== "koprij_niet_herkend") throw new Error("verkeerde reden");
  expect(res.reden.labelsGevondenOpRij).toBe(3);
});

test("afwijzing: dezelfde kolomkop twee keer — de module gokt niet welke telt", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    const doel = ws.columnCount + 1;
    ws.getRow(2).getCell(doel).value = labelVan("list_price_excl_vat");
  });
  const res = await afgewezen(bytes);
  if (res.reden.code !== "dubbele_kolomkop") throw new Error("verkeerde reden");
  expect(res.reden.labelEn).toBe(labelVan("list_price_excl_vat"));
  expect(res.reden.kolommen).toHaveLength(2);
});

test("NEGATIEF: een afwijzing draagt geen enkele rij en geen enkele waarschuwing", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1"), rij("A-1")], (ws) => {
    ws.name = "Sheet1";
  });
  const res = await afgewezen(bytes);
  expect("rijen" in res).toBe(false);
  expect("waarschuwingen" in res).toBe(false);
  expect(Object.keys(res).sort()).toEqual(["ok", "reden"]);
});

test("onleesbaar: willekeurige bytes → onleesbaar_bestand, geen exception", async () => {
  const res = await afgewezen(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  expect(res.reden.code).toBe("onleesbaar_bestand");
});

test("onleesbaar: 0 bytes → onleesbaar_bestand, geen exception", async () => {
  const res = await afgewezen(new Uint8Array(0));
  expect(res.reden.code).toBe("onleesbaar_bestand");
});

test("een ArrayBuffer wordt net zo goed geaccepteerd als een Uint8Array", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")]);
  const res = await validateFilledTemplateXlsx(alsArrayBuffer(bytes), CATALOGUS);
  expect(res.ok).toBe(true);
});

// ── Kolomtolerantie ─────────────────────────────────────────────────────────

test("kolommen omgewisseld: alles wordt op naam herkend, waarden blijven bij hun veld", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    const a = kolomVan(ws, "supplier_article_code");
    const b = kolomVan(ws, "category");
    for (const r of [2, EERSTE_DATARIJ]) {
      const va = ws.getRow(r).getCell(a).value;
      ws.getRow(r).getCell(a).value = ws.getRow(r).getCell(b).value;
      ws.getRow(r).getCell(b).value = va;
    }
  });
  const res = await geldig(bytes);
  // De data is meeverhuisd met het label: geen stille kolomdrift.
  expect(res.rijen[0].velden.supplier_article_code).toBe("A-1");
  expect(res.rijen[0].velden.category).toBe("Indoor lighting > Downlights");
});

test("onbekende extra merk-kolom wordt genegeerd én gemeld met kolomnummer en koptekst", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    const doel = ws.columnCount + 1;
    ws.getRow(2).getCell(doel).value = "Onze levertijd";
    ws.getRow(EERSTE_DATARIJ).getCell(doel).value = "3 weken";
  });
  const res = await geldig(bytes);
  expect(res.onbekendeKolommen).toHaveLength(1);
  expect(res.onbekendeKolommen[0].koptekst).toBe("Onze levertijd");
  expect(res.rijen).toHaveLength(1);
});

test("weggelaten optionele kolom is geen afwijzing maar een melding — en de key ontbreekt in velden", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(2).getCell(kolomVan(ws, "cri")).value = null;
  });
  const res = await geldig(bytes);
  expect(res.ontbrekendeOptioneleKolommen.map((k) => k.fieldKey)).toEqual(["cri"]);
  // Kolom ontbrak ≠ cel leeg: zonder dit onderscheid stelt 1.2 voor bestaande data te wissen.
  expect("cri" in res.rijen[0].velden).toBe(false);
});

test("kop met hoofdletters, dubbele spaties en een NBSP wordt herkend", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(2).getCell(kolomVan(ws, "category")).value = " CATEGORY  ";
  });
  const res = await geldig(bytes);
  expect(res.kolommen.map((k) => k.fieldKey)).toContain("category");
});

test("kop met rich text (opgemaakt) wordt als tekst gelezen, niet als '[object Object]'", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(2).getCell(kolomVan(ws, "category")).value = {
      richText: [
        { text: "Cate" },
        { text: "gory", font: { bold: true } },
      ],
    } as ExcelJS.CellRichTextValue;
  });
  const res = await geldig(bytes);
  expect(res.kolommen.map((k) => k.fieldKey)).toContain("category");
});

// ── Rij-waarschuwingen ──────────────────────────────────────────────────────

test("leeg must-veld → waarschuwing met Excel-rijnummer en veldlabel", async () => {
  const bytes = await bouwIngevuldTemplate([{ ...rij("A-1"), category: "" }]);
  const res = await geldig(bytes);
  const w = res.waarschuwingen.filter((x) => x.code === "must_veld_leeg");
  expect(w).toHaveLength(1);
  expect(w[0]).toMatchObject({ rij: 4, fieldKey: "category", labelEn: labelVan("category") });
  // Waarschuwingen blokkeren niets.
  expect(res.rijen).toHaveLength(1);
});

test("cel met alleen spaties telt als leeg must-veld", async () => {
  const res = await geldig(await bouwIngevuldTemplate([{ ...rij("A-1"), category: "   " }]));
  expect(res.waarschuwingen.some((w) => w.code === "must_veld_leeg")).toBe(true);
});

test("onbekende artikelcode geeft 'nieuw product?' — een dubbelcheck, geen afwijzing", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("NIEUW-1"), rij("OUD-1")]), {
    knownArticleCodes: new Set(["OUD-1"]),
  });
  const w = res.waarschuwingen.filter((x) => x.code === "onbekende_artikelcode");
  expect(w).toHaveLength(1);
  expect(w[0]).toMatchObject({ rij: 4, artikelcode: "NIEUW-1" });
  expect(res.artikelcodesGecontroleerd).toBe(true);
});

test("bekende artikelcode geeft geen waarschuwing; omringende spaties tellen niet mee", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("  OUD-1  ")]), {
    knownArticleCodes: new Set(["OUD-1"]),
  });
  expect(res.waarschuwingen.filter((w) => w.code === "onbekende_artikelcode")).toEqual([]);
});

test("NEGATIEF: een code die alleen in hoofdletters verschilt geldt NIET als bekend", async () => {
  // products_brand_sac_uniq is hoofdlettergevoelig. Zouden we hier casefolden, dan zwijgt
  // de module terwijl 1.2 exact matcht, 'nieuw' concludeert en stil een dubbel product maakt.
  const res = await geldig(await bouwIngevuldTemplate([rij("oud-1")]), {
    knownArticleCodes: new Set(["OUD-1"]),
  });
  expect(res.waarschuwingen.filter((w) => w.code === "onbekende_artikelcode")).toHaveLength(1);
});

test("zonder knownArticleCodes: geen enkele onbekende-code-waarschuwing én artikelcodesGecontroleerd is false", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("WAT-DAN-OOK")]));
  expect(res.waarschuwingen.filter((w) => w.code === "onbekende_artikelcode")).toEqual([]);
  expect(res.artikelcodesGecontroleerd).toBe(false);
});

test("met een lege knownArticleCodes-set is elke rij nieuw en is de check wél gedraaid", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("A-1"), rij("A-2")]), {
    knownArticleCodes: new Set(),
  });
  expect(res.waarschuwingen.filter((w) => w.code === "onbekende_artikelcode")).toHaveLength(2);
  expect(res.artikelcodesGecontroleerd).toBe(true);
});

test("dubbele artikelcode: beide rijen krijgen een waarschuwing die naar de andere wijst", async () => {
  const res = await geldig(await bouwIngevuldTemplate([rij("DUP-1"), rij("DUP-1")]));
  const w = res.waarschuwingen.filter((x) => x.code === "dubbele_artikelcode");
  expect(w).toHaveLength(2);
  expect(w[0]).toMatchObject({ rij: 4, ookOpRijen: [5] });
  expect(w[1]).toMatchObject({ rij: 5, ookOpRijen: [4] });
});

test("drie rijen met dezelfde code: elke rij noemt de twee andere", async () => {
  const res = await geldig(
    await bouwIngevuldTemplate([rij("DUP-1"), rij("DUP-1"), rij("DUP-1")]),
  );
  const w = res.waarschuwingen.filter((x) => x.code === "dubbele_artikelcode");
  expect(w).toHaveLength(3);
  expect(w.map((x) => (x as { ookOpRijen: number[] }).ookOpRijen)).toEqual([
    [5, 6],
    [4, 6],
    [4, 5],
  ]);
});

test("duplicaat-detectie binnen het bestand negeert hoofdletterverschil", async () => {
  // Asymmetrisch met de bekende-codes-lookup, en dat is opzet: een gemist duplicaat is
  // stille schade, een extra dubbelcheck is gratis.
  const res = await geldig(await bouwIngevuldTemplate([rij("dup-1"), rij("DUP-1")]));
  expect(res.waarschuwingen.filter((w) => w.code === "dubbele_artikelcode")).toHaveLength(2);
});

test("NEGATIEF: rijen met een lege artikelcode zijn geen duplicaten van elkaar", async () => {
  const res = await geldig(
    await bouwIngevuldTemplate([
      { ...rij("A-1"), supplier_article_code: "" },
      { ...rij("A-2"), supplier_article_code: "" },
    ]),
  );
  expect(res.waarschuwingen.filter((w) => w.code === "dubbele_artikelcode")).toEqual([]);
  expect(res.waarschuwingen.filter((w) => w.code === "must_veld_leeg")).toHaveLength(2);
});

test("lege rij tussen twee gevulde rijen wordt overgeslagen; de rij erna houdt zijn eigen rijnummer", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1"), {}, rij("A-3")]);
  const res = await geldig(bytes);
  expect(res.rijen.map((r) => r.rij)).toEqual([4, 6]);
});

test("een rij met alléén inhoud in de eigen kolom van het merk telt niet als datarij", async () => {
  // Raakt de inhoudelijke datarij-regel: exceljs ziet hier wél een rij (er staat iets in),
  // maar voor óns is hij leeg. Zonder deze regel zou zo'n rij vier lege-must-waarschuwingen
  // opleveren. Bewuste consequentie, hier vastgepind.
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    const doel = ws.columnCount + 1;
    ws.getRow(2).getCell(doel).value = "Onze notitie";
    ws.getRow(EERSTE_DATARIJ + 1).getCell(doel).value = "even navragen bij inkoop";
  });
  const res = await geldig(bytes);
  expect(res.rijen.map((r) => r.rij)).toEqual([4]);
  expect(res.waarschuwingen).toEqual([]);
});

test("een rij met alleen witruimte in onze kolommen telt niet als datarij", async () => {
  const bytes = await bouwIngevuldTemplate([
    rij("A-1"),
    { supplier_article_code: "   ", name_en: "  ", category: " ", list_price_excl_vat: "" },
  ]);
  const res = await geldig(bytes);
  expect(res.rijen.map((r) => r.rij)).toEqual([4]);
  expect(res.waarschuwingen).toEqual([]);
});

test("waarschuwingen zijn stabiel gesorteerd op rijnummer", async () => {
  const res = await geldig(
    await bouwIngevuldTemplate([rij("DUP"), { ...rij("X"), category: "" }, rij("DUP")]),
    { knownArticleCodes: new Set() },
  );
  const rijen = res.waarschuwingen.map((w) => w.rij);
  expect(rijen).toEqual([...rijen].sort((a, b) => a - b));
});

// ── Celtypes ────────────────────────────────────────────────────────────────

test("getal-, boolean- en datumcellen worden als tekst gelezen zonder '[object Object]'", async () => {
  const bytes = await bouwIngevuldTemplate([
    rij("A-1", { kelvin: 3000, light_source_included: true, ean_code: 8712345678906 }),
  ]);
  const res = await geldig(bytes);
  expect(res.rijen[0].velden.kelvin).toBe("3000");
  expect(res.rijen[0].velden.light_source_included).toBe("true");
  // Geen wetenschappelijke notatie: String(), niet cell.text.
  expect(res.rijen[0].velden.ean_code).toBe("8712345678906");
  for (const v of Object.values(res.rijen[0].velden)) {
    expect(v).not.toContain("[object Object]");
  }
});

test("formulecel wordt op zijn berekende uitkomst gelezen", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(EERSTE_DATARIJ).getCell(kolomVan(ws, "efficacy")).value = {
      formula: "55*2",
      result: 110,
    } as ExcelJS.CellFormulaValue;
  });
  const res = await geldig(bytes);
  expect(res.rijen[0].velden.efficacy).toBe("110");
});

test("foutcel (#N/A) telt als leeg en veroorzaakt geen exception", async () => {
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    ws.getRow(EERSTE_DATARIJ).getCell(kolomVan(ws, "category")).value = {
      error: "#N/A",
    } as ExcelJS.CellErrorValue;
  });
  const res = await geldig(bytes);
  expect(res.rijen[0].velden.category).toBe("");
  expect(res.waarschuwingen.some((w) => w.code === "must_veld_leeg")).toBe(true);
});

test("het prijsveld wordt alleen op gevuld/leeg getoetst, nooit op waarde", async () => {
  // IJzeren regel 2: geld beïnvloedt nooit de ranking. Een absurd bedrag is geen oordeel.
  const res = await geldig(await bouwIngevuldTemplate([rij("A-1", { list_price_excl_vat: -999999 })]));
  expect(res.waarschuwingen).toEqual([]);
  expect(res.rijen[0].velden.list_price_excl_vat).toBe("-999999");
});

// ── Structurele waarborgen (hier zit de herbruikbaarheid van 4.B) ───────────

test("NEGATIEF: geen enkel 🔒-veld komt in het resultaat terecht — ook niet als het merk er een kolom voor toevoegt", async () => {
  const intern = FIELD_CATALOG.flatMap((b) => b.fields).filter((f) => f.internalOnly);
  expect(intern.length).toBeGreaterThanOrEqual(5);
  const bytes = await bouwIngevuldTemplate([rij("A-1")], (ws) => {
    const doel = ws.columnCount + 1;
    ws.getRow(2).getCell(doel).value = intern[0].labelEn; // bv. "Purchase price excl. VAT"
    ws.getRow(EERSTE_DATARIJ).getCell(doel).value = "89.00";
  });
  const res = await geldig(bytes);
  // De 🔒-kolom is niet herkend (excelColumns(CATALOGUS) filtert dubbel) en belandt als rauwe
  // koptekst bij de onbekende kolommen — de fieldKey raakt het resultaat nooit.
  for (const f of intern) {
    expect(res.kolommen.map((k) => k.fieldKey)).not.toContain(f.key);
    expect(Object.keys(res.rijen[0].velden)).not.toContain(f.key);
  }
  expect(res.onbekendeKolommen.map((k) => k.koptekst)).toContain(intern[0].labelEn);
});

test("het resultaat is JSON-serialiseerbaar — 4.B zet het in brand_uploads.payload", async () => {
  // Letterlijk het ontwerpdoel: geen Map/Set/Date/class in de uitkomst.
  const ok = await geldig(await bouwIngevuldTemplate([rij("A-1"), rij("A-1")]), {
    knownArticleCodes: new Set(["X"]),
  });
  expect(JSON.parse(JSON.stringify(ok))).toEqual(ok);
  const nok = await afgewezen(new Uint8Array([1, 2, 3]));
  expect(JSON.parse(JSON.stringify(nok))).toEqual(nok);
});

// ── Sprint 1.8: eigen velden ─────────────────────────────────────────────────

function eigenVeld(niveau: "must" | "wanna" | "nice"): EigenVeldDef {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    labelNl: "Gerecycled aandeel (%)",
    labelEn: "Recycled content (%)",
    instructieNl: "Percentage gerecycled materiaal, bv. 35.",
    instructionEn: "Share of recycled material in percent, e.g. 35.",
    niveau,
    bucketKey: "duurzaamheid_milieu",
    createdAt: "2026-07-21T10:00:00.000Z",
    archivedAt: null,
  };
}

test("1.8: een ingevulde eigen kolom wordt herkend op zijn labeltekst, net als elk ander veld", async () => {
  const def = eigenVeld("wanna");
  const cat = catalogusMet([def]);
  const key = `custom:${def.id}`;
  const bytes = await bouwIngevuldTemplate(
    [{ ...rij("A-1"), [key]: "35" }],
    undefined,
    cat,
  );
  const res = await geldig(bytes, undefined, cat);
  expect(res.kolommen.map((k) => k.fieldKey)).toContain(key);
  expect(res.rijen[0].velden[key]).toBe("35");
  expect(res.onbekendeKolommen).toEqual([]);
});

// DE KERN VAN BESLUIT §2. Een ontbrekende must-KOLOM van de catalogus is een harde
// afwijzing; van een eigen veld nooit.
test("1.8: een ontbrekende eigen MUST-kolom wijst het bestand NIET af", async () => {
  const def = eigenVeld("must");
  const cat = catalogusMet([def]);
  const key = `custom:${def.id}`;
  // Een bestand dat al onderweg was: gebouwd vóórdat het veld bestond, dus zónder die kolom.
  const bytes = await bouwIngevuldTemplate([rij("A-1")], undefined, CATALOGUS);

  const res = await geldig(bytes, undefined, cat);
  expect(res.ontbrekendeOptioneleKolommen.map((k) => k.fieldKey)).toContain(key);
  // …en het niveau reist gewoon mee: `must` blijft waar voor de weging, alleen niet voor
  // de afwijzing.
  expect(
    res.ontbrekendeOptioneleKolommen.find((k) => k.fieldKey === key)?.niveau,
  ).toBe("must");
});

test("1.8: CONTRAST — een ontbrekende CATALOGUS-must wijst wél af (die is dragend)", async () => {
  const cat = catalogusMet([eigenVeld("must")]);
  const bytes = await bouwIngevuldTemplate(
    [rij("A-1")],
    (ws) => {
      ws.getRow(2).getCell(kolomVan(ws, "supplier_article_code", cat)).value = null;
    },
    cat,
  );
  const res = await afgewezen(bytes, cat);
  expect(res.reden.code).toBe("must_kolommen_ontbreken");
  if (res.reden.code !== "must_kolommen_ontbreken") throw new Error("onverwacht");
  // Alleen de catalogus-must staat in de lijst; het eigen must-veld nooit.
  expect(res.reden.ontbrekend.map((k) => k.fieldKey)).toEqual([
    "supplier_article_code",
  ]);
});

test("1.8: een lege cel in een eigen MUST-kolom is wél een rijwaarschuwing", async () => {
  const def = eigenVeld("must");
  const cat = catalogusMet([def]);
  const key = `custom:${def.id}`;
  const bytes = await bouwIngevuldTemplate(
    [{ ...rij("A-1"), [key]: "" }],
    undefined,
    cat,
  );
  const res = await geldig(bytes, undefined, cat);
  // De asymmetrie van de module blijft intact: kolom ontbreekt = het merk zag het veld
  // nooit; cel leeg = het merk zag het en had niets.
  expect(
    res.waarschuwingen.filter((w) => w.code === "must_veld_leeg" && w.fieldKey === key),
  ).toHaveLength(1);
});
