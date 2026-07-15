# Lumen Logic — sprintplan t/m 31 augustus 2026 (definitief, na review)

> Opgesteld 2026-07-15 door plan-agent, aangescherpt door onafhankelijke reviewer
> (13 bevindingen verwerkt — zie §Reviewronde onderaan). Solo-dev Timo, 24 u/week
> (contract t/m 31 aug). Besluiten: `docs/lumenlogic-onderdelen-uitwerking.md` (leidend);
> projectdetail: `docs/lumenlogic-projecten-volledig.md`; open eindes: `HANDOVER.md`.
>
> ⚠️ **Bouwvak: aanname wk 32–33 (3–14 aug), nog te bevestigen (sprint 0-vraag).**
> Valt hij anders, schuiven sprint 2/3/4 **1-op-1** mee; inhoud en volgorde wijzigen niet.

## Capaciteit (80/20-regel, elke sprint)

24 u/week → **~19 u aan het sprintdoel, ~5 u buffer** (bugs, support Eduard, technische
schuld, onvoorzien). Items zijn op die 19 u gedimensioneerd; de buffer wordt nooit
vooraf ingepland. Sprint 0 loopt wo–vr (3 dagen, ~14 u → ~11,5 u doel + ~2,5 u buffer).

## Definition of Done (geldt voor élk item, élke sprint)

Een item is pas "done" als **alles** hieronder waar is:

- [ ] `bun vitest run` groen, incl. RSC-screenshottests van gewijzigde schermen in
      **licht én donker**.
- [ ] `bunx tsc --noEmit` schoon.
- [ ] Gecommit en **gepusht naar GitHub** — niets blijft lokaal staan (les 0007/0008).
- [ ] Gedeployed naar productie (`vercel --prod`), migraties op Neon toegepast.
- [ ] **Handmatig geverifieerd in de live app** (het echte scherm, niet alleen tests).
- [ ] `HANDOVER.md` bijgewerkt (wat, aannames, open punten).
- [ ] Events gelogd waar het item gedrag toevoegt (ijzeren regel 5).

---

## Beslissingslog — de keuzes die dit plan bepalen (grill 2026-07-15)

| # | Besluit | Consequentie in het plan |
|---|---|---|
| 1 | **Retour-pad merkdata = upload → controle → goedkeuren**; nooit stil wegschrijven | Sprint 1 bouwt de motor éénmalig; sprint 4-uitloop hergebruikt hem |
| 2 | **Analytics in 3 smaken op één eventlaag**: intern breed, merk-demo nu, architect op papier | Sprint 2; aanvullende widgets expliciet schrapbaar |
| 3 | **Specs-eerst zoeken** naast merk-eerst; ordening objectief, nooit commercieel | Sprint 4-uitloop A (na review: sprint 3 zat vol) — start eerder bij meevallers |
| 4 | **Geen-data = grijze vlag**, nooit stilzwijgend uitsluiten | In catalogus-item én analytics ("nog geen data"-states) |
| 5 | **Géén foto's/beeldmateriaal** | Nergens ingepland; scope-bewaker |
| 6 | **Externe onboarding op uitnodiging**; Resend randvoorwaarde | DNS + aanvraag in sprint 0, live in sprint 3 |
| 7 | **Outreach = klaarzetten + kopiëren** (geen bulk-mail vanuit de tool) | Sprint 1 bouwt geen mailverzending voor outreach |
| 8 | **Merkportaal-self-serve = laatste schrapkandidaat-item** | Sprint 4-uitloop B, ná catalogus |
| 9 | **Overdracht = volwaardig sprintdoel** ("nooit meer bij Timo hoeven komen") | Sprint 4 + spike in sprint 2 + GitHub-transfer al in sprint 3-buffer |
| 10 | **Fase 0 extern: géén prijzen** voor externe accounts | Sprint 3, eigen item (raakt estimate-scherm + PDF-sjabloon) |
| 11 | *(review)* **Externe toegang via minimale route-allowlist** (projecten + catalogus; rest geblokkeerd) als hoofdontwerp, niet als terugval | Houdt sprint 3 behapbaar; verfijning ná augustus |
| 12 | *(review)* **Anonimiseringsgrens gekwantificeerd**: merk-cijfers alleen bij **≥ 5 events/week** per product | Toetsbaar criterium in 2.2 |

