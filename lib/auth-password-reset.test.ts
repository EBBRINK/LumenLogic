// Wachtwoord-resetflow op PGlite (docs/goal-wachtwoord-reset.md, bouwstap 6). Zelfde
// constructie als lib/auth-activation.test.ts: createAuth(db) praat tegen dezelfde
// PGlite-database als de repo-laag, dus de hele flow — request → token in `verification` →
// reset → sessies ingetrokken — is hier zonder Neon te bewijzen.
import { expect, test } from "vitest";
import { eq, like } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/test-db";
import * as authSchema from "@/db/auth-schema";
import { events } from "@/db/schema";
import { MIN_PASSWORD_LENGTH, createAuth } from "@/lib/auth-factory";
import { redeemActivationPin } from "@/lib/auth-activation";
import { issueActivationPin } from "@/lib/repo/activation";
import type { MailMessage, Mailer } from "@/lib/mail";

const WACHTWOORD = "zonnigmaandag24";
const NIEUW_WACHTWOORD = "regenachtigedinsdag";

// De mailer is een geïnjecteerde seam (docs/goal-auth-mail.md): geen console-capture
// meer, de test vangt de berichten zelf op.
function captureMailer() {
  const verzonden: MailMessage[] = [];
  const mailer: Mailer = async (msg) => {
    verzonden.push(msg);
  };
  return { verzonden, mailer };
}

function testAuth(db: TestDb, mailer?: Mailer) {
  return createAuth(db, {
    baseURL: "http://localhost:3000",
    secret: "lumenlogic-test-secret-0123456789abcdef",
    ...(mailer ? { mailer } : {}),
  });
}

function cookieHeaders(headers: Headers): Headers {
  const raw = headers.getSetCookie();
  const pairs = raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
  return new Headers({ cookie: pairs.join("; ") });
}

// Een geactiveerd account mét wachtwoord, zoals de PIN-flow het achterlaat.
async function activatedUser(db: TestDb, auth: ReturnType<typeof testAuth>, email: string) {
  const { pin, email: genormaliseerd } = await issueActivationPin(db, { email });
  const resultaat = await redeemActivationPin(auth, db, {
    email: genormaliseerd,
    pin,
    newPassword: WACHTWOORD,
  });
  if (!resultaat.ok) throw new Error("activatie hoort te slagen");
  return resultaat;
}

// Het token zoals de server action het uit ?token= zou halen — hier rechtstreeks uit de
// verification-tabel (identifier `reset-password:<token>`), want er draait geen browser
// om de callback-redirect te volgen.
async function resetTokens(db: TestDb): Promise<string[]> {
  const rijen = await db
    .select()
    .from(authSchema.verification)
    .where(like(authSchema.verification.identifier, "reset-password:%"));
  return rijen.map((r) => r.identifier.slice("reset-password:".length));
}

async function eventActions(db: TestDb): Promise<string[]> {
  return (await db.select().from(events)).map((e) => e.action);
}

