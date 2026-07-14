# HANDOVER — Lumen Logic (runs 1–3)

_Bijgewerkt: 2026-07-02. Zie `docs/BUILD-PLAN.md` voor de oorspronkelijke run-1-opdracht._
_2026-07-07: eindbeeld + roadmap runs 4–8 vastgelegd in `docs/MASTERPLAN.md` (plansessie,
geen code gewijzigd)._
_2026-07-07 (later, grill-sessie): koers herzien — Brink-binnendienst als klant nul,
vijfstatussen-regelset als domeinmodel, XIS-koppeling. `docs/MASTERPLAN.md` vervangen;
nieuw: `docs/matching-regelset.md` + `docs/xis-post-api-attributes.md` (voor Lynx-call)._
_2026-07-07 (avond): `docs/FUNCTIONEEL-ONTWERP.md` — alle 78 features getraceerd naar bron,
complete appstructuur, per scherm wireframes met elk knopje, 12 Mermaid-flowdiagrammen,
event-catalogus, rollenmatrix. Bouwsessies: masterplan = koers, functioneel ontwerp = wat/hoe._
_2026-07-07 (nacht): runs 4–6 gebouwd — vijfstatussen-regelset in de kern, review-station,
estimate met totalen-per-kleur, XIS-export, verrijkingspijplijn, /data-werkbank, catalogus,
instellingen + allowlist, import-voorstelscherm. Zie "Runs 4–6" hieronder._
_2026-07-14: estimate-PDF (plan stap 9, B5). Berekenlogica geëxtraheerd naar
`lib/repo/estimate.ts` (één bron voor scherm + PDF; `computeEstimate` is puur,
`getEstimateData` haalt kop + regels), `lib/pdf/estimate.ts` (pdf-lib/Helvetica, A4 staand,
meerpaginasteun, ellipsis, zones + subtotalen, p.m.-sectie), route
`/projecten/[id]/offerte/pdf` (requireSession, event `estimate_pdf_generated`) + knop
"Download PDF" naast de printknop. Aannames: geen logo-asset in `public/` → tekstkop
"Brink Licht" (pdf-lib kan alleen PNG/JPG embedden); prijzen = bruto adviesprijs (B5);
zone-subtotalen staan wél in de PDF, het scherm bleef ongewijzigd. Testkanttekening:
pdf-lib hangt op tslib v1 — in `vitest.config.ts` een klein pre-resolve-plugin
(tslib→es6-build alleen voor pdf-lib) + `optimizeDeps` exclude pdf-lib / include pako._

## Status: runs 4–6 staan — vijfstatussen in de volledige keten

`bun vitest run` → **182 tests groen** (21 files): repo-/engine-tests op een echte PGlite-db
(zelfde migraties + view als productie) + white-box RSC-render/screenshottests van de schermen
(licht/donker × mobiel/desktop). `bunx tsc --noEmit` is schoon voor `app/`, `lib/`,
`components/`, `db/` én `scripts/`. Migratie `0004_vijfstatussen` is toegepast op Neon; de
demo is opnieuw geseed (3 groen · 1 blauw · 1 rood) en end-to-end in de browser geverifieerd
(dossierlijst met kleuren-telling, dossier-tabs, regel-detail met twee kandidatenlijsten +
afwijkingentabel, estimate met totalen-per-kleur + p.m. + open punten, XIS-push-dialoog).

### Runs 4–6 — wat erbij kwam

- **Vijfstatussen-regelset (run 4)** — `match_status`-enum (`open|groen|geel|blauw|rood|paars`)
  vervangt `open/matched/no_match`. De matcher is deterministische code: `lib/matching/
  tolerances.ts` (de tolerantietabel uit `docs/matching-regelset.md`, met Eduard vastgesteld)
  + `lib/matching/engine.ts` (de beslisboom §4.3) + `lib/repo/matching.ts` (persisteert status,
  kandidaten en afwijkingen, logt events, zet blauw op de inlaadwachtrij). **De 7 invarianten
  staan elk in een test** (`lib/matching/engine.test.ts`, `tolerances.test.ts` — 27 tests):
  strengste-telt, IP-nooit-lager, kelvin-exact, ontbrekend≠afwijkend, niets weggelaten,
  aanvraagvolgorde, geen prijs in de ranking.
- **Twee-lijsten-presentatie + transparantie** — regel-detail (`/dossiers/[id]/regel/[lineId]`)
  toont "voldoet aantoonbaar" vs "mogelijk — data onvolledig", een afwijkingentabel per
  gevraagd veld (ook binnen groen), en rood/blauw/paars-knoppen + dagprijs-flow.
