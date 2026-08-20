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
// het PIN-scherm (`app/admin/users`) en het organisatiescherm (`app/admin/organizations`).
// Dat zijn niet twee besluiten maar één, dus ze delen `decideMembershipAuthority()`. De
// eerste ronde van dit item liet de tweede deur open: een gewone gebruiker zette zichzelf
// via `addMemberAction` in de interne org en was daarna volgens regel 1 almachtig.
// `lib/repo/authz-deuren.test.ts` bewaakt dat er geen derde deur bijkomt.
//
// Wat deze laag NIET doet: routes bewaken of "extern ziet alleen eigen spullen" afdwingen.
// Dat is item 3.2a. Deze laag gaat over wie wat mag SCHRIJVEN.
import { eq, inArray, sql } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import {
  memberships,
  organizations,
  type MembershipRole,
  type Organization,
} from "@/db/schema";
import { issueActivationPin, type IssuedPin } from "./activation";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import {
  addMembership,
  countMembers,
  createOrganization,
  deleteOrganization,
  removeMembership,
  setOrgBranding,
  setOrgSeatLimit,
} from "./orgs";

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
  /** `null` = onbeperkt. Besluit 6 (4 aug): instelbaar bij aanmaken, aanpasbaar in Admin. */
  seatLimit: number | null;
  /** Aantal lidmaatschappen op het moment van vragen. */
  seatsUsed: number;
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
  | "rollen_zonder_org" // rollen gevraagd zonder org — daar wordt niets van geschreven
  | "geen_plek" // besluit 6: de zetellimiet van deze organisatie is bereikt
  | "geen_orgmaker" // besluit 2: alleen intern maakt organisaties aan
  | "org_zonder_naam" // een nieuwe organisatie zonder naam
  | "ongeldige_limiet"; // een zetellimiet die geen positief geheel getal is

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
// Besluit 2: organisaties aanmaken is intern werk. Zelfde neutrale vorm als MSG_DENIED —
// de UI biedt het een externe beheerder niet eens aan, dus wie deze tekst ziet, omzeilde
// het formulier.
const MSG_NO_ORG_CREATE =
  "You can't create organizations here. Ask Brink if you think you should be able to.";
const MSG_ORG_NEEDS_NAME = "Enter a name for the new organization.";
const MSG_BAD_SEAT_LIMIT = "Enter a seat limit of 1 or more.";

/**
 * De zetel-weigering is bewust WÉL specifiek, anders dan MSG_DENIED. Twee redenen:
 * hij komt pas nadat alle bevoegdheidscontroles zijn gepasseerd (wie hem ziet, mag in deze
 * organisatie schrijven en kent haar dus al), en hij is alleen bruikbaar als hij zegt wát
 * er moet gebeuren. "Kon geen PIN uitgeven" laat Brink zoeken; dit zegt waar de knop zit.
 */
function msgSeats(used: number, limit: number): string {
  return `This organization has used all its seats (${used} of ${limit}). Raise the seat limit to add someone.`;
}

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
  /**
   * Kost deze handeling een zetel? Toevoegen wel, verwijderen niet. Default `true`, want
   * dat is de kant waar vergeten veilig uitpakt (ijzeren regel 4).
   */
  neemtZetel?: boolean;
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
    return zetelPoort(input);
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

  return zetelPoort(input);
}

/**
 * De zetellimiet (besluit 6, Timo 4 aug): "vanaf het begin kunnen we dit controleren."
 * Controleren betekent dat het effect heeft — een limiet die niemand tegenhoudt is
 * decoratie, en wekt bovendien de valse indruk dát er een grens is.
 *
 * ⚠️ Staat bewust ACHTERAAN, na alle bevoegdheidscontroles. Wie deze weigering ziet, mag
 * in deze organisatie schrijven en kent haar dus al; de melding mag daarom concreet zijn
 * (zie `msgSeats`) zonder iets te verraden aan iemand die er niets te zoeken heeft.
 *
 * ⚠️ Geldt ook voor INTERN. Dat is geen vergetelheid: Brink geeft in de praktijk élke PIN
 * uit, dus een uitzondering voor intern zou betekenen dat de limiet nooit ergens bijt.
 * Brink is óók de enige die hem kan verhogen (besluit 7), dus de weg vooruit staat open.
 *
 * ⚠️ En dit is de LEES-kant, die per definitie een moment oud is. De echte grens zit in de
 * `where` van `addMembership()` (lib/repo/orgs.ts), waar de telling in dezelfde SQL staat
 * als de insert. Deze functie bestaat om een nette, uitlegbare melding te kunnen geven —
 * niet om de grens te zíjn.
 */
