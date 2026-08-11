// Fase 1, vervolg op de IP-kabel (run a9ed7d0a): de overige Northern-kolommen, één run per
// kolom. Zelfde bron, zelfde hash-poort, zelfde stop: dit script eindigt na
// startSupplierColumnRun — het publiceert niet en zet geen enkel steekproefoordeel.
//
// Draaien (kolom = watt | kelvin | lumen | dimbaar | herkomst):
//   bun --env-file=<pad>/.env.branch scripts/verrijk-northern-kolommen.ts <kolom>
//   bun --env-file=<pad>/.env.local  scripts/verrijk-northern-kolommen.ts <kolom> --productie
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const PAD = "/Users/timowittkamp/Documents/dev/lumenlogic-zwerm/brink_northern_raw.ndjson";
const VERWACHTE_HASH =
  "7a909c020069c78cdfd2da8f95be4c3314e77a1685f0b81989428ad66d4b3cb5";
const MERK = "Northern";

// De bronveldnaam is hier gelijk aan de kolomnaam in SUPPLIER_COLUMNS; de tabel dáár is de
// poort die bepaalt of de kolom überhaupt mag draaien.
const KOLOMMEN = new Set(["watt", "kelvin", "lumen", "dimbaar", "herkomst"]);
const kolom = process.argv[2];
if (!kolom || !KOLOMMEN.has(kolom)) {
  throw new Error(`gebruik: verrijk-northern-kolommen.ts <${[...KOLOMMEN].join("|")}> [--productie]`);
}

const naarProductie = process.argv.includes("--productie");
const poort = naarProductie
  ? await assertProductieDb(process.cwd())
  : await assertBranchDb(process.cwd());
if (naarProductie) {
  console.log(
    `\n🔴 PRODUCTIE-MODUS — endpoint ${poort.endpoint} (bevestigd als productie via .env.local)\n` +
      `   Dit schrijft voorstellen in enrichment_runs/enrichment_items. products blijft ongemoeid:\n` +
      `   dit script stopt na startSupplierColumnRun en publiceert niet.\n`,
  );
} else {
  logGuard(poort);
}

// ── De bron, met vingerafdruk ────────────────────────────────────────────────
const ruw = readFileSync(PAD);
const hash = createHash("sha256").update(ruw).digest("hex");
if (hash !== VERWACHTE_HASH) {
  throw new Error(
    `GEBLOKKEERD: bron-hash wijkt af.\n  verwacht: ${VERWACHTE_HASH}\n  gemeten:  ${hash}\n` +
      `De export is veranderd sinds deze route erop is gemeten; hermeet vóór je hem draait.`,
  );
}
type Rij = {
  nr: string;
  source_sheet: string;
  omschrijving: string | null;
  fitting: string | null;
} & Record<string, string | null>;
const rijen: Rij[] = ruw
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
console.log(`bron OK — ${rijen.length} rijen · sha256 ${hash.slice(0, 12)}… · kolom "${kolom}"`);

const { db } = await import("@/db/client");
const { brands, products } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { startSupplierColumnRun, getSampleItems, getRunItems } = await import(
  "@/lib/repo/enrichment"
);

const [merk] = await db
  .select({ id: brands.id, name: brands.name })
  .from(brands)
  .where(eq(brands.name, MERK))
  .limit(1);
if (!merk) throw new Error(`merk ${MERK} niet gevonden`);

const run = await startSupplierColumnRun(
  db,
  merk.id,
  {
    kolom,
    rijen: rijen as unknown as Record<string, unknown>[],
    sleutel: (r) => (r as unknown as Rij).nr ?? null,
    cel: (r) => (r as unknown as Rij)[kolom] ?? null,
    // Gemeten celvorm in `fitting` op blad Lighting: exact "Integrated LED" (67×); de rest is
    // E27/G9/GU10/E14/null. Exacte gelijkheid is hier dus de juiste toets.
    geintegreerdeLed: (r) => (r as unknown as Rij).fitting === "Integrated LED",
  },
  `fase1-northern-${kolom}`,
);

console.log(`\n== RUN ${run.id} · status ${run.status} ==`);
console.table(run.counts);

// ── Timo's beoordeelblokken: per leesregel vier ECHTE voorbeelden ────────────
const perNr = new Map(rijen.map((r) => [String(r.nr).trim(), r]));
const items = await getSampleItems(db, run.id);
const alle = await getRunItems(db, run.id);

const prodRows = await db
  .select({ id: products.id, sup: products.supplierArticleCode, naam: products.name })
  .from(products)
  .where(eq(products.brandId, merk.id));
const perId = new Map(prodRows.map((p) => [p.id, p]));

const perVorm = new Map<string, { sup: string; naam: string; waarde: string }[]>();
for (const it of alle) {
  const p = perId.get(it.productId);
  if (!p) continue;
  const rij = perNr.get(String(p.sup).trim());
  const vorm = rij?.[kolom] ?? "?";
  if (!perVorm.has(vorm)) perVorm.set(vorm, []);
  perVorm.get(vorm)!.push({ sup: String(p.sup), naam: p.naam, waarde: it.value });
}

console.log(`\n${"=".repeat(72)}`);
console.log(`BEOORDEELBLOKKEN — ${alle.length} voorstellen, ${items.length} in de steekproef`);
console.log(`${"=".repeat(72)}`);
for (const [vorm, lijst] of [...perVorm].sort()) {
  console.log(
    `\n── leesregel: ruwe cel ${JSON.stringify(vorm)} → ${alle[0]?.field} ${lijst[0]?.waarde} (${lijst.length} producten)`,
  );
  for (const v of lijst.slice(0, 4)) {
    console.log(`   ${v.sup.padEnd(8)} ${v.naam.slice(0, 44).padEnd(46)} → ${alle[0]?.field} wordt ${v.waarde}`);
  }
}

console.log(`\nGESTOPT NA startSupplierColumnRun — niets gepubliceerd, geen oordeel gezet.`);
process.exit(0);
