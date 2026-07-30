// Verrijkingsrun starten en de steekproef beoordelen — vanaf de commandoregel, achter de
// fail-closed branch-poort. Zie docs/plan-lege-speckolommen-xal.md.
//
//   bun --env-file=.env.branch scripts/verrijk-xal.ts start [--merk=XAL] [--veld=cri]
//   bun --env-file=.env.branch scripts/verrijk-xal.ts toon <runId>
//   bun --env-file=.env.branch scripts/verrijk-xal.ts keur <runId> goed|fout <nr,nr,…|alles>
//
// WAAROM NIET VIA DE UI. `startEnrichmentRun` en `publishRun` zijn alleen bereikbaar via de
// server-actions in app/data/actions.ts, en die gebruiken de kale client uit db/client.ts —
// zonder enige env-check. De dev-server draait standaard op .env.local, dus één vergeten
// omgevingsvariabele en de publiceerknop schrijft naar PRODUCTIE. Dit script zet de branch-poort
// vóór de eerste query, en publiceren zou daar via een server-action toch nooit passen: bij
// 139 ms per round-trip duurt de publish ~62 minuten.
//
// De uitdraai is gegroepeerd op VELD en NAAMVORM, niet op invoegvolgorde. Een systematische
// leesfout verschijnt dan als blok — dat is precies de zwakke plek van de bestaande poort: een
// 'fout'-oordeel laat maar één rij vallen terwijl alle producten met dezelfde naamvorm de fout
// alsnog krijgen. Zie je een blok dat niet deugt, dan is het antwoord de hele run afwijzen.

import { asc, eq, ilike } from "drizzle-orm";
import { brands, enrichmentItems } from "@/db/schema";
import type { FIELDS as FieldNames } from "@/lib/enrichment/parser";
import {
  getRunItems,
  getSampleItems,
  nameShape,
  setSampleVerdict,
  startEnrichmentRun,
} from "@/lib/repo/enrichment";
import { assertBranchDb, logGuard } from "./branch-guard";

type Veld = (typeof FieldNames)[number];

