// Agent A stelt dat mijn driver-telling een bovengrens is: de meeste treffers zijn
// module-armaturen met "driver excl./incl.", geen losse drivers. Zelf natrekken.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { parseProductName } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`select b.name merk, p.name, p.max_wattage from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const BREED = /\b(driver|converter|trafo|transformer|alimentat|netzteil|voeding|power supply|psu)\b/i;
// "het product IS een driver": aan het begin van de naam, of als los artikel
const IS_DRIVER = /^(?:led\s+)?(driver|converter|trafo|transformer|netzteil|alimentatore|alimentatori|voeding|power supply|psu)\b|^\S*\s*(driver|converter)\s*[,:]/i;
const SLECHTS_VERMELD = /\bdriver\s*(excl|incl|included|excluded|inbegrepen)\b/i;

let breed=0, isDriver=0, vermeld=0, breedVoorstel=0, isDriverVoorstel=0;
const vbIs: string[] = [], vbVermeld: string[] = [];
for (const r of rows) {
  const n = r.name ?? ""; if (!BREED.test(n)) continue;
  breed++;
  const s = parseProductName(n);
  const leeg = r.max_wattage == null || r.max_wattage === "";
  const voorstel = s.maxWattage !== undefined && leeg;
  if (voorstel) breedVoorstel++;
  if (IS_DRIVER.test(n)) { isDriver++; if (voorstel) isDriverVoorstel++; if (vbIs.length<4) vbIs.push(n.slice(0,90)); }
  else if (SLECHTS_VERMELD.test(n)) { vermeld++; if (vbVermeld.length<4) vbVermeld.push(n.slice(0,90)); }
}
console.log(`\nbrede regex (mijn fase-1-getal)     : ${breed} namen · ${breedVoorstel} maxWattage-voorstellen op lege kolom`);
console.log(`  waarvan het product ZELF een driver is : ${isDriver} · ${isDriverVoorstel} voorstellen`);
console.log(`  waarvan alleen "driver excl./incl."    : ${vermeld}`);
console.log(`  rest (driver ergens anders in de naam) : ${breed - isDriver - vermeld}`);
console.log(`\nvoorbeelden IS-driver:`); for (const v of vbIs) console.log("  " + v);
console.log(`voorbeelden alleen-vermeld:`); for (const v of vbVermeld) console.log("  " + v);
