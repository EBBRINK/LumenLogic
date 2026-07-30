// Activatie-PIN's (C10/G34): Brink maakt een account aan met een tijdelijke PIN, mailt die
// PIN zélf (besluit 6/G26 — de app verstuurt niets), en de ontvanger zet daarmee zijn eigen
// wachtwoord. Vergeten wachtwoord = nieuwe PIN, geen apart resetmechanisme.
//
// Deze laag is puur datamodel + regels: genereren, hashen, geldigheid, eenmaligheid en de
// pogingenteller. Het zetten van het wachtwoord en het uitgeven van een sessie staat in
// lib/auth-activation.ts — dat heeft Better Auth nodig, deze laag niet. Zelfde patroon als
// de rest van lib/repo: db geïnjecteerd als eerste argument, dus bewijsbaar op PGlite.
//
// De regels van §3a van de sprintbriefing, één op één:
//   • 8 cijfers                       → PIN_LENGTH + generatePin()
//   • gehasht opgeslagen              → hashPassword() (scrypt, gezouten) in issue…
//   • eenmalig                        → claimActivationPin(), atomair op used_at IS NULL
//   • 7 dagen geldig                  → PIN_TTL_DAYS
//   • max 5 foute pogingen            → PIN_MAX_ATTEMPTS + attempts-teller
//   • één actieve PIN per gebruiker   → primary key op e-mail + upsert
//   • één keer zichtbaar              → alleen issueActivationPin() geeft klaartekst terug
//   • geen account-enumeratie         → checkActivationPin() geeft nooit een reden mee en
//                                       draait ook bij een onbekend adres één volledige
//                                       scrypt-verificatie tegen een dummy-hash
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import { activationPins, type MembershipRole } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { addMembership } from "./orgs";

// Besluit G34. 8 cijfers past op shadcn's InputOTP met REGEXP_ONLY_DIGITS; 7 dagen is
// bewust langer dan Entra's 1 uur omdat Brink handmatig mailt en de ontvanger later kijkt
// (Entra staat tot 30 dagen toe). 5 pogingen is de Entra-orde van grootte: 10^8 mogelijke
// PIN's met 5 pogingen geeft een raadkans van 5 op 100 miljoen.
export const PIN_LENGTH = 8;
export const PIN_TTL_DAYS = 7;
export const PIN_MAX_ATTEMPTS = 5;

// Adressen worden overal in dit project genormaliseerd (trim + lowercase); de CHECK op
// activation_pins.email dwingt hetzelfde af in de database.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Uniform verdeelde cijfers uit een CSPRNG. Bytes vanaf 250 worden verworpen: 256 is geen
// veelvoud van 10, dus een kale `byte % 10` zou de cijfers 0-5 licht bevoordelen.
export function generatePin(): string {
  const digits: string[] = [];
  const buf = new Uint8Array(PIN_LENGTH * 2);
  while (digits.length < PIN_LENGTH) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= 250) continue;
      digits.push(String(b % 10));
      if (digits.length === PIN_LENGTH) break;
    }
  }
  return digits.join("");
}

// Eén dummy-hash per proces, lui berekend. Nodig voor de timing-gelijkheid bij een onbekend
// adres: zonder deze verificatie is "adres bestaat niet" meetbaar sneller dan "verkeerde
// PIN", en dan verraadt de responstijd alsnog of een e-mailadres bestaat.
let dummyHashPromise: Promise<string> | null = null;
function dummyPinHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("0".repeat(PIN_LENGTH));
  return dummyHashPromise;
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + PIN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type IssuedPin = {
  email: string;
  /** Klaartekst. Bestaat exact één keer — hierna staat alleen de hash nog in de database. */
  pin: string;
  expiresAt: Date;
  /** Of er voor dit adres een user-rij is aangemaakt (false = het account bestond al). */
  userCreated: boolean;
};

