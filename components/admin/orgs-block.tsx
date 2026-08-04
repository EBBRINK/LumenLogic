"use client";

// ORGANISATIES op /admin/users — sprint 3.2c, besluiten 1, 4a, 6, 7 en 8 (Timo, 4 aug).
//
// WAAROM DIT BLOK HIER STAAT EN NIET OP /settings/organization. Iemand toegang geven is in
// het hoofd van Brink één handeling, maar kostte twee schermen: een organisatie aanmaken
// kon alleen op /settings/organization, een PIN uitgeven alleen hier. Het aanmaakformulier
// is dáár weggehaald (besluit 1) in plaats van hier gedupliceerd — twee plekken laten
// bestaan verdubbelt de versnippering in plaats van hem op te lossen. Dat scherm gaat sinds
// 3.2c puur over branding en leden van BESTAANDE organisaties.
//
// WAT JE HIER NIET VINDT, en dat is opzet:
//   • een intern/extern-keuze (besluit 3). Via het scherm ontstaat uitsluitend een EXTERNE
//     organisatie. 'intern' bestaat alleen omdat migratie 0019 Brink Licht zo aanmaakte.
//     Die keuze is vermoedelijk nooit nodig, en als hij ooit nodig is, is het één regel
//     SQL — terwijl een knop élke dag het risico draagt dat iemand per ongeluk 'intern'
//     aanklikt, en aan dat ene veld hangt of een installateur inkoopprijzen ziet
//     (lib/repo/prijszicht.ts). Dat is ijzeren regel 2.
//   • een manier om het type van een bestaande organisatie te wijzigen (G42). Een
//     organisatie die kan flippen is een prijslek met één muisklik. Wie het anders wil,
//     maakt een nieuwe organisatie.
//
// Het type staat wél overal waar een organisatie genoemd wordt (besluit 8) — hier als badge
// naast de naam, in het PIN-formulier in de dropdown, en in de PIN-statuslijst eronder.
//
// ⚠️ Dit blok wordt alleen gerenderd voor een interne gebruiker (besluit 2). Dat is
// UI-gemak, geen poort: createOrgAction en setSeatLimitAction weigeren hetzelfde, ook
// zonder formulier — bewezen in app/admin/users/org-admin-authz.test.ts.
//
// Await je een action vanuit dit client-component? Verplicht via callAction() uit
// lib/next-action-result.ts — zie components/admin/pin-block.tsx voor het waarom.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { veldClass } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { callAction, failureDetail } from "@/lib/next-action-result";

/** Eén organisatie zoals dit blok hem toont. Komt uit `describeIssueScope()`. */
export type OrgRow = {
  id: string;
  name: string;
  /** 'intern' | 'extern' — besluit 8: zichtbaar waar de organisatie genoemd wordt. */
  type: string;
  plan: string;
  /** `null` = onbeperkt. Vandaag alleen Brink Licht zelf. */
  seatLimit: number | null;
  seatsUsed: number;
};

export type OrgResult = { ok: true } | { ok: false; error: string };

export type CreateOrgAction = (input: {
  name: string;
  plan?: string;
  seatLimit?: number;
}) => Promise<OrgResult>;

export type SetSeatLimitAction = (input: {
  orgId: string;
  seatLimit: number;
}) => Promise<OrgResult>;

/** Besluit 6: een zinnige standaardwaarde, geen verrassing. Spiegelt STANDAARD_ZETELS. */
export const STANDAARD_ZETELS = 5;

const PLAN_OPTIONS: { value: string; label: string }[] = [
  { value: "trial", label: "Trial" },
  { value: "abonnement", label: "Subscription" },
  { value: "per-dossier", label: "Per project" },
];

// Eén uitvoerpad voor beide actions: dezelfde vertaling van een navigatie-uitkomst naar een
// leesbare melding als in pin-block.tsx.
async function run(
  actie: () => Promise<OrgResult>,
  watMisging: string,
): Promise<OrgResult> {
  const outcome = await callAction(actie, { path: "/admin/users" });
  if (outcome.kind === "signedOut") {
    return {
      ok: false,
      error: `Your session expired — ${watMisging} Sign in again.`,
    };
  }
  if (outcome.kind !== "value") {
    return {
      ok: false,
      error:
        outcome.kind === "failed"
          ? `Something went wrong (${failureDetail(outcome.error)}).`
          : `That ended on an unexpected page (${outcome.href}).`,
    };
  }
  return outcome.value;
}

