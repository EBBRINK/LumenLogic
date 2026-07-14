# Implementatieplan — Onderdeel Aanvraag→Estimate (fase 2, 2026-07-14)

> Herontwerp + nulmeting: vault `projects/lumenlogic/onderdelen/aanvraag-tot-estimate.md`.
> Plan opgesteld door plan-agent, gereviewd door onafhankelijke reviewer (16 bevindingen verwerkt).
> Status: **wacht op akkoord Timo** — daarna fase 3 (bouwen), stap voor stap.

## Kernbeslissingen

- **B1 — Hernoemen "Projecten":** UI-labels + routes (`/dossiers` → `/projecten`, permanente
  redirect) wél; DB-tabellen, code-identifiers en events-historie níét (gedeelde Neon-DB,
  audit-log niet herschrijven). Commentaar in schema/repo: "UI-naam: Project".
- **B2 — PDF→md:** `unpdf` (zit er al in) levert de tekstlaag; simpele markdown per pagina,
  opgeslagen in `import_runs.raw_markdown` (cap ~2 MB), inzichtelijk + downloadbaar per import.
  Geen nieuwe dependency, geen AI-kosten.
- **B3 — Geel auto-door (géén review) alleen als:** status geel én precies één kandidaat met
  uitsluitend gele, volledig beoordeelbare afwijkingen (geen rood, geen onbekend) én geen
  afwijking op keuzevelden (kleur/vorm/dimbaar) én de regel had geen andere review-flag
  (ocr/variant — predicaat evalueert de óude regelwaarde vóór de update; hermatch mag die
  flags niet meer wissen). Dan: match gezet, `chosen=true, chosenBy='system:auto'`,
  afwijkingsnotitie zichtbaar op regel + estimate, event `near_match_auto_accepted`.
- **B4 — AI-vangnet, fase-veilige grens (reviewer-bevinding 1):** de AI zoekt **uitsluitend het
  gevraagde product** (zelfde merk+type) — dat mag in élke fase. Suggesties voor een *ander /
  vergelijkbaar* product zijn alternatieven-suggesties en verschijnen **alleen buiten tender**
  (ijzeren regel 4). Concreet: vangnet draait over geel-in-review, rood en open; voor rood
  ("merk wel, product niet") zoekt hij alleen binnen het gevraagde merk; blauw ("merk voeren we
  niet") krijgt alleen suggesties bij fase gegund. De matcher-engine blijft fase- en LLM-vrij;
  alle fase-logica zit in de vangnet-laag.
- **B5 — Estimate-PDF:** server-side met `pdf-lib` (zit er al in), functioneel net. Prijzen =
  bruto adviesprijs (bewust besluit: estimate = aangeraden verkoopprijs; kortingen horen bij de
  offerte, buiten de tool).
- **B6 — Status + fase:** nieuwe kolommen `status` (concept → estimate_gestuurd → offerte →
  gegund | niet_gegund → archief) en `xis_phase` (start…aftersales, win/lost). Bestaande
  `phase` (tender/awarded) blijft als **afgeleide** veiligheidsschakelaar: awarded alléén bij
  status=gegund of xis_phase ∈ {deal_making, deliver, aftersales, win}; default veilig.
  Eén schrijver (`lib/repo/project-status.ts`), phase-toggle en `updateDossierPhase` verdwijnen
  volledig (geen tweede waarheid). Elke wijziging gelogd (regel 5). Read-only alleen bij
  archief — bewust: bestaande "opgeleverde" dossiers worden weer bewerkbaar. Lifecycle-kolom
  blijft deprecated staan; de lifecycle-código (controls, filter, listDossiersFiltered) wordt
  wél vervangen door status-varianten.

## Bouwstappen (kleine commits; per stap RSC-test + screenshots light/dark × mobile/desktop als exit-criterium)

1. **Hernoemen Projecten** (eerst — puur mechanisch, voorkomt merge-pijn): `git mv`, redirect,
   labels. Exit-check: geen "dossier" meer in gerenderde UI-teksten (niet in code-identifiers).
2. **Cleanup-testdata-script**: Van Dijk-org + leden weg, Flos → tier-1; dry-run default,
   `--apply` vereist, idempotent, events gelogd.
3. **Migratie 0006** (puur additief, backfill in dezelfde transactie): status- en
   xis_phase-kolommen, `raw_markdown`, tabel `ai_suggestions`. Backfill: actief + bevroren
   quote → estimate_gestuurd; actief → concept; delivered → gegund; archived → archief;
   awarded → xis deal_making (aanname → HANDOVER.md).
4. **Status/fase in repo + UI**: `project-status.ts` (setStatus/setXisPhase via derivePhase,
   events), statusfilter, nieuw-projectformulier met XIS-fasen (default start), statusknoppen
   ("Markeer als gestuurd" koppelt quote-freeze + event).
5. **PDF-upload bovenaan + md-controlespoor**: upload-kaart als eerste blok; md opslaan, tonen
   (inklapbaar) en downloaden per importrun.
6. **Geel auto-door** (B3) in `runMatcher` + engine-predicaat (deterministisch, puur);
   label "automatisch geaccepteerde bijna-match".
7. **Review-kaarten**: echte kleurvarianten uit de catalogus (zusterproduct-query; fallback naar
   kandidatenlijst bij nul varianten), "welke van deze N"-kaart (top-kandidaten als knoppen),
   inline catalogus-zoeker op rood-kaarten (handmatig linken = fase-veilig).
   `decideReview`-keuze maakt de regel **groen** met merkteken "handmatig gekozen" (conform
   herontwerp), volledig gelogd.
8. **AI-vangnet**: `@anthropic-ai/sdk` (enige nieuwe dep), klein model, automatisch na
   import/hermatch over alleen de restregels. Tool-use met vaste read-only tools die
   **uitsluitend via `visible_products`** gaan (regel 3) en nooit op prijs sorteren (regel 2).
   Budgetstop via `llm_budget_eur` + `llm_usage`. Suggesties gelabeld "AI-suggestie" met
   rationale; server valideert dat elk gesuggereerd product-id uit de toolresultaten kwam;
   status wijzigt nooit; alles in events. Tests met gemockte client.
9. **Estimate-PDF**: berekenlogica extraheren naar `lib/repo/estimate.ts` (één bron voor scherm
   + PDF), `lib/pdf/estimate.ts`, downloadroute + knop, event `estimate_pdf_generated`.
   Test op terugleesbare tekstinhoud, niet op pixels.
10. **Acceptatietest end-to-end**: test-armaturenboek → project → import → auto-door → review →
    estimate-PDF; asserts op statussen/notities/merktekens/events. Handmatige 5-minuten-doorloop
    op Neon na cleanup. `bun vitest run` + `bunx tsc --noEmit` groen. HANDOVER.md bijwerken.

Volgorde: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8; 9 parallel mogelijk na 4; 10 laatst.
Let op bij testen (reviewer-bevinding 14): regels met een gevraagde vorm (`shape`) gaan nooit
auto-door omdat de geleverde vorm onbekend is — verwacht gedrag, geen bug.
