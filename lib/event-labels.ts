import { acronymWord, capitalizeFirst, splitIdentifier } from "@/lib/acronyms";

// Leesbare labels voor event-acties. Sprint 2.0a: het Event-log-scherm onder Data heeft een
// EIGEN kopie nodig, niet een import — `components/analytics-view.tsx` blijft byte-stabiel
// (guardrail 1, HANDOVER.md "Fase 2 afgerond": het is het fundament van 2.1 en mag niet
// aangeraakt worden). Deze map is dus bewust een losse kopie van `ACTION_LABEL` in
// analytics-view.tsx (regels 5-26 op het moment van kopiëren), niet hergebruikt vanuit daar.
//
// UX-audit 30 jul (bug #8): de kopie had 21 regels terwijl de codebase 97 verschillende
// acties logt, en beide rendersites vielen terug op de ruwe sleutel — er stonden ~40
// pillen als `leesroute_specs_backfilled` op het scherm. De map is aangevuld en de
// weergave loopt nu via `eventLabel()`, dat een onbekende sleutel alsnog leesbaar maakt.
// Uitbreiden gebeurt HIER; de analytics-bestanden blijven onaangeraakt.
//
// Correctie 30 jul: de commit die dit aanvulde schreef "~120 labels". Nageteld zijn het er
// **102**. Wat wél klopt: van de 97 verschillende acties die de codebase logt ontbreekt er
// geen enkele.
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

  // ── Aanvulling 30 jul: alles wat de codebase verder logt ────────────────────────────
  // AI-vangnet en AI-suggesties (B4 / stap 8).
  ai_suggestion_created: "AI suggestion created",
  ai_suggestion_discarded: "AI suggestion discarded",
  ai_suggestion_dismissed: "AI suggestion dismissed",
  ai_suggestion_parse_failed: "AI suggestion unreadable",
  ai_suggestion_used: "AI suggestion used",
  ai_vangnet_failed: "AI fallback failed",
  ai_vangnet_run: "AI fallback run",
  ai_vangnet_skipped_budget: "AI fallback skipped — budget",
  ai_vangnet_skipped_no_key: "AI fallback skipped — no key",
  ai_vangnet_skipped_timeout: "AI fallback skipped — timeout",
  // Armaturenboek / substitutie / offerte.
  armaturenboek_snapshot: "Luminaire schedule snapshot",
  substitution_created: "Substitution proposal created",
  estimate_pdf_generated: "Quote PDF generated",
  quote_frozen: "Quote frozen",
  quote_header_updated: "Quote header updated",
  lead_price_requested: "Lead price requested",
  // Merkbeheer.
  brand_created: "Brand created",
  brand_created_for_test: "Brand created (test)",
  brand_deleted: "Brand deleted",
  brand_updated: "Brand updated",
  brand_environment_changed: "Brand environment changed",
  brand_field_visibility_changed: "Brand field visibility changed",
  brand_lifecycle_changed: "Brand lifecycle changed",
  brand_tier_changed: "Brand tier changed",
  brand_loaded: "Brand loaded",
  brand_load_dismissed: "Removed from load queue — not a brand",
  brand_message_prepared: "Brand message prepared",
  brand_relation_status_changed: "Brand relation status changed",
  brand_relation_updated: "Brand relation updated",
  brand_template_downloaded: "Brand template downloaded",
  brand_upload_approved: "Brand upload approved",
  brand_upload_rejected: "Brand upload rejected",
  brand_upload_submitted: "Brand upload submitted",
  // Maatwerkvelden.
  custom_field_archived: "Custom field archived",
  custom_field_created: "Custom field created",
  custom_field_updated: "Custom field updated",
  // Verrijking.
  enrichment_started: "Enrichment started",
  enrichment_rejected: "Enrichment rejected",
  // Import- en OCR-pad.
  import_run_cancelled: "Import cancelled",
  import_run_confirmed: "Import confirmed",
  import_run_created: "Import started",
  pdl_import_staged: "PDL import staged",
  ocr_started: "OCR started",
  ocr_resumed: "OCR resumed",
  ocr_done: "OCR finished",
  ocr_page_done: "OCR page finished",
  ocr_page_failed: "OCR page failed",
  ocr_page_timeout: "OCR page timed out",
  ocr_page_truncated: "OCR page truncated",
  ocr_line_upgraded: "OCR line upgraded",
  ocr_quantity_backfilled: "OCR quantity backfilled",
  // AI-leesroute.
  leesroute_batch_done: "Reading route batch finished",
  leesroute_batch_failed: "Reading route batch failed",
  leesroute_batch_timeout: "Reading route batch timed out",
  leesroute_batch_truncated: "Reading route batch truncated",
  leesroute_segmenten_verrijkt: "Reading route segments enriched",
  leesroute_skipped_no_key: "Reading route skipped — no key",
  leesroute_specs_backfilled: "Reading route specs backfilled",
  // Matcher en spec-regels.
  match_unlinked: "Match removed",
  near_match_auto_accepted: "Near match auto-accepted",
  spec_line_edited: "Line edited",
  quantity_changed: "Quantity changed",
  status_changed: "Status changed",
  system_alternatives: "Alternatives shown",
  // Prijzen en prijslijsten.
  price_lines_upserted: "Price lines updated",
  price_list_archived: "Price list archived",
  price_list_created: "Price list created",
  price_list_expired_manually: "Price list expired manually",
  // Producten en sjablonen.
  product_created_from_template: "Product created from template",
  product_fields_applied: "Product fields applied",
  template_apply_finished: "Template apply finished",
  template_apply_started: "Template apply started",
  template_field_skipped_stale: "Template field skipped — stale",
  template_upload_rejected: "Template upload rejected",
  template_upload_rejected_format: "Template upload rejected — format",
  template_upload_staged: "Template upload staged",
  template_upload_too_large: "Template upload too large",
  // Organisaties, leden, openbaarmaking, XIS.
  disclosure_changed: "Disclosure changed",
  membership_added: "Member added",
  org_created: "Organization created",
  org_removed: "Organization removed",
  user_removed: "User removed",
  xis_phase_changed: "XIS phase changed",
};

