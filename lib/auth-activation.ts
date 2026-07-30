// Het verzilveren van een activatie-PIN: (e-mail, PIN, nieuw wachtwoord) → wachtwoord gezet,
// PIN op, en pas daarná een sessie. Dit is de enige plek in de applicatie waar een wachtwoord
// wordt gezet zónder dat er al een sessie is, dus de volgorde hier ís de veiligheidsgarantie
// uit §3a: "de sessie ontstaat pas ná het succesvol zetten van het wachtwoord, niet bij het
// invoeren van de PIN".
//
// Waarom deze laag naast lib/repo/activation.ts staat: de PIN-regels zijn puur datamodel en
// draaien op een kale db, maar het wachtwoord hoort in Better Auth' eigen account-tabel met
// Better Auth' eigen hasher. Die twee werelden worden hier één keer aan elkaar geknoopt, via
// `auth.$context` — de gedocumenteerde toegang tot de interne adapter en de password-hasher.
import type { LumenAuth } from "@/lib/auth-factory";
import {
  checkActivationPin,
  claimActivationPin,
} from "@/lib/repo/activation";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";

export type RedeemResult =
  | {
      ok: true;
      email: string;
      userId: string;
      /** Sessietoken. Het bijbehorende cookie staat in `headers` (Set-Cookie). */
      token: string;
      headers: Headers;
    }
  | {
      ok: false;
      /**
       * `invalid` dekt élke reden waarom de PIN niet werkt: onbekend adres, verkeerde PIN,
       * verlopen PIN, al gebruikte PIN, doodgelopen PIN. Eén reden, één melding — anders
       * is het activatiescherm een orakel dat vertelt welke e-mailadressen bestaan.
       * `weak_password` gaat over het wachtwoord en zegt niets over het account, dus die
       * mag wél apart: het beleid staat toch in de UI.
       */
      reason: "invalid" | "weak_password";
    };

export async function redeemActivationPin(
  auth: LumenAuth,
  db: AppDb,
  input: {
    email: string;
    pin: string;
    newPassword: string;
    /** Request-headers, voor IP/user-agent op de sessie. Optioneel. */
    headers?: Headers;
    now?: Date;
  },
): Promise<RedeemResult> {
  const ctx = await auth.$context;
  const now = input.now ?? new Date();

  // Wachtwoordbeleid eerst, vóór de PIN wordt aangeraakt: een te kort wachtwoord mag geen
  // PIN opbranden. Dit lekt niets — het beleid is publiek en staat in het formulier.
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (
    input.newPassword.length < minPasswordLength ||
    input.newPassword.length > maxPasswordLength
  ) {
    return { ok: false, reason: "weak_password" };
  }

  const check = await checkActivationPin(db, input.email, input.pin, now);
  if (!check.ok) return { ok: false, reason: "invalid" };

  // Eenmaligheid wordt hier vastgeklikt, vóórdat het wachtwoord wordt geschreven. Andersom
  // zou een tweede, gelijktijdige activatie er tussendoor kunnen glippen; nu verliest die
  // race gegarandeerd. De prijs is dat een mislukte wachtwoordschrijf de PIN opbrandt en
  // Brink een nieuwe moet geven — dat is de goede kant om op te falen.
  if (!(await claimActivationPin(db, check.email, now))) {
    return { ok: false, reason: "invalid" };
  }

  const found = await ctx.internalAdapter.findUserByEmail(check.email, {
    includeAccounts: true,
  });
  if (!found) {
    // Kan alleen als iemand de user-rij tussen uitgifte en activatie heeft verwijderd.
    // De PIN is inmiddels op; dat is bewust — hij is immers gebruikt.
    return { ok: false, reason: "invalid" };
  }

  const passwordHash = await ctx.password.hash(input.newPassword);
  const credential = found.accounts.find((a) => a.providerId === "credential");
  if (credential) {
    await ctx.internalAdapter.updatePassword(found.user.id, passwordHash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: found.user.id,
      providerId: "credential",
      accountId: found.user.id,
      password: passwordHash,
    });
  }

  // Wie de PIN uit Brinks mailtje kan invoeren, heeft aantoonbaar toegang tot dat postvak.
  // Dat is precies wat e-mailverificatie bewijst (NIST SP 800-63A §4.5), dus de vlag gaat om.
  if (!found.user.emailVerified) {
    await ctx.internalAdapter.updateUser(found.user.id, { emailVerified: true });
  }

  // ⚠️ Álle bestaande sessies eruit, vóór de nieuwe wordt aangemaakt. C10 maakt "nieuwe PIN"
  // het énige herstelmechanisme in dit product: gestolen laptop, gelekt cookie, vertrokken
  // medewerker — Brink heeft geen andere knop. Zonder deze regel is die knop aantoonbaar
  // geen remedie, want de oude sessie overleeft de wachtwoordwissel gewoon. NIST SP 800-63B
  // §5.1.1.2 en Entra TAP (de twee referenties die §3a zelf aanwijst) eisen intrekking bij
  // een credentialwijziging.
  await ctx.internalAdapter.deleteUserSessions(found.user.id);

  // Pas hier ontstaat de sessie: via de gewone inlogroute, met het zojuist gezette
  // wachtwoord. Er is dus geen apart, zwakker pad naar een sessie dat de PIN zou kunnen
  // openzetten — lukt het inloggen niet, dan is er ook geen sessie.
  const signedIn = await auth.api.signInEmail({
    body: { email: check.email, password: input.newPassword },
    headers: input.headers,
    returnHeaders: true,
  });

  await logEvent(db, {
    entity: "user",
    action: "activation_completed",
    actor: check.email,
    payload: { email: check.email },
  });

  return {
    ok: true,
    email: check.email,
    userId: found.user.id,
    token: signedIn.response.token,
    headers: signedIn.headers,
  };
}

/**
 * Zelf je wachtwoord wijzigen, mét opgave van het huidige (besluit G34).
 *
 * Bestaat als eigen functie en niet als "roep `auth.api.changePassword` aan" omdat Better
 * Auth andere sessies alléén intrekt met `revokeOtherSessions: true`, en die vlag vergeten
 * is precies de fout die je nooit ziet: het wachtwoord wijzigt, de oude sessie leeft door,
 * en de wijziging voelt als een remedie zonder er één te zijn. Hier staat de vlag altijd
 * aan — dat is een garantie van deze laag, geen keuze van de aanroeper.
 *
 * De sessie van de aanroeper zelf blijft geldig: Better Auth geeft er een verse voor terug.
 * Zet het cookie uit `headers` (in een server action doet nextCookies dat vanzelf).
 *
 * Gooit een Better Auth `APIError` bij een verkeerd huidig wachtwoord of een te kort nieuw —
 * bewust doorgelaten: dat zijn allebei meldingen die de gebruiker moet zien.
 */
export async function changeOwnPassword(
  auth: LumenAuth,
  input: { currentPassword: string; newPassword: string; headers: Headers },
): Promise<{ headers: Headers }> {
  const res = await auth.api.changePassword({
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: true,
    },
    headers: input.headers,
    returnHeaders: true,
  });
  return { headers: res.headers };
}
