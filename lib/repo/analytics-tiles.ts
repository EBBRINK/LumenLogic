// Querylaag onder /analytics (sprint 2.1 + 2.2). Los van `lib/repo/analytics.ts`, dat
// byte-stabiel blijft (guardrail 1, HANDOVER.md) en dus niet uitgebreid mág worden. Wat hier
// wél uit overgenomen is: de `rows<T>()`-vorm en de uuid-guard, zodat één afwijkende
// event-payload de pagina niet breekt.
//
// Ijzeren regel 2: deze module raakt prijzen, marge en de matcher niet. Commerciële
// analytics staat NAAST de matcher, nooit erin — er wordt hier alleen geteld.
// Ijzeren regel 5: puur leespad; het schrijfpad in lib/repo/events.ts blijft ongemoeid.
//
// Zie docs/plan-2.1-2.2-analytics.md voor de gemeten onderbouwing per tegel.
import { sql, type SQL } from "drizzle-orm";
import type { AppDb } from "./db";

export type AnalyticsTilesOptions = {
  /**
   * null = intern, alles. Een orgId scopet via events.entity_id → spec_lines →
   * project_dossiers.org_id. Gemeten 30 jul: alle dossiers hebben org_id = NULL, dus met een
   * orgId levert elke tegel vandaag 0 — de parameter staat klaar voor week 3.
   *
   * Intern joinen we bewust NIET: de join verliest events die naar verwijderde spec-regels
   * wijzen (product_considered 565 van 680), en intern moet de volle telling zichtbaar zijn.
   */
  orgId?: string | null;
  /**
   * Besluit 12 — anonimiseringsgrens: merk-cijfers alleen bij >= N events/week per product.
   * 0 = intern, geen grens. Gemeten bij 5: 8-11 van de ~90 producten per week halen hem.
   */
  minEventsPerWeek?: number;
};

/** De eerlijke band bovenaan: dit is testdata van onze eigen dagen, geen gebruikersgedrag. */
export type TestPeriod = {
  from: string | null;
  to: string | null;
  totalEvents: number;
  actors: number;
  activeDays: number;
};

/** Tegel 1 — `product_considered`, gesplitst naar de lijst waarin het product stond. */
export type ConsideredProduct = {
  brand: string | null;
  name: string;
  count: number;
  list: string;
};

/** Tegel 2 — de zes statussen uit `matched_status`. */
export type StatusCount = { status: string; count: number };

/** Tegel 3 — waaróp de match afketste, uit de `deviations`-jsonb op spec_lines. */
export type BreakdownRow = { field: string; verdict: string; count: number };

/** Tegel 4 — datagaten per veld over alle spec-regels. */
export type SpecGap = { field: string; missing: number; total: number };

/**
 * Tegel 5 — hoe vaak zoeken niets oplevert (2.1: intern stuursignaal). Ontdubbeld: beide
 * getallen tellen unieke query-teksten, niet ruwe events (zie de query voor de definitie).
 */
export type SearchHealth = { total: number; withoutResults: number };

/** Tegel 6 — gevraagde merken zonder producten in de catalogus. */
export type BrandDemand = { brand: string; lines: number };

/** Tegel 7 — de blauwe wachtrij, gewogen op vraag. */
export type QueuedBrand = { brand: string; demand: number; status: string };

/** Tegel 8 — concrete productvraag die niets opleverde (2.2: omzetsignaal). */
export type UnmetDemand = { query: string; count: number };

/** Tegel 9 — klein en eerlijk: geen funnel, want die is er niet. */
export type ProjectTotals = {
  dossiers: number;
  quotes: number;
  quoteLines: number;
  specLines: number;
};

export type AnalyticsTiles = {
  period: TestPeriod;
  consideredProducts: ConsideredProduct[];
  statusSplit: StatusCount[];
  breakdown: BreakdownRow[];
  specGaps: SpecGap[];
  searchHealth: SearchHealth;
  brandsNotInCatalogue: BrandDemand[];
  brandLoadQueue: QueuedBrand[];
  unmetDemand: UnmetDemand[];
  projects: ProjectTotals;
};

