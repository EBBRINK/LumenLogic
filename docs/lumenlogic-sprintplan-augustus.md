# Lumen Logic — technische aanvulling op het sprintplan

> ## ⚠️ Dit document is NIET het plan.
>
> **Het plan staat in de vault:** `timo-vault/projects/lumenlogic/sprintplan.md`
> (volledig pad: `/Users/timowittkamp/Documents/AIgenstate/timo-vault/projects/lumenlogic/sprintplan.md`).
> Vijf werkweken, **klaar op 14 augustus 2026**. Dáár staan scope, weekindeling en deadlines;
> die versie is leidend — ook boven de klant-PDF ernaast.
>
> Dit document bevat alleen de **technische laag** die de vault bewust niet heeft: de
> Definition of Done, het beslissingslog en de acceptatiecriteria per item — gerankerd op de
> vijf weken uit de vault.
>
> _Herschreven 16 juli 2026. De vorige versie was een tweede, verouderd sprintplan (sprints 0–4
> t/m 28 aug); meerdere sessies hebben er aantoonbaar uit gewerkt vóór dat ontdekt werd. De
> bestandsnaam "-augustus" is historisch en bewust behouden omdat parallelle sessies en
> `docs/sprint0-externe-aanvragen.md` ernaar verwijzen._

## De vijf weken (uit de vault — hier alleen ter oriëntatie)

| Week | Periode | Doel |
|---|---|---|
| Deze week | 15–17 jul | De estimate helemaal af |
| Week 1 | 20–24 jul | De merkgegevens stromen binnen |
| Week 2 | 27–31 jul | Alle losse dingen afwerken |
| Week 3 | 3–7 aug | De eerste klanten van buiten kunnen erin |
| Week 4 | 10–14 aug | Alles op naam van Brink |

**Einddemo: maandag 17 augustus** — dat ís het "runbook blind volgen", door Brink zelf zonder
hulp (besluit C9). Geen aparte afspraak nodig. Timo daarna twee weken vakantie.

**Brink ligt stil 3–7 aug (bouwvak); Timo werkt door** (besluit C7). Geen blocker: week 3
levert een mogelijkheid op, geen afhankelijkheid van Brink-mensen.

## Capaciteit (80/20-regel, elke week)

24 u/week → **~19 u aan het weekdoel, ~5 u buffer** (bugs, support Eduard, technische schuld,
onvoorzien). Items zijn op die 19 u gedimensioneerd; de buffer wordt nooit vooraf ingepland.
Deze week loopt wo–vr (3 dagen, ~14 u → ~11,5 u doel + ~2,5 u buffer).

---

## Definition of Done (geldt voor élk item, élke week)

Een item is pas "done" als **alles** hieronder waar is:

- [ ] `bun vitest run` groen, incl. RSC-screenshottests van gewijzigde schermen in **licht én donker**.
- [ ] `bunx tsc --noEmit` schoon.
- [ ] Gecommit en **gepusht naar GitHub** — niets blijft lokaal staan (les 0007/0008).
- [ ] Gedeployed naar productie (`vercel --prod`), migraties op Neon toegepast.
- [ ] **Handmatig geverifieerd in de live app** (het echte scherm, niet alleen tests).
- [ ] `HANDOVER.md` bijgewerkt (wat, aannames, open punten).
- [ ] Events gelogd waar het item gedrag toevoegt (ijzeren regel 5).

---

## Beslissingslog — de keuzes die het werk bepalen

### Uit de grill-sessie (2026-07-15)

