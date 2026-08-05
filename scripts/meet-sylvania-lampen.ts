// Sylvania-scherf 2 wees 34 van de 250 cellen af: LYNX/MINI-LYNX (CFL), LUXLINE (TL-buis) en
// RefLED (retrofit). Sylvania is van oorsprong lampenfabrikant, dus dit kan een groot deel van
// het merk zijn. Meten hoe groot, en of de familienamen elders in de catalogus voorkomen.
//   bun --env-file=.env.branch scripts/meet-sylvania-lampen.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const FAMILIES: Array<[string, RegExp]> = [
  ["LYNX / MINI-LYNX (CFL)", /\b(?:mini-?\s*)?lynx\b/i],
  ["LUXLINE (TL)", /\bluxline\b/i],
  ["RefLED (retrofit)", /\brefled\b/i],
  ["overige lampvormen", /\b(?:circline|blacklight|halogen(?:a|e)?|standard\s+lamp)\b/i],
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

  const alleRaak = new Set<string>();
  for (const [label, re] of FAMILIES) {
    const raak = rijen.filter((r) => re.test(r.naam ?? ""));
    const merken = new Map<string, number>();
    let door = 0;
    for (const r of raak) {
      merken.set(r.merk ?? "?", (merken.get(r.merk ?? "?") ?? 0) + 1);
      const naam = r.naam ?? "";
      const p = parseProductName(naam);
      if (p.maxWattage == null && p.kelvin == null && p.cri == null) continue;
      const s = verdenkingen(naam, p).map((x) => x.soort);
      if (!s.includes("product-is-onderdeel")) { door++; alleRaak.add(naam); }
    }
    console.log(`\n${label}: ${raak.length} namen · door de poort met een waarde: ${door}`);
    console.log(`  ${[...merken].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
    for (const r of raak.slice(0, 3)) console.log(`      ${r.merk} · ${(r.naam ?? "").slice(0, 74)}`);
  }
  console.log(`\nsamen uniek door de poort: ${alleRaak.size}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
