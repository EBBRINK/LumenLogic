// Ronde 3: wat levert de bestaande naam-parser op een LEGE kolom, per merk, op de branch.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");

const rows = ((await db.execute(sql`
  select b.name as merk, p.name, p.kelvin, p.cri, p.ip_value, p.max_wattage,
         p.lumen_output, p.beam_angle, p.dimmable
  from products p join brands b on b.id = p.brand_id`)).rows ?? []) as any[];
console.log(`${rows.length} producten gelezen`);
const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value",
  maxWattage:"max_wattage", lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };

const per = new Map<string, {prod:number; vul:number; winst:number; veld:Record<string,number>}>();
let totVul = 0, totWinst = 0;
for (const r of rows) {
  const e = per.get(r.merk) ?? { prod:0, vul:0, winst:0, veld:{} };
  e.prod++;
  const specs = parseProductName(r.name ?? "");
  let winst = 0;
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const huidig = r[KOL[f]];
    if (huidig != null && huidig !== "") continue; // publishRun vult alleen lege kolommen
    e.veld[f] = (e.veld[f] ?? 0) + 1; e.vul++; winst++; totVul++;
  }
  if (winst > 0) { e.winst++; totWinst++; }
  per.set(r.merk, e);
}
console.log(`\nTOTAAL: ${totVul} veldvullingen op lege kolommen over ${totWinst} producten (${(100*totWinst/rows.length).toFixed(1)}%)\n`);
console.log("merk|producten|vullingen|producten_met_winst|" + FIELDS.join("|"));
for (const [merk, e] of [...per].sort((a,b)=>b[1].vul-a[1].vul))
  console.log([merk, e.prod, e.vul, e.winst, ...FIELDS.map(f=>e.veld[f]??0)].join("|"));
