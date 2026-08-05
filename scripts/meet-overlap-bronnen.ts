// Wie claimt welke kolom? publishRun vult ALLEEN lege kolommen, dus de eerste bron wint
// permanent. Dit zet de naam-route (ronde 3, zelf gemeten) naast de kolomroute (ronde 1+2,
// overgenomen uit het zwerm-onderzoek) per merk × veld.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const zwerm = require("../docs/zwerm-kolomonderzoek-28-merken.json");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const VELD: Record<string,string> = { kelvin:"kelvin", cri:"cri", ip_value:"ipValue", max_wattage:"maxWattage",
  lumen_output:"lumenOutput", beam_angle:"beamAngle", dimmable:"dimmable" };
// zwerm-merksleutel → catalogusmerk
const MERK: Record<string,string> = {
  andtradition:"&Tradition", marset:"Marset", artemide:"Artemide Architectural", muuto:"Muuto",
  aromas:"Aromas", nordlux:"Nordlux", axolight:"Axo Light", northern:"Northern",
  brickinthewall:"", nyta:"Nyta", CLS:"CLS", Prado:"Prado", Egoluce:"Egoluce",
  "Roger Pradier":"Roger Pradier", estiluz:"Estiluz", serien:"Serien Lighting",
  flos:"Flos Architectural", sylvania:"Sylvania", goodmojo:"", tal:"TAL",
  "iaromi (It's About RoMi)":"It's About RoMi", "tossb (TossB)":"TossB", kreon:"Kreon",
  valerie:"Valerie Objects", leucos:"Leucos", weverducre:"Wever & Ducré",
  lombardo:"Lombardo", xal:"XAL",
};

// naam-route per merk × veld, op LEGE kolommen
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];
const naam = new Map<string, number>();
for (const r of rows) {
  const s = parseProductName(r.name ?? "");
  for (const f of FIELDS) {
    if (s[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    const k = `${r.merk}|${f}`; naam.set(k, (naam.get(k) ?? 0) + 1);
  }
}
console.log("\n== stap1Klaar (ronde 1) vs wat de naam-route op dezelfde kolom zou zetten\n");
console.log("merk|veld|kolomroute|naamroute|wie_wint_als_hij_eerst_gaat");
for (const k of zwerm.stap1Klaar) {
  const merk = MERK[k.merk] ?? k.merk, veld = VELD[k.veld] ?? k.veld;
  const n = naam.get(`${merk}|${veld}`) ?? 0;
  const oordeel = n === 0 ? "kolomroute — naam levert NIETS, geen conflict"
    : n >= k.bruikbareRijen ? `CONFLICT: naam is groter (${n} vs ${k.bruikbareRijen})`
    : `CONFLICT: kolom is groter (${k.bruikbareRijen} vs ${n})`;
  console.log([merk, veld, k.bruikbareRijen, n, oordeel].join("|"));
}
// Waar heeft de naam-route een veld dat GEEN enkele kolom in het zwerm-onderzoek dekt?
const gedekt = new Set<string>();
for (const k of [...zwerm.stap1Klaar, ...zwerm.stap2Wachtrij])
  for (const v of String(k.veld ?? "").split(/[\/,]/).map(s=>s.trim()))
    gedekt.add(`${MERK[k.merk] ?? k.merk}|${VELD[v] ?? v}`);
console.log("\n== naam-route op velden die GEEN kolomroute heeft (top 20) — hier is ronde 3 de enige bron\n");
console.log("merk|veld|naamroute");
for (const [k, n] of [...naam].sort((a,b)=>b[1]-a[1]).slice(0,40))
  if (!gedekt.has(k)) console.log(k.replace("|","|") + "|" + n);
