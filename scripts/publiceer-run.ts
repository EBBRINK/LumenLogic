// Een verrijkingsrun publiceren vanaf de commandoregel, achter de fail-closed branch-poort.
//
//   bun --env-file=.env.branch scripts/publiceer-run.ts <runId> [--veld=cri] [--ja]
//
// Zonder --ja doet het script niets dan tonen wat er zou gebeuren.
//
// WAAROM VANAF EEN SCRIPT. publishRun doet per product één select + één update
// (lib/repo/enrichment.ts:414-447) op de neon-HTTP-driver, dus elke query is een losse
// round-trip zonder transactie. Gemeten: 139 ms per round-trip → ~62 minuten voor 13.407
// producten. Dat past in geen enkele server-action-timeout, en de server-actions in
// app/data/actions.ts hebben bovendien geen env-check: daar zou dezelfde knop naar PRODUCTIE
// kunnen schrijven.
//
// Omdat publishRun zelf geen voortgang meldt, tellen we die er in een losse lus naast: het
// aantal producten van dit merk met een gevulde kolom loopt tijdens de publish op van 0 naar
// het verwachte aantal.

import { ilike, isNotNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { brands, products } from "@/db/schema";
import { getEnrichmentRun, getRunItems, getSampleItems, publishRun } from "@/lib/repo/enrichment";
import { assertBranchDb, logGuard } from "./branch-guard";

const [, , runId, ...rest] = process.argv;
const doorzetten = rest.includes("--ja");
const veld = rest.find((a) => a.startsWith("--veld="))?.slice(7) ?? "cri";

// Kolomref per parser-veldnaam, zodat de voortgangsteller elk veld aankan. AnyPgColumn omdat de
// kolomtypes verschillen (smallint, integer, numeric, text) — zelfde patroon als
// PARSER_FIELD_COLUMNS in lib/matching/engine.ts.
const KOLOM: Record<string, AnyPgColumn> = {
  cri: products.cri,
  kelvin: products.kelvin,
  ipValue: products.ipValue,
  maxWattage: products.maxWattage,
  lumenOutput: products.lumenOutput,
  beamAngle: products.beamAngle,
  dimmable: products.dimmable,
};

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  if (!runId) throw new Error("gebruik: publiceer-run.ts <runId> [--veld=cri] [--ja]");
  const { db } = await import("@/db/client");

  const run = await getEnrichmentRun(db, runId);
  if (!run) throw new Error(`run ${runId} niet gevonden`);
  if (run.status !== "steekproef") {
    throw new Error(`run heeft status '${run.status}' — publiceren kan alleen vanaf 'steekproef'`);
  }

  const sample = await getSampleItems(db, runId);
  const open = sample.filter((i) => !i.sampleVerdict).length;
  const fout = sample.filter((i) => i.sampleVerdict === "fout").length;
  const items = await getRunItems(db, runId);

  console.log(`\nrun ${runId} — merk ${run.brandName}`);
  console.log(`  voorstellen : ${items.length}`);
  console.log(`  steekproef  : ${sample.length} (${open} onbeoordeeld, ${fout} fout)`);

  if (open > 0) {
    throw new Error(
      `${open} steekproefrij(en) zonder oordeel — publishRun weigert dit zelf ook ` +
        `(assertSampleReviewed). Beoordeel ze eerst met verrijk-xal.ts keur.`,
    );
  }
  if (fout > 0) {
    throw new Error(
      `${fout} rij(en) staan op 'fout'. Afgesproken regel: één fout ⇒ de HELE run afwijzen, ` +
        `niet publiceren met een uitzondering — een 'fout' houdt in publishRun alleen díé rij ` +
        `tegen, terwijl alle producten met dezelfde naamvorm de fout alsnog krijgen.`,
    );
  }

  const [merk] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(ilike(brands.name, run.brandName ?? ""));
  const kolom = KOLOM[veld] ?? products.cri;
  const tel = async () => {
    const [r] = await db
      .select({ n: sql<number>`count(*)` })
      .from(products)
      .where(merk ? sql`${products.brandId} = ${merk.id} and ${kolom} is not null` : isNotNull(kolom));
    return Number(r.n);
  };

  const voor = await tel();
  console.log(`  '${veld}' gevuld vóór: ${voor}`);
  const verwacht = voor + items.length;
  console.log(`  verwacht ná      : ${verwacht}`);
  console.log(`  geschatte duur   : ~${Math.round((items.length * 2 * 139) / 60000)} min`);

  if (!doorzetten) {
    console.log(`\nDROOGLOOP — er is niets gewijzigd. Voeg --ja toe om echt te publiceren.\n`);
    return;
  }

  console.log(`\npubliceren… (voortgang elke 60 s)\n`);
  const t0 = performance.now();
  const timer = setInterval(() => {
    void tel().then((n) => {
      const min = (performance.now() - t0) / 60000;
      const gedaan = n - voor;
      const pct = items.length > 0 ? ((100 * gedaan) / items.length).toFixed(1) : "?";
      console.log(`  ${min.toFixed(1)} min · ${gedaan}/${items.length} gevuld (${pct}%)`);
    });
  }, 60_000);

  try {
    const { applied, rematched } = await publishRun(db, runId, "timo (branch)");
    clearInterval(timer);
    const na = await tel();
    console.log(`\nklaar in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
    console.log(`  toegepast : ${applied} (verwacht ${items.length})`);
    console.log(`  hermatcht : ${rematched} spec-regels`);
    console.log(`  '${veld}' gevuld ná: ${na} (was ${voor})`);
    if (applied !== items.length) {
      console.log(`\n⚠️  afwijking tussen toegepast en voorgesteld — verklaren vóór de nameting.`);
    }
  } catch (e) {
    clearInterval(timer);
    console.error(`\nafgebroken: ${e instanceof Error ? e.message : e}`);
    console.error(
      `De run blijft op status 'steekproef' staan (de statuswissel gebeurt ná de lus) en ` +
        `fieldIsEmpty maakt een tweede poging idempotent — opnieuw draaien mag.`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
