// Wat garandeert de steekproef van 100 nog bij een groot merk? pickSampleIndices
// stratificeert op `veld|nameShape` en kapt op SAMPLE_MAX over de HELE run. Zijn er meer
// strata dan plekken, dan valt hij in de tak waar elke vorm hooguit één rij krijgt — en dan
// is "100 rijen" een andere garantie dan bij een klein merk.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const merk = process.argv[2] ?? "Wever & Ducré";
const velden = (process.argv[3] ?? "cri,kelvin,maxWattage").split(",");
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");
const { ONDERDRUKKENDE_VERDENKINGEN, nameShape } = await import("@/lib/repo/enrichment");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id where b.name=${merk}`)).rows ?? []) as any[];

const strata = new Set<string>(), cellen = new Set<string>();
const perVeld: Record<string, {landt:number; strata:Set<string>; cellen:Set<string>}> = {};
let onderdeel = 0, geweerd = 0;
for (const r of rows) {
  const specs = parseProductName(r.name ?? "");
  const vl = verdenkingen(r.name ?? "", specs);
  if (vl.some((v) => v.soort === "product-is-onderdeel")) onderdeel++;
  for (const f of FIELDS) {
    if (!velden.includes(f) || specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    if (vl.some((v) => v.veld === f && ONDERDRUKKENDE_VERDENKINGEN.has(v.soort))) { geweerd++; continue; }
    const e = perVeld[f] ??= {landt:0, strata:new Set(), cellen:new Set()};
    e.landt++;
    const st = `${f}|${nameShape(r.name)}`; strata.add(st); e.strata.add(st);
    const ce = `${st}|${specs[f]}`; cellen.add(ce); e.cellen.add(ce);
  }
}
console.log(`\n${merk} · ${rows.length} producten · velden ${velden.join(", ")}`);
console.log(`  producten die het anker als ONDERDEEL ziet : ${onderdeel}`);
console.log(`  voorstellen geweerd door de voorstelpoort  : ${geweerd}\n`);
console.log("veld".padEnd(13) + "landt".padStart(8) + "strata".padStart(9) + "cellen".padStart(9) + "   steekproef dekt");
for (const f of velden) { const e = perVeld[f]; if (!e) continue;
  console.log(f.padEnd(13) + String(e.landt).padStart(8) + String(e.strata.size).padStart(9) + String(e.cellen.size).padStart(9)); }
console.log("\nGECOMBINEERD (drie velden in één run):");
console.log(`  landende voorstellen : ${Object.values(perVeld).reduce((a,b)=>a+b.landt,0)}`);
console.log(`  distincte strata     : ${strata.size}   ← pickSampleIndices verdeelt 100 plekken hierover`);
console.log(`  distincte cellen     : ${cellen.size}   ← dit is wat de zwerm beoordeelt`);
console.log(`\n  ${strata.size > 100 ? "MEER strata dan plekken: elke gekozen vorm krijgt precies ÉÉN rij, en "
  + (strata.size-100) + " vormen komen NIET in de steekproef." : "minder strata dan plekken: elke vorm komt aan de beurt."}`);
console.log(`  steekproefdekking: 100 van ${Object.values(perVeld).reduce((a,b)=>a+b.landt,0)} voorstellen (${(100*100/Object.values(perVeld).reduce((a,b)=>a+b.landt,0)).toFixed(2)}%)`);
