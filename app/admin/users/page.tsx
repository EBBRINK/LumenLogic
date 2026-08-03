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
import {
  decidePinIssue,
  describeIssueScope,
  mayViewPinStatus,
} from "@/lib/repo/authz";
import type { MembershipRole } from "@/db/schema";
import {
  getActivationPinStatus,
  PIN_LENGTH,
  PIN_MAX_ATTEMPTS,
  PIN_TTL_DAYS,
} from "@/lib/repo/activation";
import { bewaakRoute } from "@/lib/route-toegang";
import { issuePinAction } from "./actions";

// GEBRUIKERS OVER ORGS (§3.16, L-03/04) + PIN-uitgifte (sprint 3.1, besluit G26). De
// memberships-tabel blijft alleen-lezen; het PIN-blok erboven is waar Brink een account
// aanmaakt en de eenmalige activatie-PIN krijgt. Eigen <main>.
export default async function AdminGebruikersPage() {
  const toegang = await bewaakRoute("/admin/users");

  // Besluit G36. Deze pagina bepaalt zélf niets: ze vraagt de autorisatielaag wat deze
  // gebruiker mag, en toont niet meer dan dat. Zou dit scherm de regels overschrijven, dan
  // stonden ze op twee plekken — en dan is het een kwestie van tijd tot ze verschillen.
  // ⚠️ Dit is gemak, geen poort: issuePinAction weigert hetzelfde, ook zonder formulier.
  const [alleMemberships, scope] = await Promise.all([
    listAllMemberships(db),
    describeIssueScope(db, toegang.email),
  ]);

  // ✅ 3.2a — RIJ-SCOPING. Hier stond: "deze tabel toont ALLE memberships aan iedereen die
  // de pagina opent, ook aan een externe org_admin … staat als open eind in HANDOVER.md".
  // Dat open eind is dit item, en dit is de sluiting. De route staat op niveau `org_admin`
  // (G36 geeft een externe beheerder het recht om binnen zijn eigen organisatie PIN's uit
  // te geven), dus dichtzetten was geen optie — maar kíjken is hier óók iets: de ledenlijst
  // van een andere organisatie is haar adresboek.
  //
  // De scope komt uit `describeIssueScope()`, dezelfde bron die de action gebruikt: intern
  // krijgt daar álle organisaties terug, een org_admin alleen de zijne. Scherm en server
  // kunnen zo niet uit elkaar lopen.
  const zichtbareOrgs = new Set(scope.orgs.map((o) => o.id));
  const memberships = alleMemberships.filter((m) => zichtbareOrgs.has(m.orgId));
  const rows: MembershipRow[] = memberships.map((m) => ({
    id: m.id,
    orgName: m.orgName,
    email: m.email,
    roles: (m.roles ?? []) as string[],
  }));

  // PIN-status per bekende gebruiker (§3a: nooit de code zelf, alleen getActivationPinStatus
  // — die draagt de hash niet eens mee). "Bekend" = heeft minstens één membership; de PIN-
  // uitgifteknop op dit scherm vereist inmiddels een organisatie (pin-block.tsx), dus elk
  // nieuw account krijgt er een en duikt meteen hier op. Iemand met meerdere memberships
  // (verschillende orgs/rollen) krijgt hieronder ÉÉN rij die alle orgs/rollen samenvoegt —
  // niet één rij per membership, zoals de vorige versie deed. Die versie mapte over
  // `memberships` i.p.v. over unieke e-mailadressen terwijl de lijst-key `u.email` was: bij
  // twee memberships voor hetzelfde adres gaf dat een React-keycollisie én twee
  // "Issue new PIN"-knoppen voor dezelfde persoon (ronde-1-critic).
  const byEmail = new Map<
    string,
    {
      display: string;
      orgNames: Set<string>;
      roles: Set<string>;
      /** Ruwe org/rol-paren — de feiten die de autorisatielaag hieronder nodig heeft. */
      membershipsRaw: { orgId: string; roles: MembershipRole[] }[];
    }
  >();
  for (const m of memberships) {
    const key = m.email.toLowerCase().trim();
    const entry = byEmail.get(key) ?? {
      display: m.email,
      orgNames: new Set<string>(),
      roles: new Set<string>(),
      membershipsRaw: [] as { orgId: string; roles: MembershipRole[] }[],
    };
    entry.orgNames.add(m.orgName);
    for (const r of m.roles ?? []) entry.roles.add(r);
    entry.membershipsRaw.push({
      orgId: m.orgId,
      roles: (m.roles ?? []) as MembershipRole[],
    });
    byEmail.set(key, entry);
  }
  // De statuslijst is óók een knoppenlijst ("Issue new PIN"), dus hij toont alleen adressen
  // waar deze uitgever daadwerkelijk iets mee mag. Dezelfde functies die de action gebruikt,
  // op dezelfde feiten — `hasAccount` wordt in deze aanroep niet gelezen (elk adres hier
  // heeft per constructie minstens één membership; zie decidePinIssue).
  const zichtbareKeys = [...byEmail.keys()].filter((key) =>
    mayViewPinStatus(scope.authority, {
      email: key,
      hasAccount: true,
      memberships: byEmail.get(key)!.membershipsRaw,
    }),
  );
  const statuses = await Promise.all(
    zichtbareKeys.map((email) => getActivationPinStatus(db, email)),
  );
  const statusByEmail = new Map(statuses.map((s) => [s.email, s]));

  const pinUsers: PinUserRow[] = zichtbareKeys.map((key) => {
    const entry = byEmail.get(key)!;
    const status = statusByEmail.get(key);
    return {
      email: entry.display,
      orgName: [...entry.orgNames].join(", "),
      roles: [...entry.roles],
      state: status?.state ?? "geen",
      expiresAtIso: status?.expiresAt ? status.expiresAt.toISOString() : null,
      usedAtIso: status?.usedAt ? status.usedAt.toISOString() : null,
      // Een nieuwe PIN uitgeven is een wachtwoordreset: dezelfde beslissing als de action
      // straks neemt (zonder org, zonder rollen — precies wat de knop stuurt).
      canReissue: decidePinIssue({
        authority: scope.authority,
        target: {
          email: key,
          hasAccount: true,
          memberships: entry.membershipsRaw,
        },
        orgId: null,
        org: null,
      }).allowed,
    };
  });

  const orgOptions: OrgOption[] = scope.orgs.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    needsOrgAdmin: o.needsOrgAdmin,
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
          canGrantOrgAdmin={scope.canGrantOrgAdmin}
        />
        <MembershipsBlock memberships={rows} />
      </div>
    </main>
  );
}
