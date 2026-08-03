// Wie mag lidmaatschappen en activatie-PIN's uitdelen — besluiten G36 en G39.
//
// G36 (Timo, 30 jul 2026) letterlijk, en `decideMembershipAuthority()` hieronder is niets
// anders dan deze drie regels:
//   1. INTERN mag alles. "Intern" = een membership in een organisatie met
//      organizations.type = 'intern' (G31: het inlogtype hoort bij de org, niet bij de
//      persoon). Elke rol binnen die org telt, ook géén rol.
//   2. Een ORG_ADMIN mag alleen binnen zijn eigen organisatie(s), en mag de org_admin-rol
//      niet toekennen.
//   3. Wie geen van beide is, mag NIETS. Dat is ook de val-terug: onbekende actor, actor
//      zonder membership, of een adres dat we niet kunnen normaliseren → geweigerd.
// Plus de eerste zin van G36 — "wie van Brink een PIN krijgt, is org_admin van zijn eigen
// organisatie" — als bootstrap-regel in `bootstrapRoles()`.
//
// ⚠️ G39 (Timo, 30 jul 2026) bepaalt de VORM, en dat is een correctie op de eerste versie
// van dit bestand. Die gaf de aanroeper een "grant"-object mee dat de schrijffunctie dan
// controleerde. Een critic brak dat open met één object-spread (symbool-sleutels worden
// meegekopieerd). De les is niet "gebruik een beter merk" maar: **een token dat de
// aanroeper draagt is nooit een autorisatiemechanisme** — het is opnieuw te gebruiken, het
// overleeft de rol van degene die het kreeg, en de volgende lezer moet bewijzen dat er geen
// vijfde manier is om er een te maken. Daarom:
//
//   • Autoriseren en schrijven zitten in ÉÉN aanroep (`issuePinAsActor`,
//     `changeMembershipAsActor`). Er is geen tussenproduct dat je kunt bewaren, kopiëren of
//     ergens anders opnieuw indienen.
//   • Het enige wat de aanroeper over zichzelf meegeeft is `actorEmail`, en dat komt uit de
//     sessie (`requireSession()` in de server action) — nooit uit het formulier. Alle
//     rechten worden dáár vers uit de database bij gezocht: in welke org zit hij, met welke
//     rollen, wat voor type org is dat. Niets van wat de aanroeper meestuurt weegt mee in
//     het antwoord "mag hij dit"; het bepaalt alleen de vraag (welk adres, welke org,
//     welke rollen).
//   • `decidePinIssue()` / `decideMembershipChange()` blijven puur: geen database, dus
//     uitputtend testbaar en op één scherm leesbaar.
//
// ⚠️ TWEE DEUREN, ÉÉN REGEL. Een lidmaatschap mét rollen kan langs twee kanten ontstaan:
// het PIN-scherm (`app/admin/users`) en het organisatiescherm (`app/settings/organization`).
// Dat zijn niet twee besluiten maar één, dus ze delen `decideMembershipAuthority()`. De
// eerste ronde van dit item liet de tweede deur open: een gewone gebruiker zette zichzelf
// via `addMemberAction` in de interne org en was daarna volgens regel 1 almachtig.
// `lib/repo/authz-deuren.test.ts` bewaakt dat er geen derde deur bijkomt.
//
// Wat deze laag NIET doet: routes bewaken of "extern ziet alleen eigen spullen" afdwingen.
// Dat is item 3.2a. Deze laag gaat over wie wat mag SCHRIJVEN.
import { eq, inArray, sql } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import { memberships, organizations, type MembershipRole } from "@/db/schema";
import { issueActivationPin, type IssuedPin } from "./activation";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { addMembership, removeMembership, setOrgBranding } from "./orgs";

// Overal in dit project worden adressen zo genormaliseerd (zie lib/repo/activation.ts).
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// organizations.id is een uuid-kolom. Een orgId die er niet als uuid uitziet laat Postgres
// gooien ("invalid input syntax for type uuid") — en dan zou een onbevoegde aanvraag een
// hárde fout opleveren waar dezelfde aanvraag met een bestaande org een nette weigering
// geeft. Dat verschil is zelf informatie. Vorm eerst toetsen, dan pas de database.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De drie takken van G36, als type. Wie de actor is bepaalt wélke regels gelden. */
export type OrgAuthority =
  /** Regel 1 — lid van een organisatie met type 'intern'. Mag alles. */
  | { kind: "intern"; email: string }
  /** Regel 2 — org_admin in één of meer eigen organisaties. Alleen daarbinnen. */
  | { kind: "org_admin"; email: string; orgIds: string[] }
  /** Regel 3 — al het overige, inclusief "onbekend". Mag niets. */
  | { kind: "geen"; email: string };

