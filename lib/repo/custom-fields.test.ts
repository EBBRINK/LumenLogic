// Tests bij lib/repo/custom-fields.ts op PGlite — dezelfde migraties als Neon, inclusief
// 0015. Wat hier bewezen moet worden zit niet in de pure laag:
//   • de CHECKs en de partiële unique index van 0015 doen écht wat ze beloven;
//   • archiveren TELT EERST en wist nooit waarden;
//   • de teltelling gebruikt de sleutel als parameter en telt "" niet als gevuld;
//   • elk schrijfpad logt zijn eigen event, met de changed-lijst afgeleid uit de patch.
import { expect, test } from "vitest";
import { desc, eq, sql } from "drizzle-orm";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { customFields, events, products } from "@/db/schema";
import { eigenVeldKey } from "@/lib/custom-fields";
import { excelColumns } from "@/lib/field-catalog";
import {
  CUSTOM_FIELD_ENTITY,
  archiveEigenVeld,
  createEigenVeld,
  laadCatalogus,
  listEigenVelden,
  telProductenMetWaarde,
  updateEigenVeld,
} from "./custom-fields";

const INVOER = {
  labelEn: "Recycled content (%)",
  instructionEn: "Share of recycled material in percent, e.g. 35.",
  niveau: "wanna" as const,
  bucketKey: "duurzaamheid_milieu",
};

async function eventsVan(db: TestDb, id: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.entityId, id))
    .orderBy(desc(events.createdAt));
}

/** Zet een eigen waarde op een product zonder door het retour-pad te gaan. */
async function zetWaarde(
  db: TestDb,
  productId: string,
  waarden: Record<string, string>,
) {
  await db
    .update(products)
    .set({ customValues: waarden })
    .where(eq(products.id, productId));
}

// ── Aanmaken ────────────────────────────────────────────────────────────────

test("createEigenVeld: uuid-PK, actief, en een event met het label erin", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER, "stefan@brinklicht.nl");

  expect(def.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(def.archivedAt).toBeNull();
  expect(def.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const [ev] = await eventsVan(db, def.id);
  expect(ev.entity).toBe(CUSTOM_FIELD_ENTITY);
  expect(ev.action).toBe("custom_field_created");
  expect(ev.actor).toBe("stefan@brinklicht.nl");
  // labelEn in de payload is wat de uuid-sleutel leesbaar houdt: zonder dit is een event
  // over `custom:9f2c…` voor een mens betekenisloos.
  expect(ev.payload).toMatchObject({
    labelEn: INVOER.labelEn,
    niveau: "wanna",
    bucketKey: "duurzaamheid_milieu",
  });
});

test("createEigenVeld: labels en instructies worden getrimd", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, { ...INVOER, labelEn: "  Recycled content (%)  " });
  expect(def.labelEn).toBe("Recycled content (%)");
});

// 1.9: 0016 maakt label_nl/instructie_nl nullable en drizzle schrijft ze niet meer — dit
// bewijst dat 0016 op déze test-DB draait en dat er geen verstopte schrijver van de
// legacy-kolommen is. Rauwe select, want db/schema.ts kent de kolommen bewust niet meer.
test("1.9: een verse createEigenVeld laat label_nl en instructie_nl NULL — 0016 draait, geen verstopte schrijver", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const res = await db.execute(
    sql`select label_nl, instructie_nl from custom_fields where id = ${def.id}`,
  );
  const rows = (
    Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []
  ) as { label_nl: string | null; instructie_nl: string | null }[];
  expect(rows[0].label_nl).toBeNull();
  expect(rows[0].instructie_nl).toBeNull();
});

// ── De constraints uit migratie 0015 ────────────────────────────────────────

test("0015: bucket 'intern' wordt door de DATABASE geweigerd, niet alleen door de UI", async () => {
  const db = await createTestDb();
  await expect(
    createEigenVeld(db, { ...INVOER, bucketKey: "intern" }),
  ).rejects.toThrow();
});

