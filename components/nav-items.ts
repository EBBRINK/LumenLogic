// De items van de hoofdbalk + het bepalen van de actieve sectie. Bewust een pure module
// zonder "use client" en zonder getSession/server-only: zo kan een test hem los
// importeren (vanuit een client-module worden exports client-references en zijn ze op de
// server niet aanroepbaar).
export type NavItem = { href: string; label: string };

// Functioneel ontwerp §2, navigatieprincipe 3. Wie wát ziet, wordt in `SiteNav` bepaald
// met dezelfde allowlist die de routes bewaakt.
//
// "Brand management" (/brand-management) = intern merkenbeheer, waar Brink werkt — een
// hoofdingang, dus ná Catalog. "Brand portal" (/brand) = wat een mérk ziet.
//
// ⚠️ IA-opschoning (demosessie Brink Licht, 12 aug 2026). Drie dingen aan deze lijst:
//   • "Brand relations" heet "Brand management": "relations" leest als een verhouding
//     tússen dingen, terwijl dit scherm merken beheert.
//   • "Data" is weg. Dat was een vergaarbak; alles eronder heeft een eigen huis gekregen
//     — merkgebonden schermen (prijslijsten) onder Brand management, de beheerschermen
//     (fields, event log, loading, evaluation) onder Admin.
//   • "Settings" is weg uit de bálk en staat onder de accountnaam (ACCOUNT_ITEMS): een
//     instelling is geen sectie van de app.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/projects", label: "Projects" },
  { href: "/catalog", label: "Catalog" },
  { href: "/brand-management", label: "Brand management" },
  { href: "/analytics", label: "Analytics" },
  { href: "/brand", label: "Brand portal" },
  { href: "/admin", label: "Admin" },
];

// Het menu onder de accountnaam (tandwiel). Alles wat een instelling is hoort hier en niet
// in de balk.
//
// "Organizations" staat er óók in, maar alleen voor wie géén Admin-ingang heeft: de route
// is `org_admin`, terwijl /admin op `intern` staat. Zonder deze regel zou een externe
// org-beheerder na de opschoning geen enkele link naar zijn eigen organisatiescherm meer
// hebben — het stond tot 12 aug op /settings, en dat was zijn hele weg erheen (UX-audit
// 30 jul, bug #11: datzelfde scherm had daarvóór nul inkomende links). Voor intern is het
// een kaart op /admin, en daar blijft het bij één ingang.
export const ACCOUNT_ITEMS: readonly NavItem[] = [
  { href: "/settings", label: "Settings" },
  { href: "/admin/organizations", label: "Organizations" },
];

// Actief = huidige sectie (prefix-match, zodat /projects/[id] ook "Projects" oplicht).
// Longest-prefix-wint: staan er ooit twee items waarvan de één onder de ander hangt, dan
// mag alleen de langste oplichten. Daarom wordt dit één keer centraal beslist en niet per
// link.
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
