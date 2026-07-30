import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const q = async (l:string,s:any)=>{const r=await db.execute(s);console.log(`\n== ${l}`);console.table((r.rows??r) as any[]);};
await q("spec_lines per status (hermatch-kosten in publishRun)", sql`
  select status, count(*) n from spec_lines group by status order by 2 desc`);
await q("gevraagde merken in spec_lines (brand_text)", sql`
  select brand_text, count(*) n from spec_lines where brand_text is not null and brand_text <> ''
  group by 1 order by 2 desc limit 30`);
await q("welke spec-eisen dragen de regels", sql`
  select count(*) regels, count(req_kelvin) kelvin, count(req_cri) cri, count(req_ip) ip,
   count(req_watt) watt, count(req_lumen) lumen, count(req_beam_angle) beam, count(req_dimmable) dim
  from spec_lines`);
