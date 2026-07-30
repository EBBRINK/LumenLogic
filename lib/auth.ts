// De Better Auth-instantie van de applicatie: de factory uit lib/auth-factory.ts, gevoed met
// de Neon-client. Dit bestand bestaat alleen nog om díe koppeling te maken — alle regels
// (magic link + allowlist, wachtwoordbeleid, zelfregistratie uit) staan in de factory, zodat
// tests exact dezelfde configuratie op PGlite kunnen draaien (besluit G30).
//
// `import { auth } from "@/lib/auth"` blijft werken zoals altijd; createAuth en het
// wachtwoordbeleid zijn hier doorgegeven, dus niemand hoeft twee bestanden te kennen.
import { db } from "@/db/client";
import { createAuth } from "./auth-factory";

export {
  createAuth,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type CreateAuthOptions,
  type LumenAuth,
} from "./auth-factory";

// nextCookies aan: de server actions van /login en /activate schrijven het sessiecookie via
// de cookie-jar van Next. In tests staat hij uit — daar is geen request-scope.
export const auth = createAuth(db, { nextCookies: true });
