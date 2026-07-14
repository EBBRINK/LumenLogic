// De dunne hoofdbalk (functioneel ontwerp §2, navigatieprincipe 3): Dossiers ·
// Catalogus · Data · Analytics · Instellingen. In V1 zien alle gebruikers alles;
// rol-gestuurde versimpeling is H2. Rendert niets zonder sessie (o.a. op /login).
import Link from "next/link";
import { getSession } from "@/lib/session";
import { NavLink } from "./nav-link";

const ITEMS = [
  { href: "/projecten", label: "Projecten" },
  { href: "/catalogus", label: "Catalogus" },
  { href: "/data", label: "Data" },
  { href: "/analytics", label: "Analytics" },
  { href: "/instellingen", label: "Instellingen" },
  { href: "/merk", label: "Merk" },
  { href: "/admin", label: "Admin" },
];

export async function SiteNav() {
  const session = await getSession();
  if (!session) return null;
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link href="/projecten" className="text-sm font-semibold tracking-tight">
          Lumen Logic
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {ITEMS.map((it) => (
            <NavLink key={it.href} href={it.href} label={it.label} />
          ))}
        </nav>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {session.user?.email}
        </span>
      </div>
    </header>
  );
}
