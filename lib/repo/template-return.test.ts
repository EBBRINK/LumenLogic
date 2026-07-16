// Het retour-pad op PGlite: staging → voorstel → toepassen/afwijzen. Bewijst de eigenschappen
// waar plan-besluit 5 op leunt, want zonder transactie moeten ze uit de VORM komen:
//   • de statusflip is de laatste stap → een afgebroken run blijft op staging staan;
//   • tweemaal toepassen convergeert (de diff wordt vers herberekend) en archiveert niet twee keer;
//   • wat de gebruiker niet zag wordt nooit overschreven (stale-guard);
//   • bestaand wint tenzij aangevinkt;
//   • afwijzen raakt de catalogus niet.
import { expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  brandRelations,
  brandUploads,
  events,
  prices,
  pricesArchive,
  products,
} from "@/db/schema";
import type { GelezenRij, RijWaarschuwing } from "@/lib/excel-validate";
import {
  fieldSelectionKey,
  newProductSelectionKey,
  priceSelectionKey,
  type ApplySelection,
  type TemplateReturnPayload,
} from "@/lib/template-diff";
import { listBrandUploadsForReview } from "@/lib/repo/admin";
import { archivePriceList } from "@/lib/repo/price-archive";
import {
  applyTemplateProposal,
  getTemplateReturn,
  rejectTemplateProposal,
  stageTemplateReturn,
} from "@/lib/repo/template-return";

// ── Gereedschap ─────────────────────────────────────────────────────────────

/** De validator-snapshot zoals hij in brand_uploads.payload leeft. `kolommen` volgt uit de
 *  rijen zelf: aanwezigheid van een key ís "de kolom stond in het bestand". */
function payloadVan(
  rijen: GelezenRij[],
  waarschuwingen: RijWaarschuwing[] = [],
): TemplateReturnPayload {
  return {
    v: 1,
    filename: "brink-template-ingevuld.xlsx",
    fileSize: 45_000,
    werkblad: "Product data",
    rijen,
    waarschuwingen,
    kolommen: [...new Set(rijen.flatMap((r) => Object.keys(r.velden)))],
    onbekendeKolommen: [],
    ontbrekendeOptioneleKolommen: [],
    artikelcodesGecontroleerd: true,
  };
}

function selectie(
  velden: Record<string, string | null>,
  nieuweProducten: string[] = [],
): ApplySelection {
  return {
    fields: new Map(Object.entries(velden)),
    newProducts: new Set(nieuweProducten),
  };
}

async function acties(db: TestDb): Promise<string[]> {
  return (await db.select().from(events)).map((e) => e.action);
}

async function productVan(db: TestDb, brandId: string, code: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.supplierArticleCode, code)));
  return row ?? null;
}

async function relatieStatus(db: TestDb, brandId: string) {
  const [row] = await db
    .select()
    .from(brandRelations)
    .where(eq(brandRelations.brandId, brandId));
  return row?.status ?? null;
}

/** Een merk met één bestaand product A-1 (kelvin 3000, cri 90, IP20) en prijs 196,00. */
async function seedMerk(db: TestDb) {
  return seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
    supplierArticleCode: "A-1",
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    price: "196.00",
  });
}

// ── Staging ─────────────────────────────────────────────────────────────────

test("stage: upload op staging + relatiestatus data_ontvangen + template_upload_staged", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);

  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([{ rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000" } }]),
    actor: "timo@brink",
  });

  const [upload] = await db.select().from(brandUploads).where(eq(brandUploads.id, uploadId));
  expect(upload.kind).toBe("template");
  expect(upload.status).toBe("staging");
  expect(upload.submittedBy).toBe("timo@brink");

  // Besluit 6: "dit merk heeft geleverd" is waar zodra het bestand door de validatie kwam —
  // voor de 1.3-outreach-werklijst is dat "niet meer najagen om data, wel nog verwerken".
  expect(await relatieStatus(db, brandId)).toBe("data_ontvangen");
  expect(await acties(db)).toEqual([
    "template_upload_staged",
    "brand_relation_status_changed",
  ]);

  // Niets in de catalogus: staging is een voorstel, geen schrijfactie.
  expect((await productVan(db, brandId, "A-1"))!.kelvin).toBe(3000);
});

