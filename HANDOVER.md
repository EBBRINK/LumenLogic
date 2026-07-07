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
