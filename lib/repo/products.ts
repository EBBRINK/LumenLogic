// Product-matching. Twee ijzeren regels leven hier:
//   • Regel 2: geld beïnvloedt de ranking NOOIT. De ORDER BY hieronder is puur
//     tekstsimilariteit (trigram). `gross_price` wordt getoond, nooit gesorteerd.
//   • Regel 3 (herschreven 19 aug 2026): er wordt UITSLUITEND uit de view
//     `visible_products` gelezen. Een product met een verlopen prijslijst is dáár nu wél
//     zichtbaar, maar zónder bedrag — `grossPrice` en `currency` komen als NULL uit de
//     view zodra `priceState <> 'actueel'`. Deze module hoeft er dus niets voor te doen
//     behalve de toestand doorgeven; de poort blijft de view, nooit een filter per query.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { visibleProducts } from "@/db/schema";
import { leesSpecTokens, type HerkendToken } from "@/lib/spec-tokens";
import { leesPrijstoestand, type Prijstoestand } from "@/lib/prijstoestand";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type ProductCandidate = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  supplierArticleCode: string | null;
  categoryPath: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  lumenOutput: number | null;
  grossPrice: string | null;
  currency: string | null;
  /** 'actueel' | 'prijslijst_verlopen' | 'uit_prijslijst' — zie lib/prijstoestand.ts. */
  priceState: Prijstoestand;
  /** Naam van de laatst bekende prijslijst (ook als de toestand 'actueel' is). */
  lastPriceListName: string | null;
  /** Einddatum van die lijst, ISO. Dit is de "laatste prijslijst was die en die". */
  lastPriceListValidUntil: string | null;
  score: number;
  matchKind: "exact" | "fuzzy";
};

// De view-kolommen zijn drizzle-typisch nullable; id/name zijn in werkelijkheid NOT NULL
// (products.id/name). Deze mapper coërceert één rij (uit welke tak dan ook) naar een kandidaat.
function toCandidate(
  r: Record<string, unknown>,
  score: number,
  matchKind: "exact" | "fuzzy",
): ProductCandidate {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    brandName: (r.brandName as string | null) ?? null,
    articleCode: (r.articleCode as string | null) ?? null,
    supplierArticleCode: (r.supplierArticleCode as string | null) ?? null,
    categoryPath: (r.categoryPath as string | null) ?? null,
    kelvin: (r.kelvin as number | null) ?? null,
    cri: (r.cri as number | null) ?? null,
    ipValue: (r.ipValue as string | null) ?? null,
    lumenOutput: (r.lumenOutput as number | null) ?? null,
    grossPrice: (r.grossPrice as string | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    priceState: leesPrijstoestand(r.priceState as string | null),
    lastPriceListName: (r.lastPriceListName as string | null) ?? null,
    lastPriceListValidUntil: (r.lastPriceListValidUntil as string | null) ?? null,
    score,
    matchKind,
  };
}

const SELECTION = {
  id: visibleProducts.id,
  name: visibleProducts.name,
  brandName: visibleProducts.brandName,
  articleCode: visibleProducts.articleCode,
  supplierArticleCode: visibleProducts.supplierArticleCode,
  categoryPath: visibleProducts.categoryPath,
  kelvin: visibleProducts.kelvin,
  cri: visibleProducts.cri,
  ipValue: visibleProducts.ipValue,
  lumenOutput: visibleProducts.lumenOutput,
  grossPrice: visibleProducts.grossPrice,
  currency: visibleProducts.currency,
  priceState: visibleProducts.priceState,
  lastPriceListName: visibleProducts.lastPriceListName,
  lastPriceListValidUntil: visibleProducts.lastPriceListValidUntil,
};

export type SearchOptions = {
  query: string;
  brand?: string | null;
  limit?: number;
  actor?: string;
  specLineId?: string | null; // voor het event-log
  filters?: SpecFilters;
};