- **Review-station (run 4)** — `/dossiers/[id]/review`: geel-review, variantkeuze,
  onvolledig-bevestiging, OCR-controle; elke beslissing met actor + reden. Tab-badge toont
  het aantal wachtende items.
- **Estimate (run 4)** — `/dossiers/[id]/offerte`: kopblok, zone-groepering, totalen groen+geel
  apart én samen, blauw/rood/paars als p.m. (nooit opgeteld), automatische open-punten +
  merken-inladen-lijst, print-CSS met kleuren óók als woord.
- **Import-voorstelscherm (run 4)** — `import_runs` + `/dossiers/[id]/import/[runId]`:
  bewerkbare voorstel-tabel, OCR/LLM-rijen standaard uitgevinkt, niets stil weggeschreven.
- **Allowlist + instellingen (run 4)** — `allowed_emails`; magic-link stuurt alleen naar
  toegestane adressen (zelfde succesmelding, geen account-enumeratie). `/instellingen`:
  gebruikers, LLM-budgetcap + teller, XIS-sleutel + sandbox-schakelaar.
- **Verrijkingspijplijn + /data-werkbank (run 5)** — `lib/enrichment/parser.ts` (deterministische
  naam-parser) + `lib/repo/enrichment.ts` (run → steekproef → publiceren → hermatch) +
  `lib/repo/evaluation.ts` (hit-rate op de evaluatieset). Schermen: `/data/verrijking`,
  `/data/inladen` (blauw-wachtrij), `/data/prijslijsten` (verloopt-binnenkort/dekkingsgaten),
  `/data/evaluatie`.
- **XIS-export (run 6)** — `lib/repo/xis.ts`: `buildXisPayload` (aanvraagvolgorde,
  `external_reference` = dossier-id, classificatie product/tekstregel/nieuw-product),
  `createXisExport` (idempotent op dossier-id, snapshot in `xis_exports`, sandbox default).
  Push-dialoog met pre-flight op de estimate-tab. De echte Lynx-API bestaat nog niet — dit is
  het exportbestand in het toekomstige payload-formaat.
- **Catalogus + hoofdnav** — `/catalogus` (los zoeken, merk-eerst, twee lijsten); dunne
  hoofdbalk Dossiers · Catalogus · Data · Analytics · Instellingen.

### Feature-traceability — §1 van `docs/FUNCTIONEEL-ONTWERP.md`

Elke 🔨-feature (V1, runs 4–6) uit de inventaris, getraceerd naar code. ✅ = gebouwd +
getest · ◑ = gebouwd met bewuste beperking · ⏳ = uitgesteld (reden erbij). De ⏳-features
uit §1 (H2/H3) vallen buiten deze runs.

