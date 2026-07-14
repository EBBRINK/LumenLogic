// Merkrelaties-repo (stap 2): reads schrijven nooit (virtueel 'niet_benaderd'),
// upsert is de enige schrijver en logt precies de juiste events (regel 5), en de
// prijslijst-indicator deelt de datumlogica met listPriceListStatus.
import { expect, test } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { brandRelations, brands, events } from "@/db/schema";
import {
  listBrandRelations,
  priceListIndicator,
  upsertBrandRelation,
} from "@/lib/repo/brand-relations";

const TODAY = new Date("2026-07-14T12:00:00Z");

async function eventsFor(db: Awaited<ReturnType<typeof createTestDb>>, brandId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.entityId, brandId))
    .orderBy(asc(events.createdAt));
}

test("lezen zonder rij → virtueel 'niet_benaderd', en lezen schrijft NOOIT", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Flos", name: "Aim" });

  const rows = await listBrandRelations(db, TODAY);
  const flos = rows.find((r) => r.brandId === brandId)!;
  expect(flos.status).toBe("niet_benaderd");
  expect(flos.productCount).toBe(1);

  // Geen rij ontstaan door het lezen (K2: reads zijn puur virtueel).
  expect(await db.select().from(brandRelations)).toHaveLength(0);
  expect(await eventsFor(db, brandId)).toHaveLength(0);
});

test("upsert-round-trip: insert → update op dezelfde rij (on conflict)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Artemide", name: "Tolomeo" });

  await upsertBrandRelation(db, brandId, {
    status: "benaderd",
    contactName: "Anna",
    contactEmail: "anna@artemide.it",
    lastContactAt: "2026-07-10",
  }, "timo");
  await upsertBrandRelation(db, brandId, { status: "wacht_op_data" }, "timo");

  const all = await db.select().from(brandRelations);
  expect(all).toHaveLength(1); // upsert, geen tweede rij
  expect(all[0].status).toBe("wacht_op_data");
  expect(all[0].contactName).toBe("Anna"); // eerdere velden blijven staan

  const [row] = await listBrandRelations(db, TODAY);
  expect(row.status).toBe("wacht_op_data");
  expect(row.contactEmail).toBe("anna@artemide.it");
});

test("events: statuswijziging logt {from, to}; gelijkblijvende status logt géén status-event", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Vibia", name: "Wireflow" });

  // Eerste save: status 'benaderd' (from = virtueel 'niet_benaderd').
  await upsertBrandRelation(db, brandId, { status: "benaderd" }, "timo");
  let evts = await eventsFor(db, brandId);
  expect(evts).toHaveLength(1);
  expect(evts[0].action).toBe("brand_relation_status_changed");
  expect(evts[0].payload).toEqual({ from: "niet_benaderd", to: "benaderd" });
  expect(evts[0].actor).toBe("timo");

  // Zelfde status + notitie: alléén een updated-event, géén status-event.
  await upsertBrandRelation(db, brandId, { status: "benaderd", notes: "gebeld" }, "timo");
  evts = await eventsFor(db, brandId);
  expect(evts).toHaveLength(2);
  expect(evts[1].action).toBe("brand_relation_updated");
  expect(evts[1].payload).toEqual({ fields: ["notes"] });

  // Status én notitie tegelijk gewijzigd → beide events uit één save.
  await upsertBrandRelation(db, brandId, { status: "wacht_op_data", notes: "toegezegd" });
  evts = await eventsFor(db, brandId);
  expect(evts.map((e) => e.action)).toEqual([
    "brand_relation_status_changed",
    "brand_relation_updated",
    "brand_relation_status_changed",
    "brand_relation_updated",
  ]);
  expect(evts[2].payload).toEqual({ from: "benaderd", to: "wacht_op_data" });
});

test("prijslijst-indicator: geldig / verloopt binnenkort / verlopen / ontbreekt", async () => {
  const db = await createTestDb();
  const geldig = await seedBrandProduct(db, {
    brand: "Merk Geldig", name: "P1", validUntil: "2027-06-30",
  });
  const binnenkort = await seedBrandProduct(db, {
    brand: "Merk Binnenkort", name: "P2", validUntil: "2026-08-01", // 18 dagen
  });
  const verlopen = await seedBrandProduct(db, {
    brand: "Merk Verlopen", name: "P3", validFrom: "2025-01-01", validUntil: "2026-01-01",
  });
  // Merk zonder prijslijst.
  const kaalId = crypto.randomUUID();
  await db.insert(brands).values({ id: kaalId, name: "Merk Kaal", slug: "merk-kaal" });

  const rows = await listBrandRelations(db, TODAY);
  const by = (id: string) => rows.find((r) => r.brandId === id)!;
  expect(by(geldig.brandId).priceListIndicator).toBe("aanwezig_geldig");
  expect(by(binnenkort.brandId).priceListIndicator).toBe("verloopt_binnenkort");
  expect(by(verlopen.brandId).priceListIndicator).toBe("verlopen");
  expect(by(kaalId).priceListIndicator).toBe("ontbreekt");
  expect(by(kaalId).productCount).toBe(0);

  // Randgevallen van de gedeelde helper: vandaag zelf = nog geldig (binnenkort).
  expect(priceListIndicator("2026-07-14", TODAY)).toBe("verloopt_binnenkort");
  expect(priceListIndicator("2026-07-13", TODAY)).toBe("verlopen");
  expect(priceListIndicator(null, TODAY)).toBe("ontbreekt");
});

test("geen fan-out: merk met 2 prijslijst-rijen geeft 1 rij, indicator op de nieuwste lijst", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Merk Dubbel", name: "P1", validUntil: "2027-06-30",
  });
  // Tweede (oudere, vervangen) lijst via raw SQL — replaced_at gezet zodat de
  // partial-unique-index op actieve lijsten niet schendt.
  await db.execute(sql`
    insert into price_lists (brand_id, name, valid_from, valid_until, replaced_at)
    values (${brandId}, 'Oude lijst', '2024-01-01', '2025-01-01', now())
  `);

  const rows = await listBrandRelations(db, TODAY);
  const dubbel = rows.filter((r) => r.brandId === brandId);
  expect(dubbel).toHaveLength(1);
  expect(dubbel[0].priceListValidUntil).toBe("2027-06-30");
  expect(dubbel[0].priceListIndicator).toBe("aanwezig_geldig");
});

test("K8: merken met een gedeelde brand_code krijgen de dubbele-code-markering", async () => {
  const db = await createTestDb();
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  const c = crypto.randomUUID();
  await db.insert(brands).values([
    { id: a, name: "Merk A", slug: "merk-a", brandCode: "L052" },
    { id: b, name: "Merk B", slug: "merk-b", brandCode: "L052" },
    { id: c, name: "Merk C", slug: "merk-c", brandCode: "L099" },
  ]);

  const rows = await listBrandRelations(db, TODAY);
  const by = (id: string) => rows.find((r) => r.brandId === id)!;
  expect(by(a).sharedBrandCode).toBe(true);
  expect(by(b).sharedBrandCode).toBe(true);
  expect(by(c).sharedBrandCode).toBe(false);
});