// Zoek de user-rij hoofdletterongevoelig: `user.email` is unique maar niet genormaliseerd,
// en de drie bestaande rijen zijn ooit door Better Auth zelf aangemaakt.
async function findUserByEmail(db: AppDb, email: string) {
  const [row] = await db
    .select({ id: authSchema.user.id, email: authSchema.user.email })
    .from(authSchema.user)
    .where(sql`lower(${authSchema.user.email}) = ${email}`)
    .limit(1);
  return row ?? null;
}

/**
 * Maak een PIN voor een e-mailadres. Maakt zo nodig de user-rij aan, koppelt hem aan een
 * organisatie, en geeft de PIN ÉÉN keer als klaartekst terug — de aanroeper toont hem
 * direct aan Brink en kan hem daarna nergens meer ophalen.
 *
 * Een bestaande PIN voor hetzelfde adres wordt overschreven (geldig of verlopen), inclusief
 * een reset van de pogingenteller en van used_at: dat is precies C10's "vergeten wachtwoord
 * = nieuwe PIN".
 */
export async function issueActivationPin(
  db: AppDb,
  input: {
    email: string;
    /** Organisatie waar deze persoon lid van wordt. Zonder org geen membership. */
    orgId?: string | null;
    /** Weergavenaam voor een nieuwe user-rij; standaard het deel vóór de @. */
    name?: string;
    roles?: MembershipRole[];
    actor?: string;
    now?: Date;
  },
): Promise<IssuedPin> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("issueActivationPin: ongeldig e-mailadres");
  }
  const now = input.now ?? new Date();

  const existing = await findUserByEmail(db, email);
  if (!existing) {
    await db.insert(authSchema.user).values({
      id: crypto.randomUUID(),
      name: input.name?.trim() || email.split("@")[0],
      email,
      // Nog niet geverifieerd: dat wordt hij pas als hij de PIN verzilvert, want daarmee
      // bewijst hij dat hij het mailtje van Brink echt heeft ontvangen.
      emailVerified: false,
    });
  }

  if (input.orgId) {
    await addMembership(db, {
      orgId: input.orgId,
      email,
      roles: input.roles ?? [],
      actor: input.actor,
    });
  }

  const pin = generatePin();
  const pinHash = await hashPassword(pin);
  const expiresAt = expiryFrom(now);
  await db
    .insert(activationPins)
    .values({
      email,
      pinHash,
      expiresAt,
      attempts: 0,
      usedAt: null,
      createdBy: input.actor ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: activationPins.email,
      set: {
        pinHash,
        expiresAt,
        attempts: 0,
        usedAt: null,
        createdBy: input.actor ?? null,
        createdAt: now,
      },
    });

  // Regel 5: elke beheerhandeling is terug te vinden. Nooit de PIN of de hash in de payload.
  await logEvent(db, {
    entity: "user",
    action: "activation_pin_issued",
    actor: input.actor,
    payload: { email, orgId: input.orgId ?? null, expiresAt: expiresAt.toISOString() },
  });

  return { email, pin, expiresAt, userCreated: !existing };
}

/** Status van een PIN zónder de hash — dit is alles wat een beheerscherm mag zien. */
export type ActivationPinStatus = {
  email: string;
  state: "geen" | "actief" | "gebruikt" | "verlopen" | "geblokkeerd";
  expiresAt: Date | null;
  attempts: number;
  attemptsLeft: number;
  usedAt: Date | null;
  createdAt: Date | null;
  createdBy: string | null;
};