/** Wat we van het DOELadres moeten weten om regel 2 te kunnen toepassen. */
export type TargetFacts = {
  /** Genormaliseerd. */
  email: string;
  /** Bestaat er al een user-rij (ongeacht memberships)? */
  hasAccount: boolean;
  memberships: { orgId: string; roles: MembershipRole[] }[];
};

/** Wat we van de gevraagde organisatie moeten weten. */
export type OrgFacts = {
  id: string;
  /** Heeft deze org al iemand met de org_admin-rol? Zie bootstrapRoles(). */
  hasOrgAdmin: boolean;
};

/**
 * Waarom het geweigerd is. Uitsluitend voor de events-tabel (regel 5) en voor tests —
 * NOOIT voor het scherm: de reden zegt of een adres of organisatie bestaat.
 */
export type DenyReason =
  | "ongeldig_adres"
  | "geen_uitgever" // regel 3: geen intern, geen org_admin
  | "vreemde_org" // regel 2: een org die niet van hem is
  | "onbekende_org"
  | "org_admin_rol" // regel 2: org_admin toekennen mag hij niet
  | "vreemd_doeladres" // regel 2: iemand die niet (alleen) van zijn org is
  | "doel_is_org_admin" // regel 2: een collega-beheerder overnemen mag niet
  | "geen_org" // regel 2: nieuw adres zonder organisatie
  | "rollen_zonder_org"; // rollen gevraagd zonder org — daar wordt niets van geschreven

export type Denial = { allowed: false; reason: DenyReason; message: string };

// Eén tekst voor élke weigering die met bevoegdheid te maken heeft. Wie niet mag, mag ook
// niet uit de foutmelding afleiden óf dit adres bestaat, óf het al bij een organisatie
// hoort, óf die organisatie bestaat — dat zijn precies de vragen die een aanvaller heeft.
// Zelfde principe als de magic-link-poort in lib/auth.ts en checkActivationPin().
const MSG_DENIED =
  "You can't issue a PIN here. Ask Brink if you think you should be able to.";
// Deze twee gaan over de INVOER van iemand die wél bevoegd is, niet over het bestaan van
// iets dat hij niet mag zien: een vormloos adres is zichtbaar in zijn eigen formulier, en
// een interne actor mag alle organisaties sowieso zien (hij kiest ze uit een lijst).
const MSG_INVALID_EMAIL = "Enter a valid email address.";
const MSG_UNKNOWN_ORG =
  "That organization no longer exists — refresh the page and try again.";
const MSG_ROLES_NEED_ORG = "Pick an organization for those roles.";

function deny(reason: DenyReason, message: string): Denial {
  return { allowed: false, reason, message };
}

function uniqueRoles(roles: readonly MembershipRole[] | undefined): MembershipRole[] {
  return [...new Set(roles ?? [])];
}

// ── De kern: de drie regels, op één plek ───────────────────────────────────────

/**
 * Mag deze actor dit lidmaatschap aanraken — in deze organisatie, met deze rollen?
 * Puur, zonder database: dit is de plek waar je G36 kunt lézen, en de plek die een test kan
 * uitputten. Beide deuren (PIN-uitgifte en het organisatiescherm) lopen hierdoorheen.
 *
 * `orgId` is wat de aanroeper vroeg; `org` zijn de feiten daarover. `orgId !== null` met
 * `org === null` betekent dus: die organisatie bestaat niet (meer).
 */