/** Besluit 4a: los aanmaken, zonder meteen iemand uit te nodigen. */
function NewOrgForm({ createAction }: { createAction: CreateOrgAction }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gemaakt, setGemaakt] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setGemaakt(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      setError("Enter a name for the new organization.");
      return;
    }
    setBusy(true);
    try {
      const uitslag = await run(
        () =>
          createAction({
            name,
            plan: String(fd.get("plan") ?? "") || undefined,
            seatLimit: Number(fd.get("seatLimit")),
          }),
        "no organization was created.",
      );
      if (!uitslag.ok) {
        setError(uitslag.error);
        return;
      }
      setGemaakt(name);
      form.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      data-testid="new-org-form"
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
          {PLAN_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="org-seats" className="text-sm font-medium">
          Seats
        </label>
        {/* Besluit 6: een standaardwaarde in plaats van een lege "unlimited". TEST 123
            kreeg op productie ongemerkt seat_limit = 1 en er paste dus precies één
            gebruiker in; dat moest een keuze worden. Onbeperkt is via dit scherm bewust
            niet te kiezen — dat bestaat alleen nog voor Brink Licht zelf. */}
        <Input
          id="org-seats"
          name="seatLimit"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={STANDAARD_ZETELS}
          className="sm:w-28"
        />
      </div>
      {/* `outline`, niet primary: DESIGN.md §6 staat één primary per scherm toe, en de
          zwaarste actie op /admin/users is "Create account & issue PIN" hierboven. Een
          organisatie los aanmaken is de voorbereidende handeling (besluit 4a: alvast
          klaarzetten), dus die hoort lichter te wegen. `components/knophierarchie.test.tsx`
          ving dit — terecht. */}
      <Button
        type="submit"
        variant="outline"
        disabled={busy}
        className="self-start sm:self-auto"
      >
        {busy ? "Creating…" : "Create"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:self-center">
          {error}
        </p>
      )}
      {gemaakt && !error && (
        <p role="status" className="text-sm text-muted-foreground sm:self-center">
          Created {gemaakt}. It&apos;s in the PIN form&apos;s organization list
          now.
        </p>
      )}
    </form>
  );
}

/** Besluit 7: de zetellimiet aanpassen, naast de organisatie in de lijst. */
function SeatLimitForm({
  org,
  saveAction,
}: {
  org: OrgRow;
  saveAction: SetSeatLimitAction;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOpgeslagen(false);
    const fd = new FormData(e.currentTarget);
    const seatLimit = Number(fd.get("seatLimit"));
    if (!Number.isInteger(seatLimit) || seatLimit < 1) {
      setError("Enter a seat limit of 1 or more.");
      return;
    }
    setBusy(true);
    try {
      const uitslag = await run(
        () => saveAction({ orgId: org.id, seatLimit }),
        "the seat limit was not changed.",
      );
      if (!uitslag.ok) {
        setError(uitslag.error);
        return;
      }
      setOpgeslagen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <label
        htmlFor={`seats-${org.id}`}
        className="text-xs text-muted-foreground"
      >
        Seats
      </label>
      <Input
        id={`seats-${org.id}`}
        name="seatLimit"
        type="number"
        min="1"
        step="1"
        defaultValue={org.seatLimit ?? ""}
        // Onbeperkt is via het scherm niet te kiezen (zie het aanmaakformulier), maar het
        // bestaat wél in de data: Brink Licht heeft geen limiet. Het veld zegt dat eerlijk
        // in plaats van er een getal van te maken dat niemand koos.
        placeholder={org.seatLimit === null ? "unlimited" : undefined}
        // w-28 en niet w-24: "unlimited" wordt anders afgekapt tot "unlimite" (gezien op
        // de screenshot), en dan lijkt het een half ingevulde waarde in plaats van een uitleg.
        className="w-28"
        aria-label={`Seat limit for ${org.name}`}
      />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? "Saving…" : opgeslagen ? "Saved" : "Save"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function OrgsBlock({
  orgs,
  createAction,
  setSeatLimitAction,
}: {
  orgs: OrgRow[];
  createAction: CreateOrgAction;
  setSeatLimitAction: SetSeatLimitAction;
}) {
  return (
    <Card data-testid="orgs-card">
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
        <p className="text-sm text-muted-foreground">
          A customer organization with its own members, roles and branding. Every
          organization you create here is external — that is what decides whether
          its people see purchase prices, and it cannot be changed afterwards.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <NewOrgForm createAction={createAction} />

        {orgs.length === 0 ? (
          // `action={null}`: aanmaken staat in het formulier hierboven, niet hier.
          <EmptyState
            variant="inline"
            title="No organizations yet."
            action={null}
          />
        ) : (
          <ul
            className="flex flex-col divide-y divide-foreground/10 border-t border-foreground/10"
            data-testid="orgs-list"
          >
            {orgs.map((org) => (
              <li
                key={org.id}
                // Zelfde vorm als de PIN-statuslijst: op mobiel twee eigen rijen, op
                // desktop naast elkaar. Geen child hoeft te wrappen, dus geen rij kan
                // "toevallig" ergens anders uitkomen.
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 sm:flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{org.name}</span>
                    {/* Besluit 8: het type staat waar de organisatie genoemd wordt. Aan
                        dit veld hangt de zichtbaarheid van geld — je moet het kunnen
                        controleren zonder in de database te kijken. */}
                    <Badge variant="outline" data-testid="org-type">
                      {org.type}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {org.plan}
                    {" · "}
                    {org.seatLimit === null
                      ? `${org.seatsUsed} members, no seat limit`
                      : `${org.seatsUsed}/${org.seatLimit} seats`}
                  </p>
                </div>
                <SeatLimitForm org={org} saveAction={setSeatLimitAction} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
