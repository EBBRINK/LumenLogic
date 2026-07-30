// De eerste test die dit project op Better Auth heeft. Hij draait de héle onboarding-flow
// op PGlite: PIN aanmaken → invullen → wachtwoord zetten → inloggen → uitloggen → opnieuw
// inloggen, plus alle faalpaden uit §3a van de sprint-3.1-briefing.
//
// Dat dit kán is besluit G30: lib/auth.ts is een factory (createAuth(db)) in plaats van een
// module-singleton, dus de auth-instantie hieronder praat tegen dezelfde PGlite-database als
// de repo-laag. De singleton `auth` uit lib/auth.ts is dezelfde constructie met de Neon-db.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/test-db";
import * as authSchema from "@/db/auth-schema";
import { organizations } from "@/db/schema";
import { MIN_PASSWORD_LENGTH, createAuth } from "@/lib/auth-factory";
import { changeOwnPassword, redeemActivationPin } from "@/lib/auth-activation";
import { createOrganization, getUserMemberships } from "@/lib/repo/orgs";
import {
  PIN_MAX_ATTEMPTS,
  checkActivationPin,
  getActivationPinStatus,
  issueActivationPin,
} from "@/lib/repo/activation";

const WACHTWOORD = "zonnigmaandag24";
const NIEUW_WACHTWOORD = "regenachtigedinsdag";

// nextCookies staat bewust uit: die plugin schrijft in de cookie-jar van een Next-request,
// en die bestaat hier niet. De tests lezen Set-Cookie zelf uit de response — precies wat de
// plugin in productie voor je doet.
function testAuth(db: TestDb) {
  return createAuth(db, {
    baseURL: "http://localhost:3000",
    secret: "lumenlogic-test-secret-0123456789abcdef",
  });
}

// Set-Cookie uit een antwoord omzetten naar een Cookie-request-header, zodat een
// vervolgaanroep "ingelogd" is.
function cookieHeaders(headers: Headers): Headers {
  const raw = headers.getSetCookie();
  const pairs = raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
  return new Headers({ cookie: pairs.join("; ") });
}

async function brinkOrgId(db: TestDb) {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"));
  return org.id;
}

async function credentialAccount(db: TestDb, userId: string) {
  const rijen = await db
    .select()
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, userId));
  return rijen.find((a) => a.providerId === "credential") ?? null;
}

test("acceptatie: PIN aanmaken → invullen → wachtwoord zetten → inloggen → uitloggen → opnieuw inloggen", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  // Een échte externe organisatie, niet de Brink-org: het doel van 3.1 is dat de gebruiker
  // ná activatie in de JUISTE organisatie zit, en dat bewijs je alleen als er meer dan één
  // org is om in te belanden.
  const externeOrg = await createOrganization(db, { name: "Installatiebedrijf Extern" });
  const orgId = externeOrg.id;

  // 1. Brink maakt het account aan. De PIN komt één keer terug — hierna nooit meer.
  const uitgifte = await issueActivationPin(db, {
    email: "Nieuwe.Installateur@Extern.NL",
    orgId,
    roles: ["projectleider"],
    actor: "e.brink@brinklicht.nl",
  });
  expect(uitgifte.pin).toMatch(/^[0-9]{8}$/);
  expect(uitgifte.email).toBe("nieuwe.installateur@extern.nl");

  // Op dit moment bestaat er nog géén wachtwoord en géén sessie.
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
  expect(await db.select().from(authSchema.account)).toHaveLength(0);

  // 2. De PIN invullen alléén levert nog steeds geen sessie op (§3a).
  expect(await checkActivationPin(db, uitgifte.email, uitgifte.pin)).toEqual({
    ok: true,
    email: uitgifte.email,
  });
  expect(await db.select().from(authSchema.session)).toHaveLength(0);

  // 3. Wachtwoord zetten. Pas hier — en pas ná het schrijven van het wachtwoord —
  //    ontstaat de sessie.
  const resultaat = await redeemActivationPin(auth, db, {
    email: " nieuwe.installateur@EXTERN.nl ",
    pin: uitgifte.pin,
    newPassword: WACHTWOORD,
  });
  expect(resultaat.ok).toBe(true);
  if (!resultaat.ok) return;
  expect(resultaat.email).toBe("nieuwe.installateur@extern.nl");
  expect(resultaat.token).toBeTruthy();

  // Het wachtwoord staat gehasht in Better Auth' account-tabel, niet in klaartekst.
  const account = await credentialAccount(db, resultaat.userId);
  expect(account?.password).toBeTruthy();
  expect(account?.password).not.toBe(WACHTWOORD);
  expect(account?.password).not.toContain(WACHTWOORD);

  // Het adres is nu geverifieerd: de PIN uit Brinks mailtje bewijst toegang tot het postvak.
  const [gebruiker] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.id, resultaat.userId));
  expect(gebruiker.emailVerified).toBe(true);

  // De PIN is op.
  expect((await getActivationPinStatus(db, uitgifte.email)).state).toBe("gebruikt");

  // 4. De sessie werkt.
  const naActivatie = cookieHeaders(resultaat.headers);
  const sessie = await auth.api.getSession({ headers: naActivatie });
  expect(sessie?.user.email).toBe("nieuwe.installateur@extern.nl");

  // 5. Uitloggen.
  await auth.api.signOut({ headers: naActivatie });
  expect(await auth.api.getSession({ headers: naActivatie })).toBeNull();
  expect(await db.select().from(authSchema.session)).toHaveLength(0);

  // 6. Opnieuw inloggen met het zelfgekozen wachtwoord.
  const opnieuw = await auth.api.signInEmail({
    body: { email: "nieuwe.installateur@extern.nl", password: WACHTWOORD },
    returnHeaders: true,
  });
  expect(opnieuw.response.user.email).toBe("nieuwe.installateur@extern.nl");
  const tweedeSessie = await auth.api.getSession({
    headers: cookieHeaders(opnieuw.headers),
  });
  expect(tweedeSessie?.user.id).toBe(resultaat.userId);

  // 7. En hij ziet zijn EIGEN organisatie — de laatste zin van "klaar wanneer" uit de
  //    opdracht. Eén membership, in de externe org waarvoor Brink de PIN uitgaf, met de rol
  //    die Brink meegaf. Uitdrukkelijk NIET de interne Brink-org: dat die er ook is (0017
  //    zaait hem) maakt dit pas een echte toets.
  const lidmaatschappen = await getUserMemberships(db, tweedeSessie!.user.email);
  expect(lidmaatschappen).toHaveLength(1);
  expect(lidmaatschappen[0].orgId).toBe(orgId);
  expect(lidmaatschappen[0].orgName).toBe("Installatiebedrijf Extern");
  expect(lidmaatschappen[0].roles).toEqual(["projectleider"]);
  expect(lidmaatschappen[0].orgId).not.toBe(await brinkOrgId(db));
});

