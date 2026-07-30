// Leesbare labels voor event-acties. Sprint 2.0a: het Event-log-scherm onder Data heeft een
// EIGEN kopie nodig, niet een import — `components/analytics-view.tsx` blijft byte-stabiel
// (guardrail 1, HANDOVER.md "Fase 2 afgerond": het is het fundament van 2.1 en mag niet
// aangeraakt worden). Deze map is dus bewust een losse kopie van `ACTION_LABEL` in
// analytics-view.tsx (regels 5-26 op het moment van kopiëren), niet hergebruikt vanuit daar.
export const ACTION_LABEL: Record<string, string> = {
  search: "Search",
  match: "Match",
  no_match: "No match",
  quote_generated: "Quote",
  suggestions: "Suggestions (awarded)",
  pdf_import: "PDF import",
  dossier_created: "Project created",
  phase_changed: "Phase change",
  // Nieuwe event-acties uit de vijfstatussen-/matcherlaag — nette labels.
  matched_status: "Status set",
  product_considered: "Product considered",
  spec_line_matched: "Line matched",
  spec_line_no_match: "Line without match",
  review_decided: "Review decided",
  brand_load_requested: "Brand load requested",
  quantity_linked: "Quantity linked",
  day_price_set: "Spot price set",
  xis_exported: "Exported to XIS",
  enrichment_published: "Enrichment published",
  evaluation_measured: "Hit-rate measured",
};
