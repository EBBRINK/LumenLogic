import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
   * Bepaald door de server (app/admin/organizations/page.tsx via describeIssueScope);
   * dit blok toont dan de formulieren, en anders alleen de lijst. UI-gemak — de actions
   * beslissen zelf opnieuw.
   */
  canManageMembers: boolean;
};

// ⚠️ HIER STOND HET AANMAAKFORMULIER (`NewOrgFormFields` + `NewOrgForm`), en dat is sinds
// sprint 3.2c weg — besluit 1 (Timo, 4 aug). Een organisatie aanmaken gebeurt op
// `/admin/users`, samen met de PIN-uitgifte: "iemand toegang geven" is één handeling en
// kostte twee schermen. Het formulier is verhuisd naar `components/admin/orgs-block.tsx`,
// niet gekopieerd — twee ingangen laten bestaan verdubbelt de versnippering.
//
// Dit component gaat daarmee uitsluitend nog over BESTAANDE organisaties: hun leden en hun
// branding. Er is dus ook geen `createAction`/`canCreate` meer, en de lege toestand wijst
// naar Admin in plaats van een formulier aan te bieden.

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

// De organisatielijst: per organisatie een kaart met haar leden (petten) en branding.
export function OrgList({
  orgs,
  addMemberAction,
  removeMemberAction,
  saveBrandingAction,
  canGrantOrgAdmin,
}: {
  orgs: OrgWithMembers[];
  addMemberAction: (formData: FormData) => void | Promise<void>;
  removeMemberAction: (formData: FormData) => void | Promise<void>;
  saveBrandingAction: (formData: FormData) => void | Promise<void>;
  /** G36, tweede zin: alleen Brink zelf kent de org_admin-rol toe. */
  canGrantOrgAdmin: boolean;
}) {
  // 3.2c, besluit 1: er valt hier niets meer aan te maken, dus de lege toestand biedt geen
  // formulier maar wijst naar de plek waar het wél kan. `action={null}` is bewust: een
  // knop naar Admin zou voor een externe org_admin een deur openen die hij toch niet mag
  // gebruiken (besluit 2), en dit scherm weet niet wie er kijkt.
  if (orgs.length === 0) {
    return (
      <EmptyState
        title="No organizations yet."
        description="New organizations are created in Admin, where the PINs are issued."
        action={null}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {orgs.map(({ org, members, canManageMembers }) => (
        <Card key={org.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{org.name}</CardTitle>
                {/* 3.2c, besluit 8: het type staat waar een organisatie genoemd wordt —
                    ook hier. Aan `organizations.type` hangt of de leden in deze kaart
                    inkoopprijzen zien (lib/repo/prijszicht.ts); dat hoor je te kunnen
                    controleren zonder in de database te kijken. Wijzigen kan hier niet en
                    nergens: G42 zegt dat het type vaststaat na aanmaken. */}
                <Badge variant="outline" data-testid="org-type">
                  {org.type}
                </Badge>
              </div>
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