export function decideMembershipAuthority(input: {
  authority: OrgAuthority;
  target: TargetFacts;
  orgId: string | null;
  org: OrgFacts | null;
  roles: readonly MembershipRole[];
}): { allowed: true } | Denial {
  const { authority, target, orgId, org } = input;
  const roles = uniqueRoles(input.roles);

  // Regel 3 eerst: default-deny. Wie niets mag, krijgt geen enkele andere melding — ook
  // geen "ongeldig adres", want dat is al informatie over zijn eigen poging.
  if (authority.kind === "geen") return deny("geen_uitgever", MSG_DENIED);

  const email = normalizeEmail(target.email);
  if (!email || !email.includes("@")) {
    return deny("ongeldig_adres", MSG_INVALID_EMAIL);
  }

  // Regel 1: intern mag alles — elke org, elke rol, elk doeladres.
  if (authority.kind === "intern") {
    if (orgId !== null && org === null) {
      return deny("onbekende_org", MSG_UNKNOWN_ORG);
    }
    return { allowed: true };
  }

  // Regel 2: org_admin. Alles hieronder is een weigering met dezelfde neutrale tekst.
  const eigenOrgs = new Set(authority.orgIds);

  // 2a. De org_admin-rol toekennen mag hij niet — G36's tweede zin. De hele handeling
  //     sneuvelt (geen account, geen membership, geen PIN): stil de rol weglaten zou hem
  //     laten geloven dat hij een beheerder heeft aangemaakt.
  if (roles.includes("org_admin")) return deny("org_admin_rol", MSG_DENIED);

  // 2b. Alleen zijn eigen organisatie(s).
  if (orgId !== null) {
    if (!eigenOrgs.has(orgId)) return deny("vreemde_org", MSG_DENIED);
    if (org === null) return deny("onbekende_org", MSG_DENIED);
  }

  // 2c. En alleen zijn eigen mensen. Een PIN is een wachtwoordreset en een membership is
  //     toegang: mag hij een adres aanraken dat óók (of alleen) elders lid is, dan trekt
  //     hij een account van een andere organisatie naar zich toe.
  if (target.memberships.some((m) => !eigenOrgs.has(m.orgId))) {
    return deny("vreemd_doeladres", MSG_DENIED);
  }
  //     Een collega-beheerder (of hijzelf) overnemen of verwijderen mag ook niet — dat is
  //     een zijwaartse stap naar een account met meer rechten dan hij mag uitdelen.
  if (target.memberships.some((m) => m.roles.includes("org_admin"))) {
    return deny("doel_is_org_admin", MSG_DENIED);
  }
  if (target.memberships.length === 0) {
    // Nieuw persoon. Alleen als het systeem dit adres nog helemaal niet kent: een bestaand
    // account zónder membership is niet "zijn" account (het kan een Brink-account zijn
    // waarvan het lidmaatschap is ingetrokken).
    if (target.hasAccount) return deny("vreemd_doeladres", MSG_DENIED);
    // En alleen mét organisatie. Zonder org zou hij een los account aanmaken dat nergens
    // bij hoort — en dat hij daarna zelf niet meer kan beheren.
    if (orgId === null) return deny("geen_org", MSG_DENIED);
  }

  return { allowed: true };
}

/**
 * G36, eerste zin: "wie van Brink een PIN krijgt, is org_admin van zijn eigen organisatie."
 * Heeft de gekozen organisatie nog geen enkele org_admin, dan krijgt deze eerste persoon
 * die rol erbij — ook als het vinkje uit stond. Alleen op het interne PIN-pad aangeroepen;
 * een org_admin komt hier per constructie nooit langs (zie decidePinIssue), zodat regel 2
 * niet afhangt van de vraag of zijn eigen org toevallig al een beheerder heeft.
 */
function bootstrapRoles(
  roles: MembershipRole[],
  org: OrgFacts | null,
): MembershipRole[] {
  if (!org || org.hasOrgAdmin || roles.includes("org_admin")) return roles;
  return [...roles, "org_admin"];
}

/** Wat er mag gebeuren als het mag: het besluit draagt de UITKOMST, niet het verzoek. */
export type Verdict =
  | {
      allowed: true;
      /** Genormaliseerd doeladres. */
      email: string;
      orgId: string | null;
      /** Wat er daadwerkelijk wordt toegekend — kan de bootstrap-rol bevatten. */
      roles: MembershipRole[];
    }
  | Denial;

