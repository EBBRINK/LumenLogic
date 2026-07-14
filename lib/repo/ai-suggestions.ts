// AI-suggesties (B4/stap 8) — de repo-kant van het vangnet richting de UI. Een
// suggestie is nooit een beslissing: "gebruiken" loopt via de BESTAANDE handmatige
// flow (decideReview / linkManualProduct, incl. de zichtbaarheids-guard van regel 3)
// en draagt daarmee het merkteken "handmatig gekozen". De suggestie zelf blijft als
// historie staan: gebruikt → dismissedBy 'gebruikt door <actor>'; verworpen →
// dismissedBy = actor. Beide zetten dismissedAt, zodat het vangnet de regel daarna
// niet opnieuw (tegen kosten) bekijkt zolang er niets verandert.
import { and, asc, eq, isNull } from "drizzle-orm";
import { aiSuggestions, specLines, visibleProducts } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";
import { decideReview, linkManualProduct } from "./review";

export type AiSuggestionView = {
  id: string;
  specLineId: string;
  productId: string;
  rationale: string;
  model: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
};

const VIEW_SELECTION = {
  id: aiSuggestions.id,
  specLineId: aiSuggestions.specLineId,
  productId: aiSuggestions.productId,
  rationale: aiSuggestions.rationale,
  model: aiSuggestions.model,
  name: visibleProducts.name,
  brandName: visibleProducts.brandName,
  articleCode: visibleProducts.articleCode,
};

function toView(r: {
  id: string;
  specLineId: string;
  productId: string;
  rationale: string;
  model: string;
  name: string | null;
  brandName: string | null;
  articleCode: string | null;
}): AiSuggestionView {
  return { ...r, name: r.name ?? "(product niet meer zichtbaar)" };
}

// Alle niet-verworpen suggesties van een dossier, gegroepeerd per regel. INNER join op
// visible_products (regel 3): een suggestie waarvan het product inmiddels onzichtbaar
// is (verlopen prijslijst) verdwijnt hier — hij zou de guard bij gebruik toch niet halen.
export async function getOpenSuggestionsByLine(
  db: AppDb,
  dossierId: string,
): Promise<Map<string, AiSuggestionView[]>> {
  const rows = await db
    .select(VIEW_SELECTION)
    .from(aiSuggestions)
    .innerJoin(specLines, eq(aiSuggestions.specLineId, specLines.id))
    .innerJoin(visibleProducts, eq(aiSuggestions.productId, visibleProducts.id))
    .where(and(eq(specLines.dossierId, dossierId), isNull(aiSuggestions.dismissedAt)))
    .orderBy(asc(aiSuggestions.createdAt));
  const map = new Map<string, AiSuggestionView[]>();
  for (const r of rows) {
    const view = toView(r as Parameters<typeof toView>[0]);
    const list = map.get(view.specLineId) ?? [];
    list.push(view);
    map.set(view.specLineId, list);
  }
  return map;
}

// Zelfde beeld voor één regel (regel-detailpagina).
export async function getOpenSuggestionsForLine(
  db: AppDb,
  specLineId: string,
): Promise<AiSuggestionView[]> {
  const rows = await db
    .select(VIEW_SELECTION)
    .from(aiSuggestions)
    .innerJoin(visibleProducts, eq(aiSuggestions.productId, visibleProducts.id))
    .where(
      and(eq(aiSuggestions.specLineId, specLineId), isNull(aiSuggestions.dismissedAt)),
    )
    .orderBy(asc(aiSuggestions.createdAt));
  return rows.map((r) => toView(r as Parameters<typeof toView>[0]));
}

async function getSuggestion(db: AppDb, suggestionId: string) {
  const [row] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  return row ?? null;
}

// Verwerpen: dismissed_at/by, plus event (regel 5). Idempotent op al-verworpen.
export async function dismissSuggestion(
  db: AppDb,
  input: { suggestionId: string; actor?: string },
): Promise<void> {
  const suggestion = await getSuggestion(db, input.suggestionId);
  if (!suggestion || suggestion.dismissedAt) return;
  await db
    .update(aiSuggestions)
    .set({ dismissedAt: new Date(), dismissedBy: input.actor ?? "onbekend" })
    .where(eq(aiSuggestions.id, input.suggestionId));
  await logEvent(db, {
    entity: "spec_line",
    entityId: suggestion.specLineId,
    action: "ai_suggestion_dismissed",
    actor: input.actor,
    payload: { suggestionId: suggestion.id, productId: suggestion.productId },
  });
}

// "Gebruik als handmatige keuze": de menskeuze loopt via de bestaande flow —
//   • regel in review (reviewKind gezet, nog onbeslist) → decideReview 'accepteer'
//     mét dit productId (zet groen + reviewedAt + merkteken, zichtbaarheids-guard);
//   • anders (rood/open/blauw) → linkManualProduct (zelfde guard, zelfde merkteken).
// Daarna wordt de suggestie als historie gemarkeerd: dismissedBy 'gebruikt door <actor>'.
// Gooit als het product niet (meer) zichtbaar is — de suggestie blijft dan staan.
export async function useAiSuggestion(
  db: AppDb,
  input: { suggestionId: string; actor?: string },
): Promise<void> {
  const suggestion = await getSuggestion(db, input.suggestionId);
  if (!suggestion || suggestion.dismissedAt) return;
  const [line] = await db
    .select()
    .from(specLines)
    .where(eq(specLines.id, suggestion.specLineId))
    .limit(1);
  if (!line) return;

  if (line.reviewKind && !line.reviewedAt) {
    await decideReview(db, {
      specLineId: line.id,
      decision: "accepteer",
      productId: suggestion.productId,
      reason: "AI-suggestie gebruikt als handmatige keuze",
      actor: input.actor,
    });
  } else {
    await linkManualProduct(db, {
      specLineId: line.id,
      productId: suggestion.productId,
      actor: input.actor,
    });
  }

  await db
    .update(aiSuggestions)
    .set({
      dismissedAt: new Date(),
      dismissedBy: `gebruikt door ${input.actor ?? "onbekend"}`,
    })
    .where(eq(aiSuggestions.id, suggestion.id));
  await logEvent(db, {
    entity: "spec_line",
    entityId: line.id,
    action: "ai_suggestion_used",
    actor: input.actor,
    payload: { suggestionId: suggestion.id, productId: suggestion.productId },
  });
}
