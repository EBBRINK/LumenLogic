// Kan een Serien-vulling op de testcases überhaupt iets veranderen?
//
// Deze vraag staat vóór de bouw, want hij kan de bewijsvoering van de proef doden. Bij XAL bleken
// maar 4 van de 31 raadhuis-regels een XAL-kandidaat te hebben, en dát bepaalde wat de nameting
// kon zien (docs/probleem-lege-speckolommen-xal.md).
//
// De meting gaat in twee stappen, van goedkoop-en-beslissend naar duur-en-precies:
//   1. IS SERIEN ZICHTBAAR? `visible_products` is de kandidatenbron van de matcher, en ijzeren
//      regel 3 zegt: verlopen prijslijst = product onzichtbaar in álle zoekresultaten. Staat
//      Serien daar niet in, dan kan geen enkele regel een Serien-kandidaat hebben en is de vraag
//      beslecht zonder één matcher-call.
//   2. Alleen als Serien wél zichtbaar is: hoeveel Serien-producten haalt de ÉCHTE
//      `evaluateSpecLine` binnen als kandidaat, per opgeslagen spec-regel van raadhuis en tno.
//      Geen nagebouwde query — exact de functie die de eval en de app gebruiken.
//
// STRIKT READ-ONLY: uitsluitend selects, plus evaluateSpecLine (die alleen selects doet).
// Draaien: bun --env-file=.env.branch scripts/serien-kandidaat-check.ts

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { brands, priceLists, products, specLines, visibleProducts } from "../db/schema";
import { assertBranchDb, logGuard } from "./branch-guard";

const MERK = "Serien Lighting";

async function main(): Promise<void> {
  logGuard(await assertBranchDb());

  // ── Stap 1: zichtbaarheid ──────────────────────────────────────────────────
  const [merk] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.name, MERK))
    .limit(1);
  if (!merk) {
    console.log(`\n❌ Merk "${MERK}" bestaat niet in brands op deze database.`);
    return;
  }

  const [{ n: totaal }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.brandId, merk.id));

  const [{ n: zichtbaar }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, merk.id));

  const lijsten = await db
    .select({
      id: priceLists.id,
      validFrom: priceLists.validFrom,
      validUntil: priceLists.validUntil,
    })
    .from(priceLists)
    .where(eq(priceLists.brandId, merk.id));

  console.log(`\n══ ${merk.name}`);
  console.log(`   producten in de catalogus : ${totaal}`);
  console.log(`   zichtbaar (visible_products): ${zichtbaar}`);
  console.log(
    `   prijslijsten: ${
      lijsten.length === 0
        ? "GEEN"
        : lijsten
            .map((l) => `${l.validFrom} → ${l.validUntil ?? "open"}`)
            .join(" · ")
    }`,
  );

  if (Number(zichtbaar) === 0) {
    console.log(
      `\n🔒 BESLECHT ZONDER MATCHER-CALL: Serien staat op 0 zichtbare producten. ` +
        `visible_products is de kandidatenbron, dus geen enkele spec-regel — van welk dossier ` +
        `ook — kan een Serien-kandidaat hebben. Een Serien-vulling kan op de testcases dus niets ` +
        `veranderen, ongeacht welke velden we vullen.`,
    );
    return;
  }

  // ── Stap 2: kandidaten per opgeslagen spec-regel ───────────────────────────
  // Alleen bereikt als Serien zichtbaar is. Gebruikt de échte matcher-functie.
  const { evaluateSpecLine } = await import("../lib/matching/engine");
  type SpecRequestLike = Parameters<typeof evaluateSpecLine>[1];

  // SpecRequest in exact de specRequestFromLine-vorm (lib/repo/matching.ts) — hier niet
  // geïmporteerd omdat die module logEvent/runMatcher meebrengt en dit script contractueel
  // niets uit de schrijvende repo-laag haalt. Anders dan bij eval-testset komen de numeric-
  // kolommen hier als STRING uit de DB, dus de Number()-conversies zijn wél nodig.
  const num = (v: unknown): number | null =>
    v == null || v === "" ? null : Number(v);
  const toSpecRequest = (l: typeof specLines.$inferSelect): SpecRequestLike =>
    ({
      brandText: l.brandText ?? null,
      productText: l.productText ?? null,
      sku: null,
      specs: {
        kelvin: l.reqKelvin ?? null,
        cri: l.reqCri ?? null,
        ip: l.reqIp ?? null,
        watt: num(l.reqWatt),
        lumen: l.reqLumen ?? null,
        beamAngle: num(l.reqBeamAngle),
        sizeCm: num(l.reqSizeCm),
        shape: l.reqShape ?? null,
        color: l.reqColor ?? null,
        dimmable: l.reqDimmable ?? null,
      },
    }) as SpecRequestLike;

  // Filter op DOSSIER, niet op fixtureCode: codes als `Lr301` komen in tien dossiers voor en een
  // filter op code alleen gaf op het XAL-spoor 76 "tno-regels" in plaats van 20.
  const dossiers = await db
    .select({ id: specLines.dossierId, n: sql<number>`count(*)` })
    .from(specLines)
    .groupBy(specLines.dossierId);
  console.log(`\n   dossiers met spec-regels: ${dossiers.length}`);

  // Rang-limiet 50, gelijk aan de --rank-limit-default van scripts/eval-testset.ts, zodat
  // "is Serien kandidaat" dezelfde horizon gebruikt als de meting straks.
  const LIMIET = 50;
  let regelsMetSerien = 0;
  let regelsTotaal = 0;
  const treffers: string[] = [];
  for (const d of dossiers) {
    if (!d.id) continue;
    const regels = await db
      .select()
      .from(specLines)
      .where(and(eq(specLines.dossierId, d.id)));
    for (const regel of regels) {
      regelsTotaal++;
      const uitkomst = await evaluateSpecLine(db, toSpecRequest(regel), {
        limit: LIMIET,
      });
      const kandidaten = [...uitkomst.provable, ...uitkomst.incomplete] as {
        brandName?: string | null;
      }[];
      const serien = kandidaten.filter((k) => k.brandName === MERK).length;
      if (serien > 0) {
        regelsMetSerien++;
        treffers.push(
          `dossier ${d.id.slice(0, 8)} · ${regel.fixtureCode} · status ${uitkomst.status} ` +
            `→ ${serien} Serien van ${kandidaten.length} kandidaten`,
        );
      }
    }
  }
  console.log(
    `\n   ${regelsMetSerien} van ${regelsTotaal} opgeslagen spec-regels heeft ≥1 Serien-kandidaat ` +
      `(limiet ${LIMIET}).`,
  );
  for (const t of treffers) console.log(`   ⚠️  ${t}`);
  if (regelsMetSerien === 0) {
    console.log(
      `\n🔒 Serien is zichtbaar, maar komt op GEEN ENKELE opgeslagen spec-regel als kandidaat ` +
        `binnen. Een Serien-vulling kan de gemeten uitkomsten dus niet bewegen — dat is een ` +
        `echte beperking van deze proef, geen detail.`,
    );
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
