// Fase 1, Serien Lighting: de vijf overzetbare kolommen uit SUPPLIER_COLUMNS, één run per
// kolom. Zelfde stop als bij Northern: dit script eindigt na startSupplierColumnRun — het
// publiceert niet en zet geen enkel steekproefoordeel.
//
// Bron: brink_serien_raw.ndjson (export van de sprintmaster, 11 aug 2026), 1.956 rijen,
// nr uniek, 1.955/1.955 catalogusproducten gekoppeld (geverifieerd vóór dit script bestond).
// Het LED-predicaat is EXACT `leuchtmittel === "LED"`: de bron kent ook "LED E27" (4×) en dat
// is een LED-lámp op een fitting, geen geïntegreerde LED — 'bevat LED' zou die meepakken.
//
// Draaien (kolom = schutzart | cct_k | systemleistung_w | cri_ra | regelung):
//   bun --env-file=<pad>/.env.branch scripts/verrijk-serien-kolommen.ts <kolom>
//   bun --env-file=<pad>/.env.local  scripts/verrijk-serien-kolommen.ts <kolom> --productie
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const PAD = "/Users/timowittkamp/Documents/dev/lumenlogic-zwerm/brink_serien_raw.ndjson";
const VERWACHTE_HASH =
  "f25122779ddc8f41c07544748aab72200b103b21b267ac7232dde2940ebd2339";
const MERK = "Serien Lighting";

// bronveld → canonieke kolomnaam in SUPPLIER_COLUMNS (de poort die bepaalt óf hij mag draaien).
const KOLOMMEN: Record<string, string> = {
  schutzart: "Schutzart",
  cct_k: "CCT K",
  systemleistung_w: "Systemleistung W",
  cri_ra: "CRI Ra",
  regelung: "Regelung",
};
const bronveld = process.argv[2];
const kolom = bronveld ? KOLOMMEN[bronveld] : undefined;
if (!bronveld || !kolom) {
  throw new Error(
    `gebruik: verrijk-serien-kolommen.ts <${Object.keys(KOLOMMEN).join("|")}> [--productie]`,
  );
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
type Rij = { nr: string; naam: string | null; leuchtmittel: string | null } & Record<
  string,
  string | null
>;
const rijen: Rij[] = ruw
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
console.log(
  `bron OK — ${rijen.length} rijen · sha256 ${hash.slice(0, 12)}… · kolom "${kolom}" (bronveld ${bronveld})`,
);

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
    cel: (r) => (r as unknown as Rij)[bronveld] ?? null,
    geintegreerdeLed: (r) => (r as unknown as Rij).leuchtmittel === "LED",
  },
  `fase1-serien-${bronveld}`,
);

console.log(`\n== RUN ${run.id} · status ${run.status} ==`);
console.table(run.counts);

// ── Timo's beoordeelblokken: per leesregel vier ECHTE voorbeelden, mét de letterlijke cel ──
const perNr = new Map(rijen.map((r) => [String(r.nr).trim(), r]));
const items = await getSampleItems(db, run.id);
const alle = await getRunItems(db, run.id);

const prodRows = await db
  .select({ id: products.id, sup: products.supplierArticleCode, naam: products.name })
  .from(products)
  .where(eq(products.brandId, merk.id));
const perId = new Map(prodRows.map((p) => [p.id, p]));

const perVorm = new Map<string, { sup: string; naam: string; cel: string; waarde: string }[]>();
for (const it of alle) {
  const p = perId.get(it.productId);
  if (!p) continue;
  const rij = perNr.get(String(p.sup).trim());
  const cel = rij?.[bronveld] ?? "?";
  if (!perVorm.has(cel)) perVorm.set(cel, []);
  perVorm.get(cel)!.push({ sup: String(p.sup), naam: p.naam, cel, waarde: it.value });
}

const veld = alle[0]?.field ?? "?";
console.log(`\n${"=".repeat(72)}`);
console.log(`BEOORDEELBLOKKEN — ${alle.length} voorstellen, ${items.length} in de steekproef`);
console.log(`kolom "${kolom}" → veld ${veld}`);
console.log(`${"=".repeat(72)}`);
for (const [cel, lijst] of [...perVorm].sort()) {
  console.log(
    `\n── leesregel: kolom "${kolom}", cel ${JSON.stringify(cel)} → ${veld} ${lijst[0]?.waarde} (${lijst.length} producten)`,
  );
  for (const v of lijst.slice(0, 4)) {
    console.log(
      `   ${v.sup.padEnd(10)} ${v.naam.slice(0, 40).padEnd(42)} · cel ${JSON.stringify(v.cel)} → ${veld} wordt ${v.waarde}`,
    );
  }
}

console.log(`\nGESTOPT NA startSupplierColumnRun — niets gepubliceerd, geen oordeel gezet.`);
process.exit(0);
