// Vervolg op meet-bulb.ts: is "led bulb VOORAAN" wél scherp af te bakenen? Kreons 150 pendels
// dragen 'sphere bulb' middenin en TossB heeft 'Bulb included' (een armatuur MET lamp, dus een
// geldige lampbelasting). Alleen de vorm die met de lamp begint is een losse lamp.
//   bun --env-file=.env.branch scripts/meet-ledbulb-vooraan.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const VOORAAN = /^\s*(?:led|halogen|hal\.)\s+bulbs?\b/i;
const BULB = /\bbulbs?\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const bulb = rijen.filter((r) => BULB.test(r.naam ?? ""));
  const vooraan = bulb.filter((r) => VOORAAN.test(r.naam ?? ""));
  const rest = bulb.filter((r) => !VOORAAN.test(r.naam ?? ""));
  const perMerk = new Map<string, number>();
  for (const r of vooraan) perMerk.set(r.merk ?? "?", (perMerk.get(r.merk ?? "?") ?? 0) + 1);
  console.log(`namen die met "led/halogen bulb" BEGINNEN: ${vooraan.length} van ${bulb.length}`);
  console.log(`  ${[...perMerk].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  for (const r of vooraan.slice(0, 5)) console.log(`      ${r.merk} · ${r.naam}`);
  console.log(`\n  de ${rest.length} andere blijven ongemoeid, o.a.:`);
  for (const r of [...new Map(rest.map((r) => [r.merk, r])).values()].slice(0, 6))
    console.log(`      ${r.merk} · ${r.naam}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
