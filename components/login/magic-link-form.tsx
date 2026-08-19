"use client";

// Secundair inlogpad (G32, deploy 1: náást wachtwoord, niet weg — zie
// docs/sprint3-1-briefing.md §5 punt 6 en de correctie in G35). Gedrag ongewijzigd
// t.o.v. de oorspronkelijke /login-pagina: dit is exact dezelfde authClient-aanroep,
// alleen verplaatst naar een eigen component zodat hij achter de <details>-onthulling
// in app/login/page.tsx kan staan. Geen server action hier (authClient.signIn.magicLink
// praat rechtstreeks met Better Auth's eigen route), dus callAction() is hier niet aan
// de orde — er is geen redirect-promise om te classificeren.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/projects",
    });
    if (error) setError(error.message ?? "Something went wrong");
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        If <span className="font-medium">{email}</span> has access, a magic link
        has been sent. (Without a mail key configured, it appears in the server
        console.)
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {/* "Email for magic link" en niet "Email": zodra dit paneel openstaat, staan er twee
            e-mailvelden op het scherm. Visueel scheelt de kaart eromheen ze, maar een
            schermlezer krijgt anders twee keer hetzelfde label achter elkaar. */}
        <label htmlFor="magic-link-email" className="text-sm font-medium">
          Email for magic link
        </label>
        <Input
          id="magic-link-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@brink.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "magic-link-error" : undefined}
        />
      </div>
      <Button type="submit" variant="outline">
        Send magic link
      </Button>
      {error && (
        <p id="magic-link-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