test("faalpad: verkeerde PIN zet geen wachtwoord en geeft geen sessie", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "fout@extern.nl" });
  const foutePin = pin === "00000000" ? "11111111" : "00000000";

  const uitslag = await redeemActivationPin(auth, db, {
    email,
    pin: foutePin,
    newPassword: WACHTWOORD,
  });
  expect(uitslag).toEqual({ ok: false, reason: "invalid" });
  expect(await db.select().from(authSchema.account)).toHaveLength(0);
  expect(await db.select().from(authSchema.session)).toHaveLength(0);

  // De PIN is niet opgebrand — alleen de teller liep op.
  const status = await getActivationPinStatus(db, email);
  expect(status.state).toBe("actief");
  expect(status.attempts).toBe(1);

  // Met de goede PIN lukt het alsnog.
  const goed = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: WACHTWOORD,
  });
  expect(goed.ok).toBe(true);
});

test("faalpad: verlopen PIN (na 7 dagen) geeft dezelfde generieke afwijzing", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const toen = new Date("2026-07-01T09:00:00Z");
  const { pin, email } = await issueActivationPin(db, {
    email: "verlopen@extern.nl",
    now: toen,
  });

  const uitslag = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: WACHTWOORD,
    now: new Date("2026-07-09T09:00:00Z"), // 8 dagen later
  });
  expect(uitslag).toEqual({ ok: false, reason: "invalid" });
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
});

test("faalpad: dezelfde PIN een tweede keer gebruiken faalt en laat het wachtwoord ongemoeid", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "tweemaal@extern.nl" });

  const eerste = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: WACHTWOORD,
  });
  expect(eerste.ok).toBe(true);

  const tweede = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: "ingebrokenwachtwoord",
  });
  expect(tweede).toEqual({ ok: false, reason: "invalid" });

  // Het door de eigenaar gekozen wachtwoord geldt nog; het tweede is nooit gezet.
  await expect(
    auth.api.signInEmail({
      body: { email, password: "ingebrokenwachtwoord" },
    }),
  ).rejects.toThrow();
  const nog = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    returnHeaders: true,
  });
  expect(nog.response.user.email).toBe(email);
});

