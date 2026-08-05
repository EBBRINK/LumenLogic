// C9 (reviewzwerm 2.5a): beeldretentie van OCR-runs.
//
// `ocr_page_images.bytes` is de enige bytea-kolom in het schema. Tot deze fix bestonden er
// precies twee deletes op die tabel en zaten ze allebei in een faalpad; het succespad ruimde
// nooit iets op. finishOcrRun ruimt nu op — maar ALLEEN als de reviewwachtrij van die run
// leeg is.
//
// DE BELANGRIJKSTE TEST IS DE EERSTE: de beelden BLIJVEN staan zolang er nog review-werk
// ligt. Het paginabeeld is de enige echte bron van een lezing (het transcript is expliciet
// "wat het model las, niet het document"), dus een opruiming die te vroeg toeslaat maakt de
// review-vraag "is deze lezing correct?" onbeantwoordbaar — en dat is onherstelbaar.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { events, ocrPageImages, specLines } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { createDossier } from "@/lib/repo/dossiers";
import { finishOcrRun, startOcrRun } from "@/lib/repo/ocr";

const ACTOR = "eduard@brinklicht.nl";
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);

// Een run met twee paginabeelden. De beelden worden hier rechtstreeks geïnsert: deze test
// gaat over retentie, niet over de vision-lus (die staat in lib/repo/ocr.test.ts).
async function seedRun(db: TestDb, naam = "Deerns beeldboek") {
  const dossier = await createDossier(db, { orgId: null, name: naam });
  const { run } = await startOcrRun(db, {
    dossierId: dossier.id,
    filename: "boek.pdf",
    pageCount: 2,
    actor: ACTOR,
  });
  for (const page of [1, 2]) {
    await db.insert(ocrPageImages).values({
      importRunId: run.id,
      page,
      tile: 0,
      mime: "image/jpeg",
      width: 1568,
      height: 2000,
      bytes: IMAGE,
    });
  }
  return { dossierId: dossier.id, runId: run.id };
}

// Bewust bytes-vrij (B2): alléén getOcrPageImage mag die kolom aanraken, ook in tests.
async function beeldCount(db: TestDb, runId: string) {
  const rows = await db
    .select({ id: ocrPageImages.id })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, runId));
  return rows.length;
}

async function pruneEvents(db: TestDb) {
  return db.select().from(events).where(eq(events.action, "ocr_images_pruned"));
}

// ── 1. De poort: nog werk in de wachtrij → beelden blijven ───────────────────

test("wachtende OCR-review: het afronden laat de paginabeelden staan", async () => {
  const db = await createTestDb();
  const { dossierId, runId } = await seedRun(db);
  // Precies wat processOcrPage achterlaat: een regel met reviewKind 'ocr' die nog
  // gereviewd moet worden (B7). Dit is de normale toestand direct ná een run.
  await db.insert(specLines).values({
    dossierId,
    fixtureCode: "Lw201",
    source: "ocr",
    sourcePage: 1,
    importRunId: runId,
    reviewKind: "ocr",
    status: "geel",
  });

  await finishOcrRun(db, { runId, actor: ACTOR });

  // ⚠️ DE KERN VAN C9: er moet nog een mens naar de bron kunnen kijken.
  expect(await beeldCount(db, runId)).toBe(2);
  expect(await pruneEvents(db)).toHaveLength(0);
});

test("rode regel zonder match telt óók als werk: beelden blijven staan", async () => {
  const db = await createTestDb();
  const { dossierId, runId } = await seedRun(db);
  // Rood zonder match is geen afgeronde regel maar werkvoorraad op de review-pagina
  // ("Niet gevonden — handmatig linken", lib/repo/review.ts getRedLinkLines). Ook dan
  // wil de mens de brontekening erbij kunnen pakken.
  await db.insert(specLines).values({
    dossierId,
    fixtureCode: "Lp301",
    source: "ocr",
    sourcePage: 2,
    importRunId: runId,
    reviewKind: "ocr",
    reviewedAt: new Date(),
    reviewedBy: ACTOR,
    reviewDecision: "gecontroleerd",
    status: "rood",
    matchedProductId: null,
  });

  await finishOcrRun(db, { runId, actor: ACTOR });

  expect(await beeldCount(db, runId)).toBe(2);
  expect(await pruneEvents(db)).toHaveLength(0);
});

// ── 2. Lege wachtrij → opruimen ──────────────────────────────────────────────

test("lege wachtrij: het afronden ruimt de paginabeelden op en logt dat", async () => {
  const db = await createTestDb();
  const { dossierId, runId } = await seedRun(db);
  // Gereviewd én gematcht: er ligt geen werk meer aan deze run.
  await db.insert(specLines).values({
    dossierId,
    fixtureCode: "Lw201",
    source: "ocr",
    sourcePage: 1,
    importRunId: runId,
    reviewKind: "ocr",
    reviewedAt: new Date(),
    reviewedBy: ACTOR,
    reviewDecision: "gecontroleerd",
    status: "groen",
    matchedProductId: null,
  });

  expect(await beeldCount(db, runId)).toBe(2);
  await finishOcrRun(db, { runId, actor: ACTOR });

  expect(await beeldCount(db, runId)).toBe(0);
  const gelogd = await pruneEvents(db);
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].payload).toMatchObject({ images: 2 });
  expect(gelogd[0].entityId).toBe(runId);
});