function zetelPoort(input: {
  target: TargetFacts;
  orgId: string | null;
  org: OrgFacts | null;
  neemtZetel?: boolean;
}): { allowed: true } | Denial {
  const { org, orgId, target } = input;
  if (input.neemtZetel === false) return { allowed: true };
  if (orgId === null || org === null) return { allowed: true };
  // Onbeperkt (Brink Licht zelf staat zo op productie).
  if (org.seatLimit === null) return { allowed: true };
  // Al lid: rollen bijwerken of een nieuwe PIN kost geen zetel. Zonder deze regel zou
  // "vergeten wachtwoord = nieuwe PIN" (C10) stuklopen zodra een organisatie vol zit —
  // precies op het moment dat iemand er wél al in zit.
  if (target.memberships.some((m) => m.orgId === org.id)) return { allowed: true };
  if (org.seatsUsed < org.seatLimit) return { allowed: true };
  return deny("geen_plek", msgSeats(org.seatsUsed, org.seatLimit));
}

/**
 * Besluit 2 (Timo, 4 aug): **alleen intern maakt organisaties aan.** Sinds 3.2a komt een
 * externe org_admin ook op `/admin/users` — de route staat bewust op niveau `org_admin`,
 * want G36 geeft hem het recht mensen aan te maken. Organisaties aanmaken hoort daar niet
 * bij: dat is de wortel van het org-model, en aan `organizations.type` hangt of iemand
 * inkoopprijzen ziet.
 */
export function decideOrgCreate(
  authority: OrgAuthority,
): { allowed: true } | Denial {
  if (authority.kind === "intern") return { allowed: true };
  return deny("geen_orgmaker", MSG_NO_ORG_CREATE);
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
    // Verwijderen maakt een zetel vrij; die kan de zetellimiet dus nooit tegenhouden.
    neemtZetel: input.operation === "set",
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
    .select({ id: organizations.id, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!org) return null;
  const [admins, seatsUsed] = await Promise.all([
    db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(
        sql`${memberships.orgId} = ${org.id} and 'org_admin' = ANY(${memberships.roles})`,
      )
      .limit(1),
    countMembers(db, org.id),
  ]);
  return {
    id: org.id,
    hasOrgAdmin: admins.length > 0,
    seatLimit: org.seatLimit,
    seatsUsed,
  };
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

  const geschreven = await addMembership(db, {
    orgId: verdict.orgId!,
    email: verdict.email,
    roles: verdict.roles,
    actor: authority.email,
  });
  // `false` = de zetellimiet hield hem tegen in de `where` van de insert zelf. De poort
  // hierboven keek al naar de zetels, dus dit is het racevenster tussen die lezing en deze
  // schrijfactie — zeldzaam, maar het is precies het geval waarvoor de telling in de SQL
  // staat. Verse cijfers voor de melding, want de gelezen feiten zijn nu per definitie oud.
  if (!geschreven) {
    const vers = await countMembers(db, verdict.orgId!);
    const denial = deny("geen_plek", msgSeats(vers, org?.seatLimit ?? vers));
    await logDenial(db, authority, "membership_change_denied", denial, {
      email: verdict.email,
      orgId: verdict.orgId,
      operation: "set",
    });
    return { ok: false, reason: denial.reason, message: denial.message };
  }
  return { ok: true, email: verdict.email, roles: verdict.roles };
}

export type CreateOrgOutcome =
  | { ok: true; org: Organization }
  | { ok: false; reason: DenyReason; message: string };

/**
 * De vierde deur (sprint 3.2c, besluiten 1–3): een organisatie aanmaken.
 *
 * Tot 3.2c stond dit als `createOrgAction` op `/admin/organizations` en riep die action
 * `createOrganization()` rechtstreeks aan, met alleen `bewaakNiveau("intern")` ervoor. Dat
 * hield, maar het was de enige schrijfweg naar de organisatietabel die niet dezelfde vorm
 * had als de rest van G39 — en `organizations` is juist de tabel waar `type` in staat.
 * Nu dezelfde vorm als de andere drie: autoriseren en schrijven in één aanroep, actor uit
 * de sessie, rechten vers uit de database.
 *
 * Het TYPE is hier geen parameter en komt ook niet uit de invoer: `createOrganization()`
 * zet 'extern', altijd (besluit 3 + G42).
 */
export async function createOrgAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    name: string;
    plan?: string;
    seatLimit?: number | null;
  },
): Promise<CreateOrgOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const verdict = decideOrgCreate(authority);
  if (!verdict.allowed) {
    await logDenial(db, authority, "org_create_denied", verdict, {
      name: input.name,
    });
    return { ok: false, reason: verdict.reason, message: verdict.message };
  }

  const name = input.name.trim();
  if (!name) {
    return {
      ok: false,
      reason: "org_zonder_naam",
      message: MSG_ORG_NEEDS_NAME,
    };
  }
  const zetels = normaliseerZetels(input.seatLimit);
  if (!zetels.ok) return zetels;

  const org = await createOrganization(db, {
    name,
    plan: input.plan,
    seatLimit: zetels.waarde,
    actor: authority.email,
  });
  return { ok: true, org };
}

