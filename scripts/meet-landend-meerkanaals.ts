// Hoeveel van de 34 meerkanaals-namen LANDEN werkelijk? Een vondst telt pas als de kolom leeg is;
// dat is dezelfde toets die `startEnrichmentRun` sinds vanavond zelf doet (fieldIsEmpty).
//   bun --env-file=.env.branch scripts/meet-landend-meerkanaals.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const KANALEN = /(\d+(?:[.,]\d+)?)\s*W\s*\+\s*(\d+(?:[.,]\d+)?)\s*W/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, w: products.maxWattage })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => KANALEN.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; leeg: number }>();
  for (const r of raak) {
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, leeg: 0 };
    e.n++;
    const leeg = r.w == null || String(r.w).trim() === "";
    if (leeg) e.leeg++;
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`meerkanaals-namen: ${raak.length}`);
  let leeg = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(4)} gevonden · ${String(e.leeg).padStart(4)} met LEGE kolom (die landen)`);
    leeg += e.leeg;
  }
  console.log(`\nwerkelijke blootstelling: ${leeg} van ${raak.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
