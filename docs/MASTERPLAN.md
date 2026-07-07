# Lumen Logic — Masterplan

> **Status:** herzien op 2026-07-07 na een grill-sessie met Timo — het plan is van nul
> opnieuw doorlopen. De koers hieronder **vervangt** de roadmap van 2026-07-07-ochtend
> (runs 4–8 oud); het lange-termijn-eindbeeld daaruit blijft geldig maar is naar §7
> verplaatst als "latere horizon". Achtergrond: `docs/lumenlogic-briefing.md`.
> Domeinmodel matching: `docs/matching-regelset.md` (met Eduard vastgesteld).
> XIS-koppeling: `docs/xis-post-api-attributes.md`.

---

## 1. De herziene koers in één alinea

Brink's eigen binnendienst is **klant nul**: de Brink Estimate Builder is nooit in
gebruik genomen — Lumen Logic ís het begin, en dat begint nu. Lumen Logic doet
**specificeren en matchen**; **XIS doet commercie en documenten**. De werkstroom:
armaturenboek/spec inladen → matchen met de vijfstatussen-regelset → menselijke review
→ resultaat als Project (offerte) naar XIS via de POST-API die Lynx bouwt. Elke match,
review en keuze voedt de event-log — want het eindspel blijft het **data-platform**
(merk-analytics, marktpositie); de installateurs-uitrol en het merkportaal komen
daarna, op een fundament dat intern al bewezen is.

## 2. Besluitenlog grill-sessie 2026-07-07 (niet heropenen zonder Timo)

| # | Besluit | Kern |
|---|---|---|
| 1 | Eindspel | Data-platform/marktpositie; merk-analytics is de lange-termijnomzet |
| 2 | Wig | Brink binnendienst = klant nul (2–5 mensen); installateurs extern daarna |
| 3 | Productgrens | Lumen Logic = spec + match; XIS = prijzen, offertedocument, opvolging. Geen netto-prijzen/huisstijl-PDF in LL (voorlopig) |
| 4 | XIS-koppeling | Projects (offertes) + losse producten aanmaken via POST-API. Bestaat nog niet; Lynx wacht op attributenlijst (Tier 1+2 in één keer) — zie `docs/xis-post-api-attributes.md` |
| 5 | Domeinmodel | Vijfstatussen-regelset (groen/geel/blauw/rood/paars) + tolerantietabel + transparantieregel + harde regels vervangt `open/matched/no_match` volledig |
| 6 | Presentatie | Twee gescheiden lijsten: "voldoet aantoonbaar" / "mogelijk — data onvolledig" (ontbrekend veld ≠ verkeerde waarde; verkeerd = uitgesloten) |
| 7 | Review-station | Handmatige tussenstap: mens beslist bij ambiguïteit (bv. kleurvarianten die in PDF→tekst verloren gaan; "cosmetische varianten kiest Brink zelf") |
| 8 | Engine-tech | Deterministisch-eerst (SQL). LLM alleen op drie plekken: import-verrijking, armaturenboek-inlezen, runtime zoek-fallback. LLM kent **nooit** een status toe |
| 9 | Codebase | Eén: Lumen Logic absorbeert de estimate-functie; bruikbare kern uit `~/brink-estimate-builder-v2` porten; v2/v3 archiveren |
| 10 | Evaluatieset | 50–100 echte spec-regels uit recente Brink-projecten = meetlat (hit-rate) én prioriteitenlijst voor verrijking |
| 11 | Verrijking | Vraaggestuurd: merken uit de evaluatieset/projecten eerst; naam-parsing deterministisch, LLM voor de restgroep, steekproefcontrole door een mens |
| 12 | Gebruikers fase 1 | 2–5 eigen logins (Timo, Eduard, binnendienst); géén rollen/organisaties nog; event-log per persoon herleidbaar |

## 3. De vijfstatussen-regelset als domeinmodel

Bron: `docs/matching-regelset.md` (met Eduard vastgesteld, incl. tolerantietabel).
Dit wordt de complete logica van de matcher — schema, engine én UI:

- **GROEN** — product hebben we; alle specs binnen groene marge. Direct in de offerte.
- **GEEL** — zelfde merk, zelfde productlijn-DNA, afwijking binnen gele marge. Brink
  reviewt en stelt voor.
