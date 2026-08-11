"use client";

// Test-only client-stubs voor orgs.test.tsx. Zelfde reden als pin-block-stubs.tsx: de
// vitest-RSC-brug levert de return-waarde van een imperatief aangeroepen ÉCHTE server-action
// niet betrouwbaar terug (harness-beperking, in echte Next werkt dat pad wél). Met gewone
// client-functies blijft het blok zelf volledig en eerlijk te testen.
//
// Dit bestand exporteert BEWUST alleen componenten: een "use client"-module mag alleen
// componenten als client-referentie doorgeven. De ruwe fixture-waarden staan daarom in het
// directive-loze orgs-block-fixtures.ts.
import { OrgsBlock } from "./orgs-block";
import { PinBlock } from "./pin-block";
import { orgRows } from "./orgs-block-fixtures";
import { issueHappy, organizations, users } from "./pin-block-fixtures";

const okAction = async () => ({ ok: true }) as const;

export function OrgsBlockScreen() {
  return (
    <OrgsBlock
      orgs={orgRows}
      createAction={okAction}
      setSeatLimitAction={okAction}
    />
  );
}

/** De lege stand: nog geen enkele organisatie, wél het aanmaakformulier. */
export function OrgsBlockLeeg() {
  return (
    <OrgsBlock orgs={[]} createAction={okAction} setSeatLimitAction={okAction} />
  );
}

/** Een weigering van de server, bijvoorbeeld een naam die niet doorkomt. */
export function OrgsBlockMetFout() {
  return (
    <OrgsBlock
      orgs={orgRows}
      createAction={async () => ({
        ok: false,
        error: "Testfout: aanmaken geweigerd.",
      })}
      setSeatLimitAction={okAction}
    />
  );
}

/**
 * Het PIN-blok zoals INTERN het ziet sinds 3.2c: mét de optie "+ New organization"
 * (besluit 4b). De externe org_admin-stand staat in pin-block-stubs.tsx en heeft die optie
 * bewust niet (besluit 2).
 */
export function PinBlockMetNieuweOrg() {
  return (
    <PinBlock
      organizations={organizations}
      users={users}
      issueAction={issueHappy}
      pinLength={8}
      pinTtlDays={7}
      canGrantOrgAdmin
      canCreateOrgs
    />
  );
}
