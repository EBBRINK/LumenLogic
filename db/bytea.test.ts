// Bewijs voor B2 (bouwstap 1): Drizzle heeft geen ingebouwd bytea — deze customType
// gaat bij bouwstap 2 naar db/schema.ts (tabel ocr_page_images). Hier de round-trip
// op PGlite: 400KB Uint8Array erin → byte-identiek eruit.
//
// Hoe de neon-http-driver (@neondatabase/serverless 1.x) bytea serialiseert — code-
// inspectie van node_modules/@neondatabase/serverless/index.js:
// - UIT (parameter): `prepareValue` maakt van elke ArrayBuffer-view een Buffer;
//   `encodeBuffersAsBytea` stuurt die als hex-string "\x<hex>" naar Neon
//   (a(Lu,"encodeBuffersAsBytea"): r instanceof Buffer ? "\\x"+hex(r) : r).
// - IN (resultaat): de tekst-parser voor oid 17 ("parseBytea") leest "\x..." terug
//   als Buffer (een Uint8Array-subklasse).
// De customType hieronder werkt dus op beide drivers: toDriver geeft de Uint8Array
// door (PGlite serialiseert binair; neon-http hext hem zelf), fromDriver normaliseert
// Uint8Array/Buffer en vangt defensief een rauwe "\x..."-hexstring af.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { customType, integer, pgTable } from "drizzle-orm/pg-core";
import { expect, test } from "vitest";

function byteaFromDriver(value: Uint8Array | string): Uint8Array {
  if (typeof value === "string") {
    // neon-http zónder type-parser zou "\x<hex>" doorgeven — defensief decoderen.
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array | string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Uint8Array {
    return value;
  },
  fromDriver: byteaFromDriver,
});

// Proeftabel — NIET het echte schema; ocr_page_images komt in bouwstap 2 (B10:
// migratienummer pas na de merge van de parallelle sessie).
const byteaProef = pgTable("bytea_proef", {
  id: integer("id").primaryKey(),
  data: bytea("data").notNull(),
});

test("bytea round-trip: 400KB Uint8Array gaat byte-identiek door PGlite", async () => {
  const client = await PGlite.create();
  await client.exec(
    "CREATE TABLE bytea_proef (id integer PRIMARY KEY, data bytea NOT NULL);",
  );
  const db = drizzle(client, { schema: { byteaProef } });

  // 400KB met alle bytewaarden én pseudo-random ruis (crypto.getRandomValues kan
  // max 64KB per call, dus in blokken).
  const input = new Uint8Array(400 * 1024);
  for (let i = 0; i < input.length; i += 65_536) {
    crypto.getRandomValues(input.subarray(i, Math.min(i + 65_536, input.length)));
  }
  for (let i = 0; i < 256; i++) input[i] = i; // alle waarden, incl. 0x00 en 0xff

  await db.insert(byteaProef).values({ id: 1, data: input });
  const [row] = await db
    .select()
    .from(byteaProef)
    .where(eq(byteaProef.id, 1));

  expect(row.data).toBeInstanceOf(Uint8Array);
  expect(row.data.length).toBe(input.length);
  // Byte-vergelijking zonder 400K expect-calls: eerste afwijkende index zoeken.
  let mismatch = -1;
  for (let i = 0; i < input.length; i++) {
    if (row.data[i] !== input[i]) {
      mismatch = i;
      break;
    }
  }
  expect(mismatch).toBe(-1);
});

test("fromDriver decodeert ook de hex-vorm die neon-http levert", () => {
  // neon-http's parseBytea levert normaal al een Buffer, maar mocht de rauwe
  // "\x<hex>"-tekst doorlekken dan decodeert de customType hem zelf.
  expect(Array.from(byteaFromDriver("\\x00ff10"))).toEqual([0, 255, 16]);
  expect(byteaFromDriver(new Uint8Array([1, 2]))).toEqual(new Uint8Array([1, 2]));
});
