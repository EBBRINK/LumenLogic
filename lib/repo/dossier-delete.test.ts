// Projecten verwijderen (goal-projecten-verwijderen): onomkeerbaar, gecascadeerd, gelogd.
//
// Wat deze test pint:
//   • de cascade is écht een cascade — regels, kandidaten, quotes en import runs zijn weg;
//   • leads worden LOSGEKOPPELD, niet verwijderd (commercieel spoor overleeft het project);
//   • ijzeren regel 5: per verwijderd project precies één event, mét actor en de volledige
//     dossierrij van vóór de verwijdering (zelfde eis als lib/repo/dossiers-delete.test.ts);
//   • scoping: een id buiten de scope wordt overgeslagen zonder event — geen schrijven in
//     het project van een ander bedrijf (zelfde gat dat bewaakProject dichtte);
//   • rechten: extern zonder org-admin wordt geweigerd, org-admin van de eigen org mag,
//     projecten zonder org zijn alleen voor intern.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  events,
  importRuns,
  leads,
  organizations,
  quotes,
  specLines,
} from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { addSpecLines, createDossier } from "@/lib/repo/dossiers";
import { toegangScope, type Toegang } from "@/lib/repo/toegang";
import { deleteDossiers, getDossierDeleteImpact } from "@/lib/repo/dossier-delete";

const ACTOR = "eduard@brinklicht.nl";

const intern: Toegang = {
  soort: "intern",
  email: ACTOR,
  orgIds: [],
  adminOrgIds: [],
  primaireOrgId: null,
};

function externeToegang(orgId: string, admin: boolean): Toegang {
  return {
    soort: "extern",
    email: "iemand@klant.nl",
    orgIds: [orgId],
    adminOrgIds: admin ? [orgId] : [],
    primaireOrgId: orgId,
  };
}

async function dossierMetInhoud(db: Awaited<ReturnType<typeof createTestDb>>) {
  const dossier = await createDossier(db, { orgId: null, name: "Testproject d" });
  const [line] = await addSpecLines(db, dossier.id, [
    { fixtureCode: "Lp001", quantity: 4, source: "pdf" },
  ]);
  await db.insert(quotes).values({ dossierId: dossier.id });
  await db
    .insert(importRuns)
    .values({ dossierId: dossier.id, source: "pdf", rows: [] });
  return { dossier, line };
}

test("deleteDossiers: cascade weg, lead losgekoppeld, één event met actor en volledige rij", async () => {
  const db = await createTestDb();
  const { dossier, line } = await dossierMetInhoud(db);
  const [lead] = await db
    .insert(leads)
    .values({ dossierId: dossier.id, note: "belafspraak" })
    .returning();

  const impact = await getDossierDeleteImpact(db, toegangScope(intern), [dossier.id]);
  expect(impact[dossier.id]).toMatchObject({
    specLines: 1,
    quotes: 1,
    importRuns: 1,
    leads: 1,
  });

  const result = await deleteDossiers(db, intern, [dossier.id], ACTOR);
  expect(result).toMatchObject({ deleted: 1, skipped: 0 });

  // Alles onder het project is écht weg. (spec_line_candidates hangt met eigen
  // ON DELETE CASCADE aan spec_lines en gaat daarin mee — een kandidaat opzetten
  // vergt een volledig product en dat bewijst hier niets extra's.)
  for (const [tabel, kolom, id] of [
    [specLines, specLines.id, line.id],
    [quotes, quotes.dossierId, dossier.id],
    [importRuns, importRuns.dossierId, dossier.id],
  ] as const) {
    expect(await db.select().from(tabel).where(eq(kolom, id))).toHaveLength(0);
  }

  // De lead bestaat nog, maar wijst nergens meer heen.
  const [leadNa] = await db.select().from(leads).where(eq(leads.id, lead.id));
  expect(leadNa).toBeTruthy();
  expect(leadNa.dossierId).toBeNull();

  // IJzeren regel 5: precies één spoor, mét actor en de volledige rij van vóór de delete.
  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "dossier_deleted"));
  expect(gelogd).toHaveLength(1);
  const [evt] = gelogd;
  expect(evt.entity).toBe("dossier");
  expect(evt.entityId).toBe(dossier.id);
  expect(evt.actor).toBe(ACTOR);
  const payload = evt.payload as {
    dossier?: Record<string, unknown>;
    cascaded?: Record<string, number>;
    leadsDetached?: number;
  };
  expect(payload.dossier?.name).toBe("Testproject d");
  for (const [kolom, waarde] of Object.entries(dossier)) {
    const verwacht = waarde instanceof Date ? waarde.toISOString() : waarde;
    expect(payload.dossier![kolom]).toEqual(verwacht);
  }
  expect(payload.cascaded).toMatchObject({ specLines: 1, quotes: 1, importRuns: 1 });
  expect(payload.leadsDetached).toBe(1);
});

