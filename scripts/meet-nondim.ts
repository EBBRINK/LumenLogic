// Toetst de gemelde NON DIM-bug zelf, op de branch, met de ECHTE parser.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { parseProductName } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.dimmable from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const NON_DIM = /\bNON[\s-]?DIM\b/i;
let n = 0, tochDim = 0, opLegeKolom = 0; const perMerk: Record<string, number> = {}; const vb: string[] = [];
for (const r of rows) {
  if (!NON_DIM.test(r.name ?? "")) continue;
  n++; perMerk[r.merk] = (perMerk[r.merk] ?? 0) + 1;
  const s = parseProductName(r.name);
  if (s.dimmable !== undefined) {
    tochDim++;
    if (r.dimmable == null || r.dimmable === "") { opLegeKolom++; if (vb.length < 5) vb.push(`${r.name}  →  dimmable="${s.dimmable}"`); }
  }
}
console.log(`\n"NON DIM" in de naam           : ${n}`);
console.log(`  krijgt TOCH een dimmable-voorstel: ${tochDim}`);
console.log(`  daarvan op een LEGE kolom (= zou landen): ${opLegeKolom}`);
console.log(`  per merk: ${Object.entries(perMerk).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([m,c])=>`${m} ${c}`).join(" · ")}`);
console.log(`\nvoorbeelden:`); for (const v of vb) console.log("  " + v);

// Hoeveel van XAL's 3.449 dimbaarheid-voorstellen zijn NON DIM?
const xal = rows.filter(r => r.merk === "XAL");
let xalVoorstel = 0, xalNonDim = 0;
for (const r of xal) {
  const s = parseProductName(r.name ?? "");
  if (s.dimmable === undefined) continue;
  if (r.dimmable != null && r.dimmable !== "") continue;
  xalVoorstel++; if (NON_DIM.test(r.name)) xalNonDim++;
}
console.log(`\nXAL dimbaarheid-run: ${xalVoorstel} voorstellen op lege kolom, waarvan ${xalNonDim} met "NON DIM" in de naam (${(100*xalNonDim/xalVoorstel).toFixed(1)}%)`);
