"use server";

// PIN uitgeven vanuit /admin/users (besluit G26): Brink maakt hier een account plus een
// tijdelijke activatie-PIN aan en mailt die PIN zélf — de app verstuurt niets. Deze action
// is de enige plek waar de klaartekst-PIN ontstaat: hij komt terug in de return-waarde van
// deze ene aanroep, wordt nergens gelogd (issueActivationPin logt alleen e-mail/org/vervaldatum,
// zie lib/repo/activation.ts) en bestaat verder alleen nog gehasht in de database. Zie
// components/admin/pin-block.tsx voor hoe de client die waarde behandelt: uitsluitend in
// React-state, nooit in een prop die van de server komt — een pagina-refresh (nieuwe RSC-render
// van page.tsx) roept deze action niet aan en kan de PIN dus nooit opnieuw tonen.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import type { MembershipRole } from "@/db/schema";
import { issueActivationPin } from "@/lib/repo/activation";
import { getActor, requireSession } from "@/lib/session";

export type IssuePinResult =
  | {
      ok: true;
      email: string;
      /** Klaartekst. Bestaat exact één keer — zie het bestandscommentaar hierboven. */
      pin: string;
      expiresAtIso: string;
      userCreated: boolean;
      /** Absoluut, met ?email= voorgevuld (app/activate/page.tsx leest die param). */
      activateUrl: string;
      name: string | null;
    }
  | { ok: false; error: string };

// Ronde-1-critic: "/activate zonder domein is onbruikbaar" — de ontvanger kan een relatief
// pad niet klikken of intypen. De host komt uit de INKOMENDE request van deze server-action
// (x-forwarded-host op Vercel, host lokaal), dus dit klopt vanzelf in elke omgeving
// (localhost, preview-deploy, productie) zonder dat deze laag een productie-URL hoeft te
// raden of te hardcoden.
async function buildActivateUrl(email: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return `/activate?email=${encodeURIComponent(email)}`;
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/activate?email=${encodeURIComponent(email)}`;
}

// Ronde-1-critic: "rauwe interne foutteksten in de UI" — issueActivationPin gooit Nederlands
// mét functienaam ("issueActivationPin: onbekende organisatie"), en elke andere DB-fout kwam
// woordelijk op het Engelse scherm terecht. Vertaal de twee bekende gevallen expliciet en val
// voor al het overige terug op een neutrale Engelse melding — nooit err.message doorgeven.
function friendlyIssueError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.includes("onbekende organisatie")) {
    return "That organization no longer exists — refresh the page and try again.";
  }
  if (message.includes("ongeldig e-mailadres")) {
    return "Enter a valid email address.";
  }
  return "Something went wrong while issuing the PIN. Check the events log, or try again.";
}

// Dekt zowel "nieuwe gebruiker aanmaken" (met org + rollen) als "PIN opnieuw uitgeven voor
// een bestaande gebruiker" (orgId/roles dan weggelaten door de aanroeper — issueActivationPin
// laat een bestaand membership dan ongemoeid en overschrijft alleen de PIN, precies C10's
// "wachtwoord vergeten = nieuwe PIN"). Client-aanroepers gebruiken callAction() uit
// lib/next-action-result.ts: requireSession() hieronder redirect naar /login bij een
// verlopen sessie, en dat kanaal draagt dan zowel succes als "je bent uitgelogd".
export async function issuePinAction(input: {
  email: string;
  name?: string;
  orgId?: string | null;
  roles?: MembershipRole[];
}): Promise<IssuePinResult> {
  await requireSession();

  const email = input.email.trim();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const actor = await getActor();
  const name = input.name?.trim() || null;
  try {
    const issued = await issueActivationPin(db, {
      email,
      name: name ?? undefined,
      orgId: input.orgId ?? undefined,
      roles: input.roles,
      actor,
    });
    // Ververst de PIN-statuslijst en de memberships-tabel op deze pagina (nieuwe org-lid,
    // nieuwe vervaldatum, teller terug op 0). Draagt zelf nooit de PIN — die staat alleen
    // in de return hierboven, die rechtstreeks naar de aanroepende client gaat.
    revalidatePath("/admin/users");
    return {
      ok: true,
      email: issued.email,
      pin: issued.pin,
      expiresAtIso: issued.expiresAt.toISOString(),
      userCreated: issued.userCreated,
      activateUrl: await buildActivateUrl(issued.email),
      name,
    };
  } catch (err) {
    return { ok: false, error: friendlyIssueError(err) };
  }
}
