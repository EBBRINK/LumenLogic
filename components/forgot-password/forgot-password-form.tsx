"use client";

// Wachtwoord-vergeten-formulier (docs/goal-wachtwoord-reset.md, bouwstap 5). Zelfde model
// als components/login/password-login-form.tsx: de server action komt als prop binnen en
// wordt via callAction() aangeroepen — nooit een kale await/try-catch (CLAUDE.md; een
// action kan met NEXT_REDIRECT rejecten en dat is navigatie, geen fout).
//
// Anti-enumeratie (zelfde lat als requestPasswordResetAction zelf, zie
// app/forgot-password/actions.ts): dit formulier toont ná verzenden ALTIJD dezelfde
// neutrale melding — ook als de aanroep faalt. Een netwerkfout of 500 hier anders tonen
// dan een geslaagd verzoek zou een tweede kanaal zijn om iets over een adres af te leiden.
// De action antwoordt zelf al altijd { ok: true }; deze kant maakt dat waterdicht.
//
// ⚠️ De action neemt FormData aan (parseForm-conventie, anders dan signInAction die een
// object neemt) — vandaar new FormData(form) hieronder.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/next-action-result";
import type { ForgotPasswordResult } from "@/app/forgot-password/actions";

export type ForgotPasswordAction = (
  formData: FormData,
) => Promise<ForgotPasswordResult>;

// De neutrale sent-melding: zegt niet óf het adres bestaat. Eén formulering die mail- én
// consolepad dekt (docs/goal-auth-mail.md, bouwstap 5 — de client is niet key-bewust),
// plus de geldigheidsduur (resetPasswordTokenExpiresIn = 15 min in lib/auth-factory.ts).
const SENT_MESSAGE =
  "If that address has access to Lumen Logic, a reset link has been sent. The link is valid for 15 minutes. (Without a mail key configured, it appears in the server console.)";

type FormStatus = { kind: "idle" } | { kind: "pending" } | { kind: "sent" };

export function ForgotPasswordForm({
  requestPasswordResetAction,
}: {
  requestPasswordResetAction: ForgotPasswordAction;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const busy = status.kind === "pending";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setStatus({ kind: "pending" });
    // De action redirect nooit; het verwachte pad is dus het huidige. Élke uitkomst —
    // value, failed, wat dan ook — eindigt in dezelfde neutrale melding (zie de kop).
    await callAction(() => requestPasswordResetAction(formData), {
      path: "/forgot-password",
    });
    setStatus({ kind: "sent" });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Enter your email address and we&apos;ll issue a password reset link.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@brink.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      {status.kind === "sent" && (
        <p id="forgot-sent" role="status" className="text-sm text-muted-foreground">
          {SENT_MESSAGE}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
