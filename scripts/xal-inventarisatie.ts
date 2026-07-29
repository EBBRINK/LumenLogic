// Nulmeting van de spec-vulling (fase 1, docs/probleem-lege-speckolommen-xal.md).
// STRIKT READ-ONLY: alleen selects, geen insert/update/delete, geen events.
//
// Draaien — uitsluitend tegen de Neon-branch:
//   bun --env-file=.env.branch scripts/xal-inventarisatie.ts [--merk=XAL] [--json]
//
// Meet met de ECHTE functies, niet met nagebouwde logica: parseProductName is de parser die
// startEnrichmentRun ook gebruikt, en pickSampleIndices/nameShape zijn letterlijk de
// steekproefkeuze uit lib/repo/enrichment.ts. Een eigen regex of een eigen sample-benadering
// zou een ander getal opleveren dan de pijplijn straks doet — precies de val uit
// docs/probleem-variant-ranking.md.

import { eq, ilike, sql } from "drizzle-orm";
import { brands, products } from "@/db/schema";
import { FIELDS, parseProductName } from "@/lib/enrichment/parser";
import { nameShape, pickSampleIndices } from "@/lib/repo/enrichment";
import { assertBranchDb, logGuard } from "./branch-guard";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const merkArg = argv.find((a) => a.startsWith("--merk="))?.slice(7) ?? "XAL";

// numeric-kolommen komen als string terug; vergelijk numeriek waar dat kan.
function sameValue(field: string, parsed: string, column: unknown): boolean {
  if (column == null) return false;
  const a = Number(parsed);
  const b = Number(column);
  if (!Number.isNaN(a) && !Number.isNaN(b)) return Math.abs(a - b) < 1e-9;
  return String(column).trim().toLowerCase() === parsed.trim().toLowerCase();
}

