// Review-station (masterplan §4 stap 3; functioneel ontwerp §3.7 + flow §4.4).
// De wachtrij = alle regels waar reviewKind ≠ null: geel-review, variantkeuze,
// onvolledig-bevestiging, OCR-controle. Elke beslissing draagt actor + reden (D-06).
// Daarnaast (stap 7, herontwerp 2026-07-14): rode regels zonder match horen als
// werkvoorraad op de review-pagina ("Niet gevonden — handmatig linken"). Rood is een
// STATUS, geen review-flag — die regels krijgen dus geen reviewKind, maar een eigen query.
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { specLineCandidates, specLines } from "@/db/schema";
import { triggerVangnet } from "@/lib/ai/vangnet";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export async function getReviewQueue(db: AppDb, dossierId: string) {
  const rows = await db
    .select({
      id: specLines.id,
      fixtureCode: specLines.fixtureCode,
      brandText: specLines.brandText,
      productText: specLines.productText,
      status: specLines.status,
      reviewKind: specLines.reviewKind,
      reviewedAt: specLines.reviewedAt,
      reviewedBy: specLines.reviewedBy,
      reviewDecision: specLines.reviewDecision,
      deviations: specLines.deviations,
      reqColor: specLines.reqColor,
      sortOrder: specLines.sortOrder,
      // OCR-herkomst (bouwstap 7/8): de OcrCard toont hiermee het paginanummer en
      // linkt naar het opgeslagen paginabeeld — de échte bron van de lezing (B6).
      sourcePage: specLines.sourcePage,
      importRunId: specLines.importRunId,
    })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
  // aanvraagvolgorde (C-11), niet urgentie
  const pending = rows.filter((r) => r.reviewKind && !r.reviewedAt);
  const done = rows.filter((r) => r.reviewKind && r.reviewedAt);
  return { pending, done };
}

// Rode regels zonder match: "merk wél, product niet". Geen review-flag (rood is een
// status), wel werkvoorraad — de review-pagina toont ze in een eigen sectie waar de
// mens zélf een vergelijkbaar product zoekt en linkt (ijzeren regel 4: het systeem
// doet hier géén suggesties; zoeken + klikken is een menshandeling).
// Uitsluiting versoepeld (B7/reviewer-2, bouwstap 4): niet langer "geen reviewKind"
// maar "geen ÓPEN review en niet afgewezen". Een rode OCR-regel houdt na "Goed" in
// het deck zijn reviewKind='ocr' + reviewedAt — de lezing is bevestigd, maar de
// regel is nog steeds rood zonder match en hoort dus terug in deze werkvoorraad
// ("blijft rood → daarna handmatig linken"). Een AFGEWEZEN regel (reviewDecision
// 'afgewezen', bewust besluit 2026-07-14) blijft uitgesloten: die zou anders dubbel
// verschijnen — in "Afgerond" én hier. De afwijzing is een genomen besluit, geen
// open werkvoorraad; handmatig linken kan dan altijd nog via het regel-detail.
const geenOpenReview = or(
  isNull(specLines.reviewKind),
  and(
    isNotNull(specLines.reviewedAt),
    sql`${specLines.reviewDecision} is distinct from 'afgewezen'`,
  ),
);

export async function getRedLinkLines(db: AppDb, dossierId: string) {
  return db
    .select({
      id: specLines.id,
      fixtureCode: specLines.fixtureCode,
      brandText: specLines.brandText,
      productText: specLines.productText,
      noMatchReason: specLines.noMatchReason,
    })
    .from(specLines)
    .where(
      and(
        eq(specLines.dossierId, dossierId),
        eq(specLines.status, "rood"),
        isNull(specLines.matchedProductId),
        geenOpenReview,
      ),
    )
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
}

