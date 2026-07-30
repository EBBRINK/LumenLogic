// Cleanup-testdata op een echte (PGlite) db. Bewijst de drie garanties:
//   • dry-run rapporteert maar wijzigt NIETS (ook geen events);
//   • --apply ruimt de Van Dijk-org + org-data + testaccounts op, zet Flos terug
//     naar tier1, in één transactie, met events (ijzeren regel 5) — en laat
//     échte data (andere org, gedeeld e-mailadres elders) met rust;
//   • idempotent: een tweede apply vindt niets en schrijft niets.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import {
  allowedEmails,
  brands,
  events,
  leads,
  memberships,
  organizations,
  projectDossiers,
  specLines,
} from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { addMembership, createOrganization } from "@/lib/repo/orgs";
import {
  BRAND_NAME,
  cleanupTestdata,
  ORG_NAME,
  planCleanup,
  TEST_EMAILS,
} from "@/scripts/cleanup-testdata";

const [CALC, PL] = TEST_EMAILS;

// Nep-Van Dijk + Flos-op-tier2, plus "echte" data die moet blijven staan:
// een andere org waar pl@ óók lid is (diens user-record mag dus niet weg).
async function seedTestdata(db: TestDb) {
  const org = await createOrganization(db, { name: ORG_NAME, actor: "seed" });
  await addMembership(db, { orgId: org.id, email: CALC, roles: ["calculator"], actor: "seed" });
  await addMembership(db, { orgId: org.id, email: PL, roles: ["projectleider"], actor: "seed" });

  const other = await createOrganization(db, { name: "Andere Installateurs BV", actor: "seed" });
  await addMembership(db, { orgId: other.id, email: PL, roles: ["org_admin"], actor: "seed" });

  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Van Dijk testdossier", orgId: org.id })
    .returning();
  await db
    .insert(specLines)
    .values({ dossierId: dossier.id, fixtureCode: "Lp301", quantity: 3 });
  await db.insert(leads).values({ orgId: org.id, dossierId: dossier.id, userEmail: CALC });

  // Beide testadressen hebben een user-record; calc@ staat ook op de allowlist.
  for (const email of TEST_EMAILS) {
    await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: email.split("@")[0], email });
  }
  await db.insert(allowedEmails).values({ email: CALC, addedBy: "seed" });

  const { brandId: flosId } = await seedBrandProduct(db, {
    brand: BRAND_NAME,
    name: "Arco",
  });
  await db
    .update(brands)
    .set({ disclosureTier: "tier2" })
    .where(eq(brands.id, flosId));

  return { orgId: org.id, otherOrgId: other.id, dossierId: dossier.id, flosId };
}

test("dry-run rapporteert de testdata maar wijzigt niets (ook geen events)", async () => {
  const db = await createTestDb();
  const { orgId, flosId } = await seedTestdata(db);
  const eventsBefore = (await db.select().from(events)).length;

  const plan = await cleanupTestdata(db); // geen apply → dry-run
  expect(plan.nothingToDo).toBe(false);
  expect(plan.org?.id).toBe(orgId);
  expect(plan.org?.memberships.map((m) => m.email).sort()).toEqual([CALC, PL]);
  expect(plan.org?.dossiers.map((d) => d.name)).toEqual(["Van Dijk testdossier"]);
  expect(plan.org?.leadCount).toBe(1);
  // pl@ is elders lid → alleen calc@ z'n user-record staat op de lijst.
  expect(plan.userRecords).toEqual([CALC]);
  expect(plan.allowlist).toEqual([CALC]);
  expect(plan.flos).toEqual([{ id: flosId, from: "tier2" }]);

  // Niets geschreven: org, users, allowlist, tier en events staan er nog exact zo.
  // 2 gezaaide test-orgs + de Brink-org die migratie 0019 in élke database aanmaakt (G31).
  expect(await db.select().from(organizations)).toHaveLength(3);
  expect(await db.select().from(user)).toHaveLength(2);
  expect(
    await db.select().from(allowedEmails).where(eq(allowedEmails.email, CALC)),
  ).toHaveLength(1);
  const [flos] = await db.select().from(brands).where(eq(brands.id, flosId));
  expect(flos.disclosureTier).toBe("tier2");
  expect((await db.select().from(events)).length).toBe(eventsBefore);
});

