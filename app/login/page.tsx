// Inloggen. UX-audit bug #7: deze pagina was een client component zónder sessiecheck,
// dus een ingelogde gebruiker kreeg de volledige navbalk én een "Send magic link"-
// formulier. Daarom nu een serverwrapper: is er een sessie, dan hoort hier niets te
// kiezen te zijn en gaat de gebruiker door naar /projects.
//
// Bewust getSession() en niet requireSession() — die laatste redirect juist naar /login
// en zou hier een lus opleveren.
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/projects");
  return <LoginForm />;
}
