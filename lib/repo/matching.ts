// Persistente kant van de vijfstatussen-matcher: draait de engine (lib/matching/engine.ts)
// voor een spec-regel, schrijft status + afwijkingen op de regel, bewaart de kandidaten
// (C-10) en logt de events (K-01/K-02). Zet blauwe merken op de inlaadwachtrij (H-08).
import { and, eq, sql } from "drizzle-orm";
import {
  brandLoadQueue,
  specLineCandidates,
  specLines,
  type MatchDeviation,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import {
  brandKeyOf,
  evaluateSpecLine,
  type MatchOutcome,
  type SpecRequest,
} from "@/lib/matching/engine";

// Geëxporteerd (ocr.ts, upgradeOcrLine): dezelfde omzetting van een specLines-rij
// naar SpecRequest die runMatcher hieronder gebruikt — zodat de gerichte
// stillValid-toets op het oude product exact dezelfde "nieuwe gevraagde specs"
// gebruikt als de hermatch zelf, zonder de numeric-conversies te dupliceren.
export function specRequestFromLine(l: typeof specLines.$inferSelect): SpecRequest {
  return {
    brandText: l.brandText,
    productText: l.productText,
    // Het gevraagde leveranciersartikelnummer is het eerste en hardste signaal van de
    // matcher (goal-artikelnummer-matching, B3). Stond hier tot 11 aug hard op null —
    // de exacte-SKU-route van de engine was daardoor een dood pad, en een regel die
    // "21012 0298" vroeg kreeg twee verkeerde drivers voorgeschoteld terwijl dat
    // artikel gewoon in de catalogus staat.
    sku: l.reqArticleCode,
    specs: {
      kelvin: l.reqKelvin,
      cri: l.reqCri,
      ip: l.reqIp,
      watt: l.reqWatt != null ? Number(l.reqWatt) : null,
      lumen: l.reqLumen,
      beamAngle: l.reqBeamAngle != null ? Number(l.reqBeamAngle) : null,
      sizeCm: l.reqSizeCm != null ? Number(l.reqSizeCm) : null,
      shape: l.reqShape,
      color: l.reqColor,
      dimmable: l.reqDimmable,
    },
  };
}

// Draai de matcher voor één regel en persisteer alles. Idempotent: verwijdert eerst de
// oude kandidaten. Retourneert de uitkomst.
export async function runMatcher(
  db: AppDb,
  specLineId: string,
  actor?: string,
): Promise<MatchOutcome> {
  const [line] = await db
    .select()
    .from(specLines)
    .where(eq(specLines.id, specLineId))
    .limit(1);
  if (!line) throw new Error(`spec line ${specLineId} not found`);

  const outcome = await evaluateSpecLine(db, specRequestFromLine(line));

  // De regel vroeg een artikelnummer dat niets opleverde. Dat blokkeert niets — de
  // tekstroute heeft gewoon gedraaid (besluit Timo, B5) — maar het wordt vastgelegd,
  // want zo'n code wijst meestal op een gat in de catalogus in plaats van op een
  // vergissing van de klant. Gemeten voorbeeld: `32812 9220 BRBB` bestaat bij Delta
  // Light, maar de hele LUNELLE-familie ontbreekt in onze import, en de tekstroute
  // bood er acht SPY 52 CLIP-varianten voor in de plaats aan.
  if (outcome.articleCodeMiss) {
    await logEvent(db, {
      entity: "spec_line",
      entityId: specLineId,
      action: "article_code_not_found",
      actor,
      payload: {
        articleCode: outcome.articleCodeMiss,
        brandText: line.brandText,
        // Wat de tekstroute er wél van maakte — zonder dit is het event niet te duiden.
        status: outcome.status,
        candidates: outcome.provable.length + outcome.incomplete.length,
      },
    });
  }

  // oude kandidaten weg (idempotent)
  await db
    .delete(specLineCandidates)
    .where(eq(specLineCandidates.specLineId, specLineId));

  // nieuwe kandidaten opslaan + product.considered loggen (K-02: het "overwogen"-goud)
  const all = [
    ...outcome.provable.map((c) => ({ ...c, listName: "aantoonbaar" as const })),
    ...outcome.incomplete.map((c) => ({ ...c, listName: "onvolledig" as const })),
  ];
  let rank = 1;
  for (const c of all) {
    await db.insert(specLineCandidates).values({
      specLineId,
      productId: c.productId,
      rank: rank++,
      list: c.listName,
      score: String(c.score ?? 0),
      verdicts: c.deviations,
    });
    await logEvent(db, {
      entity: "spec_line",
      entityId: specLineId,
      action: "product_considered",
      actor,
      payload: { productId: c.productId, rank: rank - 1, list: c.listName },
    });
  }

  // Review-flags: geëvalueerd op de ÓUDE regelwaarde, vóór de update. Een niet-gele
  // reviewKind (variant/onvolledig/ocr) zegt iets over de bron of een eerdere keuze van
  // de regel — niet over déze matchuitkomst — en blijft dus staan bij een hermatch.
  // Dat repareert ook de latente bug dat een hermatch ocr-flags wiste
  // (reviewer-bevinding 3). Alleen de geel-flag is van de matcher zelf en wordt
  // hieronder opnieuw bepaald.
  const preservedKind =
    line.reviewKind && line.reviewKind !== "geel" ? line.reviewKind : null;

  // B3 (geel auto-door): de engine markeerde de ondubbelzinnige bijna-match (precies
  // één schoon-gele kandidaat, geen keuzeveld-afwijking). Een bewaarde andere
  // review-flag blokkeert het automatisch accepteren — dan eerst de mens.
  const auto = preservedKind ? undefined : outcome.unambiguousYellow;

  // status + afwijkingen op de regel schrijven; matched blijft leeg tot een keuze,
  // BEHALVE bij auto-door (B3): dan wordt de bijna-match direct gezet, zónder review.
  // Geel = "Brink reviewt of de afwijking acceptabel is" (regelset) → automatisch in de
  // review-wachtrij. Andere statussen resetten de geel-flag zodat een hermatch de
  // wachtrij opschoont; bewaarde flags (zie hierboven) gaan altijd voor.
  await db
    .update(specLines)
    .set({
      status: outcome.status,
      deviations: auto ? auto.deviations : outcome.topDeviations,
      reviewKind:
        preservedKind ?? (outcome.status === "geel" && !auto ? "geel" : null),
      reviewedAt: null,
      updatedAt: new Date(),
      ...(auto ? { matchedProductId: auto.productId } : {}),
    })
    .where(eq(specLines.id, specLineId));

  // B3: de auto-geaccepteerde kandidaat markeren — zelfde velden als chooseCandidate
  // (chosen/chosenBy), maar met het systeem als kiezer. Event mét de afwijkingen in de
  // payload (ijzeren regel 5: elke match wordt gelogd).
  if (auto) {
    await db
      .update(specLineCandidates)
      .set({ chosen: true, chosenBy: "system:auto", chosenReason: null })
      .where(
        and(
          eq(specLineCandidates.specLineId, specLineId),
          eq(specLineCandidates.productId, auto.productId),
        ),
      );
    await logEvent(db, {
      entity: "spec_line",
      entityId: specLineId,
      action: "near_match_auto_accepted",
      actor,
      payload: { productId: auto.productId, deviations: auto.deviations },
    });
  }

  // blauw → merk op de inlaadwachtrij (frequentie++). De wachtrij krijgt de CANONIEKE
  // key uit de engine (O5: bij een alias-hit b.v. 'mycreations' voor boek-woord
  // 'Signify' — dát merk moeten wij inladen); het event bewaart beide (regel 5).
  if (outcome.status === "blauw" && line.brandText) {
    await enqueueBrandLoad(db, line.brandText, outcome.brandKey);
    await logEvent(db, {
      entity: "spec_line",
      entityId: specLineId,
      action: "brand_load_requested",
      actor,
      payload: {
        brandText: line.brandText,
        brandKey: outcome.brandKey ?? brandKeyOf(line.brandText),
      },
    });
  }

  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "matched_status",
    actor,
    payload: {
      status: outcome.status,
      provable: outcome.provable.length,
      incomplete: outcome.incomplete.length,
    },
  });

  return outcome;
}