test("0015: een leeg label of een lege instructie wordt door de database geweigerd", async () => {
  const db = await createTestDb();
  await expect(createEigenVeld(db, { ...INVOER, labelEn: "   " })).rejects.toThrow();
  await expect(
    createEigenVeld(db, { ...INVOER, instructionEn: "" }),
  ).rejects.toThrow();
});

test("0015: een onbekend niveau wordt geweigerd", async () => {
  const db = await createTestDb();
  await expect(
    createEigenVeld(db, { ...INVOER, niveau: "graag" as never }),
  ).rejects.toThrow();
});

test("0015: twee ACTIEVE velden met hetzelfde genormaliseerde label kan niet — óók niet via hernoemen", async () => {
  const db = await createTestDb();
  await createEigenVeld(db, INVOER);
  // Andere casing en extra spaties: de index normaliseert.
  await expect(
    createEigenVeld(db, { ...INVOER, labelEn: "recycled   CONTENT (%)" }),
  ).rejects.toThrow();

  const tweede = await createEigenVeld(db, { ...INVOER, labelEn: "Take-back scheme" });
  await expect(
    updateEigenVeld(db, tweede.id, { labelEn: "Recycled content (%)" }),
  ).rejects.toThrow();
});

test("0015: na archiveren komt het label weer vrij (de index is partieel)", async () => {
  const db = await createTestDb();
  const eerste = await createEigenVeld(db, INVOER);
  await archiveEigenVeld(db, eerste.id);
  const tweede = await createEigenVeld(db, INVOER);
  expect(tweede.id).not.toBe(eerste.id);
});

// ── Lezen ───────────────────────────────────────────────────────────────────

test("listEigenVelden geeft standaard ALLEEN actieve velden — gearchiveerd op verzoek", async () => {
  const db = await createTestDb();
  const a = await createEigenVeld(db, INVOER);
  const b = await createEigenVeld(db, { ...INVOER, labelEn: "Take-back scheme" });
  await archiveEigenVeld(db, a.id);

  expect((await listEigenVelden(db)).map((d) => d.id)).toEqual([b.id]);
  expect(
    (await listEigenVelden(db, { metGearchiveerd: true })).map((d) => d.id).sort(),
  ).toEqual([a.id, b.id].sort());
});

test("laadCatalogus levert de COMPLETE catalogus: 66 + de actieve eigen velden", async () => {
  const db = await createTestDb();
  expect(excelColumns(await laadCatalogus(db))).toHaveLength(66);

  const def = await createEigenVeld(db, INVOER);
  const cat = await laadCatalogus(db);
  expect(excelColumns(cat)).toHaveLength(67);
  expect(excelColumns(cat).map(({ field }) => field.key)).toContain(eigenVeldKey(def));

  await archiveEigenVeld(db, def.id);
  expect(excelColumns(await laadCatalogus(db))).toHaveLength(66);
});

// ── Tellen ──────────────────────────────────────────────────────────────────

test("telProductenMetWaarde: telt gevulde waarden, en '' telt NIET als gevuld", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const ander = await createEigenVeld(db, { ...INVOER, labelEn: "Take-back scheme" });

  const { brandId, priceListId, productId } = await seedBrandProduct(db, {
    brand: "ZZTEST Merk",
    name: "Downlight A",
    supplierArticleCode: "A-1",
  });
  const tweede = await seedBrandProduct(db, {
    brand: "ZZTEST Merk 2",
    name: "Downlight B",
    supplierArticleCode: "B-1",
  });
  void brandId;
  void priceListId;

  await zetWaarde(db, productId, { [def.id]: "35" });
  // Leeggemaakt via het retour-pad: sleutel bestaat, waarde is "". Dat is geen dekking —
  // zou het meetellen, dan liegt de scorecard.
  await zetWaarde(db, tweede.productId, { [def.id]: "" });

  const telling = await telProductenMetWaarde(db);
  expect(telling.get(def.id)).toBe(1);
  expect(telling.get(ander.id)).toBe(0);
});

