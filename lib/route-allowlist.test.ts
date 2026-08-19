// De bewaker ónder de route-allowlist (sprint 3.2a).
//
// Een allowlist is pas een allowlist als "vergeten" niet hetzelfde is als "toegestaan".
// Twee dingen maken dat waar, en dit bestand toetst ze allebei:
//
//   1. `Route` is `keyof typeof ROUTE_NIVEAUS` — een route die niet in de tabel staat is
//      geen geldig argument voor `bewaakRoute()`. Dat vangt TypeScript, niet deze test.
//   2. Maar TypeScript vangt níét dat iemand een nieuwe `page.tsx` neerzet die de bewaker
//      helemaal niet aanroept. Dat doet de test hieronder: hij leest élk `page.tsx` en
//      `route.ts` in `app/`, leidt uit de bestandsnaam af welke route het is, en eist dat
//      het bestand precies díé route bewaakt.
//
// Zelfde gedachte als `lib/repo/authz-deuren.test.ts`: de regel is een AFSPRAAK, en dit
// bestand is wat de afspraak afdwingt. Zonder deze test is de allowlist een lijst met
// goede bedoelingen.
//
// ⚠️ WAT HIJ NIET VANGT — expliciet, want een halve belofte is erger dan geen:
//   • een pagina die `bewaakRoute()` aanroept maar het antwoord negeert waar hij de scope
//     had moeten gebruiken. Dat is de andere muur; die staat in
//     `lib/repo/dossier-scope.test.ts` en `app/projects/projects-poort.test.ts`;
//   • een route waarvan het NIVEAU verkeerd staat. Een tabel kan niet weten wat een scherm
//     toont — daarom staan de drie niveaus die ertoe doen hieronder met naam en al
//     vastgepind, zodat verschuiven een bewuste handeling in de diff is;
//   • een `layout.tsx`. Die is bewust niet gezaghebbend (zie de toelichting in
//     `app/projects/[id]/layout.tsx`): élke pagina guardt zichzelf.
import { expect, test } from "vitest";
import {
  magBij,
  niveauVoor,
  ROUTE_NIVEAUS,
  type Niveau,
  type Route,
} from "./route-allowlist";
import { decideToegang, type Toegang } from "./repo/toegang";

