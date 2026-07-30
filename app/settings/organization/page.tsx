import { db } from "@/db/client";
import { OrgList, type OrgWithMembers } from "@/components/org/org-list";
import { RoleLegend } from "@/components/org/org-members";
import { describeIssueScope } from "@/lib/repo/authz";
import { listMemberships, listOrganizations } from "@/lib/repo/orgs";
import { requireSession } from "@/lib/session";
import {
  addMemberAction,
  createOrgAction,
  removeMemberAction,
  saveBrandingAction,
} from "./actions";

// L-03/04/05 (§3.16): organisaties, leden en rollen ("petten"). In V1 draait de
// Brink-binnendienst zonder org; dit is de externe-uitrol-fundering. Deze pagina leeft
// buiten de dossier-layout en rendert daarom haar eigen <main>.
export default async function OrganisatiePage() {
  const session = await requireSession();

  // Besluiten G36/G39: het scherm biedt geen knoppen aan die de server toch weigert. Wat
  // deze gebruiker mag beheren komt uit dezelfde laag die de actions gebruiken — één bron,
  // dus scherm en server kunnen niet uit elkaar lopen. ⚠️ Dit is gemak, geen poort:
  // addMemberAction/removeMemberAction beslissen zelf opnieuw.
  const [orgs, scope] = await Promise.all([
    listOrganizations(db),
    describeIssueScope(db, session.user?.email),
  ]);
  const beheerbaar = new Set(scope.orgs.map((o) => o.id));
  const withMembers: OrgWithMembers[] = await Promise.all(
    orgs.map(async (org) => ({
      org,
      members: (await listMemberships(db, org.id)).map((m) => ({
        email: m.email,
        roles: m.roles,
      })),
      canManageMembers: beheerbaar.has(org.id),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Organizations, their members and the roles those members come in with. A
          role sets the default view, never what the engine shows — that's the phase
          of the project.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <RoleLegend />
        <OrgList
          orgs={withMembers}
          createAction={createOrgAction}
          addMemberAction={addMemberAction}
          removeMemberAction={removeMemberAction}
          saveBrandingAction={saveBrandingAction}
          canGrantOrgAdmin={scope.canGrantOrgAdmin}
        />
      </div>
    </main>
  );
}