// H-08: merk op de inlaadwachtrij, frequentie ophogen bij herhaling. brandKey is
// optioneel (backwards compatible, bv. setLineStatus): meegegeven is het de canonieke
// key uit de engine (alias-resolve, O5); zonder valt hij terug op brandKeyOf(brandText).
export async function enqueueBrandLoad(
  db: AppDb,
  brandText: string,
  brandKey?: string,
) {
  const key = brandKey ?? brandKeyOf(brandText);
  if (!key) return;
  const existing = await db
    .select({ id: brandLoadQueue.id, frequency: brandLoadQueue.frequency })
    .from(brandLoadQueue)
    .where(eq(brandLoadQueue.brandKey, key))
    .limit(1);
  if (existing.length) {
    await db
      .update(brandLoadQueue)
      .set({ frequency: existing[0].frequency + 1, updatedAt: new Date() })
      .where(eq(brandLoadQueue.id, existing[0].id));
  } else {
    await db.insert(brandLoadQueue).values({
      brandKey: key,
      displayName: brandText,
      frequency: 1,
    });
  }
}

// Kandidaat kiezen (regel-detail 3.6). Uit lijst 2 is een reden verplicht → review-item.
export async function chooseCandidate(
  db: AppDb,
  input: {
    specLineId: string;
    productId: string;
    fromList: "aantoonbaar" | "onvolledig";
    reason?: string | null;
    actor?: string;
  },
) {
  // kandidaat-record markeren
  await db
    .update(specLineCandidates)
    .set({ chosen: false })
    .where(eq(specLineCandidates.specLineId, input.specLineId));
  await db
    .update(specLineCandidates)
    .set({
      chosen: true,
      chosenBy: input.actor ?? null,
      chosenReason: input.reason ?? null,
    })
    .where(
      and(
        eq(specLineCandidates.specLineId, input.specLineId),
        eq(specLineCandidates.productId, input.productId),
      ),
    );

  // afwijkingen van deze kandidaat overnemen op de regel + status (her)bepalen
  const [cand] = await db
    .select({ verdicts: specLineCandidates.verdicts })
    .from(specLineCandidates)
    .where(
      and(
        eq(specLineCandidates.specLineId, input.specLineId),
        eq(specLineCandidates.productId, input.productId),
      ),
    )
    .limit(1);
  const deviations = (cand?.verdicts ?? []) as MatchDeviation[];
  const status = statusFromDeviations(deviations);

  // keuze uit lijst 2 → review-item (onvolledig-bevestiging, D-01)
  const reviewKind = input.fromList === "onvolledig" ? "onvolledig" : null;

  await db
    .update(specLines)
    .set({
      matchedProductId: input.productId,
      status,
      deviations,
      reviewKind,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, input.specLineId));

  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "spec_line_matched",
    actor: input.actor,
    payload: {
      productId: input.productId,
      status,
      list: input.fromList,
      reason: input.reason ?? null,
    },
  });
  return status;
}

