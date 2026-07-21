// Het retour-pad (sprint 1.2): een ingevuld merk-template komt binnen, wacht als VOORSTEL op
// een mens, en landt pas in de catalogus als iemand het aanvinkt. Deze module is de motor:
// staging, het voeden van de diff-engine, toepassen en afwijzen. De diff zelf leeft in
// lib/template-diff.ts (puur), de schermen in components/data/template-*.tsx.
//
// STAGING OP brand_uploads MET kind:"template" (plan besluit 2). `kind` is text, geen enum →
// nul migraties. import_runs valt af: dossier_id is NOT NULL met FK naar project_dossiers en
// een merkupload heeft geen dossier. Payload = de validator-snapshot (TemplateReturnPayload),
// niet de diff: de diff wordt bij élke render én bij toepassen VERS herberekend tegen de
// actuele catalogus. Een opgeslagen diff toont verouderde "oud"-waarden en past bij goedkeuren
// iets toe wat de gebruiker niet zag; herberekening maakt het toepassen bovendien idempotent.
//
// GEEN db.transaction(), nergens. neon-http (productie) gooit daarop, PGlite (tests) niet —
// een transactie hier geeft groene tests en een kapotte app. De veiligheid komt uit de vorm:
// elke schrijfstap is een idempotente upsert op een natuurlijke sleutel, de volgorde is
// products → prices (een crash ertussen laat een product zónder prijs achter, en dat is via
// visible_products onzichtbaar — de veilige kant van ijzeren regel 3), en de statusflip komt
// als laatste zodat een afgebroken run herkenbaar op staging blijft. Zie plan besluit 5.
//
// GEEN replacePriceList. Een template is per constructie een DEELverzameling (40 van 500
// producten mag); replacePriceList zou de andere 460 prijsregels archiveren en die producten
// onzichtbaar maken. Prijzen lopen via upsertPriceLines (plan besluit 1).
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import {
  brandUploads,
  brands,
  priceLists,
  prices,
  products,
} from "@/db/schema";
import {
  diffTemplateRows,
  fieldSelectionKey,
  getoondeOudeWaarde,
  newProductSelectionKey,
  priceSelectionKey,
  PRIJS_VELD,
  SCHRIJF_MAPPING,
  waardeVoorKolom,
  type ApplySelection,
  type BestaandProduct,
  type FieldProposal,
  type PriceProposal,
  type ProductDiff,
  type SchrijfDoel,
  type TemplateProposal,
  type TemplateReturnPayload,
} from "@/lib/template-diff";
import { eigenVeldKey, type EigenVeldDef } from "@/lib/custom-fields";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { upsertBrandRelation } from "./brand-relations";
import { listEigenVelden } from "./custom-fields";
import { upsertPriceLines } from "./price-archive";

/** De keys (`custom:<uuid>`) die NU bestaan en actief zijn — het vierde argument van
 *  diffTemplateRows. Uit dezelfde bron als het voorstelscherm zijn labels haalt, zodat een
 *  veld dat het scherm toont per definitie ook opslagbaar is. */
function actieveKeys(eigen: readonly EigenVeldDef[]): Set<string> {
  return new Set(
    eigen.filter((d) => d.archivedAt === null).map((d) => eigenVeldKey(d)),
  );
}

/** `kind` op brand_uploads voor een retour-pad-upload. Sleutelt de guard op de route én het
 *  uitfilteren in lib/repo/admin.ts (die goedkeurknop past niets toe). */
export const TEMPLATE_UPLOAD_KIND = "template";

export type PriceListInput = {
  name: string;
  validFrom: string;
  validUntil: string;
};

// ── Staging ─────────────────────────────────────────────────────────────────

/**
 * Een gevalideerd bestand wordt een voorstel. Zet de relatiestatus op `data_ontvangen`
 * (plan besluit 6): het feit "dit merk heeft geleverd" is waar zodra het bestand door de
 * validatie kwam, ook al is het voorstel nog niet beoordeeld — voor de 1.3-outreach-werklijst
 * is dat precies het signaal "niet meer najagen om data, wel nog verwerken". Levert een al
 * verwerkt merk opnieuw, dan valt hij terug naar `data_ontvangen`: er ligt weer werk.
 *
 * "Voorstel getoond" loggen we hier en niet per render — app/data/brand-relations/actions.ts
 * legt expliciet vast dat we niet per page-render loggen (ruis).
 */
