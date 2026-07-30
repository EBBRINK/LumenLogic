// De TossB-agent zag het: bij "TIBO Big Wall 8W+8W" pakt de parser 8, niet 16. De waarde staat
// letterlijk in de naam en beschrijft een echt kanaal, dus de zwerm noemt het terecht 'goed' —
// maar het armatuur verbruikt 16W en dat is wat een bestek vraagt. Meten hoe vaak dit voorkomt.
//   bun --env-file=.env.branch scripts/meet-meerkanaals.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";

const KANALEN = /(\d+(?:[.,]\d+)?)\s*W\s*\+\s*(\d+(?:[.,]\d+)?)\s*W/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => KANALEN.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; onder: number; vb: string[] }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const m = naam.match(KANALEN)!;
    const som = Number(m[1].replace(",", ".")) + Number(m[2].replace(",", "."));
    const w = parseProductName(naam).maxWattage;
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, onder: 0, vb: [] };
    e.n++;
    if (w != null && Math.abs(w - som) > 0.01) {
      e.onder++;
      if (e.vb.length < 3) e.vb.push(`${naam.slice(0, 70)} → ${w} W (som ${som})`);
    }
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`namen met "xW + yW": ${raak.length} van ${rijen.length}`);
  let onder = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(4)}  waarde ≠ som: ${e.onder}`);
    for (const v of e.vb) console.log(`      ${v}`);
    onder += e.onder;
  }
  console.log(`\ntotaal waar de opgeslagen waarde LAGER is dan het armatuur werkelijk trekt: ${onder}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
