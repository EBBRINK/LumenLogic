// De bewaker onder de route-allowlist — sprint 3.2a, acceptatie-eis 1.
//
// De tabel zelf plus de pure beslisregels staan in `lib/route-allowlist.ts`; dit bestand is
// alleen de aanroep-kant (sessie, database, Next-navigatie). Die splitsing is dezelfde als
// `components/nav-items.ts` naast `components/site-nav.tsx`: zo kan een test de regels los
// toetsen zonder `@/db/client` te hoeven mocken.
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";
import { resolveToegang, type Toegang } from "@/lib/repo/toegang";
import { niveauVoor, magBij, type Niveau, type Route } from "@/lib/route-allowlist";
import { getSession } from "@/lib/session";

export type { Niveau, Route } from "@/lib/route-allowlist";

/**
 * De bewaker. Elke `page.tsx` en `route.ts` in `app/` roept hem als eerste aan, met zijn
 * eigen route — `lib/route-allowlist.test.ts` controleert dat.
 *
 * Twee verschillende weigeringen, en dat verschil is bewust het enige signaal dat een
 * weigering geeft:
 *  • géén sessie → `redirect("/login")`, want dan is inloggen de zinnige volgende stap
 *    (en dat deed `requireSession()` al, dus dit is geen gedragsverandering);
 *  • wél een sessie, maar te weinig → `notFound()`. Geen "verboden", geen reden: de
 *    route bestaat voor deze gebruiker niet.
 *
 * Geeft de vastgestelde `Toegang` terug, zodat de pagina hem niet nog eens hoeft op te
 * halen — en zodat scherm en poort per definitie dezelfde bron gebruiken.
 */
export async function bewaakRoute(route: Route): Promise<Toegang> {
  return bewaakNiveau(niveauVoor(route), route);
}

/**
 * Dezelfde poort, maar op een niveau in plaats van een route. Voor **server actions**, die
 * geen eigen URL hebben — en soms strenger moeten zijn dan het scherm waar ze op staan.
 *
 * `app/settings/actions.ts` is precies dat geval: `/settings` staat op `iedereen` omdat
 * iedereen zijn eigen wachtwoord moet kunnen wijzigen, maar de acties op dat scherm
 * (toegelaten adressen, LLM-budget, XIS-koppeling) zijn intern beheer. Een action die zijn
 * niveau van de route zou erven, zou daar dus te ruim staan.
 *
 * ⚠️ Dit is géén achterdeur om een pagina langs de tabel te krijgen: `page.tsx` en
 * `route.ts` moeten `bewaakRoute()` met hun eigen route aanroepen, en
 * `lib/route-allowlist.test.ts` controleert dat letterlijk.
 *
 * `waarvoor` is alleen een label voor de events-tabel — het weegt niet mee in het besluit.
 */
export async function bewaakNiveau(
  niveau: Niveau | null,
  waarvoor: string,
): Promise<Toegang> {
  const session = await getSession();
  const toegang = await resolveToegang(db, session?.user?.email);

  if (magBij(toegang, niveau)) return toegang;

  // Ijzeren regel 5: een geweigerde poging is precies het soort gebeurtenis dat je achteraf
  // wilt kunnen terugvinden. De reden staat hier voluit — de events-tabel is intern, de
  // gebruiker krijgt alleen een 404. Bewust vóór de redirect/notFound: die gooien.
  await logEvent(db, {
    entity: "route",
    action: "route_denied",
    actor: toegang.email ?? "anoniem",
    payload: { waarvoor, niveau, soort: toegang.soort },
  });

  if (toegang.soort === "anoniem") redirect("/login");
  notFound();
}