test("deleteDossiers: buiten de scope = overgeslagen, geen delete en geen event", async () => {
  const db = await createTestDb();
  const [orgA] = await db
    .insert(organizations)
    .values({ name: "Klant A", slug: "klant-a", type: "extern" })
    .returning();
  const [orgB] = await db
    .insert(organizations)
    .values({ name: "Klant B", slug: "klant-b", type: "extern" })
    .returning();
  const vanB = await createDossier(db, { orgId: orgB.id, name: "Project van B" });

  const toegangA = externeToegang(orgA.id, true);
  const result = await deleteDossiers(db, toegangA, [vanB.id], "iemand@klant.nl");
  expect(result).toMatchObject({ deleted: 0, skipped: 1 });
  expect(
    await db.select().from(events).where(eq(events.action, "dossier_deleted")),
  ).toHaveLength(0);
  expect(await db.select().from(specLines)).toHaveLength(0);
  // Het project van B staat er nog.
  const impact = await getDossierDeleteImpact(db, toegangScope(intern), [vanB.id]);
  expect(impact[vanB.id]).toBeTruthy();
});

test("deleteDossiers: extern zonder org-admin geweigerd; mét org-admin mag de eigen org", async () => {
  const db = await createTestDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Klant A", slug: "klant-a", type: "extern" })
    .returning();
  const eigen = await createDossier(db, { orgId: org.id, name: "Eigen project" });

  const zonderAdmin = await deleteDossiers(
    db,
    externeToegang(org.id, false),
    [eigen.id],
    "iemand@klant.nl",
  );
  expect(zonderAdmin).toMatchObject({ deleted: 0, skipped: 1 });

  const metAdmin = await deleteDossiers(
    db,
    externeToegang(org.id, true),
    [eigen.id],
    "iemand@klant.nl",
  );
  expect(metAdmin).toMatchObject({ deleted: 1, skipped: 0 });
});

test("deleteDossiers: project zonder org is alleen voor intern; tweede delete logt niets", async () => {
  const db = await createTestDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Klant A", slug: "klant-a", type: "extern" })
    .returning();
  const zonderOrg = await createDossier(db, { orgId: null, name: "Zwevend" });

  // Extern org-admin ziet hem niet eens (scope), laat staan verwijderen.
  const extern = await deleteDossiers(
    db,
    externeToegang(org.id, true),
    [zonderOrg.id],
    "iemand@klant.nl",
  );
  expect(extern).toMatchObject({ deleted: 0, skipped: 1 });

  await deleteDossiers(db, intern, [zonderOrg.id], ACTOR);
  // Nogmaals dezelfde id: geen event over een handeling die niet gebeurde.
  await deleteDossiers(db, intern, [zonderOrg.id], ACTOR);
  expect(
    await db.select().from(events).where(eq(events.action, "dossier_deleted")),
  ).toHaveLength(1);
});
