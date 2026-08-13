// De route-allowlist — sprint 3.2a, acceptatie-eis 1.
//
// Eén tabel met een regel per route in `app/`, plus de pure beslisregels eromheen. De
// bewaker die ze aanroept (sessie, database, Next-navigatie) staat in
// `lib/route-toegang.ts`; deze module blijft bewust vrij van `@/db/client` en
// `next/navigation`, zodat een test de regels los kan toetsen. Zelfde splitsing als
// `components/nav-items.ts` naast `components/site-nav.tsx`.
//
// Wat deze vorm koopt boven een `if` in een layout of een matcher in middleware:
//
//   1. **Een route die niemand bewust heeft toegelaten, bestaat niet als waarde.**
//      `Route` is `keyof typeof ROUTE_NIVEAUS`, dus `bewaakRoute("/nieuw")` compileert
//      niet. Het verkeerde antwoord is een typefout, niet een stille doorgang — dezelfde
//      vorm als `lib/repo/prijszicht.ts` (3.2b).
//   2. **`lib/route-allowlist.test.ts` leidt de routes uit de bestandsnamen af** en eist dat
//      élk `page.tsx`/`route.ts` in `app/` precies zijn eigen route bewaakt. Een nieuwe
//      route zonder regel in de tabel maakt die test rood. Zelfde bewaker-gedachte als
//      `lib/repo/authz-deuren.test.ts`.
//   3. **Weigeren is `notFound()`**, geen foutmelding: wie er niet bij mag hoort ook niet
//      te weten dát de route bestaat (OWASP A01; zelfde lijn als de neutrale `MSG_DENIED`
//      in `lib/repo/authz.ts`).
//
// ⚠️ WAAROM GEEN `middleware.ts`. Het lag voor de hand — er is er geen. Drie redenen:
//   • Deze codebase heeft zélf gemeten dat een bovenliggende laag niet gezaghebbend is:
//     `app/projects/[id]/layout.tsx:32-40` legt uit dat een layout parallel rendert met
//     zijn pagina, dus zijn `redirect()` stopt de queries van die pagina niet. Datzelfde
//     argument geldt voor middleware — het is dezelfde belofte.
//   • Middleware draait op de edge, zonder de databaseverbinding waarin het lidmaatschap
//     staat. Een cookie zegt wíé je bent, niet in welke organisatie je zit; dat onderscheid
//     is precies G39 (identiteit uit de sessie, rechten vers uit de database).
//   • Deny-by-default werkt beter met een tabel dan met een matcher: een nieuwe route is
//     een ontbrekende sleutel, geen pad dat toevallig niet door een regex geraakt wordt.
//
// ⚠️ WAT DEZE LAAG NIET DOET: bepalen wélke RIJEN zichtbaar zijn. Dat is `DossierScope` in
// `lib/repo/toegang.ts`. Een route openzetten is niet hetzelfde als de data vrijgeven; de
// projectroutes hieronder staan op `iedereen` en zijn desondanks per organisatie gescoped.
import type { Toegang } from "@/lib/repo/toegang";

/** Wat een route minimaal eist. Oplopend streng; `magBij()` hieronder is de hele regel. */
export type Niveau =
  /** Zonder sessie bereikbaar. Alleen inloggen, activeren en de auth-endpoints. */
  | "open"
  /** Elk ingelogd account. Wát het binnen de route ziet, bepaalt de rij-scoping. */
  | "iedereen"
  /** Beheerder van de eigen organisatie — of intern, want intern mag alles. */
  | "org_admin"
  /** Alleen leden van een organisatie met `type = 'intern'`: Brink zelf. */
  | "intern";

