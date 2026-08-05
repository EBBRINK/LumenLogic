// Scherpere telling van de drie naam-parser-defecten: niet "krijgt een voorstel" maar
// "zou LANDEN" (lege kolom) — dat is het getal dat schade beschrijft.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { parseProductName } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin, p.max_wattage, p.dimmable from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];
const leeg = (v: any) => v == null || v === "";

const NIET_DIM = /\b(?:non|not)[- ]?dimmable\b|\bniet[- ]dimbaar\b|\bnon[- ]?dim\b|\bnd\b(?![a-z])/i;
const NON_DIM_STRIKT = /\bNON[\s-]?DIM\b/i;
const KORT_K = /\b\d[.,]\d\s*K\b/i;

let dimNaam=0, dimVoorstel=0, dimLandt=0, strikt=0, striktLandt=0, kNaam=0, kLandt=0;
for (const r of rows) {
  const n = r.name ?? ""; const s = parseProductName(n);
  if (NIET_DIM.test(n)) { dimNaam++; if (s.dimmable !== undefined) { dimVoorstel++; if (leeg(r.dimmable)) dimLandt++; } }
  if (NON_DIM_STRIKT.test(n)) { strikt++; if (s.dimmable !== undefined && leeg(r.dimmable)) striktLandt++; }
  if (KORT_K.test(n)) { kNaam++; if (leeg(r.kelvin)) kLandt++; }
}
console.log(`\nDEFECT 1 — kelvin als "2.7K"`);
console.log(`  namen: ${kNaam} · parser leest er 0 · zou landen op lege kolom: ${kLandt} (gemiste winst)`);
console.log(`\nDEFECT 2 — naam zegt niet-dimbaar`);
console.log(`  brede regex : ${dimNaam} namen · ${dimVoorstel} voorstellen · ${dimLandt} LANDEN`);
console.log(`  strikt "NON DIM": ${strikt} namen · ${striktLandt} LANDEN`);
