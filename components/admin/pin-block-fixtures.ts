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
  // "Aannemer Zuid" heeft al een beheerder; "Nieuwe Klant" nog niet — die tweede laat het
  // vastgezette org_admin-vinkje zien (G36, eerste zin).
  { id: "org-1", name: "Aannemer Zuid", type: "extern", needsOrgAdmin: false },
  { id: "org-2", name: "Brink Licht", type: "intern", needsOrgAdmin: false },
  { id: "org-3", name: "Nieuwe Klant", type: "extern", needsOrgAdmin: true },
];

// Wat een org_admin van Aannemer Zuid te zien krijgt: alleen zijn eigen organisatie.
export const eigenOrganisatie: OrgOption[] = [organizations[0]];

export const users: PinUserRow[] = [
  {
    email: "geen@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: ["calculator"],
    state: "geen",
    expiresAtIso: null,
    usedAtIso: null,
    canReissue: true,
  },
  {
    email: "actief@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: ["werkvoorbereider"],
    state: "actief",
    expiresAtIso: "2026-08-05T09:00:00.000Z",
    usedAtIso: null,
    canReissue: true,
  },
  {
    email: "gebruikt@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["org_admin"],
    state: "gebruikt",
    expiresAtIso: "2026-07-20T09:00:00.000Z",
    usedAtIso: "2026-07-15T11:22:00.000Z",
    canReissue: true,
  },
  {
    email: "verlopen@voorbeeld.nl",
    orgName: "Aannemer Zuid",
    roles: [],
    state: "verlopen",
    expiresAtIso: "2026-07-10T09:00:00.000Z",
    usedAtIso: null,
    canReissue: true,
  },
  {
    email: "geblokkeerd@voorbeeld.nl",
    orgName: "Brink Licht",
    roles: ["projectleider"],
    state: "geblokkeerd",
    expiresAtIso: "2026-08-01T09:00:00.000Z",
    usedAtIso: null,
    canReissue: true,
  },
];

// Dezelfde lijst zoals een org_admin hem ziet: alleen zijn eigen mensen, en géén knop bij
// de collega-beheerder — die mag hij niet resetten (G36).
export const eigenUsers: PinUserRow[] = [
  { ...users[0], canReissue: true },
  { ...users[1], canReissue: true },
  { ...users[2], orgName: "Aannemer Zuid", canReissue: false },
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
  // De rollen zoals de server ze toekende — de echte action geeft hier de grant-rollen
  // terug, dus inclusief een org_admin die de bootstrap-regel erbij zette.
  roles: input.roles ?? [],
});