---

## Sprint 0 — Fundament & quick wins (wo 15 – vr 17 jul, ~14 u; ~11,5 u doel)

**Sprintdoel:** *Het AI-vangnet draait live en alle externe doorlooptijden (Resend+DNS, Lynx, evaluatieset, bouwvak, Brink-accounts) zijn in gang gezet, met de repo weer synchroon aan productie.*

### Afhankelijkheden & blockers vooraf
- ANTHROPIC_API_KEY: akkoord is er, alleen invoeren — geen blocker.
- Resend/domeinverificatie + DNS-wijziging bij Brink: doorlooptijd buiten eigen hand → **nú aanvragen, incl. DNS-records aanleveren**.
- Evaluatieset en Lynx-navraag: mensenwerk/extern → nú uitzetten, loopt parallel.
- Antwoorden Eduard (bouwvak, accounts, deel-C-vragen): agenda-afhankelijk.

### Backlog (prioriteit 1→4)

**0.1 — AI-vangnet live** (~2 u)
- *Given* ANTHROPIC_API_KEY in `.env.local` én als Vercel-env, *when* Timo het test-armaturenboek importeert in productie, *then* draait het vangnet over de restregels, verschijnen AI-suggesties in review, en is er géén `ai_vangnet_skipped_no_key`-event meer maar wel vangnet-events met kosten in `llm_usage`.
- *Given* het budget in de instellingen, *when* de teller de cap nadert (test met tijdelijk lage cap), *then* stopt het vangnet met een budgetstop-event.

**0.2 — Repo synchroon: béíde branches + working tree naar main** (~4,5 u)
- *Given* branch `runs-4-6-vijfstatussen` (met ongecommit 0007-/price-archive-/schema-werk) én branch `english-xis` (i18n-slag), *when* beide zijn gereviewd, gecommit, samengevoegd naar main en gepusht, *then* is `git status` schoon, weerspiegelt GitHub exact wat op Neon/Vercel draait, en is de volledige DoD gehaald.
- **Minimum (plan B):** migratie 0007 + price-archive af en gepusht — harde voorwaarde voor sprint 1; de rest als eerste bufferklus sprint 1.

**0.3 — Externe aanvragen de deur uit** (~3 u)
- *Given* Eduard is bereikbaar, *when* sprint 0 eindigt, *then*:
  (a) Resend-account aangevraagd én **de DNS-records voor het Brink-afzenderdomein liggen concreet bij Eduard/IT** (niet alleen "account aangevraagd");
  (b) de evaluatieset-uitvraag (50–100 échte spec-regels) ligt schriftelijk bij de binnendienst;
  (c) de **XIS-attributenlijst is aantoonbaar bij Lynx ingediend + statusnavraag op taak #107781** gedaan;
  (d) het Supabase-project heet "Brinklicht".

**0.4 — Open vragen beantwoord & vastgelegd** (~2 u)
- *Given* de deel-C-vragen (XIS-lead-trigger/inhoud, tekening-bron, auto-statusovergangen, aftersales/heropenen, onboarding-detail) plus: bouwvak-datums, welke Brink-accounts (Vercel/GitHub/Neon/Supabase), wie beheerder wordt, de exacte prijzen-grens extern, én **wie in sprint 4 het runbook "blind volgt" (afspraak inplannen)** en de einddemo-datum (vr 28 aug), *when* het gesprek met Eduard is gevoerd, *then* staan alle antwoorden in de vault/`docs/lumenlogic-projecten-volledig.md` §C en zijn beide afspraken geagendeerd.
- Erbij (klein): query-check dat Van Dijk-testdata weg is en Flos tier-1 staat.

### Risico's & plan B
- **Eduard niet bereikbaar** → alles per mail uitzetten; aannames (bouwvak 3–14 aug, extern = géén bedragen) expliciet vastleggen en doorbouwen.
- **Branch-merge blijkt conflictrijk** → minimum uit 0.2 halen (0007 + price-archive), rest naar sprint 1-buffer.

