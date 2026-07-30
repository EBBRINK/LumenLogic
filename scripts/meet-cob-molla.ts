// Scherf 13 wees twee soorten aan die de poort niet kent:
//   - "Led Cob Cree … Cri80/Cri95 … Easyw" — een losse LED-COB-chip, geen armatuur
//   - "Molla Vetri Componi 200W" — een montageveer voor glaspanelen, een accessoire
// Meten hoe groot beide zijn en waar de term nog meer staat, vóór er een regel bij komt.
//   bun --env-file=.env.branch scripts/meet-cob-molla.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const TERMEN: Array<[string, RegExp, RegExp]> = [
  ["cob", /\bcob\b/i, /^\s*(?:led\s+)?cob\b/i],
  ["molla", /\bmoll[ae]\b/i, /^\s*moll[ae]\b/i],
];

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  for (const [label, overal, vooraan] of TERMEN) {
    const raak = rijen.filter((r) => overal.test(r.naam ?? ""));
    const v = raak.filter((r) => vooraan.test(r.naam ?? ""));
    const m = raak.filter((r) => !vooraan.test(r.naam ?? ""));
    let door = 0;
    const vb: string[] = [];
    for (const r of raak) {
      const naam = r.naam ?? "";
      const p = parseProductName(naam);
      if (p.maxWattage == null && p.kelvin == null && p.cri == null) continue;
      const s = verdenkingen(naam, p).map((x) => x.soort);
      if (!s.includes("product-is-onderdeel")) {
        door++;
        if (vb.length < 6) vb.push(`${r.merk} · ${naam}`);
      }
    }
    const merken = new Map<string, number>();
    for (const r of raak) merken.set(r.merk ?? "?", (merken.get(r.merk ?? "?") ?? 0) + 1);
    console.log(`\n"${label}": ${raak.length} namen — vooraan ${v.length}, niet-vooraan ${m.length}`);
    console.log(`  merken: ${[...merken].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
    console.log(`  door de poort MET een waarde: ${door}`);
    for (const x of vb) console.log(`      ${x}`);
    if (m.length) {
      console.log(`  niet-vooraan — hier zou een grove regel toeslaan:`);
      for (const r of m.slice(0, 6)) console.log(`      ${r.merk} · ${r.naam}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
