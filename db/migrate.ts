// Eenvoudige, idempotente migrator op de Neon HTTP-driver.
// drizzle-kit's eigen `migrate` gebruikt de WebSocket-driver, die in deze omgeving hangt;
// deze runner voert dezelfde .sql-bestanden uit db/migrations/ uit over HTTP.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ontbreekt");

const sql = neon(url);
const migrationsDir = join(import.meta.dirname, "migrations");

async function run() {
  await sql.query(
    `CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const rows = (await sql.query(`SELECT name FROM __migrations`)) as {
    name: string;
  }[];
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= overslaan (al toegepast): ${file}`);
      continue;
    }
    const raw = readFileSync(join(migrationsDir, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(--.*\n?)*$/.test(s));

    console.log(`→ toepassen: ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    await sql.query(`INSERT INTO __migrations (name) VALUES ($1)`, [file]);
    console.log(`✓ klaar: ${file}`);
  }
  console.log("Migraties compleet.");
}

run().catch((e) => {
  console.error("Migratie mislukt:", e);
  process.exit(1);
});
