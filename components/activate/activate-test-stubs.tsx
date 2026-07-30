"use client";
// Test-only client-wrappers voor de /activate-interactietests. Zelfde reden als
// components/dossier/pdf-upload-test-stubs.tsx: de vitest-RSC-testbrug staat geen functies
// toe die van een server-boundary naar een cliëntcomponent oversteken, tenzij ze een
// "use server"-referentie zijn ("Functions cannot be passed directly to Client Components").
// Deze stubs zijn zelf al client, dus de teststub-actie hoeft nooit de grens over — en het
// aantal aanroepen wordt bijgehouden via een window-teller (module-exports komen door de
// RSC-testbrug als een client-referentie aan, niet als de waarde zelf).
import type { ActivateAction, ActivateResult } from "./activate-form";
import { ActivateForm } from "./activate-form";

declare global {
  interface Window {
    __activateCalls?: number;
  }
}

function telAanroep() {
  if (typeof window !== "undefined") {
    window.__activateCalls = (window.__activateCalls ?? 0) + 1;
  }
}

const nooitAanroepen: ActivateAction = async () => {
  telAanroep();
  throw new Error(
    "deze stub-actie hoort in deze test nooit aangeroepen te worden",
  );
};

const altijdInvalid: ActivateAction = async (): Promise<ActivateResult> => {
  telAanroep();
  return { ok: false, reason: "invalid" };
};

const altijdZwakWachtwoord: ActivateAction = async (): Promise<ActivateResult> => {
  telAanroep();
  return { ok: false, reason: "weak_password" };
};

type Sizes = {
  pinLength: number;
  minPasswordLength: number;
  maxPasswordLength: number;
};

// Voor de screenshot- en structuurtests: mag nooit aangeroepen worden (er wordt niet
// geklikt), dus elke aanroep is een testfout.
export function ActivateFormIdle(sizes: Sizes) {
  if (typeof window !== "undefined") window.__activateCalls = 0;
  return <ActivateForm activateAction={nooitAanroepen} {...sizes} />;
}

// Simuleert elke PIN-afwijzing van de server (onbekend adres, verkeerde PIN, verlopen,
// al gebruikt, doodgelopen) — die geven allemaal exact dezelfde reason:"invalid" terug.
export function ActivateFormInvalid(sizes: Sizes) {
  if (typeof window !== "undefined") window.__activateCalls = 0;
  return <ActivateForm activateAction={altijdInvalid} {...sizes} />;
}

export function ActivateFormWeakPassword(sizes: Sizes) {
  if (typeof window !== "undefined") window.__activateCalls = 0;
  return <ActivateForm activateAction={altijdZwakWachtwoord} {...sizes} />;
}

// Voor de mismatch-test: welke waarde de stub teruggeeft maakt niet uit, want het punt van
// die test is juist dat de actie NOOIT wordt aangeroepen (de mismatch wordt client-side
// afgevangen, vóór er een serveraanroep gebeurt).
export function ActivateFormMismatchCheck(sizes: Sizes) {
  if (typeof window !== "undefined") window.__activateCalls = 0;
  return <ActivateForm activateAction={altijdInvalid} {...sizes} />;
}
