"use server";

// Wachtwoord-vergeten (docs/goal-wachtwoord-reset.md, bouwstap 4). Anoniem pad — bewust
// GEEN requireSession(): wie zijn wachtwoord kwijt is, is per definitie niet ingelogd.
// Wél de schema-parse (conventie lib/validation.ts) vóór er iets richting Better Auth gaat.
//
// Anti-enumeratie: het antwoord is ALTIJD hetzelfde, wat er ook gebeurt — bestaand adres,
// onbekend adres, of zelfs een Better Auth-fout. Better Auth antwoordt zelf al identiek
// voor onbekende adressen (incl. timing-mitigatie, dist/api/routes/password.mjs), maar de
// catch hieronder dicht óók het pad waarin een interne fout anders als 500 zou verraden
// dat er iets bijzonders aan dit adres is. `sendResetPassword` in lib/auth-factory.ts
// vuurt alleen voor echte accounts en logt daar het event.
import { auth } from "@/lib/auth";
import { parseForm, z, zEmail } from "@/lib/validation";

const schema = z.object({ email: zEmail });

// Eén vaste uitkomst: het formulier toont altijd dezelfde neutrale sent-melding.
export type ForgotPasswordResult = { ok: true };

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<ForgotPasswordResult> {
  const parsed = parseForm(schema, formData);
  // Ongeldige invoer → stil hetzelfde antwoord: ook "dat is geen e-mailadres" is
  // informatie die dit anonieme endpoint niet hoeft uit te delen.
  if (!parsed.ok) return { ok: true };

  try {
    await auth.api.requestPasswordReset({
      // redirectTo relatief houden: Better Auth' originCheck weigert anders elke host die
      // niet exact de eigen baseURL is (en op Vercel wisselt die per deploy).
      body: { email: parsed.data.email, redirectTo: "/reset-password" },
    });
  } catch {
    // Zelfde antwoord — zie de kop van dit bestand.
  }
  return { ok: true };
}
