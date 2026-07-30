// Scherf 4 gaf 131 van de 199 cellen als losse lamp: ToLEDo, RefLED, Performer, Avant, NEOS —
// hele retrofitlijnen. Hoe groot is dat deel van Sylvania werkelijk, en raken die familienamen
// andere merken?
//   bun --env-file=.env.branch scripts/meet-sylvania-breed.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const LAMPFAMILIES =
  /\b(?:toledo|refled|ref\.?led|performer|avant|neos|lynx|luxline|blacklight|circline|hi-?pin|hi-?spot)\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({
      merk: brands.name, naam: products.name,
      cri: products.cri, kelvin: products.kelvin, maxWattage: products.maxWattage,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => LAMPFAMILIES.test(r.naam ?? ""));
  const perMerk = new Map<string, number>();
  for (const r of raak) perMerk.set(r.merk ?? "?", (perMerk.get(r.merk ?? "?") ?? 0) + 1);
  console.log(`namen met een Sylvania-lampfamilie: ${raak.length}`);
  console.log(`  ${[...perMerk].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);

  // Hoeveel LANDENDE voorstellen zitten hierachter, en hoeveel bij Sylvania in totaal?
  const telVoorstellen = (rij: typeof rijen) => {
    let n = 0;
    for (const r of rij) {
      const naam = r.naam ?? "";
      const p = parseProductName(naam);
      const s = new Set(verdenkingen(naam, p).map((x) => x.soort));
      if (s.has("product-is-onderdeel")) continue;
      for (const veld of ["cri", "kelvin", "maxWattage"] as const) {
        const leeg = r[veld] == null || String(r[veld]).trim() === "";
        if (p[veld] != null && leeg) n++;
      }
    }
    return n;
  };
  const syl = rijen.filter((r) => r.merk === "Sylvania");
  const sylLamp = syl.filter((r) => LAMPFAMILIES.test(r.naam ?? ""));
  console.log(`\nSylvania: ${syl.length} producten, indicatie ${telVoorstellen(syl)} voorstellen`);
  console.log(`  waarvan lampfamilie: ${sylLamp.length} producten, indicatie ${telVoorstellen(sylLamp)} voorstellen`);
  const anders = raak.filter((r) => r.merk !== "Sylvania");
  console.log(`\n  bij ANDERE merken raakt deze regex ${anders.length} namen:`);
  for (const r of [...new Map(anders.map((r) => [r.merk + (r.naam ?? "").slice(0, 10), r])).values()].slice(0, 10))
    console.log(`      ${r.merk} · ${(r.naam ?? "").slice(0, 72)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