const [, , cmd, ...rest] = process.argv;
const vlag = (naam: string, val: string) =>
  rest.find((a) => a.startsWith(`--${naam}=`))?.slice(naam.length + 3) ?? val;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");

  if (cmd === "start") {
    const merkArg = vlag("merk", "XAL");
    const veld = vlag("veld", "cri") as Veld;
    const [merk] = await db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(ilike(brands.name, `%${merkArg}%`));
    if (!merk) throw new Error(`geen merk gevonden op '${merkArg}'`);

    console.log(`start: ${merk.name}, uitsluitend veld '${veld}' …`);
    const run = await startEnrichmentRun(db, merk.id, "timo (branch)", [veld]);
    const counts = run.counts as Record<string, number>;
    console.log(`run ${run.id}`);
    console.log(`  producten ${counts.producten} · voorstellen ${counts.geparsed} · steekproef ${counts.steekproef}`);
    console.log(`\nvolgende stap:\n  bun --env-file=.env.branch scripts/verrijk-xal.ts toon ${run.id}`);
    return;
  }

  if (cmd === "toon") {
    const runId = rest[0];
    if (!runId) throw new Error("gebruik: toon <runId>");
    const sample = await getSampleItems(db, runId);
    const alle = await getRunItems(db, runId);
    if (sample.length === 0) throw new Error(`run ${runId} heeft geen steekproef-items`);

    // Groepsomvang per veld+naamvorm over de HELE run: dat is wat een 'fout'-oordeel in
    // werkelijkheid raakt als je de run zou afwijzen, en wat er ongezien meegaat als je 'm laat
    // lopen. Zonder dit getal beoordeel je een rij zonder te weten of hij voor 3 of 4.000 staat.
    const omvang = new Map<string, number>();
    const waardenPerVorm = new Map<string, Set<string>>();
    for (const it of alle) {
      const k = `${it.field}|${nameShape(it.productName)}`;
      omvang.set(k, (omvang.get(k) ?? 0) + 1);
      if (!waardenPerVorm.has(k)) waardenPerVorm.set(k, new Set());
      waardenPerVorm.get(k)!.add(it.value);
    }

    // De steekproef in dezelfde volgorde als getSampleItems (productName, field) → het nummer
    // is stabiel en bruikbaar voor `keur`.
    const genummerd = sample.map((it, i) => ({ nr: i + 1, it }));
    const groepen = new Map<string, typeof genummerd>();
    for (const g of genummerd) {
      const k = `${g.it.field}|${nameShape(g.it.productName)}`;
      groepen.set(k, [...(groepen.get(k) ?? []), g]);
    }

    console.log(`\nrun ${runId} — ${sample.length} steekproefrijen in ${groepen.size} naamvormen`);
    console.log(`(${alle.length} voorstellen in totaal; per groep staat hoeveel er ongezien meegaan)\n`);

    const gesorteerd = [...groepen].sort((a, b) => (omvang.get(b[0]) ?? 0) - (omvang.get(a[0]) ?? 0));
    for (const [k, rijen] of gesorteerd) {
      const [veld, vorm] = k.split("|");
      const n = omvang.get(k) ?? 0;
      const waarden = [...(waardenPerVorm.get(k) ?? [])].sort();
      console.log(`── ${veld} · ${n} product(en) met deze vorm · waarden in de groep: ${waarden.join(", ")}`);
      console.log(`   vorm: ${vorm}`);
      for (const { nr, it } of rijen) {
        const oordeel = it.sampleVerdict ? ` [${it.sampleVerdict}]` : "";
        console.log(`   ${String(nr).padStart(3)}. ${it.value.padEnd(4)} ← ${it.productName}${oordeel}`);
      }
      console.log();
    }

    const open = sample.filter((i) => !i.sampleVerdict).length;
    console.log(`nog te beoordelen: ${open} van ${sample.length}`);
    console.log(`  alles goedkeuren : scripts/verrijk-xal.ts keur ${runId} goed alles`);
    console.log(`  losse rijen fout : scripts/verrijk-xal.ts keur ${runId} fout 12,17`);
    return;
  }

  if (cmd === "keur") {
    const [runId, oordeel, selectie] = rest;
    if (!runId || (oordeel !== "goed" && oordeel !== "fout") || !selectie) {
      throw new Error("gebruik: keur <runId> goed|fout <nr,nr,…|alles>");
    }
    const sample = await getSampleItems(db, runId);
    const gekozen =
      selectie === "alles"
        ? sample
        : selectie.split(",").map((s) => {
            const nr = parseInt(s.trim(), 10);
            const it = sample[nr - 1];
            if (!it) throw new Error(`rij ${nr} bestaat niet (1..${sample.length})`);
            return it;
          });

    for (const it of gekozen) await setSampleVerdict(db, it.id, oordeel);
    console.log(`${gekozen.length} rij(en) op '${oordeel}' gezet.`);

    const na = await db
      .select({ verdict: enrichmentItems.sampleVerdict })
      .from(enrichmentItems)
      .where(eq(enrichmentItems.runId, runId))
      .orderBy(asc(enrichmentItems.id));
    const inSample = await getSampleItems(db, runId);
    const fout = inSample.filter((i) => i.sampleVerdict === "fout").length;
    const open = inSample.filter((i) => !i.sampleVerdict).length;
    console.log(`stand: ${inSample.length - open - fout} goed · ${fout} fout · ${open} open (van ${na.length} items totaal)`);
    if (fout > 0) {
      console.log(
        `\n⚠️  Er staat een 'fout'-oordeel. Afgesproken regel: één fout op een landende rij ⇒ de\n` +
          `   HELE run afwijzen, niet publiceren met een uitzondering. Reden: een 'fout' laat in\n` +
          `   publishRun alleen díé ene rij vallen, terwijl alle producten met dezelfde naamvorm\n` +
          `   de fout alsnog krijgen — en groepsverwerping op naamvorm kan niet, want 104 van de\n` +
          `   676 CRI-vormen dragen meerdere waarden.`,
      );
    }
    return;
  }

  console.log(
    "gebruik:\n" +
      "  verrijk-xal.ts start [--merk=XAL] [--veld=cri]\n" +
      "  verrijk-xal.ts toon <runId>\n" +
      "  verrijk-xal.ts keur <runId> goed|fout <nr,nr,…|alles>",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
