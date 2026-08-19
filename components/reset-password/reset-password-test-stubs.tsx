"use client";
// Test-only client-stubs voor reset-password.test.tsx. Zelfde reden als
// components/login/login-test-stubs.tsx en components/activate/activate-test-stubs.tsx:
// de vitest-RSC-brug staat geen kale functies toe die van de (server-side) testfile naar
// een clientcomponent oversteken. Alleen componenten gaan de testfile in; het aantal
// aanroepen reist via een window-teller.
import { ResetPasswordForm } from "./reset-password-form";
import type { ResetPasswordResult } from "@/app/reset-password/actions";

declare global {
  interface Window {
    __resetCalls?: { token: string; newPassword: string }[];
  }
}

function telAanroep(formData: FormData) {
  if (typeof window !== "undefined") {
    window.__resetCalls = [
      ...(window.__resetCalls ?? []),
      {
        token: String(formData.get("token")),
        newPassword: String(formData.get("newPassword")),
      },
    ];
  }
}

const nooitAanroepen = async (): Promise<ResetPasswordResult> => {
  throw new Error(
    "deze stub-actie hoort in deze test nooit aangeroepen te worden",
  );
};

// Dekt élke tokenfout (ongeldig, verlopen, hergebruikt): de echte action geeft daarvoor
// één en dezelfde generieke melding terug — zie GENERIC_RESET_ERROR in
// app/reset-password/actions.ts.
const altijdTokenfout = async (
  formData: FormData,
): Promise<ResetPasswordResult> => {
  telAanroep(formData);
  return { error: "This reset link is invalid or has expired. Request a new one." };
};

type Sizes = { minPasswordLength: number; maxPasswordLength: number };

// Voor de screenshot- en structuurtests: er wordt niet geklikt, dus elke aanroep is fout.
export function ResetPasswordFormIdle(sizes: Sizes) {
  if (typeof window !== "undefined") window.__resetCalls = [];
  return (
    <ResetPasswordForm
      resetPasswordAction={nooitAanroepen}
      token="test-token"
      {...sizes}
    />
  );
}

export function ResetPasswordFormTokenfout(sizes: Sizes) {
  if (typeof window !== "undefined") window.__resetCalls = [];
  return (
    <ResetPasswordForm
      resetPasswordAction={altijdTokenfout}
      token="test-token"
      {...sizes}
    />
  );
}
