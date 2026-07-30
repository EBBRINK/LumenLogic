// De deur-bewaker (besluiten G36/G39).
//
// Sinds G39 is er geen token meer dat een schrijffunctie kan controleren: de bevoegdheid
// wordt in `issuePinAsActor()` / `changeMembershipAsActor()` uit de sessie en de database
// afgeleid, precies op het moment van schrijven. Dat betekent dat de kale schrijffuncties
// (`issueActivationPin`, `addMembership`, `removeMembership`) gewoon aanroepbaar blijven —
// ze zijn er voor migraties, seeds en tests. De regel "app-code gaat altijd langs de
// autorisatielaag" is daarmee een AFSPRAAK, en deze test is wat die afspraak afdwingt.
//
// Dat is geen theorie: ronde 1 van dit item sloot het PIN-scherm en liet
// `app/settings/organization/actions.ts` open, waar dezelfde rollen langs een tweede deur
// werden uitgedeeld. Een gewone gebruiker zette zichzelf daar in de interne org en was
// daarna volgens G36-regel 1 almachtig. Deze test vangt de dérde deur, vóór een critic het
// doet.
//
// Hij leest de échte bronbestanden (Vite's import.meta.glob met ?raw), niet een lijst die
// iemand moet bijhouden.
import { expect, test } from "vitest";

// Alles onder app/: server actions, route handlers, pagina's, layouts.
const appBronnen = import.meta.glob("/app/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * De kale schrijffuncties. Wie deze namen in app/ importeert, omzeilt G36 — of hij dat nu
 * doorheeft of niet.
 */
const VERBODEN_IN_APP = [
  "issueActivationPin",
  "addMembership",
  "removeMembership",
];

// Testbestanden mogen wél: die seeden een uitgangssituatie ("deze memberships bestaan al"),
// ze voeren geen gebruikershandeling uit. Dat onderscheid is precies waarom de kale
// functies blijven bestaan.
function isProductiecode(pad: string): boolean {
  return !/\.test\.tsx?$/.test(pad);
}

test("de bronbestanden zijn daadwerkelijk ingelezen (anders bewijst deze test niets)", () => {
  const paden = Object.keys(appBronnen);
  // Ondergrens met marge: het project heeft er tientallen. Een lege glob zou elke assertie
  // hieronder gratis groen maken — dat is de faalstand die deze test zelf moet uitsluiten.
  expect(paden.length).toBeGreaterThan(20);
  expect(paden.some((p) => p.endsWith("/app/admin/users/actions.ts"))).toBe(true);
  expect(
    paden.some((p) => p.endsWith("/app/settings/organization/actions.ts")),
  ).toBe(true);
  // En de inhoud is echt de bron, geen module-object.
  expect(appBronnen[paden.find((p) => p.endsWith("/app/admin/users/actions.ts"))!]).toContain(
    "issuePinAsActor",
  );
});

test("geen enkel bestand onder app/ schrijft memberships of PIN's buiten de autorisatielaag om", () => {
  const overtredingen: string[] = [];
  for (const [pad, bron] of Object.entries(appBronnen)) {
    if (!isProductiecode(pad)) continue;
    for (const naam of VERBODEN_IN_APP) {
      // Op de import letten, niet op elk voorkomen van de naam: het gaat erom dat de
      // functie het bestand binnenkomt. Een comment die hem noemt is prima.
      const importRegel = new RegExp(
        `import[^;]*\\b${naam}\\b[^;]*from\\s*["'][^"']*(repo/(activation|orgs))["']`,
        "s",
      );
      if (importRegel.test(bron)) {
        overtredingen.push(`${pad} importeert ${naam}`);
      }
    }
  }
  // Foutmelding die zegt wat je moet doen, niet alleen dat het fout is.
  expect(
    overtredingen,
    "Gebruik issuePinAsActor() of changeMembershipAsActor() uit lib/repo/authz.ts — die " +
      "leiden de bevoegdheid af uit de sessie (besluiten G36/G39). De kale schrijffuncties " +
      "zijn voor migraties, seeds en tests.",
  ).toEqual([]);
});

test("de bewaker zou een overtreding ook echt zien (mutant op de regex zelf)", () => {
  // Zonder deze test kan de regex hierboven stilletjes niets meer matchen en blijft alles
  // groen. Dit is dezelfde import-regel als een echte overtreding, letterlijk.
  const overtredendeBron = `import { db } from "@/db/client";
import { addMembership } from "@/lib/repo/orgs";
export async function slechteAction() { await addMembership(db, {}); }`;
  const regel = new RegExp(
    `import[^;]*\\baddMembership\\b[^;]*from\\s*["'][^"']*(repo/(activation|orgs))["']`,
    "s",
  );
  expect(regel.test(overtredendeBron)).toBe(true);
  // En een bestand dat de naam alleen in een comment noemt, is géén overtreding.
  expect(regel.test(`// addMembership hoort hier niet\nconst x = 1;`)).toBe(false);
});
