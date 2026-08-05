// B's bezwaar: één slechte waarde doodt 500 goede updates in één UPDATE ... FROM (VALUES ...).
// Vraag: hoeveel van de LANDENDE voorstellen zou vandaag door een kolomtype heen breken?
// Getoetst tegen de ECHTE kolomtypes uit db/schema.ts, met de OUDE toColumnValue-semantiek
// (integer-velden parseInt; al het andere string-passthrough).
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
// De harde grenzen van de kolomtypes (db/schema.ts:274-280)
const GRENS: Record<string, (v: string) => string | null> = {
  kelvin: v => Number.isNaN(parseInt(v,10)) ? null : (Math.abs(parseInt(v,10)) > 2147483647 ? "integer-overflow" : null),
  lumenOutput: v => Number.isNaN(parseInt(v,10)) ? null : (Math.abs(parseInt(v,10)) > 2147483647 ? "integer-overflow" : null),
  cri: v => Number.isNaN(parseInt(v,10)) ? null : (Math.abs(parseInt(v,10)) > 32767 ? "smallint-overflow" : null),
  // OUDE semantiek: string gaat ongewijzigd naar een numeric-kolom
  maxWattage: v => !Number.isFinite(Number(v)) ? "niet-numeriek" : (Math.abs(Number(v)) >= 1e6 ? "numeric(8,2)-overflow" : null),
  beamAngle: v => !Number.isFinite(Number(v)) ? "niet-numeriek" : (Math.abs(Number(v)) >= 1e4 ? "numeric(6,2)-overflow" : null),
  ipValue: () => null,   // text
  dimmable: () => null,  // text
};

const rows = ((await db.execute(sql`
  select p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p`)).rows ?? []) as any[];
let landend = 0; const stuk: Record<string, number> = {}; const vb: string[] = [];
const uiterste: Record<string, number> = {};
for (const r of rows) {
  const s = parseProductName(r.name ?? "");
  for (const f of FIELDS) {
    if (s[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    landend++;
    const waarde = String(s[f]);
    const n = Number(waarde);
    if (Number.isFinite(n)) uiterste[f] = Math.max(uiterste[f] ?? 0, Math.abs(n));
    const fout = GRENS[f](waarde);
    if (fout) { const k = `${f}:${fout}`; stuk[k] = (stuk[k]??0)+1; if (vb.length<5) vb.push(`${r.name.slice(0,70)} → ${f}="${waarde}"`); }
  }
}
console.log(`\nlandende voorstellen (ronde 3, hele catalogus): ${landend}`);
console.log(`voorstellen die op een kolomtype zouden BREKEN : ${Object.values(stuk).reduce((a,b)=>a+b,0)}`);
console.log(Object.keys(stuk).length ? stuk : "  (geen enkele)");
console.log(`\ngrootste waarde per veld (marge tot de typegrens):`);
for (const [f,v] of Object.entries(uiterste)) console.log(`  ${f.padEnd(12)} max ${v}`);
if (vb.length) { console.log(`\nvoorbeelden:`); for (const v of vb) console.log("  " + v); }
