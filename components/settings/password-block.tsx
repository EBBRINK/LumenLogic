"use client";

// Zelf je wachtwoord wijzigen (besluit G34, punt 10 van de sprint 3.1-lat): het huidige
// wachtwoord is verplicht. Kaart-opbouw gekopieerd van XisBlock/LlmBudgetBlock (dezelfde
// Card/CardHeader/CardContent-structuur en toon), maar dit blok roept zijn action wél via
// callAction() aan in plaats van een kale <form action={...}>: changePasswordAction begint
// met requireSession(), en die redirect bij een verlopen sessie naar /login. Dat komt
// binnen als een REJECTED promise met NEXT_REDIRECT, geen normale waarde — een kale
// try/catch zou een verlopen sessie tot "verkeerd wachtwoord" verklaren. Zie CLAUDE.md en
// lib/next-action-result.ts, en hetzelfde patroon in components/activate/activate-form.tsx.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { callAction, failureDetail } from "@/lib/next-action-result";

// "wrong_current_password": het huidige wachtwoord klopt niet — geen account-enumeratie-
// oppervlak zoals /login, want de gebruiker is al ingelogd. "no_password_yet": het account
// heeft nog HELEMAAL geen wachtwoord (deploy 1 — 0 van de 3 huidige users hebben er een,
// briefing §2), dus "incorrect" zou hier onwaar zijn — dit vraagt om een andere melding
// mét vervolgstap (golf-2-critic ronde 1). "weak_password" dekt zowel de client-check
// hieronder (voor de aanroep) als Better Auth's eigen lengtecontrole in de action, voor
// het geval die twee ooit uit de pas lopen.
export type ChangePasswordResult =
  | { ok: true }
  | {
      error: "wrong_current_password" | "no_password_yet" | "weak_password";
    };
export type ChangePasswordAction = (input: {
  currentPassword: string;
  newPassword: string;
}) => Promise<ChangePasswordResult>;

const SETTINGS_PATH = "/settings";

type FormStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "wrong_current_password" }
  | { kind: "no_password_yet" }
  | { kind: "weak_password" }
  | { kind: "mismatch" }
  | { kind: "success" }
  | { kind: "failed"; detail: string };

export function PasswordBlock({
  minPasswordLength,
  maxPasswordLength,
  changePasswordAction,
}: {
  /** Uit lib/auth-factory.ts (MIN_PASSWORD_LENGTH) — de server-pagina geeft hem door. */
  minPasswordLength: number;
  /** Uit lib/auth-factory.ts (MAX_PASSWORD_LENGTH) — idem. */
  maxPasswordLength: number;
  changePasswordAction: ChangePasswordAction;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const busy = status.kind === "pending";
  const currentInvalid =
    status.kind === "wrong_current_password" ||
    status.kind === "no_password_yet";
  const newInvalid = status.kind === "weak_password";
  const confirmInvalid = status.kind === "mismatch";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Bevestiging + lengte-eis zijn pure client-checks: geen aanroep, geen actie die het
    // huidige wachtwoord al zou moeten verifiëren voor iets dat lokaal al af te keuren is.
    if (newPassword !== confirmPassword) {
      setStatus({ kind: "mismatch" });
      return;
    }
    if (
      newPassword.length < minPasswordLength ||
      newPassword.length > maxPasswordLength
    ) {
      setStatus({ kind: "weak_password" });
      return;
    }
    setStatus({ kind: "pending" });
    const outcome = await callAction(
      () => changePasswordAction({ currentPassword, newPassword }),
      { path: SETTINGS_PATH },
    );
    switch (outcome.kind) {
      case "value": {
        const v = outcome.value;
        if (v && "ok" in v) {
          setStatus({ kind: "success" });
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else if (v && "error" in v) {
          setStatus({ kind: v.error });
        } else {
          setStatus({ kind: "failed", detail: "unexpected response" });
        }
        return;
      }
      case "signedOut":
        setStatus({
          kind: "failed",
          detail: "your session expired — sign in again",
        });
        return;
      case "arrived":
      case "divertedTo":
        // changePasswordAction redirect nooit — als dat toch gebeurt, is dat een
        // onverwachte bestemming en dus een fout, geen stille aanname van succes.
        setStatus({ kind: "failed", detail: "unexpected response" });
        return;
      case "failed":
        setStatus({ kind: "failed", detail: failureDetail(outcome.error) });
        return;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <p className="text-sm text-muted-foreground">
          Change your own password. Your current password is required.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current-password" className="text-sm font-medium">
              Current password
            </label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={busy}
              className="sm:max-w-xs"
              aria-invalid={currentInvalid}
              aria-describedby={
                currentInvalid ? "current-password-error" : undefined
              }
            />
            {currentInvalid && (
              <p
                id="current-password-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {status.kind === "no_password_yet"
                  ? "This account doesn't have a password yet — ask Brink for an activation code."
                  : "Current password is incorrect."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="text-sm font-medium">
              New password
            </label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={minPasswordLength}
              maxLength={maxPasswordLength}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
              className="sm:max-w-xs"
              aria-invalid={newInvalid}
              aria-describedby="new-password-hint"
            />
            <p
              id="new-password-hint"
              className={
                newInvalid
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {newInvalid
                ? `That password won't do — use ${minPasswordLength}–${maxPasswordLength} characters.`
                : `${minPasswordLength}–${maxPasswordLength} characters — no other rules.`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirm-new-password"
              className="text-sm font-medium"
            >
              Confirm new password
            </label>
            <Input
              id="confirm-new-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              className="sm:max-w-xs"
              aria-invalid={confirmInvalid}
              aria-describedby={
                confirmInvalid ? "confirm-password-error" : undefined
              }
            />
            {confirmInvalid && (
              <p
                id="confirm-password-error"
                role="alert"
                className="text-xs text-destructive"
              >
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          {status.kind === "success" && (
            <p role="status" className="text-sm text-status-green-ink">
              Password changed.
            </p>
          )}
          {status.kind === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong ({status.detail}). Please try again.
            </p>
          )}

          <Button
            type="submit"
            variant="secondary"
            disabled={busy}
            className="self-start"
          >
            {busy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
