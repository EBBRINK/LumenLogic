// Scherf 11 wees "Drive/Sensore Delta 1 Simmetrico 20 W Sett." af — een ECHTE cel, dus door de
// poort heen. De onderdeel-herkenning kent 'driver' maar niet 'drive' zonder r. Meten waar die
// vorm voorkomt vóór de regel wordt opgerekt: 'drive' is ook een gewoon woord.
//   bun --env-file=.env.branch scripts/meet-drive-sensore.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const DRIVE = /\bdrive\b(?!r)/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => DRIVE.test(r.naam ?? ""));
  console.log(`"drive" (zonder r) in de naam: ${raak.length} van ${rijen.length}`);
  const perMerk = new Map<string, { n: number; door: string[] }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, door: [] };
    e.n++;
    const heeftWaarde = p.maxWattage != null || p.kelvin != null || p.cri != null;
    const v = verdenkingen(naam, p).map((x) => x.soort);
    if (heeftWaarde && !v.includes("product-is-onderdeel")) e.door.push(naam);
    perMerk.set(r.merk ?? "?", e);
  }
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(4)}  door de poort met een waarde: ${e.door.length}`);
    for (const d of e.door.slice(0, 6)) console.log(`      ${d}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
