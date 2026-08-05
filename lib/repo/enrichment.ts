// Verrijkingspijplijn (H-03…H-09, run 5): de data-werkbank die lege matchvelden vult.
//
// Karpathy's laag-model in het klein: de deterministische naam-parser (lib/enrichment/parser)
// leest specs uit de productnaam en stelt ze VOOR; een mens toetst een steekproef; pas na
// publicatie landen ze op de producten. Nooit stilzwijgend muteren, altijd een menselijke
// poort — precies de review-gate-gedachte, hier voor catalogusdata.
//
// Ijzeren regels die hier leven:
//   • Ontbrekend ≠ fout: de parser gokt niet, en publiceren vult UITSLUITEND lege velden —
//     bestaande (echte) data wordt nooit overschreven.
//   • Herkomst zichtbaar (H-09): elk gevuld veld krijgt products.tier2_source[field] = 'parsed-from-name'.
//   • Geen prijs in de ranking: verrijking raakt alleen technische velden, nooit commercie.
//
// LLM-restgroep: bewust NIET geïmplementeerd — er is geen API-key. Alle items dragen daarom
// source 'parsed-from-name'. Een LLM-route (source 'llm') voor de namen waar de parser niets
// uit haalt, is een latere stap: dezelfde tabellen, dezelfde steekproef-gate, ander source-label.

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  brandAliases,
  brandLoadQueue,
  brands,
  enrichmentItems,
  enrichmentRuns,
  priceLists,
  prices,
  products,
  specLines,
} from "@/db/schema";
import type { BrandLifecycle } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { runMatcher } from "./matching";
import { brandKeyOf } from "@/lib/matching/engine";
import { FIELDS, parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { OPTIC_SOURCE, opticBeamAngle } from "@/lib/enrichment/optic-code";
import { isUuid } from "@/lib/uuid";

// De parser-veldnamen komen 1-op-1 overeen met de kolomnamen in products (db/schema.ts),
// dus een geparste key kan rechtstreeks als drizzle-set-sleutel dienen. Alleen de coërcie
// naar het kolomtype verschilt: integer-kolommen willen een number, numeric/text een string.
const INTEGER_FIELDS = new Set(["kelvin", "cri", "lumenOutput"]);

// De statussen die bij (her)inladen opnieuw gematcht worden: blauw (merk was nog niet
// ingeladen) en open (nog niet gematcht). Groen/geel/rood/paars zijn bewuste uitkomsten
// die we niet zomaar overschrijven.
const REMATCHABLE = ["blauw", "open"] as const;

// ── De steekproefpoort (gerepareerd 20 jul) ──────────────────────────────────
// Vóór deze reparatie was de steekproef `index % 3 === 0`: ~30% van álles, wat voor XAL
// ~4.500 reviewrijen betekende. Niemand controleert 4.500 rijen, dus de "menselijke poort"
// werd in de praktijk doorgeklikt — erger dan geen poort, want hij wekt vertrouwen dat er
// niet is. Twee dingen zijn daarom veranderd:
//
//   1. BEGRENSD + GESTRATIFICEERD (hieronder): maximaal SAMPLE_MAX rijen, verdeeld over
//      distinct naamvormen in plaats van over de invoegvolgorde. 100 rijen die elk een ánder
//      naampatroon tonen vangen een systematische parserfout veel eerder dan 4.500 rijen die
//      voor 90% dezelfde vorm hebben.
//   2. ECHT BINDEND (assertSampleReviewed, gebruikt door publishRun): publiceren mag pas als
//      de héle steekproef een oordeel heeft. Voorheen blokkeerde alleen een expliciete 'fout'
//      één enkel item en publiceerde de rest — inclusief alle ongereviewde — gewoon mee.
const SAMPLE_MAX = 100;

// ── De voorstelpoort (30 jul) ────────────────────────────────────────────────
// `lib/enrichment/verdenking.ts` bestond al — 201 regels met een eigen testbestand — en hing aan
// NUL productiepaden: de enige aanroeper was een meetscript. Er lag dus een deterministisch
// voorfilter dat de pijplijn niet raadpleegde. Dat is nu aangesloten, maar NIET zoals het plan
// voorstelde, en het verschil is gemeten.
//
// Onderdrukken is niet gratis: een voorstel dat hier sneuvelt vult de kolom niet, en de kolom
// blijft leeg tot een andere bron hem claimt. Bij een VALSE verdenking gooien we dus een goede
// waarde weg. Daarom telt alleen wat aantoonbaar onbetrouwbaar is.
//
// ── Waarom `accessoire-context` er NIET in staat, met de meting erbij ────────
// Het is met 12.417 landende voorstellen verreweg de grootste vlag (87,7 % van alle 14.159), en
// het is aantoonbaar overwegend een valse positief. `ACCESSOIRE` in verdenking.ts matcht onder
// meer ADAPTER, DRIVER, INCL en EXCL ergens in de naam. Gemeten per merk
// (scripts/meet-accessoire-context.ts):
//   • Prado 1.870 vlaggen, waarvan **0,0 %** het onderdeel zélf is — 1.740 zijn "… - black
//     adapter", een variantsuffix die zegt dat het armatuur mét railadapter geleverd wordt;
//   • TossB 1.030 vlaggen, 2,7 % is het onderdeel zelf;
//   • Kreon 2.162 vlaggen, 4,3 % — de rest zijn module-armaturen met "driver excl./incl.".
// Onderdrukken op deze vlag zou dus duizenden juiste waarden weggooien. Hij blijft bestaan als
// ROUTERING voor de agent-zwerm ("kijk hier eerst"), niet als filter.
//
// `meerdere-protocollen` (51) staat er om dezelfde reden niet in: judgeDimmable doet substring
// in beide richtingen (lib/matching/tolerances.ts:119), dus een armatuur dat DALI én 0-10V kan,
// is met beide protocollen correct beschreven.
//
// Wat er wél in staat, en waarom — samen ~1.791 landende voorstellen:
//   bereik / tunable-white → de naam noemt een BEREIK; judgeKelvin eist exacte gelijkheid, dus
//     één representant kiezen maakt van een product dat 4000 K kán leveren een rode kandidaat.
//   meerdere-waarden      → de naam draagt twee verschillende getallen voor hetzelfde veld en de
//     parser nam de eerste. Dat is een muntworp, geen meting.
//   buiten-bereik         → "Board Time 360° 2.2K" levert beamAngle 360; dat is geen bundelhoek.
//   kantelhoek            → Prado's "spot adjustable … 20°pc": de graden kunnen de kantelhoek
//     zijn in plaats van de bundel.
//   afgekapt              → de naam houdt halverwege op, dus de laatste waarde kan onvolledig zijn.
//   onbekende-klasse      → "IP19"/"IP99" bestaat niet; een leesfout in de bron.
export const ONDERDRUKKENDE_VERDENKINGEN = new Set([
  "bereik",
  "tunable-white",
  "meerdere-waarden",
  "buiten-bereik",
  "kantelhoek",
  "afgekapt",
  "onbekende-klasse",
  // Het product is zélf een voeding/driver/trafo (naam-begin-anker in verdenking.ts). Geen
  // enkele spec daarvan beschrijft een armatuur, dus alle zeven velden zwijgen.
  "product-is-onderdeel",
]);

// ── Insert in blokken (30 jul) ───────────────────────────────────────────────
// createRun deed één bulk-insert van álle voorstellen. Bij XAL zijn dat er 13.407 (alleen CRI)
// tot 90.660 (alle velden) en dan faalt de query met "NeonDbError: Database request failed".
// Gemeten grens op de neon-HTTP-driver: 1.000 rijen gaat goed, 5.000 niet — en 5.000 rijen zijn
// 35.000 bindparameters, ruim onder de Postgres-limiet van 65.535. Het is dus de payload van de
// HTTP-request die knelt, niet het aantal parameters. 1.000 is de bewezen veilige maat.
export const INSERT_CHUNK = 1000;

// Deelt een lijst in blokken van `size`. Puur, zodat de grens testbaar is zonder database.
export function chunk<T>(items: T[], size: number = INSERT_CHUNK): T[][] {
  if (size < 1) throw new Error("chunkgrootte moet ≥ 1 zijn");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// De "vorm" van een productnaam: cijferreeksen → '#', kleinletters, witruimte genormaliseerd.
// "SASSO 100 FL 27W" en "SASSO 60 FL 9W" krijgen zo dezelfde vorm en vallen in één stratum,
// terwijl "ANDRO 160 LENS RD WF" een eigen stratum is. Zo koopt de steekproef breedte in
// naampatronen in plaats van in aantal.
export function nameShape(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

// Kies de te reviewen indices: gestratificeerd (round-robin over de strata, zodat elk
// naampatroon aan de beurt komt vóór een patroon een tweede rij krijgt) en begrensd op
// SAMPLE_MAX. Volledig deterministisch — gesorteerde strata, gesorteerde indices — zodat de
// UI, de test en een herhaalde run dezelfde rijen opleveren.
export function pickSampleIndices(
  items: { productName: string; field: string }[],
  max: number = SAMPLE_MAX,
): Set<number> {
  const strata = new Map<string, number[]>();
  items.forEach((it, i) => {
    const key = `${it.field}|${nameShape(it.productName)}`;
    const list = strata.get(key);
    if (list) list.push(i);
    else strata.set(key, [i]);
  });
  const keys = [...strata.keys()].sort();
  const chosen = new Set<number>();

  if (keys.length >= max) {
    // Méér naamvormen dan reviewplekken. Dan NIET simpelweg de eerste `max` vormen pakken:
    // die zijn alfabetisch geordend, dus de steekproef zou bij XAL van ANDRO tot INS lopen en
    // alles daarna (inclusief SASSO — precies de familie waar het om draait) nooit tonen.
    // Verdeel de plekken gelijkmatig over álle vormen, zodat de steekproef de hele catalogus
    // overspant. Deterministisch: dezelfde invoer → dezelfde vormen.
    for (let s = 0; s < max; s++) {
      chosen.add(strata.get(keys[Math.floor((s * keys.length) / max)])![0]);
    }
    return chosen;
  }

  // Minder vormen dan plekken: round-robin — ronde 0 pakt de eerste rij van elk stratum,
  // ronde 1 de tweede, enz. Zo krijgt elke vorm er één vóór een vorm er twee krijgt.
  for (let round = 0; chosen.size < Math.min(max, items.length); round++) {
    let progressed = false;
    for (const k of keys) {
      if (chosen.size >= max) break;
      const idx = strata.get(k)![round];
      if (idx === undefined) continue;
      chosen.add(idx);
      progressed = true;
    }
    if (!progressed) break; // alle strata uitgeput
  }
  return chosen;
}

// De poort met tanden: elke steekproefrij moet een menselijk oordeel dragen vóór publicatie.
// Gooit met een telling, zodat de UI kan zeggen hoeveel er nog openstaan.
async function assertSampleReviewed(db: AppDb, runId: string): Promise<void> {
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)` })
    .from(enrichmentItems)
    .where(
      and(
        eq(enrichmentItems.runId, runId),
        eq(enrichmentItems.inSample, true),
        isNull(enrichmentItems.sampleVerdict),
      ),
    );
  const n = Number(open);
  if (n > 0) {
    throw new Error(
      `steekproef nog niet volledig beoordeeld: ${n} rij(en) zonder oordeel. ` +
        `Publiceren kan pas als elke steekproefrij 'goed' of 'fout' is.`,
    );
  }
}

// De numeric-kolommen (db/schema.ts:275,279). Ze zijn GEEN integer, dus ze vielen buiten
// INTEGER_FIELDS — en daardoor gaf toColumnValue de rauwe string ongewijzigd door aan
// db.update(). Een cel "OHNE LM" op max_wattage werd zo pas bij Postgres geweigerd, midden in
// een publish-lus zonder transactie. Zie de Number.isFinite-toets hieronder.
const NUMERIC_FIELDS = new Set(["maxWattage", "beamAngle"]);

// Value-string (zoals opgeslagen in enrichment_items.value) → kolomwaarde voor products.
// Integer-kolommen krijgen een number; numeric-kolommen een getoetst getal; tekstkolommen de
// string zelf. null betekent: dit item overslaan.
//
// De numeric-toets is bewust hier en niet alleen in de bron-normalisator: dit is de laatste
// gedeelde plek vóór de database, en hij vangt élke bron af — ook een toekomstige die zijn
// eigen filter vergeet. Sinds de publish gebundeld is, is dat geen luxe meer maar dragend: één
// slechte waarde laat de héle bundel van honderden rijen falen in plaats van alleen zijn eigen
// rij.
function toColumnValue(field: string, value: string): number | string | null {
  if (INTEGER_FIELDS.has(field)) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return value;
}

// Is het matchveld op dit product nog leeg? (Alleen dan vult verrijking het.)
function fieldIsEmpty(
  product: Record<string, unknown>,
  field: string,
): boolean {
  const v = product[field];
  return v == null || v === "";
}

export type EnrichmentRun = typeof enrichmentRuns.$inferSelect;
export type EnrichmentItem = typeof enrichmentItems.$inferSelect;

// ── Start: parser over alle producten van één merk ───────────────────────────
// Draait parseProductName over elk product van het merk, schrijft één enrichment_items-rij
// per geparst veld (source 'parsed-from-name'), vlagt een begrensde steekproef, en maakt de
// bijbehorende enrichment_runs-rij (status 'steekproef'). Muteert nog NIETS aan products.
//
// `fields` beperkt de run tot een deel van de velden (default: alle). Waarom dat bestaat: bij
// XAL levert een volledige run 90.660 voorstellen waarvan er maar 16.856 landen, en de
// steekproef van 100 verdeelt zich dan over zeven velden — 85 van de 100 reviewplekken vielen
// op een al gevulde kolom die publishRun tóch negeert. Eén veld tegelijk maakt de steekproef
// dicht én houdt de meting falsifieerbaar (zie docs/plan-lege-speckolommen-xal.md: tno vraagt
// geen CRI en moet bij een CRI-run per constructie stilstaan).
export async function startEnrichmentRun(
  db: AppDb,
  brandId: string,
  actor?: string,
  fields: readonly (typeof FIELDS)[number][] = FIELDS,
): Promise<EnrichmentRun> {
  const [brand] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (!brand) throw new Error(`brand ${brandId} not found`);

  // Ook de zeven matchkolommen ophalen: een voorstel op een AL GEVULDE kolom kan nooit landen
  // (publishRun vult uitsluitend lege velden) en verwatert alleen de steekproef.
  const prods = await db
    .select()
    .from(products)
    .where(eq(products.brandId, brandId))
    .orderBy(asc(products.name));

  // parse → platte lijst van voorstel-items
  const parsed: {
    productId: string;
    productName: string;
    field: string;
    value: string;
  }[] = [];
  const gekozen = new Set<string>(fields);
  const onderdrukt: Record<string, number> = {};
  // Voorstellen die op een al gevulde kolom zouden vallen — geteld, niet stil weggelaten.
  const overgeslagen: Record<string, number> = {};
  for (const p of prods) {
    const specs = parseProductName(p.name);
    const vlaggen = verdenkingen(p.name, specs);
    for (const field of FIELDS) {
      if (!gekozen.has(field)) continue;
      const v = specs[field];
      if (v === undefined) continue;
      // ── Alleen voorstellen die kúnnen landen (30 jul) ────────────────────
      // Gemeten op Kreon: van 32.917 voorstellen konden er 21.359 (65 %) nooit landen omdat
      // kelvin en maxWattage al gevuld waren — en 64 van Timo's 100 STEEKPROEFRIJEN vielen op
      // zo'n kolom. Die rijen kosten hem zijn beurt zonder iets te kunnen bewijzen: publishRun
      // negeert ze hoe dan ook.
      //
      // Het veldfilter (`fields`) loste dit half op — het helpt alleen als je vooraf wéét welk
      // veld leeg is. Deze toets werkt altijd, en gebruikt dezelfde definitie van "leeg" als
      // publishRun (fieldIsEmpty), zodat de twee niet uiteen kunnen lopen.
      if (!fieldIsEmpty(p as Record<string, unknown>, field)) {
        overgeslagen[field] = (overgeslagen[field] ?? 0) + 1;
        continue;
      }
      // De voorstelpoort (zie ONDERDRUKKENDE_VERDENKINGEN): een aantoonbaar onbetrouwbaar
      // voorstel wordt hier geweerd in plaats van in de parser, zodat het MATCHGEDRAG van
      // spec-regels ongemoeid blijft — parseProductName voedt ook de aanvraagkant
      // (lib/pdf/armaturenboek.ts:131) en die mag hier niet stil mee veranderen.
      const blokkeer = vlaggen.find(
        (x) => x.veld === field && ONDERDRUKKENDE_VERDENKINGEN.has(x.soort),
      );
      if (blokkeer) {
        onderdrukt[`${field}:${blokkeer.soort}`] =
          (onderdrukt[`${field}:${blokkeer.soort}`] ?? 0) + 1;
        continue;
      }
      parsed.push({
        productId: p.id,
        productName: p.name,
        field,
        value: String(v),
      });
    }
  }

  return createRun(db, brand, prods.length, parsed, "parsed-from-name", actor, {
    onderdrukt,
    kolomAlGevuld: overgeslagen,
  });
}

// ── Start: gecureerde optiekcode → beam_angle voor één merk ──────────────────
// Zelfde pijplijn, andere bron. De waarden komen NIET uit de naam maar uit een handmatige
// vertaaltabel (lib/enrichment/optic-code.ts), en dragen daarom source 'optic-code' — zodat
// products.tier2_source per veld laat zien dat deze graden gecureerd zijn, niet geparsed.
// Stelt alleen voor; publishRun past pas toe, en alleen op LEGE beam_angle-kolommen.
export async function startOpticCodeRun(
  db: AppDb,
  brandId: string,
  actor?: string,
): Promise<EnrichmentRun> {
  const [brand] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (!brand) throw new Error(`brand ${brandId} not found`);

  const prods = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.brandId, brandId))
    .orderBy(asc(products.name));

  const proposals: Proposal[] = [];
  for (const p of prods) {
    const angle = opticBeamAngle(p.name);
    if (angle === undefined) continue;
    proposals.push({
      productId: p.id,
      productName: p.name,
      field: "beamAngle",
      value: String(angle),
    });
  }

  return createRun(db, brand, prods.length, proposals, OPTIC_SOURCE, actor);
}

type Proposal = {
  productId: string;
  productName: string;
  field: string;
  value: string;
};

// Gedeelde run-aanmaak voor beide bronnen: run-rij + items + gestratificeerde steekproef +
// event. Eén plek waar de steekproefpoort wordt toegepast, zodat een nieuwe bron hem niet
// per ongeluk kan omzeilen.
async function createRun(
  db: AppDb,
  brand: { id: string; name: string },
  productCount: number,
  proposals: Proposal[],
  source: string,
  actor?: string,
  // Extra telwerk voor het runrapport (jsonb, dus geen migratie). Vandaag: hoeveel voorstellen
  // de voorstelpoort geweerd heeft en om welke reden — een stil gefilterd voorstel moet
  // zichtbaar zijn, anders is "minder voorstellen" niet te onderscheiden van "minder data".
  extraCounts: Record<string, number | Record<string, number>> = {},
): Promise<EnrichmentRun> {
  const sampleIdx = pickSampleIndices(proposals);

  const [run] = await db
    .insert(enrichmentRuns)
    .values({
      brandId: brand.id,
      brandName: brand.name,
      status: "steekproef",
      counts: {
        producten: productCount,
        geparsed: proposals.length,
        steekproef: sampleIdx.size,
        ...extraCounts,
      } as Record<string, number>,
      actor: actor ?? null,
    })
    .returning();

  if (proposals.length > 0) {
    const rijen = proposals.map((it, i) => ({
      runId: run.id,
      productId: it.productId,
      productName: it.productName,
      field: it.field,
      value: it.value,
      source,
      inSample: sampleIdx.has(i),
    }));
    // In blokken: één insert van alles faalt op de HTTP-driver zodra het merk groot is.
    for (const blok of chunk(rijen)) {
      await db.insert(enrichmentItems).values(blok);
    }
  }

  await logEvent(db, {
    entity: "brand",
    entityId: brand.id,
    action: "enrichment_started",
    actor,
    payload: {
      runId: run.id,
      source,
      parsed: proposals.length,
      sample: sampleIdx.size,
    },
  });

  return run;
}

// De steekproef-items van een run (voor het controlescherm), in stabiele volgorde.
export async function getSampleItems(
  db: AppDb,
  runId: string,
): Promise<EnrichmentItem[]> {
  return db
    .select()
    .from(enrichmentItems)
    .where(
      and(
        eq(enrichmentItems.runId, runId),
        eq(enrichmentItems.inSample, true),
      ),
    )
    .orderBy(asc(enrichmentItems.productName), asc(enrichmentItems.field));
}

// Alle items van een run (steekproef + rest), voor detailweergave/telling.
export async function getRunItems(
  db: AppDb,
  runId: string,
): Promise<EnrichmentItem[]> {
  return db
    .select()
    .from(enrichmentItems)
    .where(eq(enrichmentItems.runId, runId))
    .orderBy(asc(enrichmentItems.productName), asc(enrichmentItems.field));
}

// Menselijk oordeel op één steekproef-item: 'goed' laat het straks toepassen, 'fout'
// sluit precies dít item uit bij publicatie.
// Regel 5 + FUNCTIONEEL-ONTWERP §6: dit is een MENSOORDEEL dat straks bepaalt of een
// veld gepubliceerd wordt (en het telt mee in de steekproef-foutratio) — dus met actor
// en met een spoor van wát er beoordeeld werd.
export async function setSampleVerdict(
  db: AppDb,
  itemId: string,
  verdict: "goed" | "fout",
  actor?: string,
): Promise<void> {
  const [item] = await db
    .select()
    .from(enrichmentItems)
    .where(eq(enrichmentItems.id, itemId))
    .limit(1);
  if (!item) return;
  await db
    .update(enrichmentItems)
    .set({ sampleVerdict: verdict })
    .where(eq(enrichmentItems.id, itemId));
  await logEvent(db, {
    entity: "enrichment_item",
    entityId: itemId,
    action: "enrichment_sample_verdict",
    actor,
    payload: {
      runId: item.runId,
      productName: item.productName,
      field: item.field,
      value: item.value,
      verdict,
    },
  });
}

// ── Toepassen in bundels (30 jul) ────────────────────────────────────────────
// De oude lus deed per product DRIE losse round-trips over de neon-HTTP-driver: een select,
// een update op products en een update op enrichment_items. Gemeten op de branch
// (scripts/meet-latentie.ts): 135–152 ms per round-trip, dus 13.407 XAL-producten = 90 minuten
// en de hele catalogus (106.691 producten) = 12,6 uur.
//
// Gemeten winst van bundelen op 500 echte producten (scripts/meet-bundeling.ts):
//   select : 131 ms/product los  →  1,86 ms/product gebundeld   (70×)
//   update : 133 ms/product los  →  0,59 ms/product gebundeld  (226×)
// Daarmee gaat de hele catalogus van 12,6 uur naar ~6,5 minuten.
//
// ── Twee dingen die de bundel VEILIGER maken dan de lus, niet alleen sneller ──
// 1. "Nooit overschrijven" wordt door de DATABASE afgedwongen, niet door een geheugentoets.
//    `coalesce(nullif(p.kolom,''), v.kolom)` houdt een bestaande waarde altijd vast, ook als
//    die tussen onze select en onze update door een andere schrijver is gezet. De oude lus las
//    eerst en schreef daarna: precies het venster waarin een live-write verloren gaat, en op
//    productie lopen die live-writes door.
// 2. `tier2_source` wordt per veld gestempeld met exact dezelfde voorwaarde als de vulling
//    (`case when <kolom leeg> and v.<kolom> is not null`). Een veld dat niet landt, krijgt dus
//    ook geen herkomststempel — in de oude lus kon dat uiteenlopen zodra er een race was.
//
// ── En één ding dat de bundel GEVAARLIJKER maakt, en waarom dat hier hoort ────
// Eén slechte waarde laat de héle bundel van honderden rijen falen in plaats van alleen zijn
// eigen rij. Daarom is de Number.isFinite-toets in toColumnValue hierboven geen nette
// toevoeging maar een voorwaarde: zonder die toets belandde een cel "OHNE LM" ongefilterd op
// een numeric-kolom.
const UPDATE_CHUNK = 500;

// De zeven matchvelden met hun kolomnaam en cast. `leegSql` drukt "deze kolom telt als leeg"
// uit — voor tekstkolommen inclusief de lege string, precies zoals fieldIsEmpty hierboven,
// zodat de geheugentoets en de databasetoets niet uiteen kunnen lopen.
const APPLY_FIELDS: {
  veld: string;
  kolom: string;
  cast: string;
  tekst: boolean;
}[] = [
  { veld: "kelvin", kolom: "kelvin", cast: "integer", tekst: false },
  { veld: "cri", kolom: "cri", cast: "smallint", tekst: false },
  { veld: "lumenOutput", kolom: "lumen_output", cast: "integer", tekst: false },
  { veld: "maxWattage", kolom: "max_wattage", cast: "numeric", tekst: false },
  { veld: "beamAngle", kolom: "beam_angle", cast: "numeric", tekst: false },
  { veld: "ipValue", kolom: "ip_value", cast: "text", tekst: true },
  { veld: "dimmable", kolom: "dimmable", cast: "text", tekst: true },
];

// "is deze kolom leeg?" als SQL-uitdrukking, met p als alias voor products.
function leegSql(f: (typeof APPLY_FIELDS)[number]) {
  return f.tekst
    ? sql.raw(`nullif(p.${f.kolom}, '')`)
    : sql.raw(`p.${f.kolom}`);
}

// Past de voorstellen toe in bundels en levert het aantal werkelijk gelande velden.
// Bewust een aparte functie: hij is los te testen én los te vergelijken met de trage lus.
async function applyProposals(
  db: AppDb,
  byProduct: Map<string, EnrichmentItem[]>,
): Promise<number> {
  let applied = 0;

  for (const blok of chunk([...byProduct.keys()], UPDATE_CHUNK)) {
    // 1. Eén select voor het hele blok in plaats van één per product.
    const huidig = await db
      .select()
      .from(products)
      .where(inArray(products.id, blok));
    const perId = new Map(huidig.map((p) => [p.id, p]));

    // 2. In het geheugen bepalen wat er per product te vullen valt.
    type Rij = {
      id: string;
      waarden: Record<string, number | string | null>;
      source: string;
      itemIds: string[];
      velden: string[];
    };
    const rijen: Rij[] = [];
    for (const productId of blok) {
      const product = perId.get(productId);
      if (!product) continue;
      const its = byProduct.get(productId)!;
      const waarden: Record<string, number | string | null> = {};
      const itemIds: string[] = [];
      const velden: string[] = [];
      let source = "";
      for (const it of its) {
        if (!fieldIsEmpty(product as Record<string, unknown>, it.field)) continue;
        const colVal = toColumnValue(it.field, it.value);
        if (colVal == null) continue;
        // Twee voorstellen voor hetzelfde veld op hetzelfde product: de eerste wint, net als
        // in de oude lus (die overschreef `update[it.field]` wél, maar telde het item dan
        // dubbel in appliedIds). Hier telt alleen het item dat werkelijk landt.
        if (waarden[it.field] !== undefined) continue;
        waarden[it.field] = colVal;
        itemIds.push(it.id);
        velden.push(it.field);
        source = it.source;
      }
      if (itemIds.length > 0) rijen.push({ id: productId, waarden, source, itemIds, velden });
    }
    if (rijen.length === 0) continue;

    // 3. Eén UPDATE … FROM (VALUES …) voor het hele blok.
    const values = sql.join(
      rijen.map(
        (r) =>
          sql`(${r.id}::uuid, ${r.source}::text, ${sql.join(
            APPLY_FIELDS.map(
              (f) => sql`${r.waarden[f.veld] ?? null}::${sql.raw(f.cast)}`,
            ),
            sql`, `,
          )})`,
      ),
      sql`, `,
    );
    const kolomNamen = sql.raw(
      ["id", "src", ...APPLY_FIELDS.map((f) => f.kolom)].join(", "),
    );
    const setDelen = sql.join(
      APPLY_FIELDS.map(
        (f) =>
          sql`${sql.raw(f.kolom)} = coalesce(${leegSql(f)}, v.${sql.raw(f.kolom)})`,
      ),
      sql`, `,
    );
    // Herkomst per veld, met exact dezelfde voorwaarde als de vulling hierboven.
    const stempel = sql.join(
      APPLY_FIELDS.map(
        (f) =>
          // ::text op de veldnaam is nodig: zonder cast kan Postgres het type van die
          // parameter niet afleiden (42P18) en weigert hij de hele query te plannen.
          sql`(case when ${leegSql(f)} is null and v.${sql.raw(f.kolom)} is not null
                    then jsonb_build_object(${f.veld}::text, v.src) else '{}'::jsonb end)`,
      ),
      sql` || `,
    );

    const terug = await db.execute(sql`
      update products p set ${setDelen},
        tier2_source = coalesce(p.tier2_source, '{}'::jsonb) || ${stempel},
        updated_at = now()
      from (values ${values}) as v(${kolomNamen})
      where p.id = v.id
      returning p.id, ${sql.raw(APPLY_FIELDS.map((f) => `p.${f.kolom}`).join(", "))}`);

    // 4. Alleen de items die WERKELIJK geland zijn als toegepast markeren. De database is
    //    hier de scheidsrechter, niet onze geheugentoets: raakte een kolom tussentijds
    //    gevuld door een andere schrijver, dan hield coalesce die waarde vast en hoort ons
    //    item niet op applied te staan.
    const na = new Map(
      ((terug.rows ?? []) as Record<string, unknown>[]).map((r) => [
        String(r.id),
        r,
      ]),
    );
    const gelandeItems: string[] = [];
    for (const r of rijen) {
      const rij = na.get(r.id);
      if (!rij) continue;
      r.velden.forEach((veld, i) => {
        const f = APPLY_FIELDS.find((x) => x.veld === veld)!;
        // numeric komt als string terug ("17.90"), integer als number — vergelijk op waarde.
        const geland = String(rij[f.kolom] ?? "");
        const bedoeld = String(r.waarden[veld] ?? "");
        if (geland !== "" && Number.isFinite(Number(geland)) && Number.isFinite(Number(bedoeld))
          ? Number(geland) === Number(bedoeld)
          : geland === bedoeld) {
          gelandeItems.push(r.itemIds[i]);
        }
      });
    }

    // 5. En de items in blokken bijwerken in plaats van per product.
    for (const itemBlok of chunk(gelandeItems, INSERT_CHUNK)) {
      await db
        .update(enrichmentItems)
        .set({ applied: true })
        .where(inArray(enrichmentItems.id, itemBlok));
    }
    applied += gelandeItems.length;
  }

  return applied;
}

// ── Publiceren: voorstellen toepassen op products + blauw/open hermatchen ─────
// Past alle items toe BEHALVE steekproef-items die als 'fout' gemarkeerd zijn. Vult
// uitsluitend nog-lege velden (nooit overschrijven), zet products.tier2_source per veld,
// legt de steekproef-foutratio vast, en hermatcht alle blauwe/open spec-regels van dit merk.
//
// ── De drempel (30 jul) ──────────────────────────────────────────────────────
// `assertSampleReviewed` eist dat elke steekproefrij ÉÉN oordeel draagt. Daarna sloot
// `toApply` alleen de individueel als 'fout' gemarkeerde rijen uit — en publiceerde de rest.
// Concreet: 40 fouten op 100 steekproefrijen blokkeerden 40 rijen en lieten de overige
// honderdduizend ongecontroleerde voorstellen onomkeerbaar door. De foutratio werd wél
// berekend en weggeschreven, maar nergens vergeleken. De poort was een telling, geen oordeel.
//
// De staande afspraak is strenger en stond al in twee documenten en in scripts/publiceer-run.ts:
// één 'fout' ⇒ de HELE run afwijzen. Reden: bij een deterministische bron is de verwachte
// foutratio 0; één fout betekent dat het foutmodel niet klopt, en dan is doorpubliceren met een
// uitzondering het verkeerde antwoord — alle producten met dezelfde naamvorm krijgen die fout
// alsnog, want de steekproef dekt maar 100 van de honderdduizenden rijen.
//
// Die afspraak staat nu in de gedeelde code in plaats van in een script dat je kunt overslaan.
// `maxSampleErrorRate` is bewust een parameter en geen constante: een bewuste uitzondering moet
// getypt worden bij de aanroep, zodat hij in de code van de aanroeper zichtbaar is.
export const DEFAULT_MAX_SAMPLE_ERROR_RATE = 0;

export async function publishRun(
  db: AppDb,
  runId: string,
  actor?: string,
  opts: { maxSampleErrorRate?: number } = {},
): Promise<{ run: EnrichmentRun; applied: number; rematched: number }> {
  const maxErrorRate = opts.maxSampleErrorRate ?? DEFAULT_MAX_SAMPLE_ERROR_RATE;
  const [run] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  if (!run) throw new Error(`enrichment run ${runId} not found`);
  if (run.status !== "steekproef") {
    // idempotent: al gepubliceerd/afgewezen → niets opnieuw toepassen
    return { run, applied: 0, rematched: 0 };
  }

  // De poort met tanden (20 jul): geen publicatie zolang er steekproefrijen zonder oordeel
  // zijn. Voorheen publiceerden ongereviewde items gewoon mee en blokkeerde alleen een
  // expliciete 'fout' één enkel item — de menselijke controle bestond dus alleen op papier.
  await assertSampleReviewed(db, runId);

  const items = await db
    .select()
    .from(enrichmentItems)
    .where(eq(enrichmentItems.runId, runId));

  // steekproef-foutratio (H-05): hoeveel van de gecontroleerde items waren fout?
  const sample = items.filter((i) => i.inSample);
  const sampleFout = sample.filter((i) => i.sampleVerdict === "fout").length;
  const errorRate = sample.length > 0 ? sampleFout / sample.length : 0;

  // De drempel: boven de grens publiceert niemand, ook niet gedeeltelijk. De run blijft op
  // 'steekproef' staan, dus rejectRun is nog mogelijk en er is niets toegepast.
  if (errorRate > maxErrorRate) {
    throw new Error(
      `steekproef-foutratio ${(errorRate * 100).toFixed(1)}% (${sampleFout} van ${sample.length}) ` +
        `ligt boven de grens van ${(maxErrorRate * 100).toFixed(1)}%. Publiceren geblokkeerd. ` +
        `Eén fout in de steekproef betekent dat het foutmodel niet klopt: de overige ` +
        `${items.length - sample.length} voorstellen zijn niet gecontroleerd en dragen ` +
        `waarschijnlijk dezelfde fout. Wijs de run af (rejectRun) en kijk wat er misgaat. ` +
        `Een bewuste uitzondering vergt maxSampleErrorRate expliciet bij de aanroep.`,
    );
  }

  // toe te passen: alles behalve expliciet als fout beoordeelde steekproef-items
  const toApply = items.filter(
    (i) => !(i.inSample && i.sampleVerdict === "fout"),
  );

  // per product groeperen zodat we één update per product doen (en tier2_source mergen)
  const byProduct = new Map<string, typeof toApply>();
  for (const it of toApply) {
    const list = byProduct.get(it.productId) ?? [];
    list.push(it);
    byProduct.set(it.productId, list);
  }

  const applied = await applyProposals(db, byProduct);

  await db
    .update(enrichmentRuns)
    .set({
      status: "gepubliceerd",
      sampleErrorRate: errorRate.toFixed(4),
      publishedAt: new Date(),
      counts: {
        ...((run.counts as Record<string, number> | null) ?? {}),
        toegepast: applied,
      },
      updatedAt: new Date(),
    })
    .where(eq(enrichmentRuns.id, runId));

  // Hermatchen: nu het merk verrijkt is kunnen blauwe/open regels van dit merk alsnog
  // groen/geel worden. runMatcher herbepaalt status + kandidaten per regel.
  const rematched = await rematchBrandLines(db, run.brandName, actor);

  await logEvent(db, {
    entity: "brand",
    entityId: run.brandId,
    action: "enrichment_published",
    actor,
    payload: { runId, applied, rematched, sampleErrorRate: errorRate },
  });

  const [updated] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  return { run: updated, applied, rematched };
}

// ── Terugdraaien na publicatie (30 jul) ──────────────────────────────────────
// "publishRun is onomkeerbaar" was een eigenschap van de GEBOUWDE CODE, niet van de data.
// `enrichment_items` draagt per gelande vulling `productId`, `field`, `value`, `source` en
// `applied`; `publishRun` stempelt bovendien `products.tier2_source[field] = source`. Dat is
// samen genoeg om precies terug te nemen wat deze run gezet heeft, en niets anders.
//
// Waarom dit meer is dan gemak: élke volgordebeslissing in dit dossier hing aan de aanname dat
// de eerste bron een kolom PERMANENT claimt (publishRun vult alleen lege velden). Met deze
// functie is die claim opzegbaar en wordt "verkeerd gekozen" een correctie in plaats van een
// ramp.
//
// ── De twee voorwaarden, en waarom ze allebei nodig zijn ─────────────────────
// Een veld wordt alleen leeggemaakt als:
//   1. de huidige kolomwaarde nog exact is wat deze run erin zette, EN
//   2. `tier2_source[field]` nog het source-label van dit item draagt.
// Wijkt één van beide af, dan heeft iets anders die kolom sindsdien aangeraakt — een latere
// run, een import, een handmatige correctie — en dan is het niet meer ónze waarde om terug te
// nemen. Zo'n veld blijft staan en wordt geteld als `overgeslagen`.
//
// ── Wat dit NIET is ──────────────────────────────────────────────────────────
// Geen vrijbrief om slordig te publiceren. De drempel op de foutratio hierboven bestaat juist
// zodat terugdraaien nooit het goedkoopste pad wordt: een run die de grens raakt komt er niet
// door, en hoeft dus ook niet teruggedraaid te worden. De volgorde is: eerst niet fout doen,
// dan pas kunnen herstellen.
export async function revertRun(
  db: AppDb,
  runId: string,
  actor?: string,
): Promise<{ teruggedraaid: number; overgeslagen: number } | null> {
  const [run] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  if (!run) return null;
  if (run.status !== "gepubliceerd") {
    throw new Error(
      `run heeft status '${run.status}' — terugdraaien kan alleen na publiceren. ` +
        `Vóór publicatie is rejectRun het juiste gereedschap.`,
    );
  }

  const items = await db
    .select()
    .from(enrichmentItems)
    .where(and(eq(enrichmentItems.runId, runId), eq(enrichmentItems.applied, true)));

  let teruggedraaid = 0;
  let overgeslagen = 0;
  const terugItems: string[] = [];

  const perProduct = new Map<string, typeof items>();
  for (const it of items) {
    const l = perProduct.get(it.productId) ?? [];
    l.push(it);
    perProduct.set(it.productId, l);
  }

  for (const blok of chunk([...perProduct.keys()], UPDATE_CHUNK)) {
    const huidig = await db.select().from(products).where(inArray(products.id, blok));
    const perId = new Map(huidig.map((p) => [p.id, p]));

    for (const productId of blok) {
      const product = perId.get(productId);
      if (!product) continue;
      const tier2 = { ...((product.tier2Source as Record<string, string> | null) ?? {}) };
      const leeg: Record<string, null> = {};
      let raak = false;

      for (const it of perProduct.get(productId)!) {
        const nu = (product as Record<string, unknown>)[it.field];
        const bedoeld = toColumnValue(it.field, it.value);
        // Numeric komt als string terug ("17.90"); vergelijk numeriek waar dat kan.
        const gelijk =
          nu != null &&
          (Number.isFinite(Number(nu)) && Number.isFinite(Number(bedoeld))
            ? Number(nu) === Number(bedoeld)
            : String(nu) === String(bedoeld));
        if (!gelijk || tier2[it.field] !== it.source) {
          overgeslagen++;
          continue;
        }
        leeg[it.field] = null;
        delete tier2[it.field];
        terugItems.push(it.id);
        raak = true;
      }

      if (raak) {
        await db
          .update(products)
          .set({
            ...leeg,
            tier2Source: Object.keys(tier2).length > 0 ? tier2 : null,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
        teruggedraaid += Object.keys(leeg).length;
      }
    }
  }

  for (const itemBlok of chunk(terugItems, INSERT_CHUNK)) {
    await db
      .update(enrichmentItems)
      .set({ applied: false })
      .where(inArray(enrichmentItems.id, itemBlok));
  }

  await db
    .update(enrichmentRuns)
    .set({
      status: "teruggedraaid",
      counts: {
        ...((run.counts as Record<string, number> | null) ?? {}),
        teruggedraaid,
        overgeslagen,
      },
      updatedAt: new Date(),
    })
    .where(eq(enrichmentRuns.id, runId));

  await logEvent(db, {
    entity: "brand",
    entityId: run.brandId,
    action: "enrichment_reverted",
    actor,
    payload: { runId, teruggedraaid, overgeslagen },
  });

  return { teruggedraaid, overgeslagen };
}

// Run verwerpen: niets toepassen, status op 'afgewezen'.
export async function rejectRun(
  db: AppDb,
  runId: string,
  actor?: string,
): Promise<EnrichmentRun | null> {
  const [run] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  if (!run) return null;
  if (run.status !== "steekproef") return run;
  await db
    .update(enrichmentRuns)
    .set({ status: "afgewezen", updatedAt: new Date() })
    .where(eq(enrichmentRuns.id, runId));
  await logEvent(db, {
    entity: "brand",
    entityId: run.brandId,
    action: "enrichment_rejected",
    actor,
    payload: { runId },
  });
  const [updated] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  return updated;
}

// Alle verrijkingsruns, nieuwste eerst (voor het verrijkingsoverzicht).
export async function listEnrichmentRuns(db: AppDb): Promise<EnrichmentRun[]> {
  return db
    .select()
    .from(enrichmentRuns)
    .orderBy(desc(enrichmentRuns.createdAt));
}

// Eén run + tellingen, voor het detailscherm.
export async function getEnrichmentRun(
  db: AppDb,
  runId: string,
): Promise<EnrichmentRun | null> {
  const [run] = await db
    .select()
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .limit(1);
  return run ?? null;
}

// ── Tier-2-dekking (H-09-meter): % producten met ≥1 gevuld matchveld ─────────
export async function getTier2Coverage(
  db: AppDb,
): Promise<{ total: number; covered: number; ratio: number }> {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(products);
  const [{ covered }] = await db
    .select({ covered: sql<number>`count(*)` })
    .from(products)
    .where(
      or(
        isNotNull(products.kelvin),
        isNotNull(products.cri),
        isNotNull(products.ipValue),
        isNotNull(products.maxWattage),
        isNotNull(products.lumenOutput),
        isNotNull(products.beamAngle),
        isNotNull(products.dimmable),
      ),
    );
  const t = Number(total);
  const c = Number(covered);
  return { total: t, covered: c, ratio: t > 0 ? c / t : 0 };
}

// Merken met product-aantal + hoeveel er al een tier2_source-stempel dragen — voor het
// startscherm van de verrijking ("welk merk verrijk ik?").
export async function listEnrichableBrands(db: AppDb): Promise<
  { id: string; name: string; productCount: number; enriched: number }[]
> {
  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      productCount: sql<number>`count(${products.id})`,
      enriched: sql<number>`count(*) filter (where ${products.tier2Source} is not null)`,
    })
    .from(brands)
    .leftJoin(products, eq(products.brandId, brands.id))
    .groupBy(brands.id, brands.name)
    .orderBy(asc(brands.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    productCount: Number(r.productCount),
    enriched: Number(r.enriched),
  }));
}

// ── Blauw-inlaadwachtrij (H-08) ──────────────────────────────────────────────
export type BrandLoadItem = typeof brandLoadQueue.$inferSelect;

// Wachtrij op frequentie (meest gevraagd bovenaan). Wachtenden eerst.
export async function listBrandLoadQueue(db: AppDb): Promise<BrandLoadItem[]> {
  return db
    .select()
    .from(brandLoadQueue)
    .orderBy(
      asc(brandLoadQueue.status),
      desc(brandLoadQueue.frequency),
      asc(brandLoadQueue.displayName),
    );
}

// "Not a brand" (UX-audit 30 jul, bug #12). De wachtrij bevat rijen die nooit een merk
// waren — de importparser leest zoneteksten (`Divers`, `Vergaderruimte`, `Toilet`) als
// merknaam. Voor zo'n rij is "Mark as loaded" een onwaarheid: er is niets ingeladen. Deze
// actie voert de rij áf in plaats van hem groen te liegen.
//
// Bewust een echte delete, geen extra status: `brand_load_queue` heeft geen eigen scherm
// voor afgevoerde rijen, en de analytics-tegel leest de tabel ongefilterd (die query is
// van een parallelle sessie) — een nieuwe statuswaarde zou daar als vreemde rij opduiken.
// Het spoor blijft in de events-tabel (ijzeren regel 5): wie, wanneer, welke merksleutel.
// De parser zelf is hiermee NIET gerepareerd; dezelfde zonetekst kan via enqueueBrandLoad
// opnieuw in de wachtrij belanden. Dat is een aparte bevinding, geen regressie van deze.
export async function dismissBrandLoad(
  db: AppDb,
  queueId: string,
  actor?: string,
): Promise<{ displayName: string } | null> {
  // `brand_load_queue.id` is een uuid-kolom. Zonder deze regel gooit Postgres op een
  // niet-uuid `invalid input syntax for type uuid` (22P02) en wordt dat een 500. Hier, en
  // niet alléén in de server-action: dezelfde reden waarom lib/repo/brand-portal.ts de
  // guard in de gedéélde resolver heeft — anders geeft elke nieuwe aanroeper hem opnieuw.
  if (!isUuid(queueId)) return null;
  const [q] = await db
    .select()
    .from(brandLoadQueue)
    .where(eq(brandLoadQueue.id, queueId))
    .limit(1);
  if (!q) return null;
  // LOGGEN VÓÓR DELETEN, met opzet (reparatie 30 jul). `db.transaction()` bestaat hier
  // niet: neon-http (productie) gooit daarop — zie de toelichting in lib/repo/ocr.ts en
  // template-return.ts. Twee losse schrijfacties dus, en dan is de volgorde het enige
  // wat je nog kunt kiezen. Andersom (delete, dan loggen) kan de rij weg zijn zonder één
  // spoor als het loggen faalt, en dat is precies de belofte van ijzeren regel 5 — met de
  // frequency, opgeteld over álle projecten, als enige verlies. Nu is de slechtste
  // uitkomst een event voor een rij die er nog staat: zichtbaar, en met één klik te
  // herhalen.
  await logEvent(db, {
    entity: "brand",
    entityId: null,
    action: "brand_load_dismissed",
    actor,
    payload: {
      brandKey: q.brandKey,
      displayName: q.displayName,
      frequency: q.frequency,
      reason: "not_a_brand",
    },
  });
  await db.delete(brandLoadQueue).where(eq(brandLoadQueue.id, queueId));
  return { displayName: q.displayName };
}

// Merk als ingeladen markeren → alle blauwe/open regels van dat merk opnieuw matchen.
export async function markBrandLoaded(
  db: AppDb,
  queueId: string,
  actor?: string,
): Promise<{ rematched: number } | null> {
  // Zelfde uuid-guard als bij dismissBrandLoad; dit gat was hier ouder.
  if (!isUuid(queueId)) return null;
  const [q] = await db
    .select()
    .from(brandLoadQueue)
    .where(eq(brandLoadQueue.id, queueId))
    .limit(1);
  if (!q) return null;
  await db
    .update(brandLoadQueue)
    .set({ status: "ingeladen", loadedAt: new Date(), updatedAt: new Date() })
    .where(eq(brandLoadQueue.id, queueId));

  // hermatchen op de genormaliseerde merksleutel (brand_key is al genormaliseerd);
  // alias-aware (O5): een regel met boek-woord 'Intralight' hoort bij de canonieke
  // wachtrij-key 'intralighting' — zonder de map bleef zo'n regel blauw.
  const aliasMap = await brandAliasKeyMap(db);
  const lines = await db
    .select({ id: specLines.id, brandText: specLines.brandText })
    .from(specLines)
    .where(inArray(specLines.status, [...REMATCHABLE]));
  let rematched = 0;
  for (const l of lines) {
    if (!l.brandText) continue;
    const lineKey = brandKeyOf(l.brandText);
    if ((aliasMap.get(lineKey) ?? lineKey) !== q.brandKey) continue;
    await runMatcher(db, l.id, actor);
    rematched++;
  }

  await logEvent(db, {
    entity: "brand",
    entityId: null,
    action: "brand_loaded",
    actor,
    payload: { brandKey: q.brandKey, displayName: q.displayName, rematched },
  });
  return { rematched };
}

// Gecureerde merknaam-redirects (O5) als vergelijkingsmap: alias_key → canonieke
// brandKey (via brands.name). Eén fetch per hermatch-ronde; de regel-key gaat door
// deze map vóór de vergelijking, zodat boek-woorden ('Intralight') meetellen bij
// het canonieke merk ('Intra-lighting').
async function brandAliasKeyMap(db: AppDb): Promise<Map<string, string>> {
  const rows = await db
    .select({ aliasKey: brandAliases.aliasKey, brandName: brands.name })
    .from(brandAliases)
    .innerJoin(brands, eq(brands.id, brandAliases.brandId));
  return new Map(rows.map((r) => [r.aliasKey, brandKeyOf(r.brandName)]));
}

// Gedeelde hermatch-helper: alle blauwe/open regels van een merk (op naam) opnieuw
// matchen — alias-aware (O5), zie brandAliasKeyMap.
async function rematchBrandLines(
  db: AppDb,
  brandName: string,
  actor?: string,
): Promise<number> {
  const key = brandKeyOf(brandName);
  if (!key) return 0;
  const aliasMap = await brandAliasKeyMap(db);
  const lines = await db
    .select({ id: specLines.id, brandText: specLines.brandText })
    .from(specLines)
    .where(inArray(specLines.status, [...REMATCHABLE]));
  let n = 0;
  for (const l of lines) {
    if (!l.brandText) continue;
    const lineKey = brandKeyOf(l.brandText);
    if ((aliasMap.get(lineKey) ?? lineKey) !== key) continue;
    await runMatcher(db, l.id, actor);
    n++;
  }
  return n;
}

// ── Prijslijst-dekking: verloopt-binnenkort + verlopen (= dekkingsgat) ────────
export type PriceListStatus = {
  id: string;
  name: string;
  brandName: string | null;
  validUntil: string;
  productCount: number;
  daysLeft: number;
  bucket: "verlopen" | "7" | "14" | "30" | "ok";
  // Additief (bevinding B3): een VERVANGEN lijst heeft geen prijsregels meer (die staan in
  // prices_archive) en blijft hier bewust in de rijenset staan — /data/price-lists toont
  // hem als dekkingsgat en andere schermen rekenen op dezelfde set. Maar verlengen kan hij
  // niet: extendPriceListValidity weigert hem altijd met 'archived'. Zonder dit veld kon
  // het scherm dat niet weten en bood het een formulier aan dat 100% van de tijd faalde.
  // null = actieve lijst.
  replacedAt: Date | null;
  // De levensfase van het merk rijdt mee in dezelfde select (nul extra queries), net als op
  // /admin/brands: een lijst van een merk dat niet meer bestaat mag op /data/price-lists
  // geen schone groene rij zijn (UX-audit 30 jul). null = geen merk aan de lijst gekoppeld.
  lifecycle: BrandLifecycle | null;
};

// Gedeelde datum-helper: hele dagen (UTC) tussen vandaag en een 'YYYY-MM-DD'-datum.
// Negatief = verlopen. Gebruikt door listPriceListStatus hieronder én de prijslijst-
// indicator in lib/repo/brand-relations.ts — één definitie, geen duplicaat.
export function daysUntil(dateStr: string, today: Date = new Date()): number {
  const t0 = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  return Math.round((Date.UTC(y, m - 1, d) - t0) / 86_400_000);
}

// Per prijslijst: hoeveel dagen tot verval + in welke waarschuwingsbucket. Verlopen lijsten
// zijn een dekkingsgat (hun producten vallen uit visible_products — ijzeren regel 3).
export async function listPriceListStatus(
  db: AppDb,
  today: Date = new Date(),
): Promise<PriceListStatus[]> {
  // 2.5b — TELLEN VÓÓR DE JOIN, niet erna. Dit was een LEFT JOIN op prices met een
  // GROUP BY over de prijslijst-kolommen: dan gaan alle 210.121 prijsrijen door de join
  // en moet Postgres ze sorteren om te kunnen groeperen. Hij schatte 189.224 groepen
  // (het zijn er 438), koos daarom GroupAggregate en die viel met een external merge
  // sort van 18 MB op schijf. Gemeten op productie: 220 ms.
  //
  // De telling zit nu in een subquery die zelf groepeert (438 rijen, HashAggregate) en
  // pas dáárna aan de prijslijsten wordt gekoppeld. Gemeten: 51 ms.
  //
  // De uitkomst is per definitie gelijk: `count(prices.id)` over een LEFT JOIN telt per
  // lijst het aantal niet-NULL prijsrijen, en dat is precies wat de subquery per
  // price_list_id telt — met `coalesce(…, 0)` voor een lijst zonder prijzen, waar de
  // LEFT JOIN één NULL-rij en dus count = 0 gaf. Vastgelegd in enrichment.test.ts.
  const perLijst = db
    .select({
      priceListId: prices.priceListId,
      aantal: sql<number>`count(${prices.id})`.as("aantal"),
    })
    .from(prices)
    .groupBy(prices.priceListId)
    .as("per_lijst");

  const rows = await db
    .select({
      id: priceLists.id,
      name: priceLists.name,
      brandName: brands.name,
      validUntil: priceLists.validUntil,
      replacedAt: priceLists.replacedAt,
      productCount: sql<number>`coalesce(${perLijst.aantal}, 0)`,
      lifecycle: brands.lifecycle,
    })
    .from(priceLists)
    .leftJoin(brands, eq(brands.id, priceLists.brandId))
    .leftJoin(perLijst, eq(perLijst.priceListId, priceLists.id))
    .orderBy(asc(priceLists.validUntil));

  return rows.map((r) => {
    const daysLeft = daysUntil(r.validUntil, today);
    const bucket: PriceListStatus["bucket"] =
      daysLeft < 0
        ? "verlopen"
        : daysLeft <= 7
          ? "7"
          : daysLeft <= 14
            ? "14"
            : daysLeft <= 30
              ? "30"
              : "ok";
    return {
      id: r.id,
      name: r.name,
      brandName: r.brandName,
      validUntil: r.validUntil,
      replacedAt: r.replacedAt,
      productCount: Number(r.productCount),
      daysLeft,
      bucket,
      lifecycle: (r.lifecycle as BrandLifecycle | null) ?? null,
    };
  });
}
