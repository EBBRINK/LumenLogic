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
//   • max 10 foute pogingen           → PIN_MAX_ATTEMPTS + attempts-teller
//   • één actieve PIN per gebruiker   → primary key op e-mail + upsert
//   • één keer zichtbaar              → alleen issueActivationPin() geeft klaartekst terug
//   • geen account-enumeratie         → checkActivationPin() geeft nooit een reden mee en
//                                       draait ook bij een onbekend adres één volledige
//                                       scrypt-verificatie tegen een dummy-hash
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import { activationPins, organizations, type MembershipRole } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { addMembership } from "./orgs";

// Besluit G34, bijgesteld door G38. 8 cijfers past op shadcn's InputOTP met
// REGEXP_ONLY_DIGITS; 7 dagen is bewust langer dan Entra's 1 uur omdat Brink handmatig
// mailt en de ontvanger later kijkt (Entra staat tot 30 dagen toe).
//
// G38 verhoogt de pogingenlimiet van 5 naar 10 — en dat getal verdwijnt uit de interface
// (zie components/admin/pin-block.tsx). De afweging erachter, zodat niemand hem opnieuw
// hoeft te maken: de limiet gaat NIET over vertypen maar over geautomatiseerd raden.
// 8 cijfers = 10^8 combinaties en scrypt kost ~46 ms, dus serieel duurt uitputtend raden
// ~27 dagen — maar met 200 parallelle verzoeken ~3 uur, en dat past ruim binnen de 7 dagen
// dat een PIN leeft. Vandaar 10 en niet "helemaal weg": 10 is ruim genoeg dat een mens er
// in de praktijk nooit tegenaan loopt, en laag genoeg dat geautomatiseerd raden dood is.
export const PIN_LENGTH = 8;
export const PIN_TTL_DAYS = 7;
export const PIN_MAX_ATTEMPTS = 10;

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
//
// ⚠️ Bewuste afweging, expliciet gemaakt omdat hij twee kanten heeft. Deze verificatie kost
// ~46 ms en ~32 MB (scrypt N=16384, r=16), en het dummy-pad is per definitie onbegrensd: er
// is geen rij die dood kan gaan, dus een ongeauthenticeerde beller kan er onbeperkt werk
// mee opstoken. Waarom hier tóch géén rem in deze laag zit:
//   • De dúre kant is begrensd waar dat kan: een échte verificatie kost hoogstens
//     PIN_MAX_ATTEMPTS per PIN (het slot hierboven). Dat een verkeerd gevórmde PIN niets
//     meer kost (PIN_FORMAT) helpt tegen typefouten, niet tegen een vloed — die stuurt
//     gewoon acht cijfers. Reken het niet mee als maatregel.
//   • Een teller in dit proces zou op Vercel schijnveiligheid zijn: elke invocatie is een
//     eigen isolate, dus een vloed start gewoon nieuwe instances met elk een verse teller.
//     Een comment die suggereert dat het beschermd is, is erger dan geen comment.
//   • In Node/Bun draait scrypt op de libuv-threadpool (4 threads by default). Dat begrenst
//     het gelijktijdige gehéugen binnen één instance op ~128 MB — maar niet de wachtrij:
//     wachtende aanroepen stapelen zich op. Het faalgedrag is dus oplopende latency en
//     functie-timeouts, niet OOM. Onbeschikbaarheid blijft bereikbaar; alleen crasht het niet.
//   • Better Auth' eigen /sign-in/email doet óók een volledige verificatie per foute poging,
//     maar is via de HTTP-route wél beschermd: de rate limiter staat in productie standaard
//     aan (context/create-context.mjs — `options.rateLimit?.enabled ?? isProduction`) met
//     /sign-in* op 3 per 10 s. De gelijkstelling gaat pas op zodra je auth.api.* vanuit een
//     server action aanroept — dan zit je buiten die router. En de standaard-opslag van die
//     limiter is "memory", dus per instance: op Vercel is ook dát grotendeels papier.
// De echte rem hoort dus één laag hoger, op de route/edge, en geldt dan voor /activate én
// /login tegelijk. Staat als openstaand punt voor 3.2a in HANDOVER.md.
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
 *
 * ⚠️ Deze functie beslist NIET wie er een PIN mag krijgen en met welke rol — dat is besluit
 * G36 en dat staat in lib/repo/authz.ts. Dit is de kale schrijffunctie, bedoeld voor
 * migraties, seeds en tests. **App-code (server actions, route handlers) roept hem nooit
 * rechtstreeks aan, maar altijd via `issuePinAsActor()`**, die de bevoegdheid uit de sessie
 * en de database afleidt. `lib/repo/authz-deuren.test.ts` bewaakt die regel.
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

  // ⚠️ Géén transactie mogelijk: de neon-http-driver kent er geen
  // (node_modules/drizzle-orm/neon-http/session.js:151 gooit "No transactions support").
  // De vier schrijfacties hieronder staan dus los van elkaar, en de volgorde is gekozen op
  // wat er overblijft als er halverwege iets misgaat:
  //   1. de organisatie controleren — een goedkope SELECT vóór er iets geschreven wordt,
  //      zodat een verkeerde orgId geen spookgebruiker achterlaat die daarna niet meer als
  //      nieuw herkend wordt;
  //   2. het membership (idempotent, upsert op org+e-mail);
  //   3. de user-rij, conflict-tolerant, zodat twee gelijktijdige uitgiftes voor hetzelfde
  //      adres geen rauwe unique-violation naar de aanroeper laten lekken;
  //   4. de PIN zelf, als laatste — mislukt er iets eerder, dan is er simpelweg geen PIN.
  //
  // ⚠️ Membership vóór de user-rij, en dat is een correctie (critic, ronde 2). Andersom
  // bleef er bij een mislukte membership-insert een user-rij zonder membership achter, en
  // dát is precies de toestand waarin regel 2c van G36 (lib/repo/authz.ts) een org_admin
  // voorgoed de deur wijst: "bestaand account zonder membership" mag hij niet aanraken. Eén
  // mislukte uitgifte zou een adres dus permanent onbruikbaar maken voor de enige persoon
  // die hem mag uitnodigen. Nu blijft in dat geval hooguit een membership zónder user-rij
  // achter, en dat herstelt zichzelf bij de volgende poging (upsert + insert).
  if (input.orgId) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.orgId))
      .limit(1);
    if (!org) {
      throw new Error("issueActivationPin: onbekende organisatie");
    }
    await addMembership(db, {
      orgId: input.orgId,
      email,
      roles: input.roles ?? [],
      actor: input.actor,
    });
  }

  const existing = await findUserByEmail(db, email);
  let userCreated = false;
  if (!existing) {
    // onConflictDoNothing: verliest deze aanroep de race met een gelijktijdige uitgifte,
    // dan komt er geen rij bij en geen fout uit — de ander heeft hem al gemaakt.
    const inserted = await db
      .insert(authSchema.user)
      .values({
        id: crypto.randomUUID(),
        name: input.name?.trim() || email.split("@")[0],
        email,
        // Nog niet geverifieerd: dat wordt hij pas als hij de PIN verzilvert, want daarmee
        // bewijst hij dat hij het mailtje van Brink echt heeft ontvangen.
        emailVerified: false,
      })
      .onConflictDoNothing()
      .returning({ id: authSchema.user.id });
    userCreated = inserted.length > 0;
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

  return { email, pin, expiresAt, userCreated };
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
 * ⚠️ De volgorde hieronder is de veiligheidsgarantie, niet een stijlkeuze. Het pogingen-slot
 * wordt AFGESCHREVEN VÓÓR de verificatie, in één UPDATE waarin alle doodsoorzaken van een
 * PIN (gebruikt, verlopen, teller vol) in de WHERE staan. Lees-verifieer-schrijf zou hier
 * fataal zijn: scrypt duurt ~46 ms, en in dat venster leest élke gelijktijdige aanroep
 * dezelfde stale teller en passeert de poort. Gemeten op de vorige versie: 200 parallelle
 * gokken werden alle 200 beoordeeld en de teller eindigde op 200. De lat zegt 5.
 * Bewijs dat dit nu klopt: "parallel gokken" in lib/repo/activation.test.ts — sequentieel
 * aftellen kan deze fout per constructie niet vangen.
 */
export type PinCheck = { ok: true; email: string } | { ok: false };

const PIN_FORMAT = /^[0-9]{8}$/;

export async function checkActivationPin(
  db: AppDb,
  email: string,
  pin: string,
  now = new Date(),
): Promise<PinCheck> {
  const normalized = normalizeEmail(email);

  // Vormcontrole vóór al het rekenwerk. Dit gaat uitsluitend over wat de béller instuurde,
  // niet over wat er in de database staat, dus het verraadt niets over welke adressen
  // bestaan — en het scheelt een scrypt-verificatie bij elke onzin-invoer.
  if (!PIN_FORMAT.test(pin)) return { ok: false };

  // Het slot claimen: teller +1, maar alleen als de PIN op dit moment nog levend is.
  // Geen rij terug = geen slot = geweigerd, wat de reden ook was.
  const [claimed] = normalized
    ? await db
        .update(activationPins)
        .set({ attempts: sql`${activationPins.attempts} + 1` })
        .where(
          and(
            eq(activationPins.email, normalized),
            isNull(activationPins.usedAt),
            lt(activationPins.attempts, PIN_MAX_ATTEMPTS),
            gt(activationPins.expiresAt, now),
          ),
        )
        .returning({ pinHash: activationPins.pinHash })
    : [];

  // Altijd exact één scrypt-verificatie, ook zonder slot: het dummy-pad kost hetzelfde als
  // het echte pad, dus de responstijd verraadt niet of dit adres bestaat (§3a).
  const hash = claimed?.pinHash ?? (await dummyPinHash());
  const matches = await verifyPassword({ hash, password: pin });

  if (!claimed) return { ok: false };
  if (!matches) return { ok: false };

  // Geslaagd: de zojuist afgeschreven poging wordt teruggegeven. Wie zich eerst vertypt en
  // het daarna goed doet, houdt zijn volle tegoed — de teller straft alleen fouten.
  await db
    .update(activationPins)
    .set({ attempts: 0 })
    .where(eq(activationPins.email, normalized));
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