test("getTemplateReturn: verse diff tegen de actuele catalogus, geen opgeslagen diff", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([{ rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000" } }]),
  });

  // Iemand anders wijzigt de catalogus ná het stagen: het voorstel moet meebewegen.
  await db.update(products).set({ kelvin: 4000 }).where(eq(products.id, productId));

  const ret = (await getTemplateReturn(db, uploadId))!;
  expect(ret.proposal.rows[0].kind).toBe("known");
  expect(ret.proposal.counts.changedFields).toBe(0);
  expect(ret.proposal.counts.unchangedFields).toBe(1);
  expect(ret.actievePrijslijst?.validUntil).toBe("2999-12-31");
});

test("het /admin/imports-gat: een template-upload staat NIET in de admin-wachtrij", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([{ rij: 4, velden: { supplier_article_code: "A-1" } }]),
  });

  // approveUpload daar flipt alleen de status en past NIETS toe: een goedkeurknop die stil
  // niets doet is precies het gedrag dat dit pad moet uitroeien (plan besluit 9).
  expect(await listBrandUploadsForReview(db)).toEqual([]);
});

// ── Toepassen ───────────────────────────────────────────────────────────────

test("apply end-to-end: nieuw product, new-veld, aangevinkte changed, niet-aangevinkte changed, clear", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedMerk(db);

  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      {
        rij: 4,
        velden: {
          supplier_article_code: "A-1",
          kelvin: "4000", // changed, AANGEVINKT
          ip_value: "IP44", // changed, NIET aangevinkt → bestaand wint
          color_1: "Black", // new, aangevinkt
          cri: "", // clear, aangevinkt → wissen
        },
      },
      {
        rij: 5,
        velden: {
          supplier_article_code: "B-9",
          name_en: "Downlight B",
          kelvin: "2700",
          list_price_excl_vat: "129.50",
        },
      },
    ]),
    actor: "timo@brink",
  });

  const res = await applyTemplateProposal(
    db,
    uploadId,
    selectie(
      {
        [fieldSelectionKey(4, "kelvin")]: "3000",
        [fieldSelectionKey(4, "color_1")]: null,
        [fieldSelectionKey(4, "cri")]: "90",
        [priceSelectionKey(5)]: null,
      },
      [newProductSelectionKey(5)],
    ),
    null,
    "timo@brink",
  );
  expect(res).toMatchObject({
    alreadyProcessed: false,
    createdProducts: 1,
    updatedProducts: 1,
    appliedFields: 3,
    skippedStaleFields: 0,
  });

  const a = (await productVan(db, brandId, "A-1"))!;
  expect(a.kelvin).toBe(4000); // aangevinkt
  expect(a.color1).toBe("Black"); // new
  expect(a.cri).toBeNull(); // clear
  expect(a.ipValue, "een niet-aangevinkte wijziging past NOOIT toe").toBe("IP20");
  expect(a.name, "products.name blijft de XIS-naam").toBe("SPY 39");

  const b = (await productVan(db, brandId, "B-9"))!;
  expect(b.name).toBe("Downlight B"); // NOT NULL: bij aanmaken vult name_en óók name
  expect(b.nameEn).toBe("Downlight B");
  expect(b.kelvin).toBe(2700);
  expect(b.brandName).toBe("Delta Light");

  // Prijs van het nieuwe product op de bestaande ACTIEVE lijst — geen tweede lijst.
  const [prijs] = await db.select().from(prices).where(eq(prices.productId, b.id));
  expect(prijs.grossPrice).toBe("129.50");
  expect(prijs.priceListId).toBe(priceListId);
  expect(res.alreadyProcessed === false && res.priceLines).toMatchObject({
    inserted: 1,
    updated: 0,
    archivedLines: 0,
  });

  // Het spoor (regel 5, plan besluit 8), in de volgorde van de negen stappen.
  expect(await acties(db)).toEqual([
    "template_upload_staged",
    "brand_relation_status_changed",
    "template_apply_started",
    "product_created_from_template",
    "product_fields_applied",
    "price_lines_upserted",
    "brand_relation_status_changed",
    "template_apply_finished",
  ]);
  const toegepast = (await db.select().from(events)).find(
    (e) => e.action === "product_fields_applied",
  )!;
  expect(toegepast.payload).toEqual({
    uploadId,
    fields: {
      kelvin: { old: "3000", new: "4000" },
      color_1: { old: null, new: "Black" },
      cri: { old: "90", new: null },
    },
  });

  // Statusflip als LAATSTE + relatiestatus verwerkt.
  const [upload] = await db.select().from(brandUploads).where(eq(brandUploads.id, uploadId));
  expect(upload.status).toBe("approved");
  expect(upload.reviewedBy).toBe("timo@brink");
  expect(await relatieStatus(db, brandId)).toBe("verwerkt");
});