// De ingevulde specfilters van het catalogus-zoekscherm. Ze staan hier in SQL en niet in
// JS omdat het scherm naast de getoonde treffers het WÉRKELIJKE totaal noemt ("9 of 237
// shown"). Dat getal klopt alleen als de database exact dezelfde rijen telt als hij
// teruggeeft; een filter dat pas ná de query in JS zou toeslaan, telt mee in het totaal
// maar valt uit de lijst — dan liegt de teller.
export type SpecFilters = {
  kelvin?: number | null;
  cri?: number | null;
  ip?: number | null; // beschermingsgetal (44), niet de code "IP44"
};

// Een kandidaat valt UITSLUITEND af als hij aantoonbaar niet voldoet: data aanwezig én te
// laag/anders. Ontbrekende data is geen afkeuring — zo'n product hoort in de lijst
// "Mogelijk — data onvolledig" en wordt nooit stil weggelaten. Vandaar dat `null` er hier
// bewust doorheen glipt; het scherm benoemt per regel wélke data ontbreekt.
function specConditions(f: SpecFilters | undefined): SQL[] {
  const out: SQL[] = [];
  if (!f) return out;
  if (f.kelvin != null) {
    out.push(
      sql`(${visibleProducts.kelvin} is null or ${visibleProducts.kelvin} = ${f.kelvin})`,
    );
  }
  if (f.cri != null) {
    out.push(
      sql`(${visibleProducts.cri} is null or ${visibleProducts.cri} >= ${f.cri})`,
    );
  }
  if (f.ip != null) {
    // Zelfde lezing als het scherm: het eerste tweecijferige getal in de code is het
    // beschermingsgetal ("IP44" → 44). Geen twee cijfers → onbekend, dus geen afkeuring.
    const n = sql`nullif(substring(coalesce(${visibleProducts.ipValue}, '') from '[0-9]{2}'), '')::int`;
    out.push(sql`(${n} is null or ${n} >= ${f.ip})`);
  }
  return out;
}

// De twee WHERE-bouwers van de zoekopdracht, apart benoemd omdat er TWEE lezers zijn:
// runSearch (rijen ophalen) en countSearchMatches (alleen tellen, voor de live teller).
// Die moeten byte-voor-byte dezelfde voorwaarden bouwen — een teller die ook maar één
// filter anders legt, noemt een getal waar de gebruiker nooit bij kan komen.

// Tak 1: de zoektekst blijkt een artikelcode (van ons of van de leverancier).
function exactCodeWhere(query: string, specs: SQL[]): SQL | undefined {
  return and(
    or(
      sql`lower(${visibleProducts.articleCode}) = lower(${query})`,
      sql`lower(${visibleProducts.supplierArticleCode}) = lower(${query})`,
    ),
    ...specs,
  );
}

// Tak 2: fuzzy op merk + producttekst. Het merk genormaliseerd ("LedsC4" ≡ "LEDS-C4").
// De tokens gaan mee terug omdat runSearch ze óók nodig heeft voor de rangschikking
// (#matchende tokens) — zo kan de teller nooit een andere tokenisering hanteren dan de lijst.
//
// ── STRENG, MET TERUGVAL NAAR BREED ─────────────────────────────────────────────
//
// Tot 20 aug 2026 stonden de tokens onvoorwaardelijk in OR ("≥1 token aanwezig"). Dat is
// gemeten en het gevolg was dat een woord ERBIJ typen de stapel nooit kleiner maakte:
// "ENTERO" → 13, "ENTERO 2700" → 13, "ENTERO 2700 VARIANT 03" → 13. Precies het tegendeel
// van wat de live teller moet laten voelen (demosessie Brink Licht, 12 aug: elk stukje
// informatie reduceert de stapel).
//
// Sindsdien: `streng` — élk zoekwoord moet voorkomen (AND). Levert dat NUL treffers op, dan
// valt de zoekopdracht terug op `breed` (de oude OR-ranking) en ZEGT het scherm dat erbij.
// Die terugval is geen randgeval: OCR-aanvragen zitten vol verschrijvingen, en één verkeerd
// gelezen teken zou anders een lege lijst opleveren waar de gebruiker niets van begrijpt.
// Stil verbreden is daarom net zo fout als niet verbreden.
type FuzzyModus = "streng" | "breed";

