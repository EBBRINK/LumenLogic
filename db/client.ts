// Drizzle-client voor de app (RSC + scripts) op Neon via de HTTP-driver.
// Tests gebruiken een aparte PGlite-client (zie db/test-db.ts) — die raakt dit bestand niet.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL ontbreekt — zie .env.local");
}

export const db = drizzle(neon(connectionString), { schema });
export type DB = typeof db;
