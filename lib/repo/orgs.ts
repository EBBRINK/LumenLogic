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

/**
 * Besluit 6 (Timo, 4 aug): een nieuwe organisatie krijgt een zinnige zetellimiet in plaats
 * van een verrassing. Vijf — genoeg voor een klein installatiebedrijf zonder dat Brink
 * meteen moet bijstellen, laag genoeg dat het een bewuste keuze blijft.
 *
 * Aanleiding: TEST 123 kreeg op productie `seat_limit = 1` zonder dat iemand dat koos, en
 * er paste dus precies één gebruiker in. Brink Licht zelf houdt `null` (onbeperkt) — dat
 * staat zo op productie en verandert niet.
 */
export const STANDAARD_ZETELS = 5;

/**
 * Een nieuwe organisatie. **Altijd `type = 'extern'`, en dat is geen parameter.**
 *
 * Besluit 3 + G42 (Timo, 4 aug): via de interface kun je uitsluitend een externe
 * organisatie aanmaken, en het type staat daarna vast. `'intern'` bestaat alleen omdat
 * migratie 0019 Brink Licht zo heeft aangemaakt. Die keuze is vermoedelijk nooit meer
 * nodig; is hij dat wél, dan is het één regel SQL — terwijl een parameter (en dus een knop
 * erboven) élke dag het risico draagt dat er per ongeluk een 'intern'-organisatie ontstaat.
 * Aan dat ene veld hangt of iemand inkoopprijzen ziet (`lib/repo/prijszicht.ts`) en of hij
 * volgens G36-regel 1 almachtig is — een per ongeluk interne klant is een prijslek.
 *
 * Daarom staat het type hier hardgecodeerd en niet als default in de kolomdefinitie: een
 * default vult alleen aan wat je vergeet mee te geven, deze regel laat het niet toe.
 *
 * `seatLimit` weggelaten = `STANDAARD_ZETELS`; expliciet `null` = onbeperkt. Wie onbeperkt
 * wil, zegt het dus hardop — vergeten valt de veilige kant op (ijzeren regel 4).
 *
 * ⚠️ Kale schrijffunctie, net als `addMembership` hieronder: hij controleert niet wíé dit
 * doet. App-code gaat via `createOrgAsActor()` in `lib/repo/authz.ts`;
 * `lib/repo/authz-deuren.test.ts` bewaakt dat (`createOrganization` staat in VERBODEN_NAMEN).
 */
export async function createOrganization(
  db: AppDb,
  input: { name: string; plan?: string; seatLimit?: number | null; actor?: string },
) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const seatLimit =
    input.seatLimit === undefined ? STANDAARD_ZETELS : input.seatLimit;
  const [row] = await db
    .insert(organizations)
    .values({
      name: input.name,
      slug: slug || "org",
      plan: input.plan ?? "trial",
      seatLimit,
      type: "extern",
    })
    .returning();
  await logEvent(db, {
    entity: "organization",
    entityId: row.id,
    action: "org_created",
    actor: input.actor,
    // Type en zetellimiet horen in het spoor: aan het eerste hangt de prijszichtbaarheid,
    // het tweede was tot nu toe een stille kolomdefault waar niemand een keuze in zag.
    payload: { name: row.name, type: row.type, seatLimit: row.seatLimit },
  });
  return row;
}

/**
 * Een organisatie weer weg. Bestaat voor één ding: de **compensatie** in
 * `createOrgAndIssuePinAsActor()` (besluit 5 — de één-klik-variant is alles-of-niets).
 *
 * ⚠️ Waarom compensatie en geen transactie. De neon-http-driver kent geen transacties
 * (`node_modules/drizzle-orm/neon-http/session.js` gooit "No transactions support") — zie
 * dezelfde beperking in `lib/repo/activation.ts`, waar de volgorde van de schrijfacties
 * daarom gekozen is op wat er overblijft als het halverwege misgaat. Alles-of-niets is
 * hier dus: de organisatie aanmaken, de PIN uitgeven, en bij een mislukking de zojuist
 * aangemaakte organisatie weer verwijderen. `memberships` hangt aan een `ON DELETE
 * CASCADE`, dus een half aangemaakt lidmaatschap gaat mee.
 *
 * Logt vóór het verwijderen en mét de naam: na de delete is niet meer te zien wát er weg
 * is — zelfde reden als bij `removeMembership` hieronder.
 */
export async function deleteOrganization(
  db: AppDb,
  orgId: string,
  actor?: string,
): Promise<void> {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return;
  await logEvent(db, {
    entity: "organization",
    entityId: row.id,
    action: "org_deleted",
    actor,
    payload: { name: row.name },
  });
  await db.delete(organizations).where(eq(organizations.id, row.id));
}

