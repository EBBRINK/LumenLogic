"use client";
// Test-only client-stubs voor password-block.test.tsx. Zelfde reden als
// components/activate/activate-test-stubs.tsx, components/admin/pin-block-stubs.tsx en
// components/login/login-test-stubs.tsx: de vitest-RSC-brug staat geen kale functies toe die
// van de (server-side) testfile naar een clientcomponent oversteken, tenzij ze een
// "use server"-referentie zijn. Deze stubs zijn zelf al client, dus de teststub-actie hoeft
// nooit de grens over.
//
// Dit bestand exporteert BEWUST alleen componenten, geen data: MIN/MAX staan daarom ook
// gewoon als letterlijke getallen in dit bestand én in de testfile (geen gedeeld
// data-exportbestand nodig voor twee constanten).
import { PasswordBlock } from "./password-block";
import type { ChangePasswordResult } from "./password-block";

declare global {
  interface Window {
    __changePasswordCalls?: { currentPassword: string; newPassword: string }[];
  }
}

const MIN = 12;
const MAX = 128;

function telAanroep(input: { currentPassword: string; newPassword: string }) {
  if (typeof window !== "undefined") {
    window.__changePasswordCalls = [
      ...(window.__changePasswordCalls ?? []),
      input,
    ];
  }
}

const nooitAanroepen = async (): Promise<ChangePasswordResult> => {
  throw new Error(
    "deze stub-actie hoort in deze test nooit aangeroepen te worden",
  );
};

const altijdWrongCurrent = async (input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> => {
  telAanroep(input);
  return { error: "wrong_current_password" };
};

// Deploy-1-scenario (briefing §2): het account heeft nog helemaal geen wachtwoord.
const altijdNoPasswordYet = async (input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> => {
  telAanroep(input);
  return { error: "no_password_yet" };
};

const altijdSuccess = async (input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> => {
  telAanroep(input);
  return { ok: true };
};

// Voor de screenshot- en structuurtests: mag nooit aangeroepen worden (er wordt niet
// geklikt), dus elke aanroep is een testfout.
export function PasswordBlockIdle() {
  if (typeof window !== "undefined") window.__changePasswordCalls = [];
  return (
    <PasswordBlock
      minPasswordLength={MIN}
      maxPasswordLength={MAX}
      changePasswordAction={nooitAanroepen}
    />
  );
}

export function PasswordBlockWrongCurrent() {
  if (typeof window !== "undefined") window.__changePasswordCalls = [];
  return (
    <PasswordBlock
      minPasswordLength={MIN}
      maxPasswordLength={MAX}
      changePasswordAction={altijdWrongCurrent}
    />
  );
}

export function PasswordBlockNoPasswordYet() {
  if (typeof window !== "undefined") window.__changePasswordCalls = [];
  return (
    <PasswordBlock
      minPasswordLength={MIN}
      maxPasswordLength={MAX}
      changePasswordAction={altijdNoPasswordYet}
    />
  );
}

export function PasswordBlockSuccess() {
  if (typeof window !== "undefined") window.__changePasswordCalls = [];
  return (
    <PasswordBlock
      minPasswordLength={MIN}
      maxPasswordLength={MAX}
      changePasswordAction={altijdSuccess}
    />
  );
}
