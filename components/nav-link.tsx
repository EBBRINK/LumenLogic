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
        "rounded-md px-2.5 py-1 transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
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
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link href="/projects" className="text-sm font-semibold tracking-tight">
          Lumen Logic
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
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {email}
        </span>
      </div>
    </header>
  );
}
