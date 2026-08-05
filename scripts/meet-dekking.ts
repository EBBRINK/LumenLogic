import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const q = async (l:string,s:any)=>{const r=await db.execute(s);console.log(`\n== ${l}`);console.table((r.rows??r) as any[]);};
// Welke gevraagde merken hebben producten in de catalogus, en welke eisen dragen die regels?
await q("gevraagd merk × heeft producten × eisen op die regels", sql`
  with vraag as (
    select s.*, lower(regexp_replace(s.brand_text, '[^a-z0-9]', '', 'gi')) as key from spec_lines s
    where s.brand_text is not null and s.brand_text <> ''),
  merk as (
    select b.name, lower(regexp_replace(b.name, '[^a-z0-9]', '', 'gi')) as key, count(p.id) n
    from brands b join products p on p.brand_id=b.id group by b.name)
  select v.brand_text, m.name as catalogusmerk, m.n as producten, count(*) as regels,
    count(v.req_kelvin) kelvin, count(v.req_cri) cri, count(v.req_ip) ip, count(v.req_watt) watt,
    count(v.req_lumen) lumen, count(v.req_beam_angle) beam, count(v.req_dimmable) dim,
    count(*) filter (where v.status in ('blauw','open')) as beweegbaar
  from vraag v left join merk m on m.key = v.key
  group by 1,2,3 order by (m.n is null), count(*) desc limit 25`);
