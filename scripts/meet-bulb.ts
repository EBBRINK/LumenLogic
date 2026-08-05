// TossB-scherf 1 wees "LED bulb AR70 8W" af: een losse lamp die de poort passeerde. Maar de
// Kreon-agent noemde eerder "sphere bulb" als GLASVORM van een complete pendel. Zelfde woord,
// twee rollen — dus eerst meten waar het staat voor er een regel bij komt.
//   bun --env-file=.env.branch scripts/meet-bulb.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const BULB = /\bbulbs?\b/i;
const LED_BULB = /\b(?:led|halogen|hal\.)\s+bulbs?\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => BULB.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; ledBulb: number; door: string[] }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, ledBulb: 0, door: [] };
    e.n++;
    if (LED_BULB.test(naam)) e.ledBulb++;
    const heeftWaarde = p.maxWattage != null || p.kelvin != null || p.cri != null;
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (heeftWaarde && !s.includes("product-is-onderdeel")) e.door.push(naam);
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`"bulb" in de naam: ${raak.length} van ${rijen.length}`);
  let door = 0, ledBulb = 0;
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(22)} ${String(e.n).padStart(4)}  waarvan "led bulb" ${String(e.ledBulb).padStart(4)}  door de poort met waarde: ${e.door.length}`);
    for (const d of e.door.slice(0, 3)) console.log(`      ${d}`);
    door += e.door.length; ledBulb += e.ledBulb;
  }
  console.log(`\ntotaal door de poort: ${door} · waarvan de vorm "led/halogen bulb": ${ledBulb}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