function fuzzyWhere(
  query: string,
  brand: string,
  specs: SQL[],
  modus: FuzzyModus = "streng",
): { where: SQL | undefined; tokens: string[] } {
  const conditions: (SQL | undefined)[] = [];
  if (brand.length > 0) {
    const normBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normBrand.length > 0) {
      conditions.push(
        sql`regexp_replace(lower(${visibleProducts.brandName}), '[^a-z0-9]', '', 'g') like ${"%" + normBrand + "%"}`,
      );
    } else {
      conditions.push(ilike(visibleProducts.brandName, `%${brand}%`));
    }
  }
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length > 0) {
    const perToken = tokens.map((t) => ilike(visibleProducts.name, `%${t}%`));
    conditions.push(modus === "streng" ? and(...perToken) : or(...perToken));
  } else if (query.length > 0) {
    conditions.push(ilike(visibleProducts.name, `%${query}%`));
  }
  conditions.push(...specs);
  return { where: conditions.length ? and(...conditions) : undefined, tokens };
}

/**
 * Alles wat teller en lijst over de zoekopdracht moeten weten vóórdat er SQL gebouwd wordt.
 *
 * Hier gebeurt het uit elkaar trekken van de vrije tekst: tokens die ondubbelzinnig een
 * specwaarde zijn ("2700", "IP44", "CRI90") gaan het SpecFilters-pad in en verdwijnen uit de
 * tekstmatch. Zie `lib/spec-tokens.ts` voor het waarom en de grenzen.
 *
 * Dit staat hier — in de repo-laag, achter één functie — en niet in de action of de pagina,
 * om dezelfde reden als de WHERE-bouwers: de teller en de lijst moeten gegarandeerd dezelfde
 * zoekopdracht bedoelen. Zou het scherm de tekst opsplitsen en de teller niet, dan telt hij
 * iets anders dan er getoond wordt.
 */
type Zoekvoorbereiding = {
  /** De zoektekst zoals de tekstmatch hem te zien krijgt (zonder de herkende specwaarden). */
  tekst: string;
  filters: SpecFilters;
  herkend: HerkendToken[];
};

function bereidZoekopdrachtVoor(
  query: string,
  brand: string,
  filters: SpecFilters | undefined,
): Zoekvoorbereiding {
  const expliciet: SpecFilters = { ...(filters ?? {}) };
  const { restTekst, herkend } = leesSpecTokens(query);

  if (herkend.length === 0) return { tekst: query, filters: expliciet, herkend: [] };

  // ZONDER ANKER NIET SPLITSEN. Losse specfilters leveren per bestaande regel geen
  // resultaten op (het merk of de tekst is het startpunt). Wie alleen "2700" typt, zou na
  // het splitsen dus nul treffers zien waar hij eerst nog namen mét 2700 erin kreeg. In dat
  // geval blijft de tekst gewoon tekst — beter een ruwe naamzoekopdracht dan een lege lijst.
  if (restTekst.length === 0 && brand.length === 0) {
    return { tekst: query, filters: expliciet, herkend: [] };
  }

  // Een EXPLICIET ingevuld specveld wint altijd van een geraden token. Het token verdwijnt
  // wél uit de tekst: het was geen naamwoord, ook niet als we de waarde niet overnemen.
  const samengevoegd: SpecFilters = { ...expliciet };
  const uitkomst = herkend.map((h) => {
    if (samengevoegd[h.veld] != null) return { ...h, toegepast: false };
    samengevoegd[h.veld] = h.waarde;
    return h;
  });

  return { tekst: restTekst, filters: samengevoegd, herkend: uitkomst };
}

/**
 * Kan deze zoekopdracht überhaupt verbreden?
 *
 * Alleen met MEER dan één token verschillen `streng` en `breed` van elkaar; bij één token
 * (of bij een zoektekst zonder tokens van ≥2 tekens) bouwen ze letterlijk dezelfde WHERE.
 * Dat is niet alleen een optimalisatie — het scheelt een hele round trip per telling — maar
 * ook een correctheidsregel: zonder deze check zou het scherm "brede variant" melden bij een
 * zoekopdracht die nooit versmald ís.
 */
