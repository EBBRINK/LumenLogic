# Plan bij de UX-audit van 30 juli 2026

Bron: `docs/ux-audit-2026-07-30.md`. Alles hieronder is geverifieerd tegen **`origin/main`
(71e4676)** — de code die in productie staat. Drie onafhankelijke plan-agents hebben het rapport
tegen de code gelegd; waar ze het oneens waren, staat de code-uitkomst.

**Dit is fase 1: een plan, geen code.** Er is niets gebouwd. Timo kiest wat in scope valt.

---

## 0. Eerst mijn eigen fouten

Het rapport had het op een aantal punten mis. Dat verandert de rangorde, dus het staat vooraan.

### 0.1 De ergste: ik heb `docs/DESIGN.md` niet gelezen — en hij bestaat wél
Ik schreef "`docs/DESIGN.md` bestaat niet in de repo". Fout. Hij staat op `origin/main` (315
regels, toegevoegd in `dc47c56`) en bevat exact de besluitenlijst O1–O13. Hij ontbreekt alleen in
mijn eigen achterlopende worktree — ik had mijn eigen regel ("lees via `git show origin/main:`")
op dit bestand niet toegepast. Ik heb de canonieke besluitenbron dus gemist terwijl die er stond.
Nu wel gelezen; de gevolgen staan in 0.2 en verderop.

### 0.2 Wat ik intrek
| Bevinding | Waarom hij vervalt |
|---|---|
| **A1-kanttekening: "maak de navbalk in dark iets lichter dan de pagina"** | Botst frontaal met **O12**: de `--nav-*`-tokens zijn *bewust* niet overschreven in `.dark` ("de balk is in beide standen hetzelfde vlak") en `components/huisstijl.test.tsx` pint dat vast door ze in LIGHT_TOKENS **én** DARK_TOKENS te zetten. Mijn suggestie zou het besluit omgooien én de guard-test breken. Ingetrokken. (De hoofdbevinding A1 — geen toggle — blijft staan en spoort met O3/G24 "dark mode blijft verplicht".) |
| **`/admin/brands` "belooft add/edit/delete en biedt geen enkele rij-actie"** | Gewoon fout. De merknaam in elke rij is een link naar `/admin/brands/[brandId]` (`components/admin/brands-list-block.tsx:73-97`), en dáár zit het edit-formulier, het lifecycle-veld én delete met vooraf getelde impact (`BrandDeleteBlock`). De ondertitel is waar. Wat overblijft is een stylingpunt: de link is alleen een hover-underline, dus niemand ziet hem. **Gevolg: het junk-merk `.` (L062) is vandaag al op te ruimen** — dat is een dataklusje, geen bouwtaak. |
| **"Import PDF is actief zonder bestand" / "Import as staging zonder merk"** | Beide inputs hebben `required` (`pdf-upload-card.tsx:503-509`, `upload-review-block.tsx:141-146`); de browser blokkeert de submit. Geen functionele bug, alleen een affordance-nit. |
| **`/brand/data` "alles rechts van de afgekapte kolom is onbereikbaar"** | `components/ui/table.tsx:7-10` wrapt elke tabel in `overflow-x-auto`; de inhoud is scrollbaar. Wat blijft: de ontbrekende scroll-affordance en dat álle spec-kolommen "—" zijn. |
| **"Quantity toont 'ea.', Zone/Match 100% leeg" als codedefect** | `spec-line-table.tsx:71-90` gebruikt bewuste null-placeholders (`{l.quantity ?? "ea."}`). Dit testdossier heeft simpelweg geen zones, aantallen of matches. De copy-opmerking over "ea." blijft; "lege kolommen verbergen" zou bij een gevuld dossier verkeerd uitpakken. |
| **"438 merken vs ~30" en "2 users vs 0 members" als tegenspraak** | Twee keer twee legitieme concepten. De catalogus-dropdown komt uit de `visible_products`-view — dat ís ijzeren regel 3 in werking. `/settings` = login-allowlist, `/admin/users` = org-memberships, en "0 orgs / 0 memberships" is de gedocumenteerde pre-week-3-toestand. Alleen de **labels** zijn fout, niet de cijfers. |
| **"Kandidaten zijn accessoires" als nieuwe vondst** | Bekend en belegd: `docs/probleem-variant-ranking.md`, met twee bestaande verdedigingen in `lib/matching/engine.ts:591` en de armatuur-boven-accessoire-ranking. Sprint 2.5 heeft er expliciet een vangrail "geen top-8-fix" op. Hoort daar, niet hier. Bovendien niet implementeerbaar zoals ik voorstelde: er is geen categorieveld. |
| **`/admin/users` "geen Invite member — doodlopend"** | By design alleen-lezen; gebruikers aanmaken is **week 3, item 3.1** (besluit C10). Nu bouwen eet week 3 op. |

