// Is "het product is zelf een onderdeel" een wattage-probleem of een VELD-ONAFHANKELIJK
// probleem? Telt per veld hoeveel LANDENDE voorstellen op een naam staan die een
// onderdeelwoord draagt — met de meertalige lijst die de zwerm opleverde, en een teller per
// term, zodat zichtbaar is welke term werk doet en welke ruis is.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");

// Termen die de zwerm aanwees, plus de bestaande Engelse. Geen enkele is een gok: elke term
// komt uit een cel die een agent afkeurde, of stond al in verdenking.ts.
const TERMEN: [string, RegExp][] = [
  ["POW.SUPPLY", /\bPOW(?:ER)?\.?\s*SUPPLY\b/i],
  ["ALIM.LED (it)", /\bALIM(?:ENT|T)?\.?\s*LED\b/i],
  ["DRIVER", /^(?:LED\s+)?DRIVER\b/i],
  ["REMOTE KIT/TR", /\bREMOTE\s+KIT\b|\bTR\s*$/i],
  ["EQUIPO (es)", /\bEQUIPO\b/i],
  ["TRANS(F) (nl/de)", /\bTRANSF?(?:ORMATOR|ORMER)?\b/i],
  ["T.MAGNET PROFILE", /\bPROFILE\s+\d+\s*W?\b/i],
  ["CONVERTER/TRAFO", /\b(?:CONVERTER|TRAFO|NETZTEIL|ALIMENTATION)\b/i],
  ["ALIMENTATORE", /\bALIMENTATOR\w*\b/i],
];
const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };

const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const perVeld: Record<string, {landend:number; onderdeel:number}> = {};
const perTerm: Record<string, {namen:number; voorstellen:number; merken:Set<string>}> = {};
for (const f of FIELDS) perVeld[f] = {landend:0, onderdeel:0};

for (const r of rows) {
  const naam = r.name ?? "";
  const raak = TERMEN.filter(([, re]) => re.test(naam)).map(([t]) => t);
  const specs = parseProductName(naam);
  let voorstellenHier = 0;
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    perVeld[f].landend++;
    if (raak.length) { perVeld[f].onderdeel++; voorstellenHier++; }
  }
  for (const t of raak) {
    const e = perTerm[t] ??= {namen:0, voorstellen:0, merken:new Set()};
    e.namen++; e.voorstellen += voorstellenHier; e.merken.add(r.merk);
  }
}

console.log("\nveld".padEnd(14) + "landend".padStart(9) + "op onderdeelnaam".padStart(18) + "aandeel".padStart(9));
let tl=0, to=0;
for (const f of FIELDS) { const e=perVeld[f]; tl+=e.landend; to+=e.onderdeel;
  console.log(f.padEnd(14) + String(e.landend).padStart(9) + String(e.onderdeel).padStart(18) + (e.landend?((100*e.onderdeel/e.landend).toFixed(1)+"%"):"-").padStart(9)); }
console.log("TOTAAL".padEnd(14) + String(tl).padStart(9) + String(to).padStart(18) + ((100*to/tl).toFixed(1)+"%").padStart(9));

console.log("\nper term (welke doet werk?)");
console.log("term".padEnd(20) + "namen".padStart(8) + "voorstellen".padStart(13) + "  merken");
for (const [t,e] of Object.entries(perTerm).sort((a,b)=>b[1].voorstellen-a[1].voorstellen))
  console.log(t.padEnd(20) + String(e.namen).padStart(8) + String(e.voorstellen).padStart(13) + "  " + [...e.merken].slice(0,4).join(", "));
