// Is 'accessoire-context' een echte accessoire, of een variantsuffix van een armatuur?
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const rows = ((await db.execute(sql`
  select b.name merk, p.name from products p join brands b on b.id=p.brand_id
  where b.name in ('Prado','TossB','Kreon')`)).rows ?? []) as any[];
const ACC = /\b(EXCL|INCL|SPARE|ACCESS\w*|DRIVER|CONVERTER|TRAFO|ADAPTER|BRACKET)\b/i;
// het product IS het onderdeel: het woord staat vooraan of is de kop van de naam
const IS_ONDERDEEL = /^(?:led\s+)?(driver|converter|trafo|adapter|bracket|spare)\b/i;
const perMerk: Record<string, {n:number; isOnderdeel:number; woorden:Record<string,number>; vb:string[]}> = {};
for (const r of rows) {
  const m = ACC.exec(r.name ?? ""); if (!m) continue;
  const e = perMerk[r.merk] ??= {n:0, isOnderdeel:0, woorden:{}, vb:[]};
  e.n++; e.woorden[m[1].toUpperCase()] = (e.woorden[m[1].toUpperCase()]??0)+1;
  if (IS_ONDERDEEL.test(r.name)) e.isOnderdeel++;
  else if (e.vb.length < 3) e.vb.push(String(r.name).slice(0,86));
}
for (const [merk, e] of Object.entries(perMerk)) {
  console.log(`\n${merk}: ${e.n} namen met een accessoirewoord · daarvan IS ${e.isOnderdeel} het onderdeel zelf (${(100*e.isOnderdeel/e.n).toFixed(1)}%)`);
  console.log(`  woorden: ${Object.entries(e.woorden).sort((a,b)=>b[1]-a[1]).map(([w,c])=>`${w} ${c}`).join(" · ")}`);
  console.log(`  voorbeelden die GEEN onderdeel zijn:`);
  for (const v of e.vb) console.log(`    ${v}`);
}
