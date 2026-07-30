// Wat verandert er catalogusbreed door de parser- en poortwijzigingen van 30 jul?
// Eén tabel per veld: wat de parser levert, wat de poort weert, wat er landt.
// Bedoeld als het overzicht waarop een go/no-go voor productie te geven is — niet 70
// commit-boodschappen maar één beeld.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");
const { ONDERDRUKKENDE_VERDENKINGEN } = await import("@/lib/repo/enrichment");

const KOL: Record<string, string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value",
  maxWattage:"max_wattage", lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select b.name merk, p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id`)).rows ?? []) as any[];

const per: Record<string, { levert: number; landt: number; geweerd: Record<string, number> }> = {};
for (const f of FIELDS) per[f] = { levert: 0, landt: 0, geweerd: {} };
for (const r of rows) {
  const naam = r.name ?? "";
  const specs = parseProductName(naam);
  const vl = verdenkingen(naam, specs);
  for (const f of FIELDS) {
    if (specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    per[f].levert++;
    const blok = vl.find((v) => v.veld === f && ONDERDRUKKENDE_VERDENKINGEN.has(v.soort));
    if (blok) per[f].geweerd[blok.soort] = (per[f].geweerd[blok.soort] ?? 0) + 1;
    else per[f].landt++;
  }
}
console.log("\nveld".padEnd(13) + "levert".padStart(8) + "geweerd".padStart(9) + "LANDT".padStart(8) + "   voornaamste reden om te weren");
let tl = 0, tg = 0, tw = 0;
for (const f of FIELDS) {
  const e = per[f]; tl += e.levert; tw += e.landt; tg += e.levert - e.landt;
  const top = Object.entries(e.geweerd).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([k, c]) => `${k} ${c}`).join(" · ");
  console.log(f.padEnd(13) + String(e.levert).padStart(8) + String(e.levert - e.landt).padStart(9) +
    String(e.landt).padStart(8) + "   " + (top || "—"));
}
console.log("TOTAAL".padEnd(13) + String(tl).padStart(8) + String(tg).padStart(9) + String(tw).padStart(8));
