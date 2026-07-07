# Lumen Logic — Masterplan (eindbeeld)

> **Status:** plandocument, opgesteld 2026-07-07. Runs 1–3 zijn af (zie `HANDOVER.md`);
> dit document beschrijft het volledige eindbeeld — uiterlijk, functionaliteit per rol,
> architectuur — en de bouwvolgorde ernaartoe (runs 4+). Achtergrond:
> `docs/lumenlogic-briefing.md`. Oorspronkelijke run-1-opdracht: `docs/BUILD-PLAN.md`.
> Besluiten uit die documenten worden hier niet heropend, alleen uitgewerkt.

---

## 1. Eindbeeld in één alinea

Lumen Logic is het Brink-branded platform waarop een installateursorganisatie een
projectdossier van tender tot oplevering draagt: spec inladen (PDF/CSV/handmatig) →
matchen tegen ~3M SKU's van ~430 merken → geprijsde tenderinschrijving → ná gunning
value-engineering met objectieve gelijkwaardigheidstabellen → gecodeerd armaturenboek
als overdracht. Daaromheen: gratis spec & vergelijking voor specifiers (acquisitie,
fase 2), en een merkportaal met data-beheer en analytics (verdienmodel fase 2).
Het is een vakgereedschap, geen webshop — dat principe stuurt elk ontwerpbesluit hieronder.

## 2. IJzeren regels → concrete UI- en architectuurconsequenties

De vijf regels uit `CLAUDE.md` blijven onverkort gelden. Wat ze in het eindbeeld betekenen:

| Regel | Consequentie in UI | Consequentie in architectuur |
|---|---|---|
| 1. Geen webshop | Geen winkelwagen-iconografie, geen "bestel"-knoppen, geen prijzen op publieke pagina's, geen productfoto-grid als etalage. Taal: "dossier", "regel", "offerte" — nooit "mandje", "kopen". | Geen order-/checkout-tabellen. Prijzen alleen zichtbaar binnen een ingelogd dossiercontext. |
| 2. Geld nooit in ranking | Prijs staat in de rechterkolom van vergelijkingstabellen, nooit als sorteersleutel; geen "sorteer op prijs" in engine-views. In de calculator-offerte mag wél op prijs gesorteerd worden (dat is commercie, geen matching). | Matching (`lib/repo/products.ts`) en engine (`lib/repo/equivalence.ts`) importeren nooit prijskolommen in hun ORDER BY. Blijvende regressietest. |
| 3. Verlopen prijslijst = onzichtbaar | Product verdwijnt geruisloos uit zoeken/engine. Brink-admin ziet wél een dekkingsgat-alert ("merk X: prijslijst verlopen, N producten onzichtbaar"). | Alle leesroutes via de view `visible_products`; nieuwe features mogen `products` nooit direct bevragen. Alert-job op naderende `valid_until`. |
| 4. Default = veilig | Fase-badge permanent zichtbaar in de dossier-header. Faseovergang is een expliciete, bevestigde actie met logging. In tender bestaat de werkvoorbereidingstab niet eens (geen disabled-staat die nieuwsgierig maakt). | `phase` op het dossier is de enige poort; de engine geeft in tender hard `[]`. Rollen wijzigen dit gedrag nooit — fase stuurt, niet rol. |
| 5. Alles gelogd | Gebruiker merkt er niets van; merk-analytics (fase 2) en installateurs-inzichten drijven erop. | `events` is append-only; nieuwe acties krijgen vóór oplevering hun event. Payload-schema per action gedocumenteerd. |

## 3. Gebruikers & rollen

### 3.1 Rolmodel

Rollen zijn **petten binnen een installateursorganisatie**, geen waterdichte schotten:
bij een kleine installateur draagt één persoon alle drie. Rol bepaalt daarom de
**default-view en het primaire deliverable**, niet wat iemand mag zien van het eigen
dossier. Wat de engine toont wordt uitsluitend door de **dossierfase** bepaald
(ijzeren regel 4) — nooit door de rol.

