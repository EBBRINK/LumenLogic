// Opruimscript voor demo-testdata (docs/plan-aanvraag-estimate.md, stap 2):
//   • organisatie "Van Dijk Elektro" + org-gescoopte data (dossiers incl. cascade,
//     leads) + memberships (cascade) — puur testdossiers, dus verwijderen;
//   • user-records + allowlist-entries van calc@vandijk.nl / pl@vandijk.nl, maar
//     alléén als het adres nergens anders lid is (echte accounts blijven staan);
//   • merk "Flos" terug naar disclosure tier-1 (stond als demo op tier-2).
//
// Dry-run is default: rapporteert wat er ZOU gebeuren zonder te schrijven.
// `--apply` voert uit, in één transactie, en logt events (ijzeren regel 5).
// Idempotent: een tweede run vindt niets en zegt dat.
//
// De kernlogica (planCleanup/cleanupTestdata) krijgt de db geïnjecteerd zodat de
// test hem op PGlite draait; de CLI-wrapper onderaan verbindt met Neon.
import { and, eq, inArray, ne, or, type SQL } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import {
  allowedEmails,
  brands,
  leads,
  memberships,
  organizations,
  projectDossiers,
} from "@/db/schema";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";

export const ORG_NAME = "Van Dijk Elektro";
export const TEST_EMAILS = ["calc@vandijk.nl", "pl@vandijk.nl"];
export const BRAND_NAME = "Flos";

export type CleanupPlan = {
  org: {
    id: string;
    name: string;
    memberships: { email: string; roles: string[] }[];
    dossiers: { id: string; name: string }[];
    leadCount: number;
  } | null;
  // e-mails (uit TEST_EMAILS) waarvan het user-record weg kan/gaat — alleen als
  // het adres geen lidmaatschap in een ándere org heeft.
  userRecords: string[];
  // idem voor allowed_emails-entries (hoort er niet te staan; testdata kan niet inloggen).
  allowlist: string[];
  // merken met exact de naam "Flos" die níét op tier1 staan (naam is niet uniek).
  flos: { id: string; from: string }[];
  nothingToDo: boolean;
};

// Alleen lezen: wat is er (nog) aan testdata?
export async function planCleanup(db: AppDb): Promise<CleanupPlan> {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.name, ORG_NAME))
    .limit(1);

  let orgPlan: CleanupPlan["org"] = null;
  if (org) {
    const members = await db
      .select({ email: memberships.email, roles: memberships.roles })
      .from(memberships)
      .where(eq(memberships.orgId, org.id));
    const dossiers = await db
      .select({ id: projectDossiers.id, name: projectDossiers.name })
      .from(projectDossiers)
      .where(eq(projectDossiers.orgId, org.id));
    const leadRows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(orgLeadFilter(org.id, dossiers.map((d) => d.id)));
    orgPlan = {
      id: org.id,
      name: org.name,
      memberships: members,
      dossiers,
      leadCount: leadRows.length,
    };
  }

  // User-records/allowlist los van de org checken: ook na een half gelukte run
  // (org al weg, records nog niet) ruimt een volgende run ze alsnog op.
  const userRecords: string[] = [];
  const allowlist: string[] = [];
  for (const email of TEST_EMAILS) {
    const elsewhere = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        org
          ? and(eq(memberships.email, email), ne(memberships.orgId, org.id))
          : eq(memberships.email, email),
      )
      .limit(1);
    if (elsewhere.length > 0) continue; // adres bestaat óók buiten deze org → blijven
    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (u) userRecords.push(email);
    const [a] = await db
      .select({ email: allowedEmails.email })
      .from(allowedEmails)
      .where(eq(allowedEmails.email, email))
      .limit(1);
    if (a) allowlist.push(email);
  }

  const flos = (
    await db
      .select({ id: brands.id, from: brands.disclosureTier })
      .from(brands)
      .where(and(eq(brands.name, BRAND_NAME), ne(brands.disclosureTier, "tier1")))
  ).map((b) => ({ id: b.id, from: b.from as string }));

  return {
    org: orgPlan,
    userRecords,
    allowlist,
    flos,
    nothingToDo:
      !orgPlan && userRecords.length === 0 && allowlist.length === 0 && flos.length === 0,
  };
}

// leads.org_id en leads.dossier_id hebben géén ON DELETE — ze zouden de org/dossier-
// delete blokkeren, dus eerst zelf weg (het zijn test-leads van de test-org).
function orgLeadFilter(orgId: string, dossierIds: string[]): SQL | undefined {
  return dossierIds.length > 0
    ? or(eq(leads.orgId, orgId), inArray(leads.dossierId, dossierIds))
    : eq(leads.orgId, orgId);
}

