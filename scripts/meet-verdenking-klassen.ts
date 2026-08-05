// Welke verdenkingen zijn "aantoonbaar fout" (onderdrukken) en welke alleen "kijk hier even"
// (registreren)? Onderdrukken is onomkeerbaar in zijn effect: een onderdrukt voorstel vult de
// kolom niet, en een latere bron kan er dan wél in — maar als de verdenking een valse positief
// was, gooien we een goede waarde weg. Dus eerst tellen, dan besluiten.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const perSoort = new Map<string, {n:number; merken:Map<string,number>; vb:string[]}>();
let landend = 0;
for (const r of rows) {
  const specs = parseProductName(r.name ?? "");
  const vl = verdenkingen(r.name ?? "", specs);
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    landend++;
    for (const v of vl.filter(v => v.veld === f)) {
      const e = perSoort.get(v.soort) ?? {n:0, merken:new Map<string,number>(), vb:[] as string[]};
      e.n++; e.merken.set(r.merk, (e.merken.get(r.merk)??0)+1);
      if (e.vb.length < 3) e.vb.push(`${f}: ${String(r.name).slice(0,76)}`);
      perSoort.set(v.soort, e);
    }
  }
}
console.log(`\nlandende voorstellen: ${landend}\n`);
console.log("soort".padEnd(24) + "landend".padStart(8) + "  top-merken");
for (const [soort, e] of [...perSoort].sort((a,b)=>b[1].n-a[1].n)) {
  const top = [...e.merken].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([m,c])=>`${m} ${c}`).join(" · ");
  console.log(soort.padEnd(24) + String(e.n).padStart(8) + "  " + top);
  for (const v of e.vb) console.log("        " + v);
}