test("faalpad: na 5 foute pogingen is de PIN dood — de zesde poging faalt mét de juiste code", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "vijfmaal@extern.nl" });
  const foutePin = pin === "00000000" ? "11111111" : "00000000";

  for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) {
    expect(
      await redeemActivationPin(auth, db, {
        email,
        pin: foutePin,
        newPassword: WACHTWOORD,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  }

  expect(
    await redeemActivationPin(auth, db, { email, pin, newPassword: WACHTWOORD }),
  ).toEqual({ ok: false, reason: "invalid" });
  expect((await getActivationPinStatus(db, email)).state).toBe("geblokkeerd");
  expect(await db.select().from(authSchema.account)).toHaveLength(0);

  // Alleen een nieuwe PIN van Brink helpt nog — en die werkt meteen.
  const nieuw = await issueActivationPin(db, { email });
  expect(
    (await redeemActivationPin(auth, db, { email, pin: nieuw.pin, newPassword: WACHTWOORD }))
      .ok,
  ).toBe(true);
});

test("faalpad: onbekend e-mailadres verraadt niets en maakt niets aan", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  await issueActivationPin(db, { email: "bestaat@extern.nl" });

  const uitslag = await redeemActivationPin(auth, db, {
    email: "bestaatniet@extern.nl",
    pin: "12345678",
    newPassword: WACHTWOORD,
  });
  // Letterlijk hetzelfde antwoord als bij een verkeerde PIN op een bestaand adres.
  expect(uitslag).toEqual({ ok: false, reason: "invalid" });
  expect(
    await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, "bestaatniet@extern.nl")),
  ).toHaveLength(0);
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
});

test("te kort wachtwoord wordt geweigerd en brandt de PIN niet op", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "kort@extern.nl" });

  const teKort = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  expect(
    await redeemActivationPin(auth, db, { email, pin, newPassword: teKort }),
  ).toEqual({ ok: false, reason: "weak_password" });
  // De PIN is niet verbruikt en er is geen poging afgeschreven: dit ging over het
  // wachtwoord, niet over de PIN.
  const status = await getActivationPinStatus(db, email);
  expect(status.state).toBe("actief");
  expect(status.attempts).toBe(0);

  // Precies op de grens lukt het wel.
  const opDeGrens = "a".repeat(MIN_PASSWORD_LENGTH);
  expect(
    (await redeemActivationPin(auth, db, { email, pin, newPassword: opDeGrens })).ok,
  ).toBe(true);
});

test("zelfregistratie is uit: /sign-up/email weigert onvoorwaardelijk", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);

  await expect(
    auth.api.signUpEmail({
      body: {
        email: "indringer@extern.nl",
        password: "ikmaakzelfeenaccount",
        name: "Indringer",
      },
    }),
  ).rejects.toThrow();

  // Geen user, geen account, geen sessie — accounts ontstaan uitsluitend via een PIN.
  expect(await db.select().from(authSchema.user)).toHaveLength(0);
  expect(await db.select().from(authSchema.account)).toHaveLength(0);
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
});

test("inloggen met een verkeerd wachtwoord faalt, met het goede lukt het", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "inlog@extern.nl" });
  await redeemActivationPin(auth, db, { email, pin, newPassword: WACHTWOORD });

  await expect(
    auth.api.signInEmail({ body: { email, password: "ietsandersgeheel" } }),
  ).rejects.toThrow();
  // Ook een bestaand adres met een fout wachtwoord levert geen sessie op.
  const sessies = await db.select().from(authSchema.session);
  expect(sessies).toHaveLength(1); // alleen die van de activatie
});

test("een ingelogde gebruiker wijzigt zelf zijn wachtwoord, mét opgave van het huidige (G34)", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "wijzig@extern.nl" });
  const activatie = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: WACHTWOORD,
  });
  expect(activatie.ok).toBe(true);
  if (!activatie.ok) return;
  const headers = cookieHeaders(activatie.headers);

  // Zonder het juiste huidige wachtwoord gaat er niets om.
  await expect(
    changeOwnPassword(auth, {
      currentPassword: "verkeerdhuidigww",
      newPassword: NIEUW_WACHTWOORD,
      headers,
    }),
  ).rejects.toThrow();

  // Met het juiste huidige wachtwoord wél.
  const na = await changeOwnPassword(auth, {
    currentPassword: WACHTWOORD,
    newPassword: NIEUW_WACHTWOORD,
    headers,
  });

  // Het oude wachtwoord werkt niet meer, het nieuwe wel.
  await expect(
    auth.api.signInEmail({ body: { email, password: WACHTWOORD } }),
  ).rejects.toThrow();
  const opnieuw = await auth.api.signInEmail({
    body: { email, password: NIEUW_WACHTWOORD },
    returnHeaders: true,
  });
  expect(opnieuw.response.user.email).toBe(email);

  // De wijzigende sessie zelf blijft bruikbaar — Better Auth geeft er een verse voor terug.
  expect(
    (await auth.api.getSession({ headers: cookieHeaders(na.headers) }))?.user.email,
  ).toBe(email);
});