| # | Besluit | Consequentie |
|---|---|---|
| 1 | **Retour-pad merkdata = upload → controle → goedkeuren**; nooit stil wegschrijven | Week 1 bouwt de motor éénmalig; week 4-uitloop hergebruikt hem |
| 2 | **Analytics in 3 smaken op één eventlaag**: intern breed, merk-demo nu, architect op papier | Week 2; aanvullende widgets expliciet schrapbaar |
| 3 | **Specs-eerst zoeken** naast merk-eerst; ordening objectief, nooit commercieel | Week 4-uitloop A — start eerder bij meevallers |
| 4 | **Geen-data = grijze vlag**, nooit stilzwijgend uitsluiten | In catalogus-item én analytics ("nog geen data"-states) |
| 5 | **Géén foto's/beeldmateriaal** | Nergens ingepland; scope-bewaker |
| 6 | *(herzien 2026-07-16)* **Géén mailverzending vanuit Lumen Logic deze sprintperiode** (t/m aug); Resend/DNS-aanvraag vervalt | Week 3-onboarding moet vóór week 3 herzien worden — alternatief mechanisme zonder e-mail **nog te bepalen** |
| 7 | **Outreach = klaarzetten + kopiëren** (geen bulk-mail vanuit de tool) | Week 1 bouwt geen mailverzending voor outreach |
| 8 | **Merkportaal-self-serve = laatste schrapkandidaat-item** | Week 4-uitloop B, ná catalogus |
| 9 | **Overdracht = volwaardig weekdoel** ("nooit meer bij Timo hoeven komen") | Week 4 + spike in week 2 + GitHub-transfer al in week 3-buffer |
| 10 | **Fase 0 extern: géén prijzen** voor externe accounts | Week 3, eigen item (raakt estimate-scherm + PDF-sjabloon) |
| 11 | **Externe toegang via minimale route-allowlist** (projecten + catalogus; rest geblokkeerd) als hoofdontwerp, niet als terugval | Houdt week 3 behapbaar; verfijning ná augustus |
| 12 | **Anonimiseringsgrens gekwantificeerd**: merk-cijfers alleen bij **≥ 5 events/week** per product | Toetsbaar criterium in week 2 |

### Uit de 0.4-werksessie (2026-07-16) — deel-C-vragen beantwoord