// Status uit de afwijkingen van de gekozen kandidaat (strengste telt).
function statusFromDeviations(deviations: MatchDeviation[]): "groen" | "geel" | "rood" {
  if (deviations.some((d) => d.verdict === "rood")) return "rood";
  if (deviations.some((d) => d.verdict === "geel")) return "geel";
  return "groen";
}

// Handmatig een status zetten (rood/paars/blauw vanuit de regel-detailknoppen).
export async function setLineStatus(
  db: AppDb,
  input: {
    specLineId: string;
    status: "rood" | "paars" | "blauw";
    reason?: string | null;
    brandText?: string | null;
    actor?: string;
  },
) {
  await db
    .update(specLines)
    .set({
      status: input.status,
      matchedProductId: null,
      noMatchReason: input.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, input.specLineId));

  if (input.status === "blauw" && input.brandText) {
    await enqueueBrandLoad(db, input.brandText);
  }
  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "spec_line_no_match",
    actor: input.actor,
    payload: { status: input.status, reason: input.reason ?? null },
  });
}

// Match losmaken → terug naar 'open' (reden verplicht, K-03).
export async function unlinkMatch(
  db: AppDb,
  specLineId: string,
  reason: string,
  actor?: string,
) {
  await db
    .update(specLines)
    .set({
      matchedProductId: null,
      status: "open",
      deviations: null,
      reviewKind: null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, specLineId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: specLineId,
    action: "match_unlinked",
    actor,
    payload: { reason },
  });
}

// Kleuren-telling per dossier (E-03) — voor de header en de dossierlijst.
export async function getStatusCounts(
  db: AppDb,
  dossierId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: specLines.status, n: sql<number>`count(*)` })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))
    .groupBy(specLines.status);
  const out: Record<string, number> = {
    open: 0, groen: 0, geel: 0, blauw: 0, rood: 0, paars: 0,
  };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function getCandidates(db: AppDb, specLineId: string) {
  return db
    .select()
    .from(specLineCandidates)
    .where(eq(specLineCandidates.specLineId, specLineId))
    .orderBy(specLineCandidates.rank);
}