### 0.3 Wat ik anders karakteriseer (de bevinding blijft, de diagnose verandert)
| # | Was | Wordt |
|---|---|---|
| Top-1 | "de link wordt aangeboden terwijl er geen pagina-afbeelding is; toon hem alleen bij OCR-import" | **De guard die ik voorstelde bestaat al.** `review-queue.tsx:405-441` rendert de beeldlink alleen als `hasPageImages !== false` en geeft anders een "View source text"-fallback (sinds `f02e382`, vóór het geauditeerde commit). Ik heb die tak gemist. Dat ik het live tóch 20× zag, betekent dat de check per **run** gaat (`lib/repo/review.ts:37`, een EXISTS over `ocr_page_images`) terwijl de route per **pagina + tile** zoekt (`lib/repo/ocr.ts:884`). Een run met beelden voor sommige pagina's passeert de check ook voor pagina's zonder beeld. → **Eerst diagnosticeren, dan de EXISTS op `page` correleren.** Niet de conditie herbouwen. |
| Top-3 | "`{nummer volgt}` is een onvervulde template-placeholder" | **Het is ontworpen gedrag**: FUNCTIONEEL-ONTWERP A-09 — de teller verhoogt pas bij uitsturen, en `lib/repo/estimate.test.ts:134-166` pint de string vast. De XIS-payload stuurt `quote_number: null`, niet de placeholder. Wat overblijft en klopt: een **Nederlandse string met accolades op een Engels klantstuk**, en Print/PDF/XIS zijn actief vóór er iets gegenereerd is. Zakt van "bug op een klantstuk" naar copy/i18n + een gating-vraag. Mijn fix-optie "nummer bij aanmaak reserveren" spreekt A-09 tegen en vervalt. |
| Top-8 (A12) | "zes schermen alleen via URL bereikbaar" | **Twee van de vijf kloppen.** `/data/loading` wordt gelinkt vanaf de "Loading signal"-tegel op `/analytics`; `versions` wordt gelinkt vanaf `work-prep`; de work-prep-**tab** bestaat wel maar is fase-conditioneel (`dossier-tabs.tsx:35-39`, met een code-comment dat een grijze disabled-tab bewust is afgewezen). Blijft staan: **`/settings/organization` heeft nul inkomende links**, en `versions` is voor een dossier in tender-stand onbereikbaar omdat de enige route ernaartoe via work-prep loopt. |
| work-prep "doodlopend" | "er staat niet hóe je op Won zet" | Overdreven: `ProjectStatusControls` staat via `app/projects/[id]/layout.tsx:65` op élke dossier-subpagina, dus rechtsboven op datzelfde scherm. Een verwijzing in de empty state is een nice-to-have. |
| A2 "geen uitlogknop" | "ontbreekt" | Preciezer: **niet ontsloten**. Better Auth's `POST /api/auth/sign-out` bestaat via de catch-all en `authClient.signOut()` is aanwezig maar heeft nul aanroepers. Het gat is de affordance, niet de functionaliteit. |
| A13 "grijze Saves lijken disabled" | "geef disabled een eigen behandeling" | Netter binnen de kit: **kit §6's secundaire knop (transparant, 2px blauwe rand) leeft al als `variant="outline"`**; `variant="secondary"` is een neutraal vlak dat bewust voor 21 bestaande plekken is behouden (comment in `button.tsx`). De twee bleke Saves hoeven dus alleen naar `outline` of `default` — geen nieuwe tokens, geen risico op de guard-test. |
| A5 breedtes | "drie breedtes, standaardiseer op `max-w-6xl`" | Het zijn **vijf** (`6xl`/`5xl`/`4xl`/`3xl` + `2xl`-binnenblokken). En `max-w-6xl` = 1152px terwijl **kit §5 "desktop max. 1280 px"** voorschrijft. Standaardiseren op 6xl is dus zélf een kit-afwijking → per DESIGN.md regel 2 een vraag aan Timo, geen vrije greep. |
| A4 "als sorteren nodig is: bouw sorteerknoppen" | fix-suggestie | Betwist vastgelegde principes: regelvolgorde = aanvraagvolgorde (C-11, afgedwongen in een comment in `lib/repo/review.ts:42`) en prijs sorteert nooit (ijzeren regel 2). Teksten schrappen is vrij; sorteerknoppen zijn een domeinbesluit. |
| A9 "één labelmap" | fix-suggestie | Gevaarlijk letterlijk: `lib/event-labels.ts` is een **bewuste losse kopie** zodat `components/analytics-view.tsx` byte-stabiel blijft (guardrail 1, fundament van 2.1). Juiste fix: die kopie uitbreiden. Delen met analytics = guardrail-schending én conflict met de parallelle sessie. |