/** De PIN-deur, puur: de kern hierboven + de bootstrap-rol uit G36's eerste zin. */
export function decidePinIssue(input: {
  authority: OrgAuthority;
  target: TargetFacts;
  orgId: string | null;
  org: OrgFacts | null;
  roles?: readonly MembershipRole[];
}): Verdict {
  const roles = uniqueRoles(input.roles);
  const kern = decideMembershipAuthority({ ...input, roles });
  if (!kern.allowed) return kern;

  // Rollen zonder organisatie: weigeren, niet stil weglaten. Zonder orgId schrijft
  // issueActivationPin géén membership (lib/repo/activation.ts), dus die rollen zouden
  // nergens landen — terwijl het antwoord ze wél zou noemen en het scherm ze zou tonen.
  // Dat is precies het misverstand dat regel 2a hierboven met zoveel woorden weigert te
  // maken ("stil de rol weglaten zou hem laten geloven dat…"); dan mag het interne pad het
  // ook niet maken. Via de UI onbereikbaar (de org-keuze is verplicht), maar het antwoord
  // van deze laag hoort waar te zijn, niet toevallig-waar.
  if (input.orgId === null && roles.length > 0) {
    return deny("rollen_zonder_org", MSG_ROLES_NEED_ORG);
  }
  return {
    allowed: true,
    email: normalizeEmail(input.target.email),
    orgId: input.orgId,
    roles:
      input.authority.kind === "intern"
        ? bootstrapRoles(roles, input.org)
        : // Bewust GEEN bootstrap voor een org_admin: hij kan de org_admin-rol nooit
          // uitdelen, ook niet zijdelings. (Zijn eigen org heeft sowieso een beheerder —
          // hemzelf — maar op die toevalligheid mag regel 2 niet steunen.)
          roles,
  };
}

/**
 * De organisatiescherm-deur, puur: een lidmaatschap zetten of verwijderen. Zelfde kern,
 * geen bootstrap — dat scherm geeft geen PIN uit, en G36's eerste zin gaat over "wie van
 * Brink een PIN krijgt". Wie hier de eerste beheerder van een klant aanwijst doet dat
 * expliciet met het vinkje, en dat mag alleen intern.
 */
export function decideMembershipChange(input: {
  authority: OrgAuthority;
  target: TargetFacts;
  orgId: string;
  org: OrgFacts | null;
  roles?: readonly MembershipRole[];
  operation: "set" | "remove";
}): Verdict {
  // Verwijderen kent geen rollen; ze zouden de org_admin-controle in de kern alleen maar
  // kunnen vertroebelen.
  const roles = input.operation === "remove" ? [] : uniqueRoles(input.roles);
  const kern = decideMembershipAuthority({
    authority: input.authority,
    target: input.target,
    orgId: input.orgId,
    org: input.org,
    roles,
  });
  if (!kern.allowed) return kern;
  return {
    allowed: true,
    email: normalizeEmail(input.target.email),
    orgId: input.orgId,
    roles,
  };
}

/**
 * Mag deze actor de PIN-STATUS van dit adres zien? Alleen voor het beheerscherm, dat
 * anders adressen toont waar de server toch niets mee toestaat. Net als
 * `describeIssueScope()` is dit gemak bovenop de poort, nooit in plaats daarvan — en het
 * staat hier, bij de rest van G36, en niet in de pagina: één plek waar de regel woont.
 */
export function mayViewPinStatus(
  authority: OrgAuthority,
  target: TargetFacts,
): boolean {
  if (authority.kind === "intern") return true;
  if (authority.kind === "geen") return false;
  return target.memberships.some((m) => authority.orgIds.includes(m.orgId));
}

// ── De feiten uit de database ──────────────────────────────────────────────────