/**
 * Een zetellimiet uit de invoer. `undefined` = niet meegegeven → de standaardwaarde;
 * `null` = expliciet onbeperkt (bestaat vandaag niet in de interface, wél in de data:
 * Brink Licht staat zo op productie). Alles wat geen positief geheel getal is, is een
 * fout — niet stil terugvallen op een default, want dan zou een typefout van de uitgever
 * een andere limiet opleveren dan hij intikte.
 */
function normaliseerZetels(
  waarde: number | null | undefined,
):
  | { ok: true; waarde: number | null | undefined }
  | { ok: false; reason: DenyReason; message: string } {
  if (waarde === undefined) return { ok: true, waarde: undefined };
  if (waarde === null) return { ok: true, waarde: null };
  if (!Number.isInteger(waarde) || waarde < 1) {
    return {
      ok: false,
      reason: "ongeldige_limiet",
      message: MSG_BAD_SEAT_LIMIT,
    };
  }
  return { ok: true, waarde };
}

export type SeatLimitOutcome =
  | { ok: true; orgId: string; seatLimit: number | null }
  | { ok: false; reason: DenyReason; message: string };

/**
 * Besluit 7: de zetellimiet is later aan te passen, in Admin, naast de organisatie in de
 * lijst. **Alleen intern** — een org_admin die zijn eigen limiet mag verhogen, heeft geen
 * limiet. Dat is dezelfde lijn als besluit 2: organisatiebeheer is Brink-werk.
 *
 * Raakt uitsluitend `seat_limit`. G42: er is geen weg, ook niet zijdelings, om het type
 * van een bestaande organisatie te veranderen.
 */
export async function setSeatLimitAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    orgId: string;
    seatLimit: number | null;
  },
): Promise<SeatLimitOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const verdict = decideOrgCreate(authority);
  if (!verdict.allowed) {
    await logDenial(db, authority, "org_seat_limit_denied", verdict, {
      orgId: input.orgId,
    });
    return { ok: false, reason: verdict.reason, message: verdict.message };
  }

  const zetels = normaliseerZetels(input.seatLimit);
  if (!zetels.ok) return zetels;

  const orgId = input.orgId.trim();
  if (!UUID_RE.test(orgId) || !(await readOrgFacts(db, orgId))) {
    return { ok: false, reason: "onbekende_org", message: MSG_UNKNOWN_ORG };
  }

  // `undefined` bestaat hier niet: `seatLimit` is een verplicht argument van deze functie.
  const seatLimit = zetels.waarde ?? null;
  await setOrgSeatLimit(db, { orgId, seatLimit, actor: authority.email });
  return { ok: true, orgId, seatLimit };
}