test("B1: wachtwoord wijzigen trekt élke andere sessie in, niet alleen het oude wachtwoord", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const { pin, email } = await issueActivationPin(db, { email: "sessies@extern.nl" });
  const activatie = await redeemActivationPin(auth, db, {
    email,
    pin,
    newPassword: WACHTWOORD,
  });
  expect(activatie.ok).toBe(true);
  if (!activatie.ok) return;

  // Sessie A: de gestolen laptop / het gelekte cookie.
  const gestolen = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    returnHeaders: true,
  });
  const gestolenHeaders = cookieHeaders(gestolen.headers);
  expect(await auth.api.getSession({ headers: gestolenHeaders })).not.toBeNull();

  // Sessie B: de eigenaar, die zijn wachtwoord wijzigt.
  const eigen = cookieHeaders(activatie.headers);
  const na = await changeOwnPassword(auth, {
    currentPassword: WACHTWOORD,
    newPassword: NIEUW_WACHTWOORD,
    headers: eigen,
  });

  // Sessie A is dood. Dít is wat "wachtwoord wijzigen" moet betekenen; een test op het
  // wachtwoord alleen zou hier groen blijven terwijl de dief gewoon binnen is.
  expect(await auth.api.getSession({ headers: gestolenHeaders })).toBeNull();
  expect(
    (await auth.api.getSession({ headers: cookieHeaders(na.headers) }))?.user.email,
  ).toBe(email);
});

test("B1: een nieuwe PIN verzilveren trekt bestaande sessies in (C10 is het énige herstelpad)", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  const eerste = await issueActivationPin(db, { email: "herstel@extern.nl" });
  const activatie = await redeemActivationPin(auth, db, {
    email: eerste.email,
    pin: eerste.pin,
    newPassword: WACHTWOORD,
  });
  expect(activatie.ok).toBe(true);
  if (!activatie.ok) return;
  const oudeSessie = cookieHeaders(activatie.headers);
  expect(await auth.api.getSession({ headers: oudeSessie })).not.toBeNull();

  // Brink geeft een nieuwe PIN (de enige knop die het product heeft), de eigenaar zet een
  // nieuw wachtwoord.
  const tweede = await issueActivationPin(db, { email: "herstel@extern.nl" });
  const opnieuw = await redeemActivationPin(auth, db, {
    email: tweede.email,
    pin: tweede.pin,
    newPassword: NIEUW_WACHTWOORD,
  });
  expect(opnieuw.ok).toBe(true);
  if (!opnieuw.ok) return;

  // De oude sessie is weg — anders is "nieuwe PIN" aantoonbaar geen remedie.
  expect(await auth.api.getSession({ headers: oudeSessie })).toBeNull();
  // Precies één sessie over: de verse.
  expect(await db.select().from(authSchema.session)).toHaveLength(1);
  expect(
    (await auth.api.getSession({ headers: cookieHeaders(opnieuw.headers) }))?.user.email,
  ).toBe("herstel@extern.nl");
});

test("B5: /magic-link/verify maakt geen account aan voor een onbekend adres", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);

  // timo@ staat in de allowlist (migratie 0004) maar heeft in een verse database géén
  // user-rij. Zonder disableSignUp op de magic-link-plugin zou het uitklikken van de link
  // hem alsnog aanmaken — mét emailVerified: true en meteen een sessie.
  const regels: string[] = [];
  const echteLog = console.log;
  console.log = (...args: unknown[]) => {
    regels.push(args.map(String).join(" "));
    echteLog(...args);
  };
  try {
    await auth.api.signInMagicLink({
      body: { email: "timo@jouwainstein.com", callbackURL: "/" },
      headers: new Headers(),
    });
  } finally {
    console.log = echteLog;
  }
  const url = regels
    .find((r) => r.includes("[auth] magic link"))
    ?.match(/https?:\/\/\S+/)?.[0];
  expect(url).toBeTruthy();

  await auth.handler(new Request(url!, { method: "GET", redirect: "manual" }));

  expect(await db.select().from(authSchema.user)).toHaveLength(0);
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
});

test("G32: de magic link staat nog náást het wachtwoordpad, mét de allowlist-poort", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);

  const regels: string[] = [];
  const echteLog = console.log;
  console.log = (...args: unknown[]) => {
    regels.push(args.map(String).join(" "));
    echteLog(...args);
  };
  try {
    // Adres uit de allowlist (gezaaid door migratie 0004) → er wordt een link gemaakt.
    await auth.api.signInMagicLink({
      body: { email: "timo@jouwainstein.com", callbackURL: "/" },
      headers: new Headers(),
    });
    // Adres buiten de allowlist → geen link, geen log (L-02, fail-closed).
    await auth.api.signInMagicLink({
      body: { email: "buitenstaander@extern.nl", callbackURL: "/" },
      headers: new Headers(),
    });
  } finally {
    console.log = echteLog;
  }

  const links = regels.filter((r) => r.includes("[auth] magic link"));
  expect(links).toHaveLength(1);
  expect(links[0]).toContain("timo@jouwainstein.com");
});
