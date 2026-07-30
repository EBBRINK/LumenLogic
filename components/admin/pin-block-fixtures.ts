// Gedeelde testfixtures voor het PIN-blok. Bewust GEEN "use client": een "use client"-bestand
// mag alleen componenten exporteren die als client-referentie doorgegeven worden — gewone
// data-exports (constantes, arrays) uit zo'n bestand worden ondoorzichtige referenties zodra
// de testfile (die server-side draait onder vitest-plugin-rsc) ze rechtstreeks probeert te
// lezen ("Unexpectedly client reference export … is called on server"). Dit bestand is puur
// data, dus zonder directive te gebruiken door zowel pin-block-stubs.tsx ("use client",
// componenten) als pin-block.test.tsx (leest de constantes voor zijn asserts).
import type { IssuePinAction, OrgOption, PinUserRow } from "./pin-block";

export const FIXED_PIN = "48127593";
export const FIXED_EXPIRES_AT_ISO = "2026-08-06T14:32:00.000Z";
// Zelfde vorm als buildActivateUrl() in app/admin/users/actions.ts (host + ?email=), maar
// met een vast test-domein — de echte action leest de host uit de inkomende request.
const ACTIVATE_HOST = "https://app.lumenlogic.example";

export const organizations: OrgOption[] = [
  { id: "org-1", name: "Aannemer Zuid", type: "extern" },
  { id: "org-2", name: "Brink Licht", type: "intern" },
];

export const users: PinUserRow[] = [
  {
    email: "geen@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: ["calculator"],
    state: "geen",
    expiresAtIso: null,
    usedAtIso: null,
  },
  {
    email: "actief@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: ["werkvoorbereider"],
    state: "actief",
    expiresAtIso: "2026-08-05T09:00:00.000Z",
    usedAtIso: null,
  },
  {
    email: "gebruikt@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["org_admin"],
    state: "gebruikt",
    expiresAtIso: "2026-07-20T09:00:00.000Z",
    usedAtIso: "2026-07-15T11:22:00.000Z",
  },
  {
    email: "verlopen@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: [],
    state: "verlopen",
    expiresAtIso: "2026-07-10T09:00:00.000Z",
    usedAtIso: null,
  },
  {
    email: "geblokkeerd@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["projectleider"],
    state: "geblokkeerd",
    expiresAtIso: "2026-08-01T09:00:00.000Z",
    usedAtIso: null,
  },
];

// Happy path: elke aanroep (nieuw account of herhaling) geeft dezelfde vaste PIN terug,
// zodat de asserts in de test deterministisch zijn. name/activateUrl variëren wél met de
// input, zoals de echte action.
export const issueHappy: IssuePinAction = async (input) => ({
  ok: true,
  email: input.email,
  pin: FIXED_PIN,
  expiresAtIso: FIXED_EXPIRES_AT_ISO,
  userCreated: !input.orgId,
  activateUrl: `${ACTIVATE_HOST}/activate?email=${encodeURIComponent(input.email)}`,
  name: input.name?.trim() || null,
});
