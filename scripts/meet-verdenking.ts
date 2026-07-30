// Hoe groot is het verdachte deel? STRIKT READ-ONLY.
//
//   bun --env-file=.env.branch scripts/meet-verdenking.ts [--merk=XAL] [--json]
//
// Zonder --merk loopt hij over de héle database (alle merken), want de schaalvraag gaat over
// 30 merken, niet over XAL alleen. Leest in blokken: 211k namen in één query is te veel voor
// de HTTP-driver (zie de insert-grens in lib/repo/enrichment.ts).
//
// Meet drie dingen per veld:
//   1. hoeveel voorstellen de parser levert, en hoeveel daarvan op een LEGE kolom landen
//      (alleen die worden ooit toegepast — publishRun overschrijft nooit);
//   2. hoeveel daarvan het deterministische voorfilter verdacht vindt, per faalvorm;
//   3. hoeveel naamvormen meerdere waarden dragen (daar zegt één oordeel niets over de rest).

import { asc, eq, ilike } from "drizzle-orm";
import { brands, products } from "@/db/schema";
import { FIELDS, parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen, vormenMetMeerdereWaarden } from "@/lib/enrichment/verdenking";
import { nameShape } from "@/lib/repo/enrichment";
import { assertBranchDb, logGuard } from "./branch-guard";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const merkArg = argv.find((a) => a.startsWith("--merk="))?.slice(7);
const BLOK = 20_000;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");

  let merkId: string | null = null;
  if (merkArg) {
    const [m] = await db.select({ id: brands.id }).from(brands).where(ilike(brands.name, `%${merkArg}%`));
    if (!m) throw new Error(`geen merk gevonden op '${merkArg}'`);
    merkId = m.id;
  }

  const voorstellen: Record<string, number> = {};
  const landt: Record<string, number> = {};
  const verdacht: Record<string, number> = {}; // veld → aantal LANDENDE voorstellen met ≥1 vlag
  const perSoort = new Map<string, number>(); // "veld:soort" → aantal
  const vormItems: { field: string; vorm: string; value: string }[] = [];
  const voorbeelden = new Map<string, string>(); // "veld:soort" → één naam
  for (const f of FIELDS) {
    voorstellen[f] = 0;
    landt[f] = 0;
    verdacht[f] = 0;
  }

  let offset = 0;
  let gezien = 0;
  for (;;) {
    const rijen = await db
      .select({
        name: products.name,
        cri: products.cri,
        kelvin: products.kelvin,
        ipValue: products.ipValue,
        maxWattage: products.maxWattage,
        lumenOutput: products.lumenOutput,
        beamAngle: products.beamAngle,
        dimmable: products.dimmable,
      })
      .from(products)
      .where(merkId ? eq(products.brandId, merkId) : undefined)
      .orderBy(asc(products.id))
      .limit(BLOK)
      .offset(offset);
    if (rijen.length === 0) break;
    gezien += rijen.length;

    for (const r of rijen) {
      const rec = r as unknown as Record<string, unknown>;
      const specs = parseProductName(r.name);
      const vlaggen = verdenkingen(r.name, specs);
      for (const f of FIELDS) {
        if (specs[f] === undefined) continue;
        voorstellen[f]++;
        const kolom = rec[f];
        const leeg = kolom == null || kolom === "";
        if (!leeg) continue; // valt af bij publiceren; telt niet mee voor de werklast
        landt[f]++;
        vormItems.push({ field: f, vorm: nameShape(r.name), value: String(specs[f]) });
        const eigen = vlaggen.filter((v) => v.veld === f);
        if (eigen.length > 0) verdacht[f]++;
        for (const v of eigen) {
          const k = `${v.veld}:${v.soort}`;
          perSoort.set(k, (perSoort.get(k) ?? 0) + 1);
          if (!voorbeelden.has(k)) voorbeelden.set(k, r.name);
        }
      }
    }

    offset += BLOK;
    if (!asJson) console.error(`  … ${gezien} producten gelezen`);
  }

  const gemengdeVormen = vormenMetMeerdereWaarden(vormItems);
  const gemengdeItems = vormItems.filter((i) => gemengdeVormen.has(`${i.field}|${i.vorm}`)).length;

  const totLandt = Object.values(landt).reduce((a, b) => a + b, 0);
  const totVerdacht = Object.values(verdacht).reduce((a, b) => a + b, 0);

  if (asJson) {
    console.log(JSON.stringify({ gezien, voorstellen, landt, verdacht, perSoort: Object.fromEntries(perSoort), gemengdeItems }, null, 2));
    return;
  }

  console.log(`\n── ${merkArg ?? "ALLE MERKEN"} · ${gezien} producten ─────────────────`);
  console.log(`veld            voorstellen    landt op lege   verdacht   %`);
  for (const f of FIELDS) {
    const pct = landt[f] > 0 ? ((100 * verdacht[f]) / landt[f]).toFixed(1) : "—";
    console.log(
      `${f.padEnd(15)}${String(voorstellen[f]).padStart(11)}${String(landt[f]).padStart(16)}` +
        `${String(verdacht[f]).padStart(11)}${String(pct).padStart(7)}`,
    );
  }
  console.log(
    `${"TOTAAL".padEnd(15)}${String(Object.values(voorstellen).reduce((a, b) => a + b, 0)).padStart(11)}` +
      `${String(totLandt).padStart(16)}${String(totVerdacht).padStart(11)}` +
      `${(totLandt > 0 ? ((100 * totVerdacht) / totLandt).toFixed(1) : "—").padStart(7)}`,
  );

  console.log(`\nper faalvorm (alleen landende voorstellen):`);
  for (const [k, n] of [...perSoort].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(34)} ${String(n).padStart(7)}   bv. ${voorbeelden.get(k)?.slice(0, 62)}`);
  }

  console.log(
    `\nnaamvormen met meerdere waarden: ${gemengdeVormen.size} vormen → ${gemengdeItems} items` +
      ` (${((100 * gemengdeItems) / Math.max(totLandt, 1)).toFixed(1)}% van wat landt)`,
  );
  console.log(
    `\nte controleren als je ALLES door agents haalt: ${totLandt} rijen` +
      `\nte controleren met voorfilter (verdacht ∪ gemengde vormen): ` +
      `${new Set([...vormItems.filter((i) => gemengdeVormen.has(`${i.field}|${i.vorm}`)).map((_, idx) => `g${idx}`)]).size + totVerdacht} rijen (bovengrens, overlap niet afgetrokken)\n`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
