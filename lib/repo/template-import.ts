// Directe import van een ingevuld merk-template (docs/goal-template-upload-direct-import.md).
//
// VERVANG-SEMANTIEK, de bewuste breuk met het voorstel-scherm van sprint 1.2: een nieuw
// bestand wordt alleen geüpload als het vorige niet meer klopt, dus het bestand is integraal
// leidend — nieuwe waarden, gewijzigde waarden én leeggemaakte velden winnen allemaal.
// Producten die in het bestand ONTBREKEN krijgen geen prijsregel op de nieuwe lijst en
// verdwijnen daarmee uit álle zoekresultaten (visible_products, ijzeren regel 3) — geen
// spookproducten, geen product-delete: hun data en events blijven bestaan.
// Dit geldt ALLEEN voor het interne pad (Brink uploadt zelf). Het staging/voorstel-pad in
// lib/repo/template-return.ts blijft staan voor 4.B (merkportaal) — daar is een
// beoordelingsstap opnieuw te bezien, want een merk is geen Brink-medewerker.
//
// DE OUDE PRIJSLIJST GAAT AUTOMATISCH OP ARCHIEF via replacePriceList — de
// archiveerfuncties bestonden al (lib/repo/price-archive.ts) maar waren nooit op een
// import-pad aangesloten; dit is de aansluiting. Het oude gegevensbeeld blijft daarmee
// terugvindbaar: prijzen in archive.prices_archive, velden per product in de
// product_fields_applied-events (old/new).
//
// GEEN db.transaction() (neon-http gooit; PGlite niet — groene tests, kapotte app). De
// veiligheid komt uit de vorm en de volgorde: products → prijslijst-wissel → prijsregels.
// Klapt het vóór de wissel, dan staat de oude lijst er nog en is het merk gewoon zichtbaar
// met deels bijgewerkte velden — opnieuw uploaden maakt het af (velden zijn dan unchanged).
// Klapt het ná de wissel, dan zijn (sommige) producten tijdelijk onzichtbaar — de VEILIGE
// kant van regel 3, en opnieuw uploaden herstelt het.
//
// BATCHES, geen per-rij-roundtrips: dit pad moet een catalogus van ~19.000 rijen in
// seconden verwerken (docs/probleem-template-upload-grote-bestanden.md). Inserts (producten,
// prijsregels, events) gaan in chunks; alleen veld-UPDATEs op bestaande producten zijn
// per product (elke rij wijzigt andere kolommen) en lopen in kleine parallelle groepen.
import { and, eq, inArray } from "drizzle-orm";
import { brands, events, prices, products } from "@/db/schema";
import {
  diffTemplateRows,
  waardeVoorKolom,
  type FieldProposal,
  type PriceProposal,
} from "@/lib/template-diff";
import { eigenVeldKey, type EigenVeldDef } from "@/lib/custom-fields";
import type { GelezenRij, RijWaarschuwing } from "@/lib/excel-validate";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { upsertBrandRelation } from "./brand-relations";
import { listEigenVelden } from "./custom-fields";
import { replacePriceList } from "./price-archive";
import { customValuesExpr, loadBestaandeProducten } from "./template-return";

/** Zoveel rijen per multi-row INSERT. Ruim onder Postgres' parameterlimiet (65.535):
 *  een productrij draagt ~65 kolommen, dus 500 × 65 ≈ 32.500 parameters. */
const INSERT_CHUNK = 500;
/** Zoveel per-product-UPDATEs tegelijk in de lucht. Neon verdraagt parallelle
 *  http-requests prima; onbegrensd parallelliseren zou er duizenden tegelijk openen. */
const UPDATE_CONCURRENCY = 20;

export type TemplateImportInput = {
  brandId: string;
  /** Uit de 1.1-validator (lib/excel-validate.ts, ongewijzigd de poort). */
  rijen: GelezenRij[];
  waarschuwingen: RijWaarschuwing[];
  filename: string;
  fileSize: number;
  /** De nieuwe prijslijst — alle drie verplicht uitgevraagd bij de upload (een lijst
   *  zonder einddatum voedt ijzeren regel 3 niet). */
  newList: { name: string; validFrom: string; validUntil: string };
  actor?: string;
};