### 0.4 Wat de audit miste
- **`/data/brand-relations/[brandId]/upload/[uploadId]`** — het upload-review-scherm van het
  retourpad (sprint 1.2): validatieresultaat, diff, goedkeuren. Een kernworkflow die volledig
  buiten de audit viel.
- `/admin/brands/[brandId]`, `/admin/brands/new`, `/data/enrichment/[runId]` — nooit bezocht.
- **Nergens een `loading.tsx`** (naast de ontbrekende `not-found.tsx`/`error.tsx` die ik wel zag).
  `/data/brand-relations` scant ~210k rijen en is bekend traag — die navigatie blokkeert zonder
  enige feedback.
- `/projects/[id]/import/[runId]/markdown` geeft **dezelfde kale "Niet gevonden"** als de
  ocr-image-route. Zelfde klasse, niet gemeld.
- **`Printen` staat op drie schermen**, niet twee: ook op het substitution-document.
- Een **derde datumformaat**: `substitution-doc` print een kale ISO-slice (`2026-07-30`), naast
  `30 jul, 12:24` en `09-07-2026`.
- **`addEvaluationLines` (`lib/repo/evaluation.ts:74`) heeft nul aanroepers** in `app/` én
  `scripts/`. De evaluatieset is alleen via de database te vullen. De doodloper zit dus een laag
  dieper dan ik schreef, en dat maakt de fix groter: er is geen bestaand pad om op aan te sluiten.

---

## 1. BAK 1 — Echte bugs (repareren, los van smaak)

Gerangschikt op impact/moeite. "Tests" = wat er meebeweegt.

