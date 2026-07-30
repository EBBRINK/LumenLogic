// Draagt de catalogus zelf al leverancierstekst? Zo ja, is een deel van ronde 2 en
// de Muuto-kruistabel bereikbaar ZONDER Supabase.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const q = async (l:string,s:any)=>{const r=await db.execute(s);console.log(`\n== ${l}`);console.table(((r.rows??r) as any[]).slice(0,30));};

await q("kolommen op products die leverancierstekst/lichtbron kunnen dragen", sql`
  select column_name, data_type from information_schema.columns
  where table_name='products' and column_name in
   ('description','product_text','light_source','light_source_system','light_source_included',
    'lamp_foot','lamp_category','driver_included','directionable','ruwe_tekst')
  order by column_name`);

await q("gevuldheid per merk (top 20 op productenaantal)", sql`
  select b.name as merk, count(p.id) producten,
    count(p.description) descr, round(100.0*count(p.description)/count(p.id),1) descr_pct,
    count(p.light_source) lichtbron, count(p.light_source_included) incl,
    count(p.lamp_foot) fitting, count(p.lamp_category) lampcat
  from brands b join products p on p.brand_id=b.id
  group by b.name order by count(p.id) desc limit 20`);
