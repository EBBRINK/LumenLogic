// MEET EERST. Twee producten kregen een vermogen uit hun TYPENAAM:
//
//   Molla Vetri Componi200W  →  200 W   (een glasveer verbruikt niets)
//   Molla Vetri Componi75W   →   75 W
//
// De vorm is <letters><cijfers>W met de W VAST aan het getal. Precies die vorm is op 30 juli
// bewust als legitiem aangemerkt — "F13W, F36W, Componi200W (12 gevallen): daar zit de W vast
// aan het getal, en dan is hij wél de eenheid" — dus de vraag is of die 12 nog steeds kloppen
// en of er een familie achter zit of maar twee uitzonderingen.
//
//   bun --env-file=<pad>/.env.branch scripts/meet-vastgeplakte-typenaam.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

// letters, dan cijfers, dan direct W — zonder spatie ertussen.
const VAST = /[A-Za-z]{2,}\d+(?:[.,]\d+)?W\b/;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, w: products.maxWattage })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => VAST.test(r.naam ?? ""));
  console.log(`namen met <letters><cijfers>W (W vast aan het getal): ${raak.length}\n`);
  const perMerk = new Map<string, { n: number; landend: number; vormen: Map<string, number> }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, landend: 0, vormen: new Map() };
    e.n++;
    const treffer = naam.match(VAST)![0];
    const vorm = treffer.replace(/\d+(?:[.,]\d+)?/, "#");
    e.vormen.set(vorm, (e.vormen.get(vorm) ?? 0) + 1);
    const leeg = r.w == null || String(r.w).trim() === "";
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (p.maxWattage != null && leeg && !s.some((x) => ONDERDRUKKENDE_VERDENKINGEN.has(x as never))) e.landend++;
    perMerk.set(r.merk ?? "?", e);
  }
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(20)} ${String(e.n).padStart(4)} namen · ${e.landend} landend`);
    for (const [v, n] of [...e.vormen].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${v}  ×${n}`);
  }
  console.log(`\nalle namen:`);
  for (const r of raak.slice(0, 30)) {
    const p = parseProductName(r.naam ?? "");
    console.log(`  ${String(p.maxWattage).padStart(6)} W  ${r.merk} · ${(r.naam ?? "").slice(0, 62)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
