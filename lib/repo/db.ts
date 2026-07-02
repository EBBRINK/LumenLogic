// Gedeeld db-type voor de repository-laag. Alle repo-functies krijgen de db geïnjecteerd,
// zodat de app de Neon-HTTP-client meegeeft en tests een PGlite-client — dezelfde code,
// dezelfde regels, bewijsbaar in beide.
import type { PgDatabase } from "drizzle-orm/pg-core";

// Zowel de Neon-HTTP-client (app) als de PGlite-client (tests) zijn een PgDatabase;
// bewust los getypeerd zodat exact dezelfde repo-code op beide draait.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDb = PgDatabase<any, any, any>;
