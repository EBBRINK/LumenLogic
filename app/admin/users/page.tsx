import { db } from "@/db/client";
import {
  MembershipsBlock,
  type MembershipRow,
} from "@/components/admin/memberships-block";
import {
  PinBlock,
  type OrgOption,
  type PinUserRow,
} from "@/components/admin/pin-block";
import { listAllMemberships } from "@/lib/repo/admin";
import { listOrganizations } from "@/lib/repo/orgs";
import {
  getActivationPinStatus,
  PIN_LENGTH,
  PIN_MAX_ATTEMPTS,
  PIN_TTL_DAYS,
} from "@/lib/repo/activation";
import { requireSession } from "@/lib/session";
import { issuePinAction } from "./actions";

// GEBRUIKERS OVER ORGS (§3.16, L-03/04) + PIN-uitgifte (sprint 3.1, besluit G26). De
// memberships-tabel blijft alleen-lezen; het PIN-blok erboven is waar Brink een account
// aanmaakt en de eenmalige activatie-PIN krijgt. Eigen <main>.
export default async function AdminGebruikersPage() {
  await requireSession();

  const [memberships, organizations] = await Promise.all([
    listAllMemberships(db),
    listOrganizations(db),
  ]);

  const rows: MembershipRow[] = memberships.map((m) => ({
    id: m.id,
    orgName: m.orgName,
    email: m.email,
    roles: (m.roles ?? []) as string[],
  }));

  // PIN-status per bekende gebruiker (§3a: nooit de code zelf, alleen getActivationPinStatus
  // — die draagt de hash niet eens mee). "Bekend" = heeft een membership; een PIN uitgegeven
  // zonder organisatie duikt hier pas op zodra er alsnog een membership bijkomt. Dat is een
  // bewuste beperking van dit scherm, niet van de repo-laag — zie het eindrapport.
  const uniqueEmails = [...new Set(memberships.map((m) => m.email))];
  const statuses = await Promise.all(
    uniqueEmails.map((email) => getActivationPinStatus(db, email)),
  );
  const statusByEmail = new Map(statuses.map((s) => [s.email, s]));

  const pinUsers: PinUserRow[] = memberships.map((m) => {
    const status = statusByEmail.get(m.email.toLowerCase().trim());
    return {
      email: m.email,
      orgName: m.orgName,
      roles: (m.roles ?? []) as string[],
      state: status?.state ?? "geen",
      expiresAtIso: status?.expiresAt ? status.expiresAt.toISOString() : null,
      usedAtIso: status?.usedAt ? status.usedAt.toISOString() : null,
      attemptsLeft: status?.attemptsLeft ?? PIN_MAX_ATTEMPTS,
    };
  });

  const orgOptions: OrgOption[] = organizations.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      {/* UX-audit 30 jul (bug #10): dit scherm heette "Users" en de kaart eronder
          "Users across organizations" — dezelfde kop twee keer, én verwarbaar met de
          inlog-allowlist op /settings. Eén kop, hier: org-lidmaatschappen. */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Organization members
        </h1>
        <p className="text-sm text-muted-foreground">
          Members and their roles per organization. A role sets the default view,
          never what the engine shows. This is not the login allowlist — that
          lives under Settings.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        <PinBlock
          organizations={orgOptions}
          users={pinUsers}
          issueAction={issuePinAction}
          pinLength={PIN_LENGTH}
          pinTtlDays={PIN_TTL_DAYS}
          pinMaxAttempts={PIN_MAX_ATTEMPTS}
        />
        <MembershipsBlock memberships={rows} />
      </div>
    </main>
  );
}
