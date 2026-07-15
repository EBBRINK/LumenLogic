// B2/B4 (bouwstap 2): de bytea-round-trip uit bouwstap 1 (proeftabel), nu tegen de
// échte ocr_page_images-tabel uit migratie 0009 — plus cascade en het per-pagina-lock.
//
// Hoe de neon-http-driver (@neondatabase/serverless 1.x) bytea serialiseert — code-
// inspectie van node_modules/@neondatabase/serverless/index.js:
// - UIT (parameter): `prepareValue` maakt van elke ArrayBuffer-view een Buffer;
//   `encodeBuffersAsBytea` stuurt die als hex-string "\x<hex>" naar Neon.
// - IN (resultaat): de tekst-parser voor oid 17 ("parseBytea") leest "\x..." terug
//   als Buffer (een Uint8Array-subklasse).
// De customType (db/schema.ts, export `bytea`) werkt dus op beide drivers: toDriver
// geeft de Uint8Array door (PGlite serialiseert binair; neon-http hext hem zelf),
// fromDriver normaliseert en vangt defensief een rauwe "\x..."-hexstring af.
import { and, eq } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import { byteaFromDriver, importRuns, ocrPageImages, projectDossiers } from "./schema";
import { createTestDb, type TestDb } from "./test-db";

let db: TestDb;
let runId: string;

// Eén dossier + importrun als FK-ouder voor alle pagina-inserts.
beforeAll(async () => {
  db = await createTestDb();
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "OCR-testdossier" })
    .returning();
  const [run] = await db
    .insert(importRuns)
    .values({ dossierId: dossier.id, source: "ocr", rows: [] })
    .returning();
  runId = run.id;
});

function randomBytes(size: number): Uint8Array {
  // crypto.getRandomValues kan max 64KB per call, dus in blokken.
  const out = new Uint8Array(size);
  for (let i = 0; i < out.length; i += 65_536) {
    crypto.getRandomValues(out.subarray(i, Math.min(i + 65_536, out.length)));
  }
  for (let i = 0; i < Math.min(256, out.length); i++) out[i] = i; // alle waarden, incl. 0x00/0xff
  return out;
}

test("ocr_page_images: 400KB Uint8Array gaat byte-identiek door de echte tabel", async () => {
  const input = randomBytes(400 * 1024);
  await db.insert(ocrPageImages).values({
    importRunId: runId,
    page: 1,
    mime: "image/jpeg",
    width: 1568,
    height: 1109,
    bytes: input,
  });
  const [row] = await db
    .select()
    .from(ocrPageImages)
    .where(and(eq(ocrPageImages.importRunId, runId), eq(ocrPageImages.page, 1)));

  expect(row.bytes).toBeInstanceOf(Uint8Array);
  expect(row.bytes.length).toBe(input.length);
  // Byte-vergelijking zonder 400K expect-calls: eerste afwijkende index zoeken.
  let mismatch = -1;
  for (let i = 0; i < input.length; i++) {
    if (row.bytes[i] !== input[i]) {
      mismatch = i;
      break;
    }
  }
  expect(mismatch).toBe(-1);
});

test("unique(import_run_id, page): tweede insert voor dezelfde pagina = nette fout (B4-lock)", async () => {
  await db.insert(ocrPageImages).values({
    importRunId: runId,
    page: 2,
    mime: "image/jpeg",
    width: 100,
    height: 100,
    bytes: new Uint8Array([1, 2, 3]),
  });
  // Drizzle wikkelt de PG-fout in "Failed query" — de constraint-naam zit in error.cause.
  const err: unknown = await db
    .insert(ocrPageImages)
    .values({
      importRunId: runId,
      page: 2,
      mime: "image/jpeg",
      width: 100,
      height: 100,
      bytes: new Uint8Array([4, 5, 6]),
    })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause ?? err;
  expect(String(cause)).toMatch(/ocr_page_images_run_page_uniq|duplicate key/);
  // Een ándere pagina op dezelfde run mag gewoon wél.
  await db.insert(ocrPageImages).values({
    importRunId: runId,
    page: 3,
    mime: "image/jpeg",
    width: 100,
    height: 100,
    bytes: new Uint8Array([7]),
  });
});

test("cascade: run verwijderen ruimt de paginabeelden op (B6: even lang leven als de run)", async () => {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Cascade-dossier" })
    .returning();
  const [run] = await db
    .insert(importRuns)
    .values({ dossierId: dossier.id, source: "ocr", rows: [] })
    .returning();
  await db.insert(ocrPageImages).values({
    importRunId: run.id,
    page: 1,
    mime: "image/jpeg",
    width: 10,
    height: 10,
    bytes: new Uint8Array([9]),
  });
  await db.delete(importRuns).where(eq(importRuns.id, run.id));
  const rest = await db
    .select({ id: ocrPageImages.id })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, run.id));
  expect(rest).toHaveLength(0);
});

test("fromDriver decodeert ook de hex-vorm die neon-http levert", () => {
  // neon-http's parseBytea levert normaal al een Buffer, maar mocht de rauwe
  // "\x<hex>"-tekst doorlekken dan decodeert de customType hem zelf.
  expect(Array.from(byteaFromDriver("\\x00ff10"))).toEqual([0, 255, 16]);
  expect(byteaFromDriver(new Uint8Array([1, 2]))).toEqual(new Uint8Array([1, 2]));
});
