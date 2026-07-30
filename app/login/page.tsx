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
// <details>-onthulling — zelfde patroon als de bestaande CatalogFieldsOverview in
// components/data/custom-fields-table.tsx. Twee even zware formulieren naast elkaar zou het
// sobere scherm meteen twee keer zo druk maken; een onthulling houdt één duidelijke
// hoofdhandeling terwijl het secundaire pad gewoon aanwezig en bereikbaar blijft.
//
// De omlijsting (kop + magic-link-onthulling) staat in components/login/login-chrome.tsx,
// niet hier inline: login.test.tsx importeert dezelfde component, zodat de screenshots
// altijd exact het verscheepte scherm tonen (golf-2-critic ronde 1).
import { redirect } from "next/navigation";
import { LoginChrome } from "@/components/login/login-chrome";
import { PasswordLoginForm } from "@/components/login/password-login-form";
import { getSession } from "@/lib/session";
import { signInAction } from "./actions";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/projects");

  return (
    <LoginChrome>
      <PasswordLoginForm signInAction={signInAction} />
    </LoginChrome>
  );
}
