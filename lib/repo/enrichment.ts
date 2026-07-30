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
import { OPTIC_SOURCE, opticBeamAngle } from "@/lib/enrichment/optic-code";

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

// Value-string (zoals opgeslagen in enrichment_items.value) → kolomwaarde voor products.
// Integer-kolommen krijgen een number; numeric- en tekstkolommen de string zelf.
function toColumnValue(field: string, value: string): number | string | null {
  if (INTEGER_FIELDS.has(field)) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
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

  const prods = await db
    .select({ id: products.id, name: products.name })
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
  for (const p of prods) {
    const specs = parseProductName(p.name);
    for (const field of FIELDS) {
      if (!gekozen.has(field)) continue;
      const v = specs[field];
      if (v === undefined) continue;
      parsed.push({
        productId: p.id,
        productName: p.name,
        field,
        value: String(v),
      });
    }
  }

  return createRun(db, brand, prods.length, parsed, "parsed-from-name", actor);
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
      },
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
export async function setSampleVerdict(
  db: AppDb,
  itemId: string,
  verdict: "goed" | "fout",
): Promise<void> {
  await db
    .update(enrichmentItems)
    .set({ sampleVerdict: verdict })
    .where(eq(enrichmentItems.id, itemId));
}

// ── Publiceren: voorstellen toepassen op products + blauw/open hermatchen ─────
// Past alle items toe BEHALVE steekproef-items die als 'fout' gemarkeerd zijn. Vult
// uitsluitend nog-lege velden (nooit overschrijven), zet products.tier2_source per veld,
// legt de steekproef-foutratio vast, en hermatcht alle blauwe/open spec-regels van dit merk.
export async function publishRun(
  db: AppDb,
  runId: string,
  actor?: string,
): Promise<{ run: EnrichmentRun; applied: number; rematched: number }> {
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

  let applied = 0;
  for (const [productId, its] of byProduct) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) continue;

    const update: Record<string, unknown> = {};
    const tier2: Record<string, string> = {
      ...((product.tier2Source as Record<string, string> | null) ?? {}),
    };
    const appliedIds: string[] = [];

    for (const it of its) {
      if (!fieldIsEmpty(product as Record<string, unknown>, it.field)) continue; // nooit overschrijven
      const colVal = toColumnValue(it.field, it.value);
      if (colVal == null) continue;
      update[it.field] = colVal;
      tier2[it.field] = it.source; // H-09: herkomst per veld
      appliedIds.push(it.id);
    }

    if (appliedIds.length > 0) {
      update.tier2Source = tier2;
      update.updatedAt = new Date();
      await db.update(products).set(update).where(eq(products.id, productId));
      await db
        .update(enrichmentItems)
        .set({ applied: true })
        .where(inArray(enrichmentItems.id, appliedIds));
      applied += appliedIds.length;
    }
  }

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

// Merk als ingeladen markeren → alle blauwe/open regels van dat merk opnieuw matchen.
export async function markBrandLoaded(
  db: AppDb,
  queueId: string,
  actor?: string,
): Promise<{ rematched: number } | null> {
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
  const rows = await db
    .select({
      id: priceLists.id,
      name: priceLists.name,
      brandName: brands.name,
      validUntil: priceLists.validUntil,
      productCount: sql<number>`count(${prices.id})`,
      lifecycle: brands.lifecycle,
    })
    .from(priceLists)
    .leftJoin(brands, eq(brands.id, priceLists.brandId))
    .leftJoin(prices, eq(prices.priceListId, priceLists.id))
    .groupBy(
      priceLists.id,
      priceLists.name,
      priceLists.validUntil,
      brands.name,
      brands.lifecycle,
    )
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
      productCount: Number(r.productCount),
      daysLeft,
      bucket,
      lifecycle: (r.lifecycle as BrandLifecycle | null) ?? null,
    };
  });
}
