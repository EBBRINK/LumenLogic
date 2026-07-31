// C8 (reviewzwerm 2.5a): DE NAAD, gemeten aan de ECHTE server-action.
//
// Waarom dit bestand bestaat. apply-summary.test.tsx dekt de encoder, de parser en het
// component — maar zijn helper `doorDeRedirect()` bouwt de samenvatting met de hand en
// draait de action nooit. Gemeten faalscenario: zet de redirect in upload-actions.ts terug
// op het oude `redirect(\`/data/brand-relations/${brandId}\`)` — precies bevinding C8 opnieuw
// — en de hele app-suite blijft groen. De keten was dus overal gedekt behalve op de plek
// waar hij ooit brak.
//
// Wat hier gemeten wordt is één ding: de uitkomst van applyTemplateProposal REIST MEE met
// de redirect. De assertie legt de querystring naast het `template_apply_finished`-event —
// het onafhankelijke, al bestaande spoor van diezelfde tellingen. Handgeschreven getallen
// zouden de naad opnieuw wegtesten.
//
// ⚠️ Een action die redirect() aanroept REJECT zijn promise met NEXT_REDIRECT; dat is Next'
// navigatiesignaal, geen fout (zie lib/next-action-result.ts). We vangen hem daarom expliciet
// en lezen de href uit de digest met dezelfde functie die de client-kant gebruikt.
import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { events } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { redirectHrefOf } from "@/lib/next-action-result";
import { readApplySummary } from "./apply-summary";
import {
  fieldSelectionKey,
  newProductSelectionKey,
  priceSelectionKey,
  type TemplateReturnPayload,
} from "@/lib/template-diff";
import { stageTemplateReturn } from "@/lib/repo/template-return";

const ACTOR = "timo@brink.nl";

const harnas = vi.hoisted(() => ({ db: null as unknown }));

// db/client.ts praat met Neon en gooit al bij import zonder DATABASE_URL; hier komt de
// PGlite-testdatabase ervoor in de plaats. De proxy bindt methodes aan de échte
// drizzle-instantie, anders verliezen ze hun `this`. (Zelfde harnas als
// app/projects/projects-gate.test.ts en app/settings/settings-actions.test.ts.)
vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        return typeof waarde === "function" ? waarde.bind(echt) : waarde;
      },
    },
  ),
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { email: ACTOR } }),
  requireSession: async () => ({ user: { email: ACTOR } }),
  getActor: async () => ACTOR,
}));

// revalidatePath heeft buiten een request-scope geen store; de action roept hem wel aan.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { approveTemplateProposalAction } = await import("./upload-actions");

// Draait de action en geeft de redirect-URL terug. Loopt hij door zónder redirect, dan
// faalt dit met een leesbare reden in plaats van pas bij de assertie eronder.
async function redirectVan(run: () => Promise<unknown>): Promise<URL> {
  try {
    await run();
  } catch (e) {
    const href = redirectHrefOf(e);
    if (href) return new URL(href, "https://lumenlogic.invalid");
    throw e;
  }
  throw new Error("de action liep door zonder redirect");
}

function payloadVan(rijen: TemplateReturnPayload["rijen"]): TemplateReturnPayload {
  return {
    v: 1,
    filename: "brink-template-ingevuld.xlsx",
    fileSize: 45_000,
    werkblad: "Product data",
    rijen,
    waarschuwingen: [],
    kolommen: [...new Set(rijen.flatMap((r) => Object.keys(r.velden)))],
    onbekendeKolommen: [],
    ontbrekendeOptioneleKolommen: [],
    artikelcodesGecontroleerd: true,
  };
}

/** Een merk met bestaand product A-1, plus een gestagede template die A-1 verrijkt en
 *  een tweede product B-9 aandraagt. Levert een uitkomst met vier verschillende
 *  tellingen — een samenvatting van louter nullen zou niets bewijzen. */
async function gestaged(db: TestDb) {
  const { brandId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
    supplierArticleCode: "A-1",
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    price: "196.00",
  });
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload: payloadVan([
      {
        rij: 4,
        velden: {
          supplier_article_code: "A-1",
          kelvin: "4000",
          color_1: "Black",
          cri: "",
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
    actor: ACTOR,
  });
  return { brandId, uploadId };
}

/** Precies wat het voorstelformulier post: aanwezigheid = aangevinkt, de value is de
 *  stale-guard (de oude waarde zoals hij op het scherm stond). */
function formulier(brandId: string, uploadId: string): FormData {
  const fd = new FormData();
  fd.set("brandId", brandId);
  fd.set("uploadId", uploadId);
  fd.set(fieldSelectionKey(4, "kelvin"), "3000");
  fd.set(fieldSelectionKey(4, "color_1"), "");
  fd.set(fieldSelectionKey(4, "cri"), "90");
  fd.set(priceSelectionKey(5), "");
  fd.set(newProductSelectionKey(5), "on");
  return fd;
}

/** Het eventspoor van dezelfde toepassing — de onafhankelijke bron van waarheid. */
async function finishedPayload(db: TestDb) {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.action, "template_apply_finished"));
  expect(rows).toHaveLength(1);
  return rows[0].payload as Record<string, unknown>;
}

test("de action stuurt de tellingen mee in de redirect-URL (en niet het kale merkpad)", async () => {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  const { brandId, uploadId } = await gestaged(db);

  const url = await redirectVan(() =>
    approveTemplateProposalAction(formulier(brandId, uploadId)),
  );

  // De naad zelf: het pad is ongewijzigd, maar de query draagt de uitkomst. Zonder deze
  // twee regels is C8 terug te introduceren zonder één rode test.
  expect(url.pathname).toBe(`/data/brand-relations/${brandId}`);
  expect(url.searchParams.get("applied")).toBe("done");
  expect(url.searchParams.get("counts")).toBeTruthy();

  // En het zijn de ECHTE tellingen, niet een verzonnen setje: naast het eventspoor van
  // dezelfde toepassing gelegd. Dít is wat een handgeschreven object niet kan bewijzen.
  const summary = readApplySummary(
    Object.fromEntries(url.searchParams.entries()),
  );
  const gelogd = await finishedPayload(db);
  expect(summary).toEqual({
    kind: "done",
    createdProducts: gelogd.createdProducts,
    updatedProducts: gelogd.updatedProducts,
    appliedFields: gelogd.appliedFields,
    skippedStaleFields: gelogd.skippedStaleFields,
    priceLines: gelogd.priceLines ?? null,
  });

  // Geen samenvatting van louter nullen — dan zou de vergelijking hierboven triviaal zijn.
  expect(gelogd).toMatchObject({
    createdProducts: 1,
    updatedProducts: 1,
    appliedFields: 3,
  });
});

test("dubbelklik: de tweede POST redirect met applied=already, niet met tellingen", async () => {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  const { brandId, uploadId } = await gestaged(db);

  await redirectVan(() =>
    approveTemplateProposalAction(formulier(brandId, uploadId)),
  );
  const tweede = await redirectVan(() =>
    approveTemplateProposalAction(formulier(brandId, uploadId)),
  );

  expect(tweede.pathname).toBe(`/data/brand-relations/${brandId}`);
  expect(tweede.searchParams.get("applied")).toBe("already");
  expect(tweede.searchParams.get("counts")).toBeNull();
  expect(
    readApplySummary(Object.fromEntries(tweede.searchParams.entries())),
  ).toEqual({ kind: "already" });
});