test("acceptatie: request → token uit verification → reset → oude sessie dood, nieuw wachtwoord werkt, oud faalt — mét events", async () => {
  const db = await createTestDb();
  const { verzonden, mailer } = captureMailer();
  const auth = testAuth(db, mailer);
  const user = await activatedUser(db, auth, "reset@extern.nl");

  // De 'gestolen' sessie die een reset juist moet doden.
  const gestolen = await auth.api.signInEmail({
    body: { email: "reset@extern.nl", password: WACHTWOORD },
    returnHeaders: true,
  });
  const gestolenHeaders = cookieHeaders(gestolen.headers);
  expect(await auth.api.getSession({ headers: gestolenHeaders })).not.toBeNull();

  // 1. Request: mail via de geïnjecteerde mailer, token in de verification-tabel.
  await auth.api.requestPasswordReset({
    body: { email: "reset@extern.nl", redirectTo: "/reset-password" },
  });
  expect(verzonden).toHaveLength(1);
  expect(verzonden[0].to).toBe("reset@extern.nl");
  expect(verzonden[0].kind).toBe("password_reset");
  const tokens = await resetTokens(db);
  expect(tokens).toHaveLength(1);
  // De mail draagt hetzelfde token als de verification-rij — in de link én de tekst.
  expect(verzonden[0].url).toContain(tokens[0]);
  expect(verzonden[0].text).toContain(tokens[0]);

  // 2. Reset met dat token.
  await auth.api.resetPassword({
    body: { token: tokens[0], newPassword: NIEUW_WACHTWOORD },
  });

  // 3. Elke bestaande sessie is ingetrokken (revokeSessionsOnPasswordReset).
  expect(await auth.api.getSession({ headers: gestolenHeaders })).toBeNull();
  expect(await db.select().from(authSchema.session)).toHaveLength(0);

  // 4. Het oude wachtwoord faalt, het nieuwe werkt.
  await expect(
    auth.api.signInEmail({ body: { email: "reset@extern.nl", password: WACHTWOORD } }),
  ).rejects.toThrow();
  const opnieuw = await auth.api.signInEmail({
    body: { email: "reset@extern.nl", password: NIEUW_WACHTWOORD },
    returnHeaders: true,
  });
  expect(opnieuw.response.user.id).toBe(user.userId);

  // 5. Alle events staan in de events-tabel (ijzeren regel 5) — óók de mailverzending.
  const acties = await eventActions(db);
  expect(acties).toContain("password_reset_requested");
  expect(acties).toContain("password_reset_completed");
  expect(acties).toContain("auth_mail_sent");
  // Nooit de URL of het token in een event-payload.
  const alleEvents = await db.select().from(events);
  for (const e of alleEvents) {
    expect(JSON.stringify(e.payload ?? {})).not.toContain(tokens[0]);
  }
});

test("anti-enumeratie: onbekend adres geeft identieke respons, mailer nooit aangeroepen, geen token, geen event", async () => {
  const db = await createTestDb();
  const { verzonden, mailer } = captureMailer();
  const auth = testAuth(db, mailer);
  await activatedUser(db, auth, "bestaat@extern.nl");

  const bekend = await auth.api.requestPasswordReset({
    body: { email: "bestaat@extern.nl", redirectTo: "/reset-password" },
  });
  const onbekend = await auth.api.requestPasswordReset({
    body: { email: "bestaatniet@extern.nl", redirectTo: "/reset-password" },
  });

  // Byte-identieke respons voor beide adressen.
  expect(onbekend).toEqual(bekend);
  // Maar de mailer vuurde alléén voor het echte account — voor het onbekende adres is
  // hij nooit aangeroepen.
  expect(verzonden).toHaveLength(1);
  expect(verzonden[0].to).toBe("bestaat@extern.nl");
  expect(await resetTokens(db)).toHaveLength(1);
  expect(
    (await eventActions(db)).filter((a) => a === "password_reset_requested"),
  ).toHaveLength(1);
});

test("throttle: tweede request binnen 10 minuten wordt stil overgeslagen — geen tweede mail, geen tweede event", async () => {
  const db = await createTestDb();
  const { verzonden, mailer } = captureMailer();
  const auth = testAuth(db, mailer);
  await activatedUser(db, auth, "ongeduldig@extern.nl");

  const eerste = await auth.api.requestPasswordReset({
    body: { email: "ongeduldig@extern.nl", redirectTo: "/reset-password" },
  });
  const tweede = await auth.api.requestPasswordReset({
    body: { email: "ongeduldig@extern.nl", redirectTo: "/reset-password" },
  });

  // Respons identiek (geen lek), maar er ging maar één mail uit en er staat maar één
  // request-event — de rem leunt op de events-tabel.
  expect(tweede).toEqual(eerste);
  expect(verzonden).toHaveLength(1);
  const acties = await eventActions(db);
  expect(acties.filter((a) => a === "password_reset_requested")).toHaveLength(1);
  expect(acties.filter((a) => a === "auth_mail_sent")).toHaveLength(1);

  // Is het request-event ouder dan 10 minuten, dan mag het wél weer.
  await db
    .update(events)
    .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
    .where(eq(events.action, "password_reset_requested"));
  await auth.api.requestPasswordReset({
    body: { email: "ongeduldig@extern.nl", redirectTo: "/reset-password" },
  });
  expect(verzonden).toHaveLength(2);
});

