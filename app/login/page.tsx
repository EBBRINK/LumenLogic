"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/dossiers",
    });
    if (error) setError(error.message ?? "Er ging iets mis");
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spec-, calculatie- en offertetool — Brink Licht.
        </p>
      </div>
      {sent ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          Als <span className="font-medium">{email}</span> toegang heeft, is er
          een magic link verstuurd. In deze fase verschijnt de link in de{" "}
          <b>serverconsole</b> — klik hem daar uit.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            placeholder="jij@brink.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit">Stuur magic link</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </main>
  );
}