export type CreateOrgAndPinOutcome =
  | {
      ok: true;
      org: Organization;
      issued: IssuedPin;
      roles: MembershipRole[];
    }
  | { ok: false; reason: DenyReason; message: string };

/**
 * Besluit 4b + 5 (Timo, 4 aug): in ÉÉN handeling een organisatie aanmaken én de PIN
 * uitgeven — en dat is **alles-of-niets**. Mislukt de PIN, dan wordt de organisatie óók
 * niet aangemaakt. Anders houd je lege organisaties over van mislukte pogingen, die later
 * in de dropdown opduiken zonder dat iemand nog weet waarom ze bestaan.
 *
 * ⚠️ HOE "ALLES-OF-NIETS" HIER WERKT, want het is geen transactie en dat kan niet. De
 * neon-http-driver kent er geen (`lib/repo/activation.ts:157` legt dat uit voor precies
 * dezelfde reeks schrijfacties). In plaats daarvan twee dingen:
 *
 *   1. **Droogloop vooraf.** Alles wat je kunt weten vóór er iets bestaat, wordt hier
 *      beslist: mag deze actor überhaupt organisaties aanmaken, heeft de nieuwe
 *      organisatie een naam, is het doeladres bruikbaar, kloppen de rollen. De verreweg
 *      meest voorkomende mislukking (een vertypt e-mailadres) haalt de database dus niet
 *      eens. De feiten van de nog niet bestaande organisatie zijn hier exact bekend: nul
 *      leden, nog geen beheerder, de zetellimiet die de uitgever zojuist koos.
 *   2. **Compensatie achteraf.** Gaat het daarna alsnog mis — een weigering die pas met de
 *      echte organisatie zichtbaar wordt, of een storing halverwege — dan wordt de zojuist
 *      aangemaakte organisatie weer verwijderd (`ON DELETE CASCADE` neemt een eventueel
 *      lidmaatschap mee). Ook als het verwijderen zélf faalt: dan gooit het door, en dan
 *      is er tenminste een luide fout in plaats van een stille lege organisatie.
 */
export async function createOrgAndIssuePinAsActor(
  db: AppDb,
  input: {
    actorEmail: string | null | undefined;
    orgName: string;
    plan?: string;
    seatLimit?: number | null;
    email: string;
    name?: string;
    roles?: MembershipRole[];
    now?: Date;
  },
): Promise<CreateOrgAndPinOutcome> {
  const authority = await resolveOrgAuthority(db, input.actorEmail);
  const magAanmaken = decideOrgCreate(authority);
  if (!magAanmaken.allowed) {
    await logDenial(db, authority, "org_create_denied", magAanmaken, {
      name: input.orgName,
      email: normalizeEmail(input.email),
    });
    return { ok: false, reason: magAanmaken.reason, message: magAanmaken.message };
  }

  const orgName = input.orgName.trim();
  if (!orgName) {
    return { ok: false, reason: "org_zonder_naam", message: MSG_ORG_NEEDS_NAME };
  }
  const zetels = normaliseerZetels(input.seatLimit);
  if (!zetels.ok) return zetels;

  // Droogloop (1). De organisatie bestaat nog niet, maar haar feiten wel: nul leden, geen
  // beheerder, de gekozen limiet. Het placeholder-id komt nergens in de database terecht —
  // het dient alleen om `orgId !== null` te zijn, zodat de kernregel dezelfde takken loopt
  // als straks met de echte organisatie.
  const NOG_NIET_AANGEMAAKT = "00000000-0000-4000-8000-000000000000";
  const target = await readTargetFacts(db, input.email);
  const droogloop = decidePinIssue({
    authority,
    target,
    orgId: NOG_NIET_AANGEMAAKT,
    org: {
      id: NOG_NIET_AANGEMAAKT,
      hasOrgAdmin: false,
      seatLimit: zetels.waarde ?? null,
      seatsUsed: 0,
    },
    roles: input.roles,
  });
  if (!droogloop.allowed) {
    await logDenial(db, authority, "activation_pin_denied", droogloop, {
      email: normalizeEmail(input.email),
      orgName,
      roles: uniqueRoles(input.roles),
    });
    return { ok: false, reason: droogloop.reason, message: droogloop.message };
  }

  const org = await createOrganization(db, {
    name: orgName,
    plan: input.plan,
    seatLimit: zetels.waarde,
    actor: authority.email,
  });

  // Vanaf hier bestaat er iets dat opgeruimd moet worden als het misgaat (2).
  try {
    const uitgifte = await issuePinAsActor(db, {
      actorEmail: input.actorEmail,
      email: input.email,
      name: input.name,
      orgId: org.id,
      roles: input.roles,
      now: input.now,
    });
    if (!uitgifte.ok) {
      await deleteOrganization(db, org.id, authority.email);
      return uitgifte;
    }
    return { ok: true, org, issued: uitgifte.issued, roles: uitgifte.roles };
  } catch (fout) {
    await deleteOrganization(db, org.id, authority.email);
    throw fout;
  }
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
  /** Prijsmodel (trial/abonnement/per-dossier) — de organisatielijst in Admin toont het. */
  plan: string;
  /** `null` = onbeperkt. Besluit 6/7: instelbaar bij aanmaken, aanpasbaar in Admin. */
  seatLimit: number | null;
  /** Bezette zetels op dit moment — de teller van "3/5 seats". */
  seatsUsed: number;
};

