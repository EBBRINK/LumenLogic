"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, type MembershipRole } from "@/db/schema";
import { changeMembershipAsActor } from "@/lib/repo/authz";
import { createOrganization } from "@/lib/repo/orgs";
import { getActor, requireSession } from "@/lib/session";

const PAGE = "/settings/organization";

const VALID_ROLES: MembershipRole[] = [
  "calculator",
  "werkvoorbereider",
  "projectleider",
  "org_admin",
];

// ORG: een nieuwe organisatie. Naam is verplicht; plan en zetellimiet optioneel.
// Een lege/ongeldige zetellimiet betekent onbeperkt (null).
export async function createOrgAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const plan = String(formData.get("plan") ?? "").trim() || undefined;
  const seatRaw = String(formData.get("seatLimit") ?? "").trim();
  const seat = seatRaw === "" ? NaN : Number(seatRaw);
  const seatLimit =
    Number.isFinite(seat) && seat > 0 ? Math.floor(seat) : null;
  await createOrganization(db, {
    name,
    plan,
    seatLimit,
    actor: await getActor(),
  });
  revalidatePath(PAGE);
}

// LID: e-mail + gekozen petten. Onbekende rolwaarden worden weggefilterd (fail-safe);
// een lid zonder aangevinkte rol mag — dat is een eerlijk "geen rol", geen fout.
//
// ⚠️ Besluiten G36/G39. Dit is de TWEEDE deur naar precies dezelfde beslissing als het
// PIN-scherm: hier ontstaat een lidmaatschap mét rollen. Tot deze ronde stond hij open —
// alleen `requireSession()`, org en rollen rechtstreeks uit het formulier — en daarmee was
// de poort op het PIN-scherm zinloos: een gewone gebruiker zette zichzelf hier in de org met
// type 'intern' en was daarna volgens G36-regel 1 almachtig (gemeten door de critic, ronde
// 2). Beide deuren leunen nu op dezelfde regels in lib/repo/authz.ts; wie mag wat wordt
// dáár, op het moment van schrijven, uit de sessie en de database afgeleid.
//
// Een weigering is hier stil: dit is een `<form action={…}>` zonder retourkanaal, dus
// hetzelfde gedrag als bij een lege invoer hierboven. De weigering staat wél in de
// events-tabel (regel 5), en de UI toont een org_admin de knoppen sowieso niet.
export async function addMemberAction(formData: FormData) {
  const session = await requireSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orgId || !email) return;
  const roles = formData
    .getAll("roles")
    .map((r) => String(r))
    .filter((r): r is MembershipRole =>
      (VALID_ROLES as string[]).includes(r),
    );
  await changeMembershipAsActor(db, {
    actorEmail: session.user?.email,
    orgId,
    email,
    roles,
    operation: "set",
  });
  revalidatePath(PAGE);
}

// LID: verwijderen. De repo normaliseert het adres; buiten de org valt niets te wissen.
// Zelfde poort als hierboven (G36/G39): een org_admin kan alleen zijn eigen leden
// verwijderen en nooit een collega-beheerder of zichzelf — dat laatste zou een organisatie
// zonder beheerder achterlaten.
export async function removeMemberAction(formData: FormData) {
  const session = await requireSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orgId || !email) return;
  // De actor die main aan removeMembership meegeeft (voor het events-spoor) komt hier
  // uit de autorisatielaag zelf: die stelt de bevoegdheid vast en geeft daarna het
  // vastgestelde adres door aan removeMembership. Zo blijft het spoor compleet zónder
  // dat deze action nog een tweede keer een actor uit de sessie plukt.
  await changeMembershipAsActor(db, {
    actorEmail: session.user?.email,
    orgId,
    email,
    operation: "remove",
  });
  revalidatePath(PAGE);
}

// BRANDING: logo-URL + accentkleur op de organisatie. Lege velden worden weggelaten in
// plaats van als lege string opgeslagen (ontbrekende data blijft eerlijk ontbreken).
// Geen repo-helper in de gedeelde laag → directe, gerichte update op deze ene org.
export async function saveBrandingAction(formData: FormData) {
  await requireSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  if (!orgId) return;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  const branding: Record<string, unknown> = {};
  if (logoUrl) branding.logoUrl = logoUrl;
  if (accentColor) branding.accentColor = accentColor;
  await db
    .update(organizations)
    .set({ branding, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
  revalidatePath(PAGE);
}
