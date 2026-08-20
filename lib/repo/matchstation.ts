// Matchstation (sprint M1, docs/plan-matchstation-eigen-machine.md) — de wachtrij, de
// claim/heartbeat-boekhouding en de repo-laag die het terugstuur-antwoordformaat
// (docs/goal-agent-matching.md) omzet naar spec_lines/spec_line_candidates/events.
//
// ⚠️ Aansluitpunt tussen de twee brondocumenten dat NIET vanzelf sluit, en waar deze
// module een expliciete keuze in maakt (zie HANDOVER.md voor de volledige afweging):
// het antwoordcontract in goal-agent-matching.md is geschreven voor een agent die
// INNERLIJK aan `runMatcher(db, specLineId, actor)` hangt — er bestaat dus al een
// spec-regel. Het matchstation-plan zegt daarentegen letterlijk "geen parse-stap die
// eerst spec-regels moet maken — Claude leest het document zelf": de machine kent bij
// aanvang geen specLineId's. `applyMatchstationResult` hieronder ondersteunt daarom
// BEIDE paden: geef je een bestaande `specLineId` mee, dan wordt die regel gevuld
// (het contract zoals geschreven); geef je een `fixtureCode` mee zonder `specLineId`,
// dan wordt de regel ter plekke aangemaakt (`source: "llm"`) en meteen gevuld. Welke
// van de twee M2 daadwerkelijk gaat gebruiken is een open beslissing voor Timo.
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  importRuns,
  llmUsage,
  matchstationQueue,
  ocrPageImages,
  projectDossiers,
  specLineCandidates,
  specLines,
  type MatchDeviation,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { enqueueBrandLoad } from "./matching";
import { getVisibleProduct } from "./products";
import { getSetting, setSetting } from "./settings";

export const MATCHSTATION_LEASE_MINUTES = 15;
const DEFAULT_MAX_EUR_PER_RUN = 2.0;
const HEARTBEAT_SETTING_KEY = "matchstation_heartbeat";
const LAST_ALERT_SETTING_KEY = "matchstation_last_alert";
export const HEARTBEAT_STALE_MINUTES = 5;
export const CLAIM_STALE_MINUTES = 15;
const ALERT_COOLDOWN_MINUTES = 30;
const ACTOR = "system:matchstation";

// ── Wachtrij: enqueue, claim, opvragen ────────────────────────────────────────

// `bron` (besluit Timo 20 aug): 'handmatig' is de "Ready for matching"-knop, 'auto_import'
// is de automatische aanmelding na elke geslaagde import — ook een import met 0 regels,
// want het matchstation leest de bron zelf en kan alsnog regels vinden.
export type EnqueueBron = "handmatig" | "auto_import";

export async function enqueueDossierForMatching(
  db: AppDb,
  dossierId: string,
  actor?: string,
  bron: EnqueueBron = "handmatig",
): Promise<{ queued: true; id: string } | { queued: false; reason: "already_queued" }> {
  const existing = await db
    .select({ id: matchstationQueue.id })
    .from(matchstationQueue)
    .where(
      and(
        eq(matchstationQueue.dossierId, dossierId),
        sql`${matchstationQueue.status} in ('wachtend', 'geclaimd')`,
      ),
    )
    .limit(1);
  if (existing.length) return { queued: false, reason: "already_queued" };

  const [row] = await db
    .insert(matchstationQueue)
    .values({ dossierId, enqueuedBy: actor ?? null })
    .returning();
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "matchstation_enqueued",
    actor,
    payload: { queueId: row.id, bron },
  });
  return { queued: true, id: row.id };
}

export type ClaimedJob = {
  id: string;
  dossierId: string;
  claimedAt: Date;
  leaseUntil: Date;
};