| Rol | Doel / deliverable | Primaire schermen | Mag niet |
|---|---|---|---|
| **Calculator** | Geprijsde tenderinschrijving, spec-getrouw | Dossier → spec-regels → matchen → offerte | — (fase beschermt hem: in tender bestaan er geen suggesties) |
| **Werkvoorbereider** | Substitutievoorstel / value-engineering ná gunning | Werkvoorbereidingstab, vergelijkingstabellen, substitutiedocument | Fase omzetten kan hij wel, maar het is een gelogde, bevestigde actie |
| **Projectleider** | Gecodeerd armaturenboek, verrassingsvrije overdracht | Armaturenboek-tab + export | — |
| **Org-admin** (installateur) | Team en abonnement beheren | Instellingen: leden, rollen, facturatie | Ziet geen dossiers van andere organisaties |
| **Specifier** (fase 2) | Specificeren & vergelijken, gratis | Catalogus, productdetail, vergelijking, spec-export | Ziet **geen prijzen** (disclosure-gated); geen offertes |
| **Merkgebruiker** (fase 2) | Eigen data beheren + analytics | Merkportaal: datavelden, prijslijsten uploaden, analytics-dashboard | Ziet alleen geaggregeerde, geanonimiseerde vraagdata; ziet nooit dossiers, klanten of concurrent-analytics; kan ranking op geen enkele manier beïnvloeden |
| **Brink-admin** | Platform draaiend houden | Admin: merken & tiers, prijslijst-monitoring, importruns, gebruikers, event-inzage | — |

### 3.2 Multi-tenancy

- **Organisatie** is de tenant: dossiers, offertes en armaturenboeken horen bij een
  organisatie, nooit bij een individu. Catalogusdata (producten, merken, prijzen) is
  platform-breed en read-only voor installateurs.
- Een gebruiker hoort bij precies één organisatie (uitzondering: Brink-admins).
  Rollen zijn een set per gebruiker (`roles: role[]`), geen enkelvoudige waarde.
- Autorisatie in de repo-laag: elke dossier-query filtert op `organization_id` uit de
  sessie. Nooit in de UI-laag afdwingen.

## 4. Functionaliteit per module (eindbeeld)

### 4.1 Dossier-lifecycle

- Statussen: `tender` → `awarded` → (nieuw) `delivered` → `archived`.
  - `delivered`: armaturenboek is overgedragen; dossier wordt read-only behoudens notities.
  - `archived`: uit de standaardlijst, wel doorzoekbaar. Verliezen van een tender →
    direct naar `archived` met reden (waardevolle analytics: welke merken verliezen tenders).
- Faseovergang tender→gegund: bevestigingsdialoog die expliciet benoemt wat er verandert
  ("de engine gaat alternatieven tonen; de offerte is bevroren als tender-versie") + event.
- Elk dossier krijgt een **offerte-snapshot per fase**: de tender-offerte blijft
  onaantastbaar bewijs van wat is ingeschreven; werkvoorbereiding bouwt een tweede versie.

### 4.2 Spec-invoer

