// Actiepad van de tabbladkeuze (goal-meerdere-tabbladen N4), op PGlite met dezelfde
// migraties als Neon. Gemeten aan de ÉCHTE server action, want het punt van deze feature
// is juist wat de action wél en niet doet: bij een keuze mag er níets geschreven worden
// en moet de run op 'voorstel' blijven staan, anders weigert de idempotentie-poort de
// tweede finish en is de import onmogelijk af te ronden.
//
// Harnas: PGlite in plaats van Neon, sessie gemockt, revalidatePath uitgezet — zelfde
// opzet als app/projects/actions-validation.test.ts.
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { expect, test, vi } from "vitest";
import { events, importRuns, projectDossiers, specLines } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { seedInternLid } from "@/db/test-org";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "eduard@brinklicht.nl",
}));

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
  getSession: async () => ({ user: { email: harnas.email } }),
  requireSession: async () => ({ user: { email: harnas.email } }),
  getActor: async () => harnas.email,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const {
  finishTableImportAction,
  importTabelRowsAction,
  startTableImportAction,
  uploadSourceChunkAction,
} = await import("./actions");

const KOP = ["Codering", "Ruimtenaam", "Aantal", "Fabrikant/type"];

// Twee bladen met regels, één legendablad zonder koprij en één verborgen blad met
// data — precies de vier gevallen die de beslisfunctie uit elkaar moet houden.
async function werkboek(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const een = wb.addWorksheet("Delta Light");
  een.addRow(KOP);
  een.addRow(["1", "Hal", 3, "Delta Light Spy 39"]);
  een.addRow(["2", "Keuken", 2, "Delta Light Spy 39"]);
  const twee = wb.addWorksheet("Wever en Ducre");
  twee.addRow(KOP);
  twee.addRow(["1", "Hal", 3, "Wever en Ducre 18486LQ3"]);
  wb.addWorksheet("Legenda").addRow(["Toelichting bij de coderingen"]);
  const verborgen = wb.addWorksheet("Sjabloon", { state: "hidden" });
  verborgen.addRow(KOP);
  verborgen.addRow(["9", "Nergens", 1, "Sjabloonarmatuur"]);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function seed() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  await seedInternLid(db, harnas.email);
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Woning met twee uitvoeringen" })
    .returning();

  const bytes = await werkboek();
  const gestart = await startTableImportAction({
    dossierId: dossier.id,
    filename: "armaturenstaat.xlsx",
  });
  if ("error" in gestart) throw new Error(gestart.error);

  const fd = new FormData();
  fd.set("dossierId", dossier.id);
  fd.set("runId", gestart.runId);
  fd.set("chunk", "0");
  fd.set(
    "bytes",
    new File([bytes as unknown as BlobPart], "armaturenstaat.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const gestuurd = await uploadSourceChunkAction(fd);
  if ("error" in gestuurd) throw new Error(gestuurd.error);

  return { db, dossierId: dossier.id, runId: gestart.runId };
}

const regels = (db: TestDb, dossierId: string) =>
  db.select().from(specLines).where(eq(specLines.dossierId, dossierId));
const runVan = async (db: TestDb, runId: string) =>
  (await db.select().from(importRuns).where(eq(importRuns.id, runId)))[0];
const eventsVan = (db: TestDb, runId: string) =>
  db.select().from(events).where(eq(events.entityId, runId));

// Next' redirect() gooit; dat is het succes-signaal van deze action, geen fout.
async function verwachtRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const digest = String((e as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return digest;
    throw e;
  }
  throw new Error("action redirectte niet");
}

test("twee databladen zonder sheetIndex: keuze terug, niets geschreven, run blijft voorstel", async () => {
  const { db, dossierId, runId } = await seed();

  const uitkomst = await finishTableImportAction({ dossierId, runId });
  expect(uitkomst).toEqual({
    sheetChoice: {
      sheets: [
        { index: 1, name: "Delta Light", lines: 2 },
        { index: 2, name: "Wever en Ducre", lines: 1 },
      ],
      // het legendablad; het verborgen sjabloonblad wordt niet genoemd
      skipped: 1,
    },
  });

  // Er is NIETS geïmporteerd en de run staat nog open — anders zou de poort de
  // tweede finish weigeren en was de import niet meer af te ronden.
  expect(await regels(db, dossierId)).toHaveLength(0);
  expect((await runVan(db, runId)).status).toBe("voorstel");
  const acties = (await eventsVan(db, runId)).map((e) => e.action);
  expect(acties).toContain("tabel_sheet_keuze_nodig");
  expect(acties).not.toContain("source_file_stored");
});

test("mét sheetIndex: alleen dat blad, en het event draagt welk blad het werd", async () => {
  const { db, dossierId, runId } = await seed();
  await finishTableImportAction({ dossierId, runId }); // proef-finish

  await verwachtRedirect(
    finishTableImportAction({ dossierId, runId, sheetIndex: 2 }),
  );

  const geschreven = await regels(db, dossierId);
  expect(geschreven).toHaveLength(1);
  expect(geschreven[0].productText).toContain("18486LQ3");
  // geen enkele regel van blad 1
  expect(geschreven.some((r) => (r.productText ?? "").includes("Spy 39"))).toBe(false);

  const stored = (await eventsVan(db, runId)).find(
    (e) => e.action === "source_file_stored",
  );
  expect(stored?.payload).toMatchObject({
    sheet: { index: 2, name: "Wever en Ducre", lines: 1 },
  });
});

test("een tweede finish ná de import blijft geweigerd", async () => {
  const { dossierId, runId } = await seed();
  await finishTableImportAction({ dossierId, runId });
  await verwachtRedirect(
    finishTableImportAction({ dossierId, runId, sheetIndex: 1 }),
  );
  expect(await finishTableImportAction({ dossierId, runId, sheetIndex: 2 })).toEqual({
    error: "This table import is already finished.",
  });
});

test("een verzonnen sheetIndex wordt geweigerd, ook als het blad bestaat", async () => {
  const { db, dossierId, runId } = await seed();

  // blad 4 bestaat wél, maar is verborgen en werd dus nooit aangeboden
  expect(await finishTableImportAction({ dossierId, runId, sheetIndex: 4 })).toEqual({
    error: "That sheet is not part of this file, or holds no luminaire lines.",
  });
  // blad 3 is de legenda: bestaat, maar heeft geen koprij
  expect(await finishTableImportAction({ dossierId, runId, sheetIndex: 3 })).toEqual({
    error: "That sheet is not part of this file, or holds no luminaire lines.",
  });
  // en een index die helemaal niet bestaat
  expect(await finishTableImportAction({ dossierId, runId, sheetIndex: 9 })).toEqual({
    error: "That sheet is not part of this file, or holds no luminaire lines.",
  });

  expect(await regels(db, dossierId)).toHaveLength(0);
  expect((await runVan(db, runId)).status).toBe("voorstel");
  expect((await eventsVan(db, runId)).map((e) => e.action)).toContain(
    "tabel_import_rejected",
  );
});

test(">15 MB-pad: het gekozen blad landt in source_file_skipped_too_large", async () => {
  // Meetlat 4, tweede helft. Op dit pad slaat de server het bronbestand bewust niet op,
  // dus het event ís het enige spoor van wélk tabblad er geïmporteerd is.
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  await seedInternLid(db, harnas.email);
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Woning, groot bestand" })
    .returning();

  await verwachtRedirect(
    importTabelRowsAction({
      dossierId: dossier.id,
      filename: "armaturenstaat.xlsx",
      rows: [KOP, ["1", "Hal", "3", "Wever en Ducre 18486LQ3"]],
      sheetName: "Wever en Ducre",
      sheetCount: 4,
    }),
  );

  const alle = await db.select().from(events);
  const overgeslagen = alle.find(
    (e) => e.action === "source_file_skipped_too_large",
  );
  expect(overgeslagen?.payload).toMatchObject({
    filename: "armaturenstaat.xlsx",
    sourceStored: false,
    sheet: { name: "Wever en Ducre", count: 4 },
  });
});

test(">15 MB-pad zonder tabbladen (csv): geen sheet-veld in de payload", async () => {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  await seedInternLid(db, harnas.email);
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Woning, csv" })
    .returning();

  await verwachtRedirect(
    importTabelRowsAction({
      dossierId: dossier.id,
      filename: "armaturenstaat.csv",
      rows: [KOP, ["1", "Hal", "3", "Delta Light Spy 39"]],
    }),
  );

  const overgeslagen = (await db.select().from(events)).find(
    (e) => e.action === "source_file_skipped_too_large",
  );
  expect(overgeslagen?.payload).not.toHaveProperty("sheet");
});