async function main() {
  logGuard(await assertBranchDb(process.cwd()));

  // Pas ná de poort de client aanmaken: `db/client.ts` bouwt bij import meteen een verbinding
  // rond process.env.DATABASE_URL. Met een statische import zou dat gebeuren vóór de guard —
  // niet gevaarlijk (neon() is lui, er gaat nog geen verkeer heen), maar de volgorde hoort te
  // kloppen: eerst bewijzen dat dit een branch is, dan pas een client maken.
  const { db } = await import("@/db/client");

  // ── Merk ────────────────────────────────────────────────────────────────────
  const merken = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(ilike(brands.name, `%${merkArg}%`));
  if (merken.length === 0) throw new Error(`geen merk gevonden op '${merkArg}'`);
  if (merken.length > 1) {
    console.log(`⚠️  meerdere merken matchen '${merkArg}':`, merken.map((m) => m.name).join(", "));
  }
  const merk = merken[0];

  // ── Globale nulstand per veld (alle merken) ────────────────────────────────
  const [globaal] = await db
    .select({
      producten: sql<number>`count(*)`,
      cri: sql<number>`count(${products.cri})`,
      kelvin: sql<number>`count(${products.kelvin})`,
      ipValue: sql<number>`count(${products.ipValue})`,
      maxWattage: sql<number>`count(${products.maxWattage})`,
      lumenOutput: sql<number>`count(${products.lumenOutput})`,
      beamAngle: sql<number>`count(${products.beamAngle})`,
      dimmable: sql<number>`count(${products.dimmable})`,
    })
    .from(products);

  // ── Alle producten van het merk, met de zeven matchvelden ──────────────────
  const rijen = await db
    .select({
      id: products.id,
      name: products.name,
      cri: products.cri,
      kelvin: products.kelvin,
      ipValue: products.ipValue,
      maxWattage: products.maxWattage,
      lumenOutput: products.lumenOutput,
      beamAngle: products.beamAngle,
      dimmable: products.dimmable,
      tier2Source: products.tier2Source,
    })
    .from(products)
    .where(eq(products.brandId, merk.id));

  // ── Parse — exact wat startEnrichmentRun zou voorstellen ───────────────────
  type Item = { productName: string; field: string; value: string; opLegeKolom: boolean };
  const items: Item[] = [];
  const perVeld: Record<string, { gevuld: number; geparsed: number; opLege: number; toetsbaar: number; gelijk: number }> =
    Object.fromEntries(FIELDS.map((f) => [f, { gevuld: 0, geparsed: 0, opLege: 0, toetsbaar: 0, gelijk: 0 }]));

  // Spreiding van de winst per product: hoeveel lege velden krijgt dít product erbij? Dat is de
  // maat voor de rangverschuiving door ongelijke naamdekking (zie het probleemdoc). Krijgt elk
  // product er even veel bij, dan verschuift niemand ten opzichte van zijn buren; krijgt de ene
  // familie er zeven en de andere nul, dan is het verschil tot 7 × SPEC_COEFF = 1,05.
  const winstPerProduct = new Array(FIELDS.length + 1).fill(0) as number[];
  // Waar parser en bronkolom uiteenlopen. Dat zijn de enige plekken waar de parser aantoonbaar
  // iets anders leest dan de fabrikant zelf opgaf — elk geval is de moeite van het bekijken waard.
  const afwijkingen: { naam: string; field: string; parser: string; kolom: string }[] = [];

  for (const r of rijen) {
    const rec = r as unknown as Record<string, unknown>;
    const specs = parseProductName(r.name);
    let winst = 0;
    for (const field of FIELDS) {
      const kolom = rec[field];
      const leeg = kolom == null || kolom === "";
      if (!leeg) perVeld[field].gevuld++;
      const v = specs[field];
      if (v === undefined) continue;
      perVeld[field].geparsed++;
      if (leeg) {
        perVeld[field].opLege++;
        winst++;
      } else {
        // Gratis validatie: waar de kolom al gevuld is, kunnen we de parser toetsen zonder mens.
        perVeld[field].toetsbaar++;
        if (sameValue(field, String(v), kolom)) perVeld[field].gelijk++;
        else afwijkingen.push({ naam: r.name, field, parser: String(v), kolom: String(kolom) });
      }
      items.push({ productName: r.name, field, value: String(v), opLegeKolom: leeg });
    }
    winstPerProduct[winst]++;
  }

  // ── Herkomst van wat er AL staat ────────────────────────────────────────────
  // Zonder dit is "parser gelijk aan kolom" een cirkelredenering: als die kolom ooit dóór deze
  // parser is gevuld (tier2_source = 'parsed-from-name'), reproduceert hij alleen zijn eigen
  // werk. Alleen kolommen met een ANDERE herkomst — of zonder stempel, dus uit de import —
  // zijn een onafhankelijke toets.
  const herkomst: Record<string, Record<string, number>> = Object.fromEntries(
    FIELDS.map((f) => [f, {} as Record<string, number>]),
  );
  for (const r of rijen) {
    const rec = r as unknown as Record<string, unknown>;
    const src = (r.tier2Source ?? {}) as Record<string, string>;
    for (const field of FIELDS) {
      const kolom = rec[field];
      if (kolom == null || kolom === "") continue;
      const bron = src[field] ?? "import (geen stempel)";
      herkomst[field][bron] = (herkomst[field][bron] ?? 0) + 1;
    }
  }

  // ── Steekproefdekking — met de echte keuzefunctie ──────────────────────────
  const sample = pickSampleIndices(items);
  // Hoeveel van de 100 reviewplekken gaan over data die daadwerkelijk landt? createRun
  // sampleert over álle voorstellen, ook die op een al gevulde kolom vallen en dus door
  // publishRun genegeerd worden (enrichment.ts:429). Elke zo'n rij is een reviewplek die
  // niets bewaakt.
  const sampleOpLege = [...sample].filter((i) => items[i].opLegeKolom).length;
  const samplePerVeld: Record<string, number> = {};
  for (const i of sample) {
    samplePerVeld[items[i].field] = (samplePerVeld[items[i].field] ?? 0) + 1;
  }
  const strata = new Set(items.map((i) => `${i.field}|${nameShape(i.productName)}`));
  const strataInSample = new Set(
    [...sample].map((i) => `${items[i].field}|${nameShape(items[i].productName)}`),
  );

  const resultaat = {
    merk: merk.name,
    productenTotaalAlleMerken: Number(globaal.producten),
    gevuldAlleMerken: Object.fromEntries(
      FIELDS.map((f) => [f, Number((globaal as unknown as Record<string, number>)[f])]),
    ),
    productenVanMerk: rijen.length,
    perVeld,
    items: items.length,
    itemsOpLegeKolom: items.filter((i) => i.opLegeKolom).length,
    strata: strata.size,
    steekproef: sample.size,
    strataGezien: strataInSample.size,
    winstPerProduct,
    herkomst,
    sampleOpLege,
    samplePerVeld,
  };

  if (asJson) {
    console.log(JSON.stringify(resultaat, null, 2));
    return;
  }

  console.log(`\n── ${merk.name} · ${rijen.length} producten ─────────────────────────────`);
  console.log(`database totaal: ${resultaat.productenTotaalAlleMerken} producten\n`);
  console.log("veld          kolom gevuld   parser vindt   → op lege kolom   toetsbaar/gelijk");
  for (const f of FIELDS) {
    const p = perVeld[f];
    const toets = p.toetsbaar > 0 ? `${p.gelijk}/${p.toetsbaar} (${Math.round((100 * p.gelijk) / p.toetsbaar)}%)` : "—";
    console.log(
      `${f.padEnd(13)} ${String(p.gevuld).padStart(12)} ${String(p.geparsed).padStart(14)} ${String(p.opLege).padStart(17)}   ${toets}`,
    );
  }
  if (afwijkingen.length > 0) {
    console.log(`\nparser ≠ bronkolom (${afwijkingen.length}):`);
    for (const a of afwijkingen.slice(0, 15)) {
      console.log(`  [${a.field}] parser ${a.parser} vs kolom ${a.kolom} — ${a.naam}`);
    }
  }

  console.log(`\nherkomst van wat er AL staat (tier2_source):`);
  for (const f of FIELDS) {
    const bronnen = Object.entries(herkomst[f]);
    if (bronnen.length === 0) continue;
    console.log(`  ${f.padEnd(13)} ${bronnen.map(([b, n]) => `${b}: ${n}`).join(" · ")}`);
  }

  console.log(`\ngevuld over ALLE merken:`);
  for (const f of FIELDS) {
    console.log(`  ${f.padEnd(13)} ${resultaat.gevuldAlleMerken[f]}`);
  }
  console.log(
    `\nvoorstellen: ${resultaat.items} items, waarvan ${resultaat.itemsOpLegeKolom} op een lege kolom` +
      ` (alleen die worden toegepast — publishRun overschrijft nooit)`,
  );
  // De spreiding, met de rangverschuiving die erbij hoort: n velden × SPEC_COEFF (0,15).
  console.log(`\nspreiding van de winst (rangverschuiving door ongelijke naamdekking):`);
  for (const [n, aantal] of winstPerProduct.entries()) {
    if (aantal === 0) continue;
    const pct = ((100 * aantal) / rijen.length).toFixed(1);
    console.log(
      `  ${n} veld(en) erbij: ${String(aantal).padStart(6)} producten (${pct.padStart(5)}%)` +
        `  → +${(n * 0.15).toFixed(2)} in de sorteersleutel`,
    );
  }

  console.log(
    `\nsteekproef: ${resultaat.steekproef} rijen uit ${resultaat.strata} naamvorm-strata` +
      ` → ${resultaat.strataGezien} vormen gezien (${((100 * resultaat.strataGezien) / resultaat.strata).toFixed(1)}%)`,
  );
  console.log(
    `ongezien: ${resultaat.items - resultaat.steekproef} items in ${resultaat.strata - resultaat.strataGezien} vormen` +
      ` worden gepubliceerd zonder dat iemand die vorm heeft beoordeeld.`,
  );
  console.log(
    `waarvan zinvol: ${sampleOpLege} van de ${sample.size} reviewplekken gaan over een item dat` +
      ` DAADWERKELIJK landt; de andere ${sample.size - sampleOpLege} vallen op een al gevulde` +
      ` kolom en bewaken dus niets.`,
  );
  console.log(
    `steekproef per veld: ${Object.entries(samplePerVeld).map(([f, n]) => `${f}: ${n}`).join(" · ")}\n`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