export async function stageTemplateReturn(
  db: AppDb,
  input: {
    brandId: string;
    payload: TemplateReturnPayload;
    actor?: string;
  },
): Promise<{ uploadId: string }> {
  const [row] = await db
    .insert(brandUploads)
    .values({
      brandId: input.brandId,
      kind: TEMPLATE_UPLOAD_KIND,
      payload: input.payload as unknown as Record<string, unknown>,
      status: "staging",
      submittedBy: input.actor ?? null,
    })
    .returning();

  await logEvent(db, {
    entity: "brand_upload",
    entityId: row.id,
    action: "template_upload_staged",
    actor: input.actor,
    payload: {
      brandId: input.brandId,
      filename: input.payload.filename,
      fileSize: input.payload.fileSize,
      rijen: input.payload.rijen.length,
      waarschuwingen: input.payload.waarschuwingen.length,
    },
  });

  await upsertBrandRelation(
    db,
    input.brandId,
    { status: "data_ontvangen" },
    input.actor,
  );

  return { uploadId: row.id };
}

// ── De catalogus-kant van de diff ───────────────────────────────────────────

/** Actieve lijst = replaced_at IS NULL; `price_lists_brand_active_uniq` garandeert er ≤1.
 *  Zelfde definitie als upsertPriceLines gebruikt — twee lezingen van "actief" zouden het
 *  scherm iets anders laten beloven dan de schrijver doet. */
export async function actievePrijslijst(db: AppDb, brandId: string) {
  const [actief] = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.brandId, brandId), isNull(priceLists.replacedAt)));
  return actief ?? null;
}

/**
 * De BestaandProduct-map die diffTemplateRows voedt: producten van DÍT merk, gesleuteld op
 * getrimde supplier_article_code. HOOFDLETTERGEVOELIG, consistent met products_brand_sac_uniq
 * en met codeVoorLookup() in de validator — een valse "bekend" schrijft stil in het verkeerde
 * product, en dat is precies de stille schade die dit pad moet voorkomen.
 *
 * `velden` is gesleuteld op products-KOLOM (de Drizzle-property), net als de waarden van
 * SCHRIJF_MAPPING: de diff-engine vergelijkt per kolom, niet per catalog-key.
 */
export async function loadBestaandeProducten(
  db: AppDb,
  brandId: string,
): Promise<Map<string, BestaandProduct>> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.brandId, brandId));

  const actief = await actievePrijslijst(db, brandId);
  const prijzen = new Map<string, string>();
  if (actief) {
    for (const p of await db
      .select()
      .from(prices)
      .where(eq(prices.priceListId, actief.id))) {
      prijzen.set(p.productId, p.grossPrice);
    }
  }

  const kolommen = [...new Set(Object.values(SCHRIJF_MAPPING))];
  const map = new Map<string, BestaandProduct>();
  for (const row of rows) {
    const code = (row.supplierArticleCode ?? "").trim();
    // Zonder leveranciers-artikelcode is een product op dit pad niet identificeerbaar; het
    // template kent geen andere sleutel. Zulke producten doen niet mee — nooit een gok.
    if (code === "") continue;
    const velden: Record<string, string | null> = {};
    for (const kolom of kolommen) {
      const v = (row as Record<string, unknown>)[kolom];
      velden[kolom] = v === null || v === undefined ? null : String(v);
    }
    // Eigen veldwaarden komen ONGEFILTERD mee, gesleuteld op definitie-uuid: welke sleutels
    // er nog toe doen bepaalt de diff-engine met `actieveEigenVelden`, niet deze lader.
    const eigenWaarden: Record<string, string | null> = {};
    for (const [id, waarde] of Object.entries(row.customValues ?? {})) {
      eigenWaarden[id] = waarde === null || waarde === undefined ? null : String(waarde);
    }
    map.set(code, {
      id: row.id,
      name: row.name,
      supplierArticleCode: code,
      velden,
      eigenWaarden,
      grossPrice: prijzen.get(row.id) ?? null,
    });
  }
  return map;
}

