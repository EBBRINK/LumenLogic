// Nieuw wachtwoord zetten met het token uit de resetlink (docs/goal-wachtwoord-reset.md,
// bouwstap 5). Anoniem bereikbaar ("open" in lib/route-allowlist.ts): het token ís het
// bewijs, een sessie is er per definitie niet (revokeSessionsOnPasswordReset trekt zelfs
// alle bestaande in).
//
// Twee zoekparameters, allebei van Better Auth zelf:
//   • ?token= — het resettoken uit de link die sendResetPassword logt;
//   • ?error= — Better Auth' GET-handler stuurt een al-afgekeurde link hierheen terug
//     met bv. ?error=INVALID_TOKEN (dist/api/routes/password.mjs).
// Geen token of wél een error → de generieke weigerstand (InvalidResetLink), zonder
// onderscheid naar wát er mis was.
//
// De wachtwoordgrenzen komen als props uit lib/auth-factory.ts: de client-component mag
// die module niet zelf importeren (trekt Better Auth/Drizzle de client-bundel in), maar
// hardcoderen mag ook niet — zelfde constructie als app/activate/page.tsx.
import { LoginChrome } from "@/components/login/login-chrome";
import { InvalidResetLink } from "@/components/reset-password/invalid-reset-link";
import { ResetPasswordForm } from "@/components/reset-password/reset-password-form";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-factory";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const bruikbaar = error == null && token != null && token.length > 0;

  return (
    <LoginChrome>
      {bruikbaar ? (
        <ResetPasswordForm
          resetPasswordAction={resetPasswordAction}
          token={token}
          minPasswordLength={MIN_PASSWORD_LENGTH}
          maxPasswordLength={MAX_PASSWORD_LENGTH}
        />
      ) : (
        <InvalidResetLink />
      )}
    </LoginChrome>
  );
}
