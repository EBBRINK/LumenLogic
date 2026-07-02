import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Eén gebruiker (Timo), magic link. Rollen komen met de fase-engine (run 3).
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function getActor(): Promise<string> {
  const session = await getSession();
  return session?.user?.email ?? "anoniem";
}
