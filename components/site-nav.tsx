// Sessiepoort voor de hoofdbalk: rendert niets zonder sessie (o.a. op /login).
// De balk zelf (items, actieve sectie) staat in ./nav-link — dat is een module zonder
// getSession/server-only, zodat tests hem los kunnen importeren.
import { getSession } from "@/lib/session";
import { NavBar } from "./nav-link";

export async function SiteNav() {
  const session = await getSession();
  if (!session) return null;
  return <NavBar email={session.user?.email} />;
}
