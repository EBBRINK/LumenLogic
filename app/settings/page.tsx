import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/db/client";
import { AllowedEmailsBlock } from "@/components/settings/allowed-emails-block";
import { LlmBudgetBlock } from "@/components/settings/llm-budget-block";
import { XisBlock } from "@/components/settings/xis-block";
import type { XisEnvironment } from "@/components/settings/xis-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getLlmSpendByPurpose,
  getSetting,
  listAllowedEmails,
} from "@/lib/repo/settings";
import { requireSession } from "@/lib/session";
import {
  addEmailAction,
  removeEmailAction,
  saveBudgetAction,
  saveXisAction,
} from "./actions";

// L-01/L-02/L-06: interne gebruikers, LLM-budget en XIS-koppeling op één plek. Deze pagina
// leeft buiten de dossier-layout en rendert daarom zijn eigen <main>.
export default async function InstellingenPage() {
  // De sessie levert hier méér dan de poort: het eigen adres gaat naar de allowlist,
  // zodat je jezelf niet kunt uitsluiten (UX-audit bug #5).
  const session = await requireSession();

  const [emails, budget, spendByPurpose, xisEnv, xisKey] = await Promise.all([
    listAllowedEmails(db),
    getSetting<number>(db, "llm_budget_eur"),
    // Volledige uitsplitsing (UX-audit 30 jul, bug #10): eerder twee losse queries op
    // 'vangnet' en 'ocr', waardoor 'leesroute' stil in het totaal bleef zitten.
    getLlmSpendByPurpose(db),
    getSetting<string>(db, "xis_environment"),
    getSetting<string>(db, "xis_api_key"),
  ]);

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
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Login access, LLM budget and the XIS connection.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <AllowedEmailsBlock
            emails={emails.map((e) => ({ email: e.email, addedBy: e.addedBy }))}
            addAction={addEmailAction}
            removeAction={removeEmailAction}
            sessionEmail={session.user?.email ?? null}
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
        {/* UX-audit 30 jul (bug #11): /settings/organization had nul inkomende links —
            gebouwd, maar alleen via de URL te bereiken. Dit is de ingang. */}
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
      </div>
    </main>
  );
}
