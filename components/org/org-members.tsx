import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconTrash } from "@/components/dossier/icons";
import { defaultLandingForRoles } from "@/lib/repo/orgs";
import type { MembershipRole } from "@/db/schema";

// Eén lid van een organisatie: het adres + de petten die het draagt. Bewust minimaal —
// de rol is de bril waarmee iemand binnenkomt, niet wat de engine hem toont.
export type MemberRow = {
  email: string;
  roles: MembershipRole[];
};

// De vier rollen ("petten") in vaste volgorde. Meerdere per persoon mogelijk.
export const ROLE_ORDER: MembershipRole[] = [
  "calculator",
  "werkvoorbereider",
  "projectleider",
  "org_admin",
];

export const ROLE_LABEL: Record<MembershipRole, string> = {
  calculator: "Calculator",
  werkvoorbereider: "Work preparer",
  projectleider: "Project lead",
  org_admin: "Admin",
};

const ROLE_DESCRIPTION: Record<MembershipRole, string> = {
  calculator: "Matches spec lines and builds the calculation and quote.",
  werkvoorbereider:
    "Prepares the work: luminaire schedule, locations and datasheets.",
  projectleider: "Keeps oversight at project level and delivers the project.",
  org_admin: "Manages members, roles and the organization settings.",
};

// De default-landing per rol krijgt een leesbaar label. De mapping rol → landing
// komt uit de gedeelde repo (defaultLandingForRoles), zodat UI en engine niet uit
// elkaar lopen.
const LANDING_LABEL: Record<
  ReturnType<typeof defaultLandingForRoles>,
  string
> = {
  regels: "Lines",
  werkvoorbereiding: "Work preparation",
  armaturenboek: "Luminaire schedule",
  instellingen: "Settings",
  dossiers: "Projects",
};

export function landingForRole(role: MembershipRole): string {
  return LANDING_LABEL[defaultLandingForRoles([role])];
}

// Legenda van de rollen — één keer bovenaan de pagina. Uitleg per pet + waar die pet
// standaard landt. De harde regel staat er expliciet bij: de rol kiest de VIEW, nooit
// wat de engine toont (dat is de fase van het dossier).
export function RoleLegend() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <p className="text-sm text-muted-foreground">
          One person can hold multiple roles. A role only determines where someone
          lands by default — never what the engine shows. What is visible depends on
          the phase of the project, not the role.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-foreground/10">
          {ROLE_ORDER.map((role) => (
            <li
              key={role}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <Badge variant="outline">{ROLE_LABEL[role]}</Badge>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ROLE_DESCRIPTION[role]}
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                Lands on{" "}
                <span className="font-medium text-foreground">
                  {landingForRole(role)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// De leden van één organisatie: de lijst met hun petten, verwijderen, en het formulier
// om een lid toe te voegen (e-mail + rol-checkboxes). Presentational — alle schrijf-acties
// komen als server-action binnen.
export function OrgMembers({
  orgId,
  members,
  addAction,
  removeAction,
}: {
  orgId: string;
  members: MemberRow[];
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Members</h3>
        {members.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No members yet. Add one below.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-foreground/10">
            {members.map((m) => (
              <li
                key={m.email}
                className="flex items-center justify-between gap-3 py-2 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {m.roles.length === 0 ? (
                      // Niets stilzwijgend weglaten: een lid zonder rol is een eerlijke
                      // grijze markering, geen leeg vlak.
                      <span className="text-xs text-muted-foreground">
                        no role
                      </span>
                    ) : (
                      ROLE_ORDER.filter((r) => m.roles.includes(r)).map((r) => (
                        <Badge key={r} variant="secondary">
                          {ROLE_LABEL[r]}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="email" value={m.email} />
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${m.email}`}
                    title="Remove member"
                  >
                    <IconTrash />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        action={addAction}
        className="flex flex-col gap-3 border-t border-foreground/10 pt-4"
      >
        <input type="hidden" name="orgId" value={orgId} />
        <Input
          type="email"
          name="email"
          required
          placeholder="name@company.nl"
          aria-label="Email address of the new member"
          className="sm:max-w-xs"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted-foreground">
            Roles — determine where this member lands by default
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ROLE_ORDER.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  className="size-4 accent-foreground"
                />
                <span>{ROLE_LABEL[role]}</span>
                <span className="text-xs text-muted-foreground">
                  → {landingForRole(role)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="self-start">
          Add member
        </Button>
      </form>
    </div>
  );
}
