"use client";

// Hoofdpad van /login (besluit G27/G32): e-mail + wachtwoord. De magic link staat
// ernaast als secundair pad (MagicLinkForm) — zie app/login/page.tsx voor de schikking
// en de motivatie.
//
// ⚠️ signInAction (app/login/actions.ts) redirect naar /projects bij succes — dat laat
// de client-promise REJECTEN met NEXT_REDIRECT (Next' navigatiesignaal, geen fout).
// Daarom gaat de aanroep via callAction() uit lib/next-action-result.ts, nooit een kale
// await/try-catch (CLAUDE.md, en dezelfde valkuil als components/activate/activate-form.tsx).
//
// Geen account-enumeratie (§3a): élke afwijzingsreden — onbekend adres, verkeerd
// wachtwoord, een account dat nog geen wachtwoord heeft — komt hier binnen als
// dezelfde generieke melding. signInAction vertaalt Better Auth's foutmelding al naar
// die ene tekst; dit formulier verzint er zelf nooit een andere bij.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/next-action-result";

export type SignInResult = { error: string } | void;
export type SignInAction = (input: {
  email: string;
  password: string;
}) => Promise<SignInResult>;

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const LOGIN_PATH = "/projects";

type FormStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

export function PasswordLoginForm({
  signInAction,
}: {
  signInAction: SignInAction;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const busy = status.kind === "pending";
  const invalid = status.kind === "error";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "pending" });
    const outcome = await callAction(
      () => signInAction({ email, password }),
      { path: LOGIN_PATH },
    );
    switch (outcome.kind) {
      case "arrived":
        // Geslaagd — Next navigeert al naar /projects. Formulier blijft op slot
        // (busy=true) zodat er geen tweede aanroep tussendoor kan.
        return;
      case "value": {
        const v = outcome.value;
        setStatus({
          kind: "error",
          message: v && "error" in v ? v.error : GENERIC_LOGIN_ERROR,
        });
        return;
      }
      case "signedOut":
      case "divertedTo":
        // Kan hier in theorie niet gebeuren (geen requireSession() vóór het inloggen,
        // en de action redirect uitsluitend naar /projects) — default-deny toch, en
        // zonder een detail dat iets over het adres zou kunnen verraden.
        setStatus({ kind: "error", message: GENERIC_LOGIN_ERROR });
        return;
      case "failed":
        // Bewust géén failureDetail() hier: op een inlogformulier zou de onderliggende
        // oorzaak (netwerkfout vs. 500 vs. iets anders) een extra kanaal zijn om iets
        // over een adres af te leiden uit het foutgedrag. Altijd dezelfde tekst.
        setStatus({ kind: "error", message: GENERIC_LOGIN_ERROR });
        return;
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@brink.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={invalid}
          aria-describedby={invalid ? "login-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-invalid={invalid}
          aria-describedby={invalid ? "login-error" : undefined}
        />
      </div>
      {status.kind === "error" && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
