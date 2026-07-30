// Waar ligt nog werk? RUWE INDICATIE per merk — géén vervanger van `startEnrichmentRun`.
//
// ⚠ Dit script benadert de voorstelpoort met eigen code, en dat is precies de vorm die vandaag
// drie keer misging (zie het patroon "twee lagen die apart over hetzelfde oordelen" hierboven in
// HANDOVER.md). Nagemeten tegen de echte runs: Lombardo klopt exact (59.569), TossB scheelt 8,
// XAL 302, Kreon ~660, en bij TAL zegt dit script 164 terwijl de run NUL items oplevert. Gebruik
// dit dus alleen om te zien wáár nog iets zit; het aantal komt uit de run zelf.
//   bun --env-file=.env.branch scripts/meet-restant-merken.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

const VELDEN = ["cri", "kelvin", "maxWattage"] as const;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({
      merk: brands.name,
      naam: products.name,
      cri: products.cri,
      kelvin: products.kelvin,
      maxWattage: products.maxWattage,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const per = new Map<string, { producten: number; voorstellen: number }>();
  for (const r of rijen) {
    const e = per.get(r.merk ?? "?") ?? { producten: 0, voorstellen: 0 };
    e.producten++;
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const soorten = new Set(verdenkingen(naam, p).map((x) => x.soort));
    const onderdrukt = [...soorten].some((s) => ONDERDRUKKENDE_VERDENKINGEN.has(s as never));
    if (!onderdrukt) {
      for (const veld of VELDEN) {
        const nieuw = p[veld];
        const huidig = r[veld];
        const leeg = huidig == null || String(huidig).trim() === "";
        if (nieuw != null && leeg) e.voorstellen++;
      }
    }
    per.set(r.merk ?? "?", e);
  }
  const rij = [...per].sort((a, b) => b[1].voorstellen - a[1].voorstellen);
  console.log(`merk                     producten  voorstellen`);
  let tot = 0;
  for (const [merk, e] of rij) {
    console.log(`  ${merk.padEnd(24)} ${String(e.producten).padStart(7)}  ${String(e.voorstellen).padStart(8)}`);
    tot += e.voorstellen;
  }
  console.log(`  ${"TOTAAL".padEnd(24)} ${String(rijen.length).padStart(7)}  ${String(tot).padStart(8)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
