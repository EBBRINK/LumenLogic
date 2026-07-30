import { db } from "@/db/client";
import { AllowedEmailsBlock } from "@/components/settings/allowed-emails-block";
import { LlmBudgetBlock } from "@/components/settings/llm-budget-block";
import { XisBlock } from "@/components/settings/xis-block";
import type { XisEnvironment } from "@/components/settings/xis-block";
import {
  getLlmSpend,
  getLlmSpendForPurpose,
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

  const [emails, budget, spent, vangnetSpent, ocrSpent, xisEnv, xisKey] =
    await Promise.all([
      listAllowedEmails(db),
      getSetting<number>(db, "llm_budget_eur"),
      getLlmSpend(db),
      getLlmSpendForPurpose(db, "vangnet"), // uitsplitsing AI-vangnet (B4/stap 8)
      getLlmSpendForPurpose(db, "ocr"), // uitsplitsing OCR beeld-PDF (plan-ocr B4)
      getSetting<string>(db, "xis_environment"),
      getSetting<string>(db, "xis_api_key"),
    ]);

  const environment: XisEnvironment =
    xisEnv === "productie" ? "productie" : "sandbox";
  // De sleutelwaarde blijft server-side; naar de client gaat alleen de aanwezigheid.
  const keyIsSet = typeof xisKey === "string" && xisKey.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Users, LLM budget and the XIS connection.
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
          vangnetEur={vangnetSpent}
          ocrEur={ocrSpent}
          saveAction={saveBudgetAction}
        />
        <XisBlock
          environment={environment}
          keyIsSet={keyIsSet}
          saveAction={saveXisAction}
        />
      </div>
    </main>
  );
}
