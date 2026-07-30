import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const r0 = await db.execute(sql`
  select b.name merk, count(*) n, count(p.description) descr from brands b
  join products p on p.brand_id=b.id group by b.name having count(p.description) > 0 order by 3 desc`);
console.log("\n== ALLE merken met gevulde description"); console.table((r0.rows??r0) as any[]);

for (const merk of ["Sylvania","Nordlux","Marset"]) {
  const r = await db.execute(sql`
    select p.name, p.description from products p join brands b on b.id=p.brand_id
    where b.name=${merk} and p.description is not null order by p.name limit 6`);
  console.log(`\n== ${merk} — naam ⟂ description`);
  for (const x of ((r.rows??r) as any[])) console.log(`  naam : ${String(x.name).slice(0,88)}\n  descr: ${String(x.description).slice(0,150)}\n`);
}
// Wat zou de bestaande parser uit de DESCRIPTION halen (i.p.v. uit de naam)?
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.description, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id where p.description is not null`)).rows??[]) as any[];
const tel: Record<string,{naam:number;descr:number;extra:number}> = {};
for (const r of rows) {
  const t = tel[r.merk] ??= {naam:0,descr:0,extra:0};
  const uitNaam = parseProductName(r.name ?? ""), uitDescr = parseProductName(r.description ?? "");
  for (const f of FIELDS) {
    const leeg = r[KOL[f]] == null || r[KOL[f]] === "";
    if (!leeg) continue;
    if (uitNaam[f] !== undefined) t.naam++;
    if (uitDescr[f] !== undefined) { t.descr++; if (uitNaam[f] === undefined) t.extra++; }
  }
}
console.log("\n== veldvullingen op LEGE kolom: uit de naam vs uit de description");
console.table(Object.entries(tel).map(([merk,v])=>({merk, uit_naam:v.naam, uit_description:v.descr, EXTRA_door_description:v.extra})));
