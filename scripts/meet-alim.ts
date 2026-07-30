// Zwerm-scherf 01 wees 13 cellen af die allemaal "Alim." heten — Italiaans voor alimentatore,
// oftewel voeding/driver. Die term staat niet in de onderdeel-herkenning. Meten hoeveel en waar,
// vóór er een regel bij komt: dezelfde term kan elders midden in een armatuurnaam staan.
//   bun --env-file=.env.branch scripts/meet-alim.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const ALIM = /\balim(?:\.|entatore)?\b/i;
const ALIM_VOORAAN = /^\s*alim(?:\.|entatore)?\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => ALIM.test(r.naam ?? ""));
  const vooraan = raak.filter((r) => ALIM_VOORAAN.test(r.naam ?? ""));
  const midden = raak.filter((r) => !ALIM_VOORAAN.test(r.naam ?? ""));
  console.log(`"alim/alim./alimentatore" in de naam: ${raak.length} van ${rijen.length}`);
  console.log(`  vooraan: ${vooraan.length}   niet-vooraan: ${midden.length}`);

  const perMerk = new Map<string, number>();
  let metWaarde = 0, geweerd = 0;
  const voorbeelden: string[] = [];
  for (const r of vooraan) {
    perMerk.set(r.merk ?? "?", (perMerk.get(r.merk ?? "?") ?? 0) + 1);
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    if (p.maxWattage == null && p.kelvin == null && p.cri == null) continue;
    metWaarde++;
    const v = verdenkingen(naam, p).map((x) => x.soort);
    if (v.includes("product-is-onderdeel")) geweerd++;
    else if (voorbeelden.length < 10) voorbeelden.push(`${naam}  [${v.join(",") || "geen verdenking"}]`);
  }
  console.log(`\n  vooraan per merk: ${[...perMerk].map(([m, n]) => `${m} ${n}`).join(" · ")}`);
  console.log(`  vooraan MET een waarde: ${metWaarde} — geweerd als onderdeel: ${geweerd}, door de poort: ${metWaarde - geweerd}`);
  for (const v of voorbeelden) console.log(`      ${v}`);
  if (midden.length) {
    console.log(`\n  niet-vooraan (${midden.length}) — hier zou een grove regel toeslaan:`);
    for (const r of midden.slice(0, 10)) console.log(`      ${r.merk} · ${r.naam}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
// (tweede meting hieronder los draaien: bun --env-file=.env.branch scripts/meet-alim.ts --drive)