| # | Feature | Status | Bewijs / noot |
|---|---|---|---|
| A-02 | Dossierlijst met kleuren-telling | ✅ | `StatusTally` in `dossier-list.tsx`, `getStatusCounts` |
| A-04 | Faseovergang = gelogde actie + dialoog | ✅ | `phase-toggle.tsx` (bevestigingsdialoog), event `phase_changed` |
| A-06 | Boek + bestek koppelen op code | ✅ | PDF-import + `linkQuantities`/`parseBestek` (tekening = H2) |
| A-07 | Aantal ontbreekt → stukprijs-modus | ✅ | `quantity` nullable, "p/st" op estimate |
| A-08 | Zone/ruimte-veld + groepering | ✅ | `zone`-kolom, zone-groepering in `quote-view` |
| A-09 | Offertenummer BL-{jaar}-{4} | ✅ | `nextQuoteNumber` in `generateQuote`; toegekend + bewaard (BL-2026-0001) |
| A-10 | Kopblok bewerkbaar | ✅ | `updateQuoteHeader` + "Kopblok bewerken"-form op de estimate-tab |
| B-04 | OCR-route beeld-PDF | ⏳ | Geen OCR-lib aangesloten; PDF-import leest alleen tekstlaag, meldt eerlijk als die ontbreekt. Volgende stap. |
| B-05 | LLM-fallback rommelige PDF | ⏳ | Geen LLM-key; deterministische segmentatie draait, LLM-fallback is een latere stap |
| B-06 | Voorstel-scherm vóór opslaan | ✅ | `import_runs` + `/import/[runId]`, niets stil weggeschreven |
| B-07 | Herkomst per regel zichtbaar | ✅ | `source`-veld, getoond in regel-detail |
| B-08 | Bestek/telstaat-import | ✅ | `parseBestek` + `linkQuantities` |
| B-09 | 10 kernvelden per regel | ✅ | alle `req_*`-velden in schema + invoer- + bewerk-form |
| B-10 | Regels bewerken (edit) | ✅ | `updateSpecLine` + "Regel bewerken"-form → matcher draait opnieuw |
| C-02 | SKU-normalisatie | ✅ | `normalizeSku`, getest |
| C-04 | Parametrisch matchen binnen merk | ✅ | `engine.ts` |
| C-05..C-07 | Vijfstatussen + tolerantie + transparantie | ✅ | `tolerances.ts`/`engine.ts`, 27 invariant-tests |
| C-08 | Twee gescheiden lijsten | ✅ | provable/incomplete in regel-detail |
| C-09 | 3–5 zoekhypotheses vóór "niet gevonden" | ◑ | deterministische deeltermen-fallback in `engine.ts`; LLM-hypotheses = latere stap |
| C-10 | Kandidaten persistent | ✅ | `spec_line_candidates` |
| C-11/C-12 | Aanvraagvolgorde heilig / niets weglaten | ✅ | tests |
| C-13 | Varianten tonen | ⏳ | variantkeuze zit in het review-station (D-02/03); een los "beschikbare varianten"-blok vergt kleur-/optiek-groepering die de brondata niet levert |
| C-14 | Custom-config-notitie bij rood | ✅ | rood-knop met notitie in regel-detail |
| D-01..D-06 | Review-station | ✅ | `/review` + `review-queue.tsx`, elke beslissing met actor + reden |
| E-01..E-05 | Estimate + totalen/telling/inladen/open-punten | ✅ | `quote-view.tsx` (geverifieerd: groen €7.286, blauw/rood p.m.) |
| E-07 | Live herberekening bij aantal | ◑ | `setQuantityAction` (server-action + revalidate), geen client-live-herberekening |
| E-08 | Print / PDF | ◑ | print-CSS via `PrintButton` (browser → PDF); een los PDF-bestand met `pdf-lib` is optioneel |
| E-09..E-12 | XIS-push + administratie | ✅ | `lib/repo/xis.ts` + push-dialoog; API stubbed als exportbestand (Lynx bouwt nog) |
| G-01 | Gecodeerd armaturenboek | ✅ | `/armaturenboek` |
| H-03 | Naam-parser | ✅ | `lib/enrichment/parser.ts`, 12 tests |
| H-04 | LLM-verrijking restgroep | ⏳ | Geen LLM-key; parser-route draait, budget-teller staat klaar |
| H-05..H-09 | Steekproef-UI / volgorde / evaluatie / inladen / tier2_source | ✅ | `/data/*` + `lib/repo/enrichment.ts` + `evaluation.ts` |
| I-03 | Dekkingsgat-alert | ✅ | `/data/prijslijsten` |
| I-04 | Dagprijs-werkstroom | ✅ | `setDayPrice` + regel-detail-blok |
| K-02/K-03/K-06 | Consideration / afwijzingsreden / hit-rate | ✅ | events `product_considered`, redenvelden, `/data/evaluatie` |
| L-01 | Magic-link (mail) | ◑ | werkt via serverconsole; mail-provider (Resend) nog niet aangesloten |
| L-02 | Allowlist 2–5 gebruikers | ✅ | `allowed_emails` + gate in `lib/auth.ts` + `/instellingen` |
| L-06 | LLM-budget + teller | ◑ | UI + `llm_usage`-tabel klaar; teller staat op €0 zolang er geen LLM-calls zijn |

Kort: alle 🔨-features zijn gebouwd, op **vier bewuste beperkingen** na, alle door één
oorzaak — er is nog geen LLM- of mail-key en geen OCR-lib aangesloten: **B-04** (OCR),
**B-05/H-04** (LLM), **L-01** (mail). Plus **C-13** (varianten-blok, brondata-beperkt).
Deze zijn hierboven expliciet als ⏳/◑ gemarkeerd, niet stilzwijgend overgeslagen.

### Latere horizon (H2/H3) — nu óók gebouwd

De ⏳-features uit §1 (H2/H3) én de latere-horizon-schermen (§3.16) zijn ingebouwd.
`bun vitest run` → **294 tests groen** (34 files); `tsc` schoon. Migratie `0005_h2_h3` op
Neon; end-to-end in de browser geverifieerd (productdetail met disclosure, dossierlijst met
lifecycle-filter + org-veld, `/instellingen/organisatie`, `/merk/dashboard`, `/admin/merken`).

