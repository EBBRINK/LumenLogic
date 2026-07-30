// Estiluz' twee cellen heten "Kit recambio led volta 3000k" en "Replacement led volta 2700k" —
// reserve-LED-modules, geen armaturen. Meten of die woorden scherp af te bakenen zijn.
//   bun --env-file=.env.branch scripts/meet-vervanging.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const TERMEN = /\b(?:recambio|replacement|vervang(?:ing|end)?|ricambio|ersatz)\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => TERMEN.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; door: string[] }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, door: [] };
    e.n++;
    const heeftWaarde = p.maxWattage != null || p.kelvin != null || p.cri != null;
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (heeftWaarde && !s.includes("product-is-onderdeel")) e.door.push(naam);
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`"recambio/replacement/vervang…" in de naam: ${raak.length} van ${rijen.length}`);
  let door = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(4)}  door de poort met een waarde: ${e.door.length}`);
    for (const d of e.door.slice(0, 4)) console.log(`      ${d.slice(0, 80)}`);
    door += e.door.length;
  }
  console.log(`\ntotaal door de poort: ${door}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