export type TemplateReturn = {
  upload: typeof brandUploads.$inferSelect;
  payload: TemplateReturnPayload;
  proposal: TemplateProposal;
  /** Bepaalt of het goedkeur-formulier naam + geldigheid moet uitvragen (plan besluit 1). */
  actievePrijslijst: {
    id: string;
    name: string;
    validFrom: string;
    validUntil: string;
  } | null;
  /** De eigen velden zoals ze NU zijn, inclusief gearchiveerde. Het voorstelscherm heeft ze
   *  nodig om een `custom:<uuid>`-key een leesbaar label te geven — anders staat er een uuid
   *  op het scherm, of erger: een leeg label (dat is vandaag al de zwakke plek van de
   *  key→label-lookup in template-proposal.tsx). Gearchiveerde velden zitten erbij omdat een
   *  oude snapshot ze nog kan bevatten; hun voorstellen zijn `not_storable`, maar ze moeten
   *  wél met naam getoond kunnen worden. */
  eigenVelden: EigenVeldDef[];
};

/**
 * Het voorstel zoals het scherm het toont: upload + VERS herberekende diff. `null` = onbekend
 * of geen template-upload; de route mag daar geen voorstel van maken.
 */
export async function getTemplateReturn(
  db: AppDb,
  uploadId: string,
): Promise<TemplateReturn | null> {
  const [upload] = await db
    .select()
    .from(brandUploads)
    .where(eq(brandUploads.id, uploadId));
  if (!upload || upload.kind !== TEMPLATE_UPLOAD_KIND) return null;

  const payload = upload.payload as unknown as TemplateReturnPayload;
  const bestaand = await loadBestaandeProducten(db, upload.brandId);
  const actief = await actievePrijslijst(db, upload.brandId);
  const eigenVelden = await listEigenVelden(db, { metGearchiveerd: true });

  return {
    upload,
    payload,
    eigenVelden,
    proposal: diffTemplateRows(
      payload.rijen,
      bestaand,
      payload.waarschuwingen,
      actieveKeys(eigenVelden),
    ),
    actievePrijslijst: actief
      ? {
          id: actief.id,
          name: actief.name,
          validFrom: actief.validFrom,
          validUntil: actief.validUntil,
        }
      : null,
  };
}

// ── Toepassen ───────────────────────────────────────────────────────────────

export type ApplyTemplateResult =
  /** Dubbelklik of tweede tab: de upload is al afgehandeld. Geen tweede schrijfronde. */
  | { alreadyProcessed: true }
  | {
      alreadyProcessed: false;
      createdProducts: number;
      updatedProducts: number;
      appliedFields: number;
      /** Velden die de catalogus tussentijds al anders had (stale-guard). */
      skippedStaleFields: number;
      priceLines: {
        priceListId: string;
        inserted: number;
        updated: number;
        archivedLines: number;
      } | null;
    };

/** Wat een aangevinkt voorstel écht schrijft. `next: null` = wissen (Conflict(a)).
 *  Alles wat hier `null` teruggeeft is niet toepasbaar en wordt overgeslagen. */
function toepasbaar(
  voorstel: FieldProposal,
): { doel: SchrijfDoel; next: string | null } | null {
  switch (voorstel.kind) {
    case "new":
    case "changed":
      return { doel: voorstel.doel, next: voorstel.next };
    case "conflict":
      // Alleen 'clear' is toepasbaar. unprocessable/not_storable/price_clear krijgen in het
      // scherm geen vinkje; komt zo'n sleutel tóch binnen, dan negeren we hem hier — het
      // formulier is geen autoriteit over wat opslagbaar is.
      return voorstel.reden.code === "clear"
        ? { doel: voorstel.reden.doel, next: null }
        : null;
    case "unchanged":
      // Niets te doen: de catalogus zegt al wat het merk stuurt. Bewust GEEN stale-melding —
      // dit is precies de tweede-keer-toepassen-situatie, en die is een no-op, geen conflict.
      return null;
  }
}