// Twee statements, bewust niet één CTE: een UPDATE in een WITH-tak deelt in Postgres
// het snapshot van het BEGIN van de query, dus een `next`-tak die in dezelfde query
// naar `status = 'wachtend'` kijkt, ziet de zojuist door `expired` vrijgegeven rij niet
// (gemeten — de eerste versie hiervan liet "na verval opnieuw claimbaar" falen). Elk
// los statement commit meteen (neon-http: geen open transacties), dus het tweede ziet
// gewoon wat het eerste net schreef — gewone read-committed-zichtbaarheid, geen CTE-
// snapshot-valkuil. De atomiciteit die overblijft te bewaken is "claim niet twee keer
// dezelfde rij", en die zit in het tweede statement: `FOR UPDATE SKIP LOCKED` op de
// subquery is de garantie uit de M1-eis "nooit twee machines hetzelfde dossier".
export async function claimNextDossier(
  db: AppDb,
  leaseMinutes: number = MATCHSTATION_LEASE_MINUTES,
): Promise<ClaimedJob | null> {
  await db.execute(sql`
    UPDATE matchstation_queue
    SET status = 'wachtend', claimed_at = NULL, lease_until = NULL, updated_at = now()
    WHERE status = 'geclaimd' AND lease_until < now()
  `);

  const res = await db.execute(sql`
    UPDATE matchstation_queue
    SET status = 'geclaimd',
        claimed_at = now(),
        lease_until = now() + make_interval(mins => ${leaseMinutes}),
        updated_at = now()
    WHERE id = (
      SELECT id FROM matchstation_queue
      WHERE status = 'wachtend'
      ORDER BY enqueued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id AS "id", dossier_id AS "dossierId", claimed_at AS "claimedAt",
              lease_until AS "leaseUntil"
  `);
  const rows = (
    Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
  ) as { id: string; dossierId: string; claimedAt: unknown; leaseUntil: unknown }[];
  const row = rows[0];
  if (!row) return null;
  // Raw db.execute() gaat niet door drizzle's kolomtypering — beide drivers geven
  // timestamptz hier als string terug (neon-http) of soms al als Date (PGlite), dus
  // altijd expliciet naar Date. `new Date(bestaandeDate)` is een no-op-kopie.
  return {
    id: row.id,
    dossierId: row.dossierId,
    claimedAt: new Date(row.claimedAt as string | Date),
    leaseUntil: new Date(row.leaseUntil as string | Date),
  };
}

// Voor het scherm (RegelsTab, intern-only blok): de meest recente wachtrij-entry van
// dit dossier, welke status hij ook heeft. `null` betekent "nog nooit aangeboden".
export async function getLatestQueueEntry(db: AppDb, dossierId: string) {
  const [row] = await db
    .select()
    .from(matchstationQueue)
    .where(eq(matchstationQueue.dossierId, dossierId))
    .orderBy(desc(matchstationQueue.enqueuedAt))
    .limit(1);
  return row ?? null;
}

export async function getQueueJob(db: AppDb, queueId: string) {
  const [row] = await db
    .select()
    .from(matchstationQueue)
    .where(eq(matchstationQueue.id, queueId))
    .limit(1);
  return row ?? null;
}

// Alle spec_lines van het dossier, oplopend — de vorm die het GET-endpoint teruggeeft
// zodat de machine weet welke regels al bestaan (het "specLineId"-pad hierboven).
export async function getExistingLinesForMatching(db: AppDb, dossierId: string) {
  return db
    .select({
      id: specLines.id,
      fixtureCode: specLines.fixtureCode,
      quantity: specLines.quantity,
      brandText: specLines.brandText,
      productText: specLines.productText,
      reqArticleCode: specLines.reqArticleCode,
    })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
}

// Dossiergegevens voor het ophaal-endpoint. BEWUST geen DossierScope (lib/repo/toegang.ts,
// mensenaccounts/organisaties): het matchstation is een intern systeemaccount met een
// eigen machine-sleutel, geen sessie, en ziet elk dossier dat in de wachtrij staat —
// dat is de aard van een machine-credential en geen omzeiling van de mensen-scoping.
export async function getDossierForMatchstation(db: AppDb, dossierId: string) {
  const [row] = await db
    .select({ id: projectDossiers.id, name: projectDossiers.name, customer: projectDossiers.customer })
    .from(projectDossiers)
    .where(eq(projectDossiers.id, dossierId))
    .limit(1);
  return row ?? null;
}

