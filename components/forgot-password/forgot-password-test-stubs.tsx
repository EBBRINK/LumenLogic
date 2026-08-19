"use client";
// Test-only client-stubs voor forgot-password.test.tsx. Zelfde reden als
// components/login/login-test-stubs.tsx: de vitest-RSC-brug staat geen kale functies toe
// die van de (server-side) testfile naar een clientcomponent oversteken ("Functions cannot
// be passed directly to Client Components"). Deze stubs zijn zelf al client; alleen de
// kant-en-klare componenten gaan de testfile in, en het aantal aanroepen reist via een
// window-teller.
import { ForgotPasswordForm } from "./forgot-password-form";
import type { ForgotPasswordResult } from "@/app/forgot-password/actions";

declare global {
  interface Window {
    __forgotCalls?: string[];
  }
}

const nooitAanroepen = async (): Promise<ForgotPasswordResult> => {
  throw new Error(
    "deze stub-actie hoort in deze test nooit aangeroepen te worden",
  );
};

// De echte action antwoordt ALTIJD { ok: true } — bestaand adres, onbekend adres,
// ongeldige invoer, interne fout (anti-enumeratie). Eén stub dekt dus alle gevallen.
const altijdOk = async (formData: FormData): Promise<ForgotPasswordResult> => {
  if (typeof window !== "undefined") {
    window.__forgotCalls = [
      ...(window.__forgotCalls ?? []),
      String(formData.get("email")),
    ];
  }
  return { ok: true };
};

// Ook een crash hoort in dezelfde neutrale sent-melding te eindigen (tweede kanaal dicht).
const altijdCrash = async (): Promise<ForgotPasswordResult> => {
  throw new Error("gesimuleerde netwerkfout");
};

// Voor de screenshot- en structuurtests: er wordt niet geklikt, dus elke aanroep is fout.
export function ForgotPasswordFormIdle() {
  if (typeof window !== "undefined") window.__forgotCalls = [];
  return <ForgotPasswordForm requestPasswordResetAction={nooitAanroepen} />;
}

export function ForgotPasswordFormOk() {
  if (typeof window !== "undefined") window.__forgotCalls = [];
  return <ForgotPasswordForm requestPasswordResetAction={altijdOk} />;
}

export function ForgotPasswordFormCrash() {
  if (typeof window !== "undefined") window.__forgotCalls = [];
  return <ForgotPasswordForm requestPasswordResetAction={altijdCrash} />;
}
