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
  revalidatePath("/instellingen");
}

// GEBRUIKERS: adres verwijderen. Het laatste adres blijft staan — niemand sluit
// iedereen buiten (fail-safe, ook los van de uitgeschakelde knop in de UI).
export async function removeEmailAction(formData: FormData) {
  await requireSession();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  const current = await listAllowedEmails(db);
  if (current.length <= 1) return;
  await removeAllowedEmail(db, email);
  revalidatePath("/instellingen");
}

// LLM-BUDGET: maandcap opslaan (getal, €). Leeg/ongeldig laat de cap ongewijzigd.
export async function saveBudgetAction(formData: FormData) {
  await requireSession();
  const raw = String(formData.get("budget") ?? "").replace(",", ".").trim();
  if (raw === "") return;
  const budget = Number(raw);
  if (!Number.isFinite(budget) || budget < 0) return;
  await setSetting(db, "llm_budget_eur", budget);
  revalidatePath("/instellingen");
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
  revalidatePath("/instellingen");
}
