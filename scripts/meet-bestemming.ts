// Nulmeting bestemmingskant op de Neon-branch: per merk producten + gevulde spec-kolommen.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");

const r = await db.execute(sql`
  select b.name as merk, count(p.id) as producten,
    count(p.kelvin) as kelvin, count(p.cri) as cri, count(p.ip_value) as ip,
    count(p.max_wattage) as watt, count(p.lumen_output) as lumen,
    count(p.beam_angle) as beam, count(p.dimmable) as dim,
    count(p.tier2_source) as tier2,
    count(p.supplier_article_code) as sac
  from brands b left join products p on p.brand_id = b.id
  group by b.id, b.name having count(p.id) > 0
  order by count(p.id) desc`);
const rows = (r.rows ?? r) as any[];
console.log(`merken met producten: ${rows.length}`);
const tot = (k:string)=>rows.reduce((a,x)=>a+Number(x[k]),0);
console.log(`totaal producten ${tot("producten")} · sac ${tot("sac")} · tier2 ${tot("tier2")}`);
console.log(`velden totaal: kelvin ${tot("kelvin")} cri ${tot("cri")} ip ${tot("ip")} watt ${tot("watt")} lumen ${tot("lumen")} beam ${tot("beam")} dim ${tot("dim")}`);
console.log("\nmerk|producten|sac|kelvin|cri|ip|watt|lumen|beam|dim|tier2");
for (const x of rows.slice(0,60)) console.log([x.merk,x.producten,x.sac,x.kelvin,x.cri,x.ip,x.watt,x.lumen,x.beam,x.dim,x.tier2].join("|"));
