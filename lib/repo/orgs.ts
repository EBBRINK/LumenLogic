// Organisaties, memberships & rollen (L-03/04/05). Eén persoon kan meerdere rollen
// ("petten") in een org hebben; de rol bepaalt de default-landing, nooit wat de engine
// toont (dat is de fase). In V1 draait de Brink-binnendienst zonder org (interne dossiers);
// deze laag is de externe-uitrol-fundering.
import { and, asc, eq, sql } from "drizzle-orm";
import {
  memberships,
  organizations,
  projectDossiers,
  type MembershipRole,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export async function listOrganizations(db: AppDb) {
  return db.select().from(organizations).orderBy(asc(organizations.name));
}

export async function getOrganization(db: AppDb, id: string) {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return row ?? null;
}

export async function createOrganization(
  db: AppDb,
  input: { name: string; plan?: string; seatLimit?: number | null; actor?: string },
) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [row] = await db
    .insert(organizations)
    .values({
      name: input.name,
      slug: slug || "org",
      plan: input.plan ?? "trial",
      seatLimit: input.seatLimit ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "organization",
    entityId: row.id,
    action: "org_created",
    actor: input.actor,
    payload: { name: row.name },
  });
  return row;
}

/**
 * Branding (logo + accentkleur) op één organisatie — sprint 3.2a.
 *
 * ⚠️ Dit is een KALE schrijffunctie, net als `addMembership`/`removeMembership` hieronder:
 * hij controleert niets. App-code roept hem NOOIT rechtstreeks aan maar gaat via
 * `setBrandingAsActor()` in `lib/repo/authz.ts`; `lib/repo/authz-deuren.test.ts` bewaakt
 * dat (`setOrgBranding` staat in VERBODEN_NAMEN).
 *
 * Hij bestaat omdat `saveBrandingAction` tot 3.2a rechtstreeks `db.update(organizations)`
 * deed met alleen `requireSession()` — org A kon de branding van org B overschrijven. Dat
 * stond als BEKENDE_SCHULD vastgepind en is met deze functie plus de poort erboven gedicht.
 *
 * Lege velden worden weggelaten in plaats van als lege string opgeslagen: ontbrekende data
 * blijft eerlijk ontbreken (gedrag ongewijzigd t.o.v. de action die dit deed).
 */
export async function setOrgBranding(
  db: AppDb,
  input: {
    orgId: string;
    logoUrl?: string | null;
    accentColor?: string | null;
    actor?: string;
  },
) {
  const branding: Record<string, unknown> = {};
  const logoUrl = (input.logoUrl ?? "").trim();
  const accentColor = (input.accentColor ?? "").trim();
  if (logoUrl) branding.logoUrl = logoUrl;
  if (accentColor) branding.accentColor = accentColor;

  await db
    .update(organizations)
    .set({ branding, updatedAt: new Date() })
    .where(eq(organizations.id, input.orgId));

  // Regel 5. De branding van een organisatie wijzigen is precies het soort handeling dat
  // je achteraf wilt kunnen terugvinden — het was tot deze sprint het gat waar één org de
  // ander mee kon overschrijven, en dat gebeurde zonder enig spoor.
  await logEvent(db, {
    entity: "organization",
    entityId: input.orgId,
    action: "org_branding_changed",
    actor: input.actor,
    payload: { keys: Object.keys(branding) },
  });
}

export async function listMemberships(db: AppDb, orgId: string) {
  return db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(memberships.email));
}

// Alle orgs + rollen van één persoon (op e-mail).
export async function getUserMemberships(db: AppDb, email: string) {
  return db
    .select({
      orgId: memberships.orgId,
      orgName: organizations.name,
      roles: memberships.roles,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.email, email.toLowerCase().trim()));
}

export async function addMembership(
  db: AppDb,
  input: { orgId: string; email: string; roles: MembershipRole[]; actor?: string },
) {
  const email = input.email.toLowerCase().trim();
  await db
    .insert(memberships)
    .values({ orgId: input.orgId, email, roles: input.roles })
    .onConflictDoUpdate({
      target: [memberships.orgId, memberships.email],
      set: { roles: input.roles },
    });
  await logEvent(db, {
    entity: "organization",
    entityId: input.orgId,
    action: "membership_added",
    actor: input.actor,
    payload: { email, roles: input.roles },
  });
}

// Spiegel van addMembership: destructief, dus loggen VÓÓR deleten en mét de rollen
// die het lid had — anders is na het verwijderen niet meer te zien wát er weg is.
export async function removeMembership(
  db: AppDb,
  orgId: string,
  email: string,
  actor?: string,
) {
  const normalized = email.toLowerCase().trim();
  const where = and(
    eq(memberships.orgId, orgId),
    eq(memberships.email, normalized),
  );
  const [row] = await db.select().from(memberships).where(where).limit(1);
  if (!row) return;
  await logEvent(db, {
    entity: "organization",
    entityId: orgId,
    action: "membership_removed",
    actor,
    payload: { email: normalized, roles: row.roles },
  });
  await db.delete(memberships).where(where);
}

// A-05 / org-scoping: dossier aan een org koppelen.
export async function setDossierOrg(
  db: AppDb,
  dossierId: string,
  orgId: string | null,
) {
  await db
    .update(projectDossiers)
    .set({ orgId, updatedAt: new Date() })
    .where(eq(projectDossiers.id, dossierId));
}

// §6: rol bepaalt de default-landing. Meerdere petten → de meest werk-specifieke wint.
// Brink-intern (geen org/rol) landt op de dossierlijst.
export function defaultLandingForRoles(
  roles: MembershipRole[] | null | undefined,
): "regels" | "werkvoorbereiding" | "armaturenboek" | "instellingen" | "dossiers" {
  const r = new Set(roles ?? []);
  if (r.has("calculator")) return "regels";
  if (r.has("werkvoorbereider")) return "werkvoorbereiding";
  if (r.has("projectleider")) return "armaturenboek";
  if (r.has("org_admin")) return "instellingen";
  return "dossiers";
}

// Heeft deze persoon een bepaalde rol in een org?
export async function hasRole(
  db: AppDb,
  email: string,
  role: MembershipRole,
): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.email, email.toLowerCase().trim()),
        sql`${role} = ANY(${memberships.roles})`,
      ),
    )
    .limit(1);
  return !!row;
}
