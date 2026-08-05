// TossB-scherf 1 wees twee cellen af: "Base Rond SB 100mm … - Driver 350mA - 10W - … base black".
// Het product is een voetstuk MET driver. Meten hoe scherp 'Base' vooraan af te bakenen is.
//   bun --env-file=.env.branch scripts/meet-base.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const VOORAAN = /^\s*base\b/i;
const OVERAL = /\bbase\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const overal = rijen.filter((r) => OVERAL.test(r.naam ?? ""));
  const vooraan = overal.filter((r) => VOORAAN.test(r.naam ?? ""));
  console.log(`"base" in de naam: ${overal.length} · vooraan: ${vooraan.length}`);
  const perMerk = new Map<string, { n: number; door: number }>();
  for (const r of vooraan) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, door: 0 };
    e.n++;
    const heeftWaarde = p.maxWattage != null || p.kelvin != null || p.cri != null;
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (heeftWaarde && !s.includes("product-is-onderdeel")) e.door++;
    perMerk.set(r.merk ?? "?", e);
  }
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${merk.padEnd(22)} vooraan ${String(e.n).padStart(4)}  door de poort met waarde: ${e.door}`);
  console.log(`\n  voorbeelden vooraan:`);
  for (const r of [...new Map(vooraan.map((r) => [r.merk + r.naam.slice(0, 12), r])).values()].slice(0, 8))
    console.log(`      ${r.merk} · ${r.naam.slice(0, 90)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
