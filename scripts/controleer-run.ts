// Onafhankelijke nameting op een gepubliceerde run: klopt wat er LANDDE met de bron?
// Leest de products-kolom terug (niet de items) en toetst tegen de productnaam.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const runId = process.argv[2];
const veld = process.argv.find((a) => a.startsWith("--veld="))?.slice(7) ?? "cri";
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const KOL: Record<string,string> = { cri:"cri", kelvin:"kelvin", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const kol = KOL[veld];

const r = await db.execute(sql`
  select i.value as voorgesteld, i.applied, p.name,
         ${sql.raw("p." + kol)} as in_kolom, p.tier2_source ->> ${veld} as herkomst
  from enrichment_items i join products p on p.id = i.product_id
  where i.run_id = ${runId} order by p.name`);
const rows = (r.rows ?? []) as any[];
let ok = 0, mis = 0, geenStempel = 0, nietInNaam = 0;
const fout: string[] = [];
for (const x of rows) {
  const geland = String(x.in_kolom ?? "");
  const bedoeld = String(x.voorgesteld ?? "");
  const gelijk = geland !== "" && (Number.isFinite(Number(geland)) && Number.isFinite(Number(bedoeld))
    ? Number(geland) === Number(bedoeld) : geland === bedoeld);
  if (!gelijk) { mis++; fout.push(`kolom="${geland}" ≠ voorstel="${bedoeld}"  ${x.name}`); } else ok++;
  if (x.herkomst !== "parsed-from-name") geenStempel++;
  // Staat de waarde letterlijk in de naam? Spaties weg, en de bron schrijft decimalen met een
  // KOMMA ("1,2W") terwijl wij ze met een punt opslaan ("1.2") — beide vormen toestaan, anders
  // meldt deze toets 10 valse afwijkingen op een run die klopt. (Zelf ingelopen, 30 jul.)
  const plat = String(x.name).replace(/\s+/g, "").toUpperCase();
  const vormen = [bedoeld, bedoeld.replace(".", ","), bedoeld.replace(",", ".")];
  if (!vormen.some((v) => plat.includes(v.toUpperCase()))) {
    nietInNaam++;
    fout.push(`waarde niet in naam: ${bedoeld} ← ${x.name}`);
  }
}
console.log(`\nrun ${runId} · veld ${veld} · ${rows.length} items`);
console.log(`  kolomwaarde == voorstel        : ${ok}`);
console.log(`  afwijkend                      : ${mis}`);
console.log(`  zonder herkomststempel         : ${geenStempel}`);
console.log(`  waarde staat NIET in de naam   : ${nietInNaam}`);
if (fout.length) { console.log(`\nafwijkingen:`); for (const f of fout.slice(0,10)) console.log("  " + f); }
else console.log(`\n✓ alle ${rows.length} waarden kloppen met de bron én dragen hun herkomst.`);

// En: is er buiten deze run iets aangeraakt?
const m = await db.execute(sql`
  select count(*) n from products p join brands b on b.id=p.brand_id
  where b.name='Flos Architectural' and ${sql.raw("p." + kol)} is not null`);
console.log(`\nFlos Architectural met '${veld}' gevuld, totaal in de catalogus: ${(m.rows??[])[0]?.n}`);
