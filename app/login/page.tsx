// Inloggen. Twee dingen komen hier samen.
//
// 1. UX-audit bug #7: deze pagina was een client component zónder sessiecheck, dus een
//    ingelogde gebruiker kreeg de volledige navbalk én een "Send magic link"-formulier.
//    Daarom een serverwrapper: is er een sessie, dan valt hier niets te kiezen en gaat de
//    gebruiker door naar /projects. Bewust getSession() en niet requireSession() — die
//    laatste redirect juist naar /login en zou hier een lus opleveren. Bewaakt door
//    app/login/login-gate.test.ts.
//
// 2. G27/G32: wachtwoord is sinds sprint 3.1 het hoofdpad, de magic link staat ernáást als
//    secundair pad — hij verdwijnt pas in deploy 2, ná bewezen wachtwoord-login door Timo
//    én Eduard (docs/sprint3-1-briefing.md §5 punt 6, correctie in G35). Vóór die tweede
//    deploy is de magic link nog altijd nodig — ook om /admin te bereiken en de eerste
//    PIN's aan te maken.
//
// Schikking: het wachtwoordformulier staat open en eerst (primaire knop, DESIGN.md §6
// default-variant: navy vlak, wit label). De magic link staat achter een
// <details>-onthulling, gestyled als de kit's tertiaire (ghost) knop — zelfde patroon
// als de bestaande CatalogFieldsOverview in components/data/custom-fields-table.tsx.
// Twee even zware formulieren naast elkaar zou het "sobere scherm" (de oorspronkelijke
// pagina had alleen een e-mailveld) meteen tot twee keer zo druk maken; een onthulling
// houdt één duidelijke hoofdhandeling terwijl het secundaire pad gewoon aanwezig en
// bereikbaar blijft — geen extra klik weggemoffeld, alleen niet standaard opengeklapt.
import { redirect } from "next/navigation";
import { MagicLinkForm } from "@/components/login/magic-link-form";
import { PasswordLoginForm } from "@/components/login/password-login-form";
import { getSession } from "@/lib/session";
import { signInAction } from "./actions";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/projects");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spec, calculation and quotation tool — Brink Licht.
        </p>
      </div>

      <PasswordLoginForm signInAction={signInAction} />

      <details className="rounded-lg border border-foreground/10 px-3 py-2.5 text-sm">
        <summary className="cursor-pointer list-none rounded-md font-medium text-brand-blue outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
          Use a magic link instead
        </summary>
        <div className="mt-3">
          <MagicLinkForm />
        </div>
      </details>
    </main>
  );
}
