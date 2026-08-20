// Querylaag onder het prijslijst-overzicht: per MERK zijn actieve prijslijst plus de acht
// vraagsignalen uit docs/goal-prijslijst-urgentie.md. Het rekenen gebeurt niet hier maar in
// lib/price-list-urgency.ts — deze module telt alleen.
//
// Eén rij per merk, ook voor merken zónder prijslijst: dat is het grootste dekkingsgat dat
// er is en het moet een rij hebben om op te staan.
//
// ⚠️ Ijzeren regel 2: geen enkele geldkolom komt hier voor. `prices` wordt uitsluitend
// GETELD (bestaat er een prijsregel), nooit gelezen. Ijzeren regel 5: puur leespad.
//
// Vorm van de query bewust als in lib/repo/analytics-tiles.ts: één statement met CTE's die
// per merksleutel groeperen, niet 438 gecorreleerde subquery's. Merken worden op een
// genormaliseerde sleutel gekoppeld (dezelfde vorm als brandKeyOf in lib/matching/engine.ts
// en als brand_aliases.alias_key), want brand_text is vrije, vervuilde tekst.
import { sql } from "drizzle-orm";
import type { BrandLifecycle } from "@/db/schema";
import type { AppDb } from "./db";
import { daysUntil } from "./enrichment";
import type { BrandUrgencyRow } from "@/lib/price-list-urgency";

// Beide drivers geven hun rijen anders terug: PGlite een { rows }-object, neon-http een array.
function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Het venster van de spec- en event-signalen: het werk van vandaag, niet de hele historie. */
export const VRAAG_VENSTER_MAANDEN = 12;

type RuweRij = {
  brandId: string;
  brandName: string;
  brandCode: string | null;
  lifecycle: string | null;
  priceListId: string | null;
  priceListName: string | null;
  validUntil: string | null;
  replacedAt: string | Date | null;
  priceCount: unknown;
  productCount: unknown;
  projects12m: unknown;
  lines12m: unknown;
  linesEver: unknown;
  chosen12m: unknown;
  searches12m: unknown;
  unmet12m: unknown;
  considered12m: unknown;
  queueDemand: unknown;
};