// Bewust een select op kolommen en niet `select()`: de hash mag deze functie niet verlaten.
// "PIN is één keer zichtbaar" is een eigenschap van dit oppervlak, niet van de discipline
// van de aanroeper.
export async function getActivationPinStatus(
  db: AppDb,
  email: string,
  now = new Date(),
): Promise<ActivationPinStatus> {
  const normalized = normalizeEmail(email);
  const empty: ActivationPinStatus = {
    email: normalized,
    state: "geen",
    expiresAt: null,
    attempts: 0,
    attemptsLeft: PIN_MAX_ATTEMPTS,
    usedAt: null,
    createdAt: null,
    createdBy: null,
  };
  if (!normalized) return empty;
  const [row] = await db
    .select({
      email: activationPins.email,
      expiresAt: activationPins.expiresAt,
      attempts: activationPins.attempts,
      usedAt: activationPins.usedAt,
      createdAt: activationPins.createdAt,
      createdBy: activationPins.createdBy,
    })
    .from(activationPins)
    .where(eq(activationPins.email, normalized))
    .limit(1);
  if (!row) return empty;
  const state: ActivationPinStatus["state"] = row.usedAt
    ? "gebruikt"
    : row.attempts >= PIN_MAX_ATTEMPTS
      ? "geblokkeerd"
      : row.expiresAt.getTime() <= now.getTime()
        ? "verlopen"
        : "actief";
  return {
    email: row.email,
    state,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - row.attempts),
    usedAt: row.usedAt,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/**
 * Controleer een PIN. Het antwoord is opzettelijk armoedig: `{ ok: false }` en verder niets,
 * ongeacht of het adres onbekend is, de PIN fout, verlopen, al gebruikt of doodgelopen.
 * De aanroeper heeft geen reden om méér te weten en de gebruiker mag het niet weten.
 *
 * Verhoogt de pogingenteller alléén als de PIN verder nog levend is — een verkeerde poging
 * op een al verlopen of al gebruikte PIN verandert niets meer.
 */
export type PinCheck = { ok: true; email: string } | { ok: false };

export async function checkActivationPin(
  db: AppDb,
  email: string,
  pin: string,
  now = new Date(),
): Promise<PinCheck> {
  const normalized = normalizeEmail(email);
  const [row] = normalized
    ? await db
        .select()
        .from(activationPins)
        .where(eq(activationPins.email, normalized))
        .limit(1)
    : [];

  // Altijd exact één scrypt-verificatie, ook zonder rij: het dummy-pad kost hetzelfde als
  // het echte pad, dus de responstijd verraadt niet of dit adres bestaat.
  const hash = row?.pinHash ?? (await dummyPinHash());
  const matches = await verifyPassword({ hash, password: pin });

  if (!row) return { ok: false };
  if (row.usedAt) return { ok: false };
  if (row.attempts >= PIN_MAX_ATTEMPTS) return { ok: false };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false };
  if (!matches) {
    // Teller in SQL ophogen, niet in JS: twee gelijktijdige pogingen mogen niet dezelfde
    // waarde overschrijven — dat zou van 5 pogingen stilletjes 6 maken.
    await db
      .update(activationPins)
      .set({ attempts: sql`${activationPins.attempts} + 1` })
      .where(eq(activationPins.email, normalized));
    return { ok: false };
  }
  return { ok: true, email: normalized };
}

/**
 * Zet de PIN in één atomaire stap op "gebruikt". Geeft `true` aan precies één aanroeper:
 * de voorwaarde `used_at IS NULL` zit in de UPDATE zelf, dus twee gelijktijdige activaties
 * kunnen niet allebei slagen. Herhaalt bewust de vervaltijd- en pogingencontrole, zodat er
 * tussen checkActivationPin() en dit moment niets kan zijn veranderd.
 */
export async function claimActivationPin(
  db: AppDb,
  email: string,
  now = new Date(),
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const claimed = await db
    .update(activationPins)
    .set({ usedAt: now })
    .where(
      and(
        eq(activationPins.email, normalized),
        isNull(activationPins.usedAt),
        lt(activationPins.attempts, PIN_MAX_ATTEMPTS),
        gt(activationPins.expiresAt, now),
      ),
    )
    .returning({ email: activationPins.email });
  return claimed.length > 0;
}
