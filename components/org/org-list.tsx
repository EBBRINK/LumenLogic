import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/db/schema";
import { OrgMembers, type MemberRow } from "./org-members";

// Eén organisatie met haar leden — de vorm die de pagina samenstelt uit
// listOrganizations + listMemberships.
export type OrgWithMembers = {
  org: Organization;
  members: MemberRow[];
};

// Alleen de velden die de UI van de branding leest. De opslag is een vrije jsonb-map;
// hier pakken we er de twee die we tonen uit.
type Branding = { logoUrl?: string; accentColor?: string };

function readBranding(value: Organization["branding"]): Branding {
  const b = (value ?? {}) as Record<string, unknown>;
  return {
    logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : "",
    accentColor: typeof b.accentColor === "string" ? b.accentColor : "",
  };
}

// Het aanmaak-formulier voor een nieuwe organisatie: naam (verplicht), prijsmodel en
// een optionele zetellimiet.
function NewOrgForm({
  createAction,
}: {
  createAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nieuwe organisatie</CardTitle>
        <p className="text-sm text-muted-foreground">
          Een klant-organisatie met eigen leden, rollen en branding.
        </p>
      </CardHeader>
      <CardContent>
        <form
          action={createAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="org-name" className="text-sm font-medium">
              Naam
            </label>
            <Input
              id="org-name"
              name="name"
              required
              placeholder="Installatiebedrijf De Vries"
              className="sm:w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="org-plan" className="text-sm font-medium">
              Plan
            </label>
            <select
              id="org-plan"
              name="plan"
              defaultValue="trial"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="trial">Trial</option>
              <option value="abonnement">Abonnement</option>
              <option value="per-dossier">Per dossier</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="org-seats" className="text-sm font-medium">
              Zetels
            </label>
            <Input
              id="org-seats"
              name="seatLimit"
              type="number"
              min="1"
              step="1"
              placeholder="onbeperkt"
              className="sm:w-28"
            />
          </div>
          <Button type="submit" className="self-start sm:self-auto">
            Aanmaken
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Branding per organisatie: logo-URL + accentkleur. Leeg = eerlijk leeg; er wordt niets
// verzonnen. Het accentveld toont de hex pas als die daadwerkelijk is ingesteld.
function BrandingForm({
  org,
  saveAction,
}: {
  org: Organization;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const branding = readBranding(org.branding);
  const hasAccent = !!branding.accentColor;
  return (
    <form
      action={saveAction}
      className="flex flex-col gap-3 border-t border-foreground/10 pt-4"
    >
      <input type="hidden" name="orgId" value={org.id} />
      <h3 className="text-sm font-medium">Branding</h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`logo-${org.id}`}
            className="text-xs text-muted-foreground"
          >
            Logo-URL
          </label>
          <Input
            id={`logo-${org.id}`}
            name="logoUrl"
            type="url"
            defaultValue={branding.logoUrl}
            placeholder="https://…/logo.svg"
            className="sm:w-72"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`accent-${org.id}`}
            className="text-xs text-muted-foreground"
          >
            Accentkleur
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`accent-${org.id}`}
              name="accentColor"
              type="color"
              defaultValue={hasAccent ? branding.accentColor : "#6b7280"}
              aria-label="Accentkleur"
              className="h-8 w-12 cursor-pointer rounded-lg border border-input bg-transparent"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {hasAccent ? branding.accentColor : "nog niet ingesteld"}
            </span>
          </div>
        </div>
        <Button type="submit" variant="secondary" className="self-start">
          Branding opslaan
        </Button>
      </div>
    </form>
  );
}

// De organisatielijst: het aanmaak-formulier boven, daaronder per organisatie een kaart
// met haar leden (petten) en branding.
export function OrgList({
  orgs,
  createAction,
  addMemberAction,
  removeMemberAction,
  saveBrandingAction,
}: {
  orgs: OrgWithMembers[];
  createAction: (formData: FormData) => void | Promise<void>;
  addMemberAction: (formData: FormData) => void | Promise<void>;
  removeMemberAction: (formData: FormData) => void | Promise<void>;
  saveBrandingAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <NewOrgForm createAction={createAction} />

      {orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen organisaties. Maak er hierboven één aan.
        </p>
      ) : (
        orgs.map(({ org, members }) => (
          <Card key={org.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{org.name}</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Plan: {org.plan}
                  {org.seatLimit != null
                    ? ` · ${members.length}/${org.seatLimit} zetels`
                    : ` · ${members.length} leden`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <OrgMembers
                orgId={org.id}
                members={members}
                addAction={addMemberAction}
                removeAction={removeMemberAction}
              />
              <BrandingForm org={org} saveAction={saveBrandingAction} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
