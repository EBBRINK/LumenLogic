// De vier parser-bugs die de zwerm aanwees: hoeveel LANDENDE voorstellen raken ze werkelijk,
// over de hele catalogus? Dat getal bepaalt of dit blokkeert of alleen repareerd moet worden.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { parseProductName } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.max_wattage from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

// Elke bug als toets op de NAAM, plus de eis dat het voorstel werkelijk zou landen.
const BUGS: [string, (n: string, w: number) => boolean][] = [
  ["C90 W  (CRI + kleurcode)", (n, w) => new RegExp(`\\bC${w}\\s+W\\b`, "i").test(n)],
  ["nn W-W (typemaat + kleurcode)", (n, w) => new RegExp(`\\b${w}\\s+W-W\\b`, "i").test(n)],
  ["GX/QR-voet als watt", (n, w) => new RegExp(`\\b(?:GX|GU|QR-CBC|G)${String(w).replace(".", "\\.")}\\b`, "i").test(n)],
  // Alleen N >= 2 is een bug: "1x10W" is EEN lichtbron van 10 W en dan klopt de waarde.
  ["NxMW met N>=2 (per lichtbron)", (n, w) => new RegExp(`\\b(?:[2-9]|\\d{2,})\\s*[xX]\\s*${w}\\s*W\\b`, "i").test(n)],
];
const tel: Record<string, {n:number; merken:Record<string,number>; vb:string[]}> = {};
let landend = 0;
for (const r of rows) {
  const naam = r.name ?? "";
  const w = parseProductName(naam).maxWattage;
  if (w === undefined) continue;
  if (r.max_wattage != null && r.max_wattage !== "") continue;
  landend++;
  for (const [label, toets] of BUGS) {
    if (!toets(naam, w as number)) continue;
    const e = tel[label] ??= {n:0, merken:{}, vb:[]};
    e.n++; e.merken[r.merk] = (e.merken[r.merk]??0)+1;
    if (e.vb.length < 2) e.vb.push(`${naam.slice(0,70)} → ${w}`);
  }
}
console.log(`\nlandende maxWattage-voorstellen: ${landend}\n`);
let som = 0;
for (const [k,e] of Object.entries(tel).sort((a,b)=>b[1].n-a[1].n)) {
  som += e.n;
  console.log(`${k.padEnd(32)} ${String(e.n).padStart(6)}   ${Object.entries(e.merken).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([m,c])=>`${m} ${c}`).join(" · ")}`);
  for (const v of e.vb) console.log(`      ${v}`);
}
console.log(`\nsamen: ${som} van ${landend} (${(100*som/landend).toFixed(2)}%)`);