function kanVerbreden(tokens: string[]): boolean {
  return tokens.length > 1;
}

async function countVisible(db: AppDb, where: SQL | undefined): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visibleProducts)
    .where(where);
  return Number(row?.n ?? 0);
}

export type SearchResult = {
  items: ProductCandidate[];
  /** Aantal ZICHTBARE treffers in totaal — dus inclusief wat `limit` buiten de lijst laat. */
  total: number;
  /**
   * Is er teruggevallen op de BREDE variant (≥1 zoekwoord in plaats van allemaal)?
   *
   * Waar dit op staat, hoort het scherm het te zeggen. Een gebruiker die "Entero 2700
   * Adjustable" typt en een lijst zonder "Adjustable" terugkrijgt, moet weten dat hij de
   * ruimere uitslag ziet — anders leest hij de lijst als een exact antwoord. Alleen `true`
   * als de brede variant ook echt iets opleverde; verbreden naar nul is geen verbreding.
   */
  verbreed: boolean;
  /** Welke specwaarden er uit de vrije tekst gelezen zijn; het scherm toont ze. */
  herkend: HerkendToken[];
};

export async function searchProducts(
  db: AppDb,
  opts: SearchOptions,
): Promise<ProductCandidate[]> {
  return (await runSearch(db, opts, false)).items;
}

// Dezelfde zoekopdracht, plus hoeveel zichtbare treffers er in totaal zijn. Het
// catalogus-scherm toont er maximaal negen en zegt erbij hoe groot de stapel is die je
// niet ziet — zonder deze telling zou dat getal een gok zijn. Het kost één extra
// count-query over exact dezelfde WHERE; nooit alle rijen ophalen om ze te kunnen tellen.
export async function searchProductsWithTotal(
  db: AppDb,
  opts: SearchOptions,
): Promise<SearchResult> {
  return runSearch(db, opts, true);
}

// De live treffer-teller (demosessie Brink Licht, 12 aug): tijdens het typen telt het
// aantal treffers mee, zonder enter. Dit is een count-only pad langs exact dezelfde
// WHERE-bouwers als runSearch — dezelfde twee takken in dezelfde volgorde (eerst de
// exacte-codetreffer, anders fuzzy), zodat het live-getal nooit kan afwijken van het
// totaal dat de echte zoekopdracht daarna rapporteert. Geen rijen, geen ORDER BY, geen
// similarity: alleen count(*), want dit vuurt op elke (gedebouncede) toetsaanslag.
//
// IJZEREN REGEL 5, EN WAAROM DIT PAD NIET LOGT. De regel gaat over zoekacties, matches en
// offertes. Een gedebouncede toetsaanslag is geen zoekactie: hij levert geen resultaat op
// waar iemand naar handelt, en hij komt in tientallen exemplaren per zoekopdracht. Deze
// functie logde eerst wél, onder een eigen action 'search_count'. Dat is teruggedraaid, om
// twee redenen die allebei zwaarder wegen dan de symmetrie:
//   • **Het maakt het log onbruikbaar.** Eén ingetypte zoekterm van drie woorden zet een
//     dozijn rijen in `events`. De échte gebeurtenis — de verstuurde zoekopdracht, mét
//     `totalCount` — verdrinkt daarin, en juist die is waar regel 5 voor bestaat. Zelfde
//     afweging, met dezelfde uitkomst, als in de kop van `app/api/health/route.ts`.
//   • **Het maakt de lichte query zwaar.** De opdracht vraagt uitdrukkelijk om een LICHTE
//     telquery die veel vaker mag draaien dan de zoekopdracht zelf. Een INSERT per
//     toetsaanslag maakt er een schrijfpad van, op een database met >1 miljoen producten.
// Wie het typen alsnog wil meten, doet dat geaggregeerd (één event bij het verlaten van het
// veld, of client-side telemetrie) — niet met een rij per teken.
export type CountResult = {
  total: number;
  verbreed: boolean;
  /** Welke specwaarden er uit de vrije tekst gelezen zijn; het scherm toont ze. */
  herkend: HerkendToken[];
};