| # | Bug | Oorzaak (origin/main) | Fix | Werk | Risico / tests |
|---|---|---|---|---|---|
| **1** | Geen `not-found.tsx`, geen `error.tsx`, geen `loading.tsx` in héél `app/`. Drie verschillende foutpagina's; een ongeldig id geeft **500** i.p.v. 404 | `app/data/brand-relations/[brandId]/page.tsx:44-58` voert de ruwe param in `eq(brands.id, …)` → Postgres uuid-cast gooit → onafgevangen. Zelfde klasse in `/admin/brands/[brandId]`, `/products/[id]`, enrichment `[runId]` | Root `not-found.tsx` + `error.tsx` in app-stijl met "Back to projects"; uuid-guard (het regexpatroon bestaat al in de ocr-image-route) → `notFound()` op ~5 pagina's; `loading.tsx` op de trage schermen | M (2–3 u) | Zeer laag; geen test pint de 500. **Hoogste blast-radius per uur** — elk URL-only scherm eindigt hier |
| **2** | Review-beeldlink 404't; landt op kale, ongestileerde Nederlandse tekst | Predicaat-mismatch: run-niveau EXISTS (`lib/repo/review.ts:37`) vs page+tile-lookup (`lib/repo/ocr.ts:884`). Link op `review-queue.tsx:424` | **Eerst** één productie-query (`select page, tile from ocr_page_images where import_run_id = …`) om te bevestigen; dan de EXISTS correleren op `page = spec_lines.source_page`, fallback naar de bestaande "View source text". De kale 404-pagina valt onder #1 | M (3–4 u incl. diagnose) | `components/dossier/review.test.tsx:344-365` pint href + label — fixture uitbreiden met de page-mismatch |
| **3** | Prijslijst-badge liegt: groen "valid" bij 0 producten; dode merken groen | `components/data/price-list-status.tsx:33-37` leidt `bucket` puur uit `validUntil` af; `productCount` staat op de row maar wordt niet gebruikt. `brands.lifecycle` bestaat (migratie 0013, al bewerkbaar op `/admin/brands`) maar wordt hier niet geselecteerd | Badge uit geldigheid **én** dekking: "Valid · 0 products" in amber (bestaande `status-amber`, geen nieuwe tokens); lifecycle-badge per rij. De layout-breuk van de verlopen rij rijdt mee | M (2–3 u) | `data-screens.test.tsx`, `price-list-expiry-notice.test.tsx`. **Raakt ijzeren regel 3** |
| **4** | `/data/evaluation` is een volledige doodloper: copy zegt "Click 'Measure hit-rate'" terwijl de knop `disabled` is, en er is **geen enkel UI-pad** om de set te vullen | `evaluation-panel.tsx:82-84,146-149`; `addEvaluationLines` zonder aanroepers | Nu: eerlijke empty state, meetformulier verbergen bij 0 regels (S). Het toevoegpad zelf is een ontwerpkeuze → bak 2 | S nu / L later | `data-screens.test.tsx` |
| **5** | Destructief in één klik zonder bevestiging | `spec-line-table.tsx:101-113` ("Remove line", ~40px van Open/Load; harde delete via `lib/repo/dossiers.ts:263`); `allowed-emails-block.tsx:56-73` | Confirm-dialog die het doel benoemt ("Remove line Lr001?"). **Het patroon bestaat al**: `components/ui/dialog.tsx`, precies zo gebruikt door `xis-push-dialog.tsx`. Eigen adres niet-verwijderbaar maken | M (3–4 u) | `settings.test.tsx`, dossier `screens.test.tsx`. *Correctie: het laatste adres is al beschermd (`canRemove = emails.length > 1`) en er ís een `aria-label` — de lock-out is dus kleiner dan ik schreef* |
| **6** | Offertekop op een klantdocument: Nederlandse string met accolades, en Print/PDF/XIS actief vóór generatie | `lib/repo/estimate.ts:128` (bewuste fallback, A-09) | Engels: "Number assigned on sending". Print/PDF gaten achter een "Complete the quote header"-staat zolang datum/geldigheid leeg zijn. **Het nummeringsbesluit zelf blijft** | S–M (2–3 u) | `estimate.test.tsx:20,231` + `lib/repo/estimate.test.ts:134-166` pinnen de Nederlandse string — die moeten mee |
| **7** | `/login` toont het inlogformulier aan een ingelogde gebruiker | `app/login/page.tsx` is een client-page zonder sessiecheck | Server-wrapper: sessie → `redirect("/projects")` | S (<1 u) | Geen |
| **8** | Ontwikkelaarsnamen in de UI: `beamAngle`/`dimmable`; ~40 ruwe event-identifiers; JSON in een tabelcel | **De labelmap bestaat al maar wordt niet gebruikt voor weergave**: `FIELD_LABELS` in `lib/matching/tolerances.ts:165-176` is niet geëxporteerd. Event: `ACTION_LABEL` heeft 21 entries, de codebase logt **86** acties; beide rendersites vallen terug op de ruwe key | `fieldLabel(key)` exporteren en gebruiken op 3 rendersites; `eventLabel(action)` in `lib/event-labels.ts` met snake_case→Sentence-case-fallback zodat nieuwe events nooit meer ruw lekken. Payload als key/value-lijst | M (2–3 u) | 2 schermen, 3 test-files. **Niet `analytics-view.tsx` aanraken** (byte-stabiel) |
| **9** | Nederlands op shipping-oppervlak | `Printen` op **drie** schermen (`print-button.tsx:15` + luminaire schedule + substitution); `Niet gevonden` in twee route-handlers; nl-NL maandafkorting in het event-log; derde datumformaat als ISO-slice in `substitution-doc` | Twee strings vertalen; één datumformatter (`lib/format.ts` bestaat). *`Bestand kiezen` is de **browser**, niet onze string — alleen op te lossen met een eigen file-control (→ bak 2)* | S (1–2 u) | Screenshots |
| **10** | Twee "Users" met tegenstrijdige labels; XIS-hulptekst spreekt zichzelf tegen; budgetuitsplitsing telt niet op | `admin/page.tsx:39` vs allowlist; `xis-block.tsx:58` conditioneel vs `:75` onconditioneel; `llm-budget-block.tsx:16-21` toont alleen `vangnet`+`ocr`, terwijl `leesroute`/`eval` stil in het totaal zitten | Herbenoemen naar "Login access" / "Organization members"; hulptekst conditioneel; "Other"-restpost | S (1–2 u) | `admin.test.tsx`, `settings.test.tsx` — copy-only |
| **11** | Ontbrekende inkomende links (de twee die overblijven) | `app/settings/page.tsx` heeft nul verwijzingen naar `organization`; `versions` loopt alleen via work-prep, dus onbereikbaar in tender-stand | "Organizations"-link op settings; "Version history" naast `Printen` op luminaire-schedule | S (1 u) | Screenshots |
| **12** | `/data/loading`: ruimtenamen als merk (`Divers`, `Vergaderruimte`, `Woonkamer`, `Toilet`) met alleen "Mark as loaded" — voor die rijen is er geen juiste actie | Parser-vervuiling; de lijst heeft geen afvoerpad | "Not a brand"-actie die de regel afvoert. *Losstaand van het loading-hub-besluit (§3)* | M (2–3 u) | Nieuwe test |

