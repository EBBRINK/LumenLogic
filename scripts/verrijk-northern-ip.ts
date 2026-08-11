// Fase 1, eerste kabel: Northern `IP code` → products.ip_value.
//
// Leest de bronexport, verifieert de hash, en start ÉÉN enrichment-run op de Neon-branch.
// Stopt na startSupplierColumnRun: publiceert niet en zet geen enkel steekproefoordeel —
// DEFAULT_MAX_SAMPLE_ERROR_RATE staat op 0 en het oordeel is van Timo, niet van dit script.
//
// Draaien:
//   bun --env-file=<pad>/.env.branch scripts/verrijk-northern-ip.ts
//   bun --env-file=<pad>/.env.local  scripts/verrijk-northern-ip.ts --productie
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const PAD = "/Users/timowittkamp/Documents/dev/lumenlogic-zwerm/brink_northern_raw.ndjson";
const VERWACHTE_HASH =
  "7a909c020069c78cdfd2da8f95be4c3314e77a1685f0b81989428ad66d4b3cb5";
const MERK = "Northern";
const KOLOM = "IP code";

// Zie branch-guard.ts: --productie zet de bedoeling in het commando en stelt de omgekeerde
// eisen (endpoint MOET productie zijn, branch-marker mag NIET gezet zijn). Zonder de vlag
// blijft het gedrag ongewijzigd fail-closed op de branch. De vlag is bewust niet af te leiden
// uit de omgeving: hij moet getypt worden. Zelfde patroon als publiceer-run.ts en verrijk-xal.ts.
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
  ip_code: string | null;
};
const rijen: Rij[] = ruw
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
console.log(`bron OK — ${rijen.length} rijen · sha256 ${hash.slice(0, 12)}…`);

const { db } = await import("@/db/client");
const { brands } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { startSupplierColumnRun, getSampleItems } = await import("@/lib/repo/enrichment");

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
    kolom: KOLOM,
    rijen: rijen as unknown as Record<string, unknown>[],
    sleutel: (r) => (r as unknown as Rij).nr ?? null,
    cel: (r) => (r as unknown as Rij).ip_code ?? null,
  },
  "fase1-northern-ip",
);

console.log(`\n== RUN ${run.id} · status ${run.status} ==`);
console.table(run.counts);

// ── Timo's beoordeelblokken: per leesregel vier ECHTE voorbeelden ────────────
const perNr = new Map(rijen.map((r) => [String(r.nr).trim(), r]));
const items = await getSampleItems(db, run.id);
const alle = await (await import("@/lib/repo/enrichment")).getRunItems(db, run.id);

const { products } = await import("@/db/schema");
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
  const vorm = rij?.ip_code ?? "?";
  if (!perVorm.has(vorm)) perVorm.set(vorm, []);
  perVorm.get(vorm)!.push({ sup: String(p.sup), naam: p.naam, waarde: it.value });
}

console.log(`\n${"=".repeat(72)}`);
console.log(`BEOORDEELBLOKKEN — ${alle.length} voorstellen, ${items.length} in de steekproef`);
console.log(`${"=".repeat(72)}`);
for (const [vorm, lijst] of [...perVorm].sort()) {
  console.log(`\n── leesregel: ruwe cel ${JSON.stringify(vorm)} → ip_value ${vorm} (${lijst.length} producten)`);
  for (const v of lijst.slice(0, 4)) {
    console.log(`   ${v.sup.padEnd(8)} ${v.naam.slice(0, 44).padEnd(46)} → ip_value wordt ${v.waarde}`);
  }
}

console.log(`\nGESTOPT NA startEnrichmentRun — niets gepubliceerd, geen oordeel gezet.`);
process.exit(0);
