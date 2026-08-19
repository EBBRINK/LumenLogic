// De weigerstand van /reset-password: de link kwam zonder token binnen, of Better Auth
// heeft hem al afgekeurd en met ?error= (bv. INVALID_TOKEN) teruggestuurd. Ongeldig,
// verlopen en hergebruikt krijgen bewust één en dezelfde generieke tekst — zelfde
// anti-enumeratielat als GENERIC_RESET_ERROR in app/reset-password/actions.ts; de
// remedie is in alle gevallen dezelfde: een nieuwe link aanvragen.
//
// Eigen bestand in components/ (geen inline JSX in de page): de white-box-test rendert
// exact dit bestand, dezelfde reden als components/login/login-chrome.tsx.
//
// Een gewone <a> en géén next/link: dit is een servercomponent en de RSC-testharnas
// weigert de client-referentie van next/link in servercontext ("client reference export
// is called on server"). Voor één uitweg-link is prefetch toch niets waard.

export function InvalidResetLink() {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-sm text-destructive">
        This reset link is invalid or has expired.
      </p>
      <p className="text-sm text-muted-foreground">
        Reset links are valid for 15 minutes and can be used once.{" "}
        <a
          href="/forgot-password"
          className="rounded-sm border border-transparent font-medium underline underline-offset-4 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/10"
        >
          Request a new one
        </a>
        .
      </p>
    </div>
  );
}
