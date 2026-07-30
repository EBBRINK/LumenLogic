"use client";

// Het inlogformulier. Ongewijzigd verhuisd uit app/login/page.tsx (UX-audit bug #7):
// die pagina is nu een serverwrapper die een ingelogde gebruiker doorstuurt, en een
// server component kan geen useState hebben. De sessiecheck hoort op de server, het
// formulier blijft client.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/projects",
    });
    if (error) setError(error.message ?? "Something went wrong");
    else setSent(true);
  }

  return (
    // BEWUSTE UITZONDERING op de 1280px-paginacontainer (DESIGN.md §5): één veld en
    // één knop, gecentreerd op een scherm zonder navbalk (de gebruiker is nog niet
    // ingelogd). Er is geen rand om mee uit te lijnen en 384px is de bedoelde
    // formulierbreedte. Zie de allowlist in components/container-breedte.test.ts.
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spec, calculation and quotation tool — Brink Licht.
        </p>
      </div>
      {sent ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          If <span className="font-medium">{email}</span> has access, a magic link
          has been sent. In this phase the link appears in the{" "}
          <b>server console</b> — open it there.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            placeholder="you@brink.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit">Send magic link</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </main>
  );
}
