"use client";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_ITEMS, type NavItem } from "./nav-items";

// Het menu onder de accountnaam, rechts in de hoofdbalk (IA-opschoning 12 aug 2026,
// punt 7). "Settings" was een sectie in de balk alsof het een deel van de app was; een
// instelling hoort bij de gebruiker, niet naast Projects en Catalog.
//
// Vorm, en waarom:
// - Een échte Radix DropdownMenu en geen eigen div-met-onclick: die levert de
//   toetsenbordbediening (pijltjes, Escape, focus terug naar de knop) en de
//   aria-expanded/aria-controls-koppeling die een menu nodig heeft om er ook één te zijn.
// - Het tandwiel staat op de trigger, niet per regel: het icoon zegt "hier zitten je
//   instellingen", en dat is de hele reden dat dit menu bestaat.
// - Kleuren uit de --nav-*-tokens, net als NavLink en ThemeToggle ernaast: binnen de balk
//   is de focus-ring teal, want blauw haalt op navy 2,27:1 (DESIGN.md O10/O12).
// - Het e-mailadres staat op mobiel niet in de trigger (de balk loopt daar al over), maar
//   wél als eerste regel ín het menu — anders is op een klein scherm nergens meer te zien
//   wie er is ingelogd.
export function AccountMenu({
  email,
  items = ACCOUNT_ITEMS,
}: {
  email?: string | null;
  items?: readonly NavItem[];
}) {
  // Geen enkele instelling bereikbaar? Dan geen lege knop. Kan vandaag niet gebeuren
  // (/settings staat op `iedereen`), maar een menu dat niets doet is erger dan geen menu.
  if (items.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs text-nav-muted transition-colors hover:text-nav-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent",
        )}
        aria-label="Account and settings"
      >
        <Settings aria-hidden className="size-4" strokeWidth={1.5} />
        <span className="hidden sm:inline">{email}</span>
        <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.5} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {email && (
            <>
              <div className="truncate px-2 py-1.5 text-xs text-muted-foreground sm:hidden">
                {email}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border sm:hidden" />
            </>
          )}
          {items.map((it) => (
            <DropdownMenu.Item key={it.href} asChild>
              <Link
                href={it.href}
                className="block cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
              >
                {it.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