| # | Feature (H2/H3) | Status | Bewijs / noot |
|---|---|---|---|
| L-03/04 | Organisaties, memberships & rollen (petten) | ✅ | `lib/repo/orgs.ts`, `/instellingen/organisatie`; rol = default-view, nooit de engine |
| L-05 | Prijsmodel (abonnement/per-dossier) | ◑ | `organizations.plan` + seat_limit als datamodel; facturatie zelf = extern |
| A-05 | Dossier-lifecycle delivered/archived + reden | ✅ | `lib/repo/lifecycle.ts`, lifecycle-controls + read-only-banner + fase/lifecycle-filter |
| J-01/02 | Disclosure-tiers + projectgebonden prijs | ✅ | `lib/repo/disclosure.ts` (beslisboom §4.11, getest), `visible_specs`-view, `/producten/[id]` |
| J-03 | Prijsaanvraag-knop = lead | ✅ | tier2-gated → "Prijs via Brink aanvragen" → `leads` + lead-event |
| J-04 | Per-veld-zichtbaarheid | ✅ | `brand_field_visibility` + `fieldVisible`; beheerbaar in `/admin/merken` |
| J-05 | Vergelijk-tray zonder prijzen | ✅ | `compare-tray.tsx` (max 4, prijsvrij) |
| F-06 | Substitutievoorstel-document | ✅ | `lib/repo/substitution.ts` + printbaar document veld-voor-voor-veld + duurzaamheidswinst |
| F-07 | Systeemalternatieven | ◑ | heuristische cross-categorie-suggestie (zone + aantal), gemarkeerd "voorstel" |
| F-08 | Besparing tonen, nooit sorteren | ✅ | prijsverschil als tekst in `saving_note`, geen ranking op prijs |
| G-02 | Versiebeheer armaturenboek | ✅ | `armaturenboek_versions` + snapshot + diff-weergave |
| G-03 | Locatie per regel (WAAR) | ✅ | `spec_lines.location` + in versiehistorie |
| G-04 | Datasheets als bijlage | ✅ | `product_datasheets` + weergave |
| I-05 | Staffelprijzen | ✅ | `price_tiers` + `getPriceForQty` (hoogste drempel ≤ aantal) |
| H-10 | PDL-import (Connecting the Dots) | ◑ | als staging-import in `/admin/imports` (echte PDL-sync = externe koppeling) |
| H-11 | Eén publicatiepad via staging→goedkeuring | ✅ | `brand_uploads` + goedkeuren/afwijzen in `/admin/imports` |
| K-05 | Merk-dashboard (geaggregeerd) | ✅ | materialized view `mv_brand_considerations` (aggregatie = anonimiseringsgrens), `/merk/dashboard` |

Gedeelde kern-contracten die alle H2/H3-schermen delen: `lib/repo/orgs.ts`,
`lib/repo/disclosure.ts` (met `disclosure.test.ts`) en `lib/repo/lifecycle.ts`.

Resterend na H2/H3 (echt extern-afhankelijk, gemarkeerd ◑): mail-provider (L-01),
LLM (B-05/H-04), OCR (B-04), echte facturatie (L-05) en de echte PDL-sync (H-10). Datamodel
en UI staan klaar; alleen de externe koppeling/sleutel ontbreekt.

### Aannames / open eindes runs 4–6

- `open` blijft de zesde status ("nog niet gematcht"); `paars` telt in `STATUS.countsInTotal`
  als "wél tonen", maar op de estimate staat het als p.m. (niet opgeteld) — bewust.
- CRI en dimbaarheid staan niet in de tolerantietabel van de regelset; keuze in `tolerances.ts`:
  CRI lager dan gevraagd = rood (minimum-eis), afwijkend dim-protocol = geel. Herijken met Eduard.
- Variant-kleuren in het review-station zijn een vaste lijst (wit/zwart/grijs/aluminium) omdat
  er geen kleur-enum in het schema staat — makkelijk te vervangen.
- LLM-verrijking (H-04) is nog niet aangesloten (geen key); de parser-route draait deterministisch.
  De budgetteller (`llm_usage`) en cap staan klaar in /instellingen.
- Vorm (`req_shape`) en beam angle worden pas echt bruikbaar zodra run 5-verrijking die velden
  op producten vult; de matcher behandelt ze nu meestal als "geen data" (grijze vlag).

## Status: het complete Lumen Logic staat (runs 1–3)

### De drie rollen (driekoppige gebruiker) — compleet
- **Calculator** → geprijsde tender-inschrijving. Engine in tender-stand (spec-getrouw,
  geen suggesties). `/dossiers/[id]/offerte`.
- **Werkvoorbereider** → value-engineering ná gunning. `/dossiers/[id]/werkvoorbereiding`
  (alleen in gegund-stand).