test("falende mailer: flow loopt door, neutrale respons, auth_mail_failed-event en de URL alsnog in de console", async () => {
  const db = await createTestDb();
  const kapotteMailer = async () => {
    throw new Error("Resend antwoordde 500 voor password_reset-mail");
  };
  const auth = testAuth(db, kapotteMailer);
  await activatedUser(db, auth, "pech@extern.nl");

  const regels: string[] = [];
  const echteLog = console.log;
  console.log = (...args: unknown[]) => {
    regels.push(args.map(String).join(" "));
    echteLog(...args);
  };
  let respons: unknown;
  try {
    // Nooit throwen naar Better Auth: de aanroep slaagt gewoon.
    respons = await auth.api.requestPasswordReset({
      body: { email: "pech@extern.nl", redirectTo: "/reset-password" },
    });
  } finally {
    console.log = echteLog;
  }
  expect(respons).toBeTruthy();

  // Het token bestaat en de flow is gewoon af te maken via de console-URL (vangnet).
  const [token] = await resetTokens(db);
  expect(token).toBeTruthy();
  const vangnet = regels.filter((r) => r.includes("[auth] password reset"));
  expect(vangnet).toHaveLength(1);
  expect(vangnet[0]).toContain(token);

  // Events: wél requested + failed, géén sent. De payload draagt het soort, nooit de URL.
  const acties = await eventActions(db);
  expect(acties).toContain("password_reset_requested");
  expect(acties).toContain("auth_mail_failed");
  expect(acties).not.toContain("auth_mail_sent");
  const [failed] = (await db.select().from(events)).filter(
    (e) => e.action === "auth_mail_failed",
  );
  expect(failed.payload?.kind).toBe("password_reset");
  expect(JSON.stringify(failed.payload)).not.toContain(token);

  await auth.api.resetPassword({ body: { token, newPassword: NIEUW_WACHTWOORD } });
  const login = await auth.api.signInEmail({
    body: { email: "pech@extern.nl", password: NIEUW_WACHTWOORD },
  });
  expect(login.user.email).toBe("pech@extern.nl");
});

test("token-hergebruik faalt: de tweede reset met hetzelfde token gaat niet om", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  await activatedUser(db, auth, "tweemaal@extern.nl");

  await auth.api.requestPasswordReset({
    body: { email: "tweemaal@extern.nl", redirectTo: "/reset-password" },
  });
  const [token] = await resetTokens(db);
  await auth.api.resetPassword({ body: { token, newPassword: NIEUW_WACHTWOORD } });

  // Zelfde token nog eens → geweigerd, en het wachtwoord van de eigenaar blijft staan.
  await expect(
    auth.api.resetPassword({ body: { token, newPassword: "ingebrokenwachtwoord" } }),
  ).rejects.toThrow();
  await expect(
    auth.api.signInEmail({
      body: { email: "tweemaal@extern.nl", password: "ingebrokenwachtwoord" },
    }),
  ).rejects.toThrow();
  const nog = await auth.api.signInEmail({
    body: { email: "tweemaal@extern.nl", password: NIEUW_WACHTWOORD },
  });
  expect(nog.user.email).toBe("tweemaal@extern.nl");
});

