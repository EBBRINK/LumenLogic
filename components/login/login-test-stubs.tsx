"use client";
// Test-only client-stubs voor login.test.tsx. Zelfde reden als
// components/activate/activate-test-stubs.tsx en components/admin/pin-block-stubs.tsx: de
// vitest-RSC-brug staat geen kale functies toe die van de (server-side) testfile naar een
// clientcomponent oversteken, tenzij ze een "use server"-referentie zijn ("Functions cannot
// be passed directly to Client Components unless you explicitly expose it by marking it with
// 'use server'"). Deze stubs zijn zelf al client, dus de teststub-actie hoeft nooit de grens
// over — alleen de kant-en-klare componenten hieronder gaan de testfile in.
//
// Dit bestand exporteert BEWUST alleen componenten, geen data (zie
// components/admin/pin-block-fixtures.ts voor dezelfde regel): een "use client"-module mag
// alleen componenten als client-referentie doorgeven; gewone data-exports worden ondoorzichtige
// referenties zodra de (server-side) testfile ze rechtstreeks probeert te lezen.
import { PasswordLoginForm } from "./password-login-form";
import type { SignInResult } from "./password-login-form";

declare global {
  interface Window {
    __signInCalls?: { email: string; password: string }[];
  }
}

function telAanroep(input: { email: string; password: string }) {
  if (typeof window !== "undefined") {
    window.__signInCalls = [...(window.__signInCalls ?? []), input];
  }
}

const nooitAanroepen = async (): Promise<SignInResult> => {
  throw new Error(
    "deze stub-actie hoort in deze test nooit aangeroepen te worden",
  );
};

// Dekt elke onderliggende afwijzingsreden van signInAction (onbekend adres, verkeerd
// wachtwoord, nog geen wachtwoord gezet) — die geven allemaal dezelfde generieke melding.
const altijdGenericError = async (input: {
  email: string;
  password: string;
}): Promise<SignInResult> => {
  telAanroep(input);
  return { error: "Invalid email or password." };
};

// Voor de screenshot- en structuurtests: mag nooit aangeroepen worden (er wordt niet
// geklikt), dus elke aanroep is een testfout.
export function PasswordLoginFormIdle() {
  if (typeof window !== "undefined") window.__signInCalls = [];
  return <PasswordLoginForm signInAction={nooitAanroepen} />;
}

export function PasswordLoginFormGenericError() {
  if (typeof window !== "undefined") window.__signInCalls = [];
  return <PasswordLoginForm signInAction={altijdGenericError} />;
}