/**
 * De zetellimiet van een bestaande organisatie (besluit 7: aanpasbaar in Admin, naast de
 * organisatie in de lijst).
 *
 * Raakt bewust géén ander veld — en al helemaal niet `type`. G42: het type staat vast na
 * aanmaken, en er hoort geen enkele weg te bestaan om een organisatie van extern naar
 * intern te zetten.
 *
 * ⚠️ Kale schrijffunctie; app-code gaat via `setSeatLimitAsActor()` in `lib/repo/authz.ts`.
 */
export async function setOrgSeatLimit(
  db: AppDb,
  input: { orgId: string; seatLimit: number | null; actor?: string },
): Promise<void> {
  await db
    .update(organizations)
    .set({ seatLimit: input.seatLimit, updatedAt: new Date() })
    .where(eq(organizations.id, input.orgId));

  // Regel 5. Een zetellimiet bepaalt wie er nog bij kan; verhogen is precies de handeling
  // waarvan je achteraf wilt kunnen zien wie hem wanneer deed.
  await logEvent(db, {
    entity: "organization",
    entityId: input.orgId,
    action: "org_seat_limit_changed",
    actor: input.actor,
    payload: { seatLimit: input.seatLimit },
  });
}

/** Hoeveel leden telt deze organisatie nu? Voor de zetel-feiten in `lib/repo/authz.ts`. */
export async function countMembers(db: AppDb, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  return Number(row?.n ?? 0);
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

/**
 * Lid toevoegen of zijn rollen bijwerken. Geeft `false` terug als de organisatie **vol** is
 * (besluit 6, 4 aug: de zetellimiet is er om te controleren, niet om te tonen).
 *
 * ⚠️ DE TELLING ZIT IN DE `WHERE` VAN DE SCHRIJFACTIE, en dat is de hele reden dat deze
 * functie rauwe SQL gebruikt in plaats van de querybuilder. Lees-dan-schrijf zou hier
 * dezelfde fout zijn als de pogingenteller ooit had (`checkActivationPin` in
 * `lib/repo/activation.ts`): tussen "ik tel 4 van de 5" en de insert zit een `await`, en
 * élke gelijktijdige uitnodiging leest in dat venster dezelfde verouderde telling. Een
 * grens die alleen klopt als er niemand anders tegelijk werkt, is een suggestie.
 *
 * Drie manieren om erlangs te komen, alle drie afgedekt in dit ene statement:
 *   • de organisatie heeft geen limiet (`seat_limit is null`) → altijd toegestaan;
 *   • dit adres is al lid → geen nieuwe zetel, dus rollen bijwerken mag ook in een volle
 *     organisatie (anders zou "vergeten wachtwoord = nieuwe PIN" stuklopen op een volle org);
 *   • anders: de telling van dít moment moet onder de limiet liggen.
 *
 * ⚠️ Wat dit NIET is: een slot. Twee écht gelijktijdige statements kunnen onder READ
 * COMMITTED allebei dezelfde telling zien en allebei slagen — daarvoor zou je de org-rij
 * moeten locken, en de neon-http-driver kent geen transacties om dat in te doen. Het
 * venster is nu één statement breed in plaats van een hele request; dat is het eerlijke
 * verschil, en een limiet van 5 die in een extreem zeldzame race 6 wordt is geen prijslek.
 */
export async function addMembership(
  db: AppDb,
  input: { orgId: string; email: string; roles: MembershipRole[]; actor?: string },
): Promise<boolean> {
  const email = input.email.toLowerCase().trim();
  // Rollen als expliciet getypeerde array-literal: een lege lijst mag geen `ARRAY[]` zonder
  // cast worden (Postgres kan het type dan niet afleiden).
  const rollen = input.roles.length
    ? sql`ARRAY[${sql.join(
        input.roles.map((r) => sql`${r}`),
        sql`, `,
      )}]::membership_role[]`
    : sql`'{}'::membership_role[]`;
  const orgId = sql`${input.orgId}::uuid`;

  const res = await db.execute(sql`
    insert into memberships (org_id, email, roles)
    select ${orgId}, ${email}, ${rollen}
    where exists (
            select 1 from memberships m
            where m.org_id = ${orgId} and m.email = ${email})
       or (select seat_limit from organizations where id = ${orgId}) is null
       or (select count(*) from memberships m where m.org_id = ${orgId})
          < (select seat_limit from organizations where id = ${orgId})
    on conflict (org_id, email) do update set roles = excluded.roles
    returning id`);
  const rijen = Array.isArray(res)
    ? res
    : ((res as { rows?: unknown[] }).rows ?? []);
  // Geen rij terug = de `where` hield hem tegen = vol. Geen event: er is niets gebeurd.
  if (rijen.length === 0) return false;

  await logEvent(db, {
    entity: "organization",
    entityId: input.orgId,
    action: "membership_added",
    actor: input.actor,
    payload: { email, roles: input.roles },
  });
  return true;
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
