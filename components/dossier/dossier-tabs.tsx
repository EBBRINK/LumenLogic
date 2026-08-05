"use client";
// Dossier-tabs (functioneel ontwerp §3.3). Review draagt een badge met het aantal
// wachtende items (②④ = 2 wachtend van 4). Werkvoorbereiding bestaat ALLEEN in
// gegund-stand — in tender wordt de tab niet gerenderd (geen grijze-disabled tab).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Phase } from "./types";

// `pathname` is alleen bedoeld voor tests; in de app komt hij uit de router —
// zelfde escape als NavBar in ../nav-link.tsx heeft. Zonder die prop komt hier in
// een test de vitest-URL binnen, matcht geen enkele tab, en is er geen screenshot
// van een actieve stand te maken.
export function DossierTabs({
  dossierId,
  phase,
  reviewPending,
  reviewTotal,
  pathname,
}: {
  dossierId: string;
  phase: Phase;
  reviewPending: number;
  reviewTotal: number;
  pathname?: string;
}) {
  const routePathname = usePathname();
  const activePath = pathname ?? routePathname ?? "";
  const base = `/projects/${dossierId}`;
  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: base, label: "Lines", match: (p) => p === base || p.startsWith(`${base}/line`) || p.startsWith(`${base}/import`) },
    { href: `${base}/review`, label: "Review", match: (p) => p.startsWith(`${base}/review`) },
    { href: `${base}/quote`, label: "Estimate", match: (p) => p.startsWith(`${base}/quote`) },
  ];
  if (phase === "awarded") {
    tabs.push({
      href: `${base}/work-prep`,
      label: "Work preparation",
      match: (p) => p.startsWith(`${base}/work-prep`),
    });
  }
  tabs.push({
    href: `${base}/luminaire-schedule`,
    label: "Luminaire schedule",
    match: (p) => p.startsWith(`${base}/luminaire-schedule`),
  });

  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => {
        const active = t.match(activePath);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              // Teal streep i.p.v. --foreground: het merkaccent uit §3. Hier is
              // --ring wél de juiste focus-token (blauw in light, teal in dark),
              // want dit zit op het paginacanvas en niet op de navy balk.
              // ⚠ Teal op wit haalt 2,95:1 en mist de 3:1-drempel voor
              // UI-elementen. Aanvaard omdat de actieve stand óók door labelkleur
              // (2,84:1 → 17,4:1) en gewicht wordt gedragen, dus kleur is niet het
              // enige onderscheid (kit §11). Vastgelegd in DESIGN.md O12.
              active
                ? "border-brand-teal font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.label === "Review" && reviewTotal > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
                  reviewPending > 0
                    ? "bg-status-amber-tint text-status-amber-ink"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {reviewPending > 0 ? reviewPending : reviewTotal}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
