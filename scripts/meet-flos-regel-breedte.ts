// Wat doet de NIEUWE korte-kleurcode-regel catalogusbreed — met de ECHTE parser en de ECHTE
// voorstelpoort, niet met een losse regex.
//
// LANDEND = de naam levert een waarde op, de kolom is nog leeg, en geen onderdrukkende
// verdenking houdt het voorstel tegen. Alleen dát aantal beweegt echt.
//
//   bun --env-file=.env.branch scripts/meet-flos-regel-breedte.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName, kelvinKandidaten, criKandidaten } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

const MERK = "Flos Architectural";
// De lange vorm, die de parser vóór 4 aug al kon. Draagt een naam die, dan is de nieuwe regel
// niet de reden dat er iets landt.
const LANG = /(?<![\d.,])\d{3,5}\s*K\b/i;
const GELABELD = /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*\d{2,3}/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, kelvin: products.kelvin, cri: products.cri })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(isNotNull(products.name));
  console.log(`catalogus: ${rijen.length} producten\n${"═".repeat(74)}`);

  const leeg = (v: unknown) => v == null || String(v).trim() === "";
  type Vak = { landend: number; geweerd: number; vb: string[]; waarden: Map<string, number> };
  const nieuw = new Map<string, { kelvin: Vak; cri: Vak }>();
  const vak = (): Vak => ({ landend: 0, geweerd: 0, vb: [], waarden: new Map() });

  for (const r of rijen) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const vl = verdenkingen(naam, p);
    if (!nieuw.has(r.merk ?? "?")) nieuw.set(r.merk ?? "?", { kelvin: vak(), cri: vak() });
    const bak = nieuw.get(r.merk ?? "?")!;

    for (const veld of ["kelvin", "cri"] as const) {
      const waarde = p[veld];
      if (waarde === undefined) continue;
      // Alleen tellen wat de NIEUWE regel voortbracht: de oude vorm stond er niet.
      const oudeVormAanwezig = veld === "kelvin" ? LANG.test(naam) : GELABELD.test(naam);
      if (oudeVormAanwezig) continue;
      if (!leeg(r[veld])) continue; // kolom al gevuld → kan nooit landen
      const geblokkeerd = vl.some((x) => x.veld === veld && ONDERDRUKKENDE_VERDENKINGEN.has(x.soort));
      const v = bak[veld];
      if (geblokkeerd) { v.geweerd++; continue; }
      v.landend++;
      v.waarden.set(String(waarde), (v.waarden.get(String(waarde)) ?? 0) + 1);
      if (v.vb.length < 6) v.vb.push(`${naam} → ${veld} wordt ${waarde}`);
    }
  }

  const toon = (titel: string, kies: (m: string) => boolean) => {
    console.log(`\n${titel}`);
    let tk = 0, tc = 0;
    for (const [merk, b] of [...nieuw].sort((a, x) => (x[1].kelvin.landend + x[1].cri.landend) - (a[1].kelvin.landend + a[1].cri.landend))) {
      if (!kies(merk)) continue;
      if (!b.kelvin.landend && !b.cri.landend && !b.kelvin.geweerd && !b.cri.geweerd) continue;
      console.log(`  ${merk}`);
      console.log(`     kelvin: ${String(b.kelvin.landend).padStart(6)} landend, ${b.kelvin.geweerd} geweerd   waarden: ${[...b.kelvin.waarden].sort((a, x) => x[1] - a[1]).map(([w, n]) => `${w}×${n}`).join(" ")}`);
      for (const v of b.kelvin.vb.slice(0, 3)) console.log(`         ${v}`);
      console.log(`     cri   : ${String(b.cri.landend).padStart(6)} landend, ${b.cri.geweerd} geweerd   waarden: ${[...b.cri.waarden].sort((a, x) => x[1] - a[1]).map(([w, n]) => `${w}×${n}`).join(" ")}`);
      for (const v of b.cri.vb.slice(0, 3)) console.log(`         ${v}`);
      tk += b.kelvin.landend; tc += b.cri.landend;
    }
    console.log(`     ── totaal: kelvin ${tk} · cri ${tc}`);
  };

  toon("A — Flos Architectural (het doel van deze regel)", (m) => m === MERK);
  toon("B — ALLE ANDERE MERKEN (de nevenwerking)", (m) => m !== MERK);
}
main().catch((e) => { console.error(e); process.exit(1); });
