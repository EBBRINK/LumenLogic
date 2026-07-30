"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavHref, NAV_ITEMS } from "./nav-items";

export function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // pt-1 + pb-0.5 + 2px rand = de 4px onderruimte van de oude py-1, dus de
        // balk wordt niet hoger. border-transparent op inactief houdt die 2px
        // gereserveerd — anders springt de balk bij elke navigatie.
        "rounded-sm border-b-2 px-2.5 pt-1 pb-0.5 transition-colors",
        // Focus-outline teal en niet --ring: blauw #2D5A8C haalt op navy 2,27:1
        // en faalt de eis "altijd zichtbaar" uit kit §11. Zelfde redenering als
        // besluit O10, nu ook in light. Radius 4px = §11.
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent",
        active
          ? "border-nav-accent font-medium text-nav-foreground"
          : "border-transparent text-nav-muted hover:text-nav-foreground",
      )}
    >
      {label}
    </Link>
  );
}

// `pathname` is alleen bedoeld voor tests; in de app komt hij uit de router.
export function NavBar({
  email,
  pathname,
}: {
  email?: string | null;
  pathname?: string;
}) {
  const routePathname = usePathname();
  const active = activeNavHref(pathname ?? routePathname ?? "");
  return (
    <header className="border-b border-nav-border bg-nav">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link
          href="/projects"
          className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent"
        >
          {/* Alleen het BEELDMERK, geen lockup: het woordmerk is #0A0A0A en haalt
              op navy 1,23:1. Een mono-witte lockup is door de kit gesanctioneerd
              (§2) maar niet geleverd — zie DESIGN.md O11. Het beeldmerk zelf heeft
              die kleur niet en leest wél op navy (violet-laag 3,7:1, magenta 5,4:1).
              Kale <img> en geen next/image: voor een SVG valt er niets te
              optimaliseren, en de optimizer weigert SVG zonder dangerouslyAllowSVG.
              alt="" houdt de toegankelijke naam van de link exact "Lumen Logic".
              24px = het kit-minimum voor het losse beeldmerk (§2). */}
          <img
            src="/brand/lumenlogic_logo.svg"
            alt=""
            width={24}
            height={24}
            className="size-6"
          />
          {/* Op mobiel staat alléén het beeldmerk: de balk loopt daar al over (zie
              het commitbericht) en het beeldmerk ís de compacte merkvorm (§2). Met
              sr-only i.p.v. hidden blijft de toegankelijke naam van de link overal
              "Lumen Logic" — een verborgen span zou hem op mobiel leeg maken. */}
          <span className="sr-only text-sm font-semibold tracking-tight text-nav-foreground sm:not-sr-only">
            Lumen Logic
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((it) => (
            <NavLink
              key={it.href}
              href={it.href}
              label={it.label}
              active={active === it.href}
            />
          ))}
        </nav>
        <span className="hidden text-xs text-nav-muted sm:inline">{email}</span>
      </div>
    </header>
  );
}