/**
 * De SQL-uitdrukking die products.custom_values bijwerkt: bestaande sleutels blijven staan,
 * `patch` wordt erin gemerged, `wissen` gaat eruit.
 *
 * ALLES BOUND PARAMETERS, geen sql.raw. De sleutels zijn uuid's die een gebruiker heeft laten
 * ontstaan; een gebruikersgekozen waarde die als SQL-tekst wordt samengesteld is een
 * injectie-poort, ook als hij "toch altijd een uuid is".
 *
 * `coalesce(…, '{}')` want de kolom is NULL bij elk product dat nog nooit een eigen waarde
 * had — en `NULL || '{…}'` is NULL, wat de hele patch stil zou laten verdampen.
 *
 * De haakjes zijn niet cosmetisch: `||` en `-` op jsonb hebben in Postgres dezelfde
 * precedentie en associëren links, dus zonder haakjes verandert de betekenis zodra er zowel
 * gezet als gewist wordt.
 */
function customValuesExpr(
  patch: Record<string, string>,
  wissen: readonly string[],
): SQL<unknown> {
  let expr: SQL<unknown> = sql`coalesce(${products.customValues}, '{}'::jsonb)`;
  if (Object.keys(patch).length > 0) {
    expr = sql`(${expr} || ${JSON.stringify(patch)}::jsonb)`;
  }
  for (const key of wissen) {
    expr = sql`(${expr} - ${key}::text)`;
  }
  return expr;
}

function prijsToepasbaar(voorstel: PriceProposal): string | null {
  return voorstel.kind === "new" || voorstel.kind === "changed"
    ? voorstel.next
    : null;
}

/**
 * Draagt de selectie de prijs van deze rij? Twee soorten rijen, twee vinkjes — en dat
 * verschil is de reden dat deze helper bestaat in plaats van twee losse checks.
 *
 * Bij een BESTAAND product heeft de prijs zijn eigen vinkje (priceSelectionKey): de
 * conflictregel geldt, een bestaande prijs wint tenzij aangevinkt.
 *
 * Bij een NIEUW product niet. Daar draagt het ene productvinkje de hele rij — het scherm
 * rendert de prijsrij read-only en stuurt priceSelectionKey dus nooit mee (zie
 * template-proposal.tsx). Vroeg een de prijs hier tóch om zijn eigen sleutel, dan viel de
 * prijs van elk nieuw product stil weg: product aangemaakt, geen prijsregel, en via
 * visible_products meteen onzichtbaar in álle zoekresultaten — ijzeren regel 3 afgevuurd
 * door een vinkje dat "creates the product with everything below" belooft.
 */
function prijsGevraagdVoor(
  row: ProductDiff,
  selection: ApplySelection,
): boolean {
  if (row.kind === "ambiguous_duplicate") return false;
  if (row.price === null || prijsToepasbaar(row.price) === null) return false;
  return row.kind === "new_product"
    ? row.blocked === null &&
        selection.newProducts.has(newProductSelectionKey(row.rij))
    : selection.fields.has(priceSelectionKey(row.rij));
}

/**
 * De negen stappen van plan besluit 5. Zie de kop van dit bestand voor waarom er geen
 * transactie omheen zit en waarom dat veilig is.
 */