### Resultaat aan het eind van deze sprint
De import laat live AI-suggesties zien op restregels — demo: upload het test-armaturenboek en zie het vangnet meedraaien binnen budget. GitHub is weer de waarheid (beide sporen samengevoegd). Alle wachttijd-afhankelijke ballen (Resend+DNS, Lynx #107781, evaluatieset, bouwvak, Brink-accounts, blind-volg-afspraak) rollen — geen enkele latere sprint wacht op iets dat deze week al aangevraagd kon worden.

---

## Sprint 1 — De merken-loop rond (ma 20 – vr 24 jul, 24 u; 19 u doel)

**Sprintdoel:** *Brink kan een ingevulde merk-Excel via de merkrelatie-pagina veilig terug de database in krijgen (upload → controle → goedkeuren) en heeft "Merken" als eigen hoofdingang met een outreach-werklijst.*

### Afhankelijkheden & blockers vooraf
- Migratie 0007 gecommit en op Neon (sprint 0.2-minimum) — **harde voorwaarde**.
- Eén écht ingevulde template (via Eduard); fallback: zelf ingevulde template.
- Geen externe keys nodig (outreach = kopiëren, besluit 7).

### Backlog (prioriteit 1→4)

**1.1 — Format-validatiemodule (herbruikbare motor)** (~5 u)
- *Given* een geüpload .xlsx, *when* het niet ons template-format is (kolomkoppen/sheet ontbreken), *then* een duidelijke afwijzing "dit is niet ons format" met wat er mist — er wordt níéts opgeslagen.
- *Given* een correct format met inhoudelijke twijfels (lege must-velden, onbekende artikelcodes, dubbele rijen), *then* per rij dubbelcheck-waarschuwingen.
- Module is een losse lib-functie + tests, zodat sprint 4-uitloop B hem ongewijzigd hergebruikt.

**1.2 — Retour-pad: upload → voorstel → goedkeuren** (~9 u)
- *Given* een merkrelatie-pagina, *when* Brink een ingevulde template uploadt die de validatie passeert, *then* toont een voorstel-scherm per veld: **nieuw gevuld / gewijzigd (oud→nieuw) / conflict** — niets staat dan al in de database.
- *Given* het voorstel-scherm, *when* Brink goedkeurt, *then* worden wijzigingen toegepast, events gelogd, en gaat de relatiestatus naar `data_ontvangen`/`verwerkt`; *when* afgewezen, *then* verandert er niets.
- Conflictregel (vooraf vastgelegd): bestaand veld wint, tenzij expliciet aangevinkt.

**1.3 — Merkenbeheer als hoofdingang** (~4 u)
- *Given* de hoofdnavigatie, *when* een Brink-gebruiker "Merken" kiest, *then* opent het merkrelatie-overzicht (status, prijslijst-indicator, mini-scorecard) met kruislink naar de disclosure-tiers (toestemmings-as ≠ compleetheids-as).
- *Given* het overzicht, *when* gefilterd op "moet nog een mail" (status + `lastContactAt`), *then* toont de lijst precies de merken zonder recent contact — de outreach-werklijst.

**1.4 — End-to-end verificatie met één echt merk** (~1 u)
- *Given* één merk (via Eduard of zelf-ingevuld), *when* de hele loop draait (template kopiëren → ingevuld terug → upload → voorstel → goedkeuren), *then* is de nieuwe data zichtbaar in **scorecard én catalogus** (de 0007-kolommen tellen aantoonbaar mee) met volledig audit-spoor in events.

### Risico's & plan B
- **Voorstel-diff complexer dan gedacht** → conflictregel is al vastgelegd; slimmer merge-gedrag = ná augustus.
- **Geen echt ingevulde template op tijd** → 1.4 met zelf-ingevulde template; echte-merk-verificatie naar sprint 2-buffer.
- **0007 niet stabiel op Neon** → bufferuren eerst; 1.3 desnoods naar sprint 2-buffer.

### Technische schuld (bufferuren, ~5 u)
- Restant 0.2 (branch-merge) als dat bleef liggen.
- **Drizzle-snapshot-gat vanaf 0004** bijwerken (timebox 2 u; anders gedocumenteerd naar het runbook).

### Resultaat aan het eind van deze sprint
De datastroom met merken is een gesloten loop: in de demo kopieer je een template, upload je de ingevulde Excel, zie je op het voorstel-scherm exact wat er verandert, keur je goed — en zie je de scorecard opkleuren. "Merken" is een eigen hoofdingang waar Brink in één oogopslag ziet wie nog een mail moet. Vorige week kon data er alleen úít; nu ook veilig ín.

---

## Sprint 2 — Data-inzicht + migratie-spike (ma 27 – vr 31 jul, 24 u; 19 u doel)

**Sprintdoel:** *Brink beantwoordt de vijf belangrijkste sturingsvragen in /analytics op echte cijfers, kan een merk een demo-analytics-pagina laten zien, en het draaiboek voor de accountmigratie ligt klaar.*

### Afhankelijkheden & blockers vooraf
- Eventlaag bestaat sinds dag één — geen blocker. `mv_brand_considerations` bestaat.
- Brink-accountgegevens uit sprint 0.4 (voor de spike).
- Evaluatieset: als regels binnen zijn → echte hit-rate; anders toont het paneel eerlijk "wacht op evaluatieset".

### Backlog (prioriteit 1→4)

**2.1a — Interne analytics: de kern (5 widgets)** (~8 u)
- *Given* /analytics (alleen Brink-intern), *when* een periode is gekozen (per week filterbaar), *then* beantwoordt de pagina op echte events: **top-overwogen producten · trends per week · datagaten & dekking** (zoek-zonder-resultaat + blauw-wachtrij per merk) · **afwijzingsredenen-top-10 · projectfunnel** (concept→estimate→offerte→gegund/niet).
- *Given* een blok zonder data, *then* toont het "nog geen data" — nooit een lege of brekende widget.
- *Given* de query-laag, *then* is elke widget org-scoped opgezet (parameter; intern = alles), zodat sprint 3 externen zonder herbouw kan scopen.

**2.2 — Merk-demo-pagina (versmald)** (~5 u)
- Omvat het **aanmaken van een demo-merkaccount** en een pagina in `/merk/*` met scoping in fase 0 hard gekoppeld aan dat ene merk (de generieke accounttype-afscherming komt in sprint 3.2).
- *Given* het demo-merkaccount, *when* het zijn analytics opent, *then* uitsluitend geaggregeerde eigen-productcijfers uit `mv_brand_considerations`, en **alleen voor producten met ≥ 5 events/week** (anonimiseringsgrens, besluit 12) — nooit projectnamen, gebruikers of andere merken (met test).
- *Given* de materialized view, *then* een refresh-knop + "laatst ververst"-timestamp.

**2.3 — SPIKE: account-migratie naar Brink (timebox 3 u, alleen uitzoeken)**
- *Given* de Brink-accountgegevens, *when* de spike klaar is, *then* ligt er een één-pagina-migratiedraaiboek: per dienst (Vercel, Neon, GitHub, Supabase, domein/DNS) de exacte stappen, **wat zonder downtime kan**, welke env-keys/DNS geraakt worden, volgorde + terugvalstap. Géén migratie uitvoeren.

**2.4 — Ontwerp-notitie architect-analytics (papier)** (~2 u)
- *Given* de derde smaak (specifiers: duurzaamheid vs. prijs op eigen projecten), *then* één pagina in `docs/` (events, views, schermontwerp), gemarkeerd "bouwen ná augustus".

**2.U — UITLOOP (schrapbaar): aanvullende widgets** (~4 u)
- Gebruik per gebruiker/org · hit-rate-ontwikkeling · prijslijst-gezondheid · scorecard-voortgang. Zelfde acceptatiecriteria als 2.1a. Niet af = naar sprint 3-buffer.

### Risico's & plan B
- **Te weinig echte events voor een demo** → demo-seed met duidelijk gemarkeerde synthetische events.
- **MV-verversing traag** → refresh-knop volstaat in fase 0; automatisch = ná augustus.
- **Spike ontdekt lock-in (bv. Neon-ownership)** → juist de winst: plan B in het draaiboek, sprint 4 begint zonder verrassing.

### Technische schuld (bufferuren)
- Uuid-cast/`payload`-guards in analytics-queries (één afwijkend event mag de pagina nooit breken).
- Restjes sprint 1.

### Resultaat aan het eind van deze sprint
In de demo open je /analytics en beantwoordt de vijf kernvragen met echte cijfers, per week filterbaar: wat wordt overwogen, waar zoekt men zonder resultaat, waarom wordt afgewezen, hoe loopt de funnel. Je logt in als demo-merk en ziet de betaalde-analytics-belofte als werkende, geanonimiseerde pagina. En het migratiedraaiboek ligt klaar — de overdracht is geen sprong in het diepe meer. Alles is gecommit, gedeployed en gedocumenteerd vóór de bouwvak.

---

## — Bouwvak (aanname wk 32–33, ma 3 – vr 14 aug): géén werk, géén "even iets fixen" —

*Vangnet: vóór de bouwvak is alles gecommit, gepusht, gedeployed en gedocumenteerd (DoD). Valt de bouwvak anders: sprints schuiven 1-op-1.*

---

## Sprint 3 — Extern: uitnodigen & rechten (ma 17 – vr 21 aug, 24 u; 19 u doel)

**Sprintdoel:** *Een uitgenodigde installateur logt zelfstandig in via e-mail en maakt een project met estimate zonder ooit interne schermen of prijzen te zien.*

### Afhankelijkheden & blockers vooraf
- **Resend-key + geverifieerd Brink-domein (DNS!)** — aangevraagd in sprint 0; status checken op dag 1. Nog niet rond → eerste stap: neutraal Resend-testdomein (gepland, geen terugval).
- Prijzen-grens extern bevestigd (sprint 0.4).
- XIS-schrijf-keys (Lynx) — alleen relevant voor het optionele lead-seintje.

### Backlog (prioriteit 1→3 + optioneel)

**3.1 — Resend live + uitnodigingsflow** (~8 u)
- *Given* Resend gekoppeld (Brink-domein of testdomein), *when* een gebruiker een magic link aanvraagt, *then* komt die per e-mail aan — geverifieerd op productie. (Better Auth-transport-integratie zit in deze schatting.)
- *Given* Brink in de instellingen, *when* Brink een e-mailadres uitnodigt en aan een organisatie koppelt, *then* ontvangt die persoon een uitnodigingsmail, logt in via de link en zit direct in de juiste organisatie; niet-uitgenodigde adressen krijgen dezelfde neutrale melding (geen account-enumeratie).

**3.2a — Externe toegang: route-allowlist + org-scoping** (~7 u)
- *Given* een extern account, *when* het de app gebruikt, *then* zijn alléén projecten (eigen organisatie) en catalogus bereikbaar; alle andere routes (/data, /admin, Merken, interne /analytics) worden **server-side** geweigerd (besluit 11), met tests per accounttype.
- *Given* de project-queries, *then* zijn lijst, detail, regels, review, estimate en importruns org-gescoped — een extern account kan geen enkel object van een andere org opvragen (directe-URL-test).
- *Given* de rechten, *then* admin ≠ gewone gebruiker (instellingen/uitnodigen alleen admin).

**3.2b — Prijsloze estimate voor externen** (~4 u)
- *Given* fase 0, *when* een extern account een estimate opent of de PDF downloadt, *then* bevatten scherm én PDF **géén prijzen/bedragen/totalen** — wel regels, aantallen, statussen en kleuren (eigen render-pad + sjabloonvariant, met screenshottest); intern blijft alles zichtbaar.

**3.3 — (alleen als XIS-keys binnen zijn) Lead-seintje** (optioneel)
- *Given* de Lynx-keys en de sprint-0-antwoorden (trigger + inhoud), *when* een externe gebruiker de trigger raakt, *then* schiet er idempotent een lead in XIS. Geen keys → export-stub blijft, geen sprintrisico.

### Risico's & plan B
- **Resend/DNS nog niet rond** → testdomein-pad is al het plan; het echte domein omhangen is dan een config-wissel in sprint 4-buffer.
- **Org-scoping raakt meer queries dan gedacht** → de route-allowlist beperkt de blootgestelde oppervlakte al; scoping begint bij de projecten-keten (het enige dat externen zien).
- **XIS-keys niet binnen** (waarschijnlijk) → 3.3 vervalt zonder gevolgen.

### Technische schuld & vooruitwerk (bufferuren)
- **GitHub-repo-transfer naar Brink-org** alvast doen (laag risico, uit het spike-draaiboek).
- **Minimale monitoring vóór externen**: uptime-check + Vercel-foutalerts (~1 u) — het volle monitoring-werk volgt in 4.3, maar externen komen deze week binnen (reviewbevinding 6).
- Restjes 2.U (aanvullende analytics-widgets).

### Resultaat aan het eind van deze sprint
De demo: Eduard nodigt op een echt mailadres een testinstallateur uit; die krijgt de mail, logt in, maakt een project, uploadt een PDF en genereert een estimate — zonder één prijs of intern scherm te zien, en zonder bij andermans projecten te kunnen. De basis-monitoring draait en de GitHub-repo staat al bij Brink. Vorige sprint was de app intern; nu is hij veilig extern.

---

## Sprint 4 — Overdracht & oplevering (ma 24 – vr 28 aug, 24 u; 19 u doel)

**Sprintdoel:** *Brink draait Lumen Logic volledig op eigen accounts, met bewezen runbook, geoefende restore en automatische alarmen — Eduard hoeft nooit meer bij Timo aan te kloppen.*

### Afhankelijkheden & blockers vooraf
- **Migratiedraaiboek (spike 2.3)** — harde voorwaarde.
- Brink-accounts aangemaakt + beheerder bekend (sprint 0.4) — zo niet: maandagochtend 30-min-call met Eduard.
- **Blind-volger voor het runbook is geagendeerd** (sprint 0.4) en de einddemo staat op vr 28 aug.
- Retainer-gesprek gevoerd of gepland "ruim vóór 31 aug" (open loop bewaken).

### Backlog (prioriteit 1→4 + uitloop A/B)

**4.1 — Accounts migreren naar Brink** (~7 u)
- *Given* het draaiboek, *when* de migratie is uitgevoerd, *then* zijn Vercel-project, Neon-database en Supabase-archief eigendom van Brink-accounts (GitHub is al over in sprint 3); domein/DNS en alle env-keys overgezet én gedocumenteerd; Timo heeft nog slechts collaborator-toegang.
- *Given* de gemigreerde omgeving, *when* een deploy en een migratie vanaf de Brink-kant draaien, *then* slagen beide en is de live app aantoonbaar ongewijzigd (smoke-test: login, project, estimate-PDF, catalogus).

**4.2 — Overdrachtsrunbook** (~5 u)
- *Given* het runbook (architectuur, deployen, migraties, keys/secrets, importproces, seeds, testdraaien, incident-basics), *when* de stappen **blind gevolgd** worden door de afgesproken persoon (niet Timo) op een schone checkout, *then* staat er een werkende lokale omgeving en lukt een deploy — zonder vragen. Het blind-volgen ís het acceptatiecriterium.

**4.3 — Backups & monitoring (volledig)** (~4 u)
- *Given* Neon, *then* is een point-in-time-restore één keer echt geoefend en beschreven.
- *Given* productie, *when* een serverfout of downtime optreedt (geforceerde testfout), *then* krijgt de Brink-beheerder automatisch een melding — bovenop de basis-check uit sprint 3.

**4.4 — Einddemo + oplevering** (~3 u)
- *Given* de eindresultaat-checklist hieronder, *when* Eduard (of binnendienst) elke stap zélf uitvoert, *then* is elk punt afgevinkt; restpunten in een genummerde lijst mét vervolgrecept per punt; `HANDOVER.md` definitief.

**4.A — UITLOOP A: catalogus specs-eerst + grijze vlag + milieu-vergelijk** (~6 u — gaat vóór 4.B; start eerder als sprint 3 meevalt)
- *Given* de catalogus, *when* iemand vrij zoekt over alle merken ("downlight 3000K IP44"), *then* komen resultaten merk-onafhankelijk terug, geordend op **spec-match-score → datacompleetheid → alfabet** — met een test dat prijs nergens meesorteert (ijzeren regel 2).
- *Given* een product zonder data op een gezocht/vergeleken veld, *then* zichtbaar mét grijze vlag "geen data bekend" — nooit stilzwijgend weggefilterd.
- *Given* de vergelijk-tray, *then* staan de duurzaamheids-/milieuvelden volwaardig in de tabel, grijze vlag waar data mist. Geen foto's.

**4.B — UITLOOP B (eerste schrap, besluit 8): merkportaal-self-serve-upload**
- *Given* de sprint-1-motor, *when* een merk-account zelf een Excel uploadt in `/merk/*`, *then* format-validatie → dubbelchecks → staging → **Brink keurt goed**. Geen tijd → beschreven als "eerste klus ná overdracht" in het runbook.

### Risico's & plan B
- **Migratie geeft downtime/lock-in** → terugvalstap uit het draaiboek (nieuwe resource onder Brink + data/DNS in een avondvenster); uiterste geval: Timo blijft owner t/m 31 aug en de transfer staat als eerste post-contract-recept in het runbook.
- **Uitloop A haalt het niet** → specs-eerst zoeken is dan het enige einddoel-punt dat doorschuift; het staat mét recept in de restpuntenlijst en is de eerste klus erna. (Bewuste keuze na review: overdracht gaat vóór nieuwe features.)
- **Einddemo haalt niet alles** → elk niet-gehaald punt krijgt een beschreven vervolgrecept — dat is het opleveringsvangnet.

### Technische schuld (bufferuren)
- Drizzle-snapshots definitief kloppend (móét vóór overdracht).
- Restpunten <1 u.

### Resultaat aan het eind van deze sprint
De app draait aantoonbaar op Brink-eigen accounts: Eduard deployt zelf, een restore is geoefend, en bij een storing gaat vanzelf een alarm af. Het runbook is bewezen doordat iemand anders dan Timo de stappen blind heeft gevolgd. De einddemo is door Eduard zelf gedaan — het letterlijke bewijs van "nooit meer bij mij hoeven komen".

**Ma 31 aug — laatste dag:** overdrachtsgesprek, restpuntenlijst + vervolg-advies (retainer-voorstel ligt er dan al).

---

## Het eindresultaat op 31 augustus — wat Eduard kan zonder Timo

- [ ] Een project aanmaken, een spec-PDF uploaden en binnen minuten een estimate-PDF versturen (AI-vangnet draait mee, binnen budget).
- [ ] Een installateur per e-mail uitnodigen; die logt zelf in via de mail en maakt een eigen project + estimate — zonder prijzen of interne data te zien, en zonder bij andermans projecten te kunnen.
- [ ] In Merkenbeheer zien welke merken nog een mail moeten, een bericht + Excel-template klaarzetten en kopiëren, en de ingevulde Excel terug importeren via upload → controle → goedkeuren — met zichtbaar opklimmende scorecard.
- [ ] In /analytics de kern-sturingsvragen beantwoorden (top-overwogen, trends, datagaten, afwijzingsredenen, funnel — plus de aanvullende widgets voor zover af) én een merk de geanonimiseerde demo-analytics-pagina laten zien (≥ 5 events/week-grens).
- [ ] *(uitloop A)* Producten specs-eerst over alle merken zoeken en tot 4 producten vergelijken op gewone én milieu-velden, met eerlijke grijze vlag — anders: eerste klus ná overdracht, recept ligt klaar.
- [ ] Deployen, migraties draaien en de omgeving beheren via Brink-eigen Vercel/Neon/GitHub/Supabase-accounts, puur op het runbook (blind-volgen bewezen).
- [ ] Een database-restore uitvoeren volgens het geoefende recept, en automatisch een melding krijgen bij fouten of downtime.
- [ ] De open restpunten teruglezen mét vervolgrecept per punt (o.a. XIS-lead-seintje zodra Lynx keys levert, OCR, facturatie, architect-analytics, evt. merkportaal-self-serve, evt. uitloop A).

---

## Reviewronde (plan-agent → kritische reviewer, 2026-07-15)

Verwerkt: sprint 3 was overboekt (21 u) → catalogus naar uitloop A en rechten-item gesplitst in 3.2a/3.2b · merk-demo (2.2) hing op rechtenwerk uit sprint 3 → versmald met demo-account + hard-coded scoping · 0.2 dekte maar één van de twee branches → herschreven + minimum-variant · 15 juli is een woensdag → sprint 0 = wo–vr · spike naar sprint 2 · monitoring-basis vóór externen (sprint 3-buffer) · XIS-attributenlijst + DNS-records + blind-volg-afspraak in sprint 0 · anonimiseringsgrens gekwantificeerd (≥ 5 events/week) · sorteervolgorde catalogus vastgelegd incl. geen-prijs-test · GitHub-transfer naar voren (sprint 3) · 2.1 gesplitst in kern (5 widgets) + schrapbare uitloop.