// De afkortingentabel stond hier als privékopie; hij staat nu in lib/acronyms.ts omdat
// `fieldLabel()` in lib/matching/tolerances.ts er precies zo een nodig had en er zonder
// stond ("IP" werd daar "Ip"). Eén tabel, twee vangnetten.

/**
 * Leesbaar label voor één event-actie. Onbekende sleutels worden niet ruw doorgegeven maar
 * omgezet van snake_case naar een zin ("ocr_page_done" → "OCR page done"), zodat een nieuw
 * event nooit meer als developer-identifier in de UI kan belanden (UX-audit 30 jul, bug #8).
 */
export function eventLabel(action: string): string {
  const known = ACTION_LABEL[action];
  if (known) return known;
  const words = splitIdentifier(action);
  if (words.length === 0) return action;
  return capitalizeFirst(words.map(acronymWord).join(" "));
}

// Entiteiten zoals ze in de events-tabel staan. Reparatie 30 jul: de Entity-badge in het
// event-log rendert de ruwe kolomwaarde — er stond letterlijk `spec_line` op het scherm.
// Bug #8 ("geen ontwikkelaarstaal") hield één kolom te vroeg op.
const ENTITY_LABEL: Record<string, string> = {
  brand: "Brand",
  brand_upload: "Brand upload",
  dossier: "Project",
  import_run: "Import",
  lead: "Lead",
  organization: "Organization",
  price_list: "Price list",
  product: "Product",
  quote: "Quote",
  search: "Search",
  spec_line: "Line",
  xis_export: "XIS export",
};

/** Leesbaar label voor de entiteit van een event; zelfde vangnet als `eventLabel()`. */
export function entityLabel(entity: string): string {
  const known = ENTITY_LABEL[entity];
  if (known) return known;
  const words = splitIdentifier(entity);
  if (words.length === 0) return entity;
  return capitalizeFirst(words.map(acronymWord).join(" "));
}