export async function countSearchMatches(
  db: AppDb,
  opts: SearchOptions,
): Promise<CountResult> {
  const query = (opts.query ?? "").trim();
  const brand = (opts.brand ?? "").trim();
  // Zelfde ankerregel als runSearch: zonder merk of tekst is er geen zoekopdracht,
  // dus ook niets te tellen en niets te loggen.
  if (query.length === 0 && brand.length === 0) {
    return { total: 0, verbreed: false, herkend: [] };
  }

  const { tekst, filters, herkend } = bereidZoekopdrachtVoor(query, brand, opts.filters);
  const specs = specConditions(filters);

  // De exacte tak krijgt de ONGESPLITSTE zoektekst: een artikelnummer is één geheel, en
  // een code die toevallig op een specwaarde lijkt zou anders half wegvallen.
  if (query.length > 0) {
    const exact = await countVisible(db, exactCodeWhere(query, specs));
    if (exact > 0) return { total: exact, verbreed: false, herkend };
  }

  // Streng eerst: élk zoekwoord moet voorkomen. Dit is de tak die de stapel laat slinken
  // terwijl je typt.
  const { where: strengWhere, tokens } = fuzzyWhere(tekst, brand, specs, "streng");
  const streng = await countVisible(db, strengWhere);
  if (streng > 0 || !kanVerbreden(tokens)) {
    return { total: streng, verbreed: false, herkend };
  }

  // Nul strenge treffers én er valt te verbreden: dezelfde terugval als runSearch, zodat
  // het getal blijft kloppen met de lijst die na de enter verschijnt.
  const { where: breedWhere } = fuzzyWhere(tekst, brand, specs, "breed");
  const breed = await countVisible(db, breedWhere);
  return { total: breed, verbreed: breed > 0, herkend };
}