export type TemplateImportResult = {
  createdProducts: number;
  updatedProducts: number;
  /** Gezette velden (new + changed), exclusief wissingen. */
  appliedFields: number;
  /** Leeggemaakte velden — het bestand wint, ook bij een lege cel. */
  clearedFields: number;
  /** Onverwerkbaar of niet-opslagbaar: geteld en gelogd, nooit stil weggegooid. */
  skippedFields: number;
  /** Rijen die geen product konden worden: dubbele artikelcode, ontbrekende code of naam. */
  skippedRows: number;
  /** Bestaande producten zonder rij in het bestand: geen prijsregel op de nieuwe lijst,
   *  dus onzichtbaar in álle zoekresultaten. Data en events blijven bestaan. */
  goneProducts: number;
  priceList: {
    priceListId: string;
    /** Prijsregels op de nieuwe lijst. */
    priceLines: number;
    /** Regels van de OUDE lijst die naar archive.prices_archive verhuisden. */
    archivedLines: number;
  };
};

/** Voorspelbare weigering vóór de eerste schrijf — de action vertaalt hem naar een
 *  melding op het scherm in plaats van een 500. */
export class TemplateImportError extends Error {
  readonly code: "no_prices";
  constructor(code: "no_prices", message: string) {
    super(message);
    this.name = "TemplateImportError";
    this.code = code;
  }
}

/** logEvent, maar dan honderden tegelijk: één multi-row INSERT per chunk in plaats van
 *  één roundtrip per event. Zelfde defaults als logEvent (actor "system", payload null). */
async function logEventsBatch(
  db: AppDb,
  rows: {
    entity: string;
    entityId: string | null;
    action: string;
    actor?: string;
    payload?: Record<string, unknown>;
  }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(events).values(
      rows.slice(i, i + INSERT_CHUNK).map((e) => ({
        entity: e.entity,
        entityId: e.entityId,
        action: e.action,
        actor: e.actor ?? "system",
        payload: e.payload ?? null,
      })),
    );
  }
}

/**
 * De prijs die deze rij op de NIEUWE lijst zet, of null als er geen komt. Anders dan op
 * het voorstel-pad telt "unchanged" hier wél: de nieuwe lijst begint leeg, dus élke rij
 * met een verwerkbare prijs moet een regel opleveren — ook als het bedrag gelijk bleef.
 * Lege of onverwerkbare prijscel → geen regel → product onzichtbaar (het bestand wint).
 */
function prijsVoorNieuweLijst(price: PriceProposal | null): string | null {
  if (!price) return null;
  switch (price.kind) {
    case "new":
    case "changed":
      return price.next;
    case "unchanged":
      return price.waarde === "" ? null : price.waarde;
    case "conflict":
      return null;
  }
}

/**
 * Voert de import in één keer uit: validator-uitvoer erin, catalogus bijgewerkt eruit.
 * De diff-engine (lib/template-diff.ts) blijft de bron van normalisatie en schrijfdoelen;
 * alleen het BELEID verschilt van applyTemplateProposal: geen selectie, geen stale-guard —
 * alles wat verwerkbaar is wordt toegepast, want het bestand is integraal leidend.
 */
