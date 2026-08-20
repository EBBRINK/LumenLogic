// Beheerdersnoodluik: zet direct een wachtwoord op een bestaand account.
//
// Het NORMALE pad is de PIN — Brink geeft er een uit in /admin/users, de gebruiker kiest zelf
// een wachtwoord op /activate (lib/auth-activation.ts). Dat pad blijft leidend en dit script
// vervangt het niet. Dit is er voor de bootstrap-situatie waarin de PIN geen uitkomst biedt:
// er is in deze fase geen mailprovider, dus een PIN die alleen in de serverconsole verschijnt
// helpt niemand die niet zelf in de logs kan kijken.
//
// Zelfde bouwstenen als redeemActivationPin, in dezelfde volgorde:
//   hash via Better Auth' eigen hasher → credential-rij zetten → emailVerified → sessies eruit.
// Er wordt GEEN sessie aangemaakt: wie het wachtwoord krijgt, logt zelf in via /login.
//
//   bun --env-file=.env.local scripts/zet-wachtwoord.ts <e-mail> [wachtwoord]
//
// Zonder wachtwoord genereert het script er een van 24 tekens en drukt hem één keer af —
// daarna staat alleen de hash in de database en is hij nergens meer op te vragen.
import { auth, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth";
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";

// Onthoudbaar én sterk: geen 0/O/1/l/I, want dit wachtwoord wordt overgetypt uit een terminal.
const ALFABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genereerWachtwoord(lengte = 24): string {
  const bytes = new Uint32Array(lengte);
  crypto.getRandomValues(bytes);
  // Modulo-bias is hier verwaarloosbaar (2^32 mod 56 ≈ 0) en de entropie blijft ~5,8 bit
  // per teken, dus ruim 130 bit over 24 tekens.
  return Array.from(bytes, (b) => ALFABET[b % ALFABET.length]).join("");
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error(
      "Gebruik: bun --env-file=.env.local scripts/zet-wachtwoord.ts <e-mail> [wachtwoord]",
    );
    process.exit(1);
  }

  const wachtwoord = process.argv[3] ?? genereerWachtwoord();
  if (
    wachtwoord.length < MIN_PASSWORD_LENGTH ||
    wachtwoord.length > MAX_PASSWORD_LENGTH
  ) {
    console.error(
      `Wachtwoord moet tussen ${MIN_PASSWORD_LENGTH} en ${MAX_PASSWORD_LENGTH} tekens zijn.`,
    );
    process.exit(1);
  }

  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (!found) {
    // Bewust geen user aanmaken: C10/G26 zegt dat accounts uitsluitend via Brink ontstaan.
    // Dit script zet een wachtwoord op een bestaand account, het maakt er geen.
    console.error(`Geen account met e-mail ${email}. Maak de user eerst aan in /admin/users.`);
    process.exit(1);
  }

  const hash = await ctx.password.hash(wachtwoord);
  const credential = found.accounts.find((a) => a.providerId === "credential");
  if (credential) {
    await ctx.internalAdapter.updatePassword(found.user.id, hash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: found.user.id,
      providerId: "credential",
      accountId: found.user.id,
      password: hash,
    });
  }

  if (!found.user.emailVerified) {
    await ctx.internalAdapter.updateUser(found.user.id, { emailVerified: true });
  }

  // Zelfde reden als in redeemActivationPin: een credentialwijziging die oude sessies laat
  // leven is geen remedie (NIST SP 800-63B §5.1.1.2).
  await ctx.internalAdapter.deleteUserSessions(found.user.id);

  await logEvent(db, {
    entity: "user",
    // Geen entityId: events.entity_id is een uuid-kolom en Better Auth' user-ids zijn dat
    // niet allemaal (de oudste rijen dragen een nanoid). Het adres staat in de payload.
    action: "password_set_by_admin",
    actor: "script:zet-wachtwoord",
    payload: { email, hadCredential: !!credential },
  });

  console.log(`\nWachtwoord gezet voor ${email}`);
  console.log(`  ${wachtwoord}\n`);
  console.log("Alle bestaande sessies zijn ingetrokken. Inloggen via /login.");
}

await main();
