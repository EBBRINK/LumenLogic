// De kaartenhub van de admin-console. Puur presentational (RSC-vriendelijk) zodat de
// samenstelling — welke hoeken er zijn, en welke telling erbij hoort — white-box getest
// kan worden zonder database. Zelfde vorm als de opgeheven components/data/data-cards.tsx.
//
// IA-opschoning 12 aug 2026 (demosessie Brink Licht): de Data-werkbank is uit de
// hoofdnavigatie gehaald en opgeheven. Wat daar aan BEHEER stond staat sindsdien hier —
// Fields (punt 3), Event log (punt 5), en de twee schermen die geen eigen bestemming in de
// lijst hadden, Loading en Evaluation. Wat aan een MÉRK hangt (prijslijsten, punt 4) ging
// naar /brand-management, en het verrijkings-steekproefscherm is verdwenen (punt 6): die
// vragen stelt de prijslijst-skill nu in de chat.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AdminCard = {
  href: string;
  title: string;
  desc: string;
  /** Optioneel. Een kaart zonder telling toont geen lege regel. */
  count?: string;
};

export function adminCards(tellingen: {
  brands: number;
  uploads: number;
  memberships: number;
  fields: number;
  waiting: number;
}): AdminCard[] {
  return [
    {
      href: "/admin/brands",
      title: "Brands",
      count: `${tellingen.brands} brands`,
      desc: "Add, edit and delete brands.",
    },
    {
      href: "/admin/imports",
      title: "Imports",
      count: `${tellingen.uploads} pending`,
      desc: "Approve brand uploads and the PDL import.",
    },
    {
      href: "/admin/users",
      // UX-audit 30 jul (bug #10): heette "Users", net als het allowlist-blok op
      // /settings — twee schermen met dezelfde titel en tegenstrijdige aantallen
      // (org-lidmaatschappen hier, inlog-adressen daar). De cijfers klopten allebei,
      // de labels niet. Hier: org-lidmaatschappen. Daar: toegang tot de inlog.
      title: "Organization members",
      count: `${tellingen.memberships} members`,
      desc: "Roles across all organizations.",
    },
    {
      // Verhuisd van /settings (punt 7): organisaties zijn beheer, geen instelling van
      // je eigen account.
      href: "/admin/organizations",
      title: "Organizations",
      desc: "Organizations, their members and the roles they come in with.",
    },
    {
      href: "/admin/fields",
      title: "Fields",
      count: `${tellingen.fields} own fields`,
      desc: "What we ask brands for — and the fields you add yourself.",
    },
    {
      href: "/admin/event-log",
      title: "Event log",
      desc: "Counts by type, plus the chronological log of every logged event.",
    },
    {
      href: "/admin/loading",
      title: "Loading",
      count: `${tellingen.waiting} waiting`,
      desc: "Brands requested as a data gap but not yet in the catalog.",
    },
    {
      href: "/admin/evaluation",
      title: "Evaluation",
      desc: "Measure the matcher's hit-rate against the evaluation set.",
    },
  ];
}

export function AdminCards({ cards }: { cards: readonly AdminCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c) => (
        // Kale <a> en geen next/link, net als de opgeheven DataCards: dit component
        // moet vanuit een RSC-test importeerbaar blijven, en next/link is daar een
        // client-reference die op de server niet aanroepbaar is. Een hub van acht
        // beheerschermen heeft aan prefetching bovendien niets te winnen.
        <a key={c.href} href={c.href} className="group block">
          <Card className="h-full transition-colors group-hover:border-ring">
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{c.desc}</p>
            </CardHeader>
            {c.count && (
              <CardContent>
                <span className="text-sm font-medium tabular-nums">
                  {c.count}
                </span>
              </CardContent>
            )}
          </Card>
        </a>
      ))}
    </div>
  );
}