// ── 3. De run-scoping: een opruiming raakt NOOIT een andere run ──────────────
// Tot deze test zaaide geen enkele test een tweede run. Daardoor bleef de gevaarlijkste
// mutatie die hier bestaat volledig onopgemerkt: haal `where(eq(importRunId, runId))` van
// de DELETE af en pruneOcrPageImages wist de paginabeelden van ÉLKE run — inclusief runs
// waar nog een mens naar moet kijken. Alle vier de tests hierboven bleven daarbij groen,
// want ze kennen maar één run: "0 beelden over" is dan zowel het goede als het rampzalige
// antwoord. Hetzelfde geldt voor de poort: zonder run-scoping telt hij het open werk van
// de héle database, en dan blokkeert het werk van run A het opruimen van run B (of, erger,
// laat het openstaande werk van A zich wegpoetsen zodra B leeg is).

test("twee runs naast elkaar: het afronden van de ene laat de beelden van de andere ongemoeid", async () => {
  const db = await createTestDb();
  // Run A: er ligt nog review-werk. Zijn beelden moeten hoe dan ook blijven staan.
  const a = await seedRun(db, "Boek A (nog in review)");
  await db.insert(specLines).values({
    dossierId: a.dossierId,
    fixtureCode: "La101",
    source: "ocr",
    sourcePage: 1,
    importRunId: a.runId,
    reviewKind: "ocr",
    status: "geel",
  });

  // Run B: schoon — gereviewd én afgehandeld, dus B's beelden mogen weg.
  const b = await seedRun(db, "Boek B (afgerond)");
  await db.insert(specLines).values({
    dossierId: b.dossierId,
    fixtureCode: "Lb201",
    source: "ocr",
    sourcePage: 1,
    importRunId: b.runId,
    reviewKind: "ocr",
    reviewedAt: new Date(),
    reviewedBy: ACTOR,
    reviewDecision: "gecontroleerd",
    status: "groen",
    matchedProductId: null,
  });

  expect(await beeldCount(db, a.runId)).toBe(2);
  expect(await beeldCount(db, b.runId)).toBe(2);

  await finishOcrRun(db, { runId: b.runId, actor: ACTOR });

  // B is opgeruimd …
  expect(await beeldCount(db, b.runId)).toBe(0);
  // … en A staat er nog volledig — dit is de assertie die de ongescopte delete vangt.
  expect(await beeldCount(db, a.runId)).toBe(2);

  // Het event telt alleen B's beelden. Stond hier 4, dan was er buiten de run gewist.
  const gelogd = await pruneEvents(db);
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].entityId).toBe(b.runId);
  expect(gelogd[0].payload).toMatchObject({ images: 2 });

  // En andersom: A afronden ruimt niets op, want A's wachtrij is nog vol. Zonder
  // run-scoping in de POORT zou B's lege wachtrij hier een vals "klaar" opleveren.
  await finishOcrRun(db, { runId: a.runId, actor: ACTOR });
  expect(await beeldCount(db, a.runId)).toBe(2);
  expect(await pruneEvents(db)).toHaveLength(1);
});

// ── 4. De echte volgorde: eerst afronden, daarna pas reviewen ────────────────

test("na het reviewen ruimt een tweede finish alsnog op (en logt niet dubbel)", async () => {
  const db = await createTestDb();
  const { dossierId, runId } = await seedRun(db);
  const [regel] = await db
    .insert(specLines)
    .values({
      dossierId,
      fixtureCode: "Lw201",
      source: "ocr",
      sourcePage: 1,
      importRunId: runId,
      reviewKind: "ocr",
      status: "geel",
    })
    .returning({ id: specLines.id });

  // Zo loopt het in productie: de run wordt afgerond terwijl de wachtrij nog vol staat.
  await finishOcrRun(db, { runId, actor: ACTOR });
  expect(await beeldCount(db, runId)).toBe(2);

  // De mens doet zijn werk.
  await db
    .update(specLines)
    .set({
      reviewedAt: new Date(),
      reviewedBy: ACTOR,
      reviewDecision: "gecontroleerd",
      status: "groen",
    })
    .where(eq(specLines.id, regel.id));

  // Tweede finish = het idempotente pad ('klaar' → geen tweede ocr_done). Het opruimen
  // draait daar wél: dit is de enige plek waar de vraag gesteld wordt.
  await finishOcrRun(db, { runId, actor: ACTOR });
  expect(await beeldCount(db, runId)).toBe(0);
  expect(await pruneEvents(db)).toHaveLength(1);
  // Idempotentie van het afronden zelf blijft overeind: nog steeds één ocr_done.
  expect(
    await db.select().from(events).where(eq(events.action, "ocr_done")),
  ).toHaveLength(1);

  // En een derde finish logt niets nieuws (er valt niets meer te verwijderen).
  await finishOcrRun(db, { runId, actor: ACTOR });
  expect(await pruneEvents(db)).toHaveLength(1);
});
