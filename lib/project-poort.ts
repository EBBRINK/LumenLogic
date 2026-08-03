// De poort onder élke server action in `app/projects/**` — sprint 3.2a.
//
// Waarom dit bestand bestaat: de acties stonden achter `requireSession()`, en die
// beantwoordt "is er iemand ingelogd". Dat was de énige vraag zolang iedereen met een
// sessie van Brink was. Sinds 3.1 is dat niet meer zo, en alle 30 acties in
// `app/projects/**` nemen een `dossierId` uit het formulier en muteren daarmee een project
// — dus met een geldige sessie en de uuid van een ánder bedrijf schreef je in het project
// van dat bedrijf. Een route-allowlist die dat gat laat staan is een muur met een deur
// ernaast.
//
// Eén poort in plaats van een controle per action, om dezelfde reden als
// `lib/repo/authz.ts`: staat de regel op dertig plekken, dan is het een kwestie van tijd
// tot er één afwijkt. `app/projects/projects-poort.test.ts` controleert dat élke
// geëxporteerde action in `app/projects/**` hier daadwerkelijk mee begint.
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getDossier } from "@/lib/repo/dossiers";
import { toegangScope, type DossierScope, type Toegang } from "@/lib/repo/toegang";
import { bewaakRoute } from "@/lib/route-toegang";
import { isUuid } from "@/lib/uuid";

export type ProjectPoort = {
  toegang: Toegang;
  /** Kant-en-klaar voor de repo-functies die er een eisen. */
  scope: DossierScope;
  /**
   * Het project, als de aanroeper er een geldige uuid bij gaf én het mag zien. `null`
   * betekent "geen bruikbare dossierId meegestuurd" — nooit "wel een id, maar niet van hem",
   * want dat pad eindigt hierboven al in `notFound()`.
   */
  dossier: Awaited<ReturnType<typeof getDossier>> | null;
};

/**
 * Sessie + route + eigendom, in één aanroep.
 *
 * Drie uitkomsten, en het verschil ertussen is bewust het enige signaal dat er naar buiten
 * gaat:
 *  • geen sessie → `bewaakRoute()` redirect naar `/login`;
 *  • wél een sessie, maar het project is van een andere organisatie → `notFound()`,
 *    precies zoals een project dat niet bestaat. Het verschil tussen "bestaat niet" en
 *    "mag je niet zien" is zelf informatie (zelfde redenering als MSG_DENIED in authz.ts);
 *  • geen bruikbare `dossierId` in de invoer → `dossier: null`, en de action doet daarna
 *    zijn eigen validatie en geeft zijn eigen nette melding. Dat is veilig: zonder geldige
 *    uuid komt er verderop geen enkele query langs.
 */
export async function bewaakProject(
  bron: FormData | { dossierId?: unknown } | null | undefined,
): Promise<ProjectPoort> {
  const toegang = await bewaakRoute("/projects");
  const scope = toegangScope(toegang);
  const ruw = bron instanceof FormData ? bron.get("dossierId") : bron?.dossierId;
  const dossierId = typeof ruw === "string" ? ruw.trim() : "";
  if (!isUuid(dossierId)) return { toegang, scope, dossier: null };
  const dossier = await getDossier(db, scope, dossierId);
  if (!dossier) notFound();
  return { toegang, scope, dossier };
}