// ⚠️ Aanname/open punt (zie HANDOVER.md voor de volledige toelichting): de app bewaart
// het originele geüploade bestand (PDF/Excel/Word) NERGENS. De PDF-import parset de
// tekstlaag in de BROWSER en stuurt nooit de bytes naar de server (413-fix,
// app/projects/actions.ts:236-241); een Excel/Word-uploadpad bestaat niet. Wat er wél
// is: de markdown-reconstructie van een tekst-PDF (`import_runs.raw_markdown`) en, voor
// een beeld-PDF, de gerenderde paginabeelden (`ocr_page_images`). Deze functie geeft de
// beste beschikbare reconstructie terug van de MEEST RECENTE bevestigde import van het
// dossier — niet het originele bestand zelf, want dat bestaat niet.
export type MatchstationDocument = {
  importRunId: string | null;
  filename: string | null;
  markdown: string | null;
  pageImages: { page: number; tile: number; mime: string }[];
  warning: string;
};

const DOCUMENT_WARNING =
  "Het originele geüploade bestand (PDF/Excel/Word) wordt niet bewaard door de app " +
  "(413-fix: de PDF verlaat de browser nooit; er is geen Excel/Word-uploadpad). Dit is " +
  "de beste reconstructie die beschikbaar is — zie HANDOVER.md, 'Matchstation M1'.";

export async function getDocumentForDossier(
  db: AppDb,
  dossierId: string,
): Promise<MatchstationDocument> {
  const [run] = await db
    .select({
      id: importRuns.id,
      filename: importRuns.filename,
      rawMarkdown: importRuns.rawMarkdown,
    })
    .from(importRuns)
    .where(and(eq(importRuns.dossierId, dossierId), eq(importRuns.status, "bevestigd")))
    .orderBy(desc(importRuns.createdAt))
    .limit(1);
  if (!run) {
    return { importRunId: null, filename: null, markdown: null, pageImages: [], warning: DOCUMENT_WARNING };
  }
  const pageImages = await db
    .select({ page: ocrPageImages.page, tile: ocrPageImages.tile, mime: ocrPageImages.mime })
    .from(ocrPageImages)
    .where(eq(ocrPageImages.importRunId, run.id))
    .orderBy(asc(ocrPageImages.page), asc(ocrPageImages.tile));
  return {
    importRunId: run.id,
    filename: run.filename,
    markdown: run.rawMarkdown,
    pageImages,
    warning: DOCUMENT_WARNING,
  };
}

