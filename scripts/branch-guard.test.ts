// De branch-poort moet fail-closed zijn: bij twijfel NIET doorlaten. Deze tests raken geen
// database en geen bestandssysteem — ze toetsen precies de beslissing die voorkomt dat een
// verrijkingsrun per ongeluk op productie landt.

import { expect, test } from "vitest";
import { beoordeelBranchDb, beoordeelProductieDb, endpointOf } from "./branch-guard";

const BRANCH = "postgresql://u:p@ep-shiny-cell-a5y2zuu0.eu-central-1.aws.neon.tech/db?sslmode=require";
const PROD = "postgresql://u:p@ep-hidden-hall-a5x58cuv.eu-central-1.aws.neon.tech/db?sslmode=require";
const PROD_POOLED = "postgresql://u:p@ep-hidden-hall-a5x58cuv-pooler.eu-central-1.aws.neon.tech/db";
const PROD_EP = "ep-hidden-hall-a5x58cuv";

test("endpoint: -pooler telt als dezelfde database", () => {
  expect(endpointOf(PROD)).toBe(PROD_EP);
  expect(endpointOf(PROD_POOLED)).toBe(PROD_EP);
  expect(endpointOf("geen url")).toBeNull();
});

// Dit is het scenario waarvoor de guard bestaat: bun faalt NIET op een ontbrekende
// --env-file, dus het script start met alleen de shell-omgeving — en die kan productie zijn.
test("zonder marker: geblokkeerd, ook al staat er een geldige DATABASE_URL", () => {
  expect(() => beoordeelBranchDb(undefined, PROD, PROD_EP)).toThrow(
    /LUMENLOGIC_DB=branch ontbreekt/,
  );
});

test("zonder marker én zonder url: geblokkeerd (niets om op te vertrouwen)", () => {
  expect(() => beoordeelBranchDb(undefined, undefined, null)).toThrow(
    /LUMENLOGIC_DB=branch ontbreekt/,
  );
});

test("marker met verkeerde waarde: geblokkeerd", () => {
  expect(() => beoordeelBranchDb("productie", BRANCH, PROD_EP)).toThrow(
    /ontbreekt \(gezien: productie\)/,
  );
});

// Slot 2: de marker naar de verkeerde env-file gekopieerd.
test("marker gezet maar URL wijst naar productie: geblokkeerd", () => {
  expect(() => beoordeelBranchDb("branch", PROD, PROD_EP)).toThrow(/PRODUCTIE-endpoint/);
});

test("slot 2 kijkt door -pooler heen: gepoolde productie-URL óók geblokkeerd", () => {
  expect(() => beoordeelBranchDb("branch", PROD_POOLED, PROD_EP)).toThrow(/PRODUCTIE-endpoint/);
});

test("marker + echte branch-URL: open, met beide sloten gecontroleerd", () => {
  const g = beoordeelBranchDb("branch", BRANCH, PROD_EP);
  expect(g.endpoint).toBe("ep-shiny-cell-a5y2zuu0");
  expect(g.secondLock).toBe("gecontroleerd");
});

// Zonder leesbare .env.local kan slot 2 niets toetsen. Dat mag de run niet blokkeren (slot 1
// is de fail-closed), maar het moet wél zichtbaar zijn in de uitkomst — en in de logregel.
test("geen referentie: slot 1 draagt de run, slot 2 meldt geen-referentie", () => {
  const g = beoordeelBranchDb("branch", BRANCH, null);
  expect(g.secondLock).toBe("geen-referentie");
  expect(g.productionEndpoint).toBeNull();
});

test("marker zonder DATABASE_URL: geblokkeerd", () => {
  expect(() => beoordeelBranchDb("branch", undefined, PROD_EP)).toThrow(
    /DATABASE_URL ontbreekt/,
  );
});

// De placeholder uit .env.branch: `new URL()` slikt hem als host, dus zonder de ep-toets
// zou de guard hem doorlaten en pas de neon-driver klagen.
test("niet-ingevulde placeholder: geblokkeerd door de guard, niet pas door de driver", () => {
  expect(() =>
    beoordeelBranchDb("branch", "postgresql://PLAK_HIER_DE_BRANCH_CONNECTION_STRING", PROD_EP),
  ).toThrow(/ziet er niet uit als een Neon-endpoint/);
});

test("marker met onzin-URL: geblokkeerd", () => {
  expect(() => beoordeelBranchDb("branch", "postgres-zonder-host", PROD_EP)).toThrow(
    /geen geldige connection string/,
  );
});

// ── De productie-modus ───────────────────────────────────────────────────────
// De branch-modus blijft ongewijzigd fail-closed (alle tests hierboven). Deze modus is de
// bewuste, eenmalige doorgang — met eisen die precies omgekeerd staan, zodat 'per ongeluk
// productie' én 'per ongeluk tóch de branch' allebei geblokkeerd worden.

test("productie: draaien met de branch-env is geblokkeerd", () => {
  expect(() => beoordeelProductieDb("branch", PROD, PROD_EP)).toThrow(/staat gezet terwijl je --productie draait/);
});

// De gevaarlijkste vergissing: je denkt dat je productie vult, maar je zit op de branch. Dan
// zou de repetitie ongemerkt de echte run vervangen en zou niemand het merken.
test("productie: een branch-URL wordt geweigerd, ook zonder marker", () => {
  expect(() => beoordeelProductieDb(undefined, BRANCH, PROD_EP)).toThrow(/Dit is geen productie/);
});

// Zonder .env.local kan niet worden vastgesteld DÁT dit productie is. In de branch-modus mag
// dat doorgaan (slot 1 draagt de run); hier niet — er is dan geen enkel bewijs.
test("productie: zonder referentie geen doorgang (anders dan de branch-modus)", () => {
  expect(() => beoordeelProductieDb(undefined, PROD, null)).toThrow(/niet leesbaar/);
});

test("productie: de echte productie-URL zonder marker gaat door", () => {
  const g = beoordeelProductieDb(undefined, PROD, PROD_EP);
  expect(g.endpoint).toBe(PROD_EP);
  expect(g.secondLock).toBe("gecontroleerd");
});

test("productie: gepoolde productie-URL telt als dezelfde database", () => {
  expect(beoordeelProductieDb(undefined, PROD_POOLED, PROD_EP).endpoint).toBe(PROD_EP);
});

test("productie: onzin-URL geblokkeerd", () => {
  expect(() => beoordeelProductieDb(undefined, "postgresql://PLAK_HIER", PROD_EP)).toThrow(/geen geldige Neon-endpoint/);
});
