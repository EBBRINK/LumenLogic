// Armaturenboek-versiebeheer (G-02/03/04) op een echte (PGlite) db. Bewijst:
//   • snapshotArmaturenboek legt oplopende versies vast met de locatie (G-03) en het
//     gematchte product (via de view — regel 3).
//   • diffVersions benoemt gewijzigde, toegevoegde en verwijderde regels (wijzigingshistorie).
import { and, eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import * as schema from "@/db/schema";
import type { TestDb } from "@/db/test-db";
import {
  diffVersions,
  getVersion,
  listVersions,
  snapshotArmaturenboek,
  type ArmatuurSnapshotRow,
} from "@/lib/repo/armaturenboek-versions";

async function seedDossierWithLines(db: TestDb) {
  const [dossier] = await db
    .insert(schema.projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();
  const { productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 CEIL",
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    price: "310.00",
  });
  await db.insert(schema.specLines).values([
    {
      dossierId: dossier.id,
      fixtureCode: "Lp301",
      location: "Begane grond — entree",
      brandText: "XAL",
      productText: "SASSO 100",
      reqKelvin: 3000,
      matchedProductId: productId,
      status: "groen",
      sortOrder: 0,
    },
    {
      dossierId: dossier.id,
      fixtureCode: "Ls001",
      location: "1e verdieping — gang",
      brandText: "Glamox",
      productText: "i40",
      status: "rood",
      sortOrder: 1,
    },
  ]);
  return { dossier, productId };
}

test("snapshot legt versie 1 vast met locatie + product en telt versienummers op", async () => {
  const db = await createTestDb();
  const { dossier } = await seedDossierWithLines(db);

  const v1 = await snapshotArmaturenboek(db, {
    dossierId: dossier.id,
    note: "eerste overdracht",
    actor: "eduard@brinklicht.nl",
  });
  expect(v1.version).toBe(1);
  expect(v1.snapshot).toHaveLength(2);

  const first = (v1.snapshot as ArmatuurSnapshotRow[])[0];
  expect(first.fixtureCode).toBe("Lp301");
  expect(first.location).toBe("Begane grond — entree"); // G-03
  expect(first.productName).toBe("SASSO 100 CEIL"); // via visible_products (regel 3)
  expect(first.status).toBe("groen");

  // Onopgeloste (rode) regel staat er eerlijk in — niets weggelaten.
  const second = (v1.snapshot as ArmatuurSnapshotRow[])[1];
  expect(second.fixtureCode).toBe("Ls001");
  expect(second.productName).toBeNull();
  expect(second.brand).toBe("Glamox");

  // Tweede snapshot → versie 2; lijst nieuwste-eerst.
  const v2 = await snapshotArmaturenboek(db, { dossierId: dossier.id });
  expect(v2.version).toBe(2);
  const versions = await listVersions(db, dossier.id);
  expect(versions.map((v) => v.version)).toEqual([2, 1]);

  const fetched = await getVersion(db, v1.id);
  expect(fetched?.note).toBe("eerste overdracht");
});

test("diffVersions benoemt gewijzigde, toegevoegde en verwijderde regels", async () => {
  const db = await createTestDb();
  const { dossier } = await seedDossierWithLines(db);
  const v1 = await snapshotArmaturenboek(db, { dossierId: dossier.id });

  // Lp301 verhuist (locatie wijzigt); Ls001 verdwijnt; Lx900 komt erbij.
  await db
    .update(schema.specLines)
    .set({ location: "Kelder — technische ruimte" })
    .where(
      and(
        eq(schema.specLines.dossierId, dossier.id),
        eq(schema.specLines.fixtureCode, "Lp301"),
      ),
    );
  await db
    .delete(schema.specLines)
    .where(
      and(
        eq(schema.specLines.dossierId, dossier.id),
        eq(schema.specLines.fixtureCode, "Ls001"),
      ),
    );
  await db.insert(schema.specLines).values({
    dossierId: dossier.id,
    fixtureCode: "Lx900",
    location: "Dak",
    brandText: "Bega",
    status: "blauw",
    sortOrder: 2,
  });

  const v2 = await snapshotArmaturenboek(db, { dossierId: dossier.id });
  const diff = diffVersions(v1, v2);

  const lp301 = diff.changed.find((c) => c.fixtureCode === "Lp301");
  expect(lp301).toBeDefined();
  expect(lp301?.fields).toContain("location");
  expect(diff.removed.map((r) => r.fixtureCode)).toEqual(["Ls001"]);
  expect(diff.added.map((r) => r.fixtureCode)).toEqual(["Lx900"]);
});

test("diffVersions werkt ook op kale snapshot-arrays (pure functie)", () => {
  const base: ArmatuurSnapshotRow = {
    fixtureCode: "A1",
    location: "hal",
    brand: "XAL",
    productId: "p1",
    productName: "SASSO",
    articleCode: "L360",
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    status: "groen",
  };
  const a = [base];
  const b = [{ ...base, status: "geel" }];
  const diff = diffVersions(a, b);
  expect(diff.changed).toHaveLength(1);
  expect(diff.changed[0].fields).toContain("status");
  expect(diff.unchanged).toBe(0);

  // identieke versies → alles ongewijzigd.
  const same = diffVersions(a, [{ ...base }]);
  expect(same.changed).toHaveLength(0);
  expect(same.unchanged).toBe(1);
});