async function runSearch(
  db: AppDb,
  opts: SearchOptions,
  withTotal: boolean,
): Promise<SearchResult> {
  const query = (opts.query ?? "").trim();
  const brand = (opts.brand ?? "").trim();
  const limit = opts.limit ?? 8;
  const { tekst, filters, herkend } = bereidZoekopdrachtVoor(query, brand, opts.filters);
  const specs = specConditions(filters);

  let results: ProductCandidate[] = [];
  let total = 0;
  // Zie SearchResult.verbreed: alleen waar als de brede terugval ook echt iets opleverde.
  let verbreed = false;
  if (query.length > 0 || brand.length > 0) {
    // 1) Exacte SKU/artikelnummer-match (als de gevraagde tekst een code blijkt te zijn).
    if (query.length > 0) {
      const exactWhere = exactCodeWhere(query, specs);
      const exact = await db
        .select(SELECTION)
        .from(visibleProducts)
        .where(exactWhere)
        .limit(limit);
      results = exact.map((r) => toCandidate(r, 1, "exact"));
      if (results.length > 0) {
        total = withTotal ? await countVisible(db, exactWhere) : results.length;
      }
    }

    // 2) Anders: fuzzy op merk + producttekst. Het merk wordt genormaliseerd vergeleken
    //    ("LedsC4" ≡ "LEDS-C4"). ÉLK producttekst-token moet in de naam zitten (streng);
    //    levert dat niets op, dan valt de zoekopdracht terug op ≥1 token (breed) en zegt
    //    het scherm dat erbij. Daarna wordt gerangschikt op #matchende tokens en
    //    trigram-similariteit — nooit op prijs (regel 2).
    if (results.length === 0) {
      const { where: strengWhere, tokens } = fuzzyWhere(tekst, brand, specs, "streng");
      let matchCount = sql<number>`0`;
      if (tokens.length > 0) {
        matchCount = sql<number>`(${sql.join(
          tokens.map(
            (t) =>
              sql`(case when ${visibleProducts.name} ilike ${"%" + t + "%"} then 1 else 0 end)`,
          ),
          sql` + `,
        )})`;
      }
      // Rangschikking op de RESTtekst, niet op de ruwe query: "2700" is geen naamwoord meer,
      // dus het hoort ook niet mee te wegen in de similariteit of de prefix-bonus.
      const score = sql<number>`similarity(${visibleProducts.name}, ${tekst})`;
      // Prefix-bonus: een naam die mét de zoektekst begint ("SASSO 100 SQ SP CEIL…") is
      // vrijwel zeker het gevraagde armatuur; accessoires noemen de familie meestal
      // middenin ("SNOOT … FOR SASSO 100"). Nog steeds puur tekst — geen prijs (regel 2).
      const prefixBonus =
        tekst.length > 0
          ? sql<number>`(case when ${visibleProducts.name} ilike ${tekst + "%"} then 1 else 0 end)`
          : sql<number>`0`;

      // Regel 2: #tokens, dan prefix, dan similariteit, dan naam. Geen prijs, nergens.
      //
      // De constante termen worden WEGGELATEN, niet vervangen — zelfde afvangpatroon als
      // lib/matching/engine.ts. Zonder tokens blijft `matchCount` de letterlijke `0` en
      // zonder zoektekst `prefixBonus` ook, en een kale integer in ORDER BY leest Postgres
      // niet als waarde maar als KOLOMPOSITIE: `order by 0 desc` → "ORDER BY position 0 is
      // not in select list". Daarmee crashte /catalog op een merk zonder zoektekst en op
      // een zoektekst van één teken (tokens zijn stukken van ≥2 tekens, dus één teken
      // levert er nul op). Zet hier dus nooit een `sql`0`` of een dummy-kolom terug.
      //
      // `score` gaat mee op dezelfde voorwaarde. Hij is een functieaanroep en dus géén
      // positionele verwijzing, maar `similarity(name, '')` is gemeten 0 voor élke rij —
      // een sorteersleutel die niets ordent. Bij één teken is hij wél betekenisvol
      // (gemeten 0 / 0,038 / 0,05), dus de grens ligt bij `query.length > 0`, niet bij
      // het aantal tokens.
      const orderTerms = [
        ...(tokens.length > 0 ? [desc(matchCount)] : []),
        ...(tekst.length > 0 ? [desc(prefixBonus), desc(score)] : []),
        asc(visibleProducts.name),
      ];

      const haal = (where: SQL | undefined) =>
        db
          .select({ ...SELECTION, score, matchCount })
          .from(visibleProducts)
          .where(where)
          .orderBy(...orderTerms)
          .limit(limit);

      // Streng eerst. De rangschikking hierboven verandert niet mee: hij ordent in beide
      // gevallen op #matchende tokens, en dat is bij de strenge tak simpelweg voor elke rij
      // gelijk. Zo blijft er precies één definitie van "welke treffer staat bovenaan".
      let gebruikteWhere = strengWhere;
      let fuzzy = await haal(strengWhere);

      if (fuzzy.length === 0 && kanVerbreden(tokens)) {
        const { where: breedWhere } = fuzzyWhere(tekst, brand, specs, "breed");
        const breed = await haal(breedWhere);
        if (breed.length > 0) {
          fuzzy = breed;
          gebruikteWhere = breedWhere;
          verbreed = true;
        }
      }

      results = fuzzy.map((r) => toCandidate(r, Number(r.score) || 0, "fuzzy"));
      total = withTotal ? await countVisible(db, gebruikteWhere) : results.length;
    }
  }

  await logEvent(db, {
    entity: "spec_line",
    entityId: opts.specLineId ?? null,
    action: "search",
    actor: opts.actor,
    // `resultCount` blijft wat het altijd was: het aantal teruggegeven rijen. `totalCount`
    // staat ernaast zodra er geteld is — anders zou het log niet laten zien hoeveel er
    // achter het plafond bleef liggen.
    // `verbreed` staat erbij omdat het een eigenschap van de UITSLAG is: een zoekopdracht
    // die alleen dankzij de terugval iets opleverde, is iets anders dan een die meteen raak
    // was. Zonder dit veld is in het log niet te zien welke van de twee je voor je hebt.
    // `herkend` staat erbij omdat het uitlegt WAAROM een zoekopdracht deze uitslag gaf: wie
    // later een rare telling terugziet, moet kunnen zien dat "2700" als kelvin gelezen is.
    payload: withTotal
      ? {
          query,
          brand,
          resultCount: results.length,
          totalCount: total,
          verbreed,
          herkend,
        }
      : { query, brand, resultCount: results.length, verbreed, herkend },
  });

  return { items: results, total, verbreed, herkend };
}

