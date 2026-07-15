import Link from "next/link";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listAllMemberships,
  listBrandUploadsForReview,
  listBrandsWithTier,
  recentAdminEvents,
} from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";

// ADMIN-CONSOLE OVERZICHT (§3.16, H3): de vier beheerhoeken met een telling en een pad
// erheen. Eigen <main> (buiten de dossier-layout).
export default async function AdminOverviewPage() {
  await requireSession();

  const [brands, uploads, memberships, events] = await Promise.all([
    listBrandsWithTier(db),
    listBrandUploadsForReview(db),
    listAllMemberships(db),
    recentAdminEvents(db, 50),
  ]);

  const sections = [
    {
      href: "/admin/brands",
      title: "Brands & visibility",
      count: `${brands.length} brands`,
      desc: "Disclosure tier and per-field exceptions.",
    },
    {
      href: "/admin/imports",
      title: "Imports",
      count: `${uploads.length} pending`,
      desc: "Approve brand uploads and the PDL import.",
    },
    {
      href: "/admin/users",
      title: "Users",
      count: `${memberships.length} members`,
      desc: "Roles across all organizations.",
    },
    {
      href: "/admin/events",
      title: "Activity",
      count: `${events.length} recent events`,
      desc: "The event log, read-only.",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Brink admin: brands, uploads, users and activity.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="group block">
            <Card className="h-full transition-colors group-hover:border-ring">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium tabular-nums">
                  {s.count}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
