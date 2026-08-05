import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const q = async (label: string, s: any) => {
  const r = await db.execute(s); console.log(`\n== ${label}`); console.table((r.rows ?? r) as any[]);
};
await q("supplier_article_code: uniek?", sql`
  select count(*) as producten, count(distinct supplier_article_code) as distinct_codes,
         count(*) - count(distinct supplier_article_code) as duplicaten
  from products`);
await q("codes die over MEER DAN EEN merk voorkomen", sql`
  select count(*) as codes, sum(n) as producten from (
    select supplier_article_code, count(distinct brand_id) as m, count(*) as n
    from products group by supplier_article_code having count(distinct brand_id) > 1
  ) t`);
await q("top merken met een gedeelde code", sql`
  select b.name as merk, count(*) as producten_met_gedeelde_code from products p
  join brands b on b.id = p.brand_id
  where p.supplier_article_code in (
    select supplier_article_code from products group by supplier_article_code having count(distinct brand_id) > 1)
  group by b.name order by 2 desc limit 12`);
await q("duplicaat-codes BINNEN een merk", sql`
  select b.name as merk, count(*) as dubbele_rijen from (
    select brand_id, supplier_article_code, count(*) c from products
    group by brand_id, supplier_article_code having count(*) > 1) d
  join brands b on b.id = d.brand_id group by b.name order by 2 desc limit 12`);
await q("bestaande runs op deze branch", sql`
  select id, brand_name, status, counts, sample_error_rate, published_at from enrichment_runs order by created_at`);
await q("distincte waarden in de TEKSTkolommen (plaatshouder-risico)", sql`
  select 'ip_value' as kolom, ip_value as waarde, count(*) n from products where ip_value is not null group by 2
  union all select 'dimmable', dimmable, count(*) from products where dimmable is not null group by 2
  order by 1, 3 desc limit 30`);
