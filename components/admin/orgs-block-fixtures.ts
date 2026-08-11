// Fixtures voor het organisatieblok op /admin/users (sprint 3.2c). Bewust GEEN
// "use client" — zelfde reden als pin-block-fixtures.ts: de testfile draait server-side
// onder vitest-plugin-rsc en moet deze waarden rechtstreeks kunnen lezen.
import type { OrgRow } from "./orgs-block";

export const orgRows: OrgRow[] = [
  // Brink zelf: type 'intern', geen zetellimiet. Precies zoals op productie, en de reden
  // dat het veld "unlimited" als placeholder toont in plaats van een verzonnen getal.
  {
    id: "org-brink",
    name: "Brink Licht",
    type: "intern",
    plan: "abonnement",
    seatLimit: null,
    seatsUsed: 4,
  },
  // Een klant met ruimte.
  {
    id: "org-1",
    name: "Aannemer Zuid",
    type: "extern",
    plan: "abonnement",
    seatLimit: 5,
    seatsUsed: 3,
  },
  // En de stand die op productie voor een verrassing zorgde: één plek, één lid, dus vol.
  // Besluit 7 is precies de knop die hier naast staat.
  {
    id: "org-2",
    name: "TEST 123",
    type: "extern",
    plan: "trial",
    seatLimit: 1,
    seatsUsed: 1,
  },
];
