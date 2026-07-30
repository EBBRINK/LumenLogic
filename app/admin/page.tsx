import Link from "next/link";
import { db } from "@/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listAllMemberships,
  listBrandUploadsForReview,
  listBrandsWithTier,
} from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";

// ADMIN-CONSOLE OVERZICHT (§3.16, H3): de beheerhoeken met een telling en een pad erheen.
// Eigen <main> (buiten de dossier-layout). Sprint 2.0a: Activity verhuisde naar
// /data/event-log — Admin toont alleen nog wat beheerhandelingen zijn.
export default async function AdminOverviewPage() {
  await requireSession();

  const [brands, uploads, memberships] = await Promise.all([
    listBrandsWithTier(db),
    listBrandUploadsForReview(db),
    listAllMemberships(db),
  ]);

  const sections = [
    {
      href: "/admin/brands",
      title: "Brands",
      count: `${brands.length} brands`,
      desc: "Add, edit and delete brands.",
    },
    {
      href: "/admin/imports",
      title: "Imports",
      count: `${uploads.length} pending`,
      desc: "Approve brand uploads and the PDL import.",
    },
    {
      href: "/admin/users",
      // UX-audit 30 jul (bug #10): heette "Users", net als het allowlist-blok op
      // /settings — twee schermen met dezelfde titel en tegenstrijdige aantallen
      // (org-lidmaatschappen hier, inlog-adressen daar). De cijfers klopten allebei,
      // de labels niet. Hier: org-lidmaatschappen. Daar: toegang tot de inlog.
      title: "Organization members",
      count: `${memberships.length} members`,
      desc: "Roles across all organizations.",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Brink admin: brands, uploads and organization members.
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
