"use server";

// Eén server-actie voor het hele activatie-formulier (sprint 3.1-briefing §3a): e-mail, PIN
// en het nieuwe wachtwoord gaan gezamenlijk in ÉÉN aanroep naar `redeemActivationPin`. Geen
// los "verifieer eerst de PIN"-pad — dat zou een tweede serveraanroep zijn, en de sessie
// mag pas ná het succesvol zetten van het wachtwoord ontstaan, nooit bij het invoeren van de
// PIN. Die volgorde is de garantie van `redeemActivationPin` zelf (lib/auth-activation.ts);
// deze actie voegt er alleen de request-headers en de redirect naar /projects aan toe.
//
// `auth` (uit @/lib/auth) heeft nextCookies() aan, dus het sessiecookie wordt hier
// automatisch gezet zodra `redeemActivationPin` via `auth.api.signInEmail` inlogt — de
// `headers` uit het resultaat hoeven niet apart verwerkt te worden.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActivateResult } from "@/components/activate/activate-form";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";
import { redeemActivationPin } from "@/lib/auth-activation";

export async function activateAction(input: {
  email: string;
  pin: string;
  newPassword: string;
}): Promise<ActivateResult> {
  const result = await redeemActivationPin(auth, db, {
    email: input.email,
    pin: input.pin,
    newPassword: input.newPassword,
    // Alleen voor IP/user-agent op de sessie (optioneel voor redeemActivationPin zelf);
    // het sessiecookie wordt door nextCookies() gezet, niet door dit argument.
    headers: await headers(),
  });
  if (!result.ok) return result;
  redirect("/projects");
}