// ── Helpers (vorm overgenomen uit lib/repo/analytics.ts, bewust gekopieerd) ───────────────
// Beide drivers geven hun rijen anders terug: PGlite een { rows }-object, neon-http een array.
function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

// `count(*)::int` komt op beide drivers als number binnen, maar één driver-upgrade die er een
// string van maakt zou stilzwijgend "12" + "3" = "123" in de UI opleveren. Eén plek die het
// afdwingt is goedkoper dan er per tegel op vertrouwen.
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Guard: zou er ooit één event met een niet-uuid payload binnenkomen, dan mag dat de
// ::uuid-cast — en daarmee de hele pagina — niet breken. Zelfde regex als in getAnalytics.
// (Gemeten 30 jul: alle 693 payloads met een productId dragen vandaag een geldige uuid; de
// guard is dus voorzorg, geen reparatie van een bestaande rij.)
const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

// Dezelfde ruisfilter voor tegel 6 (searchHealth) en 9 (unmetDemand): lege query's en de
// ZZTEST-zoekacties uit onze eigen rooktests tellen niet mee als zoekgedrag.
const ECHTE_ZOEKACTIE = sql`e.action = 'search'
  AND coalesce(e.payload->>'query','') <> ''
  AND e.payload->>'query' NOT ILIKE 'ZZTEST%'`;

// "0 resultaten" via CASE en niet via een AND-keten: Postgres belooft geen evaluatievolgorde
// binnen AND, dus een ontbrekende of niet-numerieke resultCount zou de ::int-cast alsnog kunnen
// raken. Ontbreekt resultCount, dan telt de rij niet als "zonder resultaat" (gemeten: dat komt voor).
const ZONDER_RESULTAAT = sql`CASE
    WHEN e.payload->>'resultCount' ~ '^[0-9]+$' THEN (e.payload->>'resultCount')::int = 0
    ELSE false
  END`;

const LEEG = sql`` as SQL;

