// Inventarisatie van de BESTEMMINGSKANT van de kolom-overzet-opdracht: wat staat er vandaag
// in de catalogus-brondata per merk, en wat zou de naam-parser daar bovenop leggen?
//
// Waarom uit de CSV en niet uit de database: `data/source/brink_products.csv` IS de
// import-bron (scripts/import.ts:187 leest exact dit bestand) en bevat dezelfde 45 kolommen
// als de Supabase-tabel `brink_products`. Voor de vraag "hoe leeg staat kelvin bij Serien"
// is dit dus geen benadering maar de bron zelf — en het vergt geen databaseverbinding, dus
// ook geen branch-poort (scripts/branch-guard.ts). Dit script schrijft niets, nergens.
//
// Het leest de échte functies: iterRecords (scripts/csv.ts) en parseProductName
// (lib/enrichment/parser.ts). Geen nagebouwde parse — die les kostte deze week vijf metingen
// (docs/probleem-variant-ranking.md).
//
// Draaien:  bun scripts/merk-kolom-inventarisatie.ts [merknaam ...]
// Zonder argumenten: de vijf merken uit de sprintmaster-meting.

import { readFileSync } from "node:fs";
import { iterRecords } from "./csv";
import { FIELDS, parseProductName, type ParsedSpecs } from "../lib/enrichment/parser";

// De brondata staat buiten de worktree (read-only, niet in git) — vandaar het pad naar de
// hoofdcheckout in plaats van process.cwd().
const CSV = "/Users/timowittkamp/Documents/dev/lumenlogic/data/source/brink_products.csv";

// CSV-kolom per parser-veld. De namen lopen uiteen (snake_case in de bron, camelCase in de
// parser); deze tabel is de enige plek waar die vertaling staat.
const CSV_COLUMN: Record<(typeof FIELDS)[number], string> = {
  maxWattage: "max_wattage",
  kelvin: "kelvin",
  cri: "cri",
  ipValue: "ip_value",
  beamAngle: "beam_angle",
  lumenOutput: "lumen_output",
  dimmable: "dimmable",
};

const DEFAULT_BRANDS = ["Serien Lighting", "Prado", "TAL", "Muuto", "Northern"];

type BrandStat = {
  rows: number;
  // per veld: kolom gevuld / parser vindt iets / parser vindt iets terwijl de kolom leeg is
  filled: Record<string, number>;
  parsed: Record<string, number>;
  landsOnEmpty: Record<string, number>;
  // waardeverdeling van wat de KOLOM zegt (val 1: gevuld ≠ bruikbaar)
  values: Record<string, Map<string, number>>;
  // hoeveel velden een product er via de naam bij zou krijgen → rangverschuiving
  gainHistogram: Map<number, number>;
  namesSeen: string[];
};

function emptyStat(): BrandStat {
  const per = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));
  return {
    rows: 0,
    filled: per(),
    parsed: per(),
    landsOnEmpty: per(),
    values: Object.fromEntries(FIELDS.map((f) => [f, new Map<string, number>()])),
    gainHistogram: new Map(),
    namesSeen: [],
  };
}

function bump(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function main(): void {
  const wanted = process.argv.slice(2);
  const brands = wanted.length ? wanted : DEFAULT_BRANDS;
  // Merknaam-matching op lowercase-substring: de bron schrijft "Serien Lighting" maar de
  // sprintmaster-notitie "Serien". Exact-match zou dan nul rijen opleveren en dat leest als
  // "merk bestaat niet" in plaats van "verkeerd gezocht".
  const keys = brands.map((b) => b.toLowerCase());
  const stats = new Map<string, BrandStat>(brands.map((b) => [b, emptyStat()]));

  let total = 0;
  for (const r of iterRecords(readFileSync(CSV, "utf8"))) {
    if (!r.id || !r.name) continue; // exact de twee overslag-regels uit import.ts
    total++;
    const brandName = (r.brand_name ?? "").toLowerCase();
    const hit = keys.findIndex((k) => brandName.includes(k));
    if (hit === -1) continue;

    const s = stats.get(brands[hit])!;
    s.rows++;
    if (s.namesSeen.length < 15) s.namesSeen.push(r.name);

    const parsedSpecs: ParsedSpecs = parseProductName(r.name);
    let gain = 0;
    for (const f of FIELDS) {
      const raw = r[CSV_COLUMN[f]];
      const columnFilled = raw != null && raw !== "";
      if (columnFilled) {
        s.filled[f]++;
        bump(s.values[f], raw!);
      }
      const parsedValue = parsedSpecs[f];
      if (parsedValue !== undefined) {
        s.parsed[f]++;
        if (!columnFilled) {
          s.landsOnEmpty[f]++;
          gain++;
        }
      }
    }
    s.gainHistogram.set(gain, (s.gainHistogram.get(gain) ?? 0) + 1);
  }

  console.log(`\nGelezen: ${total} productrijen uit ${CSV}\n`);

  for (const brand of brands) {
    const s = stats.get(brand)!;
    console.log(`══ ${brand} — ${s.rows} producten ${"═".repeat(Math.max(0, 40 - brand.length))}`);
    if (s.rows === 0) {
      console.log("  (geen rijen — merknaam anders geschreven in de bron?)\n");
      continue;
    }
    const pct = (n: number) => `${((n / s.rows) * 100).toFixed(1).padStart(5)}%`;
    console.log("  veld          kolom gevuld    naam-parser    landt op leeg");
    for (const f of FIELDS) {
      console.log(
        `  ${f.padEnd(13)} ${String(s.filled[f]).padStart(6)} ${pct(s.filled[f])}  ` +
          `${String(s.parsed[f]).padStart(6)} ${pct(s.parsed[f])}  ` +
          `${String(s.landsOnEmpty[f]).padStart(6)} ${pct(s.landsOnEmpty[f])}`,
      );
    }

    // Val 1 uit de opdracht: meet de WAARDEVERDELING, nooit alleen het aantal.
    const withValues = FIELDS.filter((f) => s.values[f].size > 0);
    if (withValues.length) {
      console.log("\n  waardeverdeling van de gevulde kolommen (top 8 per veld):");
      for (const f of withValues) {
        const top = [...s.values[f].entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([v, n]) => `${JSON.stringify(v)} (${n})`)
          .join(" · ");
        console.log(`    ${f.padEnd(13)} ${s.values[f].size} unieke waarden: ${top}`);
      }
    }

    const gains = [...s.gainHistogram.entries()].sort((a, b) => a[0] - b[0]);
    console.log(
      `\n  velden erbij via de naam: ${gains
        .map(([g, n]) => `${g}→${n} (${((n / s.rows) * 100).toFixed(1)}%)`)
        .join(" · ")}`,
    );
    console.log(`  eerste namen: ${s.namesSeen.slice(0, 5).map((n) => `"${n}"`).join(", ")}\n`);
  }
}

main();
