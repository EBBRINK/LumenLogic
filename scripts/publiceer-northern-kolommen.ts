// Fase 1, Northern: Timo's oordeel toepassen en publiceren — 11 aug 2026, via de sprintmaster
// ("Ja voor alles", runs 799651ed/d69bd01d/84e0b13a/259aedaa/7af4e8c6). Dit script zet per run
// alle steekproefrijen op 'goed' (dat is de vastlegging van zíjn oordeel, niet een eigen gok)
// en roept daarna publishRun aan. De vijf run-id's staan hard in het script: een herdraai kan
// nooit stilletjes een andere run publiceren, en publishRun zelf is idempotent.
//
// Draaien:
//   bun --env-file=<pad>/.env.local scripts/publiceer-northern-kolommen.ts --productie
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const RUNS: { id: string; kolom: string }[] = [
  { id: "799651ed-9177-4e0b-8b1f-5a2252f3e4de", kolom: "watt" },
  { id: "d69bd01d-b090-4034-b346-70a717fe25b9", kolom: "kelvin" },
  { id: "84e0b13a-9dc5-4f96-99aa-7e70e31434f3", kolom: "lumen" },
  { id: "259aedaa-f3b1-4cc4-a821-06c9f69ff234", kolom: "dimbaar" },
  { id: "7af4e8c6-34b8-484d-927b-2132dd23c1fe", kolom: "herkomst" },
];
const ACTOR = "timo-via-sprintmaster-week-0";

const naarProductie = process.argv.includes("--productie");
const poort = naarProductie
  ? await assertProductieDb(process.cwd())
  : await assertBranchDb(process.cwd());
if (naarProductie) {
  console.log(`\n🔴 PRODUCTIE-MODUS — endpoint ${poort.endpoint}. Dit PUBLICEERT: products wordt gevuld.\n`);
} else {
  logGuard(poort);
}

const { db } = await import("@/db/client");
const { getSampleItems, setSampleVerdict, publishRun } = await import("@/lib/repo/enrichment");

for (const { id, kolom } of RUNS) {
  const sample = await getSampleItems(db, id);
  const zonderOordeel = sample.filter((s) => s.sampleVerdict == null);
  for (const s of zonderOordeel) await setSampleVerdict(db, s.id, "goed", ACTOR);
  const { run, applied } = await publishRun(db, id, ACTOR);
  console.log(
    `${kolom.padEnd(9)} run ${id.slice(0, 8)} · steekproef ${sample.length} ` +
      `(${zonderOordeel.length} oordeel gezet) · status ${run.status} · toegepast ${applied}`,
  );
}

// Nameting: Northern's kolomvulling ná publicatie.
const { sql } = await import("drizzle-orm");
const na = await db.execute(sql`
  select count(*) as tot,
    count(p.max_wattage) as watt, count(p.kelvin) as kelvin, count(p.lumen_output) as lumen,
    count(nullif(p.dimmable, '')) as dim, count(nullif(p.country_of_origin, '')) as herkomst,
    count(nullif(p.ip_value, '')) as ip
  from products p join brands b on b.id = p.brand_id where b.name = 'Northern'`);
console.log("\nNorthern ná publicatie:", na.rows[0]);
process.exit(0);