export type IssueScope = {
  authority: OrgAuthority;
  /** Organisaties die deze actor mag beheren. Leeg = hij mag niets. */
  orgs: ScopeOrg[];
  /** Mag hij de org_admin-rol toekennen? Alleen intern (G36, tweede zin). */
  canGrantOrgAdmin: boolean;
  /**
   * Mag hij organisaties aanmaken en hun zetellimiet aanpassen? Alleen intern (besluiten
   * 2 en 7). Een externe org_admin komt sinds 3.2a wél op `/admin/users` — hij ziet deze
   * mogelijkheid daar niet eens.
   */
  canCreateOrgs: boolean;
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
  const intern = authority.kind === "intern";
  if (authority.kind === "geen") {
    return {
      authority,
      orgs: [],
      canGrantOrgAdmin: false,
      canCreateOrgs: false,
    };
  }

  const alle = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      plan: organizations.plan,
      seatLimit: organizations.seatLimit,
    })
    .from(organizations)
    .orderBy(organizations.name);
  const zichtbaar = intern
    ? alle
    : alle.filter((o) => authority.orgIds.includes(o.id));
  if (zichtbaar.length === 0) {
    return {
      authority,
      orgs: [],
      canGrantOrgAdmin: intern,
      canCreateOrgs: intern,
    };
  }

  const zichtbareIds = zichtbaar.map((o) => o.id);
  const [beheerders, tellingen] = await Promise.all([
    db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(
        sql`${inArray(memberships.orgId, zichtbareIds)} and 'org_admin' = ANY(${
          memberships.roles
        })`,
      ),
    // Bezette zetels per organisatie, in één query — de lijst toont ze naast élke
    // organisatie ("3/5 seats"), dus één telling per org zou n+1 queries opleveren.
    db
      .select({
        orgId: memberships.orgId,
        n: sql<number>`count(*)::int`,
      })
      .from(memberships)
      .where(inArray(memberships.orgId, zichtbareIds))
      .groupBy(memberships.orgId),
  ]);
  const metBeheerder = new Set(beheerders.map((b) => b.orgId));
  const bezet = new Map(tellingen.map((t) => [t.orgId, Number(t.n)]));

  return {
    authority,
    orgs: zichtbaar.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      needsOrgAdmin: !metBeheerder.has(o.id),
      plan: o.plan,
      seatLimit: o.seatLimit,
      seatsUsed: bezet.get(o.id) ?? 0,
    })),
    canGrantOrgAdmin: intern,
    canCreateOrgs: intern,
  };
}
