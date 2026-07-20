// Sprint 1.4 — testmerk voor de end-to-end-verificatie van het merkretourpad.
//
//   bun --env-file=.env.local scripts/testmerk-1-4.ts create
//   bun --env-file=.env.local scripts/testmerk-1-4.ts expire
//
// WAAROM EEN TESTMERK. Het acceptatiecriterium eist "zichtbaar in scorecard én catalogus".
// Catalogus-zichtbaarheid vereist een GELDIGE PRIJS (ijzeren regel 3, visible_products). Een
// prijs verzinnen op een echt merk is de fout van 20 jul — plausibele specs op een écht
// Flos-product, via het pad dat "het merk leverde dit aan" betekent. Op een testmerk is er
// geen waarheid om tegen te liegen: alles eraan is per constructie herkenbaar test.
//
// WAAROM TWEE COMMANDO'S IN ÉÉN SCRIPT. De briefing gaat ervan uit dat een prijslijst laten
// verlopen een bestaand pad is. Dat is het niet: archivePriceList (lib/repo/price-archive.ts:14)
// zet replaced_at en DELETE't de prijsregels — dat omzeilt regel 3 in plaats van hem te
// demonstreren, en vernietigt het bewijs dat het verlopen (en niets anders) het product
// onzichtbaar maakte. Het verlopen moet dus een UPDATE zijn, en ijzeren regel 5 wil er een
// event bij. Vandaar 'expire' hier, in hetzelfde bestand — geen tweede script.
//
// NAAMGEVING IS DE EERSTE BESCHERMING, EN HET GAAT OM MEER DAN DE MERKNAAM:
//   • artikelcode — fetchCandidates stap 3a (lib/matching/engine.ts:266) doet een exacte
//     SKU-match die NIET merk-gescoped is. ZZTEST-LL14-xxxx kan niet botsen met echte codes
//     (Lp301, L004, Ad, C1, F1077009); getoetst tegen productie, ook genormaliseerd.
//   • merknaam — engine.ts:294 vergelijkt met LIKE '%query%', een SUBSTRING. De naam uit de
//     briefing ("ZZ-TEST Lumen Logic") matcht daarom op een spec-regel met merktekst "Lumen".
//     Vandaar ZZTEST QA-14: geen verlichtings- of merkwoord erin.
//   • productnaam — engine.ts:288 laat 3b MERKLOOS over alle zichtbare producten zoeken zodra
//     een regel wel producttekst maar geen merktekst heeft. Vandaar codeachtige productnamen
//     in de fixture, zonder "spot", "downlight" of "LED".
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brands, priceLists } from "@/db/schema";
import { logEvent } from "@/lib/repo/events";

const ACTOR = "script:1.4-testmerk";

const NAAM = "ZZTEST QA-14";
const SLUG = "zztest-qa-14";
const BRAND_CODE = "ZZTEST";

async function vindTestmerk() {
  const [merk] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.slug, SLUG));
  return merk;
}

// ── create ──────────────────────────────────────────────────────────────────
// Alleen een rij in `brands`. GEEN brand_relations-rij: stageTemplateReturn maakt die zelf
// aan bij de upload, mét brand_relation_status_changed-event (lib/repo/template-return.ts:107).
// Zelf aanmaken zou een schrijfactie zonder event zijn die niets toevoegt — en het zou de
// eerste statusovergang van de keten uit het audit-spoor halen.
//
// Idempotent via een expliciete lookup op slug, niet via onConflictDoNothing: `brands` heeft
// geen unieke natuurlijke sleutel (brand_code is expliciet niet uniek, slug evenmin).
async function create() {
  const bestaand = await vindTestmerk();
  if (bestaand) {
    console.log(`Bestaat al: ${bestaand.name}  id=${bestaand.id}`);
    return;
  }

  // brands.id heeft GEEN defaultRandom() (db/schema.ts:181) — zelf genereren.
  const id = crypto.randomUUID();
  await db.insert(brands).values({
    id,
    name: NAAM,
    slug: SLUG,
    brandCode: BRAND_CODE,
    country: "ZZ",
    // description_nl, niet notes: `brands` heeft geen notes-kolom (die hoort bij suppliers).
    // Drizzle liet een onbekende sleutel hier stil vallen — pas tsc ving het.
    descriptionNl:
      "Testmerk sprint 1.4 (end-to-end-verificatie merkretourpad). Geen echt merk; " +
      "prijzen zijn verzonnen en daarom expliciet toegestaan. Uitschakelen gebeurt door de " +
      "prijslijst te laten verlopen (ijzeren regel 3), nooit met DELETE.",
  });

  // Geen enkel bestaand pad maakt merken aan, dus er is geen bestaande actie-naam om bij aan
  // te sluiten. Regel 5 wil hoe dan ook een spoor van waar dit merk vandaan komt.
  await logEvent(db, {
    entity: "brand",
    entityId: id,
    action: "brand_created_for_test",
    actor: ACTOR,
    payload: { name: NAAM, slug: SLUG, sprint: "1.4", reden: "end-to-end-verificatie" },
  });

  console.log(`Aangemaakt: ${NAAM}  id=${id}`);
}

// ── expire ──────────────────────────────────────────────────────────────────
// DE UITSCHAKELAAR, en tegelijk meting 4. Zet valid_until in het verleden; raakt replaced_at
// niet en verwijdert niets. Gevolg: de producten vallen uit visible_products en daarmee uit
// álle zoekresultaten en de matcher, terwijl het audit-spoor heel blijft (regel 5).
//
// current_date - 7, NIET current_date: de view test `valid_until >= CURRENT_DATE` en dat is
// INCLUSIEF (db/migrations/0004_vijfstatussen.sql:241). Op vandaag zetten laat het product
// gewoon zichtbaar — de meest waarschijnlijke stille mislukking van deze stap.
//
// De partiële index price_lists_brand_active_uniq (db/schema.ts:358) is op
// brand_id WHERE replaced_at IS NULL; een UPDATE van alleen valid_until kan hem niet schenden.
async function expire() {
  const merk = await vindTestmerk();
  if (!merk) {
    console.error(`Testmerk ${SLUG} niet gevonden — draai eerst 'create'.`);
    process.exit(1);
  }

  const bijgewerkt = await db
    .update(priceLists)
    .set({ validUntil: sql`current_date - 7` })
    .where(and(eq(priceLists.brandId, merk.id), isNull(priceLists.replacedAt)))
    .returning({
      id: priceLists.id,
      name: priceLists.name,
      validFrom: priceLists.validFrom,
      validUntil: priceLists.validUntil,
      replacedAt: priceLists.replacedAt,
    });

  if (bijgewerkt.length === 0) {
    console.error("Geen actieve prijslijst voor dit merk — niets te laten verlopen.");
    process.exit(1);
  }

  for (const lijst of bijgewerkt) {
    await logEvent(db, {
      entity: "price_list",
      entityId: lijst.id,
      action: "price_list_expired_manually",
      actor: ACTOR,
      payload: {
        brandId: merk.id,
        name: lijst.name,
        validFrom: lijst.validFrom,
        validUntil: lijst.validUntil,
        reden: "sprint 1.4 — uitschakelaar via ijzeren regel 3, geen DELETE",
      },
    });
    console.log(
      `Verlopen: ${lijst.name}  valid_from=${lijst.validFrom} valid_until=${lijst.validUntil} replaced_at=${lijst.replacedAt}`,
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== "create" && cmd !== "expire") {
    console.error("Gebruik: bun scripts/testmerk-1-4.ts <create|expire>");
    process.exit(1);
  }
  await (cmd === "create" ? create() : expire());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
