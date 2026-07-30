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
    attemptsLeft: 5,
  },
  {
    email: "actief@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: ["werkvoorbereider"],
    state: "actief",
    expiresAtIso: "2026-08-05T09:00:00.000Z",
    usedAtIso: null,
    attemptsLeft: 4,
  },
  {
    email: "gebruikt@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["org_admin"],
    state: "gebruikt",
    expiresAtIso: "2026-07-20T09:00:00.000Z",
    usedAtIso: "2026-07-15T11:22:00.000Z",
    attemptsLeft: 5,
  },
  {
    email: "verlopen@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: [],
    state: "verlopen",
    expiresAtIso: "2026-07-10T09:00:00.000Z",
    usedAtIso: null,
    attemptsLeft: 5,
  },
  {
    email: "geblokkeerd@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["projectleider"],
    state: "geblokkeerd",
    expiresAtIso: "2026-08-01T09:00:00.000Z",
    usedAtIso: null,
    attemptsLeft: 0,
  },
];

// Happy path: elke aanroep (nieuw account of herhaling) geeft dezelfde vaste PIN terug,
// zodat de asserts in de test deterministisch zijn.
export const issueHappy: IssuePinAction = async (input) => ({
  ok: true,
  email: input.email,
  pin: FIXED_PIN,
  expiresAtIso: FIXED_EXPIRES_AT_ISO,
  userCreated: !input.orgId,
});
