import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { AllowedEmailsBlock } from "@/components/settings/allowed-emails-block";
import { LlmBudgetBlock } from "@/components/settings/llm-budget-block";
import type { ChangePasswordResult } from "@/components/settings/password-block";
import { PasswordBlock } from "@/components/settings/password-block";
import { XisBlock } from "@/components/settings/xis-block";
import type { XisEnvironment } from "@/components/settings/xis-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/auth-activation";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-factory";
import {
  getLlmSpendByPurpose,
  getSetting,
  listAllowedEmails,
} from "@/lib/repo/settings";
import { requireSession } from "@/lib/session";
import { bewaakRoute } from "@/lib/route-toegang";
import {
  addEmailAction,
  removeEmailAction,
  saveBudgetAction,
  saveXisAction,
} from "./actions";

// Zelf je wachtwoord wijzigen (besluit G34, sprint 3.1 golf 2). Inline server action i.p.v.
// een toevoeging aan ./actions.ts: golf 2 draait met drie builders tegelijk in dezelfde
// worktree, en dit bestand was voor dit blok de enige plek die is vrijgegeven.
//
// ⚠️ UITSLUITEND changeOwnPassword() (lib/auth-activation.ts), nooit
// auth.api.changePassword rechtstreeks — alleen changeOwnPassword dwingt
// revokeOtherSessions:true af. Zonder die vlag blijft een sessie op een ander apparaat
// na een wachtwoordwissel gewoon geldig; precies de bevinding van de golf-1-critic
// (zie het commentaar bij changeOwnPassword zelf).
async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  "use server";
  await requireSession();

  // Eigen lengtecontrole vóór de aanroep: hetzelfde beleid als de client al toont, maar
  // hier nogmaals gecontroleerd voor het geval de client-check ooit omzeild wordt.
  if (
    input.newPassword.length < MIN_PASSWORD_LENGTH ||
    input.newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return { error: "weak_password" };
  }

  try {
    await changeOwnPassword(auth, {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      headers: await headers(),
    });
  } catch (e) {
    // Better Auth's APIError draagt de reden in body.code (better-call/error.mjs, via
    // @better-auth/core APIError.from). Alleen de twee redenen die hier kunnen horen
    // vertalen we naar een eigen melding; alles anders (netwerkfout, DB-fout, iets
    // onvoorziens) gooien we door — de client vangt dat via callAction() al correct op
    // als "failed" en toont de échte oorzaak (lib/next-action-result.ts), in plaats van
    // een verzonnen "je wachtwoord is fout" (golf-2-critic ronde 1: een kale catch
    // meldde élke fout als wrong_current_password, ook fouten die daar niets mee te
    // maken hebben).
    const code = (e as { body?: { code?: string } })?.body?.code;
    if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
      // Deploy 1: 0 van de 3 huidige users hebben een wachtwoord (briefing §2). Wie via
      // de magic link binnenkomt en hier zijn EERSTE wachtwoord probeert te zetten, heeft
      // geen "huidig wachtwoord" om tegen te vergelijken — "incorrect" zou hier gewoon
      // onwaar zijn en de gebruiker geen bruikbare vervolgstap geven.
      return { error: "no_password_yet" };
    }
    if (code === "INVALID_PASSWORD") {
      return { error: "wrong_current_password" };
    }
    throw e;
  }

  return { ok: true };
}

// L-01/L-02/L-06: interne gebruikers, LLM-budget en XIS-koppeling op één plek. Deze pagina
// leeft buiten de dossier-layout en rendert daarom zijn eigen <main>.
export default async function InstellingenPage() {
  // 3.2a: de route staat op `iedereen` — iedereen moet zijn eigen wachtwoord kunnen
  // wijzigen, en dat is het enige blok op deze pagina dat over de kijker zelf gaat. De
  // rest (toegelaten adressen, LLM-budget, XIS-sleutel) is intern beheer en wordt
  // hieronder per blok afgeschermd. "Intern? toon", niet "extern? verberg": een kijker
  // van wie we het type niet kunnen vaststellen ziet de interne blokken dus niet.
  //
  // De toegang levert hier méér dan de poort: het eigen adres gaat naar de allowlist,
  // zodat je jezelf niet kunt uitsluiten (UX-audit bug #5).
  const toegang = await bewaakRoute("/settings");
  const intern = toegang.soort === "intern";

  // De interne queries draaien alleen voor intern. Niet omdat het scherm ze verbergt —
  // dan zou de data nog steeds gelezen zijn — maar omdat ze voor een externe kijker geen
  // vraag zijn die gesteld hoort te worden.
  const internData = intern
    ? await Promise.all([
        listAllowedEmails(db),
        getSetting<number>(db, "llm_budget_eur"),
        // Volledige uitsplitsing (UX-audit 30 jul, bug #10): eerder twee losse queries op
        // 'vangnet' en 'ocr', waardoor 'leesroute' stil in het totaal bleef zitten.
        getLlmSpendByPurpose(db),
        getSetting<string>(db, "xis_environment"),
        getSetting<string>(db, "xis_api_key"),
      ])
    : null;
  const emails = internData?.[0] ?? [];
  const budget = internData?.[1] ?? null;
  const spendByPurpose = internData?.[2] ?? [];
  const xisEnv = internData?.[3] ?? null;
  const xisKey = internData?.[4] ?? null;

  // Het totaal is de som van de uitsplitsing, niet een tweede query (reparatie 30 jul).
  // getLlmSpend() en getLlmSpendByPurpose() draaien over exact dezelfde rijen met exact
  // dezelfde where-clausule; twee ongebundelde queries konden dus alleen nog uiteenlopen
  // door een rij die er tussen de twee bij komt — en dan zegt het scherm dat de
  // uitsplitsing niet optelt, precies de klacht van bug #10.
  const spent = spendByPurpose.reduce((som, r) => som + r.eur, 0);

  const environment: XisEnvironment =
    xisEnv === "productie" ? "productie" : "sandbox";
  // De sleutelwaarde blijft server-side; naar de client gaat alleen de aanwezigheid.
  const keyIsSet = typeof xisKey === "string" && xisKey.length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {intern
            ? "Login access, LLM budget and the XIS connection."
            : "Your account."}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {intern && (
          <>
            <div className="lg:col-span-2">
              <AllowedEmailsBlock
                emails={emails.map((e) => ({
                  email: e.email,
                  addedBy: e.addedBy,
                }))}
                addAction={addEmailAction}
                removeAction={removeEmailAction}
                sessionEmail={toegang.email}
              />
            </div>
            <LlmBudgetBlock
              budgetEur={budget}
              spentEur={spent}
              breakdown={spendByPurpose}
              saveAction={saveBudgetAction}
            />
            <XisBlock
              environment={environment}
              keyIsSet={keyIsSet}
              saveAction={saveXisAction}
            />
          </>
        )}
        {/* UX-audit 30 jul (bug #11): /settings/organization had nul inkomende links —
            gebouwd, maar alleen via de URL te bereiken. Dit is de ingang. Alleen voor wie
            er ook door mag: de route staat op niveau `org_admin`. */}
        {toegang.adminOrgIds.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Organizations, their members and the roles those members come in
              with. A role sets the default view, never what the engine shows.
            </p>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              Manage organizations <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
        )}
        <PasswordBlock
          minPasswordLength={MIN_PASSWORD_LENGTH}
          maxPasswordLength={MAX_PASSWORD_LENGTH}
          changePasswordAction={changePasswordAction}
        />
      </div>
    </main>
  );
}
