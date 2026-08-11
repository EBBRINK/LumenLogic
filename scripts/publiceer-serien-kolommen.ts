// Fase 1, Serien Lighting: Timo's oordeel toepassen en publiceren — 11 aug 2026, via de
// sprintmaster ("s1=ja s2=ja s3=ja s4=ja s5=ja"). Zelfde patroon als
// publiceer-northern-kolommen.ts: vaste run-id's zodat een herdraai nooit stilletjes een andere
// run publiceert; publishRun is idempotent.
//
// Draaien:
//   bun --env-file=<pad>/.env.local scripts/publiceer-serien-kolommen.ts --productie
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const RUNS: { id: string; kolom: string }[] = [
  { id: "259dcff5-3806-4ec7-9426-191d427c89a8", kolom: "Schutzart" },
  { id: "42c73935-3b63-4beb-aa0e-2e98f4aa60c4", kolom: "CCT K" },
  { id: "c01c43e6-8f75-4f1a-92ee-b230b5d64fe4", kolom: "Systemleistung W" },
  { id: "f635c592-405d-4b61-a8dd-c46197a4f591", kolom: "CRI Ra" },
  { id: "1770a68e-a15e-4e1f-b5ee-a2d4846f3021", kolom: "Regelung" },
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
    `${kolom.padEnd(17)} run ${id.slice(0, 8)} · steekproef ${sample.length} ` +
      `(${zonderOordeel.length} oordeel gezet) · status ${run.status} · toegepast ${applied}`,
  );
}

// Nameting: Serien's kolomvulling ná publicatie.
const { sql } = await import("drizzle-orm");
const na = await db.execute(sql`
  select count(*) as tot,
    count(nullif(p.ip_value, '')) as ip, count(p.kelvin) as kelvin, count(p.max_wattage) as watt,
    count(p.cri) as cri, count(nullif(p.dimmable, '')) as dim
  from products p join brands b on b.id = p.brand_id where b.name = 'Serien Lighting'`);
console.log("\nSerien ná publicatie:", na.rows[0]);
process.exit(0);
