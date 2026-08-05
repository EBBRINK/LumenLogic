// Wat weert de voorstelpoort werkelijk, catalogusbreed? Simuleert startEnrichmentRun.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");
const { ONDERDRUKKENDE_VERDENKINGEN } = await import("@/lib/repo/enrichment");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

let voor = 0, na = 0; const reden: Record<string, number> = {}; const perMerk: Record<string, number> = {};
for (const r of rows) {
  const specs = parseProductName(r.name ?? "");
  const vl = verdenkingen(r.name ?? "", specs);
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    voor++;
    const blok = vl.find(x => x.veld === f && ONDERDRUKKENDE_VERDENKINGEN.has(x.soort));
    if (blok) { reden[`${f}:${blok.soort}`] = (reden[`${f}:${blok.soort}`]??0)+1; perMerk[r.merk]=(perMerk[r.merk]??0)+1; }
    else na++;
  }
}
console.log(`\nlandende voorstellen ZONDER voorstelpoort : ${voor}`);
console.log(`landende voorstellen MET voorstelpoort    : ${na}`);
console.log(`geweerd                                   : ${voor-na} (${(100*(voor-na)/voor).toFixed(2)}%)\n`);
console.log("per reden:");
for (const [k,v] of Object.entries(reden).sort((a,b)=>b[1]-a[1])) console.log(`  ${k.padEnd(30)} ${v}`);
console.log("\nper merk:");
for (const [k,v] of Object.entries(perMerk).sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${k.padEnd(24)} ${v}`);
