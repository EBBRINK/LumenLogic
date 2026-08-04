// De deur-bewaker (besluiten G36/G39).
//
// Sinds G39 is er geen token meer dat een schrijffunctie kan controleren: de bevoegdheid
// wordt in `issuePinAsActor()` / `changeMembershipAsActor()` uit de sessie en de database
// afgeleid, precies op het moment van schrijven. De kale schrijffuncties
// (`issueActivationPin`, `addMembership`, `removeMembership`) blijven dus gewoon
// aanroepbaar — ze zijn er voor migraties, seeds en tests. De regel "app-code gaat altijd
// langs de autorisatielaag" is daarmee een AFSPRAAK, en dit bestand is wat die afspraak
// afdwingt.
//
// Dat is geen theorie: ronde 1 van dit item sloot het PIN-scherm en liet
// `app/settings/organization/actions.ts` open, waar dezelfde rollen langs een tweede deur
// werden uitgedeeld. Ronde 2 leverde een bewaker op die maar twee van de zes vormen ving.
//
// ⚠️ WAT DEZE BEWAKER WÉL VANGT (elke vorm heeft een eigen zelftest onderaan):
//   1. een named import van een kale schrijffunctie, ook onder een alias;
//   2. een namespace-import (`import * as orgs from "…/repo/orgs"`) van de modules waarin
//      die functies wonen — daar valt de naam niet uit te lezen, dus de module zelf is
//      verboden terrein;
//   3. een dynamische import van diezelfde modules (`await import("…/repo/orgs")`);
//   4. een directe schrijfactie op de tabellen: `.insert/.update/.delete(memberships)` en
//      hetzelfde op `activationPins` — de manier waarop iemand die G36 niet kent een derde
//      deur zou bouwen;
//   5. dit alles in `app/`, `components/` én `lib/`. Een server action hoeft niet in `app/`
//      te wonen, dus daar kan een toekomstige deur net zo goed staan. ⚠️ Vandaag staat er
//      buiten `app/` géén échte server action: het enige bestand daar met een echte
//      `"use server"`-directive is `lib/test-actions.ts`. Er is dus geen gat in
//      productie; de bredere scan is er voor de dag dat er wél een action buiten `app/`
//      verschijnt. De test "server actions buiten app/…" hieronder is de tripwire die dat
//      moment zichtbaar maakt.
//
// ⚠️ WAT HIJ NIET VANGT — expliciet, want een halve belofte is erger dan geen:
//   • rauwe SQL (`db.execute(sql\`insert into memberships …\`)`) of een querybuilder die de
//     tabel via een variabele aanspreekt;
//   • een modulepad dat uit stukken string wordt opgebouwd;
//   • code in `db/` en `scripts/` — dat zijn migraties en seeds, die mógen schrijven;
//   • een nieuwe hulpfunctie in een uitgezonderd bestand (`lib/repo/orgs.ts`,
//     `lib/repo/activation.ts`) die daarna vrij te importeren is. Die twee zijn samen met
//     `lib/repo/authz.ts` de schrijf- en autorisatielaag zelf; wie ze uitbreidt, zet de
//     nieuwe naam in VERBODEN_NAMEN;
//   • testinfrastructuur — `*.test.ts(x)`, `*-stubs.tsx` (incl. `*-test-stubs.tsx`) en
//     `lib/test-actions.ts`. Die seeden een uitgangssituatie ("deze memberships bestaan al")
//     of bootsen een action na; ze voeren geen gebruikershandeling uit. Dat onderscheid is
//     precies waarom de kale functies blijven bestaan — én het is wat deze bewaker bruikbaar
//     houdt: een bewaker die elke stub als bevinding meldt, wordt bij de eerste de beste
//     sessie uitgezet en bewaakt daarna niets meer.
import { expect, test } from "vitest";

