// Twee zwerm-agents vonden bij Lombardo een cel "Driver Delta 3 155 W On/Off" met een
// maxWattage-voorstel. Het woord staat VOORAAN — dat hoort de voorstelpoort te weren. Meten
// hoeveel er doorheen komen en bij welke merken, vóór er iets aan de regel verandert.
//   bun --env-file=.env.branch scripts/meet-driver-vooraan.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const DRIVER_VOORAAN = /^\s*(?:driver|converter|voeding|alimentatore|trafo)\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => DRIVER_VOORAAN.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; lek: string[] }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const v = verdenkingen(naam, p).map((x) => x.soort);
    const heeftWaarde = p.maxWattage != null || p.kelvin != null || p.cri != null;
    const geweerd = v.includes("product-is-onderdeel");
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, lek: [] };
    e.n++;
    if (heeftWaarde && !geweerd) e.lek.push(`${naam}  [${v.join(",") || "geen verdenking"}]`);
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`namen die met driver/converter/voeding/trafo BEGINNEN: ${raak.length}`);
  let lek = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].lek.length - a[1].lek.length)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(5)}  komt door de poort: ${e.lek.length}`);
    for (const l of e.lek.slice(0, 4)) console.log(`      ${l}`);
    lek += e.lek.length;
  }
  console.log(`\ntotaal door de poort met een waarde: ${lek}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