export async function listBrandUrgency(
  db: AppDb,
  today: Date = new Date(),
): Promise<BrandUrgencyRow[]> {
  // Grens als expliciete timestamp i.p.v. `now() - interval`: dan meet de test met dezelfde
  // `today` als de tijdfactor, en staat er in de query maar één begrip van "vandaag".
  const grens = new Date(today);
  grens.setUTCMonth(grens.getUTCMonth() - VRAAG_VENSTER_MAANDEN);
  const grensIso = grens.toISOString();

  const res = await db.execute(sql`
    WITH merk AS (
      SELECT b.id, b.name, b.brand_code, b.lifecycle,
             regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') AS sleutel
      FROM brands b
    ),
    -- Alias-sleutels rijden mee: 'Tekna Nautic' is dezelfde inwinning als 'Tekna', dus de
    -- vraag naar de alias hoort bij het merk te landen (migratie 0021).
    sleutels AS (
      SELECT id, sleutel FROM merk
      UNION
      SELECT ba.brand_id AS id, ba.alias_key AS sleutel FROM brand_aliases ba
    ),
    -- De ACTIEVE lijst (replaced_at is null); de unique index garandeert er hooguit één.
    actief AS (
      SELECT pl.brand_id, pl.id, pl.name, pl.valid_until, pl.replaced_at,
             (SELECT count(*) FROM prices p WHERE p.price_list_id = pl.id) AS price_count
      FROM price_lists pl
      WHERE pl.replaced_at IS NULL
    ),
    producten AS (
      SELECT brand_id, count(*) AS aantal FROM products GROUP BY brand_id
    ),
    -- Gevraagd merk uit de bestekregels. lines_ever is bewust vensterloos: hij voedt
    -- alleen het "gevraagd maar niet in de catalogus"-signaal, en die telling is vandaag te
    -- dun om over twaalf maanden te versmallen (open eind in het goal-document).
    spec AS (
      SELECT regexp_replace(lower(btrim(sl.brand_text)), '[^a-z0-9]', '', 'g') AS sleutel,
             count(*) FILTER (WHERE sl.created_at >= ${grensIso}::timestamptz) AS lines_12m,
             count(*) AS lines_ever,
             count(DISTINCT sl.dossier_id)
               FILTER (WHERE sl.created_at >= ${grensIso}::timestamptz) AS projects_12m
      FROM spec_lines sl
      WHERE coalesce(btrim(sl.brand_text), '') <> ''
      GROUP BY 1
    ),
    -- Gekozen: het merk van het product dat daadwerkelijk aan de regel hangt. Dit loopt via
    -- brand_id en niet via de vrije tekst — een keuze is een feit, geen vraag.
    gekozen AS (
      SELECT p.brand_id, count(*) AS aantal
      FROM spec_lines sl
      JOIN products p ON p.id = sl.matched_product_id
      WHERE sl.created_at >= ${grensIso}::timestamptz
      GROUP BY 1
    ),
    -- Zoekacties met dit merk als filter. Dezelfde ruisfilter als analytics tegel 6/8: de
    -- ZZTEST-zoekacties uit onze eigen rooktests zijn geen vraag.
    zoek AS (
      SELECT regexp_replace(lower(btrim(e.payload->>'brand')), '[^a-z0-9]', '', 'g') AS sleutel,
             count(*) AS aantal,
             count(*) FILTER (
               WHERE e.payload->>'resultCount' ~ '^[0-9]+$'
                 AND (e.payload->>'resultCount')::int = 0
             ) AS zonder_resultaat
      FROM events e
      WHERE e.action = 'search'
        AND e.created_at >= ${grensIso}::timestamptz
        AND coalesce(btrim(e.payload->>'brand'), '') <> ''
        AND coalesce(e.payload->>'query', '') NOT ILIKE 'ZZTEST%'
      GROUP BY 1
    ),
    -- Overwogen producten → hun merk. Guard op de uuid-vorm, zoals in analytics-tiles:
    -- één afwijkende payload mag de ::uuid-cast en daarmee de pagina niet breken.
    overwogen AS (
      SELECT p.brand_id, count(*) AS aantal
      FROM events e
      JOIN products p ON p.id = (e.payload->>'productId')::uuid
      WHERE e.action = 'product_considered'
        AND e.created_at >= ${grensIso}::timestamptz
        AND e.payload->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      GROUP BY 1
    ),
    wachtrij AS (
      SELECT brand_key AS sleutel, max(frequency) AS frequentie
      FROM brand_load_queue
      WHERE status = 'wachtend'
      GROUP BY 1
    ),
    -- De op sleutel gekoppelde signalen samengevoegd over merknaam ÉN aliassen.
    op_sleutel AS (
      SELECT s.id,
             coalesce(sum(spec.lines_12m), 0)   AS lines_12m,
             coalesce(sum(spec.lines_ever), 0)  AS lines_ever,
             coalesce(sum(spec.projects_12m), 0) AS projects_12m,
             coalesce(sum(zoek.aantal), 0)      AS searches_12m,
             coalesce(sum(zoek.zonder_resultaat), 0) AS unmet_12m,
             coalesce(max(wachtrij.frequentie), 0)   AS queue_demand
      FROM sleutels s
      LEFT JOIN spec     ON spec.sleutel = s.sleutel
      LEFT JOIN zoek     ON zoek.sleutel = s.sleutel
      LEFT JOIN wachtrij ON wachtrij.sleutel = s.sleutel
      GROUP BY s.id
    )
    SELECT m.id                AS "brandId",
           m.name              AS "brandName",
           m.brand_code        AS "brandCode",
           m.lifecycle         AS "lifecycle",
           a.id                AS "priceListId",
           a.name              AS "priceListName",
           a.valid_until::text AS "validUntil",
           a.replaced_at       AS "replacedAt",
           coalesce(a.price_count, 0)::int  AS "priceCount",
           coalesce(pr.aantal, 0)::int      AS "productCount",
           coalesce(k.projects_12m, 0)::int AS "projects12m",
           coalesce(k.lines_12m, 0)::int    AS "lines12m",
           coalesce(k.lines_ever, 0)::int   AS "linesEver",
           coalesce(g.aantal, 0)::int       AS "chosen12m",
           coalesce(k.searches_12m, 0)::int AS "searches12m",
           coalesce(k.unmet_12m, 0)::int    AS "unmet12m",
           coalesce(o.aantal, 0)::int       AS "considered12m",
           coalesce(k.queue_demand, 0)::int AS "queueDemand"
    FROM merk m
    LEFT JOIN actief a     ON a.brand_id = m.id
    LEFT JOIN producten pr ON pr.brand_id = m.id
    LEFT JOIN gekozen g    ON g.brand_id = m.id
    LEFT JOIN overwogen o  ON o.brand_id = m.id
    LEFT JOIN op_sleutel k ON k.id = m.id
    ORDER BY m.name ASC`);

  return rows<RuweRij>(res).map((r) => {
    const productCount = num(r.productCount);
    return {
      brandId: r.brandId,
      brandName: r.brandName,
      brandCode: r.brandCode,
      lifecycle: (r.lifecycle as BrandLifecycle | null) ?? null,
      priceListId: r.priceListId,
      priceListName: r.priceListName,
      validUntil: r.validUntil,
      daysLeft: r.validUntil ? daysUntil(r.validUntil, today) : null,
      replacedAt: r.replacedAt ? new Date(r.replacedAt) : null,
      priceCount: num(r.priceCount),
      productCount,
      demand: {
        projects12m: num(r.projects12m),
        lines12m: num(r.lines12m),
        searches12m: num(r.searches12m),
        // "Gevraagd maar niet in de catalogus" (analytics tegel 6) op merkniveau: de vraag
        // naar dít merk terwijl er geen enkel product van is. Bij een merk mét producten is
        // het signaal per definitie nul — de vraag is dan geen dekkingsgat maar gewone vraag,
        // en die telt al mee via lines12m.
        requestedNotInCatalogue: productCount === 0 ? num(r.linesEver) : 0,
        loadQueueDemand: num(r.queueDemand),
        unmetDemand12m: num(r.unmet12m),
        considered12m: num(r.considered12m),
        chosen12m: num(r.chosen12m),
      },
    };
  });
}
