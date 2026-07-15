import { db } from "@/db/client";
import {
  MembershipsBlock,
  type MembershipRow,
} from "@/components/admin/memberships-block";
import { listAllMemberships } from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";

// GEBRUIKERS OVER ORGS (§3.16, L-03/04). Alleen-lezen inzage. Eigen <main>.
export default async function AdminGebruikersPage() {
  await requireSession();

  const memberships = await listAllMemberships(db);
  const rows: MembershipRow[] = memberships.map((m) => ({
    id: m.id,
    orgName: m.orgName,
    email: m.email,
    roles: (m.roles ?? []) as string[],
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Members and roles across all organizations.
        </p>
      </header>
      <MembershipsBlock memberships={rows} />
    </main>
  );
}
