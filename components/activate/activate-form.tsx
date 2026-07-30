"use client";

// Eén formulier, één server-actie (sprint 3.1-briefing §3a): e-mail, PIN en het nieuwe
// wachtwoord gaan gezamenlijk in ÉÉN aanroep naar `activateAction` (die op zijn beurt
// `redeemActivationPin` aanroept). Er is bewust geen los "verifieer eerst de PIN"-verzoek
// vóór het wachtwoordveld verschijnt — dat zou een tweede serveraanroep zijn en de sessie
// zou dan kunnen ontstaan vóórdat het wachtwoord gezet is. Wil je het toch visueel als twee
// stappen laten aanvoelen, dan mag dat, maar uitsluitend client-side (geen extra await).
// Hier is bewust gekozen voor één zichtbaar formulier: dat is het simpelste dat aan de lat
// voldoet en het makkelijkst foutloos te toetsen.
//
// ⚠️ De action redirect()'t bij succes naar /projects — dat laat de client-promise
// REJECTEN met NEXT_REDIRECT (Next' navigatiesignaal, geen fout). Daarom gaat de aanroep
// hieronder via callAction() uit lib/next-action-result.ts, nooit via een kale
// await/try-catch (zie CLAUDE.md en dat bestand zelf).
import { useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { callAction, failureDetail } from "@/lib/next-action-result";

// Zelfde vorm als RedeemResult uit lib/auth-activation.ts, maar zonder het ok:true-lid: een
// geslaagde activatie redirect (zie boven) en levert dus nooit een gewone waarde op.
export type ActivateResult = { ok: false; reason: "invalid" | "weak_password" };
export type ActivateAction = (input: {
  email: string;
  pin: string;
  newPassword: string;
}) => Promise<ActivateResult>;

type FormStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "invalid" }
  | { kind: "weak_password" }
  | { kind: "mismatch" }
  | { kind: "failed"; detail: string };

// ÉÉN generieke afwijzing (§3a): dekt onbekend adres, verkeerde PIN, verlopen PIN, al
// gebruikte PIN en een doodgelopen PIN (te vaak geprobeerd). Nooit uitsplitsen — dat zou
// verraden of een e-mailadres bestaat (account-enumeratie). Mag wél zeggen wat je kunt doen.
const INVALID_PIN_MESSAGE =
  "This code doesn't work. Check the digits below, or ask Brink for a new activation email.";

export function ActivateForm({
  activateAction,
  defaultEmail = "",
  pinLength,
  minPasswordLength,
  maxPasswordLength,
}: {
  activateAction: ActivateAction;
  /** Vooringevuld vanuit ?email= in de link die Brink meestuurt — optioneel, blijft leeg-vrij bewerkbaar. */
  defaultEmail?: string;
  /** Uit lib/repo/activation.ts (PIN_LENGTH) — de server-page importeert en geeft door, deze
   * client-component importeert nooit rechtstreeks uit lib/repo of lib/auth-factory (die
   * modules trekken Better Auth/Drizzle mee, en dat hoort niet in de client-bundel). */
  pinLength: number;
  /** Uit lib/auth-factory.ts (MIN_PASSWORD_LENGTH), zelfde reden als hierboven. */
  minPasswordLength: number;
  /** Uit lib/auth-factory.ts (MAX_PASSWORD_LENGTH), zelfde reden als hierboven. */
  maxPasswordLength: number;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const busy = status.kind === "pending";
  const pinInvalid = status.kind === "invalid";
  const passwordInvalid = status.kind === "weak_password";
  const confirmInvalid = status.kind === "mismatch";
  const half = pinLength / 2;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Wachtwoordbevestiging is een pure client-check: geen tweede serveraanroep, geen PIN
    // die daarvoor wordt opgebrand.
    if (password !== confirmPassword) {
      setStatus({ kind: "mismatch" });
      return;
    }
    setStatus({ kind: "pending" });
    const outcome = await callAction(
      () => activateAction({ email, pin, newPassword: password }),
      { path: "/projects" },
    );
    switch (outcome.kind) {
      case "arrived":
        // Geslaagd — Next navigeert al naar /projects. Het formulier blijft op slot
        // (busy=true) zodat er geen tweede aanroep tussendoor kan.
        return;
      case "value":
        setStatus({ kind: outcome.value.reason });
        return;
      case "signedOut":
      case "divertedTo":
        // Kan in theorie niet gebeuren (deze actie roept nooit requireSession() aan en
        // redirect uitsluitend naar /projects), maar default-deny: een onverwachte
        // bestemming is hier een zichtbare fout, geen stille aanname van succes.
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
        <CardTitle>Activate your account</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter the activation code Brink emailed you and choose a password.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="activate-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="activate-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="activate-pin" className="text-sm font-medium">
              Activation code
            </label>
            {/* Twee groepen van vier: acht cijfers op één rij lezen als een telefoonnummer
                en zijn lastig in één oogopslag te controleren tegen een mailtje. Vier-en-vier
                (zoals een bankkaart-PIN of de meeste 2FA-codes) knipt de reeks in twee
                hapklare stukken en de separator geeft meteen een visueel middenanker om op
                te richten bij het overtypen.
                De vakjes in components/ui/input-otp.tsx krimpen mee (flex-1, 28–40px): acht
                vaste vakjes van 40px meten ~390px en pasten niet op een telefoon van 375px —
                het achtste vakje viel stil weg achter de overflow van de kaart. Dat is bij
                het bouwen van dit scherm gevonden en in de component zelf opgelost, niet hier
                met een scrollbalk. */}
            <InputOTP
              id="activate-pin"
              name="pin"
              maxLength={pinLength}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              value={pin}
              onChange={setPin}
              disabled={busy}
              aria-describedby={pinInvalid ? "activate-pin-error" : "activate-pin-hint"}
            >
              <InputOTPGroup>
                {Array.from({ length: half }, (_, i) => (
                  <InputOTPSlot key={i} index={i} aria-invalid={pinInvalid} />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {Array.from({ length: half }, (_, i) => (
                  <InputOTPSlot
                    key={half + i}
                    index={half + i}
                    aria-invalid={pinInvalid}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p id="activate-pin-hint" className="text-xs text-muted-foreground">
              {pinLength} digits, from Brink&apos;s activation email.
            </p>
            {pinInvalid && (
              <p
                id="activate-pin-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {INVALID_PIN_MESSAGE}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="activate-password" className="text-sm font-medium">
              New password
            </label>
            <Input
              id="activate-password"
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
              aria-describedby="activate-password-hint"
            />
            <p
              id="activate-password-hint"
              className={
                passwordInvalid
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {passwordInvalid
                ? `That password won't do — use ${minPasswordLength}–${maxPasswordLength} characters.`
                : `${minPasswordLength}–${maxPasswordLength} characters — no other rules.`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="activate-confirm-password"
              className="text-sm font-medium"
            >
              Confirm password
            </label>
            <Input
              id="activate-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              aria-invalid={confirmInvalid}
              aria-describedby={
                confirmInvalid ? "activate-confirm-error" : undefined
              }
            />
            {confirmInvalid && (
              <p
                id="activate-confirm-error"
                role="alert"
                className="text-xs text-destructive"
              >
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          {status.kind === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong ({status.detail}). Please try again.
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Activating…" : "Activate account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
