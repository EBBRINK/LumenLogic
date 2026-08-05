// MEET EERST, BOUW DAARNA. Twee kandidaat-signalen voor de LDC-407-leesfout:
//
//   "CLS LDC-407 W-DMX 1-4 kanaals 700mA LED driver"  →  maxWattage = 407
//
// (a) TYPECODE MET KOPPELTEKEN — een letter, een koppelteken en dan het getal (`LDC-407 W`).
//     De bestaande regel eist een letter DIRECT vóór het getal (`PAR16 W`) en mist dit dus.
// (b) DE W HOORT BIJ HET VOLGENDE WOORD — `W-DMX`, `W-W`. Een W met een koppelteken en letters
//     erachter is geen eenheid maar het eerste teken van een samenstelling.
//
// Dit script telt per signaal hoeveel LANDENDE wattages eronder vallen en toont voorbeelden, zodat
// zichtbaar is wat een regel zou KOSTEN aan goede waarden voordat hij bestaat.
//
//   bun --env-file=<pad>/.env.branch scripts/meet-valse-watt-vormen.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

// (a) letter + koppelteken + getal, gevolgd door een LOSSE W (spatie ertussen).
const TYPECODE_KOPPEL = /[A-Za-z]-\d+(?:[.,]\d+)?\s+W\b/;
// (b) een W die met een koppelteken aan letters vastzit.
const W_SAMENSTELLING = /\d\s*W-[A-Za-z]/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, w: products.maxWattage })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const groepen: Array<[string, RegExp]> = [
    ["(a) typecode met koppelteken  LDC-407 W", TYPECODE_KOPPEL],
    ["(b) W aan het volgende woord  W-DMX/W-W", W_SAMENSTELLING],
  ];

  for (const [label, re] of groepen) {
    const raak = rijen.filter((r) => re.test(r.naam ?? ""));
    // Landend = de parser levert een wattage, de kolom is leeg, en niets anders weert het al.
    const landend: typeof raak = [];
    for (const r of raak) {
      const naam = r.naam ?? "";
      const p = parseProductName(naam);
      if (p.maxWattage == null) continue;
      if (r.w != null && String(r.w).trim() !== "") continue;
      const s = verdenkingen(naam, p).map((x) => x.soort);
      if (s.some((x) => ONDERDRUKKENDE_VERDENKINGEN.has(x as never))) continue;
      landend.push(r);
    }
    const perMerk = new Map<string, number>();
    for (const r of landend) perMerk.set(r.merk ?? "?", (perMerk.get(r.merk ?? "?") ?? 0) + 1);
    console.log(`\n${label}`);
    console.log(`  namen met deze vorm : ${raak.length}`);
    console.log(`  waarvan LANDEND     : ${landend.length}`);
    console.log(`  per merk            : ${[...perMerk].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
    for (const r of landend.slice(0, 8)) {
      console.log(`      ${String(parseProductName(r.naam ?? "").maxWattage).padStart(5)} W  ←  ${(r.naam ?? "").slice(0, 66)}`);
    }
  }

  // ── Vóór en ná ────────────────────────────────────────────────────────────
  // Dit script ziet alleen de code zoals hij NU is; "vóór" kan het niet nabootsen zonder de
  // oude parser ernaast te draaien. Een eerste poging deed dat met een regex-benadering en gaf
  // zeven "verdwenen" namen — waarvan er zes al vóór de reparatie zwegen (`PAR16 W-W max. 2x12W`
  // valt onder de maal-vorm, `1.0 W-G` onder de decimale typemaat). Die telling was dus fout in
  // de veilige richting, maar fout.
  //
  // De exacte methode is dom en betrouwbaar: dump per product wat er landt, stash de wijziging,
  // dump opnieuw, en diff. Uitgevoerd op 31 jul over alle 211.317 producten:
  //
  //     verschillen: 2   — en precies de twee die Timo aanwees
  //     CLS LDC-407 W-DMX …                                407 → niets
  //     Meerprijs Casambi … (Enkel voor de 37 Watt)          37 → niets
  //
  // Nul goede waarden geraakt.
  let naLandend = 0;
  for (const r of rijen) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    if (p.maxWattage == null) continue;
    if (r.w != null && String(r.w).trim() !== "") continue;
    const s2 = verdenkingen(naam, p).map((x) => x.soort);
    if (s2.some((x) => ONDERDRUKKENDE_VERDENKINGEN.has(x as never))) continue;
    naLandend++;
  }
  console.log(`\nlandende maxWattage-voorstellen met de huidige code: ${naLandend}`);

  // De toeslagregel: "(Enkel voor de 37 Watt)" verwijst naar een ánder artikel.
  const TOESLAG = /\b(?:meerprijs|toeslag|surcharge|supplement)\b/i;
  const VOOR_DE = /\b(?:enkel |alleen )?voor de\s+\d+/i;
  const t = rijen.filter((r) => TOESLAG.test(r.naam ?? ""));
  const tLandend = t.filter((r) => {
    const p = parseProductName(r.naam ?? "");
    return p.maxWattage != null && (r.w == null || String(r.w).trim() === "");
  });
  console.log(`\n(c) toeslagregels  "Meerprijs …"`);
  console.log(`  namen met een toeslagwoord : ${t.length}`);
  console.log(`  waarvan met een wattage    : ${tLandend.length}`);
  console.log(`  waarvan óók "voor de <n>"  : ${tLandend.filter((r) => VOOR_DE.test(r.naam ?? "")).length}`);
  for (const r of tLandend.slice(0, 8)) console.log(`      ${(r.naam ?? "").slice(0, 74)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