- **Projectleider** → gecodeerd armaturenboek. `/dossiers/[id]/armaturenboek`.

### De vijf ijzeren regels — in code én in tests
1. **Geen webshop** — geen winkelwagen/checkout/publieke prijzen.
2. **Geld nooit in de ranking** — matching (`lib/repo/products.ts`) én de vergelijkings-
   engine (`lib/repo/equivalence.ts`) sorteren puur op objectieve velden; prijs wordt
   getoond, nooit gesorteerd. Aparte test bewijst dit.
3. **Verlopen prijslijst = onzichtbaar** — centrale view `visible_products`; alle zoek-/
   engine-code leest enkel hieruit. Bewezen voor zoeken, exacte SKU én de engine.
4. **Default = veilig** — dossier-fase default `tender`; `getEquivalentAlternatives` geeft
   in tender altijd `[]`. Bewezen in repo- én UI-tests.
5. **Event-log vanaf dag één** — elke search/match/no-match/offerte/suggestie/PDF-import
   in `events`; de `/analytics`-view maakt er het Fase-2-fundament van.

### Run 1 — fundament (af)
Datamodel · import van **211.310 echte XIS-producten** · calculatorflow (dossiers,
spec-regels los + CSV-plak, matchen, printbare offerte).

### Run 2 — PDF-import + armaturenboek (af)
- **Armaturenboek-export** (projectleider): gecodeerd, printbaar overdrachtsdocument.
- **PDF-import** (`lib/pdf/armaturenboek.ts`): leest de inhoudsopgave-tekstlaag van een
  geüpload armaturenboek, segmenteert op armatuurcodes en splitst merk/type via de
  merkenlijst. ⚠️ Het Deerns-voorbeeld in `docs/examples/…ANN…pdf` is als **beeld/outline**
  geëxporteerd en heeft géén tekstlaag — daar valt niets uit te parsen (de UI meldt dat
  eerlijk). Voor de live demo genereert `bun scripts/gen-demo-pdf.ts` een tekst-PDF
  (`docs/examples/demo-armaturenboek.pdf`) die de import wél leest (7 regels).

### Run 3 — fase-bewuste gelijkwaardigheidsengine (af)
- **Engine** (`lib/repo/equivalence.ts`) — "scheidsrechter, geen rechter": rangschikt
  alternatieven op objectieve merk-velden (categorie, kelvin, CRI, IP) + duurzaamheid
  (garantie, repareerbaarheid, EPD) als tiebreak, **nooit prijs**. Toont de bron
  ("merk-opgave") en eerlijk "geen data" bij ontbrekende cijfers. Alleen in gegund-stand.
- **Werkvoorbereidersview** met objectieve vergelijkingstabellen per gematchte regel.

## DoD-demo (klaargezet in Neon)
`bun run seed:demo` → `bun run seed:scenario` zet het Deerns-dossier klaar en valideert de
volledige pijplijn end-to-end. Na inloggen ziet Timo het dossier met 3 matches + 2 nette
no-matches; op “gegund” toont de werkvoorbereider cross-merk groenere gelijkwaardigen.

## Aannames & keuzes onderweg
- **Prijsgeldigheid:** bron heeft geen datum → prijslijst `valid_until = 2026-12-31`. Eén
  prijslijst per merk (staffels = later). Zichtbaarheid vereist een geldige prijs.
- **Categorie- en duurzaamheidsdata ontbreekt in de bron** (`category_path` op 19 van 211k
  rijen, duurzaamheid leeg). De engine/architectuur zijn daarop gebouwd; de data komt in
  productie van de merken. Voor de demo zetten `seed:scenario` (cross-merk spots-scenario)
  en `seed:sustainability` **synthetische, duidelijk-gemarkeerde** categorie/kelvin/
  duurzaamheidscijfers op een kleine set producten, zodat de engine zichtbaar werkt.
- **Eigen HTTP-migrator** (`bun run db:migrate`) i.p.v. drizzle-kit's ws-driver (hing hier).
- **Better Auth via de Drizzle-adapter** (pg-provider mist het `pg`-pakket). Magic link →
  serverconsole (op Vercel: functie-logs).
