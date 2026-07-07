"use client";
// Dossier-tabs (functioneel ontwerp §3.3). Review draagt een badge met het aantal
// wachtende items (②④ = 2 wachtend van 4). Werkvoorbereiding bestaat ALLEEN in
// gegund-stand — in tender wordt de tab niet gerenderd (geen grijze-disabled tab).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Phase } from "./types";

export function DossierTabs({
  dossierId,
  phase,
  reviewPending,
  reviewTotal,
}: {
  dossierId: string;
  phase: Phase;
  reviewPending: number;
  reviewTotal: number;
}) {
  const pathname = usePathname();
  const base = `/dossiers/${dossierId}`;
  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: base, label: "Regels", match: (p) => p === base || p.startsWith(`${base}/regel`) || p.startsWith(`${base}/import`) },
    { href: `${base}/review`, label: "Review", match: (p) => p.startsWith(`${base}/review`) },
    { href: `${base}/offerte`, label: "Estimate", match: (p) => p.startsWith(`${base}/offerte`) },
  ];
  if (phase === "awarded") {
    tabs.push({
      href: `${base}/werkvoorbereiding`,
      label: "Werkvoorbereiding",
      match: (p) => p.startsWith(`${base}/werkvoorbereiding`),
    });
  }
  tabs.push({
    href: `${base}/armaturenboek`,
    label: "Armaturenboek",
    match: (p) => p.startsWith(`${base}/armaturenboek`),
  });

  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.label === "Review" && reviewTotal > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
                  reviewPending > 0
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
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