export async function getAnalyticsTiles(
  db: AppDb,
  opts: AnalyticsTilesOptions = {},
): Promise<AnalyticsTiles> {
  const orgIdRaw = opts.orgId ?? null;
  // Fail-closed: een orgId die geen uuid is, is een bug in de aanroeper — dan liever niets
  // tonen dan per ongeluk de interne (ongescopte) cijfers. `::uuid` op zo'n waarde zou
  // bovendien de hele pagina laten crashen.
  const orgId =
    orgIdRaw && new RegExp(UUID_RE, "i").test(orgIdRaw) ? orgIdRaw : null;
  const gescoped = orgIdRaw !== null;
  // Fail-closed, net als bij orgId hierboven: een niet-numerieke grens (NaN, Infinity) is een
  // bug in de aanroeper. Zonder de isFinite-check werd `Math.max(0, Math.trunc(NaN))` gewoon
  // NaN, viel `minPerWeek > 0` weg en verdween de anonimiseringsgrens (besluit 12) stil —
  // precies andersom dan bij een kapotte orgId. Dan liever een grens die niemand haalt.
  const minRaw = opts.minEventsPerWeek ?? 0;
  const minPerWeek = Number.isFinite(minRaw)
    ? Math.max(0, Math.trunc(minRaw))
    : Number.MAX_SAFE_INTEGER;

  // Org-scope voor de EVENT-gedreven tegels: events dragen geen org_id, het pad is
  // events.entity_id → spec_lines.id → spec_lines.dossier_id → project_dossiers.org_id.
  // Intern (orgId = null) joinen we bewust NIET — die join verliest events die naar
  // verwijderde spec-regels wijzen (gemeten: product_considered 565 van 680).
  const eventScope = (alias: string): SQL =>
    gescoped
      ? sql`AND EXISTS (
          SELECT 1 FROM spec_lines sl
          JOIN project_dossiers pd ON pd.id = sl.dossier_id
          -- entity_id is text sinds migratie 0023 (Better Auth-user-ids zijn geen uuid).
          -- Cast dus sl.id naar text; entity_id::uuid zou runtime gooien op user-events.
          -- spec_lines is klein, dus geen expressie-index nodig.
          WHERE sl.id::text = ${sql.raw(alias)}.entity_id AND pd.org_id = ${orgId}::uuid
        )`
      : LEEG;

  // Org-scope voor de SPEC-gedreven tegels: rechtstreeks spec_lines ⨝ project_dossiers.
  const specScope: SQL = gescoped
    ? sql`JOIN project_dossiers pd ON pd.id = sl.dossier_id AND pd.org_id = ${orgId}::uuid`
    : LEEG;

  // Besluit 12 (anonimiseringsgrens): alleen producten die in minstens één ISO-week
  // >= N keer overwogen zijn. date_trunc('week') is de ISO-week (maandag). 0 = geen grens.
  const weekGrens: SQL =
    minPerWeek > 0
      ? sql`AND EXISTS (
          SELECT 1 FROM events e2
          WHERE e2.action = 'product_considered'
            AND e2.payload->>'productId' = e.payload->>'productId'
            ${eventScope("e2")}
          GROUP BY date_trunc('week', e2.created_at)
          HAVING count(*) >= ${minPerWeek}
        )`
      : LEEG;

  const [
    periodRows,
    consideredRows,
    statusRows,
    breakdownRows,
    gapRows,
    searchRows,
    brandRows,
    queueRows,
    unmetRows,
    projectRows,
  ] = await Promise.all([
    // 1. period — de meetperiode van de laag ("dit is testdata van onze eigen dagen"). Intern
    // ongescoped, mét orgId langs hetzelfde pad als de andere event-tegels: het aantal events
    // en het aantal actors zijn platformbrede bedrijfscijfers van Brink, en die horen niet in
    // een merkportaal thuis. Een organisatie zonder events krijgt zo from/to = null en nullen,
    // consistent met de rest van de pagina (vgl. tegel 8, die om dezelfde reden leeg blijft).
    // to_char i.p.v. ::text omdat de tekstvorm van een timestamptz van DateStyle/TimeZone
    // afhangt; de UI moet er een ondubbelzinnige ISO-string krijgen.
    db.execute(sql`
      SELECT
        to_char(min(e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "from",
        to_char(max(e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "to",
        count(*)::int AS "totalEvents",
        count(DISTINCT e.actor)::int AS actors,
        count(DISTINCT date_trunc('day', e.created_at))::int AS "activeDays"
      FROM events e
      WHERE true
        ${eventScope("e")}`),

    // 2. consideredProducts — het "overwogen"-goud (680 events over 181 producten), gesplitst
    // naar de lijst waarin het product stond (aantoonbaar / onvolledig).
    db.execute(sql`
      SELECT p.brand_name AS brand, p.name AS name,
             coalesce(e.payload->>'list','onbekend') AS list,
             count(*)::int AS count
      FROM events e
      JOIN products p ON p.id = (e.payload->>'productId')::uuid
      WHERE e.action = 'product_considered'
        AND e.payload->>'productId' ~* ${UUID_RE}
        ${eventScope("e")}
        ${weekGrens}
      GROUP BY 1, 2, 3
      ORDER BY count DESC, name ASC, list ASC
      LIMIT 10`),

    // 3. statusSplit — de zes statussen uit matched_status.
    db.execute(sql`
      SELECT coalesce(e.payload->>'status','onbekend') AS status, count(*)::int AS count
      FROM events e
      WHERE e.action = 'matched_status'
        ${eventScope("e")}
      GROUP BY 1
      ORDER BY count DESC, status ASC`),

    // 4. breakdown — waaróp de match afketste, uit de deviations-jsonb op de spec-regels.
    // De CASE i.p.v. een kale coalesce: jsonb_array_elements gooit op een jsonb die géén
    // array is ('null', een object) — één zo'n regel mag de pagina niet breken.
    db.execute(sql`
      SELECT d->>'field' AS field,
             coalesce(d->>'verdict','onbekend') AS verdict,
             count(*)::int AS count
      FROM spec_lines sl
      ${specScope}
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(sl.deviations) = 'array' THEN sl.deviations ELSE '[]'::jsonb END
      ) d
      WHERE d->>'field' IS NOT NULL
      GROUP BY 1, 2
      ORDER BY count DESC, field ASC, verdict ASC
      LIMIT 10`),

    // 5. specGaps — datagaten per veld, in één pass over de spec-regels (count FILTER).
    // brand_text wordt op leegte getoetst en niet alleen op NULL: de import schrijft ''.
    db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE sl.quantity IS NULL)::int AS quantity,
             count(*) FILTER (WHERE sl.req_kelvin IS NULL)::int AS kelvin,
             count(*) FILTER (WHERE sl.req_watt IS NULL)::int AS watt,
             count(*) FILTER (WHERE sl.req_lumen IS NULL)::int AS lumen,
             count(*) FILTER (WHERE coalesce(sl.brand_text,'') = '')::int AS brand
      FROM spec_lines sl
      ${specScope}`),

    // 6. searchHealth — hoe vaak zoeken niets oplevert, ná de ruisfilter. ONTDUBBELD: de
    // binnenste query groepeert op query-tekst, de buitenste telt die groepen. Ruwe events
    // tellen zou dezelfde mislukte zoekactie zo vaak meewegen als iemand hem herhaalde, en het
    // plan (§3 tegel 5) én de UI beloven ontdubbeld.
    //
    // Definitie van "zonder resultaat": `bool_and`, dus alleen een query waarvan ELK event
    // aantoonbaar 0 opleverde. Een query die één keer 0 en één keer 8 gaf is geen mislukte
    // zoekactie — de zoekterm wérkt, de eerste poging was toeval (gemeten 30 jul: "SASSO 60
    // Adjustable" 1×0 + 3×raak, "downlight" 1×0 + 1×raak). Een event zonder bruikbare
    // resultCount maakt `bool_and` false en haalt de query dus ook uit de mislukte set: we
    // rapporteren alleen wat we kunnen aantonen, in lijn met ZONDER_RESULTAAT zelf.
    db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE altijd_leeg)::int AS "withoutResults"
      FROM (
        SELECT bool_and(${ZONDER_RESULTAAT}) AS altijd_leeg
        FROM events e
        WHERE ${ECHTE_ZOEKACTIE}
          ${eventScope("e")}
        GROUP BY e.payload->>'query'
      ) q`),

    // 7. brandsNotInCatalogue — gevraagde merken zonder één product in de catalogus.
    // Bewust GEEN filter op ruimtenamen ("Woonkamer", "Divers"): brand_text is vervuild
    // (bevinding 3 in het plan) en die vervuiling moet zichtbaar blijven — wegfilteren
    // verbergt het probleem. Toetsing op `products`, niet op visible_products: de vraag is
    // "hébben we dit merk überhaupt", niet "mag het in een zoekresultaat" (regel 3).
    db.execute(sql`
      SELECT sl.brand_text AS brand, count(*)::int AS lines
      FROM spec_lines sl
      ${specScope}
      WHERE coalesce(btrim(sl.brand_text),'') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM products p
          WHERE lower(btrim(p.brand_name)) = lower(btrim(sl.brand_text))
        )
      GROUP BY 1
      ORDER BY lines DESC, brand ASC
      LIMIT 10`),

    // 8. brandLoadQueue — de blauwe wachtrij, gewogen op vraag. NIET org-scopebaar:
    // brand_load_queue heeft geen dossier- of org-relatie (de rij is merk-uniek en telt over
    // álle dossiers heen). Met een orgId zouden we dus interne cijfers lekken → lege lijst.
    gescoped
      ? Promise.resolve([])
      : db.execute(sql`
          SELECT display_name AS brand, frequency::int AS demand, status
          FROM brand_load_queue
          ORDER BY frequency DESC, display_name ASC
          LIMIT 10`),

    // 9. unmetDemand — dezelfde ruisfilter als 6, maar dan de query's die 0 opleverden.
    db.execute(sql`
      SELECT e.payload->>'query' AS query, count(*)::int AS count
      FROM events e
      WHERE ${ECHTE_ZOEKACTIE}
        AND ${ZONDER_RESULTAAT}
        ${eventScope("e")}
      GROUP BY 1
      ORDER BY count DESC, query ASC
      LIMIT 10`),

    // 10. projects — klein en eerlijk. Gescoped loopt alles via het dossier; intern zijn het
    // kale tellingen (geen join, dus ook geen verlies op wees-rijen).
    gescoped
      ? db.execute(sql`
          SELECT
            (SELECT count(*)::int FROM project_dossiers d
              WHERE d.org_id = ${orgId}::uuid) AS dossiers,
            (SELECT count(*)::int FROM quotes q
              JOIN project_dossiers d ON d.id = q.dossier_id
              WHERE d.org_id = ${orgId}::uuid) AS quotes,
            (SELECT count(*)::int FROM quote_lines ql
              JOIN quotes q ON q.id = ql.quote_id
              JOIN project_dossiers d ON d.id = q.dossier_id
              WHERE d.org_id = ${orgId}::uuid) AS "quoteLines",
            (SELECT count(*)::int FROM spec_lines sl
              JOIN project_dossiers d ON d.id = sl.dossier_id
              WHERE d.org_id = ${orgId}::uuid) AS "specLines"`)
      : db.execute(sql`
          SELECT
            (SELECT count(*)::int FROM project_dossiers) AS dossiers,
            (SELECT count(*)::int FROM quotes) AS quotes,
            (SELECT count(*)::int FROM quote_lines) AS "quoteLines",
            (SELECT count(*)::int FROM spec_lines) AS "specLines"`),
  ]);

  const periodRow = rows<{
    from: string | null;
    to: string | null;
    totalEvents: number;
    actors: number;
    activeDays: number;
  }>(periodRows)[0];

  const gapRow = rows<Record<string, number>>(gapRows)[0];
  const gapTotal = num(gapRow?.total);
  // Besluit 4: geen data = "nog geen data". Vijf regels "0 van 0" zijn geen datagaten maar
  // ruis — bij een lege set geeft de tegel niets terug en toont de UI haar lege tak.
  const specGaps: SpecGap[] =
    gapTotal === 0
      ? []
      : (["quantity", "kelvin", "watt", "lumen", "brand"] as const).map((f) => ({
          field: f,
          missing: num(gapRow?.[f]),
          total: gapTotal,
        }));

  const searchRow = rows<{ total: number; withoutResults: number }>(searchRows)[0];
  const projectRow = rows<Record<string, number>>(projectRows)[0];

  return {
    period: {
      from: periodRow?.from ?? null,
      to: periodRow?.to ?? null,
      totalEvents: num(periodRow?.totalEvents),
      actors: num(periodRow?.actors),
      activeDays: num(periodRow?.activeDays),
    },
    consideredProducts: rows<ConsideredProduct>(consideredRows).map((r) => ({
      brand: r.brand ?? null,
      name: r.name,
      list: r.list,
      count: num(r.count),
    })),
    statusSplit: rows<StatusCount>(statusRows).map((r) => ({
      status: r.status,
      count: num(r.count),
    })),
    breakdown: rows<BreakdownRow>(breakdownRows).map((r) => ({
      field: r.field,
      verdict: r.verdict,
      count: num(r.count),
    })),
    specGaps,
    searchHealth: {
      total: num(searchRow?.total),
      withoutResults: num(searchRow?.withoutResults),
    },
    brandsNotInCatalogue: rows<BrandDemand>(brandRows).map((r) => ({
      brand: r.brand,
      lines: num(r.lines),
    })),
    brandLoadQueue: rows<QueuedBrand>(queueRows).map((r) => ({
      brand: r.brand,
      demand: num(r.demand),
      status: r.status,
    })),
    unmetDemand: rows<UnmetDemand>(unmetRows).map((r) => ({
      query: r.query,
      count: num(r.count),
    })),
    projects: {
      dossiers: num(projectRow?.dossiers),
      quotes: num(projectRow?.quotes),
      quoteLines: num(projectRow?.quoteLines),
      specLines: num(projectRow?.specLines),
    },
  };
}