test("apply: een geblokkeerd nieuw product (geen naam) wordt nooit aangemaakt", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      { rij: 4, velden: { supplier_article_code: "B-9", name_en: "", kelvin: "2700" } },
    ]),
  });

  // Zelfs mét een aangevinkte sleutel: products.name is NOT NULL en het formulier is geen
  // autoriteit over wat aanmaakbaar is.
  const res = await applyTemplateProposal(
    db,
    uploadId,
    selectie({}, [newProductSelectionKey(4)]),
    null,
  );
  expect(res).toMatchObject({ createdProducts: 0 });
  expect(await productVan(db, brandId, "B-9")).toBeNull();
});

test("IDEMPOTENTIE: tweemaal toepassen (halve run) → identieke eindtoestand, geen dubbele archiefrijen", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      {
        rij: 4,
        velden: {
          supplier_article_code: "A-1",
          kelvin: "4000",
          list_price_excl_vat: "210.00",
        },
      },
      { rij: 5, velden: { supplier_article_code: "B-9", name_en: "Downlight B" } },
    ]),
  });

  const keuze = () =>
    selectie(
      {
        [fieldSelectionKey(4, "kelvin")]: "3000",
        [priceSelectionKey(4)]: "196",
      },
      [newProductSelectionKey(5)],
    );

  const eerste = await applyTemplateProposal(db, uploadId, keuze(), null, "timo@brink");
  expect(eerste).toMatchObject({ createdProducts: 1, updatedProducts: 1 });
  expect(await db.select().from(pricesArchive)).toHaveLength(1);

  // Simuleer een run die halverwege klapte: de statusflip is de LAATSTE stap, dus bij een
  // crash staat de upload nog op staging en toont een herlading het voorstel opnieuw.
  await db
    .update(brandUploads)
    .set({ status: "staging" })
    .where(eq(brandUploads.id, uploadId));

  const tweede = await applyTemplateProposal(db, uploadId, keuze(), null, "timo@brink");
  // De verse diff ziet nu overal 'unchanged': niets meer te doen, geen stale-melding.
  expect(tweede).toMatchObject({
    alreadyProcessed: false,
    createdProducts: 0,
    updatedProducts: 0,
    appliedFields: 0,
    skippedStaleFields: 0,
    priceLines: null,
  });

  const a = (await productVan(db, brandId, "A-1"))!;
  expect(a.kelvin).toBe(4000);
  const prijzen = await db.select().from(prices).where(eq(prices.productId, a.id));
  expect(prijzen).toHaveLength(1);
  expect(prijzen[0].grossPrice).toBe("210.00");
  // Eén archiefrij, niet twee: de gelijke waarde is een no-op in upsertPriceLines.
  expect(await db.select().from(pricesArchive)).toHaveLength(1);
  // Eén product B-9, geen duplicaat: (brand_id, supplier_article_code) is de identiteit.
  expect(
    (await db.select().from(products).where(eq(products.brandId, brandId))).length,
  ).toBe(2);
});

test("STALE-GUARD: wijzigt de catalogus tussen tonen en toepassen, dan slaan we het veld over", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      { rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000", color_1: "Black" } },
    ]),
  });

  // Een ander (import, tweede tab) zet kelvin op 3500 nadat het voorstel getoond werd.
  await db.update(products).set({ kelvin: 3500 }).where(eq(products.id, productId));

  const res = await applyTemplateProposal(
    db,
    uploadId,
    selectie({
      [fieldSelectionKey(4, "kelvin")]: "3000", // dít stond op het scherm
      [fieldSelectionKey(4, "color_1")]: null,
    }),
    null,
    "timo@brink",
  );
  expect(res).toMatchObject({ skippedStaleFields: 1, appliedFields: 1 });

  const a = (await productVan(db, brandId, "A-1"))!;
  expect(a.kelvin, "nooit blind overschrijven wat de gebruiker niet zag").toBe(3500);
  expect(a.color1, "de rest van het product gaat gewoon door").toBe("Black");

  const overgeslagen = (await db.select().from(events)).find(
    (e) => e.action === "template_field_skipped_stale",
  )!;
  expect(overgeslagen.entityId).toBe(productId);
  expect(overgeslagen.payload).toEqual({
    uploadId,
    fieldKey: "kelvin",
    prevSeen: "3000",
    actual: "3500",
  });
});

