"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  addAllowedEmail,
  listAllowedEmails,
  removeAllowedEmail,
  setSetting,
} from "@/lib/repo/settings";
import { getActor, requireSession } from "@/lib/session";

// GEBRUIKERS: adres toevoegen (idempotent + genormaliseerd in de repo).
export async function addEmailAction(formData: FormData) {
  await requireSession();
  const email = String(formData.get("email") ?? "").trim();
  if (email) await addAllowedEmail(db, email, await getActor());
  revalidatePath("/settings");
}

// GEBRUIKERS: adres verwijderen. Twee vangrails, allebei serverkant — de knoppen in
// components/settings/allowed-emails-block.tsx zijn de uitleg, niet de poort:
//  1. Het laatste adres blijft staan — niemand sluit iedereen buiten.
//  2. Je eigen adres blijft staan (UX-audit bug #5). Dit stond tot 2026-07-30 alléén
//     als disabled knop in de UI; een kale POST met je eigen adres slaagde gewoon zolang
//     er twee adressen waren, en sloot je uit van het énige scherm waarlangs je jezelf
//     weer kon toevoegen. Precies de lock-out die die bevinding wilde dichten.
// Normaliseren gebeurt aan beide kanten hetzelfde als in lib/repo/settings.ts
// (trim + lowercase), anders glipt "Timo@X" langs een vergelijking met "timo@x".
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function removeEmailAction(formData: FormData) {
  const session = await requireSession();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return;
  const self = normalizeEmail(session.user?.email ?? "");
  if (self && email === self) return;
  const current = await listAllowedEmails(db);
  if (current.length <= 1) return;
  await removeAllowedEmail(db, email, await getActor());
  revalidatePath("/settings");
}

// LLM-BUDGET: maandcap opslaan (getal, €). Leeg/ongeldig laat de cap ongewijzigd.
export async function saveBudgetAction(formData: FormData) {
  await requireSession();
  const raw = String(formData.get("budget") ?? "").replace(",", ".").trim();
  if (raw === "") return;
  const budget = Number(raw);
  if (!Number.isFinite(budget) || budget < 0) return;
  await setSetting(db, "llm_budget_eur", budget);
  revalidatePath("/settings");
}

// XIS: omgeving + (optioneel) API-sleutel. Sandbox is de veilige default; een lege
// sleutel behoudt de bestaande waarde. De sleutel wordt nooit teruggetoond.
export async function saveXisAction(formData: FormData) {
  await requireSession();
  const environment =
    formData.get("environment") === "productie" ? "productie" : "sandbox";
  await setSetting(db, "xis_environment", environment);
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey) await setSetting(db, "xis_api_key", apiKey);
  revalidatePath("/settings");
}