export async function applyTemplateProposal(
  db: AppDb,
  uploadId: string,
  selection: ApplySelection,
  priceListInput: PriceListInput | null,
  actor?: string,
): Promise<ApplyTemplateResult> {
  // 1. Upload laden + dubbelklik-poort. Zelfde guard als confirmImportRun: de status ís het
  //    slot, want de statusflip is de laatste schrijfstap.
  const [upload] = await db
    .select()
    .from(brandUploads)
    .where(eq(brandUploads.id, uploadId));
  if (!upload || upload.kind !== TEMPLATE_UPLOAD_KIND) {
    throw new Error(`Brand upload ${uploadId} is not a template return`);
  }
  if (upload.status !== "staging") return { alreadyProcessed: true };

  const brandId = upload.brandId;
  const payload = upload.payload as unknown as TemplateReturnPayload;

  // 2. Het spoor begint vóór de eerste schrijf: klapt het halverwege, dan staat er een
  //    template_apply_started zónder …finished, plus de per-product-events tot het breekpunt.
  await logEvent(db, {
    entity: "brand_upload",
    entityId: uploadId,
    action: "template_apply_started",
    actor,
    payload: {
      brandId,
      filename: payload.filename,
      velden: selection.fields.size,
      nieuweProducten: selection.newProducts.size,
    },
  });

  // 3. VERS herberekenen — nooit een opgeslagen diff toepassen. Óók de eigen velden worden
  //    hier vers gelezen: is een veld tussen tonen en goedkeuren gearchiveerd, dan is zijn
  //    voorstel nu not_storable en wordt het niet weggeschreven.
  const bestaand = await loadBestaandeProducten(db, brandId);
  const eigenVelden = await listEigenVelden(db, { metGearchiveerd: true });
  const proposal = diffTemplateRows(
    payload.rijen,
    bestaand,
    payload.waarschuwingen,
    actieveKeys(eigenVelden),
  );

  let createdProducts = 0;
  let updatedProducts = 0;
  let appliedFields = 0;
  let skippedStaleFields = 0;
  const prijsregels: { productId: string; grossPrice: string }[] = [];

  // De stale-guard: wijkt de actuele DB-waarde af van wat er op het scherm stond, dan slaan
  // we het veld over. Nooit blind overschrijven wat de gebruiker niet zag.
  async function staleOfNiet(
    productId: string,
    fieldKey: string,
    getoond: string | null,
    prevSeen: string | null,
  ): Promise<boolean> {
    if (getoond === prevSeen) return false;
    skippedStaleFields++;
    await logEvent(db, {
      entity: "product",
      entityId: productId,
      action: "template_field_skipped_stale",
      actor,
      payload: { uploadId, fieldKey, prevSeen, actual: getoond },
    });
    return true;
  }

  // Vroege poort: aangevinkte prijzen zonder actieve lijst en zonder formulierdatums is een
  // voorspelbare invoerfout. upsertPriceLines gooit daarop (terecht), maar dat zou pas ná de
  // product-writes gebeuren — dan is de run half klaar door een ontbrekend formulierveld.
  // Afwijking van de letterlijke stapvolgorde, geen afwijking van de volgorde van de WRITES.
  const prijsGevraagd = proposal.rows.some((row) =>
    prijsGevraagdVoor(row, selection),
  );
  if (prijsGevraagd && !priceListInput) {
    const actief = await actievePrijslijst(db, brandId);
    if (!actief) {
      throw new Error(
        `Brand ${brandId} has no active price list; provide priceListInput (name, validFrom, validUntil)`,
      );
    }
  }

  // 4. Nieuwe producten eerst (products → prices; een crash ertussen laat een onzichtbaar
  //    product achter, niet een prijs zonder product). Gesorteerd op artikelcode: stabiele
  //    volgorde maakt een afgebroken run navertelbaar uit de events.
  const brandName = await merkNaam(db, brandId);
  const nieuwe = proposal.rows
    .filter(
      (row) =>
        row.kind === "new_product" &&
        row.blocked === null &&
        selection.newProducts.has(newProductSelectionKey(row.rij)),
    )
    .sort((a, b) =>
      a.kind === "ambiguous_duplicate" || b.kind === "ambiguous_duplicate"
        ? 0
        : a.articleCode.localeCompare(b.articleCode),
    );

  for (const row of nieuwe) {
    if (row.kind !== "new_product") continue;
    const waarden: Record<string, unknown> = {};
    const eigenNieuw: Record<string, string> = {};
    let naam: string | null = null;
    for (const f of row.fields) {
      // Bij een nieuw product hangt álles aan het ene productvinkje (zie template-proposal.tsx):
      // per-veld-vinkjes zouden suggereren dat je een half product kunt aanmaken. Er is ook
      // niets om te beschermen — het product bestaat nog niet.
      if (f.kind !== "new") continue;
      if (f.doel.kind === "custom") {
        // Nieuw product: de eigen velden gaan gewoon mee in de INSERT. Geen aparte
        // vervolg-update — die zou het product tussentijds zonder zijn eigen waarden laten
        // bestaan en updated_at twee keer verzetten.
        eigenNieuw[f.doel.fieldId] = f.next;
        continue;
      }
      if (f.doel.kind !== "kolom") continue; // 'prijs' loopt via het prijzenpad
      waarden[f.doel.kolom] = waardeVoorKolom(f.doel.kolom, f.next);
      // name_en vult óók products.name: die is NOT NULL en er is geen bestaande naam om te
      // beschermen. Bij een BESTAAND product landt name_en uitsluitend op nameEn.
      if (f.fieldKey === "name_en") naam = f.next;
    }
    // blocked === null garandeert dit; de check staat er zodat een contractwijziging in de
    // diff-engine hier hard faalt in plaats van een NOT NULL-violation op te leveren.
    if (naam === null) continue;

    const [ingevoegd] = await db
      .insert(products)
      .values({
        id: crypto.randomUUID(),
        name: naam,
        brandId,
        brandName,
        supplierArticleCode: row.articleCode,
        ...waarden,
        customValues:
          Object.keys(eigenNieuw).length > 0 ? eigenNieuw : null,
      })
      // Een eerdere halve run kan hem al hebben aangemaakt: DO NOTHING, daarna id ophalen.
      .onConflictDoNothing({
        target: [products.brandId, products.supplierArticleCode],
      })
      .returning({ id: products.id });

    let productId = ingevoegd?.id ?? null;
    if (productId) {
      createdProducts++;
      await logEvent(db, {
        entity: "product",
        entityId: productId,
        action: "product_created_from_template",
        actor,
        payload: {
          uploadId,
          brandId,
          supplierArticleCode: row.articleCode,
          fields: Object.keys(waarden).length + Object.keys(eigenNieuw).length,
        },
      });
    } else {
      const [bestaandeRij] = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.brandId, brandId),
            eq(products.supplierArticleCode, row.articleCode),
          ),
        );
      productId = bestaandeRij?.id ?? null;
    }
    if (!productId) continue;

    // Geen eigen prijsvinkje: het productvinkje hierboven draagt de prijs mee. Zonder dit
    // wordt het product zichtbaar aangemaakt maar onzichtbaar gemaakt (geen prijsregel →
    // buiten visible_products).
    if (row.price && prijsGevraagdVoor(row, selection)) {
      const next = prijsToepasbaar(row.price);
      if (next !== null) prijsregels.push({ productId, grossPrice: next });
    }
  }

  // 5. Bestaande producten: ÉÉN update per product met alle goedgekeurde velden tegelijk.
  //    Granulariteit van gedeeltelijk falen = één product; een half-bijgewerkte reeks is
  //    "sommige producten al klaar", geen inconsistente rij.
  for (const row of proposal.rows) {
    if (row.kind !== "known") continue;
    const set: Record<string, unknown> = {};
    // Eigen velden: één patch-object om te zetten en één lijst sleutels om te wissen. Ze
    // landen samen met de kolommen in ÉÉN update per product — zie stap 5 hierboven: de
    // granulariteit van gedeeltelijk falen blijft daarmee "één product".
    const eigenPatch: Record<string, string> = {};
    const eigenWissen: string[] = [];
    const fieldsLog: Record<string, { old: string | null; new: string | null }> =
      {};

    for (const f of row.fields) {
      const key = fieldSelectionKey(row.rij, f.fieldKey);
      if (!selection.fields.has(key)) continue;
      const toe = toepasbaar(f);
      if (!toe) continue;
      const getoond = getoondeOudeWaarde(f);
      if (
        await staleOfNiet(
          row.productId,
          f.fieldKey,
          getoond,
          selection.fields.get(key) ?? null,
        )
      ) {
        continue;
      }
      if (toe.doel.kind === "custom") {
        if (toe.next === null) eigenWissen.push(toe.doel.fieldId);
        else eigenPatch[toe.doel.fieldId] = toe.next;
      } else if (toe.doel.kind === "kolom") {
        set[toe.doel.kolom] = waardeVoorKolom(toe.doel.kolom, toe.next);
      } else {
        continue; // 'prijs' loopt via het prijzenpad, nooit als products-kolom
      }
      fieldsLog[f.fieldKey] = { old: getoond, new: toe.next };
    }

    const eigenAantal = Object.keys(eigenPatch).length + eigenWissen.length;
    if (Object.keys(set).length > 0 || eigenAantal > 0) {
      await db
        .update(products)
        .set({
          ...set,
          ...(eigenAantal > 0
            ? { customValues: customValuesExpr(eigenPatch, eigenWissen) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, row.productId));
      updatedProducts++;
      appliedFields += Object.keys(set).length + eigenAantal;
      // Het per-veld-spoor van ijzeren regel 5, zonder duizenden events: één event per
      // product met alle {old, new} erin.
      await logEvent(db, {
        entity: "product",
        entityId: row.productId,
        action: "product_fields_applied",
        actor,
        payload: { uploadId, fields: fieldsLog },
      });
    }

    const prijsKey = priceSelectionKey(row.rij);
    if (row.price && selection.fields.has(prijsKey)) {
      const next = prijsToepasbaar(row.price);
      if (next !== null) {
        const getoond = getoondeOudeWaarde(row.price);
        const stale = await staleOfNiet(
          row.productId,
          PRIJS_VELD,
          getoond,
          selection.fields.get(prijsKey) ?? null,
        );
        if (!stale) prijsregels.push({ productId: row.productId, grossPrice: next });
      }
    }
  }

  // 6. Prijzen. Alleen aanroepen als er écht regels zijn: anders zou een voorstel zónder
  //    prijzen alsnog een prijslijst kunnen aanmaken (of gooien).
  const priceLinesResult =
    prijsregels.length > 0
      ? await upsertPriceLines(db, brandId, prijsregels, {
          newList: priceListInput ?? undefined,
          actor,
        })
      : null;

  // 7. Relatiestatus → verwerkt (logt zichzelf: brand_relation_status_changed {from, to}).
  await upsertBrandRelation(db, brandId, { status: "verwerkt" }, actor);

  // 8. De statusflip als ALLERLAATSTE catalogus-onafhankelijke stap: pas hier verdwijnt het
  //    voorstel-scherm. Klapt het eerder, dan staat de upload nog op staging en toont een
  //    herlading het voorstel opnieuw — met minder voorstellen, want het toegepaste deel is
  //    nu unchanged. Opnieuw goedkeuren maakt het af.
  await db
    .update(brandUploads)
    .set({
      status: "approved",
      reviewedBy: actor ?? null,
      updatedAt: new Date(),
    })
    .where(eq(brandUploads.id, uploadId));

  // 9. Eindtellingen.
  await logEvent(db, {
    entity: "brand_upload",
    entityId: uploadId,
    action: "template_apply_finished",
    actor,
    payload: {
      brandId,
      createdProducts,
      updatedProducts,
      appliedFields,
      skippedStaleFields,
      priceLines: priceLinesResult
        ? {
            inserted: priceLinesResult.inserted,
            updated: priceLinesResult.updated,
            archivedLines: priceLinesResult.archivedLines,
          }
        : null,
    },
  });

  return {
    alreadyProcessed: false,
    createdProducts,
    updatedProducts,
    appliedFields,
    skippedStaleFields,
    priceLines: priceLinesResult,
  };
}

// ── Afwijzen ────────────────────────────────────────────────────────────────

/**
 * Afwijzen raakt de catalogus NIET en de relatiestatus evenmin (plan besluit 6): er ís
 * geleverd, het is alleen niet bruikbaar — de status blijft `data_ontvangen`. `afgewezen`
 * betekent "merk wil niet meewerken" en mag alleen een mens via het relatieformulier zetten.
 */
export async function rejectTemplateProposal(
  db: AppDb,
  uploadId: string,
  reviewedBy: string,
  note: string,
): Promise<{ alreadyProcessed: boolean }> {
  const [upload] = await db
    .select()
    .from(brandUploads)
    .where(eq(brandUploads.id, uploadId));
  if (!upload || upload.kind !== TEMPLATE_UPLOAD_KIND) {
    throw new Error(`Brand upload ${uploadId} is not a template return`);
  }
  if (upload.status !== "staging") return { alreadyProcessed: true };

  await db
    .update(brandUploads)
    .set({
      status: "rejected",
      reviewedBy,
      reviewNote: note,
      updatedAt: new Date(),
    })
    .where(eq(brandUploads.id, uploadId));

  await logEvent(db, {
    entity: "brand_upload",
    entityId: uploadId,
    action: "template_upload_rejected",
    actor: reviewedBy,
    payload: { brandId: upload.brandId, note },
  });

  return { alreadyProcessed: false };
}

// ── Klein grut ──────────────────────────────────────────────────────────────

async function merkNaam(db: AppDb, brandId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, brandId));
  return row?.name ?? null;
}