// Markeer de job afgerond ('verwerkt') — het POST-endpoint roept dit aan ná het
// verwerken van alle regels in de batch, ongeacht of individuele regels niet_beoordeeld
// werden. Idempotent: een dubbele afronding overschrijft alleen het tijdstip.
export async function markJobProcessed(db: AppDb, queueId: string): Promise<void> {
  await db
    .update(matchstationQueue)
    .set({ status: "verwerkt", resultReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(matchstationQueue.id, queueId));
}

// ── Kostenplafond (M1-eis 4) ──────────────────────────────────────────────────
// Los van OCR_MAX_EUR_PER_RUN (lib/ai/ocr.ts): dat plafond somt alle llm_usage van één
// import_run_id zonder purpose-filter (geverifieerd, ocr.ts:557-566) — meetellen op
// dezelfde teller zou de twee plafonds laten interfereren met wat OCR al heeft verstookt.
// Hier: eigen kolom (matchstation_job_id) + eigen purpose-filter ('matching').
export function matchstationMaxEurPerRun(): number {
  const raw = process.env.MATCHSTATION_MAX_EUR_PER_RUN;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_EUR_PER_RUN;
}

async function matchstationRunSpend(db: AppDb, queueId: string): Promise<number> {
  const [row] = (await db
    .select({ total: sql<string>`coalesce(sum(${llmUsage.costEur}), 0)` })
    .from(llmUsage)
    .where(
      and(eq(llmUsage.matchstationJobId, queueId), eq(llmUsage.purpose, "matching")),
    )) as { total: string }[];
  return Number(row?.total ?? 0);
}

// ── Het antwoordcontract → repo-schrijven ─────────────────────────────────────

export type MatchstationUitkomst =
  | "gevonden"
  | "meerdere"
  | "bestaat_niet"
  | "merk_ontbreekt"
  | "geen_verlichting"
  | "onzeker";

export const MATCHSTATION_UITKOMSTEN: readonly MatchstationUitkomst[] = [
  "gevonden",
  "meerdere",
  "bestaat_niet",
  "merk_ontbreekt",
  "geen_verlichting",
  "onzeker",
];

export type MatchstationSpecGetoetst = {
  veld: string;
  gevraagd?: unknown;
  gevonden?: unknown;
  oordeel?: "groen" | "geel" | "rood" | "onbekend";
};

export type MatchstationBewijs = {
  merkBevestigd?: string | null;
  naamTreffer?: "exact" | "bijna" | "serie" | null;
  specsGetoetst?: MatchstationSpecGetoetst[];
  kandidatenOver?: number | null;
};

export type MatchstationAlternatief = {
  productId: string;
  artikelnummer?: string | null;
  prijs?: string | null;
  verschil?: string | null;
};

// Eén regel uit de batch. `specLineId` óf `fixtureCode` is verplicht — zie de kop van
// dit bestand voor waarom er twee paden zijn.
export type MatchstationLineResult = {
  specLineId?: string | null;
  fixtureCode?: string | null;
  brandText?: string | null;
  productText?: string | null;
  quantity?: number | null;
  uitkomst: MatchstationUitkomst;
  productId?: string | null;
  artikelnummer?: string | null;
  prijs?: string | null;
  prijsVast?: boolean | null;
  alternatieven?: MatchstationAlternatief[];
  bewijs?: MatchstationBewijs | null;
  toelichting?: string | null;
  costEur?: number | null;
};

export type ApplyResultOutcome =
  | { applied: "result"; specLineId: string; status: string; reviewKind: string | null }
  | { applied: "niet_beoordeeld"; specLineId: string; reason: "budget" }
  | { applied: "skipped"; reason: "wrong_dossier" };

function deviationsFromBewijs(bewijs?: MatchstationBewijs | null): MatchDeviation[] {
  if (!bewijs?.specsGetoetst?.length) return [];
  return bewijs.specsGetoetst.map((s) => ({
    field: s.veld,
    requested: (s.gevraagd ?? null) as string | number,
    delivered: (s.gevonden ?? null) as string | number | null,
    verdict: s.oordeel ?? "onbekend",
  }));
}

// Bestaande regel vullen, of — geen specLineId meegegeven — ter plekke aanmaken
// (source 'llm': deze regel komt niet uit de deterministische import maar uit de
// leesloop van het matchstation, en dat mag in de UI zichtbaar blijven).
async function resolveOrCreateLine(
  db: AppDb,
  dossierId: string,
  result: MatchstationLineResult,
): Promise<{ id: string; brandText: string | null } | { error: "wrong_dossier" }> {
  if (result.specLineId) {
    const [line] = await db
      .select({ id: specLines.id, dossierId: specLines.dossierId, brandText: specLines.brandText })
      .from(specLines)
      .where(eq(specLines.id, result.specLineId))
      .limit(1);
    if (!line || line.dossierId !== dossierId) return { error: "wrong_dossier" };
    return { id: line.id, brandText: line.brandText };
  }
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${specLines.sortOrder}), -1)` })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))) as { max: number }[];
  const [row] = await db
    .insert(specLines)
    .values({
      dossierId,
      fixtureCode: result.fixtureCode!,
      quantity: result.quantity ?? null,
      brandText: result.brandText ?? null,
      productText: result.productText ?? null,
      source: "llm",
      sortOrder: Number(max) + 1,
    })
    .returning({ id: specLines.id, brandText: specLines.brandText });
  return { id: row.id, brandText: row.brandText };
}

async function applyNietBeoordeeld(
  db: AppDb,
  specLineId: string,
  reviewKind: "onzeker" | "niet_beoordeeld",
): Promise<void> {
  await db
    .update(specLines)
    .set({
      status: "open",
      reviewKind,
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, specLineId));
}

/**
 * Eén regel uit het antwoordcontract toepassen. Verwacht dat het kostenplafond en de
 * dossier-eigendom al zijn gecontroleerd door de aanroeper (het POST-endpoint loopt de
 * batch in volgorde langs en stopt met toepassen zodra het plafond geraakt is —
 * `applyMatchstationResult` doet de plafondcheck zelf, per regel, zodat de aanroeper dat
 * niet dubbel hoeft te doen).
 */
export async function applyMatchstationResult(
  db: AppDb,
  input: { queueId: string; dossierId: string; result: MatchstationLineResult },
): Promise<ApplyResultOutcome> {
  const { result } = input;
  const resolved = await resolveOrCreateLine(db, input.dossierId, result);
  if ("error" in resolved) return { applied: "skipped", reason: "wrong_dossier" };
  const specLineId = resolved.id;
  // Het gevraagde merk voor de inlaadwachtrij komt van de REGEL, niet van het
  // resultaat — zelfde bron als runMatcher (line.brandText). Bij het fixtureCode-pad
  // is dat precies het brandText waarmee de regel zonet is aangemaakt.
  const brandTextForQueue = resolved.brandText ?? result.brandText ?? null;

  // Plafond: deze regel telt zijn eigen kosten (indien gerapporteerd) tegen wat déze
  // job al heeft verstookt. Geraakt → niet_beoordeeld, ongeacht de gerapporteerde
  // uitkomst (M1-eis 4) — status open MET review_kind, nooit een kale open.
  const cost = result.costEur ?? 0;
  const cap = matchstationMaxEurPerRun();
  const spendSoFar = await matchstationRunSpend(db, input.queueId);
  if (spendSoFar + cost > cap) {
    await applyNietBeoordeeld(db, specLineId, "niet_beoordeeld");
    await logEvent(db, {
      entity: "spec_line",
      entityId: specLineId,
      action: "matchstation_budget_exceeded",
      actor: ACTOR,
      payload: { queueId: input.queueId, spendSoFar, cost, capEur: cap },
    });
    return { applied: "niet_beoordeeld", specLineId, reason: "budget" };
  }
  if (cost > 0) {
    await db.insert(llmUsage).values({
      purpose: "matching",
      costEur: String(cost),
      matchstationJobId: input.queueId,
    });
  }

  const deviations = deviationsFromBewijs(result.bewijs);
  const grond = result.toelichting ?? null;

  // Idempotent, zelfde vorm als runMatcher: oude kandidaten van deze regel eerst weg
  // (een hermatch — bv. na een correctie — laat geen dubbele of verweesde rijen staan).
  await db.delete(specLineCandidates).where(eq(specLineCandidates.specLineId, specLineId));

  switch (result.uitkomst) {
    case "gevonden": {
      // Verzin nooit een product (harde regel, goal-agent-matching.md): een product_id
      // dat niet (meer) zichtbaar is — verouderd, verlopen prijslijst, of gewoon
      // verkeerd — mag nooit stilzwijgend matchedProductId in gaan. Zakt dan veilig
      // terug naar 'onzeker' in plaats van een 500 of een spookmatch (regel 3,
      // docs/INVOERVALIDATIE.md: nooit een cast die de database laat klappen).
      const product = result.productId
        ? await getVisibleProduct(db, result.productId)
        : null;
      // `product?.id` en niet alleen `!product`: visible_products is een view en
      // drizzle typeert viewkolommen als nullable, dus `product.id` blijft
      // `string | null` ook ná een waarheidscontrole op `product` zelf. Praktisch kan
      // een geretourneerde rij nooit een lege id hebben (het is de PK), maar de
      // vangrail hoort hetzelfde te zijn als "geen product": zonder harde id geen
      // match, geen spookkandidaat.
      const productId = product?.id;
      if (!productId) {
        await applyNietBeoordeeld(db, specLineId, "onzeker");
        await logEvent(db, {
          entity: "spec_line",
          entityId: specLineId,
          action: "matchstation_product_not_visible",
          actor: ACTOR,
          payload: { productId: result.productId ?? null, toelichting: grond },
        });
        return { applied: "result", specLineId, status: "open", reviewKind: "onzeker" };
      }
      await db.insert(specLineCandidates).values({
        specLineId,
        productId,
        rank: 1,
        list: "aantoonbaar",
        score: null,
        verdicts: deviations,
        chosen: true,
        chosenBy: ACTOR,
        chosenReason: grond,
      });
      await db
        .update(specLines)
        .set({
          matchedProductId: productId,
          status: "groen",
          deviations,
          reviewKind: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(specLines.id, specLineId));
      break;
    }
    case "meerdere": {
      // Besluit Timo 13 aug (plan-matchstation-eigen-machine.md, "Besluiten Timo" #3):
      // geen geel-eerst-poort, maar 'meerdere' blijft WEL geel — de tabel in
      // goal-agent-matching.md zet dit op 'open', dat besluit wint daarvan.
      let rank = 1;
      for (const alt of result.alternatieven ?? []) {
        const altProduct = await getVisibleProduct(db, alt.productId);
        const altProductId = altProduct?.id;
        if (!altProductId) continue; // zelfde vangrail als hierboven: geen spookkandidaat
        await db.insert(specLineCandidates).values({
          specLineId,
          productId: altProductId,
          rank: rank++,
          list: "onvolledig",
          score: null,
          verdicts: [],
          chosen: false,
          chosenBy: null,
          chosenReason: alt.verschil ?? null,
        });
      }
      await db
        .update(specLines)
        .set({
          matchedProductId: null,
          status: "geel",
          deviations,
          reviewKind: "geel",
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(specLines.id, specLineId));
      break;
    }
    case "bestaat_niet":
    case "merk_ontbreekt":
    case "geen_verlichting": {
      const status =
        result.uitkomst === "bestaat_niet"
          ? "rood"
          : result.uitkomst === "merk_ontbreekt"
            ? "blauw"
            : "paars";
      await db
        .update(specLines)
        .set({
          matchedProductId: null,
          status,
          deviations: null,
          reviewKind: null,
          reviewedAt: null,
          noMatchReason: grond,
          updatedAt: new Date(),
        })
        .where(eq(specLines.id, specLineId));
      // Blauw → inlaadwachtrij, zelfde gedrag als runMatcher (H-08): het
      // inkoopsignaal ("dit merk drie keer gevraagd") hoort er ook via dit pad te
      // komen, niet alleen via de deterministische engine.
      if (status === "blauw" && brandTextForQueue) {
        await enqueueBrandLoad(db, brandTextForQueue);
      }
      break;
    }
    case "onzeker": {
      await applyNietBeoordeeld(db, specLineId, "onzeker");
      break;
    }
  }

  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "matchstation_result_applied",
    actor: ACTOR,
    payload: {
      queueId: input.queueId,
      uitkomst: result.uitkomst,
      productId: result.productId ?? null,
      bewijs: result.bewijs ?? null,
      toelichting: grond,
    },
  });

  const [after] = await db
    .select({ status: specLines.status, reviewKind: specLines.reviewKind })
    .from(specLines)
    .where(eq(specLines.id, specLineId))
    .limit(1);
  return {
    applied: "result",
    specLineId,
    status: after?.status ?? "open",
    reviewKind: after?.reviewKind ?? null,
  };
}

// ── Heartbeat + dood-melding (M1-eis 3) ───────────────────────────────────────
// Elke poll van het ophaal-endpoint is een heartbeat — dit is óók de "staat de pc
// aan"-check (plan-document, besluit 1): een uitgeschakelde machine poll niet meer, en
// dan wordt het antwoord hieronder vanzelf stil.
export async function registerHeartbeat(db: AppDb, now = new Date()): Promise<void> {
  await setSetting(db, HEARTBEAT_SETTING_KEY, now.toISOString());
}

export async function getLastHeartbeat(db: AppDb): Promise<Date | null> {
  const iso = await getSetting<string>(db, HEARTBEAT_SETTING_KEY);
  return iso ? new Date(iso) : null;
}

export type DeadAlert =
  | { kind: "claim_stale"; queueId: string; dossierId: string; claimedAt: Date }
  | { kind: "heartbeat_stale"; lastHeartbeat: Date | null; pendingWork: number };

// Wat er nu gemeld moet worden. Bewust een pure vraag ("wat is er mis") gescheiden van
// het versturen (sendDeadAlert) — dezelfde splitsing als route-allowlist.ts
// (beslisregel apart van de aanroep), en het maakt findDeadAlerts zonder bijwerkingen
// testbaar.
export async function findDeadAlerts(db: AppDb, now = new Date()): Promise<DeadAlert[]> {
  const alerts: DeadAlert[] = [];
  const claimCutoff = new Date(now.getTime() - CLAIM_STALE_MINUTES * 60_000);

  const staleClaims = await db
    .select({
      id: matchstationQueue.id,
      dossierId: matchstationQueue.dossierId,
      claimedAt: matchstationQueue.claimedAt,
    })
    .from(matchstationQueue)
    .where(
      and(
        eq(matchstationQueue.status, "geclaimd"),
        isNull(matchstationQueue.resultReceivedAt),
        isNull(matchstationQueue.deadAlertSentAt),
        lt(matchstationQueue.claimedAt, claimCutoff),
      ),
    );
  for (const c of staleClaims) {
    if (!c.claimedAt) continue;
    alerts.push({ kind: "claim_stale", queueId: c.id, dossierId: c.dossierId, claimedAt: c.claimedAt });
  }

  const lastHeartbeat = await getLastHeartbeat(db);
  const heartbeatCutoff = now.getTime() - HEARTBEAT_STALE_MINUTES * 60_000;
  const heartbeatStale = !lastHeartbeat || lastHeartbeat.getTime() < heartbeatCutoff;
  if (heartbeatStale) {
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)` })
      .from(matchstationQueue)
      .where(eq(matchstationQueue.status, "wachtend"))) as { n: number }[];
    const pendingWork = Number(n ?? 0);
    if (pendingWork > 0) {
      const lastAlertIso = await getSetting<string>(db, LAST_ALERT_SETTING_KEY);
      const lastAlert = lastAlertIso ? new Date(lastAlertIso) : null;
      const cooledDown =
        !lastAlert || lastAlert.getTime() < now.getTime() - ALERT_COOLDOWN_MINUTES * 60_000;
      if (cooledDown) {
        alerts.push({ kind: "heartbeat_stale", lastHeartbeat, pendingWork });
      }
    }
  }
  return alerts;
}

