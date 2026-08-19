// Better Auth als factory (besluit G30). De database wordt geïnjecteerd — precies zoals de
// hele repo-laag het al doet — zodat de inlogflow op de PGlite-testdatabase te bewijzen is
// in plaats van alleen op productie.
//
// Waarom dit een eigen bestand is en niet gewoon lib/auth.ts: dáár staat de singleton, en
// die importeert `db` uit db/client.ts — dat bestand gooit bij import al een fout zonder
// DATABASE_URL. Een test die alleen de factory wil, zou dus struikelen over de Neon-client
// die hij nooit gebruikt. lib/auth.ts re-exporteert alles hieronder, dus voor de applicatie
// verandert er niets: `import { auth } from "@/lib/auth"` blijft werken zoals altijd.
//
// Twee inlogpaden staan hier bewust NAAST elkaar (besluit G32, deploy 1):
//   • magic link — het bestaande pad, met de allowlist-poort eronder;
//   • e-mail + wachtwoord — het nieuwe pad, met zelfregistratie hard uit.
// De magic link gaat er pas uit in deploy 2, ná bewezen wachtwoord-login. Zou deploy 1 hem
// meteen weghalen, dan komt niemand meer binnen — ook niet in /admin om de eerste PIN aan
// te maken.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import * as authSchema from "@/db/auth-schema";
import { events } from "@/db/schema";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";
import { isAllowed } from "@/lib/repo/settings";
import { defaultMailer, type MailKind, type Mailer } from "@/lib/mail";

