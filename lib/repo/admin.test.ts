// Admin-console-repository: merk-tier round-trip + productentelling, upload-goedkeuring
// (staging → approved/rejected mét notitie), PDL-import als staging-stub, en het
// gebruikersoverzicht over orgs. Draait op de PGlite-testdatabase (migraties t/m 0005).
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import { brandUploads } from "@/db/schema";
import { addMembership, createOrganization } from "@/lib/repo/orgs";
import { getBrandFieldOverrides } from "@/lib/repo/disclosure";
import {
  approveUpload,
  listAllMemberships,
  listBrandUploadsForReview,
  listBrandsWithTier,
  recentAdminEvents,
  recordPdlImport,
  rejectUpload,
  setBrandFieldOverride,
  setBrandTier,
} from "@/lib/repo/admin";

test("merken: tier round-trip en productentelling", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 52" });
  // Een tweede merk zonder producten telt óók mee (nul is een eerlijk getal).
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });

  let brandsList = await listBrandsWithTier(db);
  const delta = brandsList.find((b) => b.name === "Delta Light");
  expect(delta?.disclosureTier).toBe("tier1"); // schema-default
  expect(delta?.productCount).toBe(2);
  expect(brandsList.find((b) => b.name === "XAL")?.productCount).toBe(1);

  // Tier zetten → round-trip.
  await setBrandTier(db, brandId, "tier3", "timo");
  brandsList = await listBrandsWithTier(db);
  expect(brandsList.find((b) => b.id === brandId)?.disclosureTier).toBe("tier3");
});

test("per-veld-zichtbaarheid schrijft door naar de disclosure-bron (J-04)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Occhio",
    name: "Mito",
  });
  await setBrandFieldOverride(db, brandId, "gross_price", false, "timo");
  const overrides = await getBrandFieldOverrides(db, brandId);
  expect(overrides.gross_price).toBe(false);
});

test("upload-goedkeuring: staging → approved, uit de wachtrij", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Flos",
    name: "IC Lights",
  });
  const [upload] = await db
    .insert(brandUploads)
    .values({
      brandId,
      kind: "pricelist",
      payload: { rows: 3 },
      status: "staging",
      submittedBy: "merk@flos.com",
    })
    .returning();

  expect(await listBrandUploadsForReview(db)).toHaveLength(1);

  const approved = await approveUpload(db, upload.id, "timo");
  expect(approved?.status).toBe("approved");
  expect(approved?.reviewedBy).toBe("timo");
  // Afgehandeld → niet meer in de wachtrij.
  expect(await listBrandUploadsForReview(db)).toHaveLength(0);
});

test("upload-afwijzing draagt altijd een notitie", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Artemide",
    name: "Tolomeo",
  });
  const [upload] = await db
    .insert(brandUploads)
    .values({
      brandId,
      kind: "data",
      payload: { rows: 5 },
      status: "staging",
    })
    .returning();

  const rejected = await rejectUpload(db, upload.id, "timo", "Onvolledige velden");
  expect(rejected?.status).toBe("rejected");
  expect(rejected?.reviewNote).toBe("Onvolledige velden");
  expect(await listBrandUploadsForReview(db)).toHaveLength(0);
});

test("PDL-import maakt een staging-upload van kind 'data'", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "iGuzzini",
    name: "Laser Blade",
  });
  const row = await recordPdlImport(db, {
    brandId,
    payload: { source: "ConnectingTheDots", products: 120 },
    actor: "timo",
  });
  expect(row.kind).toBe("data");
  expect(row.status).toBe("staging");
  // Belandt in de goedkeuringswachtrij, nooit direct in de catalogus (H-10/H-11).
  const queue = await listBrandUploadsForReview(db);
  expect(queue.map((q) => q.id)).toContain(row.id);
});

test("gebruikersoverzicht toont memberships over orgs", async () => {
  const db = await createTestDb();
  const orgA = await createOrganization(db, { name: "Aannemer Zuid" });
  const orgB = await createOrganization(db, { name: "Bouw Noord" });
  await addMembership(db, {
    orgId: orgA.id,
    email: "piet@zuid.nl",
    roles: ["calculator"],
  });
  await addMembership(db, {
    orgId: orgB.id,
    email: "els@noord.nl",
    roles: ["org_admin", "projectleider"],
  });

  const all = await listAllMemberships(db);
  expect(all).toHaveLength(2);
  const els = all.find((m) => m.email === "els@noord.nl");
  expect(els?.orgName).toBe("Bouw Noord");
  expect(els?.roles).toEqual(["org_admin", "projectleider"]);
});

test("event-inzage geeft de recente activiteit terug", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Zumtobel", name: "Panos" });
  await setBrandTier(db, brandId, "tier2", "timo");
  const events = await recentAdminEvents(db, 10);
  expect(events.some((e) => e.action === "brand_tier_changed")).toBe(true);
});
