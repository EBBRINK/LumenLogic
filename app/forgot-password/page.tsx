// Wachtwoord vergeten (docs/goal-wachtwoord-reset.md, bouwstap 5). Anoniem bereikbaar
// ("open" in lib/route-allowlist.ts) — wie zijn wachtwoord kwijt is, heeft per definitie
// geen sessie. Bewust géén sessiecheck-met-redirect zoals /login die heeft: een ingelogde
// gebruiker die hier belandt mag gewoon een resetlink aanvragen (hetzelfde kan al via
// /settings), en een extra poort zou dit simpele scherm alleen maar kunnen breken.
//
// In LoginChrome, net als /login zelf: dezelfde kop en de magic-link-onthulling als
// secundair pad — de test rendert exact dezelfde omlijsting (zie login-chrome.tsx).
import { LoginChrome } from "@/components/login/login-chrome";
import { ForgotPasswordForm } from "@/components/forgot-password/forgot-password-form";
import { requestPasswordResetAction } from "./actions";

export default function ForgotPasswordPage() {
  return (
    <LoginChrome>
      <ForgotPasswordForm requestPasswordResetAction={requestPasswordResetAction} />
    </LoginChrome>
  );
}