// Vite leest deze bestanden als string in (?raw). Zelfde vorm als authz-deuren.test.ts.
const bronnen = import.meta.glob("/app/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * `/app/data/fields/page.tsx` → `/data/fields`, `/app/page.tsx` → `/`. Precies de
 * afbeelding die Next zelf maakt, inclusief `[param]`-segmenten — zo is de route die een
 * bestand hoort te bewaken niet iets wat iemand overtypt maar iets wat volgt uit waar het
 * bestand staat.
 */
function routeVanPad(pad: string): string {
  const zonder = pad.replace(/^\/app/, "").replace(/\/(page\.tsx|route\.ts)$/, "");
  return zonder === "" ? "/" : zonder;
}

const routeBestanden = Object.keys(bronnen)
  .filter((p) => /\/(page\.tsx|route\.ts)$/.test(p))
  .sort();

// ── De tabel is compleet en dekt precies de bestanden ────────────────────────

test("de bronbestanden zijn ingelezen (anders bewijst dit bestand niets)", () => {
  // Ondergrens met marge: gemeten op 3 aug 2026 zijn het er 44. Een lege glob zou élke
  // assertie hieronder gratis groen maken — dat is de faalstand die deze test uitsluit.
  expect(routeBestanden.length).toBeGreaterThan(35);
  expect(routeBestanden.some((p) => p.endsWith("/app/page.tsx"))).toBe(true);
  expect(
    routeBestanden.some((p) => p.endsWith("/app/data/fields/page.tsx")),
  ).toBe(true);
});

test("elke route in app/ staat in de allowlist", () => {
  const uitBestanden = routeBestanden.map(routeVanPad).sort();
  const uitTabel = Object.keys(ROUTE_NIVEAUS).sort();
  // Beide kanten op. Een route zonder regel is een gat; een regel zonder route is een
  // deur die is blijven staan nadat het scherm verdween — en die de volgende lezer laat
  // denken dat er iets bewaakt wordt.
  expect(
    uitBestanden.filter((r) => !uitTabel.includes(r)),
    "route zonder regel in ROUTE_NIVEAUS — hij is dus geweigerd, en dat is waarschijnlijk " +
      "niet wat je bedoelde. Zet hem in de tabel, met een niveau.",
  ).toEqual([]);
  expect(
    uitTabel.filter((r) => !uitBestanden.includes(r)),
    "regel in ROUTE_NIVEAUS zonder bijbehorend page.tsx/route.ts",
  ).toEqual([]);
});

test("een route die niemand heeft toegelaten, is geweigerd", () => {
  // Geen prefix-erfenis: /data/nieuw-scherm erft niets van /data.
  expect(niveauVoor("/data/nieuw-scherm")).toBeNull();
  expect(niveauVoor("/projects/[id]/geheim")).toBeNull();
  expect(niveauVoor("")).toBeNull();
  // …en `null` is voor iedereen behalve niemand een weigering — zie de matrix verderop.
  expect(magBij(INTERN, null)).toBe(false);
});

// ── Elk niet-open bestand roept de bewaker aan, met zijn eigen route ──────────

test("elke niet-open route bewaakt zichzelf, met precies zijn eigen route", () => {
  const ontbreekt: string[] = [];
  for (const pad of routeBestanden) {
    const route = routeVanPad(pad);
    if (ROUTE_NIVEAUS[route as Route] === "open") continue;
    const bron = bronnen[pad];
    // Letterlijk zijn eigen route, niet "een" bewaakRoute-aanroep: een pagina die
    // `bewaakRoute("/projects")` doet terwijl hij op /data staat, zou anders groen zijn.
    const eigen = new RegExp(
      `bewaakRoute\\(\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*\\)`,
    );
    if (!eigen.test(bron)) ontbreekt.push(`${pad} mist bewaakRoute("${route}")`);
  }
  expect(
    ontbreekt,
    "Elke page.tsx/route.ts begint met `await bewaakRoute(\"<eigen route>\")` uit " +
      "lib/route-toegang.ts. Een layout is daarvoor niet genoeg: die rendert parallel met " +
      "zijn pagina (zie app/projects/[id]/layout.tsx).",
  ).toEqual([]);
});

test("de open routes zijn er precies tien, en ze staan hier met naam", () => {
  // Dit is de uitzonderingslijst, en die hoort niet stilletjes te groeien. `/login` en
  // `/activate` móéten zonder sessie werken (je komt er juist om er een te krijgen) en
  // `/api/auth/[...all]` ís het auth-endpoint zelf — die drie kunnen per definitie niet
  // achter een sessiepoort. Alles daarbuiten wél.
  //
  // `/api/health` is er als vierde bij gekomen (monitoring, sprint 3) en is van een
  // andere soort dan de eerste drie: die zijn open omdat je er een sessie kómt halen,
  // deze omdat een uptime-monitor er nooit een heeft. Hij is daarom zo klein mogelijk
  // gehouden — hij raakt de database aan maar geeft alleen `{"status":"ok"}` terug, en
  // `app/api/health/health.test.ts` pint vast dat er geen tabelnaam, adres of
  // foutmelding in het antwoord kan lekken.
  //
  // Vier matchstation-routes erbij (sprint M1, docs/plan-matchstation-eigen-machine.md):
  // zelfde soort als /api/health — geen mensensessie, want het is een machine-account.
  // "open" is hier dus NIET "onbewaakt": elke route controleert zelf een machine-
  // sleutel (of cron-secret) vóór er iets van de database gelezen wordt, zie
  // lib/machine-auth.ts en lib/repo/matchstation.test.ts.
  //
  // /forgot-password en /reset-password (docs/goal-wachtwoord-reset.md) zijn van
  // dezelfde soort als /login en /activate: je komt er juist omdat je geen (werkende)
  // sessie hebt. De echte poort is het resettoken, dat Better Auth in de action
  // controleert — zie lib/auth-password-reset.test.ts.
  const open = Object.entries(ROUTE_NIVEAUS)
    .filter(([, n]) => n === "open")
    .map(([r]) => r)
    .sort();
  expect(open).toEqual([
    "/activate",
    "/api/auth/[...all]",
    "/api/health",
    "/api/matchstation/document/[runId]/[page]/[tile]",
    "/api/matchstation/healthcheck",
    "/api/matchstation/resultaat",
    "/api/matchstation/werk",
    "/forgot-password",
    "/login",
    "/reset-password",
  ]);
});

test("er is geen middleware.ts die stilletjes een tweede waarheid wordt", () => {
  // De allowlist is bewust per route en niet in middleware (zie de toelichting bovenaan
  // lib/route-allowlist.ts). Komt er ooit tóch een middleware.ts, dan is de vraag of hij
  // hetzelfde zegt als deze tabel — en die vraag hoort zichtbaar te worden, niet stil.
  const paden = Object.keys(bronnen);
  expect(paden.filter((p) => /\/middleware\.tsx?$/.test(p))).toEqual([]);
});

// ── De drie niveaus die ertoe doen, vastgepind ───────────────────────────────

test("de acceptatie-eis staat in de tabel: /data, /admin, Merken en /analytics zijn intern", () => {
  // Letterlijk de routes die de acceptatie-eis van 3.2a opsomt als geweigerd voor een
  // extern account. Verschuift er hier één naar `iedereen`, dan is dat een bewuste
  // handeling in de diff en geen ongelukje.
  for (const route of Object.keys(ROUTE_NIVEAUS) as Route[]) {
    if (route === "/admin/users") continue; // de ene uitzondering, hieronder apart
    if (
      route === "/data" ||
      route.startsWith("/data/") ||
      route === "/admin" ||
      route.startsWith("/admin/") ||
      route === "/brand" ||
      route.startsWith("/brand/") ||
      route === "/analytics"
    ) {
      expect(ROUTE_NIVEAUS[route], route).toBe("intern");
    }
  }
});

test("/admin/users is de ene uitzondering binnen /admin, en dat is besluit G36", () => {
  // De derde acceptatie-eis ("uitnodigen alleen admin") en besluit G36 geven een externe
  // org_admin het recht om binnen zijn eigen organisatie PIN's uit te geven. Dat scherm op
  // `intern` zetten maakte die hele tak onbereikbaar — inclusief de veertien aanvals-tests
  // in app/admin/users/issue-pin-authz.test.ts. Wát hij daar ziet is gescoped (de
  // ledenlijst toont alleen zijn eigen organisaties); dát hij er komt is de bedoeling.
  expect(ROUTE_NIVEAUS["/admin/users"]).toBe("org_admin");
  // Een gewone gebruiker komt er dus niet, en een extern lid zonder beheerrol ook niet.
  expect(magBij(EXTERN_LID, ROUTE_NIVEAUS["/admin/users"])).toBe(false);
  expect(magBij(EXTERN_ADMIN, ROUTE_NIVEAUS["/admin/users"])).toBe(true);
  // En de rest van /admin blijft dicht voor diezelfde beheerder.
  expect(magBij(EXTERN_ADMIN, ROUTE_NIVEAUS["/admin"])).toBe(false);
  expect(magBij(EXTERN_ADMIN, ROUTE_NIVEAUS["/admin/brands"])).toBe(false);
});

test("projecten en catalogus staan open voor elk ingelogd account", () => {
  // De andere helft van dezelfde eis: "alléén projecten (eigen organisatie) en catalogus".
  // Dat "eigen organisatie" zit niet hier maar in de rij-scoping — deze tabel zegt alleen
  // dat de deur niet op intern staat.
  for (const route of Object.keys(ROUTE_NIVEAUS) as Route[]) {
    if (route === "/projects" || route.startsWith("/projects/")) {
      expect(ROUTE_NIVEAUS[route], route).toBe("iedereen");
    }
  }
  expect(ROUTE_NIVEAUS["/catalog"]).toBe("iedereen");
  expect(ROUTE_NIVEAUS["/products/[id]"]).toBe("iedereen");
});

test("instellingen: het eigen scherm voor iedereen, organisatiebeheer alleen voor beheerders", () => {
  // /settings staat op `iedereen` omdat het wachtwoordblok daar staat — externen weigeren
  // zou betekenen dat ze hun eigen wachtwoord niet kunnen wijzigen. De interne blokken op
  // dat scherm renderen alleen voor intern; dat is getest in app/settings/settings-*.test.
  expect(ROUTE_NIVEAUS["/settings"]).toBe("iedereen");
  expect(ROUTE_NIVEAUS["/settings/organization"]).toBe("org_admin");
});

// ── magBij, uitputtend ───────────────────────────────────────────────────────

const ANONIEM = decideToegang(null, []);
const INTERN = decideToegang("timo@brinklicht.nl", [
  { orgId: "org-brink", orgType: "intern", roles: ["org_admin"] },
]);
const INTERN_ZONDER_ROL = decideToegang("stagiair@brinklicht.nl", [
  { orgId: "org-brink", orgType: "intern", roles: [] },
]);
const EXTERN_ADMIN = decideToegang("baas@installateur.nl", [
  { orgId: "org-klant", orgType: "extern", roles: ["org_admin"] },
]);
const EXTERN_LID = decideToegang("jan@installateur.nl", [
  { orgId: "org-klant", orgType: "extern", roles: ["calculator"] },
]);
const INGELOGD_ZONDER_ORG = decideToegang("zwever@nergens.nl", []);

const NIVEAUS: Niveau[] = ["open", "iedereen", "org_admin", "intern"];

// De hele matrix in één tabel: kijker × niveau → mag of niet. Uitgeschreven en niet
// afgeleid, want een verwachting die met dezelfde regel wordt berekend als de code toetst
// niets (dat is de valkuil die authz-deuren.test.ts twee rondes heeft gekost).
const MATRIX: [naam: string, toegang: Toegang, mag: Record<Niveau, boolean>][] = [
  [
    "anoniem",
    ANONIEM,
    { open: true, iedereen: false, org_admin: false, intern: false },
  ],
  [
    "intern (org_admin)",
    INTERN,
    { open: true, iedereen: true, org_admin: true, intern: true },
  ],
  [
    // G36-regel 1: élke rol binnen een interne org telt, ook géén rol.
    "intern zonder rol",
    INTERN_ZONDER_ROL,
    { open: true, iedereen: true, org_admin: true, intern: true },
  ],
  [
    // Een org_admin van een EXTERNE organisatie is en blijft extern — zelfde lezing als
    // prijszicht.ts, waar hij ook geen bedragen ziet.
    "extern org_admin",
    EXTERN_ADMIN,
    { open: true, iedereen: true, org_admin: true, intern: false },
  ],
  [
    "extern lid",
    EXTERN_LID,
    { open: true, iedereen: true, org_admin: false, intern: false },
  ],
  [
    // Ingelogd maar nergens lid: hij is niet anoniem (hij heeft een sessie), maar hij is
    // ook niets. Alleen wat elk ingelogd account mag — en dat is een lege verzameling
    // rijen, want zijn DossierScope is `orgs: []`.
    "ingelogd zonder organisatie",
    INGELOGD_ZONDER_ORG,
    { open: true, iedereen: true, org_admin: false, intern: false },
  ],
];

for (const [naam, toegang, mag] of MATRIX) {
  for (const niveau of NIVEAUS) {
    test(`${naam} bij niveau ${niveau}: ${mag[niveau] ? "mag" : "mag niet"}`, () => {
      expect(magBij(toegang, niveau)).toBe(mag[niveau]);
    });
  }
  test(`${naam} bij een onbekend niveau: mag niet`, () => {
    // Default-deny op de laatste tak: een vijfde niveau dat iemand morgen toevoegt en
    // vergeet af te handelen, is dicht en niet open.
    expect(magBij(toegang, "zoiets" as Niveau)).toBe(false);
  });
}
