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
  werkvoorbereider: "Werkvoorbereider",
  projectleider: "Projectleider",
  org_admin: "Beheerder",
};

const ROLE_DESCRIPTION: Record<MembershipRole, string> = {
  calculator: "Matcht spec-regels en bouwt de calculatie en offerte.",
  werkvoorbereider:
    "Bereidt het werk voor: armaturenboek, locaties en datasheets.",
  projectleider: "Houdt overzicht op projectniveau en levert het project op.",
  org_admin: "Beheert leden, rollen en de organisatie-instellingen.",
};

// De default-landing per rol krijgt een leesbaar label. De mapping rol → landing
// komt uit de gedeelde repo (defaultLandingForRoles), zodat UI en engine niet uit
// elkaar lopen.
const LANDING_LABEL: Record<
  ReturnType<typeof defaultLandingForRoles>,
  string
> = {
  regels: "Regels",
  werkvoorbereiding: "Werkvoorbereiding",
  armaturenboek: "Armaturenboek",
  instellingen: "Instellingen",
  dossiers: "Projecten",
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
        <CardTitle>Rollen (petten)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Eén persoon kan meerdere petten dragen. Een rol bepaalt alleen waar
          iemand standaard landt — nooit wat de engine toont. Wat zichtbaar is,
          hangt af van de fase van het project, niet van de rol.
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
                Landt op{" "}
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
        <h3 className="text-sm font-medium">Leden</h3>
        {members.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nog geen leden. Voeg er hieronder één toe.
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
                        geen rol
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
                    aria-label={`${m.email} verwijderen`}
                    title="Lid verwijderen"
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
          placeholder="naam@bedrijf.nl"
          aria-label="E-mailadres van het nieuwe lid"
          className="sm:max-w-xs"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted-foreground">
            Rollen (petten) — bepalen waar dit lid standaard landt
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
          Lid toevoegen
        </Button>
      </form>
    </div>
  );
}
