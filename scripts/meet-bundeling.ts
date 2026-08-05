// Meet de prestatiewinst van bundelen. Schrijft alleen semantisch neutrale no-ops
// (updated_at = updated_at) op de BRANCH, achter de poort.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql, inArray, eq } = await import("drizzle-orm");
const { products } = await import("@/db/schema");

const rows = ((await db.execute(sql`
  select id from products where brand_id = (select id from brands where name='Serien Lighting') limit 500`)).rows ?? []) as any[];
const ids = rows.map((r) => r.id as string);
console.log(`${ids.length} ids\n`);

const meet = async (label: string, f: () => Promise<unknown>) => {
  const t0 = performance.now(); await f();
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(52)} ${(ms/1000).toFixed(2)} s`);
  return ms;
};

// A. huidige vorm: per product één select
const perStuk = await meet("A. 100× select per product (huidige publishRun)", async () => {
  for (const id of ids.slice(0,100)) await db.select().from(products).where(eq(products.id, id)).limit(1);
});
// B. gebundeld: één select over 500
const gebundeld = await meet("B. 1× select over 500 producten (inArray)", async () => {
  await db.select().from(products).where(inArray(products.id, ids));
});
// C. huidige vorm: per product één update
const updPerStuk = await meet("C. 100× update per product (huidige publishRun)", async () => {
  for (const id of ids.slice(0,100)) await db.update(products).set({ updatedAt: sql`updated_at` }).where(eq(products.id, id));
});
// D. gebundeld: één UPDATE ... FROM (VALUES ...) over 500
const updGebundeld = await meet("D. 1× UPDATE FROM VALUES over 500 producten", async () => {
  const vals = sql.join(ids.map((id) => sql`(${id}::uuid)`), sql`, `);
  await db.execute(sql`update products p set updated_at = p.updated_at from (values ${vals}) as v(id) where p.id = v.id`);
});

console.log(`\nselect : ${(perStuk/100).toFixed(0)} ms/product los  →  ${(gebundeld/500).toFixed(2)} ms/product gebundeld  (${(perStuk/100/(gebundeld/500)).toFixed(0)}× sneller)`);
console.log(`update : ${(updPerStuk/100).toFixed(0)} ms/product los  →  ${(updGebundeld/500).toFixed(2)} ms/product gebundeld  (${(updPerStuk/100/(updGebundeld/500)).toFixed(0)}× sneller)`);
const perProdLos = perStuk/100 + updPerStuk/100 + 135; // + item-update
const perProdBundel = gebundeld/500 + updGebundeld/500 + 1;
console.log(`\n157.682 vullingen over ~113.555 producten:`);
console.log(`  los      ${((113555*perProdLos)/3600000).toFixed(1)} uur`);
console.log(`  gebundeld ${((113555*perProdBundel)/60000).toFixed(1)} min`);