- **BLAUW** — merk niet in de database: dátagat, onze actie (merk inladen). Voedt de
  verrijkings-/inlaadprioriteit.
- **ROOD** — merk wél, dit product niet (of afwijking buiten gele marge, of lager IP —
  altijd rood). Actie bij de klant.
- **PAARS** — buiten assortiment (geen verlichting). Expliciet melden, nooit weglaten.

Invarianten (geteste regels, zelfde status als de vijf ijzeren regels):
1. Niets stilzwijgend weglaten — elke spec-regel komt terug met een status.
2. Aanvraagvolgorde aanhouden — nooit hersorteren op status of prijs.
3. Lager IP dan gevraagd = altijd rood, geen tolerantie.
4. Elke afwijking benoemen, ook binnen groene marge ("gevraagd 12W, geleverd 13W").
5. Ontbrekende data ≠ afwijkende data: onvolledig → tweede lijst, verkeerd → uitgesloten.
6. Groen + geel tellen mee in het projecttotaal; blauw/rood/paars getoond, niet opgeteld.
7. Statustoekenning is deterministische code (tolerantietabel); LLM's stellen hooguit
   kandidaten voor.

Drie bronsoorten per aanvraag: armaturenboek = **wát**, bestek/telstaat = **hoevéél**,
tekening = **wáár** — gekoppeld op armatuurcode.

## 4. De interne werkstroom (eindbeeld fase 1)

```
1. INLADEN     armaturenboek (PDF/tekst/CSV) → voorstel-scherm → spec_lines
               [LLM-fallback bij rommelige PDF; mens bevestigt altijd]
2. MATCHEN     per regel: SKU exact → parametrisch binnen merk (SQL, tolerantietabel)
               → status groen/geel/blauw/rood/paars + afwijkingenlijst
               [LLM-fallback: extra zoek-hypotheses als SQL niets vindt]
3. REVIEWEN    review-station: mens bevestigt/kiest bij ambiguïteit (varianten,
               kleur, gele gevallen), ziet twee lijsten per regel
4. UITSTUREN   dossier → XIS-Project met regels (POST-API; tot die er is: export-
               bestand). Blauwe merken → inlaadlijst; nieuwe producten → product-POST
5. LEREN       elke stap in events; hit-rate op de evaluatieset is de kwaliteitsmeter
```

## 5. Architectuur-implicaties

Het lagenmodel blijft (RSC → server actions → repo-laag → Drizzle/Neon;
`visible_products` als enige leesroute; events append-only). Wat verandert:

- **Schema**: `spec_line_status` wordt het vijfstatussen-enum (migratie van
  `open/matched/no_match` → `open` blijft als zesde "nog niet gematcht"-waarde of
  aparte kolom — bij bouw beslissen). Erbij: `spec_line_candidates` (kandidaten +
  score + gekozen), afwijkingen-payload per match (jsonb: veld, gevraagd, geleverd,
  marge-klasse), review-velden (wie, wanneer, wat gekozen), `xis_exports`
  (dossier → XIS-project-id, status, payload-snapshot).
- **Toleranties als data**: de tabel uit de regelset in code als één module
  (`lib/matching/tolerances.ts`), met de regelset-doc als bron; wijziging = bewuste
  commit, geen config-UI.
- **Verrijkingspijplijn**: `import_runs`-achtig spoor voor naam-parsing en
  LLM-verrijking met `tier2_source`-markering (`parsed-from-name | llm | datasheet |
  manual`) en steekproef-UI. Draait per merk, vraaggestuurd.
- **Auth**: bestaande Better Auth magic link; alleen het één-gebruiker-slot openzetten
  naar een allowlist van 2–5 adressen. Rollen/organisaties: pas bij externe uitrol.
- **Port uit EB v2**: matching-prompts/quote-math uit `~/brink-estimate-builder-v2/src/lib/`
  beoordelen en overnemen wat het deterministische pad versterkt (o.a. status-guard,
  aggregator-totalen per kleur).
- **Fase-engine blijft staan**: de tender/gegund-poort en de gelijkwaardigheidsengine
  (runs 1–3) blijven intact — intern werk is de facto tender-stand; de engine wordt
  weer relevant bij de externe uitrol. Niets slopen.

