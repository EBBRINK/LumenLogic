// Verificatie van de twee cijfers waarop de plankeuze draait (fase 2). STRIKT READ-ONLY.
//
//   bun --env-file=.env.branch scripts/xal-cri-tokens.ts
//
// 1. Uit wélke letterlijke tokens komen de 13.407 CRI-waarden? Is die verzameling klein en
//    plausibel, dan is het risico op een systematische leesfout bij inspectie te sluiten —
//    en dat is relevant omdat de 73.804-validatie CRI juist NIET dekt (nul gevulde
//    cri-kolommen bij XAL = nul onafhankelijke toetsen op precies dit veld).
// 2. Hoeveel nameShapes dragen méér dan één CRI-waarde? nameShape maakt van elk cijfer een '#',
//    dus 'CRI90' en 'CRI80' vallen in dezelfde vorm. Dat bepaalt of een 'fout'-oordeel de hele
//    groep mág verwerpen: als één vorm meerdere waarden draagt, veegt groepsverwerping ook
//    correcte waarden weg.

import { eq, ilike } from "drizzle-orm";
import { brands, products } from "@/db/schema";
import { parseProductName } from "@/lib/enrichment/parser";
import { nameShape } from "@/lib/repo/enrichment";
import { assertBranchDb, logGuard } from "./branch-guard";

// Hetzelfde patroon als de parser (parser.ts:44), zodat we het token zien dat de waarde opleverde.
const CRI_RE = /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*(\d{2,3})/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");

  const [merk] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(ilike(brands.name, "%XAL%"));

  const rijen = await db
    .select({ name: products.name, cri: products.cri, dimmable: products.dimmable })
    .from(products)
    .where(eq(products.brandId, merk.id));

  const tokens = new Map<string, number>();
  const waarden = new Map<number, number>();
  const vormWaarden = new Map<string, Set<number>>();
  const vormItems = new Map<string, number>();
  const dimLandt = new Map<string, number>();
  const dimAlGevuld = new Map<string, number>();

  for (const r of rijen) {
    const specs = parseProductName(r.name);
    if (specs.cri !== undefined) {
      const m = CRI_RE.exec(r.name);
      if (m) tokens.set(m[0], (tokens.get(m[0]) ?? 0) + 1);
      waarden.set(specs.cri, (waarden.get(specs.cri) ?? 0) + 1);
      const vorm = nameShape(r.name);
      if (!vormWaarden.has(vorm)) vormWaarden.set(vorm, new Set());
      vormWaarden.get(vorm)!.add(specs.cri);
      vormItems.set(vorm, (vormItems.get(vorm) ?? 0) + 1);
    }
    if (specs.dimmable !== undefined) {
      const leeg = r.dimmable == null || r.dimmable === "";
      const doel = leeg ? dimLandt : dimAlGevuld;
      doel.set(specs.dimmable, (doel.get(specs.dimmable) ?? 0) + 1);
    }
  }

  const totaal = [...waarden.values()].reduce((a, b) => a + b, 0);
  console.log(`\n── CRI-tokens bij ${merk.name} (${totaal} voorstellen) ──`);
  for (const [t, n] of [...tokens].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${t}"`.padEnd(16) + `${String(n).padStart(6)}`);
  }
  console.log(`  waarden: ${[...waarden].sort((a, b) => a[0] - b[0]).map(([w, n]) => `${w}×${n}`).join(" · ")}`);
  const buitenBereik = [...waarden.keys()].filter((w) => w < 70 || w > 100);
  console.log(`  implausibel (<70 of >100): ${buitenBereik.length === 0 ? "geen" : buitenBereik.join(", ")}`);

  const gemengd = [...vormWaarden].filter(([, s]) => s.size > 1);
  const gemengdeItems = gemengd.reduce((a, [v]) => a + (vormItems.get(v) ?? 0), 0);
  console.log(`\n── nameShape-collisies (bepaalt of groepsverwerping mag) ──`);
  console.log(`  vormen met CRI: ${vormWaarden.size}`);
  console.log(
    `  vormen met MEER DAN ÉÉN CRI-waarde: ${gemengd.length}` +
      ` → ${gemengdeItems} items (${((100 * gemengdeItems) / totaal).toFixed(1)}% van het CRI-volume)`,
  );
  for (const [v, s] of gemengd.sort((a, b) => (vormItems.get(b[0]) ?? 0) - (vormItems.get(a[0]) ?? 0)).slice(0, 5)) {
    console.log(`    ${vormItems.get(v)}× [${[...s].sort().join(", ")}] ${v.slice(0, 70)}`);
  }

  console.log(`\n── dimbaarheid ──`);
  console.log(`  landt op lege kolom: ${[...dimLandt].map(([w, n]) => `${w}×${n}`).join(" · ") || "niets"}`);
  console.log(`  valt op gevulde kolom: ${[...dimAlGevuld].map(([w, n]) => `${w}×${n}`).join(" · ") || "niets"}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
