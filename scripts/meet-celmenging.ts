// Mengt een fragment-sleutel een ONDERDEEL met een ARMATUUR in dezelfde cel? Dat is de enige
// reden om de familienaam in de sleutel te stoppen, dus die vraag verdient een meting en niet
// een redenering. Twee populaties:
//   A. alleen wat de voorstelpoort DOORLAAT — wat de zwerm werkelijk ziet;
//   B. inclusief wat de poort WEERT — de robuustheidstoets: houdt de sleutel stand als het
//      ankerfilter iets mist? Dat is geen hypothetisch geval (zie BELT SURF. POWER).
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const merk = process.argv[2] ?? "Flos Architectural";
const context = Number(process.argv.find((a) => a.startsWith("--context="))?.slice(10) ?? 8);
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { FIELDS, parseProductName, specSpans } = await import("@/lib/enrichment/parser");
const { verdenkingen } = await import("@/lib/enrichment/verdenking");
const { ONDERDRUKKENDE_VERDENKINGEN, nameShape } = await import("@/lib/repo/enrichment");

const velden = ["cri", "kelvin", "maxWattage"];
const KOL: Record<string,string> = { kelvin:"kelvin", cri:"cri", maxWattage:"max_wattage" };
const rows = ((await db.execute(sql`
  select p.name, p.kelvin, p.cri, p.max_wattage from products p
  join brands b on b.id=p.brand_id where b.name=${merk}`)).rows ?? []) as any[];

// De sleutel: veld | vorm van het spec-fragment (span ± context) | waarde. Ik neem de EERSTE
// span van dat veld op tekstpositie — expliciet, want een andere keuze geeft een ander getal.
function sleutelVan(naam: string, f: string, waarde: unknown) {
  const spans = specSpans(naam).filter((s) => s.field === f).sort((a, b) => a.start - b.start);
  const s = spans[0];
  if (!s) return `${f}|${nameShape(naam)}|${waarde}`;
  // Uitbreiden tot woordgrenzen: een knip midden in een woord splitst dezelfde vorm zodra een
  // buurwoord een teken langer is (gezien: "array" vs "rray"). Ruis van de knip, geen data.
  let van = Math.max(0, s.start - context), tot = Math.min(naam.length, s.end + context);
  while (van > 0 && !/\s/.test(naam[van - 1])) van--;
  while (tot < naam.length && !/\s/.test(naam[tot])) tot++;
  return `${f}|${nameShape(naam.slice(van, tot))}|${waarde}`;
}

for (const [label, metGeweerd] of [["A. alleen doorgelaten", false], ["B. inclusief geweerd", true]] as [string, boolean][]) {
  const cel = new Map<string, { armatuur: number; onderdeel: number; vb: string[] }>();
  for (const r of rows) {
    const naam = r.name ?? "";
    const specs = parseProductName(naam);
    const vl = verdenkingen(naam, specs);
    const isOnderdeel = vl.some((v) => v.soort === "product-is-onderdeel");
    for (const f of FIELDS) {
      if (!velden.includes(f) || specs[f] === undefined) continue;
      const h = r[KOL[f]]; if (h != null && h !== "") continue;
      const geweerd = vl.some((v) => v.veld === f && ONDERDRUKKENDE_VERDENKINGEN.has(v.soort));
      if (geweerd && !metGeweerd) continue;
      const k = sleutelVan(naam, f, specs[f]);
      const e = cel.get(k) ?? { armatuur: 0, onderdeel: 0, vb: [] };
      if (isOnderdeel) e.onderdeel++; else e.armatuur++;
      if (e.vb.length < 2) e.vb.push(naam);
      cel.set(k, e);
    }
  }
  const alle = [...cel.entries()];
  const metOnderdeel = alle.filter(([, e]) => e.onderdeel > 0);
  const gemengd = alle.filter(([, e]) => e.onderdeel > 0 && e.armatuur > 0);
  console.log(`\n${label} — ${merk}, venster ±${context}`);
  console.log(`  cellen                        : ${alle.length}`);
  console.log(`  cellen met een onderdeel      : ${metOnderdeel.length}`);
  console.log(`  cellen die MENGEN             : ${gemengd.length}${gemengd.length ? "  ← de sleutel is dan te grof" : "  ✓"}`);
  for (const [k, e] of gemengd.slice(0, 5)) console.log(`      ${k}\n        ${e.vb.join("\n        ")}`);
}