| # | Besluit | Consequentie |
|---|---|---|
| C1 | **XIS-lead-trigger** = zodra de *installateur de estimate bekijkt of downloadt* (eerste teken van interesse) — niet bij aanmaken, niet bij versturen. Beginfase handmatig (keys liggen bij Lynx, #107781) | ⚠️ **Bouwgevolg:** er is nog géén "estimate bekeken/gedownload"-event. Dat moet gebouwd worden vóór de trigger kan werken |
| C2 | **Locatie blijft een tekstveld** per regel ("begane grond, entreehal") | Plattegrond uploaden + lampen erop prikken = **wens voor later**, expliciet níét vóór 14 aug. Alleen oppakken bij tijd over |
| C3 | **Statusovergangen automatisch** bij het versturen van een estimate; handmatig corrigeren achteraf blijft mogelijk | Bestaand `setStatus`-pad; geen nieuw ontwerp nodig |
| C4 | **Een gearchiveerd project moet weer te heropenen zijn** | Aftersales-functies (nazorg, revisies, herbestellen) komen nu **niet** |
| C5 | **Externe onboarding op uitnodiging**; magic-link-allowlist blijft. Zelf registreren pas veel later | Combineert met besluit 6: uitnodigen blijft, maar het *transport* van de uitnodiging is een open ontwerpvraag |
| C6 | **Prijzen**: nu is alles intern → iedereen mag prijzen zien. Week 3-bouwstand blijft "externen zien geen prijzen". De échte grens wordt pas een besluit zodra Timo daadwerkelijk een externe groep aanmaakt | Bouw week 3 op de plan-stand; niet wachten op de grens |
| C7 | **Bouwvak**: Brink ligt stil 3–7 aug, **Timo werkt door** | Geen weekverschuiving |
| C8 | **Brink-accounts** moeten nog aangemaakt worden (Timo, later). Vercel/Neon/GitHub/Supabase bestaan al en gaan bij de overdracht over | Harde voorwaarde vóór week 4 |
| C9 | **Einddemo 17 aug**; runbook-blind-volgen ís de slotdemo | Geen aparte afspraak inplannen |

### Openstaand — géén besluit (bewust)

- **Wie wordt beheerder?** Aanname: Eduard, die vervolgens anderen toegang geeft. **Moet door
  Eduard bevestigd worden.** Bewust niet als besluit vastgelegd.
- **Onboarding-mechanisme zonder e-mail** (gevolg van besluit 6) — te bepalen vóór week 3.

---

## Vastgestelde technische feiten (niet opnieuw ter discussie stellen)

Live gemeten in sprint 0.1 (16 jul 2026). Hier vastgelegd zodat weerlegde risico's niet
terugkeren als bouwklus.

- **`after()` werkt op Vercel — het maxDuration-risico is weerlegd.** De import was klaar om
  08:56:59.708; het vangnet draaide daarná nog **54 s** door (14 `search`-events, actor
  `ai:vangnet`) en sloot af om 08:57:53.808, 7 ms na de laatste LLM-call. Geen
  `FUNCTION_INVOCATION_TIMEOUT`, geen afgekapte run. **Er is géén `maxDuration`-export en géén
  `vercel.json` nodig** — voer dat niet op als klus. (Projectdefault: functielimiet 300 s,
  Fluid compute aan.)
- **`llm_usage` kent géén omgevingskolom en dev = prod** (één Neon-DB, besluit B1). Gevolg:
  een lokale `bun dev`-run schrijft in dezelfde tabel en telt mee tegen de **productie**-maandcap.
  De 31 OCR-rijen van 15 jul (€0,1022) kwamen aantoonbaar uit een lokale run, niet uit productie.
  **Wie kosten aan productie toerekent op basis van `llm_usage` alleen, zit fout.**
- **De maandcap is gedeeld** tussen OCR en vangnet; `getLlmSpendForPurpose` bestaat al voor een
  uitsplitsing. Zie item 2.5.

---

## Acceptatiecriteria per week

### Deze week (15–17 jul) — de estimate helemaal af

**Klaar wanneer** (vault): upload → verstuurbare PDF werkt zonder haperen, **én het plan is akkoord**.

**0.1 — AI-vangnet live** (~2 u) — 🔄 **hoofddoel gehaald 16 jul; één restitem open (0.1b)**
- ✅ *Given* `ANTHROPIC_API_KEY` in `.env.local` én als Vercel-env, *when* het test-armaturenboek in productie wordt geïmporteerd, *then* draait het vangnet over de restregels ~~verschijnen AI-suggesties in review~~, en is er géén `ai_vangnet_skipped_no_key`-event meer maar wél vangnet-events met kosten in `llm_usage`.
  **Bewijs** (onafhankelijk geverifieerd tegen de live DB, 16 jul): event `ai_vangnet_run` met `checked: 7, suggested: 0, phase: tender` op dossier `49c6340e-83d8-45c7-84d9-64fe1f48cb88` ("ZZ-TEST 0.1 vangnet 16-07"), deploy-SHA `966191f`, 08:56–08:58 UTC · 21 calls / **€0,0619** met `purpose='vangnet'` · nul `ai_vangnet_skipped_no_key` · statussen ongemoeid.
- ✅ *Given* het budget in de instellingen, *when* de teller de cap nadert (test met tijdelijk lage cap), *then* stopt het vangnet met een budgetstop-event.
  **Bewijs**: cap tijdelijk op €0,01 → `ai_vangnet_skipped_budget` (`budgetEur 0.01, spendEur 0.1022`), kosten €0. Cap staat permanent op **€10/maand** (`app_settings.llm_budget_eur = 10`).
- ⬜ **0.1b — het suggestiepad aantoonbaar maken** (~1 u, ~€0,05) — *besluit Timo 16 jul.*
  Het vangnet gaf **0 suggesties** (legitiem: in tender zoekt het alleen het gevraagde merk, en de catalogus voerde dat niet). Daarmee is het schrijven van een `ai_suggestions`-rij én het tonen ervan op `/projects/[id]/review` **in productie nooit end-to-end gezien** — de acceptatietest dekt dat pad wel, maar met een *gemockte* client.
  - *Given* een project waarvan de catalogus het gevraagde merk wél voert, *when* een hermatch draait, *then* staat er minstens één echte `ai_suggestions`-rij in de DB én zichtbaar op de review-pagina in productie.
  - **0.1 wordt pas afgevinkt als dit gezien is.** Reden: het verschil tussen mock-respons en echte Anthropic-respons is precies waar dit soort paden breekt, en het weekresultaat belooft een demo met zichtbare suggesties.
- Briefing + geverifieerde stand: `docs/sprint0-1-ai-vangnet-live.md`; uitkomst in `HANDOVER.md` (entry 2026-07-16).
- **Opruimen ná 0.1b:** testproject `49c6340e` ("ZZ-TEST 0.1 vangnet 16-07") staat nog in productie als bewijsspoor. Weghalen zodra 0.1 is afgevinkt — `scripts/cleanup-testdata.ts`. (~5 min)
- *Meegekomen in 0.1, los gecommit (al gepusht):* `step="0.01"` op het budgetveld (`4c3a849`) · budget 0 = echt plafond i.p.v. "geen cap" (`7071038`) · de permanente 301 `/dossiers` → `/projecten` wees naar een niet-bestaande route, nu `/projects` (`966191f`).

**0.2 — Repo synchroon** (~4,5 u) — ✅ **afgerond 15 jul** (PR #3). Zie `docs/sprint0-2-notitie-aan-parallelle-sessies.md`.

**0.3 — Externe aanvragen de deur uit** (~3 u) — ✅ **afgerond 16 jul**; tracking in `docs/sprint0-externe-aanvragen.md`.
- ~~(a) Resend-account + DNS-records~~ — *vervallen (besluit 6): geen mailverzending deze sprintperiode.*
- (b) evaluatieset-uitvraag ligt bij de binnendienst — loopt bij Jayden.
- (c) XIS-attributenlijst ingediend bij Lynx, taak #107781 — Menno's team maakt de API-keys aan.
- (d) Supabase-rename afgerond; bevestigd dat Supabase niet meer gebruikt wordt (app draait op Neon) — geen impact.

**0.4 — Open vragen beantwoord & vastgelegd** (~2 u) — deel-C-besluiten hierboven vastgelegd. Testdata-check gedaan: Van Dijk weg (org, users, allowlist) en Flos op tier-1, geverifieerd via `bun run cleanup:testdata` (dry-run: "Niets te doen").
- Rest: §C wegschrijven in `docs/lumenlogic-projecten-volledig.md` (incl. het dwalende afsluitende codeblok opruimen) + de beheerder-vraag terug naar Eduard.

### Week 1 (20–24 jul) — de merkgegevens stromen binnen

**Klaar wanneer** (vault): één echt merk is van begin tot eind door de route gegaan.
**Harde voorwaarde:** migratie 0007 gecommit en op Neon — ✅ gehaald (0.2).

**1.1 — Format-validatiemodule (herbruikbare motor)** (~5 u)
- *Given* een geüpload .xlsx, *when* het niet ons template-format is (kolomkoppen/sheet ontbreken), *then* een duidelijke afwijzing "dit is niet ons format" met wat er mist — er wordt níéts opgeslagen.
- *Given* een correct format met inhoudelijke twijfels (lege must-velden, onbekende artikelcodes, dubbele rijen), *then* per rij dubbelcheck-waarschuwingen.
- Module is een losse lib-functie + tests, zodat week 4-uitloop B hem ongewijzigd hergebruikt.

**1.2 — Retour-pad: upload → voorstel → goedkeuren** (~9 u)
- *Given* een merkrelatie-pagina, *when* Brink een ingevulde template uploadt die de validatie passeert, *then* toont een voorstel-scherm per veld: **nieuw gevuld / gewijzigd (oud→nieuw) / conflict** — niets staat dan al in de database.
- *Given* het voorstel-scherm, *when* Brink goedkeurt, *then* worden wijzigingen toegepast, events gelogd, en gaat de relatiestatus naar `data_ontvangen`/`verwerkt`; *when* afgewezen, *then* verandert er niets.
- Conflictregel (vooraf vastgelegd): bestaand veld wint, tenzij expliciet aangevinkt.
- ⚠️ **Hier hoort het aansluiten van `price-archive`**: `archivePriceList`/`replacePriceList` in `lib/repo/price-archive.ts` bestaan en zijn getest, maar worden **nergens aangeroepen** — oude prijsregels worden nu niet gearchiveerd. Beoogde stroom: `docs/plan-datamodel-productspecs.md` §"Prijslijst-historie".

**1.3 — Merkenbeheer als hoofdingang** (~4 u)
- *Given* de hoofdnavigatie, *when* een Brink-gebruiker "Merken" kiest, *then* opent het merkrelatie-overzicht (status, prijslijst-indicator, mini-scorecard) met kruislink naar de disclosure-tiers (toestemmings-as ≠ compleetheids-as).
- *Given* het overzicht, *when* gefilterd op "moet nog een mail" (status + `lastContactAt`), *then* toont de lijst precies de merken zonder recent contact — de outreach-werklijst.

**1.4 — End-to-end verificatie met één echt merk** (~1 u)
- *Given* één merk (via Eduard of zelf-ingevuld), *when* de hele loop draait (template kopiëren → ingevuld terug → upload → voorstel → goedkeuren), *then* is de nieuwe data zichtbaar in **scorecard én catalogus** (de 0007-kolommen tellen aantoonbaar mee) met volledig audit-spoor in events.

**Risico's & plan B:** voorstel-diff complexer dan gedacht → conflictregel ligt vast, slimmer merge-gedrag = ná augustus · geen echt ingevulde template op tijd → 1.4 met zelf-ingevulde template, echte-merk-verificatie naar week 2-buffer.

**Technische schuld (bufferuren, ~5 u):** Drizzle-snapshot-gat vanaf 0004 bijwerken (timebox 2 u; anders gedocumenteerd naar het runbook).

### Week 2 (27–31 jul) — alle losse dingen afwerken

**Klaar wanneer** (vault): belangrijkste vragen met echte cijfers beantwoord, lijst met kleine punten leeg, geheel oogt af.

**2.1a — Interne analytics: de kern (5 widgets)** (~8 u)
- *Given* /analytics (alleen Brink-intern), *when* een periode is gekozen (per week filterbaar), *then* beantwoordt de pagina op echte events: **top-overwogen producten · trends per week · datagaten & dekking** (zoek-zonder-resultaat + blauw-wachtrij per merk) · **afwijzingsredenen-top-10 · projectfunnel** (concept→estimate→offerte→gegund/niet).
- *Given* een blok zonder data, *then* toont het "nog geen data" — nooit een lege of brekende widget.
- *Given* de query-laag, *then* is elke widget org-scoped opgezet (parameter; intern = alles), zodat week 3 externen zonder herbouw kan scopen.

**2.2 — Merk-demo-pagina (versmald)** (~5 u)
- Omvat het **aanmaken van een demo-merkaccount** en een pagina in `/merk/*` met scoping in fase 0 hard gekoppeld aan dat ene merk (generieke accounttype-afscherming komt in week 3).
- *Given* het demo-merkaccount, *when* het zijn analytics opent, *then* uitsluitend geaggregeerde eigen-productcijfers uit `mv_brand_considerations`, en **alleen voor producten met ≥ 5 events/week** (besluit 12) — nooit projectnamen, gebruikers of andere merken (met test).
- *Given* de materialized view, *then* een refresh-knop + "laatst ververst"-timestamp.

**2.3 — SPIKE: account-migratie naar Brink (timebox 3 u, alleen uitzoeken)**
- *Given* de Brink-accountgegevens (besluit C8), *when* de spike klaar is, *then* ligt er een één-pagina-migratiedraaiboek: per dienst (Vercel, Neon, GitHub, Supabase, domein/DNS) de exacte stappen, **wat zonder downtime kan**, welke env-keys/DNS geraakt worden, volgorde + terugvalstap. Géén migratie uitvoeren.

**2.4 — Ontwerp-notitie architect-analytics (papier)** (~2 u)
- *Given* de derde smaak (specifiers: duurzaamheid vs. prijs op eigen projecten), *then* één pagina in `docs/` (events, views, schermontwerp), gemarkeerd "bouwen ná augustus".

**2.5 — LLM-budget & OCR-hygiëne (oogst uit sprint 0.1)** (~3 u)
Acht punten die 0.1 vond en bewust niet fixte. Geen ervan blokkeert het vangnet; ze zijn
uitgeschreven in `HANDOVER.md` §"Open punten uit sprint 0.1". Twee ervan zijn UI's die
**liegen** — die gaan voor.
- *Given* een maandcap-stop tijdens OCR, *when* de UI de reden toont, *then* zegt hij de waarheid — nu staat er hardcoded "het €1-boek-budget is op" (`app/projects/actions.ts:310-311` plet beide redenen tot één string + `components/dossier/pdf-upload-card.tsx:158-160`). Het event in de DB heeft het wél goed. (~0,5 u)
- *Given* budget `0` in de instellingen, *then* toont de UI dat als een hard plafond — nu zegt `components/settings/llm-budget-block.tsx:24` "No monthly cap set", precies het tegenovergestelde van wat `7071038` afdwingt. (~0,25 u)
- *Given* budget `0`, *then* dekt een test het gedrag — nu nergens: `vangnet.test.ts` gebruikt cap `1`, `ocr.test.ts` `0.5`, `settings.test.tsx` rendert `20`/`50`/`null`, nooit `0`. De fix is alleen met code-inspectie geverifieerd en staat regressie-onbeschermd. (~0,5 u)
- *Given* een OCR-run die op budget stopte (`ocrStatus = gestopt`), *when* de cap omhoog gaat, *then* is hervatten mogelijk — nu is die toestand **terminaal** (hervatten kan alleen bij `bezig`). (~1 u)
- *Given* `getLlmSpend`, *then* rekent `startOfMonth` in **UTC** — nu lokale tijdzone, latente bug in de eerste uren van een maand op Vercel. (~0,25 u)
- **Keuze nodig:** de maandcap is **gedeeld** tussen OCR en vangnet, dus OCR kan het vangnet wegdrukken. `getLlmSpendForPurpose` bestaat al voor een uitsplitsing. Splitsen of gedeeld laten? (~0,5 u als we splitsen)
- Opruimen: **`VANGNET_MAX_MS` (120 s) is dood beleid** onder `after()` — het is een zachte grens *tussen* regels; de live run haalde 52 s voor 7 regels, één regel kan theoretisch ~360 s duren. Plus **stale comments in `lib/ai/vangnet.ts`** die nog beweren dat de run "awaited in de import-respons" wordt. (~0,25 u, → bufferuren)

**2.U — UITLOOP (schrapbaar): aanvullende widgets** (~4 u)
- Gebruik per gebruiker/org · hit-rate-ontwikkeling · prijslijst-gezondheid · scorecard-voortgang. Zelfde acceptatiecriteria als 2.1a. Niet af = naar week 3-buffer.

> ⚠️ **Week 2 is met 2.5 erbij overboekt**: 2.1a (8) + 2.2 (5) + 2.3 (3) + 2.4 (2) + 2.5 (3) =
> **21 u** op een doel van ~19 u. **2.U is daarmee de eerste schrap** (was al schrapbaar), en het
> opruimwerk uit 2.5 (`VANGNET_MAX_MS`, stale comments) hoort in de bufferuren. Loopt het uit:
> 2.5 splitsen — de twee liegende UI's zijn het enige deel dat echt niet kan blijven staan.

**Risico's & plan B:** te weinig echte events voor een demo → demo-seed met duidelijk gemarkeerde synthetische events · MV-verversing traag → refresh-knop volstaat in fase 0 · spike ontdekt lock-in (bv. Neon-ownership) → juist de winst: plan B in het draaiboek, week 4 begint zonder verrassing.

**Technische schuld (bufferuren):** uuid-cast/`payload`-guards in analytics-queries (één afwijkend event mag de pagina nooit breken) · opruimwerk uit 2.5 (`VANGNET_MAX_MS`, stale comments in `lib/ai/vangnet.ts`) · restjes week 1.

### Week 3 (3–7 aug) — de eerste klanten van buiten kunnen erin

**Klaar wanneer** (vault, herzien 16 jul): de *mogelijkheid* staat er, aangetoond met een
**testaccount** dat het hele rondje zelfstandig doorloopt. Uitdrukkelijk **niet**: een echte
installateur die er die week doorheen loopt. Zelfde logica als week 1 — je bouwt dát
merkgegevens binnen kunnen stromen, niet dat een merk het die week ook doet.

**3.1 — Onboarding externen** (~8 u) — ⚠️ **HERZIENING NODIG vóór deze week start.**
Het oorspronkelijke item ging volledig uit van Resend/e-mail (magic link per mail +
uitnodigingsmail). Besluit 6 schrapt mailverzending; besluit C5 houdt "op uitnodiging +
allowlist" overeind. Het **transport** van de uitnodiging is daarmee een open ontwerpvraag —
denkrichtingen: link handmatig delen, of het account aanmaken via de serverconsole zoals nu
ook al met magic links gebeurt. Acceptatiecriteria volgen zodra het mechanisme gekozen is.
**Zonder die keuze is dit item niet uitvoerbaar.**

**3.2a — Externe toegang: route-allowlist + org-scoping** (~7 u)
- *Given* een extern account, *when* het de app gebruikt, *then* zijn alléén projecten (eigen organisatie) en catalogus bereikbaar; alle andere routes (/data, /admin, Merken, interne /analytics) worden **server-side** geweigerd (besluit 11), met tests per accounttype.
- *Given* de project-queries, *then* zijn lijst, detail, regels, review, estimate en importruns org-gescoped — een extern account kan geen enkel object van een andere org opvragen (directe-URL-test).
- *Given* de rechten, *then* admin ≠ gewone gebruiker (instellingen/uitnodigen alleen admin).

**3.2b — Prijsloze estimate voor externen** (~4 u)
- *Given* fase 0, *when* een extern account een estimate opent of de PDF downloadt, *then* bevatten scherm én PDF **géén prijzen/bedragen/totalen** — wel regels, aantallen, statussen en kleuren (eigen render-pad + sjabloonvariant, met screenshottest); intern blijft alles zichtbaar.

**3.3 — (alleen als XIS-keys binnen zijn) Lead-seintje** (optioneel)
- *Given* de Lynx-keys, *when* de installateur **de estimate bekijkt of downloadt** (trigger, besluit C1), *then* schiet er idempotent een lead in XIS.
- ⚠️ **Vóórwerk:** het "estimate bekeken/gedownload"-event bestaat nog niet en moet gebouwd worden vóór deze trigger kan werken. Geen keys → export-stub blijft, geen weekrisico; beginfase mag handmatig.

**Risico's & plan B:** onboarding-mechanisme niet op tijd gekozen → **grootste risico van het plan**; besluit 6 heeft het oude pad geschrapt zonder vervanging, dus bepaal het mechanisme uiterlijk in week 2 · org-scoping raakt meer queries dan gedacht → de route-allowlist beperkt de blootgestelde oppervlakte al; scoping begint bij de projecten-keten · XIS-keys niet binnen (waarschijnlijk) → 3.3 vervalt zonder gevolgen.

**Technische schuld & vooruitwerk (bufferuren):** GitHub-repo-transfer naar Brink-org alvast doen (laag risico, uit het spike-draaiboek) · minimale monitoring vóór externen: uptime-check + Vercel-foutalerts (~1 u) · restjes 2.U.

### Week 4 (10–14 aug) — alles op naam van Brink

**Klaar wanneer** (vault): de slotdemo is door Brink zelf uitgevoerd, zonder hulp (17 aug).
**Harde voorwaarden:** migratiedraaiboek (spike 2.3) · Brink-accounts aangemaakt + beheerder bekend (besluit C8 + de openstaande beheerder-vraag).

**4.1 — Accounts migreren naar Brink** (~7 u)
- *Given* het draaiboek, *when* de migratie is uitgevoerd, *then* zijn Vercel-project, Neon-database en Supabase-archief eigendom van Brink-accounts (GitHub is al over in week 3); domein/DNS en alle env-keys overgezet én gedocumenteerd; Timo heeft nog slechts collaborator-toegang.
- *Given* de gemigreerde omgeving, *when* een deploy en een migratie vanaf de Brink-kant draaien, *then* slagen beide en is de live app aantoonbaar ongewijzigd (smoke-test: login, project, estimate-PDF, catalogus).

**4.2 — Overdrachtsrunbook** (~5 u)
- *Given* het runbook (architectuur, deployen, migraties, keys/secrets, importproces, seeds, testdraaien, incident-basics), *when* de stappen **blind gevolgd** worden door Brink op een schone checkout, *then* staat er een werkende lokale omgeving en lukt een deploy — zonder vragen. Het blind-volgen ís het acceptatiecriterium én de slotdemo (besluit C9).

**4.3 — Backups & monitoring (volledig)** (~4 u)
- *Given* Neon, *then* is een point-in-time-restore één keer echt geoefend en beschreven.
- *Given* productie, *when* een serverfout of downtime optreedt (geforceerde testfout), *then* krijgt de Brink-beheerder automatisch een melding — bovenop de basis-check uit week 3.

**4.4 — Einddemo + oplevering** (~3 u) — **ma 17 aug**
- *Given* de eindresultaat-checklist, *when* Eduard (of binnendienst) elke stap zélf uitvoert, *then* is elk punt afgevinkt; restpunten in een genummerde lijst mét vervolgrecept per punt; `HANDOVER.md` definitief.

**4.A — UITLOOP A: catalogus specs-eerst + grijze vlag + milieu-vergelijk** (~6 u — gaat vóór 4.B; start eerder als week 3 meevalt)
- *Given* de catalogus, *when* iemand vrij zoekt over alle merken ("downlight 3000K IP44"), *then* komen resultaten merk-onafhankelijk terug, geordend op **spec-match-score → datacompleetheid → alfabet** — met een test dat prijs nergens meesorteert (ijzeren regel 2).
- *Given* een product zonder data op een gezocht/vergeleken veld, *then* zichtbaar mét grijze vlag "geen data bekend" — nooit stilzwijgend weggefilterd.
- *Given* de vergelijk-tray, *then* staan de duurzaamheids-/milieuvelden volwaardig in de tabel, grijze vlag waar data mist. Geen foto's.

**4.B — UITLOOP B (eerste schrap, besluit 8): merkportaal-self-serve-upload**
- *Given* de week 1-motor, *when* een merk-account zelf een Excel uploadt in `/merk/*`, *then* format-validatie → dubbelchecks → staging → **Brink keurt goed**. Geen tijd → beschreven als "eerste klus ná overdracht" in het runbook.

**Risico's & plan B:** migratie geeft downtime/lock-in → terugvalstap uit het draaiboek (nieuwe resource onder Brink + data/DNS in een avondvenster); uiterste geval: Timo blijft owner en de transfer staat als eerste post-contract-recept in het runbook · uitloop A haalt het niet → specs-eerst zoeken schuift door mét recept in de restpuntenlijst; overdracht gaat vóór nieuwe features · einddemo haalt niet alles → elk niet-gehaald punt krijgt een beschreven vervolgrecept, dat is het opleveringsvangnet.

**Technische schuld (bufferuren):** Drizzle-snapshots definitief kloppend (móét vóór overdracht) · restpunten <1 u.

---

## Het eindresultaat op 14 augustus — wat Eduard kan zonder Timo

- [ ] Een project aanmaken, een spec-PDF uploaden en binnen minuten een estimate-PDF versturen (AI-vangnet draait mee, binnen budget).
- [ ] Een installateur uitnodigen (mechanisme t.b.d., zonder e-mail); die logt zelf in en maakt een eigen project + estimate — zonder prijzen of interne data te zien, en zonder bij andermans projecten te kunnen.
- [ ] In Merkenbeheer zien welke merken nog een mail moeten, een bericht + Excel-template klaarzetten en kopiëren, en de ingevulde Excel terug importeren via upload → controle → goedkeuren — met zichtbaar opklimmende scorecard.
- [ ] In /analytics de kern-sturingsvragen beantwoorden (top-overwogen, trends, datagaten, afwijzingsredenen, funnel — plus de aanvullende widgets voor zover af) én een merk de geanonimiseerde demo-analytics-pagina laten zien (≥ 5 events/week-grens).
- [ ] *(uitloop A)* Producten specs-eerst over alle merken zoeken en tot 4 producten vergelijken op gewone én milieu-velden, met eerlijke grijze vlag — anders: eerste klus ná overdracht, recept ligt klaar.
- [ ] Deployen, migraties draaien en de omgeving beheren via Brink-eigen Vercel/Neon/GitHub/Supabase-accounts, puur op het runbook (blind-volgen bewezen).
- [ ] Een database-restore uitvoeren volgens het geoefende recept, en automatisch een melding krijgen bij fouten of downtime.
- [ ] De open restpunten teruglezen mét vervolgrecept per punt (o.a. XIS-lead-seintje zodra Lynx keys levert, plattegrond/locatie-prikken, aftersales, OCR-restpunten, facturatie, architect-analytics, evt. merkportaal-self-serve, evt. uitloop A).
