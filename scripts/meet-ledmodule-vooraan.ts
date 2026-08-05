// Drie W&D-agents trokken onafhankelijk dezelfde grens: een naam die BEGINT met "LED MODULE" is
// een losse module, maar "MILES WALL SURF 12.0 LED MODULE" is een uitvoeringsvariant van dat
// armatuur. Meten hoe die twee zich verhouden vóór er een regel komt.
//   bun --env-file=.env.branch scripts/meet-ledmodule-vooraan.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const OVERAL = /\bled\s+mod(?:ule)?\b/i;
const VOORAAN = /^\s*led\s+mod(?:ule)?\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => OVERAL.test(r.naam ?? ""));
  const v = raak.filter((r) => VOORAAN.test(r.naam ?? ""));
  const m = raak.filter((r) => !VOORAAN.test(r.naam ?? ""));
  const merken = new Map<string, number>();
  let door = 0;
  for (const r of v) {
    merken.set(r.merk ?? "?", (merken.get(r.merk ?? "?") ?? 0) + 1);
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    if (p.maxWattage == null && p.kelvin == null && p.cri == null) continue;
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (!s.includes("product-is-onderdeel")) door++;
  }
  console.log(`"led module/mod" in de naam: ${raak.length} — vooraan ${v.length}, elders ${m.length}`);
  console.log(`  vooraan per merk: ${[...merken].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  console.log(`  vooraan door de poort met een waarde: ${door}`);
  for (const r of v.slice(0, 4)) console.log(`      ${r.merk} · ${(r.naam ?? "").slice(0, 76)}`);
  console.log(`\n  ELDERS in de naam (die blijven staan), o.a.:`);
  for (const r of [...new Map(m.map((r) => [r.merk + (r.naam ?? "").slice(0, 8), r])).values()].slice(0, 8))
    console.log(`      ${r.merk} · ${(r.naam ?? "").slice(0, 76)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