// Wachtwoordbeleid volgens NIST SP 800-63B §5.1.1.2: een ondergrens afdwingen, géén
// samenstellingsregels (geen "minstens één hoofdletter en een leesteken" — dat levert
// aantoonbaar zwakkere wachtwoorden op) en een ruime bovengrens.
// De ondergrens staat bewust op 12 en niet op het NIST-minimum van 8: er draait in deze
// fase geen controle tegen gelekte wachtwoorden (de haveibeenpwned-plugin staat uit) en de
// gebruikers zijn installateurs die dit wachtwoord zelf kiezen na een PIN — lengte is hier
// de enige weerstand die er is. 128 is Better Auth' eigen bovengrens en ruim boven de 64
// die NIST als minimum-maximum vraagt.
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// process.env is er niet in de vitest-browserrun; deze laag moet in beide werelden laden.
function env(key: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

export type CreateAuthOptions = {
  baseURL?: string;
  secret?: string;
  // De next-cookies-plugin schrijft het sessiecookie vanuit een server action. Hij hoort
  // ALTIJD als laatste in de plugin-lijst (Better Auth waarschuwt anders) en staat in tests
  // uit: daar bestaat geen request-scope en lezen de tests Set-Cookie zelf uit de response.
  nextCookies?: boolean;
  // De mail-seam (docs/goal-auth-mail.md): productie krijgt defaultMailer() — Resend als
  // key + MAIL_FROM er zijn, anders de serverconsole — en tests injecteren een
  // capture-mailer, precies zoals de database geïnjecteerd wordt.
  mailer?: Mailer;
};

// Hoe lang een tweede reset-request voor dezelfde user stil wordt overgeslagen.
export const RESET_THROTTLE_MS = 10 * 60 * 1000;

const MAIL_CONSOLE_LABEL: Record<MailKind, string> = {
  password_reset: "password reset",
  magic_link: "magic link",
};

export function createAuth(database: AppDb, options: CreateAuthOptions = {}) {
  const mailer = options.mailer ?? defaultMailer();

  // Eén verzendpad voor beide auth-mails: mail → event → console-vangnet. Eén poging,
  // geen retry; er wordt hier NOOIT gethrowd — de respons naar de client blijft neutraal
  // (anti-enumeratie), ook als de mail faalt. De URL/token komt nooit in een
  // event-payload; bij falen wél alsnog in de serverconsole (Vercel-logs als vangnet).
  async function sendAuthMail(input: {
    kind: MailKind;
    to: string;
    subject: string;
    text: string;
    url: string;
    entityId: string | null;
  }) {
    const { kind, to, subject, text, url, entityId } = input;
    try {
      const receipt = await mailer({ to, subject, text, kind, url });
      await logEvent(database, {
        entity: "user",
        entityId,
        action: "auth_mail_sent",
        actor: to,
        payload: {
          kind,
          ...(receipt?.id ? { messageId: receipt.id } : {}),
          ...(receipt?.status ? { status: receipt.status } : {}),
        },
      });
    } catch (fout) {
      console.log(`[auth] ${MAIL_CONSOLE_LABEL[kind]} voor ${to}: ${url}`);
      await logEvent(database, {
        entity: "user",
        entityId,
        action: "auth_mail_failed",
        actor: to,
        payload: { kind, error: String(fout).slice(0, 500) },
      });
    }
  }

  const magicLinkPlugin = magicLink({
    // Tweede slot op dezelfde deur. `/magic-link/verify` maakt bij een onbekend adres
    // anders zélf een user aan, mét emailVerified: true en meteen een sessie
    // (node_modules/better-auth/dist/plugins/magic-link/index.mjs, "if (!opts.disableSignUp)").
    // De allowlist in sendMagicLink hieronder is de eigenlijke poort, maar dan hangt de
    // garantie "accounts ontstaan alleen via een PIN" aan één laag — terwijl dit één regel
    // is. Veilig voor de bestaande gebruikers: timo@ en e.brink@ hébben een user-rij.
    disableSignUp: true,
    sendMagicLink: async ({ email, url }) => {
      // Allowlist-poort (L-02): staat het adres niet in de lijst, dan gebeurt er
      // niets — geen link, geen log. De login-UI toont altijd dezelfde neutrale
      // melding, dus een buitenstaander kan niet afleiden of een adres bestaat
      // (geen account-enumeratie).
      //
      // Let op: deze poort geldt UITSLUITEND voor de magic link, niet voor het
      // wachtwoordpad. Zou hij ook voor wachtwoorden gelden, dan zou elke externe
      // installateur eerst in Brinks interne allowlist moeten staan en is de hele
      // PIN-onboarding zinloos. De poort onder het wachtwoordpad is dat je een PIN
      // van Brink nodig hebt om überhaupt een wachtwoord te kúnnen zetten.
      if (!(await isAllowed(database, email))) return;
      // Mail via de geïnjecteerde mailer; zonder RESEND_API_KEY + MAIL_FROM valt die
      // terug op de serverconsole (zelfde regels als vroeger, zie lib/mail.ts).
      await sendAuthMail({
        kind: "magic_link",
        to: email,
        subject: "Your Lumen Logic sign-in link",
        text: [
          "Sign in to Lumen Logic with this link:",
          "",
          url,
          "",
          "The link is valid for 5 minutes. If you did not request it, you can ignore this email.",
        ].join("\n"),
        url,
        // De magic-link-callback kent alleen het adres, geen user-id (het account kan
        // zelfs nog niet bestaan) — het adres staat als actor op het event.
        entityId: null,
      });
    },
  });

  return betterAuth({
    // baseURL uit env; op Vercel valt hij terug op de deploy-URL (preview per PR).
    baseURL:
      options.baseURL ??
      env("BETTER_AUTH_URL") ??
      (env("VERCEL_URL") ? `https://${env("VERCEL_URL")}` : undefined),
    ...(options.secret ? { secret: options.secret } : {}),
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      // C10/G26: accounts ontstaan UITSLUITEND doordat Brink een PIN aanmaakt. Er is geen
      // zelfregistratie — /sign-up/email weigert onvoorwaardelijk.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // Irrelevant zolang disableSignUp aanstaat, maar expliciet uit: een sessie ontstaat in
      // deze applicatie alleen na een bewuste inlogactie (§3a: nooit bij het invoeren van
      // de PIN, altijd pas ná het zetten van het wachtwoord).
      autoSignIn: false,
      // Wachtwoord-vergeten-flow (docs/goal-wachtwoord-reset.md). Better Auth core:
      // /request-password-reset + /reset-password; het token landt in de bestaande
      // verification-tabel, dus geen migratie.
      //
      // Deze callback vuurt UITSLUITEND voor bestaande accounts — voor een onbekend adres
      // antwoordt Better Auth identiek zonder hier langs te komen (anti-enumeratie zit dus
      // in de laag eronder, niet hier). Bewust GEEN allowlist-check: die poort geldt alleen
      // voor de magic link; het wachtwoordpad is voor externe installateurs, en wie hier
      // komt hééft al een account (via een PIN van Brink).
      sendResetPassword: async ({ user, url }) => {
        // Throttle: leunt bewust op de events-tabel (geen extra migratie of cache) —
        // staat er al een password_reset_requested voor deze user jonger dan 10 minuten,
        // dan stil overslaan: geen mail, geen event, identieke respons. Dit draait
        // uitsluitend voor échte accounts (onbekende adressen komen hier nooit), dus de
        // overslag lekt niets.
        const recent = await database
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.entityId, user.id),
              eq(events.action, "password_reset_requested"),
              gt(events.createdAt, new Date(Date.now() - RESET_THROTTLE_MS)),
            ),
          )
          .limit(1);
        if (recent.length > 0) return;

        await logEvent(database, {
          entity: "user",
          entityId: user.id,
          action: "password_reset_requested",
          actor: user.email,
        });
        await sendAuthMail({
          kind: "password_reset",
          to: user.email,
          subject: "Reset your Lumen Logic password",
          text: [
            "Reset your Lumen Logic password with this link:",
            "",
            url,
            "",
            "The link is valid for 15 minutes. If you did not request it, you can ignore this email.",
          ].join("\n"),
          url,
          entityId: user.id,
        });
      },
      // ⚠️ Default staat UIT. Zonder dit blijft een gekaapte sessie gewoon leven na een
      // reset — dan is de reset aantoonbaar geen remedie (NIST SP 800-63B §5.1.1.2).
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await logEvent(database, {
          entity: "user",
          entityId: user.id,
          action: "password_reset_completed",
          actor: user.email,
        });
      },
      // 15 minuten in plaats van het uur default: de link staat in productie-logs en de
      // operator plukt hem er toch direct uit.
      resetPasswordTokenExpiresIn: 60 * 15,
    },
    plugins: options.nextCookies
      ? [magicLinkPlugin, nextCookies()]
      : [magicLinkPlugin],
  });
}

export type LumenAuth = ReturnType<typeof createAuth>;
