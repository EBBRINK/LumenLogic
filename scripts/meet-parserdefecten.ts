// De drie gemelde naam-parser-defecten, zelf nagemeten op de branch met de ÉCHTE parser.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { parseProductName } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`select b.name as merk, p.name from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const KORT_K = /\b\d[.,]\d\s*K\b/i;                       // "2.7K"
const NIET_DIM = /\b(?:non|not)[- ]?dimmable\b|\bniet[- ]dimbaar\b|\bnon[- ]?dim\b|\bnd\b(?![a-z])/i;
const DRIVER = /\b(driver|converter|trafo|transformer|alimentat|netzteil|voeding|power supply|psu)\b/i;

let kortK=0, kortKgelezen=0, nietDim=0, nietDimToch=0, driver=0, driverToch=0;
const kortKmerk: Record<string,number> = {}, driverMerk: Record<string,number> = {};
for (const r of rows) {
  const n = r.name ?? ""; const s = parseProductName(n);
  if (KORT_K.test(n)) { kortK++; kortKmerk[r.merk]=(kortKmerk[r.merk]??0)+1; if (s.kelvin !== undefined) kortKgelezen++; }
  if (NIET_DIM.test(n)) { nietDim++; if (s.dimmable !== undefined) nietDimToch++; }
  if (DRIVER.test(n)) { driver++; driverMerk[r.merk]=(driverMerk[r.merk]??0)+1; if (s.maxWattage !== undefined) driverToch++; }
}
console.log(`\n1. kelvin als "2.7K"      : ${kortK} namen · parser leest er ${kortKgelezen}`);
console.log(`   per merk: ${Object.entries(kortKmerk).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,n])=>m+" "+n).join(" · ")}`);
console.log(`2. naam zegt niet-dimbaar : ${nietDim} namen · krijgt TOCH een dimmable-voorstel: ${nietDimToch}`);
console.log(`3. naam is zelf een driver: ${driver} namen · krijgt TOCH een maxWattage-voorstel: ${driverToch}`);
console.log(`   per merk: ${Object.entries(driverMerk).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,n])=>m+" "+n).join(" · ")}`);
