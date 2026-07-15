import { db } from "@/db/client";
import { OrgList, type OrgWithMembers } from "@/components/org/org-list";
import { RoleLegend } from "@/components/org/org-members";
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
  await requireSession();

  const orgs = await listOrganizations(db);
  const withMembers: OrgWithMembers[] = await Promise.all(
    orgs.map(async (org) => ({
      org,
      members: (await listMemberships(db, org.id)).map((m) => ({
        email: m.email,
        roles: m.roles,
      })),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
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
        />
      </div>
    </main>
  );
}