## 6. Roadmap (herzien)

| Run | Inhoud | Definition of done |
|---|---|---|
| **4 — Regelset in de kern** | Vijfstatussen in schema/engine/UI; tolerantietabel als motor; twee-lijsten-presentatie; afwijkingen-transparantie per match; review-station (variant-/kleurkeuze door mens); 2–5 logins | De 7 invarianten uit §3 elk in een test; demo: één echt armaturenboek volledig door stap 1–3 van de werkstroom; elke status visueel correct (screenshots) |
| **5 — Verrijking + evaluatieset** | Evaluatieset-harness (50–100 echte regels, hit-rate-meting); naam-parser (deterministisch); LLM-restgroep + steekproef-UI; vraaggestuurde merk-volgorde; blauwe-merken-inlaadlijst | Hit-rate op de evaluatieset gemeten vóór/ná verrijking en zichtbaar verbeterd; `tier2_source` overal gevuld; steekproef-flow werkt |
| **6 — XIS-koppeling** | Zodra Lynx levert: Projects-POST (dossier → offerte in XIS) en product-POST (blauw/no-match → XIS); tot die tijd exportbestand in hetzelfde formaat; `xis_exports`-administratie; sandbox eerst | Eén dossier aantoonbaar als Project in (sandbox-)XIS met regels in juiste volgorde; idempotent (herverzenden maakt geen duplicaat); export gelogd |
| **7+ — Externe uitrol** (latere horizon) | Zie §7 | — |

Parallel aan alles (geen run, wel actie): attributenlijst naar Lynx (**vandaag**, ligt
klaar), evaluatieset-regels verzamelen bij de binnendienst (mensenwerk, kan direct
starten).

## 7. Latere horizon (eindbeeld extern — ongewijzigd uit het oude plan)

Wanneer de interne motor bewezen is (hit-rate, dagelijks gebruik binnendienst), volgt
het oorspronkelijke fase-2-verhaal, in deze volgorde:

1. **Installateurs extern**: organisaties/memberships/rollen (calculator,
   werkvoorbereider, projectleider als petten), org-scoping, dossier-lifecycle
   (`delivered`/`archived`), mail-provider.
2. **Fase-engine naar buiten**: tender/gegund-poort en gelijkwaardigheidsengine zoals
   gebouwd in run 3; substitutievoorstel-document; "geen data" = grijze vlag.
3. **Disclosure & catalogus**: `visible_specs`-view naast `visible_products`,
   tier-gating in de UI, `/catalogus` + productdetail, prijsaanvraag-leads.
4. **Merkportaal & analytics**: staging→goedkeuring→publicatie voor merkdata,
   prijslijst-upload met verplichte `valid_until`, geaggregeerde dashboards
   (aggregatie = anonimiseringsgrens), PDL/ConnectingTheDots-sync.

De vijf ijzeren regels en de UI-principes (vakgereedschap; fase altijd zichtbaar;
eerlijkheid als esthetiek — grijze vlaggen, geen rode alarmen; print eersteklas;
merk-neutrale inhoud) gelden onverkort voor elk van deze stappen. Het vijfkleuren-
systeem voegt daarbinnen zijn eigen semantiek toe: groen/geel/blauw/rood/paars zijn
match-statussen; systeemfouten blijven het enige andere rood.

## 8. Open punten

1. **XIS-API-doorlooptijd** — Lynx bouwt; call vandaag (Projects-endpoint expliciet op
   de taak, sandbox + gescopeerde key vragen). Grootste externe afhankelijkheid.
2. **Toleranties herijken** — de tabel is een interne richtlijn; toetsing aan hoe
   tenderbeoordelaars werkelijk oordelen blijft een open punt (uit de briefing) —
   relevant vóór de externe uitrol, niet blokkerend voor intern gebruik.
3. **Prijsmodel externe fase** (per zetel vs. per dossier) — pas relevant bij stap 7.1;
   aanbeveling blijft: per organisatie met zetel-plafond.
4. **PDL-contract** (schema-scope, data-eigendom, exit) — latere horizon.
5. **Status-enum-migratie** — `open` als zesde waarde of aparte "nog niet gematcht"-
   kolom: beslissen bij run-4-bouw op basis van wat de UI het helderst maakt.