// Actief melden (mail/push, geen passieve statuspagina — Henk's review, "zonder dit
// niet live"). Er is geen mailprovider in deze fase (besluit 6, lib/auth-factory.ts) —
// zelfde open punt hier. MATCHSTATION_ALERT_WEBHOOK_URL is de generieke ontsnapping
// (Slack/Discord/ntfy/Zapier, wat Timo maar wil koppelen); zonder die env-var valt de
// melding terug op console.error + een events-rij, zodat hij nooit spoorloos verdwijnt.
export async function sendDeadAlert(
  db: AppDb,
  alert: DeadAlert,
  now = new Date(),
): Promise<void> {
  const text =
    alert.kind === "claim_stale"
      ? `Matchstation: dossier ${alert.dossierId} staat al >${CLAIM_STALE_MINUTES} min geclaimd zonder resultaat (queue ${alert.queueId}).`
      : `Matchstation: heartbeat is ${
          alert.lastHeartbeat ? `verouderd sinds ${alert.lastHeartbeat.toISOString()}` : "nog nooit ontvangen"
        }, terwijl ${alert.pendingWork} dossier(s) klaarstaan.`;

  const webhook = process.env.MATCHSTATION_ALERT_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      console.error("[matchstation] alert-webhook faalde:", err);
    }
  } else {
    console.error("[matchstation]", text);
  }

  await logEvent(db, {
    entity: "matchstation",
    entityId: alert.kind === "claim_stale" ? alert.queueId : null,
    action: "matchstation_dead_alert",
    actor: "system",
    payload: { kind: alert.kind, text },
  });

  if (alert.kind === "claim_stale") {
    await db
      .update(matchstationQueue)
      .set({ deadAlertSentAt: now, updatedAt: now })
      .where(eq(matchstationQueue.id, alert.queueId));
  } else {
    await setSetting(db, LAST_ALERT_SETTING_KEY, now.toISOString());
  }
}
