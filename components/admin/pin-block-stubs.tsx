"use client";

// Test-only client-stubs voor pin-block.test.tsx. Zelfde reden als
// components/dossier/pdf-upload-test-stubs.tsx: de vitest-RSC-brug levert de return-waarde
// van een imperatief aangeroepen ÉCHTE server-action niet betrouwbaar terug (in echte Next
// werkt het return-pad wel — dit is een harness-beperking). Door hier gewone client-functies
// te stubben blijft PinBlock zelf volledig en eerlijk te testen (het formulier, de
// eenmalige PIN-weergave, het mailsjabloon, de statuslijst); alleen de draad door de echte
// action-brug blijft buiten schot.
//
// Dit bestand exporteert BEWUST alleen componenten, geen data: een "use client"-module mag
// alleen componenten als client-referentie doorgeven, en de test-asserts hebben de ruwe
// fixture-waarden (FIXED_PIN e.d.) nodig in server-context — die staan daarom in het
// aparte, directive-loze pin-block-fixtures.ts.
import { redirect } from "next/navigation";
import { PinBlock } from "./pin-block";
import { issueHappy, organizations, users } from "./pin-block-fixtures";

// Nabootst hoe Next een redirecterende server-action ECHT aflevert: de client-promise
// rejectet met een NEXT_REDIRECT-digest (zie lib/next-action-result.ts), niet een gewone
// throw. Gebouwd met Next' eigen redirect() zodat de fixture geen zelfgetypte digest-string is.
function nextRedirectError(href: string): Error {
  try {
    redirect(href, "push");
  } catch (e) {
    (e as { handled?: boolean }).handled = true;
    return e as Error;
  }
  throw new Error("redirect() gooide niet — fixture ongeldig");
}

export function PinBlockScreen() {
  return (
    <PinBlock
      organizations={organizations}
      users={users}
      issueAction={issueHappy}
      pinLength={8}
      pinTtlDays={7}
      pinMaxAttempts={5}
    />
  );
}

export function PinBlockLeeg() {
  return (
    <PinBlock
      organizations={organizations}
      users={[]}
      issueAction={issueHappy}
      pinLength={8}
      pinTtlDays={7}
      pinMaxAttempts={5}
    />
  );
}

export function PinBlockMetFout() {
  return (
    <PinBlock
      organizations={organizations}
      users={users}
      issueAction={async () => ({
        ok: false,
        error: "Testfout: uitgifte geweigerd.",
      })}
      pinLength={8}
      pinTtlDays={7}
      pinMaxAttempts={5}
    />
  );
}

export function PinBlockMetSessieRedirect() {
  return (
    <PinBlock
      organizations={organizations}
      users={users}
      issueAction={async () => {
        throw nextRedirectError("/login");
      }}
      pinLength={8}
      pinTtlDays={7}
      pinMaxAttempts={5}
    />
  );
}
