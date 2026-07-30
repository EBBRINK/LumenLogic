// Marset kwam terug met 48 van de 71 cellen afgekeurd: CANOPY (kap/rozet met voeding), CLUSTER
// (meervoudige voedingseenheid) en losse E27/E14/G9-lampen. Meten hoe groot die drie zijn en of
// de termen ook in armatuurnamen staan.
//   bun --env-file=.env.branch scripts/meet-canopy-cluster.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const TERMEN: Array<[string, RegExp, RegExp]> = [
  ["canopy", /\bcanopy\b/i, /^\s*canopy\b/i],
  ["cluster", /\bcluster\b/i, /^\s*cluster\b/i],
  ["losse fitting-lamp", /^\s*(?:e14|e27|g9|gu10|ar111)\b/i, /^\s*(?:e14|e27|g9|gu10|ar111)\b/i],
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
    const merken = new Map<string, number>();
    let door = 0;
    const vb: string[] = [];
    for (const r of v) {
      merken.set(r.merk ?? "?", (merken.get(r.merk ?? "?") ?? 0) + 1);
      const naam = r.naam ?? "";
      const p = parseProductName(naam);
      if (p.maxWattage == null && p.kelvin == null && p.cri == null) continue;
      const s = verdenkingen(naam, p).map((x) => x.soort);
      if (!s.includes("product-is-onderdeel")) {
        door++;
        if (vb.length < 4) vb.push(`${r.merk} · ${naam.slice(0, 74)}`);
      }
    }
    console.log(`\n"${label}": ${raak.length} namen · vooraan ${v.length}`);
    console.log(`  vooraan per merk: ${[...merken].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ") || "-"}`);
    console.log(`  vooraan door de poort met een waarde: ${door}`);
    for (const x of vb) console.log(`      ${x}`);
    const midden = raak.filter((r) => !vooraan.test(r.naam ?? ""));
    if (midden.length) {
      console.log(`  niet-vooraan (${midden.length}) — hier zou een grove regel toeslaan:`);
      for (const r of [...new Map(midden.map((r) => [r.merk, r])).values()].slice(0, 5))
        console.log(`      ${r.merk} · ${(r.naam ?? "").slice(0, 74)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
