// De items van de hoofdbalk + het bepalen van de actieve sectie. Bewust een pure module
// zonder "use client" en zonder getSession/server-only: zo kan een test hem los
// importeren (vanuit een client-module worden exports client-references en zijn ze op de
// server niet aanroepbaar).
export type NavItem = { href: string; label: string };

// Functioneel ontwerp §2, navigatieprincipe 3. In V1 zien alle gebruikers alles;
// rol-gestuurde versimpeling is H2.
// "Brands" (/data/brand-relations) = intern merkenbeheer, waar Brink werkt — een
// hoofdingang, dus ná Catalog en vóór Data. "Brand portal" (/brand) = wat een mérk ziet.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/projects", label: "Projects" },
  { href: "/catalog", label: "Catalog" },
  { href: "/data/brand-relations", label: "Brands" },
  { href: "/data", label: "Data" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
  { href: "/brand", label: "Brand portal" },
  { href: "/admin", label: "Admin" },
];

// Actief = huidige sectie (prefix-match, zodat /projects/[id] ook "Projects" oplicht).
// Longest-prefix-wint: op /data/brand-relations matchen zowel /data als
// /data/brand-relations, en alleen de langste (Brands) mag oplichten. Daarom wordt dit
// één keer centraal beslist en niet per link.
export function activeNavHref(
  pathname: string,
  items: readonly NavItem[] = NAV_ITEMS,
): string | null {
  let best: string | null = null;
  for (const item of items) {
    const hit = pathname === item.href || pathname.startsWith(item.href + "/");
    if (hit && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}
