import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const meet = async (label: string, n: number, f: () => Promise<unknown>) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) await f();
  const ms = (performance.now() - t0) / n;
  console.log(`${label.padEnd(46)} ${ms.toFixed(1)} ms/query`);
  return ms;
};
await meet("select 1 (kale round-trip)", 10, () => db.execute(sql`select 1`));
const ids = ((await db.execute(sql`select id from products where brand_id = (select id from brands where name='Serien Lighting') limit 400`)).rows ?? []) as any[];
console.log(`\n${ids.length} Serien-product-ids opgehaald`);
const rt = await meet("select ÉÉN product op id", 10, () => db.execute(sql`select * from products where id = ${ids[0].id}`));
console.log(`\npublishRun doet 3 round-trips per product (select, update product, update item).`);
for (const [merk, n] of [["Serien (kelvin, 1.283)",1283],["XAL CRI",13407],["28 merken schatting",157682]] as [string,number][]) {
  console.log(`  ${merk.padEnd(26)} ${n} × 3 × ${rt.toFixed(0)} ms = ${((n*3*rt)/3600000).toFixed(1)} uur`);
}