/** Wie is deze actor, in G36-termen? Onbekend/leeg → "geen" (default-deny). */
export async function resolveOrgAuthority(
  db: AppDb,
  actorEmail: string | null | undefined,
): Promise<OrgAuthority> {
  const email = normalizeEmail(actorEmail ?? "");
  if (!email || !email.includes("@")) return { kind: "geen", email };

  const rows = await db
    .select({
      orgId: memberships.orgId,
      orgType: organizations.type,
      roles: memberships.roles,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    // lower(): memberships.email heeft géén CHECK die normalisatie afdwingt (anders dan
    // activation_pins). Eén rij met een hoofdletter zou anders onzichtbaar zijn — hier
    // fail-safe (de actor verliest rechten), maar bij het doeladres hieronder fail-OPEN,
    // en dáár is het een gat. Beide lookups daarom hetzelfde.
    .where(sql`lower(${memberships.email}) = ${email}`);

  if (rows.some((r) => r.orgType === "intern")) return { kind: "intern", email };

  const orgIds = rows
    .filter((r) => (r.roles ?? []).includes("org_admin"))
    .map((r) => r.orgId);
  if (orgIds.length > 0) return { kind: "org_admin", email, orgIds };

  return { kind: "geen", email };
}

async function readTargetFacts(db: AppDb, email: string): Promise<TargetFacts> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { email: normalized, hasAccount: false, memberships: [] };
  const [leden, users] = await Promise.all([
    db
      .select({ orgId: memberships.orgId, roles: memberships.roles })
      .from(memberships)
      .where(sql`lower(${memberships.email}) = ${normalized}`),
    // Hoofdletterongevoelig: user.email is unique maar niet genormaliseerd (de bestaande
    // rijen zijn ooit door Better Auth zelf aangemaakt) — zelfde reden als in activation.ts.
    db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(sql`lower(${authSchema.user.email}) = ${normalized}`)
      .limit(1),
  ]);
  return {
    email: normalized,
    hasAccount: users.length > 0,
    memberships: leden.map((l) => ({
      orgId: l.orgId,
      roles: (l.roles ?? []) as MembershipRole[],
    })),
  };
}

async function readOrgFacts(db: AppDb, orgId: string): Promise<OrgFacts | null> {
  // Vorm eerst (zie UUID_RE): een vormloze orgId is "bestaat niet", geen databasefout.
  const id = orgId.trim();
  if (!UUID_RE.test(id)) return null;
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!org) return null;
  const admins = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(
      sql`${memberships.orgId} = ${org.id} and 'org_admin' = ANY(${memberships.roles})`,
    )
    .limit(1);
  return { id: org.id, hasOrgAdmin: admins.length > 0 };
}

async function logDenial(
  db: AppDb,
  authority: OrgAuthority,
  action: string,
  denial: Denial,
  payload: Record<string, unknown>,
): Promise<void> {
  // Regel 5: een geweigerde poging is precies het soort gebeurtenis dat je achteraf wilt
  // kunnen terugvinden. De reden staat hier wél voluit — de events-tabel is intern, het
  // scherm krijgt alleen de neutrale melding.
  await logEvent(db, {
    entity: "user",
    action,
    actor: authority.email || "anoniem",
    payload: { reason: denial.reason, authorityKind: authority.kind, ...payload },
  });
}

// ── De twee deuren: autoriseren en schrijven in één aanroep ────────────────────

export type IssuePinOutcome =
  | { ok: true; issued: IssuedPin; roles: MembershipRole[] }
  | { ok: false; reason: DenyReason; message: string };

/**
 * De PIN-deur (besluit G39): bevoegdheid wordt hier, op het moment van uitvoeren, uit de
 * database afgeleid en meteen daarna gebruikt. Er komt geen toestemming van buiten binnen.
 *
 * `actorEmail` hoort uit de sessie te komen (`requireSession()` in de server action) — dat
 * is identiteit, geen autorisatie: wélke rechten daarbij horen zoekt deze functie zelf op.
 * `email`, `orgId` en `roles` zijn de vráág van de gebruiker en wegen nooit mee in het
 * antwoord "mag hij dit".
 *
 * ⚠️ App-code (server actions, route handlers) roept `issueActivationPin()` NOOIT
 * rechtstreeks aan — dat is de kale schrijffunctie voor migraties, seeds en tests.
 * `lib/repo/authz-deuren.test.ts` bewaakt dat.
 */