- **Testomgeving-compat:** geteste componenten zijn server-safe (lucide → lokale inline-
  SVG's; shadcn Slot direct uit `@radix-ui/react-slot`; `Table` niet meer `"use client"`).

## Nodig voor de live Vercel-demo
- **`DATABASE_URL`** — Neon (al gevuld; migraties + import + seeds hiertegen gedraaid).
- **`BETTER_AUTH_SECRET`** — staat lokaal in `.env.local`; **zet dezelfde waarde als Vercel
  project-env**, anders werkt de magic-link-login op de deploy niet.
- Schone DB opbouwen: `db:migrate` → `import` → `seed:demo` → `seed:scenario`.

## Commando's
`bun dev` · `bun run test` · `bun run db:migrate` · `bun run import` · `bun run seed:demo`
· `bun run seed:scenario` · `bun run seed:sustainability` · `bun scripts/gen-demo-pdf.ts`

## Bewust NIET gedaan / vervolg
- OCR voor beeld-geëxporteerde PDF-armaturenboeken (zoals het Deerns-voorbeeld) — nu een
  eerlijke melding; OCR-pijplijn is een volgende stap.
- Echte merk-duurzaamheidsdata (PDL/ConnectingTheDots-koppeling), staffelprijzen,
  disclosure-tier-gating in de UI, rollen & rechten, Elasticsearch (richting 3M SKU's).
- Client-side navigatie (`next/link`) in de twee lijst-componenten die nu `<a>` gebruiken.

## Review-pass (Fable, 2026-07-02)
Frisse-ogen-review na oplevering; drie fixes doorgevoerd (43 tests groen):
- **Matching**: prefix-bonus in de fuzzy-ranking — het armatuur ("SASSO 100 SQ SP CEIL…")
  wint nu van accessoires die de familienaam middenin noemen ("SNOOT … FOR SASSO 100").
  `seed:demo` matcht Lp301 daardoor direct aan het echte armatuur. Nog steeds puur tekst.
- **CSV-plak**: meegeplakte kolomkop ("code, aantal, merk, type") wordt overgeslagen.
- **Analytics**: uuid-cast op `payload->>'productId'` afgeschermd met een regex-guard —
  één afwijkend event kan de pagina niet meer breken.

## Open eindes
- RLS staat uit op de bron-Supabase — bekend, niet van ons (alleen-lezen bron).
- Eén gebruiker (Timo), geen rollen; rollen komen bij een echte multi-user-uitrol.

## Status- en fasemodel (B6 stap 4, 2026-07-14)
`phase` (tender/awarded) is nu AFGELEID met één schrijver: `lib/repo/project-status.ts`
(`derivePhase`: awarded alléén bij status `gegund` óf xis_phase ∈ {deal_making, deliver,
aftersales, win}). Phase-toggle, `setDossierPhase` en de lifecycle-code (controls, filter,
`lib/repo/lifecycle.ts`) zijn verwijderd; alles draait op `status`. Bewuste keuzes:
- **lifecycle-kolom** blijft in het schema staan (deprecated, wordt niet meer beschreven of
  gelezen); oude `lifecycle_changed`-events blijven historie.
- **deliveredAt wordt genegeerd** bij status `gegund`: het hoorde bij het oude
  lifecycle-"opgeleverd" (armaturenboek overgedragen) en dat is niet hetzelfde als gunning.
  Het gunningsmoment staat in het `status_changed`-event. Kolom deprecated, blijft staan.
- **Read-only alléén bij archief** — bestaande "opgeleverde" dossiers (backfill 0006 →
  status gegund) zijn daarmee weer bewerkbaar (bewust, zie plan B6).
- `setStatus` naar `estimate_gestuurd` bevriest een bestaande, nog niet bevroren estimate
  (I-06) + `quote_frozen`-event; zonder quote gebeurt er niets.

## Review-kaarten (stap 7, 2026-07-14)
Herontwerp §4: review alleen bij échte keuzes, en elke bevestigende keuze telt als
menskeuze. Bewuste besluiten:
- **Accepteer → groen** (was: bleef geel). Élke bevestigende review-beslissing
  (accepteer voorstel, "welke van deze N", kleurvariant, handmatig linken) maakt de
  regel groen mét merkteken "handmatig gekozen" (chosenBy = actor); de oorspronkelijke
  afwijkingen blijven als notitie op regel + estimate + PDF staan (C-07).
  'gecontroleerd' (OCR) en 'bevestigd' (onvolledig) blijven status-neutraal — daar is
  de match al gekozen of gaat het om de bron, niet om een productkeuze.
- **Badge-telling**: rode regels zonder match tellen mee als 'wachtend' in de
  Review-tab-badge — de review-pagina bevat er werk voor (sectie "Niet gevonden —
  handmatig linken"). Na het linken is de regel groen en valt hij uit de telling;
  het audit-spoor leeft in events (`manual_link`) + chosenBy/chosenReason.
  Uitzondering (reviewer-bevinding): regels mét een reviewKind — zoals een
  afgewezen gele regel — blijven alleen in "Afgerond" en tellen niet als wachtend;
  handmatig linken kan dan nog via het regel-detail ("Andere match").
- **Kleurvarianten**: échte zusterproducten (zelfde merk, zelfde naam minus
  kleur-token) uit `visible_products`. De kleur-tokens (EN+NL woordenlijst, ook
  samengesteld "BLACK/GOLD") leven in de naam-parser (`lib/enrichment/parser.ts`,
  `extractColorTokens`) — bewust conservatief: alleen hele kleurwoorden, nooit codes;
  nul varianten → fallback op de kandidatenlijst, nooit een verzonnen kleur.
- **N-keuze-drempel**: de "welke van deze N"-kaart verschijnt bij ≥2 schone kandidaten
  (lijst 'aantoonbaar' — volledig beoordeelbaar, geen rood/onbekend); max 4 knoppen.
- **Kandidaat-record bij niet-getoetste keuze**: een gekozen zuster/gelinkt product dat
  nog geen kandidaat was krijgt een record in lijst 'onvolledig' met lege verdicts —
  "aantoonbaar" zou liegen (C-08); de mens was hier de toetser.
- **Rood-kaart is fase-veilig** (ijzeren regel 4): het systeem toont er nooit
  suggesties; de resultatenlijst verschijnt pas na een eigen zoekactie (GET-formulier
  → `searchProducts`, dat zelf logt).

## Onderdeel Aanvraag→Estimate — afgerond 2026-07-14

Plan: `docs/plan-aanvraag-estimate.md` (B1–B6); herontwerp + nulmeting in de vault
(`projects/lumenlogic/onderdelen/aanvraag-tot-estimate.md`). Alle tien bouwstappen staan.

### Wat er gebouwd is (stappen 1–9 samengevat)

1. **Hernoemen "Projecten"** — routes `/dossiers` → `/projecten` (permanente redirect),
   alle UI-labels; DB-tabellen en code-identifiers bewust níét (B1, zie besluiten).
2. **Cleanup-testdata-script** — `scripts/cleanup-testdata.ts`: Van Dijk-org + leden weg,
   Flos → tier-1; dry-run default, `--apply` vereist, idempotent, events gelogd.
3. **Migratie 0006** (additief + backfill in één transactie) — kolommen `status` en
   `xis_phase` op `project_dossiers`, `raw_markdown` op `import_runs`, tabel `ai_suggestions`.
4. **Status/fasemodel** — `lib/repo/project-status.ts` is de éne schrijver van `phase`
   (`derivePhase`); statusfilter, XIS-fasen in het formulier, "Markeer als gestuurd"
   bevriest de quote (I-06).
5. **PDF-upload bovenaan + md-controlespoor** — upload als eerste blok; de volledige
   tekstlaag als markdown ("## Pagina N", cap ~2 MB) opgeslagen, toonbaar en downloadbaar
   per importrun.
6. **Geel auto-door (B3)** — `pickUnambiguousYellow` in de engine (puur, deterministisch):
   precies één schoon-gele kandidaat zonder keuzeveld-afwijking → match direct gezet,
   `chosenBy='system:auto'`, label "automatisch geaccepteerde bijna-match", event
   `near_match_auto_accepted`. Ambiguïteit → gewoon review.
7. **Review-kaarten** — echte kleurvarianten (zusterproduct-query), "welke van deze N",
   inline catalogus-zoeker op rood-kaarten; élke bevestigende keuze → groen mét merkteken
   "handmatig gekozen" (zie "Review-kaarten (stap 7)" hierboven).
8. **AI-vangnet (B4)** — `lib/ai/vangnet.ts` (`@anthropic-ai/sdk`, claude-haiku): automatisch
   na import/hermatch over alléén de restregels; drie read-only tools uitsluitend op
   `visible_products` (regel 3), nooit prijs (regel 2), tender = server-side merkvergrendeling
   (regel 4); suggesties-only, budgetstop via `llm_budget_eur`/`llm_usage`, alles in events.
9. **Estimate-PDF (B5)** — `lib/repo/estimate.ts` (`computeEstimate`, één bron voor scherm
   én PDF) + `lib/pdf/estimate.ts` (pdf-lib) + downloadroute; getest op terugleesbare tekst.

**Stap 10 — acceptatietest**: `tests/acceptatie-aanvraag-estimate.test.ts` — de hele keten
op PGlite met het échte `docs/examples/test-armaturenboek.pdf` (20 regels): project →
PDF-import (incl. markdown-spoor) → matcher (9 groen · 5 geel · 2 rood · 2 blauw · 2 paars;
van de gele gaan er 3 auto-door en blijven er 2 in review) → vangnet met gemockte client
(suggesties, statussen onaangetast) → review (accepteer/variant/handmatig linken) →
estimate-PDF terugleesbaar (offertenummer, totalen, p.m., beide merktekens) → statusflow
(estimate_gestuurd bevriest; gegund → awarded) → audittrail-asserts over de hele keten.

### Bewuste besluiten

- **B1-compromis naamgeving**: UI + routes zeggen "Project"; DB-tabellen
  (`project_dossiers`), code-identifiers en de events-historie blijven "dossier" —
  gedeelde Neon-DB, audit-log niet herschrijven. Commentaarkop "UI-naam: Project" in
  schema/repo's.
- **Fase-grens AI (B4)**: het vangnet zoekt in tender uitsluitend het gevraagde product —
  de merkvergrendeling zit in de tool-implementatie (server-side), niet alleen in de
  prompt; blauw-suggesties bestaan alleen bij `awarded`. De matcher-engine blijft LLM- en
  fase-vrij.
- **Backfill-aannames (0006)**: actief + bevroren quote → `estimate_gestuurd`; actief →
  `concept`; delivered → `gegund`; archived → `archief`; fase awarded → xis `deal_making`.
- **Review → groen**: élke bevestigende review-keuze maakt de regel groen mét merkteken
  "handmatig gekozen"; de oorspronkelijke afwijkingen blijven benoemd (C-07).
- **deliveredAt genegeerd** bij status `gegund` (hoorde bij het oude lifecycle-"opgeleverd");
  kolom blijft deprecated staan, het gunningsmoment leeft in het `status_changed`-event.
- **Read-only alléén bij archief**: bestaande "opgeleverde" dossiers zijn weer bewerkbaar.
- **EUR≈USD-kostenaanname**: de vangnet-budgetteller rekent bewust conservatief 1 USD ≈ 1 EUR
  (haiku $1/M in · $5/M uit), zodat `llm_usage.cost_eur` nooit te laag telt.
- **Groene regels krijgen géén automatische match**: alleen de B3-auto-door zet een match
  zonder mens; een groene regel telt pas mee in de totalen nadat iemand de kandidaat koos.

### Open punten

- **`ANTHROPIC_API_KEY` ontbreekt nog** — het vangnet slaat nu netjes over met event
  `ai_vangnet_skipped_no_key` (nooit een importfout). Key zetten in `.env.local` én als
  Vercel-env; daarna draait het vangnet automatisch mee bij import/hermatch.
- **Resend/mailprovider** — magic-link gaat nog via de serverconsole (L-01).
- **Echte XIS-API** — export is een idempotent snapshot in het payload-formaat; de echte
  Lynx-POST wacht op API-keys (extern).

## Onderdeel Merkrelaties & data-inwinning — afgerond 2026-07-14

Plan: `docs/plan-merkrelaties.md` (stappen 1–8). Overzicht `/data/merkrelaties`
(status, prijslijst-indicator, mini-scorecard), detailpagina met volledige scorecard +
relatieformulier, Excel-template-download en bericht-klaarzetten.

### Aannames & bewuste besluiten

- **Gradient-semantiek scorecard**: donkergroen = álle must-velden van de bucket 100%
  gevuld; daaronder kleurt het blokje mee met de dekkingsratio (rood→geel→groen). De
  exacte ratio-drempels zijn een UI-keuze, geen datamodel-feit.
- **Niet-meetbare velden grijs**: velden die nog niet in het datamodel bestaan tonen
  "niet meetbaar" (grijs) tot de datamodel-migratie (0007, parallelle workstream) landt.
  Daarna is per veld alleen `measure.column` invullen in `lib/field-catalog.ts` genoeg.
- **Drizzle-snapshot-gat**: migraties vanaf 0004 zijn handgeschreven; de drizzle-kit
  meta-snapshots lopen dus achter op de werkelijke schema-staat.
- **Dubbele brand_codes (K8)**: merken met een gedeelde code krijgen alleen een badge;
  merge-tooling is bewust later.
- **"Geen reactie"-filter** vereist een gevulde `lastContactAt` — status 'benaderd'
  zonder contactdatum valt er buiten.
- **TOCTOU-venstertje in het status-event**: tussen lezen van de oude status en de
  upsert kan in theorie een andere schrijver zitten; single-user, acceptabel.
- **Retour-pad** (ingevulde templates terug verwerken) is bewust het volgende onderdeel.
- **exceljs** toegevoegd als dependency (echte .xlsx-template) — met Timo's akkoord.
- **`brand_template_downloaded`-event** heeft `entityId` null (download is niet aan één
  merk gebonden bij de generieke template).
