import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { veldClass } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/db/schema";
import { OrgMembers, type MemberRow } from "./org-members";

// Eén organisatie met haar leden — de vorm die de pagina samenstelt uit
// listOrganizations + listMemberships.
export type OrgWithMembers = {
  org: Organization;
  members: MemberRow[];
  /**
   * Mag de ingelogde gebruiker de leden van déze organisatie beheren (besluiten G36/G39)?
   * Bepaald door de server (app/settings/organization/page.tsx via describeIssueScope);
   * dit blok toont dan de formulieren, en anders alleen de lijst. UI-gemak — de actions
   * beslissen zelf opnieuw.
   */
  canManageMembers: boolean;
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

// De uitleg bij het aanmaak-formulier — staat in de kaartkop én, bij een lege lijst,
// als uitleg in de lege toestand. Eén zin, twee plekken, geen tweede formulering.
const NEW_ORG_HINT =
  "A customer organization with its own members, roles and branding.";

// Het aanmaak-formulier voor een nieuwe organisatie: naam (verplicht), prijsmodel en
// een optionele zetellimiet. Los van zijn kaart, zodat het óók in de lege toestand kan
// staan (UX-audit 30 jul, A7) zonder een tweede kader te tekenen.
// `createAction` is een server action die hier direct als <form action> hangt — Next'
// eigen pad; `callAction()` geldt alleen voor een action die je vanuit client-code awaits.
function NewOrgFormFields({
  createAction,
  centered = false,
}: {
  createAction: (formData: FormData) => void | Promise<void>;
  centered?: boolean;
}) {
  return (
    <form
      action={createAction}
      className={
        centered
          ? "flex flex-col gap-3 text-left sm:flex-row sm:items-end sm:justify-center"
          : "flex flex-col gap-3 sm:flex-row sm:items-end"
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="org-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="org-name"
          name="name"
          required
          placeholder="De Vries Installations"
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
          className={veldClass}
        >
          <option value="trial">Trial</option>
          <option value="abonnement">Subscription</option>
          <option value="per-dossier">Per project</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="org-seats" className="text-sm font-medium">
          Seats
        </label>
        <Input
          id="org-seats"
          name="seatLimit"
          type="number"
          min="1"
          step="1"
          placeholder="unlimited"
          className="sm:w-28"
        />
      </div>
      <Button type="submit" className="self-start sm:self-auto">
        Create
      </Button>
    </form>
  );
}

// Het formulier in zijn eigen kaart — de stand zodra er minstens één organisatie is.
function NewOrgForm({
  createAction,
}: {
  createAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New organization</CardTitle>
        <p className="text-sm text-muted-foreground">{NEW_ORG_HINT}</p>
      </CardHeader>
      <CardContent>
        <NewOrgFormFields createAction={createAction} />
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
            Logo URL
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
            Accent color
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`accent-${org.id}`}
              name="accentColor"
              type="color"
              defaultValue={hasAccent ? branding.accentColor : "#6b7280"}
              aria-label="Accent color"
              className="h-8 w-12 cursor-pointer rounded-lg border border-input bg-transparent"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {hasAccent ? branding.accentColor : "not set yet"}
            </span>
          </div>
        </div>
        {/* Echte submit → `outline`, niet het neutrale vlak. */}
        <Button type="submit" variant="outline" className="self-start">
          Save branding
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
  canGrantOrgAdmin,
  canCreate,
}: {
  orgs: OrgWithMembers[];
  createAction: (formData: FormData) => void | Promise<void>;
  addMemberAction: (formData: FormData) => void | Promise<void>;
  removeMemberAction: (formData: FormData) => void | Promise<void>;
  saveBrandingAction: (formData: FormData) => void | Promise<void>;
  /** G36, tweede zin: alleen Brink zelf kent de org_admin-rol toe. */
  canGrantOrgAdmin: boolean;
  /**
   * 3.2a: een organisatie aanmaken is intern werk (`createOrgAction` weigert de rest).
   * Gemak bovenop de poort, nooit in plaats daarvan — zelfde regel als `canManageMembers`.
   */
  canCreate: boolean;
}) {
  // UX-audit 30 jul, A7: het Create-formulier stond bóven de zin "No organizations yet.
  // Create one above." — een lege toestand die naar boven wijst. Bij leeg staat er nu
  // alleen de lege toestand, mét het formulier erín; "Create one above" is daarmee
  // onwaar geworden en vervangen door de zin die al bij het formulier hoorde. Het
  // formulier keert terug in zijn eigen kaart zodra er één organisatie is.
  if (orgs.length === 0) {
    return (
      <EmptyState
        title="No organizations yet."
        description={canCreate ? NEW_ORG_HINT : undefined}
        action={
          canCreate ? (
            <NewOrgFormFields createAction={createAction} centered />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canCreate && <NewOrgForm createAction={createAction} />}

      {orgs.map(({ org, members, canManageMembers }) => (
        <Card key={org.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{org.name}</CardTitle>
              <span className="text-xs text-muted-foreground">
                Plan: {org.plan}
                {org.seatLimit != null
                  ? ` · ${members.length}/${org.seatLimit} seats`
                  : ` · ${members.length} members`}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <OrgMembers
              orgId={org.id}
              members={members}
              addAction={addMemberAction}
              removeAction={removeMemberAction}
              canManage={canManageMembers}
              canGrantOrgAdmin={canGrantOrgAdmin}
            />
            <BrandingForm org={org} saveAction={saveBrandingAction} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