export async function issuePinAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    email: string;
    name?: string;
    orgId?: string | null;
    roles?: MembershipRole[];
    now?: Date;
  },
): Promise<IssuePinOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const orgId = input.orgId ?? null;
  const [target, org] = await Promise.all([
    readTargetFacts(db, input.email),
    orgId ? readOrgFacts(db, orgId) : Promise.resolve(null),
  ]);

  const verdict = decidePinIssue({
    authority,
    target,
    orgId,
    org,
    roles: input.roles,
  });
  if (!verdict.allowed) {
    await logDenial(db, authority, "activation_pin_denied", verdict, {
      email: normalizeEmail(input.email),
      orgId,
      roles: uniqueRoles(input.roles),
    });
    return { ok: false, reason: verdict.reason, message: verdict.message };
  }

  const issued = await issueActivationPin(db, {
    email: verdict.email,
    orgId: verdict.orgId,
    roles: verdict.roles,
    name: input.name,
    // De actor komt uit de vastgestelde bevoegdheid, niet uit de invoer: niemand kan een
    // handeling op naam van een ander in de events-tabel krijgen.
    actor: authority.email,
    now: input.now,
  });
  return { ok: true, issued, roles: verdict.roles };
}

export type MembershipOutcome =
  | { ok: true; email: string; roles: MembershipRole[] }
  | { ok: false; reason: DenyReason; message: string };

/**
 * De organisatiescherm-deur (besluit G39): lid toevoegen/bijwerken of verwijderen, met
 * dezelfde bevoegdheidsbepaling en in dezelfde aanroep als de schrijfactie.
 *
 * ⚠️ App-code roept `addMembership()` / `removeMembership()` NOOIT rechtstreeks aan; dat
 * zijn de kale schrijffuncties voor migraties, seeds en tests (en voor
 * `issueActivationPin`, dat zelf alleen via `issuePinAsActor` bereikbaar is voor app-code).
 */
export async function changeMembershipAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    email: string;
    orgId: string;
    roles?: MembershipRole[];
    operation: "set" | "remove";
  },
): Promise<MembershipOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const [target, org] = await Promise.all([
    readTargetFacts(db, input.email),
    readOrgFacts(db, input.orgId),
  ]);

  const verdict = decideMembershipChange({
    authority,
    target,
    orgId: input.orgId,
    org,
    roles: input.roles,
    operation: input.operation,
  });
  if (!verdict.allowed) {
    await logDenial(db, authority, "membership_change_denied", verdict, {
      email: normalizeEmail(input.email),
      orgId: input.orgId,
      roles: uniqueRoles(input.roles),
      operation: input.operation,
    });
    return { ok: false, reason: verdict.reason, message: verdict.message };
  }

  if (input.operation === "remove") {
    // `removeMembership` logt het `membership_removed`-event zélf, vóór het deleten en
    // mét de rollen die het lid had (main, reviewzwerm). Daarom geven we de vastgestelde
    // actor dóór in plaats van hier een tweede event te schrijven: dat gaf twee sporen
    // van één verwijdering, waarvan de onze de rollen niet eens droeg.
    await removeMembership(db, verdict.orgId!, verdict.email, authority.email);
    return { ok: true, email: verdict.email, roles: [] };
  }

  await addMembership(db, {
    orgId: verdict.orgId!,
    email: verdict.email,
    roles: verdict.roles,
    actor: authority.email,
  });
  return { ok: true, email: verdict.email, roles: verdict.roles };
}

export type BrandingOutcome =
  | { ok: true; orgId: string }
  | { ok: false; reason: DenyReason; message: string };

/**
 * De derde deur (sprint 3.2a): de branding van een organisatie zetten.
 *
 * Tot 3.2a stond `saveBrandingAction` achter alléén `requireSession()` en las hij de
 * `orgId` uit het formulier — een gewone gebruiker uit org A overschreef daarmee de
 * branding van org B. Dat was vastgelegd als BEKENDE_SCHULD in
 * `lib/repo/authz-deuren.test.ts` en is hier gedicht, in dezelfde vorm als G39: autoriseren
 * en schrijven in ÉÉN aanroep, met `actorEmail` uit de sessie en alle rechten vers uit de
 * database.
 *
 * De regel is bewust NIET `decideMembershipAuthority()`. Die gaat over lidmaatschappen en
 * rollen, en daar hangen bepalingen aan (2a: geen org_admin toekennen; 2c: geen vreemd
 * doeladres) die op een logo en een kleurcode niets betekenen. Hergebruiken zou een
 * doeladres moeten verzinnen dat er niet is. De regel hier is die éne zin die wél telt:
 * **intern mag elke organisatie, een org_admin alleen de zijne, de rest niets.**
 */