test("apply: aangevinkte prijs zonder actieve lijst en zonder datums → Error vóór elke catalogus-write", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedMerk(db);
  // Merk zonder ACTIEVE lijst (archiveren maakt de lijst replaced).
  await archivePriceList(db, priceListId);

  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      {
        rij: 4,
        velden: {
          supplier_article_code: "A-1",
          kelvin: "4000",
          list_price_excl_vat: "210.00",
        },
      },
    ]),
  });

  await expect(
    applyTemplateProposal(
      db,
      uploadId,
      selectie({
        [fieldSelectionKey(4, "kelvin")]: "3000",
        [priceSelectionKey(4)]: null,
      }),
      null,
    ),
  ).rejects.toThrow(/no active price list/);

  // Een ontbrekend formulierveld mag geen halve run achterlaten: kelvin is niet toegepast
  // en de upload staat nog op staging.
  expect((await productVan(db, brandId, "A-1"))!.kelvin).toBe(3000);
  const [upload] = await db.select().from(brandUploads).where(eq(brandUploads.id, uploadId));
  expect(upload.status).toBe("staging");
});

test("apply: prijs op een merk zonder actieve lijst mét datums → nieuwe lijst, product zichtbaar", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId } = await seedMerk(db);
  await archivePriceList(db, priceListId);

  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      { rij: 4, velden: { supplier_article_code: "A-1", list_price_excl_vat: "210.00" } },
    ]),
  });

  const res = await applyTemplateProposal(
    db,
    uploadId,
    selectie({ [priceSelectionKey(4)]: null }),
    { name: "Prijslijst 2027", validFrom: "2027-01-01", validUntil: "2027-12-31" },
    "timo@brink",
  );
  expect(res.alreadyProcessed === false && res.priceLines).toMatchObject({ inserted: 1 });
  const [prijs] = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(prijs.grossPrice).toBe("210.00");
  expect(await acties(db)).toContain("price_list_created");
});

test("ALREADY PROCESSED: tweede klik op goedkeuren doet niets (de status ís het slot)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([{ rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000" } }]),
  });
  const keuze = () => selectie({ [fieldSelectionKey(4, "kelvin")]: "3000" });

  await applyTemplateProposal(db, uploadId, keuze(), null, "timo@brink");
  const tweede = await applyTemplateProposal(db, uploadId, keuze(), null, "timo@brink");
  expect(tweede).toEqual({ alreadyProcessed: true });

  // Geen tweede spoor: de poort zit vóór de eerste schrijf, dus ook vóór het start-event.
  const gestart = (await acties(db)).filter((a) => a === "template_apply_started");
  expect(gestart).toHaveLength(1);
});

// ── Afwijzen ────────────────────────────────────────────────────────────────

test("reject: catalogus onveranderd, relatiestatus blijft data_ontvangen, wel een event", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      { rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000", cri: "" } },
    ]),
  });

  const res = await rejectTemplateProposal(
    db,
    uploadId,
    "timo@brink",
    "Kelvin klopt niet met de datasheet — opnieuw opvragen.",
  );
  expect(res).toEqual({ alreadyProcessed: false });

  const a = (await productVan(db, brandId, "A-1"))!;
  expect(a.kelvin).toBe(3000);
  expect(a.cri).toBe(90);

  const [upload] = await db.select().from(brandUploads).where(eq(brandUploads.id, uploadId));
  expect(upload.status).toBe("rejected");
  expect(upload.reviewNote).toContain("datasheet");
  expect(upload.reviewedBy).toBe("timo@brink");

  // Besluit 6: er ÍS geleverd, het is alleen niet bruikbaar. 'afgewezen' betekent "merk wil
  // niet meewerken" en mag alleen een mens via het relatieformulier zetten.
  expect(await relatieStatus(db, brandId)).toBe("data_ontvangen");
  const lijst = await acties(db);
  expect(lijst).toContain("template_upload_rejected");
  expect(lijst).not.toContain("product_fields_applied");
});

test("reject na goedkeuren → alreadyProcessed, de goedkeuring blijft staan", async () => {
  const db = await createTestDb();
  const { brandId } = await seedMerk(db);
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([{ rij: 4, velden: { supplier_article_code: "A-1", kelvin: "4000" } }]),
  });
  await applyTemplateProposal(
    db,
    uploadId,
    selectie({ [fieldSelectionKey(4, "kelvin")]: "3000" }),
    null,
    "timo@brink",
  );

  expect(await rejectTemplateProposal(db, uploadId, "ander@brink", "nee")).toEqual({
    alreadyProcessed: true,
  });
  const [upload] = await db.select().from(brandUploads).where(eq(brandUploads.id, uploadId));
  expect(upload.status).toBe("approved");
});
