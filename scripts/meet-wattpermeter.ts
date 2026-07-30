// Toetst catalogusbreed dat een naam met een vermogen PER METER geen maxWattage oplevert.
// De zwerm-agent wees erop bij Kreon (`44W/m`, `25,7W/m`, `price/m`); de W/m-regel hoort dat
// overal te vangen, niet alleen bij het merk waar hij vandaan kwam.
//   bun --env-file=.env.branch scripts/meet-wattpermeter.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";

const PER_METER = /\d+(?:[.,]\d+)?\s*W\s*\/\s*m\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => PER_METER.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; lek: string[] }>();
  for (const r of raak) {
    const w = parseProductName(r.naam ?? "").maxWattage;
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, lek: [] };
    e.n++;
    if (w != null) e.lek.push(`${r.naam} → ${w} W`);
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`namen met een vermogen per meter: ${raak.length} (van ${rijen.length})`);
  let lek = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(24)} ${String(e.n).padStart(5)}  lek: ${e.lek.length}`);
    for (const l of e.lek.slice(0, 5)) console.log(`      ${l}`);
    lek += e.lek.length;
  }
  console.log(lek === 0 ? "\n✓ geen enkele W/m-naam levert een maxWattage op" : `\n✗ ${lek} lek`);
}
main().catch((e) => { console.error(e); process.exit(1); });