export async function importTemplateDirect(
  db: AppDb,
  input: TemplateImportInput,
): Promise<TemplateImportResult> {
  const { brandId, actor } = input;

  const bestaand = await loadBestaandeProducten(db, brandId);
  const eigenVelden = await listEigenVelden(db, { metGearchiveerd: true });
  const actieveKeys = new Set(
    eigenVelden
      .filter((d: EigenVeldDef) => d.archivedAt === null)
      .map((d: EigenVeldDef) => eigenVeldKey(d)),
  );
  const proposal = diffTemplateRows(
    input.rijen,
    bestaand,
    input.waarschuwingen,
    actieveKeys,
  );

  // Poort vóór de eerste schrijf: een bestand zonder één enkele verwerkbare prijs zou na
  // de lijst-wissel het HELE merk onzichtbaar maken. Dat is vrijwel zeker een vergissing
  // (prijskolom vergeten), geen vervanging — weigeren, niets schrijven.
  const heeftPrijs = proposal.rows.some(
    (row) =>
      row.kind !== "ambiguous_duplicate" &&
      prijsVoorNieuweLijst(row.price) !== null,
  );
  if (!heeftPrijs) {
    throw new TemplateImportError(
      "no_prices",
      `Template for brand ${brandId} contains no usable prices; replacing the price list would hide every product`,
    );
  }

  // Het spoor begint vóór de eerste schrijf (zelfde principe als template_apply_started):
  // een run zonder …finished vertelt precies dat en hoe ver hij kwam.
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "template_import_started",
    actor,
    payload: {
      filename: input.filename,
      fileSize: input.fileSize,
      rijen: input.rijen.length,
      newList: input.newList,
    },
  });

  let createdProducts = 0;
  let updatedProducts = 0;
  let appliedFields = 0;
  let clearedFields = 0;
  let skippedFields = 0;
  let skippedRows = 0;
  const prijsregels: { productId: string; grossPrice: string }[] = [];
  const skippedFieldsLog: {
    articleCode: string;
    fieldKey: string;
    reden: string;
  }[] = [];

  // ── Nieuwe producten: batch-INSERT in chunks ──────────────────────────────
  const [merk] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, brandId));
  const brandName = merk?.name ?? null;

  type NieuwProduct = {
    id: string;
    articleCode: string;
    waarden: Record<string, unknown>;
    eigen: Record<string, string>;
    naam: string;
    prijs: string | null;
    veldAantal: number;
  };
  const nieuwe: NieuwProduct[] = [];

  for (const row of proposal.rows) {
    if (row.kind === "ambiguous_duplicate") {
      skippedRows += row.rijen.length;
      continue;
    }
    if (row.kind !== "new_product") continue;
    if (row.blocked !== null) {
      skippedRows++;
      continue;
    }
    const waarden: Record<string, unknown> = {};
    const eigen: Record<string, string> = {};
    let naam: string | null = null;
    for (const f of row.fields) {
      if (f.kind === "conflict") {
        // Bij een nieuw product bestaat alleen not_storable/unprocessable (er valt niets
        // te wissen). Geteld en gelogd — nooit stil weggegooid.
        skippedFields++;
        skippedFieldsLog.push({
          articleCode: row.articleCode,
          fieldKey: f.fieldKey,
          reden: f.reden.code,
        });
        continue;
      }
      if (f.kind !== "new") continue;
      if (f.doel.kind === "custom") {
        eigen[f.doel.fieldId] = f.next;
        continue;
      }
      if (f.doel.kind !== "kolom") continue; // prijs loopt via het prijzenpad
      waarden[f.doel.kolom] = waardeVoorKolom(f.doel.kolom, f.next);
      // name_en vult óók products.name: NOT NULL, en er is geen bestaande naam om te
      // beschermen — zelfde regel als op het voorstel-pad.
      if (f.fieldKey === "name_en") naam = f.next;
    }
    if (naam === null) continue; // blocked === null garandeert dit; vangnet tegen contractdrift
    nieuwe.push({
      id: crypto.randomUUID(),
      articleCode: row.articleCode,
      waarden,
      eigen,
      naam,
      prijs: prijsVoorNieuweLijst(row.price),
      veldAantal: Object.keys(waarden).length + Object.keys(eigen).length,
    });
  }

  nieuwe.sort((a, b) => a.articleCode.localeCompare(b.articleCode));
  const aangemaakt = new Map<string, string>(); // articleCode → productId
  for (let i = 0; i < nieuwe.length; i += INSERT_CHUNK) {
    const chunk = nieuwe.slice(i, i + INSERT_CHUNK);
    const ingevoegd = await db
      .insert(products)
      .values(
        chunk.map((n) => ({
          id: n.id,
          name: n.naam,
          brandId,
          brandName,
          supplierArticleCode: n.articleCode,
          ...n.waarden,
          customValues: Object.keys(n.eigen).length > 0 ? n.eigen : null,
        })),
      )
      // Een eerdere halve run kan een product al hebben aangemaakt: DO NOTHING en de
      // bestaande id straks ophalen — nooit een tweede rij met dezelfde code.
      .onConflictDoNothing({
        target: [products.brandId, products.supplierArticleCode],
      })
      .returning({ id: products.id, supplierArticleCode: products.supplierArticleCode });
    for (const rij of ingevoegd) {
      if (rij.supplierArticleCode) aangemaakt.set(rij.supplierArticleCode, rij.id);
    }
  }
  createdProducts = aangemaakt.size;

  // Codes die niet ingevoegd werden (conflict → bestond al): id ophalen voor de prijsregel.
  const conflictCodes = nieuwe
    .map((n) => n.articleCode)
    .filter((code) => !aangemaakt.has(code));
  if (conflictCodes.length > 0) {
    for (let i = 0; i < conflictCodes.length; i += INSERT_CHUNK) {
      const rows = await db
        .select({ id: products.id, supplierArticleCode: products.supplierArticleCode })
        .from(products)
        .where(
          and(
            eq(products.brandId, brandId),
            inArray(products.supplierArticleCode, conflictCodes.slice(i, i + INSERT_CHUNK)),
          ),
        );
      for (const rij of rows) {
        if (rij.supplierArticleCode) aangemaakt.set(rij.supplierArticleCode, rij.id);
      }
    }
  }

  const nieuwEvents: Parameters<typeof logEventsBatch>[1] = [];
  for (const n of nieuwe) {
    const productId = aangemaakt.get(n.articleCode);
    if (!productId) continue;
    if (n.prijs !== null) prijsregels.push({ productId, grossPrice: n.prijs });
    nieuwEvents.push({
      entity: "product",
      entityId: productId,
      action: "product_created_from_template",
      actor,
      payload: {
        brandId,
        supplierArticleCode: n.articleCode,
        fields: n.veldAantal,
        filename: input.filename,
      },
    });
  }
  await logEventsBatch(db, nieuwEvents);

  // ── Bestaande producten: alles toepassen, incl. wissen ────────────────────
  type ProductUpdate = {
    productId: string;
    set: Record<string, unknown>;
    eigenPatch: Record<string, string>;
    eigenWissen: string[];
    fieldsLog: Record<string, { old: string | null; new: string | null }>;
    velden: number;
    gewist: number;
  };
  const updates: ProductUpdate[] = [];
  const bekendeCodes = new Set<string>();

  for (const row of proposal.rows) {
    if (row.kind !== "known") continue;
    bekendeCodes.add(row.articleCode);
    const set: Record<string, unknown> = {};
    const eigenPatch: Record<string, string> = {};
    const eigenWissen: string[] = [];
    const fieldsLog: Record<string, { old: string | null; new: string | null }> = {};
    let gewist = 0;

    const pasToe = (
      f: FieldProposal,
      doelWaarde: { next: string | null; old: string | null },
    ) => {
      const doel =
        f.kind === "conflict"
          ? f.reden.code === "clear"
            ? f.reden.doel
            : null
          : f.kind === "unchanged"
            ? null
            : f.doel;
      if (!doel) return;
      if (doel.kind === "custom") {
        if (doelWaarde.next === null) eigenWissen.push(doel.fieldId);
        else eigenPatch[doel.fieldId] = doelWaarde.next;
      } else if (doel.kind === "kolom") {
        set[doel.kolom] = waardeVoorKolom(doel.kolom, doelWaarde.next);
      } else {
        return; // prijs loopt via het prijzenpad
      }
      fieldsLog[f.fieldKey] = { old: doelWaarde.old, new: doelWaarde.next };
      if (doelWaarde.next === null) gewist++;
    };

    for (const f of row.fields) {
      switch (f.kind) {
        case "new":
          pasToe(f, { next: f.next, old: null });
          break;
        case "changed":
          pasToe(f, { next: f.next, old: f.prev });
          break;
        case "conflict":
          if (f.reden.code === "clear") {
            // Vervang-semantiek: een lege cel ís de opdracht om te wissen.
            pasToe(f, { next: null, old: f.reden.prev });
          } else {
            skippedFields++;
            skippedFieldsLog.push({
              articleCode: row.articleCode,
              fieldKey: f.fieldKey,
              reden: f.reden.code,
            });
          }
          break;
        case "unchanged":
          break;
      }
    }

    const prijs = prijsVoorNieuweLijst(row.price);
    if (prijs !== null) prijsregels.push({ productId: row.productId, grossPrice: prijs });
    if (row.price?.kind === "conflict" && row.price.reden.code === "unprocessable") {
      skippedFields++;
      skippedFieldsLog.push({
        articleCode: row.articleCode,
        fieldKey: "list_price_excl_vat",
        reden: "unprocessable",
      });
    }

    const eigenAantal = Object.keys(eigenPatch).length + eigenWissen.length;
    const veldAantal = Object.keys(set).length + eigenAantal;
    if (veldAantal > 0) {
      updates.push({
        productId: row.productId,
        set,
        eigenPatch,
        eigenWissen,
        fieldsLog,
        velden: veldAantal,
        gewist,
      });
    }
  }

  // Per product één UPDATE (elke rij raakt andere kolommen), in kleine parallelle groepen.
  const updateEvents: Parameters<typeof logEventsBatch>[1] = [];
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    await Promise.all(
      updates.slice(i, i + UPDATE_CONCURRENCY).map(async (u) => {
        const eigenAantal =
          Object.keys(u.eigenPatch).length + u.eigenWissen.length;
        await db
          .update(products)
          .set({
            ...u.set,
            ...(eigenAantal > 0
              ? { customValues: customValuesExpr(u.eigenPatch, u.eigenWissen) }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(products.id, u.productId));
      }),
    );
  }
  for (const u of updates) {
    updatedProducts++;
    appliedFields += u.velden - u.gewist;
    clearedFields += u.gewist;
    // Het per-veld-spoor van ijzeren regel 5, zoals het al bestond: één event per product
    // met alle {old, new} erin — óók de wissingen (new: null).
    updateEvents.push({
      entity: "product",
      entityId: u.productId,
      action: "product_fields_applied",
      actor,
      payload: { fields: u.fieldsLog, filename: input.filename },
    });
  }
  await logEventsBatch(db, updateEvents);

  // Nieuwe producten tellen hun velden ook als toegepast.
  for (const n of nieuwe) {
    if (aangemaakt.has(n.articleCode)) appliedFields += n.veldAantal;
  }

  // ── Prijslijst-wissel: oud op archief, nieuw actief, regels in bulk ───────
  // replacePriceList archiveert de actieve lijst (prijsregels → archive.prices_archive,
  // event price_list_archived) en maakt de nieuwe aan (event price_list_created) — de
  // bestaande archiveerfuncties, nu eindelijk aangesloten op het import-pad.
  const { priceListId, archivedCount } = await replacePriceList(
    db,
    brandId,
    input.newList,
    actor,
  );
  for (let i = 0; i < prijsregels.length; i += INSERT_CHUNK) {
    await db.insert(prices).values(
      prijsregels.slice(i, i + INSERT_CHUNK).map((p) => ({
        productId: p.productId,
        priceListId,
        grossPrice: p.grossPrice,
      })),
    );
  }
  await logEvent(db, {
    entity: "price_list",
    entityId: priceListId,
    action: "price_lines_upserted",
    actor,
    payload: {
      brandId,
      inserted: prijsregels.length,
      updated: 0,
      archivedLines: archivedCount,
      unchanged: 0,
    },
  });

  // Verdwenen: bestond in de catalogus, maar het bestand noemt hem niet meer → geen
  // prijsregel op de nieuwe lijst → onzichtbaar in álle zoekresultaten (regel 3, centraal
  // afgedwongen via visible_products). Geen delete: data en events blijven terugvindbaar.
  const goneProducts = [...bestaand.keys()].filter(
    (code) => !bekendeCodes.has(code),
  ).length;

  // ── Relatiestatus + het ene samenvattende event ───────────────────────────
  await upsertBrandRelation(db, brandId, { status: "verwerkt" }, actor);

  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "template_import_finished",
    actor,
    payload: {
      filename: input.filename,
      createdProducts,
      updatedProducts,
      appliedFields,
      clearedFields,
      skippedFields,
      skippedRows,
      goneProducts,
      priceListId,
      priceLines: prijsregels.length,
      archivedLines: archivedCount,
      // De eerste ~50 overgeslagen velden met reden — genoeg om het patroon te zien
      // zonder een megabyte-payload bij een structureel kapotte kolom.
      skippedFieldsSample: skippedFieldsLog.slice(0, 50),
    },
  });

  return {
    createdProducts,
    updatedProducts,
    appliedFields,
    clearedFields,
    skippedFields,
    skippedRows,
    goneProducts,
    priceList: {
      priceListId,
      priceLines: prijsregels.length,
      archivedLines: archivedCount,
    },
  };
}
