"use client";

// Nieuw-wachtwoord-formulier van /reset-password (docs/goal-wachtwoord-reset.md,
// bouwstap 5). Zelfde model als components/activate/activate-form.tsx: de server action
// als prop, wachtwoordgrenzen als props (deze client-component importeert nooit
// rechtstreeks uit lib/auth-factory — dat trekt Better Auth/Drizzle de client-bundel in),
// en de aanroep via callAction() uit lib/next-action-result.ts.
//
// ⚠️ resetPasswordAction redirect() bij succes naar /login — dat laat de client-promise
// REJECTEN met NEXT_REDIRECT (Next' navigatiesignaal, geen fout). callAction classificeert
// die bestemming; een kale await/try-catch zou van elk succes een fout maken (CLAUDE.md).
//
// De action neemt FormData aan (parseForm-conventie) — vandaar new FormData(form). Het
// token reist als hidden veld mee; het confirm-veld is een pure client-check en wordt door
// het zod-schema aan de serverkant genegeerd.
//
// Elke tokenfout (ongeldig, verlopen, hergebruikt) komt als één generieke melding terug —
// het onderscheid is voor een aanvaller informatie en voor de gebruiker irrelevant. Dit
// formulier verzint er nooit een specifiekere bij.
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction, failureDetail } from "@/lib/next-action-result";
import type { ResetPasswordResult } from "@/app/reset-password/actions";

export type ResetPasswordAction = (
  formData: FormData,
) => Promise<ResetPasswordResult>;

type FormStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "weak_password" }
  | { kind: "mismatch" }
  | { kind: "rejected"; message: string }
  | { kind: "failed"; detail: string };

export function ResetPasswordForm({
  resetPasswordAction,
  token,
  minPasswordLength,
  maxPasswordLength,
}: {
  resetPasswordAction: ResetPasswordAction;
  /** Uit ?token= in de resetlink — de pagina leest hem en geeft hem door. */
  token: string;
  /** Uit lib/auth-factory.ts (MIN_PASSWORD_LENGTH), doorgegeven door de server-page. */
  minPasswordLength: number;
  /** Uit lib/auth-factory.ts (MAX_PASSWORD_LENGTH), zelfde reden. */
  maxPasswordLength: number;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const busy = status.kind === "pending";
  const passwordInvalid =
    status.kind === "weak_password" || status.kind === "rejected";
  const confirmInvalid = status.kind === "mismatch";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Wachtwoordbeleid en bevestiging zijn pure client-checks (zelfde patroon als
    // activate-form.tsx): geen serveraanroep voor iets dat hier al zichtbaar fout is.
    // De server parseert daarna alsnog met zPassword — dit is comfort, geen poort.
    if (password.length < minPasswordLength || password.length > maxPasswordLength) {
      setStatus({ kind: "weak_password" });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({ kind: "mismatch" });
      return;
    }
    setStatus({ kind: "pending" });
    const outcome = await callAction(() => resetPasswordAction(formData), {
      path: "/login",
    });
    switch (outcome.kind) {
      case "arrived":
        // Geslaagd — Next navigeert al naar /login (bewust geen auto-login, zie de
        // action). Formulier blijft op slot zodat er geen tweede aanroep tussendoor kan.
        return;
      case "value":
        // De action antwoordt alleen met { error } — de generieke tokenmelding, of een
        // parse-afwijzing die de client-checks hierboven normaal al voorkomen.
        setStatus({ kind: "rejected", message: outcome.value.error });
        return;
      case "signedOut":
      case "divertedTo":
        // signedOut kan hier niet als betekenis kloppen (de action kent geen
        // requireSession() en /login is juist de succesbestemming, die als "arrived"
        // binnenkomt) — default-deny: onverwachte bestemming is een zichtbare fout.
        setStatus({ kind: "failed", detail: "unexpected response" });
        return;
      case "failed":
        setStatus({ kind: "failed", detail: failureDetail(outcome.error) });
        return;
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Choose a new password for your account.
      </p>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-password" className="text-sm font-medium">
          New password
        </label>
        <Input
          id="reset-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={minPasswordLength}
          maxLength={maxPasswordLength}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-invalid={passwordInvalid}
          aria-describedby={
            status.kind === "weak_password"
              ? "reset-password-error"
              : status.kind === "rejected"
                ? "reset-rejected"
                : "reset-password-hint"
          }
        />
        {/* Vaste, neutrale hint (wachtwoordbeleid zichtbaar, goal-doc bouwstap 5); de
            foutmelding is een APART element met role="alert" — zelfde patroon en reden
            als activate-form.tsx (kleur mag nooit het enige signaal zijn, DESIGN.md §7). */}
        <p id="reset-password-hint" className="text-xs text-muted-foreground">
          {minPasswordLength}–{maxPasswordLength} characters — no other rules.
        </p>
        {status.kind === "weak_password" && (
          <p
            id="reset-password-error"
            role="alert"
            className="text-xs text-destructive"
          >
            That password won&apos;t do — use {minPasswordLength}–
            {maxPasswordLength} characters.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-confirm-password" className="text-sm font-medium">
          Confirm password
        </label>
        <Input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={busy}
          aria-invalid={confirmInvalid}
          aria-describedby={confirmInvalid ? "reset-confirm-error" : undefined}
        />
        {confirmInvalid && (
          <p
            id="reset-confirm-error"
            role="alert"
            className="text-xs text-destructive"
          >
            Passwords don&apos;t match.
          </p>
        )}
      </div>
      {status.kind === "rejected" && (
        <p id="reset-rejected" role="alert" className="text-sm text-destructive">
          {status.message}{" "}
          <Link href="/forgot-password" className="underline underline-offset-4">
            Request a new link
          </Link>
          .
        </p>
      )}
      {status.kind === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong ({status.detail}). Please try again.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Setting password…" : "Set new password"}
      </Button>
    </form>
  );
}