/**
 * De allowlist. Eén regel per `page.tsx`/`route.ts` in `app/`, met het Next-routepatroon
 * als sleutel (inclusief `[param]`) — zo is hij één-op-één uit de bestandsnaam af te leiden
 * en kan de test dat controleren.
 *
 * ⚠️ Wie hier een regel bijzet, zet een deur open. Drie plekken waar de eis en de
 * werkelijkheid schuurden, met de reden erbij:
 *
 *  • `/admin/*` staat op `intern` — MET ÉÉN UITZONDERING: `/admin/users` staat op
 *    `org_admin`. De acceptatie-eis noemt `/admin` letterlijk bij de geweigerde routes, en
 *    de eerste versie van deze tabel volgde dat letterlijk. Dat bleek de verkeerde lezing:
 *    de derde acceptatie-eis zegt óók "uitnodigen alleen admin", en besluit G36 (30 jul,
 *    ná de zin over /admin) heeft precies dat gebouwd — een externe org_admin mag binnen
 *    zijn eigen organisatie PIN's uitgeven. `/admin/users` dichtzetten maakte die hele tak
 *    onbereikbaar, inclusief de veertien aanvals-tests in
 *    `app/admin/users/issue-pin-authz.test.ts` die bewijzen dat hij houdt. Een muur die een
 *    getest mechanisme onbereikbaar maakt, verbergt het in plaats van het te beschermen.
 *    Wát een externe org_admin daar ziet is wél gescoped: de ledenlijst toont alleen zijn
 *    eigen organisatie(s). De rest van `/admin` (merken, imports, het dashboard) is
 *    onveranderd intern.
 *  • `/settings` staat op `iedereen`. Externen daar weigeren zou betekenen dat ze hun eigen
 *    wachtwoord niet kunnen wijzigen — precies wat 3.1 vorige week heeft opgeleverd. De eis
 *    somt de geweigerde routes op (`/data`, `/admin`, Merken, `/analytics`) en `/settings`
 *    staat daar niet bij. De interne blokken op die pagina (toegelaten adressen, LLM-budget,
 *    XIS-koppeling) renderen alleen voor intern — "intern? toon", niet "extern? verberg".
 *  • De hele `/projects/[id]/*`-boom staat op `iedereen` en niet op `intern`, want een
 *    externe hoort zijn éígen projecten te zien. Dat het niet die van een ander worden,
 *    doet de rij-scoping en niet deze tabel.
 */
export const ROUTE_NIVEAUS = {
  // ── Open: geen sessie ───────────────────────────────────────────────────────
  "/login": "open",
  "/activate": "open",
  "/api/auth/[...all]": "open",
  // De uptime-monitor logt niet in. Geeft alleen {"status":"ok"} terug — geen data,
  // geen versie, geen foutreden; zie de kop van app/api/health/route.ts.
  "/api/health": "open",
  // Sprint M1 (docs/plan-matchstation-eigen-machine.md): het matchstation is een
  // machine-account, geen mensensessie — "open" betekent hier dus NIET onbewaakt,
  // net zoals /api/health hierboven. De echte poort is de machine-sleutel
  // (lib/machine-auth.ts, verifyMachineKey) resp. de cron-secret (verifyCronSecret),
  // gecontroleerd IN elke route zelf, vóór er iets van de database gelezen wordt.
  "/api/matchstation/werk": "open",
  "/api/matchstation/resultaat": "open",
  "/api/matchstation/healthcheck": "open",
  "/api/matchstation/document/[runId]/[page]/[tile]": "open",

  // ── Iedereen: projecten (org-gescoped), catalogus, eigen instellingen ───────
  "/": "iedereen", // redirect naar /projects; leest zelf niets
  "/projects": "iedereen",
  "/projects/[id]": "iedereen",
  "/projects/[id]/review": "iedereen",
  "/projects/[id]/quote": "iedereen",
  "/projects/[id]/quote/pdf": "iedereen",
  "/projects/[id]/work-prep": "iedereen",
  "/projects/[id]/luminaire-schedule": "iedereen",
  "/projects/[id]/luminaire-schedule/versions": "iedereen",
  "/projects/[id]/line/[lineId]": "iedereen",
  "/projects/[id]/import/[runId]": "iedereen",
  "/projects/[id]/import/[runId]/markdown": "iedereen",
  "/projects/[id]/ocr-image/[runId]/[page]": "iedereen",
  "/projects/[id]/substitution/[proposalId]": "iedereen",
  "/catalog": "iedereen",
  "/products/[id]": "iedereen",
  "/settings": "iedereen",

  // ── Beheer van de eigen organisatie ─────────────────────────────────────────
  "/settings/organization": "org_admin",
  "/admin/users": "org_admin",

  // ── Intern: de werkbank van Brink ───────────────────────────────────────────
  "/analytics": "intern",
  "/admin": "intern",
  "/admin/imports": "intern",
  "/admin/brands": "intern",
  "/admin/brands/new": "intern",
  "/admin/brands/[brandId]": "intern",
  "/data": "intern",
  "/data/fields": "intern",
  "/data/loading": "intern",
  "/data/evaluation": "intern",
  "/data/event-log": "intern",
  "/data/price-lists": "intern",
  "/data/enrichment": "intern",
  "/data/enrichment/[runId]": "intern",
  "/data/brand-relations": "intern",
  "/data/brand-relations/template": "intern",
  "/data/brand-relations/[brandId]": "intern",
  "/data/brand-relations/[brandId]/upload/[uploadId]": "intern",
  "/brand": "intern",
  "/brand/dashboard": "intern",
  "/brand/data": "intern",
  "/brand/price-lists": "intern",
} as const satisfies Record<string, Niveau>;

