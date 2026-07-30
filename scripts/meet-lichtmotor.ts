// Hoeveel producten heten "light engine" / "led engine", en waar staat die term in de naam?
// De Kreon-zwerm keurde drie cellen af omdat het product zélf de lichtbron is. Voor de WAARDE
// maakt dat niets uit (de cri is een echte eigenschap van de motor); de vraag is of zo'n product
// als armatuur mag meedoen — en dat is de matcher, niet de parser. Meten vóór een regel.
//   bun --env-file=.env.branch scripts/meet-lichtmotor.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const MOTOR = /\b(?:light|led)\s+engine\b/i;
const VOORAAN = /^\s*(?:light|led)\s+engine\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => MOTOR.test(r.naam ?? ""));
  const perMerk = new Map<string, { n: number; v: number; voorbeeld: string }>();
  for (const r of raak) {
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, v: 0, voorbeeld: r.naam ?? "" };
    e.n++;
    if (VOORAAN.test(r.naam ?? "")) e.v++;
    perMerk.set(r.merk ?? "?", e);
  }
  console.log(`"light/led engine" in de naam: ${raak.length} van ${rijen.length}`);
  console.log(`  waarvan VOORAAN in de naam : ${raak.filter((r) => VOORAAN.test(r.naam ?? "")).length}`);
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(24)} ${String(e.n).padStart(5)}  vooraan ${String(e.v).padStart(5)}`);
    console.log(`      ${e.voorbeeld}`);
  }
  const midden = raak.filter((r) => !VOORAAN.test(r.naam ?? ""));
  if (midden.length) {
    console.log(`\n  niet-vooraan (${midden.length}) — hier zou een grove regel toeslaan:`);
    for (const r of midden.slice(0, 12)) console.log(`      ${r.merk} · ${r.naam}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