export async function setBrandingAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    orgId: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  },
): Promise<BrandingOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const orgId = input.orgId.trim();

  const verdict = decideBrandingChange(authority, orgId);
  if (!verdict.allowed) {
    await logDenial(db, authority, "org_branding_denied", verdict, { orgId });
    return { ok: false, reason: verdict.reason, message: verdict.message };
  }

  // Vorm eerst, dan de database — zelfde reden als bij readOrgFacts: een vormloze orgId
  // laat Postgres gooien, en dan zou een onbevoegde aanvraag een hárde fout opleveren waar
  // dezelfde aanvraag met een bestaande org een nette weigering geeft.
  if (!UUID_RE.test(orgId) || !(await readOrgFacts(db, orgId))) {
    await logDenial(
      db,
      authority,
      "org_branding_denied",
      deny("onbekende_org", MSG_UNKNOWN_ORG),
      { orgId },
    );
    return {
      ok: false,
      reason: "onbekende_org",
      message:
        authority.kind === "intern" ? MSG_UNKNOWN_ORG : MSG_DENIED,
    };
  }

  await setOrgBranding(db, {
    orgId,
    logoUrl: input.logoUrl,
    accentColor: input.accentColor,
    actor: authority.email,
  });
  return { ok: true, orgId };
}

/** De regel achter `setBrandingAsActor`, puur — zonder database, dus uitputtend testbaar. */
export function decideBrandingChange(
  authority: OrgAuthority,
  orgId: string,
): { allowed: true } | Denial {
  if (authority.kind === "intern") return { allowed: true };
  // Default-deny voorop, en met dezelfde neutrale tekst als de rest van dit bestand: wie
  // niet mag, mag ook niet uit de melding afleiden óf die organisatie bestaat.
  if (authority.kind === "geen") return deny("geen_uitgever", MSG_DENIED);
  if (!authority.orgIds.includes(orgId)) return deny("vreemde_org", MSG_DENIED);
  return { allowed: true };
}

// ── Wat een scherm mag tonen ───────────────────────────────────────────────────

/** Eén organisatie zoals een beheerscherm hem mag aanbieden. */
export type ScopeOrg = {
  id: string;
  name: string;
  type: string;
  /** Nog geen beheerder: de eerste die hier een PIN krijgt wordt het (G36, eerste zin). */
  needsOrgAdmin: boolean;
};

export type IssueScope = {
  authority: OrgAuthority;
  /** Organisaties die deze actor mag beheren. Leeg = hij mag niets. */
  orgs: ScopeOrg[];
  /** Mag hij de org_admin-rol toekennen? Alleen intern (G36, tweede zin). */
  canGrantOrgAdmin: boolean;
};

/**
 * Wat een scherm mag tónen. Puur UI-gemak BOVENOP de serverregel, nooit in plaats daarvan:
 * `issuePinAsActor()` en `changeMembershipAsActor()` blijven de poort en weigeren hetzelfde,
 * ook als iemand het formulier omzeilt. Zelfde bron (`resolveOrgAuthority`), dus scherm en
 * server kunnen niet uit elkaar lopen.
 */
export async function describeIssueScope(
  db: AppDb,
  actorEmail: string | null | undefined,
): Promise<IssueScope> {
  const authority = await resolveOrgAuthority(db, actorEmail);
  if (authority.kind === "geen") {
    return { authority, orgs: [], canGrantOrgAdmin: false };
  }

  const alle = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
    })
    .from(organizations)
    .orderBy(organizations.name);
  const zichtbaar =
    authority.kind === "intern"
      ? alle
      : alle.filter((o) => authority.orgIds.includes(o.id));
  if (zichtbaar.length === 0) {
    return { authority, orgs: [], canGrantOrgAdmin: authority.kind === "intern" };
  }

  const beheerders = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(
      sql`${inArray(
        memberships.orgId,
        zichtbaar.map((o) => o.id),
      )} and 'org_admin' = ANY(${memberships.roles})`,
    );
  const metBeheerder = new Set(beheerders.map((b) => b.orgId));

  return {
    authority,
    orgs: zichtbaar.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      needsOrgAdmin: !metBeheerder.has(o.id),
    })),
    canGrantOrgAdmin: authority.kind === "intern",
  };
}