**Totaal bak 1: ~22–30 uur**, gedomineerd door test- en screenshot-churn, niet door productiecode
— deze repo pint copy string-exact vast. Batch de copy-items (#9, #10) zodat die belasting één
keer wordt betaald.

---

## 2. BAK 2 — UX/ontwerp: dit zijn jouw keuzes

Per punt: het besluit, twee opties, en mijn aanbeveling. Geen open vragen.

1. **Containerbreedte (A5).** Vijf breedtes in gebruik; kit §5 zegt "desktop max. 1280 px", en
   `max-w-6xl` = 1152. → (a) Alles naar **1280** (`max-w-7xl`), kit-conform, ~8 edits;
   (b) alles naar 1152 zoals de navbalk nu, en de kit-afwijking vastleggen als besluit.
   **Aanbeveling: (a)** — de kit is leidend (G23) en de tabelzware schermen hebben de breedte nodig.
   Dit is expliciet een kit-vraag aan jou, geen vrije greep.
2. **Reviewqueue-vorm.** 20 kaarten, instructie 20×, 20 donkere primaries, geen bulk, en de
   kaarten tonen de gelezen waarden niet. → (a) Dichte tabel + selectie + "Confirm selected",
   instructie één keer; (b) kaarten houden, maar de geparseerde waarden + paginabeeld per kaart
   en `Checked` naar secundair. **Aanbeveling: (a)** — maar let op: bulk-confirm verzwakt het
   per-regel-menselijk-oordeel (D-06). Dit is echt jouw call.
3. **Prijs-prominentie versus ijzeren regel 2 (A16).** → (a) Prijs naar bodyformaat, de
   match-onderbouwing wordt het luide element; (b) prijs prominent houden en een matchkolom
   ernaast. **Aanbeveling: (a)** — de logica is prijsblind, het oog nu niet.
4. **`must`/`wanna`/`nice`.** → (a) Hernoemen naar `Required/Requested/Optional`; (b) enum laten
   staan, alleen de weergavelabels mappen. **Aanbeveling: (b)** — zelfde zichtbare resultaat,
   nul schema-risico.
5. **`Set to Red` / `Set to Purple` (A15).** O13 bevriest hues, badge-labels en het geprinte
   `word`; knop-**werkwoorden** vallen daarbuiten (alle drie agents zijn het daarover eens). →
   (a) Actiegericht labelen ("Report back to customer", "Mark as outside assortment"), badge blijft
   de kleurnaam; (b) laten zoals het is. **Aanbeveling: (a)**, expliciet als O13-grensvraag.
6. **Empty-state-systeem (A6/A7).** Twaalf callsites, vijf dialecten, geen shared component. →
   (a) Eén `<EmptyState title description action>` (promoveer de work-prep-variant) + formulier
   ín de empty state bij leeg; (b) alleen de twee ergste gevallen fixen.
   **Aanbeveling: (a)** — dit is de staat die een nieuwe gebruiker het vaakst ziet.
7. **Knophiërarchie (A13).** → (a) Regel "één primary per scherm = zwaarste gevolg" invoeren en
   sweepen; de twee bleke Saves naar `outline` (= kit §6's secundaire knop, bestaat al) of
   `default`; (b) alleen de disabled-versus-secundair-verwarring wegnemen.
   **Aanbeveling: (a)** — kost ~8 callsites en geen tokens.
8. **`/projects`.** Nieuw-project-formulier claimt permanent een kolom; geen datum/zoeken/sorteren;
   hover is 1,6% luminantie; de bolletjes-legenda zit alleen in `title`-attributen. →
   (a) Knop-opent-dialog + "Last edited" + zoekveld + volle `hover:bg-muted` + one-line legenda;
   (b) alleen hover en legenda. **Aanbeveling: (a)**; hover en legenda zijn los ook veilig.
9. **Waar komt "Add to evaluation set" te wonen** (hoort bij bug #4)? → (a) Actie op het
   regeldetail; (b) CSV-paste op `/data/evaluation`. **Aanbeveling: (a)** — echte spec-regels zijn
   het doel van de set.
10. **`/data/brand-relations`.** 438 live `<select>`s, geen save, geen paginering. →
    (a) Badge-die-op-klik-editeert + bulkactie + paginering; (b) selects houden, alleen paginering.
    **Aanbeveling: (a)**, maar het is een rebuild van de rij — jouw prioriteitscall.
11. **Brand portal in de interne balk.** `app/brand/page.tsx:9-17` accepteert al `?brand=<id>` en
    valt anders terug op het alfabetisch eerste merk. Dit is **letterlijk Beslissing 3 van de
    IA-notitie** en dus open. → (a) Eerlijke "View as brand: [select]"-banner (de rol-kaart noemt
    intern al "preview"); (b) uit de interne nav tot week 3. **Aanbeveling: (a)**.
12. **Beleidsteksten (A4).** Schrappen is vrij; de toon is jouw keuze. → (a) Duplicaten weg,
    de drie die echt beleid dragen naar één tooltip op het beslismoment; (b) alles weg.
    **Aanbeveling: (a)**. Let op: ~13 plekken en de tests pinnen de copy — één batch.
13. **Native file-inputs.** Eigen file-control bouwen of browser-chrome accepteren?
    **Aanbeveling: accepteren**, meenemen in de 2.0b-designpas.

---

## 3. BAK 3 — Hoort bij gepland werk (benoemen, niet oppakken)

- **De 265px horizontale schuif op 375px → week 3 / G21.** Bevestigd in
  `docs/rol-schermen-kaart-2.0a.md` en in het sprintplan, dat "de navbalk loopt over op 375px"
  letterlijk als 2.0a-probleem noemt; HANDOVER heeft hem al als gemeten bevinding met baseline-PNG
  ("IA-werk, geen huisstijlwerk"). **Niet hier oplossen.** Bewijsmateriaal voor dat item:
  > Bij viewport 375 is `document.body.scrollWidth` = **640** en `header.scrollWidth` = **640**;
  > zowel de `nav` als zijn wrapper computen `overflow-x: visible`, dus het hele document pant
  > in plaats van dat de balk intern scrollt. "Admin" eindigt op x=640. Vier van de acht items
  > (Analytics, Settings, Brand portal, Admin) zijn onbereikbaar; "Brand relations" breekt over
  > twee regels waardoor de balk 145px hoog wordt. Bijkomend: de tabellen hebben zelf nette
  > `overflow-x: auto`-wrappers, die nu vechten met de paginabrede scroll — twee horizontale
  > scrollrichtingen tegelijk.
- **Dark-mode-toggle → jouw productbesluit.** Geverifieerd: compleet `.dark`-tokenblok +
  `@custom-variant` in `globals.css`, geen `prefers-color-scheme`, geen ThemeProvider, geen toggle
  buiten `*.test.tsx`. Geforceerd rendert het correct (O10 klopt: wit vlak, navy tekst).
  **Procesgevolg dat hoe dan ook een keuze vraagt:** elke sprint maakt light/dark-screenshotparen
  van een stand die geen gebruiker kan bereiken — óf de toggle komt (het werk is al gedaan, de
  goedkoopste winst in het rapport), óf we noemen de dark-screenshots bewust
  regressie-verzekering. **Timing:** de toggle landt in exact de navbalk die 2.0a herbouwt — samen
  doen, of merge-schuld accepteren.
- **`/data/loading` als zesde hub-kaart → besluit van 30 juli.** `rol-schermen-kaart-2.0a.md`:
  "blijft technisch bestaan; **niet in de hub-kaarten**". Bovendien stelt IA-notitie Beslissing 5
  voor om `/data/loading` + `/admin/imports` samen te voegen tot één Import-ingang. Een zesde
  kaart bouwen contradiceert het besluit én loopt op knoop 5 vooruit. Alleen doen als je zegt
  "ik betwist dit". *De datavervuiling op dat scherm (bug #12) staat hier los van.*
- **`/analytics` (5× "To be determined") → parallelle sessie.** `app/analytics/**`,
  `lib/repo/analytics.ts`, `lib/repo/events.ts`, `components/analytics/**`. Alleen melden.
  **Conflict om te weten:** event-log-**filters** vereisen nieuwe queries in `lib/repo/events.ts`
  — dat bestand is van hen. De label-fix (bug #8) heeft dat niet nodig.
- **`/brand/price-lists` echt uploadveld → uitloop 4.B** ("eerste schrap, besluit 8"). Alleen het
  eerlijk hernoemen ("Announce a price list") is nu vrij.
- **Gebruikers aanmaken/koppelen → week 3, item 3.1** (besluit C10).
- **Accessoires in de kandidatenlijst → sprint 2.5 variant-ranking**, met de vangrail "geen
  top-8-fix".
- **O2 (Geist i.p.v. Inter) → gepland voor 2.0a.** Mijn audit heeft typografie niet beoordeeld;
  dat staat al open.

---

## 4. Herziene top-5 (na correctie)

1. **Foutpagina's + uuid-guard + `loading.tsx`** (bug #1) — grootste effect per uur, en elk
   URL-only scherm eindigt daar.
2. **Review-beeldlink diagnosticeren en per pagina correleren** (bug #2) — kern van de
   importbelofte. Was #1; nu met de juiste diagnose.
3. **Prijslijst-badge liegt bij 0 producten** (bug #3) — raakt ijzeren regel 3.
4. **Uitloggen/account-affordance ontsluiten** (A2) — kleine ingreep, maar coördineren met 2.0a.
5. **`/data/evaluation`-doodloper** (bug #4) — een scherm dat je vraagt te klikken op wat niet kan.

De mobiele overloop was mijn #2 en is nog steeds de sterkste losse bevinding, maar hij was al
bekend, gemeten en belegd bij week 3 — daarom staat hij in bak 3 en niet hier.

---

## 5. Hoe fase 2 zou lopen (pas na jouw keuze)

Eén hoofdagent verdeelt; per bevinding of per cluster met dezelfde oorzaak een **aparte commit**.
Elk stuk werk wordt door een **andere** agent gecontroleerd; vindt die iets fout, dan volgt een
tweede verificatie vóór het terug de bouw in gaat, en het herstel doet weer een **andere** agent
dan die de fout maakte.

Vaste kaders die ik meeneem: niet aan de O13-statustokens, niet aan O8/O9/O10/O11/O12, violet en
magenta worden nooit een CSS-token (`components/huisstijl.test.tsx` blijft groen), en de
analytics-bestanden blijven onaangeroerd. `bun install` staat, dus de DB-tests zijn te vertrouwen;
screenshots per testbestand geïsoleerd regenereren (een volle run levert stil blanco PNG's), en
`brand-message`/`brand-admin`/`custom-fields` los draaien.

**Wat ik van jou nodig heb:** welke bak-1-nummers in scope zijn, en welke bak-2-besluiten je nu
neemt. Niets daarvan is gestart.
