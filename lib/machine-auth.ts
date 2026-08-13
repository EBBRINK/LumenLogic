// Machine-authenticatie voor het matchstation (sprint M1) — geen mensenaccount, geen
// sessie: de EliteDesk (M2, nog niet gebouwd) identificeert zich met één statische
// sleutel uit env. Dit is bewust een ANDERE poort dan lib/route-toegang.ts: die leunt op
// een Better Auth-sessie en een organisatie-lidmaatschap, en een machine heeft geen van
// beide. De routes onder app/api/matchstation/* staan daarom als "open" in
// lib/route-allowlist.ts (net als /api/health) — bewaakRoute() geeft dan een lege
// Toegang terug zonder sessie te eisen, en de ECHTE poort is de check hieronder.
//
// Secrets nooit in git (CLAUDE.md): MATCHSTATION_MACHINE_KEY en CRON_SECRET leven
// alleen in env (.env.local lokaal, Vercel-projectinstellingen in productie).
//
// Web Crypto (`crypto.subtle`) en niet `node:crypto`: de testsuite draait in de browser
// (vitest-browser/playwright, zelfde afweging als lib/enrichment/zwerm-meng.ts) en
// `node:crypto` is daar niet beschikbaar — `crypto.subtle` bestaat in zowel Node als de
// browser en is dus de vorm die op beide plekken hetzelfde gedrag heeft.
async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  // a en b zijn hier altijd SHA-256-digests (vaste lengte, 32 bytes) — vergelijk dus
  // een vaste-lengte digest in plaats van de ruwe strings: zo lekt een ongelijke
  // sleutellengte niet via een vroege `false`, en het XOR-accumuleren loopt altijd de
  // volle lengte af in plaats van bij het eerste verschil te stoppen.
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a[i] ^ b[i];
  return verschil === 0;
}

async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)]);
  return constantTimeEqualBytes(digestA, digestB);
}

/**
 * Controleert de `X-Matchstation-Key`-header tegen `MATCHSTATION_MACHINE_KEY`.
 *
 * Geeft altijd een duidelijke reden terug in plaats van alleen true/false — de routes
 * loggen die reden (ijzeren regel 5: ook een geweigerde poging is een gebeurtenis), maar
 * sturen hem NOOIT naar de aanroeper (zelfde les als MSG_DENIED in lib/repo/authz.ts en
 * app/api/health/route.ts: een 401 met uitleg vertelt een aanvaller wat hij moet raden).
 */
export async function verifyMachineKey(
  headerValue: string | null,
): Promise<{ ok: true } | { ok: false; reason: "no_key_configured" | "missing" | "wrong" }> {
  const expected = process.env.MATCHSTATION_MACHINE_KEY;
  if (!expected) return { ok: false, reason: "no_key_configured" };
  if (!headerValue) return { ok: false, reason: "missing" };
  if (!(await constantTimeEquals(headerValue, expected))) return { ok: false, reason: "wrong" };
  return { ok: true };
}

/**
 * Controleert de cron-aanroep. Vercel Cron Jobs sturen automatisch
 * `Authorization: Bearer $CRON_SECRET` mee zodra die env-var gezet is (Vercel-conventie,
 * zie vercel.json) — dezelfde header die wij hier terugvergelijken.
 */
export async function verifyCronSecret(
  authHeader: string | null,
): Promise<{ ok: true } | { ok: false; reason: "no_secret_configured" | "missing" | "wrong" }> {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: "no_secret_configured" };
  if (!authHeader) return { ok: false, reason: "missing" };
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!(await constantTimeEquals(token, expected))) return { ok: false, reason: "wrong" };
  return { ok: true };
}
