// Welke runs staan er open, en is er per merk precies één? Timo tekent per merk; staan er
// meerdere runs op 'steekproef', dan kan hij er een pakken van vóór een reparatie. Dit script
// zegt alleen WAT er staat — het wijst niets af.
//   bun --env-file=.env.branch scripts/meet-openstaande-runs.ts
import { assertBranchDb, logGuard } from "./branch-guard";

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { listEnrichmentRuns } = await import("@/lib/repo/enrichment");
  const { brands } = await import("@/db/schema");
  const merken = new Map((await db.select().from(brands)).map((b) => [b.id, b.name]));

  const runs = await listEnrichmentRuns(db);
  const perMerk = new Map<string, typeof runs>();
  for (const r of runs) {
    if (r.status !== "steekproef") continue;
    const m = merken.get(r.brandId as string) ?? "?";
    perMerk.set(m, [...(perMerk.get(m) ?? []), r]);
  }
  const open = [...perMerk].sort((a, b) => b[1].length - a[1].length);
  console.log(`runs op 'steekproef': ${[...perMerk.values()].reduce((a, r) => a + r.length, 0)} over ${perMerk.size} merken\n`);
  for (const [merk, rs] of open) {
    const vlag = rs.length > 1 ? "  ⚠ MEER DAN ÉÉN" : "";
    console.log(`${merk}${vlag}`);
    for (const r of rs) {
      console.log(
        `   ${r.id}  ${new Date(r.createdAt as unknown as string).toISOString().slice(0, 16)}` +
          `  ${JSON.stringify(r.counts ?? {})}`,
      );
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
