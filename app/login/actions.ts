"use server";

// Wachtwoordpad van /login (besluit G27/G32, golf 2). `auth` (uit @/lib/auth) heeft
// nextCookies() aan, dus het sessiecookie wordt automatisch in de cookie-jar van Next
// geschreven zodra deze aanroep buiten de HTTP-router om gaat — precies wat hier gebeurt
// (node_modules/better-auth/dist/integrations/next-js.mjs: de after-hook zet het cookie
// bij élke endpoint-aanroep, behalve als ctx._flag === "router"; dat geldt alleen voor
// aanroepen via app/api/auth/[...all]/route.ts, niet voor auth.api.signInEmail hier).
//
// Geen account-enumeratie (§3a): Better Auth's /sign-in/email gooit voor vier
// verschillende onderliggende redenen exact dezelfde APIError
// (node_modules/better-auth/dist/api/routes/sign-in.mjs regel 206-228,
// BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD) — onbekend adres, geen credential-account
// (nog nooit een wachtwoord gezet, bv. een account dat alleen via de magic-link-allowlist
// bestaat), een credential-account zonder wachtwoord, en een verkeerd wachtwoord. We
// vangen die allemaal in dezelfde catch en vertalen ze naar ÉÉN eigen melding — precies de
// lijn die de magic-link-poort in lib/auth-factory.ts al trekt. error.message van Better
// Auth gaat hier nooit naar de gebruiker.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SignInResult } from "@/components/login/password-login-form";
import { auth } from "@/lib/auth";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  const email = input.email.trim();
  const password = input.password;
  if (!email || !password) return { error: GENERIC_LOGIN_ERROR };

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    return { error: GENERIC_LOGIN_ERROR };
  }

  redirect("/projects");
}
