// Hoeveel cellen scheelt het als de celsleutel het SPEC-FRAGMENT is in plaats van de hele
// productnaam? Het oordeel van een agent gaat alleen over het fragment dat de waarde
// voortbracht; de familienaam doet er niet toe. `specSpans()` weet welke karakters dat waren
// — die functie bestaat al in parser.ts en werd tot nu toe nergens aangeroepen.
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const merk = process.argv[2] ?? "Wever & Ducré";
const velden = (process.argv[3] ?? "cri,kelvin,maxWattage").split(",");
const context = Number(process.argv.find((a) => a.startsWith("--context="))?.slice(10) ?? 12);
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName, specSpans } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");
const { ONDERDRUKKENDE_VERDENKINGEN, nameShape } = await import("@/lib/repo/enrichment");

const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", ipValue:"ip_value", maxWattage:"max_wattage",
  lumenOutput:"lumen_output", beamAngle:"beam_angle", dimmable:"dimmable" };
const rows = ((await db.execute(sql`
  select p.name, p.kelvin,p.cri,p.ip_value,p.max_wattage,p.lumen_output,p.beam_angle,p.dimmable
  from products p join brands b on b.id=p.brand_id where b.name=${merk}`)).rows ?? []) as any[];

const heleNaam = new Map<string, number>(), fragment = new Map<string, number>();
const voorbeeld = new Map<string, string>();
let landend = 0;
for (const r of rows) {
  const naam = r.name ?? "";
  const specs = parseProductName(naam);
  const vl = verdenkingen(naam, specs);
  const spans = specSpans(naam);
  for (const f of FIELDS) {
    if (!velden.includes(f) || specs[f] === undefined) continue;
    const h = r[KOL[f]]; if (h != null && h !== "") continue;
    if (vl.some((v) => v.veld === f && ONDERDRUKKENDE_VERDENKINGEN.has(v.soort))) continue;
    landend++;
    heleNaam.set(`${f}|${nameShape(naam)}|${specs[f]}`, 1);

    // Het fragment: de span die dit veld voortbracht, plus een vast contextvenster aan
    // weerskanten. De context telt mee omdat "C90 W" en "CRI 90" hetzelfde getal anders
    // rechtvaardigen — de buren zijn precies wat een agent moet zien.
    const span = spans.filter((s) => s.field === f).sort((a, b) => a.start - b.start)[0];
    const stuk = span
      ? naam.slice(Math.max(0, span.start - context), Math.min(naam.length, span.end + context))
      : naam;
    // De sleutel draagt OOK het begin van de naam. Wat een product IS staat vooraan
    // ("POW.SUPPLY …", "BELT …") en dat is precies wat het oordeel bepaalt; het fragment
    // alleen zou `POW.SUPPLY 96W 48V` en `BELT SURF. POWER 96W 48V` op één hoop gooien.
    const kop = nameShape(naam.trim().split(/[\s,|]+/)[0] ?? "");
    const k = `${f}|${kop}|${nameShape(stuk)}|${specs[f]}`;
    fragment.set(k, 1);
    if (!voorbeeld.has(k)) voorbeeld.set(k, naam);
  }
}
const scherf = (n: number) => Math.ceil(n / 150);
console.log(`\n${merk} · ${rows.length} producten · velden ${velden.join(", ")} · contextvenster ±${context}`);
console.log(`  landende voorstellen        : ${landend}`);
console.log(`  cellen op de HELE naam      : ${heleNaam.size}  → ${scherf(heleNaam.size)} scherven à 150`);
console.log(`  cellen op het FRAGMENT      : ${fragment.size}  → ${scherf(fragment.size)} scherven à 150`);
console.log(`  reductie                    : ${(100 * (1 - fragment.size / heleNaam.size)).toFixed(1)}%`);
console.log(`\nvoorbeelden van fragmentvormen:`);
for (const [k, v] of [...voorbeeld].slice(0, 8)) console.log(`  ${k.padEnd(46)} ← ${String(v).slice(0, 46)}`);
