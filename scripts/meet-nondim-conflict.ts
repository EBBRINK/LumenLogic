// Als een naam ONTKENT dat hij dimbaar is EN een protocol noemt: wat dan?
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const rows = ((await db.execute(sql`select b.name merk, p.name, p.dimmable from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];
const NIET = /\b(?:NON[\s-]*DIM\w*|NOT[\s-]*DIM\w*|NIET[\s-]*DIMBAAR|EXCL\.?\s*DIM\w*|ZONDER[\s-]*DIM\w*|NO[\s-]*DIM\b)/i;
const PROT: [string, RegExp][] = [["DALI",/\bDALI\b/i],["TRIAC",/\bTRIAC\b/i],["PHASE",/\bPHASE\b/i],["x-10V",/\b[01]\s*-\s*10\s*V\b/i]];
let ontkent=0, ookProtocol=0, alleenKaalDim=0; const vb: string[] = []; const perMerk: Record<string,number>={};
for (const r of rows) {
  const n = r.name ?? ""; if (!NIET.test(n)) continue;
  ontkent++;
  const gevonden = PROT.filter(([,re])=>re.test(n)).map(([x])=>x);
  if (gevonden.length) { ookProtocol++; perMerk[r.merk]=(perMerk[r.merk]??0)+1; if (vb.length<6) vb.push(`[${gevonden.join("+")}] ${n.slice(0,84)}`); }
  else alleenKaalDim++;
}
console.log(`\nnamen die dimbaarheid ONTKENNEN            : ${ontkent}`);
console.log(`  waarvan OOK een expliciet protocol noemen: ${ookProtocol}  ← de twijfelgevallen`);
console.log(`  waarvan alleen het kale DIM-token dragen : ${alleenKaalDim}`);
console.log(`  protocol-gevallen per merk: ${Object.entries(perMerk).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,c])=>`${m} ${c}`).join(" · ") || "-"}`);
if (vb.length) { console.log(`\nvoorbeelden:`); for (const v of vb) console.log("  " + v); }