// Losse ophaal van één zichtbaar product (voor de offerte-snapshot / detailweergave).
export async function getVisibleProduct(db: AppDb, id: string) {
  const rows = await db
    .select(SELECTION)
    .from(visibleProducts)
    .where(eq(visibleProducts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Staat een gevraagd leveranciersartikelnummer in de zichtbare catalogus?
//
// Zelfde normalisatie en dezelfde twee kolommen als de exacte-codetreffer van de matcher
// (engine.ts, stap 3a) — één waarheid over "kennen wij deze code", zodat het scherm nooit
// iets anders beweert dan de matcher deed. Strikt `visible_products`, en sinds 0022 telt
// een vervallen product hier dus MEE: de bestekschrijver die een artikelnummer van vorig
// jaar overtypt hoort "dit product is vervallen" te krijgen, niet "wij kennen deze code
// niet". Precies dat verschil was de aanleiding voor de nieuwe formulering van regel 3.
//
// Bewust bij élke weergave opnieuw gevraagd in plaats van bij de match vastgelegd: vult
// een latere import het gat, dan verdwijnt de melding vanzelf. Een bevroren vlag zou
// blijven liegen tot iemand de regel hermatcht.
export async function articleCodeExists(
  db: AppDb,
  code: string,
): Promise<boolean> {
  const n = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return false;
  const rows = await db
    .select({ id: visibleProducts.id })
    .from(visibleProducts)
    .where(
      or(
        sql`regexp_replace(lower(${visibleProducts.articleCode}), '[^a-z0-9]', '', 'g') = ${n}`,
        sql`regexp_replace(lower(${visibleProducts.supplierArticleCode}), '[^a-z0-9]', '', 'g') = ${n}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Ijzeren regel 4: value-engineering-/duurzaamheidssuggesties bestaan UITSLUITEND in de
// gegund-stand. In tender-stand geeft de poort altijd een lege lijst. De echte rangschikking
// zit in de gelijkwaardigheidsengine (lib/repo/equivalence.ts); deze wrapper levert een
// beknopte kandidatenlijst voor de match-pagina.
export async function getAlternativeSuggestions(
  db: AppDb,
  opts: { phase: "tender" | "awarded"; productId: string; actor?: string },
): Promise<ProductCandidate[]> {
  if (opts.phase === "tender") return []; // default = veilig
  const { getEquivalentAlternatives } = await import("./equivalence");
  const { alternatives } = await getEquivalentAlternatives(db, {
    phase: opts.phase,
    referenceProductId: opts.productId,
    actor: opts.actor,
  });
  return alternatives.map((a) => ({
    id: a.id,
    name: a.name,
    brandName: a.brandName,
    articleCode: a.articleCode,
    supplierArticleCode: null,
    categoryPath: a.categoryPath,
    kelvin: a.kelvin,
    cri: a.cri,
    ipValue: a.ipValue,
    lumenOutput: null,
    grossPrice: a.grossPrice,
    currency: a.currency,
    // Alternatieven komen per definitie uit de actuele catalogus: getEquivalentAlternatives
    // filtert op priceState 'actueel', want een alternatief dat je niet kunt offreren is
    // geen alternatief.
    priceState: "actueel" as const,
    lastPriceListName: null,
    lastPriceListValidUntil: null,
    score: a.equivalenceScore,
    matchKind: "fuzzy" as const,
  }));
}