test("apply ruimt op, logt events en laat echte data staan; tweede apply doet niets", async () => {
  const db = await createTestDb();
  const { orgId, otherOrgId, flosId } = await seedTestdata(db);

  const plan = await cleanupTestdata(db, { apply: true, actor: "test" });
  expect(plan.nothingToDo).toBe(false);

  // Org + memberships (cascade) + dossier (cascade naar spec_lines) + lead weg.
  expect(
    await db.select().from(organizations).where(eq(organizations.id, orgId)),
  ).toHaveLength(0);
  expect(await db.select().from(memberships).where(eq(memberships.orgId, orgId))).toHaveLength(0);
  expect(await db.select().from(projectDossiers)).toHaveLength(0);
  expect(await db.select().from(specLines)).toHaveLength(0);
  expect(await db.select().from(leads)).toHaveLength(0);

  // calc@ (alleen Van Dijk) weg uit user + allowlist; pl@ blijft (lid elders).
  // De échte allowlist-rijen (gezaaid door migratie 0004) blijven onaangeroerd.
  expect(await db.select().from(user).where(eq(user.email, CALC))).toHaveLength(0);
  expect(await db.select().from(user).where(eq(user.email, PL))).toHaveLength(1);
  expect(
    await db.select().from(allowedEmails).where(eq(allowedEmails.email, CALC)),
  ).toHaveLength(0);
  expect((await db.select().from(allowedEmails)).length).toBeGreaterThan(0);

  // De andere org + pl@'s lidmaatschap daar staan onaangeroerd.
  expect(
    await db.select().from(organizations).where(eq(organizations.id, otherOrgId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(memberships).where(eq(memberships.orgId, otherOrgId)),
  ).toHaveLength(1);

  // Flos terug naar tier1.
  const [flos] = await db.select().from(brands).where(eq(brands.id, flosId));
  expect(flos.disclosureTier).toBe("tier1");

  // Events gelogd (regel 5): org_removed, user_removed (calc@), disclosure_changed.
  const all = await db.select().from(events);
  const orgRemoved = all.filter((e) => e.action === "org_removed");
  expect(orgRemoved).toHaveLength(1);
  expect(orgRemoved[0].entityId).toBe(orgId);
  expect(orgRemoved[0].payload?.memberships).toEqual(
    expect.arrayContaining([CALC, PL]),
  );
  const userRemoved = all.filter((e) => e.action === "user_removed");
  expect(userRemoved).toHaveLength(1);
  expect(userRemoved[0].payload?.email).toBe(CALC);
  const disclosure = all.filter((e) => e.action === "disclosure_changed");
  expect(disclosure).toHaveLength(1);
  expect(disclosure[0].entityId).toBe(flosId);
  expect(disclosure[0].payload).toMatchObject({ from: "tier2", to: "tier1" });

  // Idempotent: de tweede apply vindt niets en schrijft niets (ook geen events).
  const eventsAfterFirst = all.length;
  const second = await cleanupTestdata(db, { apply: true, actor: "test" });
  expect(second.nothingToDo).toBe(true);
  expect(second.org).toBeNull();
  expect(second.userRecords).toEqual([]);
  expect(second.flos).toEqual([]);
  expect((await db.select().from(events)).length).toBe(eventsAfterFirst);
  expect(await db.select().from(user).where(eq(user.email, PL))).toHaveLength(1);
});

test("planCleanup ziet ook halve restanten (org al weg, user-record nog niet)", async () => {
  const db = await createTestDb();
  // Alleen een achtergebleven user-record + allowlist-entry, geen org, geen Flos.
  await db.insert(user).values({ id: crypto.randomUUID(), name: "calc", email: CALC });
  await db.insert(allowedEmails).values({ email: CALC });

  const plan = await planCleanup(db);
  expect(plan.org).toBeNull();
  expect(plan.userRecords).toEqual([CALC]);
  expect(plan.allowlist).toEqual([CALC]);
  expect(plan.nothingToDo).toBe(false);

  await cleanupTestdata(db, { apply: true, actor: "test" });
  expect(await db.select().from(user)).toHaveLength(0);
  const after = await planCleanup(db);
  expect(after.nothingToDo).toBe(true);
});
