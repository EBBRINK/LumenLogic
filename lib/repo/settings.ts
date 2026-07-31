// Instellingen-repository (L-02/L-06): allowlist, app-instellingen (LLM-budget, XIS-omgeving)
// en LLM-verbruik. Zelfde patroon als de andere repo's: de db wordt geïnjecteerd, zodat de
// app de Neon-HTTP-client meegeeft en tests een PGlite-client — dezelfde regels, bewijsbaar
// in beide.
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { allowedEmails, appSettings, llmUsage } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// ── Allowlist (L-02): 2–5 interne adressen, geen rollen ──────────────────────
// Adressen worden altijd genormaliseerd (trim + lowercase) zodat "Timo@X" en "timo@x"
// hetzelfde adres zijn — dedup zit in de normalisatie, niet in waakzaamheid.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listAllowedEmails(db: AppDb) {
  return db.select().from(allowedEmails).orderBy(asc(allowedEmails.createdAt));
}

// Idempotent: een bestaand adres opnieuw toevoegen doet niets (PK op email).
export async function addAllowedEmail(
  db: AppDb,
  email: string,
  addedBy?: string | null,
) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const [row] = await db
    .insert(allowedEmails)
    .values({ email: normalized, addedBy: addedBy ?? null })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function removeAllowedEmail(
  db: AppDb,
  email: string,
  actor?: string,
) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  // Staat het adres niet (meer) op de lijst, dan valt er niets te verwijderen — en dus
  // ook niets te melden. Zonder deze controle logde een geprepareerde formulierpost
  // (app/settings/actions.ts bewaakt alleen zelfverwijdering en het laatste adres) een
  // `allowed_email_removed` over een verwijdering die nooit plaatsvond: een onwaar
  // logboek, precies wat ijzeren regel 5 moet uitsluiten. Zelfde vroege terugkeer als
  // deleteSpecLine en removeMembership — dit was de enige destructieve schrijfactie in
  // deze veegbeurt die hem miste.
  const [bestaand] = await db
    .select({ email: allowedEmails.email })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, normalized))
    .limit(1);
  if (!bestaand) return;

  // Loggen vóór de delete (regel 5): daarna is er niets meer om over te rapporteren.
  await logEvent(db, {
    entity: "settings",
    entityId: null,
    action: "allowed_email_removed",
    actor,
    payload: { email: normalized },
  });

  await db.delete(allowedEmails).where(eq(allowedEmails.email, normalized));
}

// De poort onder de magic link (lib/auth.ts): staat dit adres niet in de lijst, dan
// wordt er geen link verstuurd. Fail-closed: onbekend adres = geen toegang.
export async function isAllowed(db: AppDb, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const [row] = await db
    .select({ email: allowedEmails.email })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, normalized))
    .limit(1);
  return !!row;
}

// ── App-instellingen (L-06): sleutel/waarde als jsonb ────────────────────────
// Waarden zijn scalair (bv. het maandbudget als getal, de XIS-omgeving als tekst) of
// een klein object. De jsonb-kolom bewaart elk JSON-type; getSetting geeft de ruwe
// waarde terug, de aanroeper weet het verwachte type.
export async function getSetting<T = unknown>(
  db: AppDb,
  key: string,
): Promise<T | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row ? (row.value as unknown as T) : null;
}

export async function setSetting(
  db: AppDb,
  key: string,
  value: unknown,
): Promise<void> {
  // jsonb accepteert elk JSON-type; het schema-type is Record<> maar we bewaren ook
  // scalars (getal/tekst) — bewust gecast, want de kolom laat het fysiek toe.
  const stored = value as Record<string, unknown>;
  await db
    .insert(appSettings)
    .values({ key, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: stored, updatedAt: new Date() },
    });
}

// ── LLM-verbruik (L-06): de teller tegen de maandcap ─────────────────────────
// Eerste dag van de huidige kalendermaand (lokaal), 00:00 — de grens van de teller.
function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Som van cost_eur binnen de huidige maand. Grijs, niet alarmerend: dit is een teller,
// geen limiethandhaving — de cap zelf leeft als app-setting ('llm_budget_eur').
export async function getLlmSpend(db: AppDb, now = new Date()): Promise<number> {
  const [row] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, startOfMonth(now)))) as { total: string }[];
  return Number(row?.total ?? 0);
}

// Uitsplitsing van diezelfde teller over ÁLLE doelen (UX-audit 30 jul, bug #10). Het
// scherm vroeg eerder twee vaste doelen op ('vangnet', 'ocr') en liet de rest — vandaag
// 'leesroute' — stil in het totaal zitten, waardoor de uitsplitsing niet optelde. Een
// group-by kan dat niet: elke euro die de teller haalt, haalt ook de uitsplitsing, ook
// als er morgen een nieuw doel bij komt.
export type LlmSpendByPurpose = { purpose: string; eur: number };

export async function getLlmSpendByPurpose(
  db: AppDb,
  now = new Date(),
): Promise<LlmSpendByPurpose[]> {
  const rows = (await db
    .select({
      purpose: llmUsage.purpose,
      total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, startOfMonth(now)))
    .groupBy(llmUsage.purpose)) as { purpose: string; total: string }[];
  return rows
    .map((r) => ({ purpose: r.purpose, eur: Number(r.total ?? 0) }))
    .sort((a, b) => b.eur - a.eur || a.purpose.localeCompare(b.purpose));
}

// Zelfde teller, gefilterd op één doel (bv. 'vangnet' — het AI-vangnet van stap 8/B4).
// Voor de uitsplitsing op de instellingenpagina; de cap blijft op het totaal gelden.
export async function getLlmSpendForPurpose(
  db: AppDb,
  purpose: string,
  now = new Date(),
): Promise<number> {
  const [row] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(
      and(eq(llmUsage.purpose, purpose), gte(llmUsage.createdAt, startOfMonth(now))),
    )) as { total: string }[];
  return Number(row?.total ?? 0);
}