- Drie routes, allemaal naar dezelfde `spec_lines`:
  1. **Handmatig** per regel (bestaat).
  2. **CSV-plak** (bestaat; kolomkop-detectie zit erin).
  3. **PDF-import** van armaturenboeken (bestaat voor tekst-PDF's).
- **Run 4: OCR-route** voor beeld-geëxporteerde PDF's (zoals het Deerns-voorbeeld):
  upload → serverless OCR (tekstlaag reconstrueren) → dezelfde segmentering als de
  tekst-route. UI toont per regel de bron (tekst/OCR) en betrouwbaarheid; OCR-regels
  krijgen een "controleer mij"-vlag en zijn pas matchbaar na menselijke bevestiging.
- Import is altijd een **voorstel-scherm**: geparste regels in een tabel met
  bewerkbare cellen, pas na "regels toevoegen" worden ze spec_lines. Nooit stil wegschrijven.

### 4.3 Matching

- Volgorde (bestaat): exact op artikelcode → fuzzy op merk + producttekst
  (full-text + trigram, prefix-bonus voor armaturen boven accessoires).
- Eindbeeld-uitbreidingen:
  - **Kandidaten persistent maken** (`spec_line_candidates`): de getoonde top-N met
    score wordt opgeslagen, zodat (a) de keuze reproduceerbaar is, (b) analytics ziet
    welke kandidaat won, (c) een collega het werk kan overnemen.
  - **Kernveld-verificatie**: als de spec-regel `reqKelvin/reqCri/reqIp` heeft en de
    kandidaat wijkt af, toont de kandidatenlijst een gele afwijkingsmarkering per veld.
    Nooit blokkeren (de calculator beslist), wel zichtbaar maken.
  - **No-match is een eerste-klas uitkomst**: nette status + reden (merk niet in
    catalogus / prijslijst verlopen / niets gevonden). Verlopen-prijslijst-reden alleen
    zichtbaar voor Brink-admin (installateur ziet gewoon "geen match" — een gat is eerlijk).

### 4.4 Offerte (calculator)

- Bestaat: geprijsde regellijst, print-CSS.
- Eindbeeld:
  - **Staffelprijzen** (`price_tiers` op prices): stukprijs volgt aantal; UI toont welke
    staffel actief is.
  - **Marge/korting per regel en per offerte** — inkoopprijs (bron: merk-korting op
    brands) vs. verkoopprijs; alleen zichtbaar binnen de eigen organisatie, nooit in
    export naar de klant.
  - **Offerteversies**: elke generatie is een immutabele snapshot (prijzen, namen,
    totalen bevroren op quote_lines — kolommen bestaan al). Nieuwe generatie = nieuwe
    versie met diff-weergave ("regel Lp301: prijs gewijzigd sinds v1").
  - **PDF-export** naast print-CSS (run 5); huisstijl van de installateur (logo-upload).

### 4.5 Werkvoorbereiding (gelijkwaardigheidsengine)

- Bestaat: cross-merk vergelijkingstabellen op objectieve velden, duurzaamheid als
  tiebreak, bronvermelding ("merk-opgave"), eerlijke "geen data"-cellen, alleen in
  gegund-stand.
- Eindbeeld:
  - **Substitutievoorstel-document**: geselecteerde alternatieven → printbaar/PDF
    voorstel per regel: origineel vs. alternatief, veld-voor-veld, mét bronvermelding
    en de duurzaamheidswinst. Dit is het deliverable van de werkvoorbereider — het
    document dat hij naar de opdrachtgever stuurt.
  - **"Geen-data"-beslispunt** (briefing §14): gekozen beleid = **tonen met grijze
    "geen data"-vlag**, nooit stil uitsluiten (uitsluiten = impliciet oordeel).
    Definitief te bevestigen met Eduard; de engine ondersteunt beide via een parameter.
  - **Besparing tonen, nooit sorteren**: het prijsverschil per alternatief staat in de
    laatste kolom (dat is waar de werkvoorbereider voor komt), maar de rangorde blijft
    puur objectief. Dit is de scherpste rand van ijzeren regel 2 — expliciete test.

### 4.6 Armaturenboek (projectleider)

- Bestaat: gecodeerd, printbaar overdrachtsdocument.
- Eindbeeld: versiebeheer (herexport na substituties toont wijzigingshistorie),
  PDF-export, optionele bijlagen per regel (datasheets van het merk, zodra PDL die levert).

### 4.7 Catalogus & productdetail (fase 2, specifier-instap)

- `/catalogus`: zoeken zonder dossiercontext. Zelfde repo-functies, zelfde
  `visible_products`-regel — mist een product een geldige prijs én is het merk Tier 2,
  dan is het via spec-zicht wel tonen (specs zonder prijs is precies wat Tier 2 betekent).
  Dit vergt een tweede view: `visible_specs` (zichtbaarheid zonder prijseis) naast
  `visible_products` (zichtbaarheid mét prijseis). Offertes gebruiken altijd de tweede.
- `/producten/[id]`: technisch datablad, duurzaamheidsblok, disclosure-gated prijsblok:
  - Tier 1 + ingelogde installateur → adviesprijs zichtbaar (projectcontext).
  - Tier 2 → "prijs via Brink" (aanvraagknop, gelogd — dat is een lead).
  - Tier 3 → alleen naam/merk/logo, "data in afwachting van merk".
- Vergelijken (max 4 producten naast elkaar) — de gratis acquisitiefunctie voor
  specifiers. Geen prijzen in deze view.

### 4.8 Merkportaal (fase 2, verdienmodel)

- **Data-beheer**: eigen productvelden inzien, duurzaamheidsvelden aanvullen
  (garantie, repareerbaarheid, EPD, herkomst), prijslijst uploaden met verplichte
  `valid_until`. Alles staged: Brink-admin keurt goed vóór publicatie.
- **Analytics-dashboard**: hoe vaak gespecificeerd/gematcht/gekozen, in welke
  categorieën, win/verlies tegen (geanonimiseerde) alternatieven, dekkingsgraad van de
  eigen data. Alles geaggregeerd — nooit dossier- of klantnamen.
- **Wat er níét is**: geen enkele knop die zichtbaarheid of positie koopt. Het
  abonnement geeft toegang tot inzicht en data-beheer, punt.

### 4.9 Brink-admin

- Merken & tiers beheren, prijslijst-monitoring (verloopt-binnenkort-lijst + dekkingsgat-
  rapport), importruns (PDL-sync-status, fouten), gebruikers/organisaties, event-inzage.
- De bestaande `/analytics` groeit hierin op: van demo-view naar admin-instrument.

## 5. UI/UX-ontwerp

### 5.1 Ontwerpprincipes

1. **Vakgereedschap, geen etalage.** Dichtheid boven witruimte: de calculator werkt
   met tientallen regels tegelijk. Tabellen zijn het primaire UI-element, cards zijn
   uitzondering (dossierlijst, lege staten).
2. **De fase is altijd zichtbaar.** Elke dossierpagina draagt de fase-badge in de
   header (tender = neutraal blauw/grijs, gegund = groen). De gebruiker mag nooit
   hoeven raden in welke stand de engine staat.
3. **Eerlijkheid als esthetiek.** "Geen match", "geen data", "OCR — controleer":
   grijze, rustige vlaggen, geen rode alarmen. Rood is gereserveerd voor echte fouten.
4. **Print is een eerste-klas doel.** Drie documenten (offerte, substitutievoorstel,
   armaturenboek) moeten op A4 zwart-wit perfect zijn: geen schermchroom, tabular
   figures, paginanummers, documentcode + versienummer in de voettekst.
5. **Brink-branded, merk-neutraal in de inhoud.** Brink-logo in de schil; in
   vergelijkingstabellen zijn alle merken typografisch identiek (geen logo-groottes
   die een voorkeur suggereren).

### 5.2 Design system

- **Basis**: Tailwind 4 + shadcn/ui (bestaat). Neutrale schaal (zinc) als canvas.
- **Accent**: warm amber (`amber-500`-familie) — "licht" als merkessentie — uitsluitend
  voor primaire acties en focus, spaarzaam.
- **Semantiek**: groen = match/gegund/duurzaamheidswinst; geel = afwijking van
  spec-eis / controleer-vlag; grijs = geen data / no-match; rood = alleen systeemfouten.
- **Typografie**: huidige stack; prijzen en getallen altijd `tabular-nums`, rechts
  uitgelijnd. Armatuurcodes (`Lp301`) in monospace — het zijn identifiers.
- **Dark mode**: volwaardig (bestaat in de testmatrix), maar printdocumenten renderen
  altijd licht.
- **Responsive**: desktop-first (dit is bureauwerk), maar elke lijst/tabel degradeert
  netjes naar mobiel (bestaande screenshot-matrix dwingt dit af). Op mobiel: tabellen
  → gestapelde regelkaarten met de drie kernvelden.

### 5.3 Navigatiestructuur (sitemap eindbeeld)

```
/login                                  magic link
/dossiers                               lijst + nieuw (default landing installateur)
/dossiers/[id]                          spec-regels + matching (tab "Regels")
/dossiers/[id]/regel/[lineId]           match-kandidaten
/dossiers/[id]/offerte                  offerte + versies (tab "Offerte")
/dossiers/[id]/werkvoorbereiding        alleen zichtbaar in gegund-stand (tab)
/dossiers/[id]/armaturenboek            (tab "Armaturenboek")
/catalogus                              standalone zoeken (fase 2)
/producten/[id]                         productdetail, disclosure-gated (fase 2)
/instellingen                           org-admin: leden, rollen, branding, abonnement
/merk/*                                 merkportaal (fase 2): data, prijslijsten, analytics
/admin/*                                Brink: merken, tiers, monitoring, imports, events
/analytics                              groeit naar /admin/analytics
```

Dossierpagina's delen één header (naam, klant, fase-badge, faseovergangsknop) met
tabs eronder. De werkvoorbereidingstab wordt niet gerenderd in tender-stand.

### 5.4 Schermspecificaties (kern)

- **Dossierlijst**: tabel (naam, klant, fase, #regels, #matches, laatst gewijzigd),
  filter op fase/status, nieuw-dossier-dialoog. Lege staat: één zin + primaire knop.
- **Regels-tab**: spec-regeltabel (code · aantal · merk · type · eisen · status ·
  match) met per rij statuskleur; boven de tabel de drie invoerroutes (regel toevoegen,
  CSV plakken, PDF uploaden). Voortgangsindicator: "12 van 15 regels gematcht".
- **Kandidatenscherm**: links de spec-regel met eisen; rechts kandidatenlijst met per
  kandidaat: naam, merk, artikelcode, kernvelden (kelvin/CRI/IP met gele
  afwijkingsmarkering), prijs, "kies"-knop. Onderaan altijd: "geen van deze —
  markeer als no-match".
- **Offertetab**: versiekiezer, regeltabel met staffel/marge-kolommen (intern) en
  print-/PDF-knop (extern document zonder marges). Diff-badge bij gewijzigde prijzen.
- **Werkvoorbereidingstab**: per gematchte regel een uitklapbare vergelijkingstabel
  (origineel + alternatieven als kolommen, objectieve velden als rijen, prijsverschil
  als laatste rij, bronvermelding als voetnoot). Selectievakje per alternatief →
  "substitutievoorstel genereren".
- **Armaturenboektab**: preview van het gecodeerde boek + export; versiehistorie.

## 6. Architectuur

### 6.1 Lagenmodel (bestaat — bewaken, niet wijzigen)

```
RSC-pages (app/) → server actions → repo-laag (lib/repo/*) → Drizzle → Neon Postgres
                                        ↑ enige plek met SQL; UI kent geen queries
visible_products / visible_specs (views) = enige leesroute voor catalogusdata
events = append-only zijkanaal vanuit de repo-laag
```

Regels: geen query buiten `lib/repo/`; geen prijskolom in ranking-code; elke
repo-functie die iets doet logt zelf zijn event (niet de caller).

### 6.2 Datamodel-uitbreidingen (schema v2)

Bestaande tabellen blijven; erbij komen:

- **organizations** (naam, type: `installer|brand|brink`, branding-velden, abonnement)
  en **memberships** (user ↔ org, `roles: role[]`). `project_dossiers.organization_id`
  NOT NULL na migratie.
- **price_tiers** (price_id, min_quantity, unit_price) — staffels.
- **quote-versies**: `quotes` krijgt `version`, `phase_at_generation`, `frozen_at`;
  unieke index (dossier, version).
- **spec_line_candidates** (spec_line_id, product_id, score, rank, chosen boolean,
  created_at) — reproduceerbare matching + analytics-goud.
- **substitution_proposals** + regels (werkvoorbereider-deliverable, zelfde
  snapshot-patroon als quotes).
- **brand_field_visibility** (brand_id, field, level) — per-veld disclosure bovenop de
  tier; tier is de default, dit de uitzondering.
- **import_runs** (bron: csv|pdl|merk-upload, status, counts, error-log jsonb) — elke
  datamutatie van buiten herleidbaar.
- **dossier-statusuitbreiding**: enum `tender|awarded|delivered|archived` + `archived_reason`.

Migratiediscipline blijft: hand-geschreven view-migraties zijn de bron van waarheid;
eigen HTTP-migrator (`bun run db:migrate`).

### 6.3 Zoekschaal: 211k → 3M SKU's

- Nu: Postgres full-text + trigram — ruim voldoende (besluit run 1).
- Triggerpunt voor Elasticsearch/Typesense: pas wanneer PDL-import de catalogus
  richting 7 cijfers duwt én p95-zoeklatency > ~300 ms. Voorbereiding die nú al geldt:
  alle zoeklogica zit achter `lib/repo/products.ts` — een searchbackend-wissel raakt
  één bestand. De `visible_*`-filterregel verhuist dan mee als indexeringsfilter
  (verlopen prijslijst = niet in de index).

### 6.4 PDL / ConnectingTheDots-pijplijn (fase 2)

- PDL is plumbing, geen product: een sync-job (cron of webhook) → staging-tabellen →
  mapper naar het uniforme schema → `import_runs`-verslag → publicatie.
- Merk-uploads via het portaal volgen dezelfde staging → goedkeuring → publicatie-route.
  Er is dus **één publicatiepad** voor alle catalogusdata; niets schrijft direct in
  `products`/`prices`.
- Exit-strategie (open contractpunt): het uniforme schema is van Brink; PDL-id's worden
  als `external_ref` opgeslagen zodat de bron wisselbaar blijft.

### 6.5 Auth & autorisatie

- Better Auth magic link blijft; mail-provider (Resend) vervangt de serverconsole
  vóór de eerste externe gebruiker.
- Sessie draagt `organizationId` + `roles`. Autorisatie in de repo-laag
  (organisatiefilter) + een dunne route-guard voor `/admin` en `/merk`.
- Geen RLS in Neon nodig zolang alle toegang door de repo-laag gaat; heroverwegen als
  er ooit een tweede toegangspad komt (API).

### 6.6 Analytics-pijplijn (fase 2)

- Bron blijft de `events`-tabel; payload-schema's per action vastleggen in
  `lib/repo/events.ts` (typed helpers per event i.p.v. losse strings).
- Merk-dashboard leest uit geaggregeerde materialized views (dagelijkse refresh),
  nooit rechtstreeks uit `events` — performance én een structurele
  anonimiseringslaag (aggregatie is de privacy-grens).

### 6.7 Teststrategie (bestaand regime, uitgebreid)

- Elke feature: white-box RSC-test + screenshots (licht/donker × mobiel/desktop).
- Blijvende regressietests op de ijzeren regels; nieuw erbij per run:
  autorisatie-tests (org-scheiding), disclosure-gating per tier, staffel-berekening,
  snapshot-immutabiliteit van offerteversies.
- Printdocumenten krijgen eigen screenshot-tests (print-media emulatie).

## 7. Roadmap runs 4–8

| Run | Inhoud | Definition of done |
|---|---|---|
| **4 — Multi-user & organisaties** | organizations/memberships/rollen, org-scoping van dossiers, instellingenpagina, Resend-mail, dossier-lifecycle (`delivered`/`archived`) | Twee testorganisaties zien elkaars dossiers aantoonbaar niet (test); rollen sturen default-views; magic link per mail |
| **5 — Offerte volwassen** | staffels, marge/korting, offerteversies met snapshots + diff, PDF-export, installateur-branding | Tenderversie aantoonbaar immutabel; staffel-test; PDF pixel-getest |
| **6 — Werkvoorbereider-deliverable + OCR** | substitutievoorstel-document, geen-data-beleid definitief, OCR-route met controleer-vlag | Deerns-beeld-PDF importeerbaar via OCR; substitutievoorstel printbaar; regel-2-test op besparingskolom |
| **7 — Disclosure & catalogus** | `visible_specs`-view, tier-gating in UI, `/catalogus` + productdetail, prijsaanvraag-lead | Tier 2-product toont specs zonder prijs (test); Tier 3 alleen naam; leads gelogd |
| **8 — Merkportaal & analytics** | staging/goedkeuringsflow, merk-upload prijslijsten, materialized views, merk-dashboard, PDL-sync | Merkgebruiker ziet alleen aggregaten (test); prijslijst-upload zonder `valid_until` onmogelijk; dekkingsgat-alert werkt |

Elke run: klein op main, pushen = preview, aannames in `HANDOVER.md`, validatie met
3–5 installateurs zodra run 4 externe gebruikers mogelijk maakt.

## 8. Open beslispunten (bij Eduard/Timo, niet in code beslissen)

1. **Prijsmodel fase 1**: per zetel vs. per dossier — raakt run 4 (abonnementsvelden).
   Aanbeveling: per organisatie met zetel-plafond; per-dossier remt gebruik, en gebruik
   ís de analytics-motor.
2. **"Geen-data"-beleid**: aanbeveling grijze vlag (staat hierboven), bevestigen.
3. **PDL-contract**: schema-scope, mapping-effort 430 leveranciers, data-eigendom/exit.
4. **Definitie "gelijkwaardigheid"** toetsen aan hoe tenderbeoordelaars werkelijk
   beoordelen — bepaalt welke velden de engine als hard vs. tiebreak behandelt.
5. **Adviesprijs-zichtbaarheid specifiers** (Tier 1): helemaal verbergen of
   projectgebonden tonen — raakt run 7.