test("telProductenMetWaarde: een sleutel met rare tekens is een PARAMETER, geen SQL", async () => {
  // De uuid komt uit de database, maar de garantie mag daar niet van afhangen: als de
  // sleutel ooit als identifier in de SQL-tekst zou belanden, is dit de test die klapt.
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const { productId } = await seedBrandProduct(db, {
    brand: "ZZTEST Merk",
    name: "Downlight A",
    supplierArticleCode: "A-1",
  });
  await zetWaarde(db, productId, { [def.id]: "35", "' or 1=1 --": "x" });
  expect((await telProductenMetWaarde(db)).get(def.id)).toBe(1);
});

// ── Wijzigen ────────────────────────────────────────────────────────────────

test("updateEigenVeld: de changed-lijst komt uit de PATCH, niet uit een handlijst", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);

  const na = await updateEigenVeld(
    db,
    def.id,
    { labelEn: "Recyclaat (%)", niveau: "must" },
    "stefan@brinklicht.nl",
  );
  expect(na.labelEn).toBe("Recyclaat (%)");
  expect(na.niveau).toBe("must");

  const [ev] = await eventsVan(db, def.id);
  expect(ev.action).toBe("custom_field_updated");
  expect(ev.payload).toEqual({
    fields: {
      labelEn: { old: "Recycled content (%)", new: "Recyclaat (%)" },
      niveau: { old: "wanna", new: "must" },
    },
  });
});

test("updateEigenVeld: een patch die niets verandert logt geen event", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const voor = (await eventsVan(db, def.id)).length;
  await updateEigenVeld(db, def.id, { labelEn: INVOER.labelEn });
  expect((await eventsVan(db, def.id)).length).toBe(voor);
});

// ── Archiveren ──────────────────────────────────────────────────────────────

test("archiveEigenVeld: telt EERST, en de telling staat in het resultaat én in het event", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const { productId } = await seedBrandProduct(db, {
    brand: "ZZTEST Merk",
    name: "Downlight A",
    supplierArticleCode: "A-1",
  });
  await zetWaarde(db, productId, { [def.id]: "35" });

  const res = await archiveEigenVeld(db, def.id, "stefan@brinklicht.nl");
  expect(res).toEqual({ ok: true, productsWithValue: 1 });

  const [ev] = await eventsVan(db, def.id);
  expect(ev.action).toBe("custom_field_archived");
  expect(ev.payload).toEqual({ labelEn: INVOER.labelEn, productsWithValue: 1 });
});

test("archiveEigenVeld WIST NOOIT WAARDEN — en verzet updated_at van geen enkel product", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  const { productId } = await seedBrandProduct(db, {
    brand: "ZZTEST Merk",
    name: "Downlight A",
    supplierArticleCode: "A-1",
  });
  await zetWaarde(db, productId, { [def.id]: "35" });
  const [voor] = await db.select().from(products).where(eq(products.id, productId));

  await archiveEigenVeld(db, def.id);

  const [na] = await db.select().from(products).where(eq(products.id, productId));
  // De waarde staat er nog: opnieuw activeren (of een DB-ingreep) brengt hem terug.
  expect(na.customValues).toEqual({ [def.id]: "35" });
  // En de fingerprint-discipline blijft intact: geen mass-update over productrijen.
  expect(na.updatedAt.toISOString()).toBe(voor.updatedAt.toISOString());
});

test("archiveEigenVeld: tweede keer is {ok:false} en logt geen tweede event", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, INVOER);
  expect(await archiveEigenVeld(db, def.id)).toEqual({ ok: true, productsWithValue: 0 });
  expect(await archiveEigenVeld(db, def.id)).toEqual({ ok: false });
  const acties = (await eventsVan(db, def.id)).map((e) => e.action);
  expect(acties.filter((a) => a === "custom_field_archived")).toHaveLength(1);
});

test("archiveEigenVeld op een onbekend id is {ok:false}, geen exception", async () => {
  const db = await createTestDb();
  expect(
    await archiveEigenVeld(db, "00000000-0000-4000-8000-000000000000"),
  ).toEqual({ ok: false });
  expect(await db.select().from(customFields)).toEqual([]);
});
