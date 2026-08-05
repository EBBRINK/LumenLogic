// Was Flos Architectural representatief als repetitiemerk, of juist het vuilste?
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const TERMEN = [/\bPOW(?:ER)?\.?\s*SUPPLY\b/i, /\bALIM(?:ENT|T)?\.?\s*LED\b/i, /^(?:LED\s+)?DRIVER\b/i,
  /\bREMOTE\s+KIT\b/i, /\bEQUIPO\b/i, /\bTRANSF?(?:ORMATOR|ORMER)?\b/i, /\bALIMENTATOR\w*\b/i,
  /\b(?:CONVERTER|TRAFO|NETZTEIL)\b/i];
const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];
const per: Record<string, {landend:number; vuil:number; watt:number; wattVuil:number}> = {};
for (const r of rows) {
  const e = per[r.merk] ??= {landend:0, vuil:0, watt:0, wattVuil:0};
  const vuil = TERMEN.some(re => re.test(r.name ?? ""));
  const specs = parseProductName(r.name ?? "");
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    e.landend++; if (vuil) e.vuil++;
    if (f === "maxWattage") { e.watt++; if (vuil) e.wattVuil++; }
  }
}
console.log("\nmerk".padEnd(24) + "landend".padStart(9) + "vuil".padStart(7) + "  %" + "     wattage".padStart(10) + "vuil%".padStart(8));
for (const [m,e] of Object.entries(per).sort((a,b)=>b[1].vuil-a[1].vuil).slice(0,12))
  console.log(m.padEnd(24) + String(e.landend).padStart(9) + String(e.vuil).padStart(7) +
    ("  " + (e.landend?(100*e.vuil/e.landend).toFixed(2):"0")+"%").padEnd(9) +
    String(e.watt).padStart(9) + ((e.watt?(100*e.wattVuil/e.watt).toFixed(2):"0")+"%").padStart(8));
