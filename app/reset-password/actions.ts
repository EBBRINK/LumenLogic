"use server";

// Nieuw wachtwoord zetten met het token uit de resetlink (docs/goal-wachtwoord-reset.md,
// bouwstap 4). Anoniem pad — geen requireSession(); het token ís het bewijs. Wél eerst de
// schema-parse (conventie lib/validation.ts): tokenvorm en wachtwoordbeleid worden hier
// afgevangen, zodat een te kort wachtwoord een nette melding geeft in plaats van een
// Better Auth-APIError.
//
// Succes → redirect naar /login, bewust GEEN auto-login: wie zojuist heeft bewezen het
// postvak te bezitten, mag dat wachtwoord meteen één keer intypen. Dat houdt de flow
// gelijk aan de PIN-activatie (sessie ontstaat alleen na een bewuste inlogactie) en
// voorkomt dat een resetlink uit een log direct een sessie oplevert.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseForm, z, zPassword, zTrimmed } from "@/lib/validation";

const schema = z.object({
  token: zTrimmed.min(1, "token ontbreekt"),
  newPassword: zPassword,
});

// INVALID_TOKEN, verlopen token en hergebruikt token krijgen bewust één en dezelfde
// generieke melding — het onderscheid is voor een aanvaller informatie en voor de
// gebruiker irrelevant (de remedie is in alle gevallen: nieuwe link aanvragen).
const GENERIC_RESET_ERROR =
  "This reset link is invalid or has expired. Request a new one.";

export type ResetPasswordResult = { error: string };

export async function resetPasswordAction(
  formData: FormData,
): Promise<ResetPasswordResult> {
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.newPassword },
    });
  } catch {
    return { error: GENERIC_RESET_ERROR };
  }
  redirect("/login");
}