// Aantal wachtende review-items (voor de tab-badge ②④).
// Badge-telling (bewust besluit 2026-07-14): rode regels zonder match tellen mee als
// 'wachtend' — de review-pagina bevat er werk voor (handmatig linken), dus de badge
// moet die werkvoorraad eerlijk tonen. Zodra gelinkt is de regel groen en valt hij
// uit beide tellingen (er is geen blijvend "afgerond"-spoor voor rood-linken op de
// badge; het audit-spoor leeft in events + chosenBy/chosenReason).
// Zelfde versoepelde uitsluiting als getRedLinkLines (B7, bouwstap 4): rood telt mee
// als er geen ópen review (meer) is en de regel niet is afgewezen. Een rode OCR-regel
// mét afgeronde ocr-review telt dus wél als wachtend (er moet nog gelinkt worden);
// een afgewezen gele regel niet (besluit genomen); badge en pagina blijven consistent.
export async function getReviewCounts(
  db: AppDb,
  dossierId: string,
): Promise<{ pending: number; total: number }> {
  const roodOpen = sql`(${specLines.status} = 'rood' and ${specLines.matchedProductId} is null and (${specLines.reviewKind} is null or (${specLines.reviewedAt} is not null and ${specLines.reviewDecision} is distinct from 'afgewezen')))`;
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${specLines.reviewKind} is not null or ${roodOpen})`,
      pending: sql<number>`count(*) filter (where (${specLines.reviewKind} is not null and ${specLines.reviewedAt} is null) or ${roodOpen})`,
    })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId));
  return { pending: Number(row?.pending ?? 0), total: Number(row?.total ?? 0) };
}

export type ReviewDecision =
  | "accepteer"
  | "afgewezen"
  | "variant"
  | "gecontroleerd"
  | "bevestigd";

// Markeer één kandidaat als de menselijke keuze (zelfde velden als chooseCandidate:
// chosen/chosenBy/chosenReason). Een gekozen product dat (nog) geen kandidaat-record
// heeft — bv. een kleurvariant-zuster of een handmatig gelinkt product — krijgt er
// één bij, in lijst 'onvolledig' met lege verdicts: het is niet door de tolerantie-
// tabel getoetst, dus "aantoonbaar" zou liegen (C-08). De mens is hier de toetser.
async function markChosenCandidate(
  db: AppDb,
  input: { specLineId: string; productId: string; actor?: string; reason?: string | null },
): Promise<void> {
  await db
    .update(specLineCandidates)
    .set({ chosen: false })
    .where(eq(specLineCandidates.specLineId, input.specLineId));
  const updated = await db
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
    )
    .returning({ id: specLineCandidates.id });
  if (updated.length === 0) {
    const [{ max }] = (await db
      .select({ max: sql<number>`coalesce(max(${specLineCandidates.rank}), 0)` })
      .from(specLineCandidates)
      .where(eq(specLineCandidates.specLineId, input.specLineId))) as {
      max: number;
    }[];
    await db.insert(specLineCandidates).values({
      specLineId: input.specLineId,
      productId: input.productId,
      rank: Number(max) + 1,
      list: "onvolledig",
      score: null,
      verdicts: [],
      chosen: true,
      chosenBy: input.actor ?? null,
      chosenReason: input.reason ?? null,
    });
  }
}

// De voorstel-kandidaat van een regel = rank 1 (de kandidaat wiens afwijkingen op de
// regel staan; runMatcher persisteert aantoonbaar vóór onvolledig, in matchvolgorde).
async function proposalCandidate(db: AppDb, specLineId: string) {
  const [top] = await db
    .select({ productId: specLineCandidates.productId })
    .from(specLineCandidates)
    .where(eq(specLineCandidates.specLineId, specLineId))
    .orderBy(asc(specLineCandidates.rank))
    .limit(1);
  return top ?? null;
}

// Eén review-beslissing. Reason required when rejecting/overrulen (D-05); optioneel bij
// accepteren. Zet de regelstatus mee waar de beslissing dat vereist.
//
// Herontwerp 2026-07-14 (bewust besluit, stap 7): élke bevestigende productkeuze in de
// review — accepteer (voorstel of "welke van deze N"), variant — maakt de regel GROEN
// mét merkteken "handmatig gekozen" (chosenBy = actor op de kandidaat). 'accepteer'
// liet de status voorheen op geel staan; nu → groen, terwijl de oorspronkelijke
// afwijkingen als notitie op de regel blíjven staan (C-07: het verschil blijft benoemd,
// óók na de keuze). Afwijzen blijft → rood (D-04). 'gecontroleerd' (OCR) en 'bevestigd'
// (onvolledig) blijven status-neutraal: daar is de match al gekozen of gaat het om de
// bron, niet om een productkeuze.
export async function decideReview(
  db: AppDb,
  input: {
    specLineId: string;
    decision: ReviewDecision;
    reason?: string | null;
    actor?: string;
    variantColor?: string | null;
    // De expliciet gekozen kandidaat/variant ("welke van deze N" of kleurvariant).
    // Bij 'accepteer' zonder productId geldt de voorstel-kandidaat (rank 1).
    productId?: string | null;
  },
): Promise<void> {
  if (input.decision === "afgewezen" && !input.reason?.trim()) {
    throw new Error("Reason required when rejecting");
  }

  // B8 (OCR-gating): de vóór-toestand van de regel bepaalt of er straks een vangnet-
  // trigger volgt. Zolang een OCR-review openstaat sluit selectLines de regel uit
  // (een verhallucineerd merk mag de merkvergrendelde zoektool niet sturen); zodra
  // de mens de lezing beoordeeld heeft mag het vangnet de regel alsnog oppakken —
  // zelfde trigger-patroon als de imports (triggerVangnet, fire-and-forget via after).
  const [before] = await db
    .select({
      dossierId: specLines.dossierId,
      reviewKind: specLines.reviewKind,
      reviewedAt: specLines.reviewedAt,
    })
    .from(specLines)
    .where(eq(specLines.id, input.specLineId))
    .limit(1);

  const set: Record<string, unknown> = {
    reviewedAt: new Date(),
    reviewedBy: input.actor ?? "system",
    reviewDecision: input.decision,
    reviewReason: input.reason ?? null,
    updatedAt: new Date(),
  };
  // afwijzen van een geel → rood (D-04).
  if (input.decision === "afgewezen") {
    set.status = "rood";
    set.noMatchReason = input.reason ?? null;
  }
  if (input.decision === "variant" && input.variantColor) {
    set.reqColor = input.variantColor;
  }

  // Bevestigende productkeuze → groen + merkteken (zie het blokcommentaar hierboven).
  let chosenProductId: string | null = null;
  if (input.decision === "accepteer" || input.decision === "variant") {
    if (input.productId) {
      // Server-side guard (regel 3, zelfde als linkManualProduct): een expliciet
      // meegegeven productId komt uit het formulier en moet een nú zichtbaar product
      // zijn — verzonnen of onzichtbaar id → weigeren, de regel blijft ongewijzigd
      // (er is op dit punt nog niets gemuteerd).
      const { getVisibleProduct } = await import("./products");
      const product = await getVisibleProduct(db, input.productId);
      if (!product) throw new Error("product not visible or unknown");
    }
    chosenProductId =
      input.productId ??
      (input.decision === "accepteer"
        ? ((await proposalCandidate(db, input.specLineId))?.productId ?? null)
        : null);
    if (chosenProductId) {
      set.status = "groen";
      set.matchedProductId = chosenProductId;
      // deviations blijven bewust staan: de afwijking is geaccepteerd, niet verdwenen.
      await markChosenCandidate(db, {
        specLineId: input.specLineId,
        productId: chosenProductId,
        actor: input.actor,
        reason:
          input.reason ??
          (input.decision === "variant" ? "kleurvariant gekozen in review" : null),
      });
    }
  }

  await db.update(specLines).set(set).where(eq(specLines.id, input.specLineId));

  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "review_decided",
    actor: input.actor,
    payload: {
      decision: input.decision,
      reason: input.reason ?? null,
      variantColor: input.variantColor ?? null,
      productId: chosenProductId,
    },
  });

  // B8: een zojuist afgeronde ÓPEN OCR-review geeft de regel(s) vrij voor het vangnet.
  // Alleen bij de overgang open → afgerond (geen her-trigger bij een tweede besluit);
  // triggerVangnet is niet-blokkerend en faalt nooit richting de aanroeper.
  if (before?.reviewKind === "ocr" && !before.reviewedAt) {
    await triggerVangnet(db, before.dossierId, input.actor);
  }
}

// Handmatig een vergelijkbaar product linken op een rode regel (stap 7, herontwerp §4).
// Dit is een MENSHANDELING: de gebruiker zocht zelf (via visible_products) en klikte —
// het systeem heeft niets gesuggereerd, dus dit pad is fase-veilig (ijzeren regel 4).
// De keuze maakt de regel GROEN met merkteken "handmatig gekozen" (chosenBy = actor).
export async function linkManualProduct(
  db: AppDb,
  input: { specLineId: string; productId: string; actor?: string },
): Promise<void> {
  // Regel 3: alleen een nú zichtbaar product is linkbaar.
  const { getVisibleProduct } = await import("./products");
  const product = await getVisibleProduct(db, input.productId);
  if (!product) throw new Error("product not visible or unknown");

  await markChosenCandidate(db, {
    specLineId: input.specLineId,
    productId: input.productId,
    actor: input.actor,
    reason: "vergelijkbaar product handmatig gelinkt",
  });
  await db
    .update(specLines)
    .set({
      matchedProductId: input.productId,
      status: "groen",
      noMatchReason: null,
      updatedAt: new Date(),
    })
    .where(eq(specLines.id, input.specLineId));

  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "manual_link",
    actor: input.actor,
    payload: { productId: input.productId, productName: product.name },
  });
}

// Een regel in de review-wachtrij zetten (bv. variantkeuze na een groene match met
// ambigue kleur, of OCR-controle bij import).
export async function flagForReview(
  db: AppDb,
  specLineId: string,
  kind: "geel" | "variant" | "onvolledig" | "ocr",
) {
  await db
    .update(specLines)
    .set({ reviewKind: kind, reviewedAt: null, updatedAt: new Date() })
    .where(eq(specLines.id, specLineId));
}

export async function hasOpenReviews(db: AppDb, dossierId: string): Promise<boolean> {
  const rows = await db
    .select({ id: specLines.id })
    .from(specLines)
    .where(
      and(
        eq(specLines.dossierId, dossierId),
        isNotNull(specLines.reviewKind),
        sql`${specLines.reviewedAt} is null`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