// Vite leest deze bestanden als string in (?raw). Drie aparte globs in plaats van één
// accolade-patroon: dit werkt gegarandeerd, ongeacht de glob-implementatie.
const bronnen: Record<string, string> = {
  ...(import.meta.glob("/app/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/components/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/lib/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

/**
 * De kale schrijffuncties. Wie deze in app-code binnenhaalt, omzeilt G36.
 *
 * `setOrgBranding` is er in 3.2a bijgekomen — precies zoals het kopcommentaar hierboven
 * voorschrijft ("wie ze uitbreidt, zet de nieuwe naam in VERBODEN_NAMEN"). App-code gaat
 * via `setBrandingAsActor()` in lib/repo/authz.ts.
 */
/**
 * ⚠️ 3.2c zet er drie bij, en dat sluit een gat dat al bestond. `organizations` stond wél in
 * VERBODEN_TABELLEN hieronder (aanval G6: wie die tabel kan schrijven, zet zijn eigen org op
 * 'intern' en is almachtig), maar de schrijffúncties ervoor stonden nergens — `app/settings/
 * organization/actions.ts` importeerde `createOrganization` gewoon rechtstreeks. Dat hield
 * omdat die action op `bewaakNiveau("intern")` stond, maar het was de enige weg naar die
 * tabel die niet dezelfde vorm had als de rest van G39.
 *
 * Nu wel: app-code gaat via `createOrgAsActor()`, `createOrgAndIssuePinAsActor()` en
 * `setSeatLimitAsActor()` in lib/repo/authz.ts. `deleteOrganization` staat erbij omdat het
 * de compensatie is van de alles-of-niets-uitgifte (besluit 5) — een functie die
 * organisaties wist hoort helemaal niet los aanroepbaar te zijn vanuit een scherm.
 */
const VERBODEN_NAMEN = [
  "issueActivationPin",
  "addMembership",
  "removeMembership",
  "setOrgBranding",
  "createOrganization",
  "deleteOrganization",
  "setOrgSeatLimit",
];

/** De modules waarin ze wonen: als geheel niet te importeren (namespace of dynamisch). */
const SCHRIJFMODULES = String.raw`repo/(orgs|activation)`;

/**
 * Tabellen die alleen via de schrijflaag gemuteerd mogen worden.
 *
 * `organizations` staat er bewust bij, en het is de belangrijkste van de drie: G36-regel 1
 * hangt volledig aan `organizations.type`. Wie die kolom kan schrijven, zet zijn eigen org
 * op 'intern' en is daarmee almachtig — zonder ooit een membership of een PIN aan te raken.
 * Dat gat vond de critic in de eindronde (aanval G6).
 */
const VERBODEN_TABELLEN = ["memberships", "activationPins", "organizations"];

/**
 * De schrijflaag zelf plus de autorisatielaag. Deze drie mógen alles wat hierboven verboden
 * is — zij zíjn het mechanisme. Alles daarbuiten niet.
 */
const UITGEZONDERD = [
  "/lib/repo/orgs.ts",
  "/lib/repo/activation.ts",
  "/lib/repo/authz.ts",
];

/**
 * Testinfrastructuur, en dus geen deur: testbestanden, stubs die een server action nabootsen
 * (`…-stubs.tsx`, `…-test-stubs.tsx`) en de gedeelde noop-actions. Bewust een vorm-regel
 * plus één expliciet pad, niet "alles wat 'test' in de naam heeft": een echte action die
 * toevallig `latest-actions.ts` heet, hoort gewoon bewaakt te worden.
 */
function isTestinfrastructuur(pad: string): boolean {
  // Testbestanden overal: die seeden een uitgangssituatie, ze voeren geen handeling uit.
  if (/\.test\.tsx?$/.test(pad)) return true;
  if (pad.endsWith("/lib/test-actions.ts")) return true;
  // Stubs alléén búiten app/. Binnen app/ wonen de échte server actions, en de uitsluiting
  // is een vórm-regel — dus zonder deze beperking is een echte action die toevallig
  // `member-stubs.tsx` heet onzichtbaar voor de bewaker. De critic heeft die deur in de
  // eindronde daadwerkelijk gebouwd en er iedereen org_admin mee gemaakt (aanval G5).
  if (/-stubs\.tsx?$/.test(pad) && !pad.startsWith("/app/")) return true;
  return false;
}

/**
 * Het hart van de bewaker, als pure functie — zodat de zelftests onderaan exact deze code
 * toetsen en niet een overgetypte kopie ervan. Dat laatste is de valkuil die dit item al
 * twee keer heeft gekost: een test die iets anders bewijst dan zijn naam belooft.
 */
export function overtredingenIn(pad: string, bron: string): string[] {
  if (isTestinfrastructuur(pad)) return [];
  if (UITGEZONDERD.some((u) => pad.endsWith(u))) return [];

  const gevonden: string[] = [];

  // 1. Named import (incl. alias): `import { addMembership as zetLid } from "…/repo/orgs"`.
  //    Op de import letten en niet op elk voorkomen van de naam: een comment mag hem noemen.
  //    `import|export`, want een re-export (`export { addMembership } from "…"`) maakt van
  //    een willekeurig bestand een doorgeefluik waarna de import elders onverdacht oogt —
  //    de critic bouwde precies die deur in de eindronde (aanval G1).
  for (const naam of VERBODEN_NAMEN) {
    const named = new RegExp(
      String.raw`(?:import|export)[^;]*\{[^}]*\b${naam}\b[^}]*\}[^;]*from\s*["'][^"']*${SCHRIJFMODULES}["']`,
      "s",
    );
    if (named.test(bron)) gevonden.push(`importeert ${naam}`);
  }

  // 2. Namespace-import: de naam is dan niet uit de import te lezen, dus de module zelf is
  //    verboden. `import * as orgs from "@/lib/repo/orgs"` + `orgs.addMembership(…)`.
  const namespace = new RegExp(
    String.raw`import\s*\*\s*as\s+\w+\s*from\s*["'][^"']*${SCHRIJFMODULES}["']`,
  );
  if (namespace.test(bron)) gevonden.push("namespace-import van de schrijflaag");

  // 3. Dynamische import van diezelfde modules.
  const dynamisch = new RegExp(
    String.raw`\bimport\s*\(\s*["'][^"']*${SCHRIJFMODULES}["']\s*\)`,
  );
  if (dynamisch.test(bron)) gevonden.push("dynamische import van de schrijflaag");

  // 4. Rechtstreeks op de tabel schrijven, zonder ook maar iets uit de schrijflaag te
  //    importeren — de meest voor de hand liggende derde deur.
  for (const tabel of VERBODEN_TABELLEN) {
    const schrijf = new RegExp(
      String.raw`\.\s*(insert|update|delete)\s*\(\s*${tabel}\s*[),]`,
    );
    if (schrijf.test(bron)) gevonden.push(`schrijft rechtstreeks op ${tabel}`);
  }

  return gevonden
    .map((g) => `${pad} ${g}`)
    .filter((g) => !BEKENDE_SCHULD.includes(g));
}

/**
 * Bekende, bewust openstaande overtredingen. Eén regel per stuk, exact zoals de bewaker hem
 * meldt — een nieuwe overtreding op dezelfde plek valt dus alsnog rood uit.
 *
 * ✅ LEEG SINDS 3.2a. Hier stond `saveBrandingAction`: die schreef de organisatietabel
 * rechtstreeks bij met alleen `requireSession()`, waarmee een gewone gebruiker uit org A de
 * branding van org B overschreef. Dat is gedicht in de vorm van G39 — `setOrgBranding()` in de schrijflaag,
 * `setBrandingAsActor()` als poort ervoor, de action houdt alleen nog het formulier vast.
 * De test hieronder houdt de lijst leeg, zodat er niet stilletjes iets bij komt.
 */
const BEKENDE_SCHULD: string[] = [];

test("er staat geen bekende schuld open", () => {
  // Zonder deze test zou BEKENDE_SCHULD een sluipende amnestie worden: iemand plakt er een
  // regel bij en de bewaker zwijgt. Hier staat letterlijk wat er openstaat — vandaag niets.
  expect(BEKENDE_SCHULD).toEqual([]);
});

test("saveBrandingAction schrijft niet meer rechtstreeks op organizations (3.2a)", () => {
  // De contra-kant van de lege lijst hierboven: die is ook leeg als het bestand verdwijnt.
  const bron = bronnen["/app/settings/organization/actions.ts"];
  expect(bron, "bronbestand niet gevonden").toBeTruthy();
  expect(/\.\s*update\s*\(\s*organizations\s*[),]/.test(bron)).toBe(false);
  // En hij gaat via de poort, niet via een nieuwe eigen weg.
  expect(bron).toContain("setBrandingAsActor");
});

test("de bronbestanden zijn daadwerkelijk ingelezen (anders bewijst deze test niets)", () => {
  const paden = Object.keys(bronnen);
  // Ondergrens met marge: het project heeft er honderden. Een lege glob zou elke assertie
  // hieronder gratis groen maken — dat is de faalstand die deze test zelf moet uitsluiten.
  expect(paden.length).toBeGreaterThan(50);
  for (const verwacht of [
    "/app/admin/users/actions.ts",
    "/app/settings/organization/actions.ts",
    "/components/admin/pin-block.tsx",
    "/lib/repo/authz.ts",
  ]) {
    expect(paden.some((p) => p.endsWith(verwacht)), verwacht).toBe(true);
  }
  // En de inhoud is echt de bron, geen module-object.
  expect(
    bronnen[paden.find((p) => p.endsWith("/app/admin/users/actions.ts"))!],
  ).toContain("issuePinAsActor");
});

test("tripwire: elke `use server` buiten app/ is vandaag testinfrastructuur", () => {
  // De vorige bewaker keek alleen in app/. Dat is nu verbreed, maar de aanleiding klopte
  // niet helemaal: buiten app/ staat vandaag géén échte server action. Deze test legt die
  // stand vast. Verschijnt er wél een — dan wordt hij hier rood, en dan is de vraag of de
  // bewaker hem dekt (dat doet hij: hij scant components/ en lib/ volledig) én of hij een
  // sessie-poort heeft. Dit is dus geen dubbeling van de scan maar een signaal.
  //
  // ⚠️ Een DIRECTIVE is een statement op zijn eigen regel; een comment dat de vorm noemt is
  // dat niet. Die twee uit elkaar houden is geen muggenzifterij — de eerste versie matchte
  // op het kále voorkomen van de tekst, en telde daarmee vier stub-bestanden mee die in hun
  // toelichting uitleggen waaróm ze geen `"use server"`-referentie hoeven te zijn. Toen main
  // in `lib/repo/dossiers.ts` zo'n zin neerzette ("een `use server`-module mag uitsluitend
  // async functies exporteren"), viel die als zesde server action buiten app/ — een melding
  // over een comment. Een bewaker die om comments rood wordt, wordt uitgezet.
  const DIRECTIVE = /^[ \t]*["']use server["'][ \t]*;?[ \t]*$/m;
  const serverBuitenApp = Object.entries(bronnen)
    .filter(([pad]) => !pad.startsWith("/app/"))
    .filter(([pad]) => !pad.endsWith("/lib/repo/authz-deuren.test.ts")) // dit bestand zelf
    .filter(([, bron]) => DIRECTIVE.test(bron))
    .map(([pad]) => pad);

  // Ondergrens, want een scan die niets vindt maakt de assertie hieronder gratis groen:
  // `lib/test-actions.ts` is vandaag de énige echte directive buiten app/. Ziet de scan hém
  // niet, dan meet hij niets.
  expect(
    serverBuitenApp.some((p) => p.endsWith("/lib/test-actions.ts")),
    "de scan vindt lib/test-actions.ts niet — dan bewijst deze test niets",
  ).toBe(true);
  const echteActions = serverBuitenApp.filter((p) => !isTestinfrastructuur(p));
  expect(
    echteActions,
    "Er staat een server action buiten app/. Controleer of hij langs issuePinAsActor() of " +
      "changeMembershipAsActor() gaat en of hij zijn actor uit de sessie haalt (G39).",
  ).toEqual([]);
});

test("geen enkel bestand schrijft memberships of PIN's buiten de autorisatielaag om", () => {
  const overtredingen = Object.entries(bronnen).flatMap(([pad, bron]) =>
    overtredingenIn(pad, bron),
  );
  // Foutmelding die zegt wat je moet doen, niet alleen dat het fout is.
  expect(
    overtredingen,
    "Gebruik issuePinAsActor() of changeMembershipAsActor() uit lib/repo/authz.ts — die " +
      "leiden de bevoegdheid af uit de sessie (besluiten G36/G39). De kale schrijffuncties " +
      "zijn voor migraties, seeds en tests.",
  ).toEqual([]);
});

// ── Zelftest: élke vorm die het kopcommentaar claimt te vangen, aantoonbaar ─────
// De vorige versie toetste alléén de vorm die hij toch al ving; dit zijn de zes vormen die
// de critic daadwerkelijk heeft gebouwd, plus twee varianten en zes dingen die géén
// overtreding zijn.

const AANVALLEN: [naam: string, pad: string, bron: string][] = [
  [
    "named import",
    "/app/settings/organization/actions.ts",
    `import { addMembership } from "@/lib/repo/orgs";\nexport async function x() { await addMembership(db, {}); }`,
  ],
  [
    "named import onder een alias",
    "/app/settings/organization/actions.ts",
    `import { addMembership as zetLid } from "@/lib/repo/orgs";\nexport async function x() { await zetLid(db, {}); }`,
  ],
  [
    "namespace-import",
    "/app/settings/organization/actions.ts",
    `import * as orgs from "@/lib/repo/orgs";\nexport async function x() { await orgs.addMembership(db, {}); }`,
  ],
  [
    "dynamische import",
    "/app/settings/organization/actions.ts",
    `export async function x() { const m = await import("@/lib/repo/orgs"); await m.addMembership(db, {}); }`,
  ],
  [
    "rechtstreeks op de tabel schrijven",
    "/app/settings/organization/actions.ts",
    `import { memberships } from "@/db/schema";\nexport async function x() {\n  await db.insert(memberships).values({ orgId, email, roles: ["org_admin"] });\n}`,
  ],
  [
    "dezelfde overtreding buiten app/",
    "/components/org/stiekem.tsx",
    `"use server";\nimport { addMembership } from "@/lib/repo/orgs";\nexport async function x() { await addMembership(db, {}); }`,
  ],
  [
    "de PIN-schrijffunctie, ergens in lib/",
    "/lib/auth/iets.ts",
    `import { issueActivationPin } from "@/lib/repo/activation";\nexport async function x() { await issueActivationPin(db, {}); }`,
  ],
  [
    "een PIN-rij rechtstreeks bijwerken",
    "/app/api/route.ts",
    `import { activationPins } from "@/db/schema";\nawait db.update(activationPins).set({ attempts: 0 });`,
  ],
  [
    "een membership rechtstreeks verwijderen",
    "/components/org/stiekem.tsx",
    `await db.delete(memberships).where(eq(memberships.email, e));`,
  ],
  // 3.2c. De derde deur naar organizations.type: niet de tabel, maar de schrijffunctie
  // ervoor. Die stond tot deze sprint vrij te importeren.
  [
    "de org-schrijffunctie importeren in plaats van via de poort gaan",
    "/app/admin/users/actions.ts",
    `import { createOrganization } from "@/lib/repo/orgs";\nexport async function x() { await createOrganization(db, { name }); }`,
  ],
  [
    "de zetellimiet rechtstreeks zetten",
    "/app/admin/users/actions.ts",
    `import { setOrgSeatLimit } from "@/lib/repo/orgs";\nawait setOrgSeatLimit(db, { orgId, seatLimit: 999 });`,
  ],
];

for (const [naam, pad, bron] of AANVALLEN) {
  test(`de bewaker ziet: ${naam}`, () => {
    expect(overtredingenIn(pad, bron)).not.toEqual([]);
  });
}

const ONSCHULDIG: [naam: string, pad: string, bron: string][] = [
  [
    "de naam in een comment",
    "/app/admin/users/page.tsx",
    `// addMembership hoort hier niet; gebruik changeMembershipAsActor.\nconst x = 1;`,
  ],
  [
    "een andere export uit dezelfde module",
    "/app/admin/users/page.tsx",
    `import { listOrganizations } from "@/lib/repo/orgs";\nimport { getActivationPinStatus } from "@/lib/repo/activation";`,
  ],
  [
    "de autorisatielaag zelf",
    "/lib/repo/authz.ts",
    `import { addMembership, removeMembership } from "./orgs";`,
  ],
  [
    "de schrijflaag zelf",
    "/lib/repo/orgs.ts",
    `await db.insert(memberships).values({});`,
  ],
  [
    "een testbestand dat seedt",
    "/app/admin/users/issue-pin-authz.test.ts",
    `import { addMembership } from "@/lib/repo/orgs";\nawait addMembership(db, {});`,
  ],
  [
    "lezen van de tabel",
    "/app/admin/users/page.tsx",
    `const rijen = await db.select().from(memberships).where(eq(memberships.email, e));`,
  ],
];

for (const [naam, pad, bron] of ONSCHULDIG) {
  test(`de bewaker slaat niet aan op: ${naam}`, () => {
    expect(overtredingenIn(pad, bron)).toEqual([]);
  });
}
