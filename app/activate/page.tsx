import { ActivateForm } from "@/components/activate/activate-form";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-factory";
import { PIN_LENGTH } from "@/lib/repo/activation";
import { activateAction } from "./actions";

// Het eerste scherm dat de meeste externe gebruikers ooit van Lumen Logic zien (C10/G26):
// Brink mailt zelf een 8-cijferige PIN, de ontvanger vult hem hier in en kiest meteen een
// wachtwoord. Geen sessie nodig om deze pagina te bereiken — die ontstaat pas ná een
// geslaagde activatie (app/activate/actions.ts), dus bewust géén requireSession() hier.
//
// De drie constanten (PIN-lengte, wachtwoordgrenzen) komen uit de bestaande server-lagen en
// worden als props doorgegeven aan de client-component: die mag lib/repo/activation.ts en
// lib/auth-factory.ts niet rechtstreeks importeren (die trekken Better Auth/Drizzle de
// client-bundel in), maar de kwaliteitslat eist wel "importeer ze, hardcodeer ze niet".
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    // max-w-lg (i.p.v. /login's max-w-sm): de 8-cijferige InputOTP in twee groepen van vier
    // (44px hoge, 40px brede vakjes, kit §6/§8) heeft ~390px nodig — op max-w-sm werd het
    // achtste vakje door de kaart afgesneden (overflow-hidden). Geverifieerd met de
    // screenshots in components/activate/activate.test.tsx.
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Activate your account with the code Brink emailed you.
        </p>
      </div>
      <ActivateForm
        activateAction={activateAction}
        defaultEmail={email ?? ""}
        pinLength={PIN_LENGTH}
        minPasswordLength={MIN_PASSWORD_LENGTH}
        maxPasswordLength={MAX_PASSWORD_LENGTH}
      />
    </main>
  );
}