test("verlopen token (na 15 min) wordt geweigerd", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  await activatedUser(db, auth, "verlopen@extern.nl");

  await auth.api.requestPasswordReset({
    body: { email: "verlopen@extern.nl", redirectTo: "/reset-password" },
  });
  const [token] = await resetTokens(db);

  // resetPasswordTokenExpiresIn staat op 15 minuten; zet de klok 16 minuten verder door
  // de expiry in de verification-rij terug te draaien (er is geen fake-timers-haak in
  // Better Auth' consumeVerificationValue).
  await db
    .update(authSchema.verification)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(like(authSchema.verification.identifier, "reset-password:%"));

  await expect(
    auth.api.resetPassword({ body: { token, newPassword: NIEUW_WACHTWOORD } }),
  ).rejects.toThrow();
  // Het oude wachtwoord geldt nog.
  const nog = await auth.api.signInEmail({
    body: { email: "verlopen@extern.nl", password: WACHTWOORD },
  });
  expect(nog.user.email).toBe("verlopen@extern.nl");
});

test("te kort wachtwoord wordt geweigerd en verbruikt het token niet", async () => {
  const db = await createTestDb();
  const auth = testAuth(db);
  await activatedUser(db, auth, "kort@extern.nl");

  await auth.api.requestPasswordReset({
    body: { email: "kort@extern.nl", redirectTo: "/reset-password" },
  });
  const [token] = await resetTokens(db);

  await expect(
    auth.api.resetPassword({
      body: { token, newPassword: "a".repeat(MIN_PASSWORD_LENGTH - 1) },
    }),
  ).rejects.toThrow();
  // De lengtecheck zit vóór het consumeren van het token, dus dezelfde link werkt daarna
  // gewoon nog met een wél geldig wachtwoord.
  await auth.api.resetPassword({
    body: { token, newPassword: "a".repeat(MIN_PASSWORD_LENGTH) },
  });
});

test("randgeval: magic-link-only account (geen credential) — reset zet een wachtwoord zonder gat", async () => {
  const db = await createTestDb();
  const { verzonden, mailer } = captureMailer();
  const auth = testAuth(db, mailer);

  // Een user-rij zoals de magic-link-flow die achterlaat: wel een account in `user`,
  // géén credential-rij in `account` (er is nooit een wachtwoord gezet).
  const [magicUser] = await db
    .insert(authSchema.user)
    .values({
      id: crypto.randomUUID(),
      name: "timo",
      email: "timo@jouwainstein.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  expect(await db.select().from(authSchema.account)).toHaveLength(0);

  // De request werkt óók voor dit account — geen allowlist- of credential-poort.
  await auth.api.requestPasswordReset({
    body: { email: "timo@jouwainstein.com", redirectTo: "/reset-password" },
  });
  expect(verzonden).toHaveLength(1);
  expect(verzonden[0].kind).toBe("password_reset");
  const [token] = await resetTokens(db);
  await auth.api.resetPassword({ body: { token, newPassword: NIEUW_WACHTWOORD } });

  // Geen gat: er is geen twééde user ontstaan, alleen een credential-account op de
  // bestaande user — en het token bewees het postvak, precies zoals een PIN dat doet.
  const users = await db.select().from(authSchema.user);
  expect(users).toHaveLength(1);
  const accounts = await db
    .select()
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, magicUser.id));
  expect(accounts).toHaveLength(1);
  expect(accounts[0].providerId).toBe("credential");
  expect(accounts[0].password).toBeTruthy();
  expect(accounts[0].password).not.toContain(NIEUW_WACHTWOORD);

  // En inloggen met het nieuwe wachtwoord werkt, als deze user — geen sessie ontstond
  // tijdens de reset zelf.
  expect(await db.select().from(authSchema.session)).toHaveLength(0);
  const login = await auth.api.signInEmail({
    body: { email: "timo@jouwainstein.com", password: NIEUW_WACHTWOORD },
  });
  expect(login.user.id).toBe(magicUser.id);
});