/**
 * De toegestane routes, als type. Dít is wat de allowlist een allowlist maakt: een route
 * die er niet in staat is geen geldig argument voor `bewaakRoute()`.
 */
export type Route = keyof typeof ROUTE_NIVEAUS;

/**
 * Het niveau van een route. `null` = onbekende route = geweigerd. Bewust géén
 * prefix-match: `/data/nieuw-scherm` erft niets van `/data`, want dan zou een nieuwe route
 * onder een bestaande sectie zichzelf toelaten en is er van deny-by-default niets over.
 */
export function niveauVoor(route: string): Niveau | null {
  return (ROUTE_NIVEAUS as Record<string, Niveau>)[route] ?? null;
}

/**
 * De hele regel, puur: mag deze toegang bij dit niveau? Zonder database en zonder Next,
 * dus uitputtend testbaar.
 *
 * Geschreven als een lijst van wat WÉL mag; alles daarbuiten valt door naar `false`. Bij
 * een vierde org-type, een ontbrekende membership-rij of een onbekend niveau is dat
 * automatisch een weigering (ijzeren regel 4).
 */
export function magBij(toegang: Toegang, niveau: Niveau | null): boolean {
  // Eerst: is dit überhaupt een niveau dat wij kennen? `null` (route staat niet in de
  // tabel) en een waarde die er niet in hoort zijn allebei "nee, voor iedereen" — óók voor
  // intern. Zonder deze regel gaf `magBij(intern, "zoiets")` gewoon `true`, want intern
  // mag alles wat een sessie eist en een onbekende string is nu eenmaal niet `null`. Dat
  // is precies de faalstand die een vijfde niveau morgen zou opleveren: iemand voegt er
  // een toe, vergeet hem hieronder af te handelen, en hij staat stil open voor de kijker
  // met de meeste rechten.
  if (!NIVEAUS.includes(niveau as Niveau)) return false;
  if (niveau === "open") return true;
  if (toegang.soort === "anoniem") return false;
  // Intern mag alles wat een sessie eist — G36-regel 1, hier op de leeskant.
  if (toegang.soort === "intern") return true;
  if (niveau === "iedereen") return true;
  if (niveau === "org_admin") return toegang.adminOrgIds.length > 0;
  // Blijft over: niveau "intern" voor een niet-interne kijker.
  return false;
}

/** De vier niveaus als waarde, zodat `magBij()` een onbekende vijfde kan herkennen. */
const NIVEAUS: readonly Niveau[] = ["open", "iedereen", "org_admin", "intern"];
