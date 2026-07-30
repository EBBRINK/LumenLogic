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
import * as authSchema from "@/db/auth-schema";
import type { AppDb } from "@/lib/repo/db";
import { isAllowed } from "@/lib/repo/settings";

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
};

export function createAuth(database: AppDb, options: CreateAuthOptions = {}) {
  const magicLinkPlugin = magicLink({
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
      // Geen e-mailprovider in deze fase (besluit 6). De magic link verschijnt in de
      // serverconsole; daar klik je hem uit.
      console.log(`[auth] magic link voor ${email}: ${url}`);
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
    },
    plugins: options.nextCookies
      ? [magicLinkPlugin, nextCookies()]
      : [magicLinkPlugin],
  });
}

export type LumenAuth = ReturnType<typeof createAuth>;