// Dry-run (default) rapporteert alleen; met apply=true schrijft hij — in één transactie.
export async function cleanupTestdata(
  db: AppDb,
  opts: { apply?: boolean; actor?: string } = {},
): Promise<CleanupPlan> {
  const plan = await planCleanup(db);
  if (!opts.apply || plan.nothingToDo) return plan;
  const actor = opts.actor ?? "cleanup-testdata";

  await db.transaction(async (tx) => {
    if (plan.org) {
      const { id: orgId, dossiers } = plan.org;
      await tx.delete(leads).where(orgLeadFilter(orgId, dossiers.map((d) => d.id)));
      // Dossier-delete cascadet naar spec_lines (+kandidaten), import_runs, quotes
      // (+quote_lines), xis_exports, armaturenboek_versions en substitution_proposals.
      if (dossiers.length > 0) {
        await tx
          .delete(projectDossiers)
          .where(inArray(projectDossiers.id, dossiers.map((d) => d.id)));
      }
      // Org-delete cascadet naar memberships.
      await tx.delete(organizations).where(eq(organizations.id, orgId));
      await logEvent(tx, {
        entity: "organization",
        entityId: orgId,
        action: "org_removed",
        actor,
        payload: {
          name: plan.org.name,
          memberships: plan.org.memberships.map((m) => m.email),
          dossiers: dossiers.map((d) => d.name),
          leads: plan.org.leadCount,
          reason: "cleanup-testdata",
        },
      });
    }

    for (const email of plan.userRecords) {
      // session/account cascaden mee (Better Auth-schema).
      await tx.delete(user).where(eq(user.email, email));
      // user.id is text (geen uuid) → e-mail in de payload, entityId leeg.
      await logEvent(tx, {
        entity: "user",
        action: "user_removed",
        actor,
        payload: { email, reason: "cleanup-testdata" },
      });
    }
    if (plan.allowlist.length > 0) {
      await tx.delete(allowedEmails).where(inArray(allowedEmails.email, plan.allowlist));
    }

    for (const b of plan.flos) {
      await tx
        .update(brands)
        .set({ disclosureTier: "tier1", updatedAt: new Date() })
        .where(eq(brands.id, b.id));
      await logEvent(tx, {
        entity: "brand",
        entityId: b.id,
        action: "disclosure_changed",
        actor,
        payload: { brand: BRAND_NAME, from: b.from, to: "tier1", reason: "cleanup-testdata" },
      });
    }
  });

  return plan;
}

// ── CLI-wrapper (niet actief bij import in tests) ────────────────────────────
function printPlan(plan: CleanupPlan, applied: boolean) {
  if (plan.nothingToDo) {
    console.log("Niets te doen — de testdata is al opgeruimd.");
    return;
  }
  const verb = applied ? "verwijderd" : "wordt verwijderd";
  if (plan.org) {
    console.log(`Organisatie "${plan.org.name}" (${plan.org.id}) ${verb}, inclusief:`);
    console.log(
      `  • ${plan.org.memberships.length} lidmaatschap(pen): ${
        plan.org.memberships.map((m) => `${m.email} [${m.roles.join(", ")}]`).join("; ") || "—"
      }`,
    );
    console.log(
      `  • ${plan.org.dossiers.length} dossier(s): ${
        plan.org.dossiers.map((d) => `"${d.name}"`).join(", ") || "—"
      }`,
    );
    console.log(`  • ${plan.org.leadCount} lead(s)`);
  } else {
    console.log(`Organisatie "${ORG_NAME}": niet (meer) gevonden.`);
  }
  console.log(
    `User-record(s) ${verb}: ${plan.userRecords.join(", ") || "geen"} · allowlist: ${
      plan.allowlist.join(", ") || "geen"
    }`,
  );
  if (plan.flos.length > 0) {
    for (const b of plan.flos)
      console.log(`Merk "${BRAND_NAME}" (${b.id}): ${b.from} → tier1${applied ? "" : " (nog niet)"}`);
  } else {
    console.log(`Merk "${BRAND_NAME}": staat al op tier1 (of bestaat niet).`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ontbreekt — zie .env.local");

  // Bewust de websocket-driver i.p.v. db/client.ts (neon-http): --apply moet in
  // één transactie en neon-http ondersteunt geen transacties. Dynamische import
  // zodat de test (browser/PGlite) deze modules nooit laadt.
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const schema = await import("@/db/schema");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    const plan = await cleanupTestdata(db, { apply, actor: "cleanup-testdata-cli" });
    if (!apply) console.log("Dry-run — er is NIETS gewijzigd. Draai met --apply om uit te voeren.\n");
    printPlan(plan, apply);
    if (apply && !plan.nothingToDo)
      console.log("\nKlaar — uitgevoerd in één transactie, events gelogd.");
  } finally {
    await pool.end();
  }
}

// Alleen draaien als dit bestand zélf gestart is (bun scripts/cleanup-testdata.ts),
// niet wanneer de test de kernfuncties importeert (browser: process.argv ontbreekt).
const invokedAsScript =
  typeof process !== "undefined" && !!process.argv?.[1]?.endsWith("cleanup-testdata.ts");
if (invokedAsScript) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
