// Sessiepoort voor de hoofdbalk: rendert niets zonder sessie (o.a. op /login).
// De balk zelf (items, actieve sectie) staat in ./nav-link — dat is een module zonder
// getSession/server-only, zodat tests hem los kunnen importeren.
//
// ⚠️ 3.2a: de balk toont alleen de secties die deze kijker ook echt mag bereiken. Zonder
// die filter houdt een extern account een menu met Data, Analytics, Merken en Admin — vier
// links die allemaal op een 404 uitkomen. De bron is dezelfde `ROUTE_NIVEAUS` die de routes
// zelf bewaakt (`magBij` + `niveauVoor`), dus balk en poort kunnen niet uit elkaar lopen.
// Dit is gemak, geen poort: `bewaakRoute()` weigert hetzelfde, ook als iemand het adres
// intikt of een oude bookmark opent.
import { db } from "@/db/client";
import { resolveToegang } from "@/lib/repo/toegang";
import { magBij, niveauVoor } from "@/lib/route-allowlist";
import { getSession } from "@/lib/session";
import { NAV_ITEMS } from "./nav-items";
import { NavBar } from "./nav-link";

export async function SiteNav() {
  const session = await getSession();
  if (!session) return null;
  const toegang = await resolveToegang(db, session.user?.email);
  const items = NAV_ITEMS.filter((it) => magBij(toegang, niveauVoor(it.href)));
  return <NavBar email={session.user?.email} items={items} />;
}
