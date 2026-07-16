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
| C10 | *(16 jul)* **Onboarding = PIN → wachtwoord.** Brink maakt het account aan met een tijdelijke PIN; de gebruiker vult die in en kiest direct een wachtwoord; dat wachtwoord zijn daarna de inloggegevens. **Wachtwoord vergeten = Brink geeft een nieuwe PIN** — zelfde pad, géén apart resetmechanisme | **Vult het gat dat besluit 6 achterliet.** Week 3-item 3.1 kan hierop ontworpen worden. Raakt Better Auth: nu magic-link zonder wachtwoorden → wachtwoord-auth. Open bij het ontwerp: hoe de PIN de gebruiker bereikt (out-of-band: telefonisch/persoonlijk) en of intern ook overgaat of op magic link blijft |

### Uit week 1 (2026-07-16 e.v.)

| # | Besluit | Consequentie |
|---|---|---|
| W1 | **Meldingen van de format-validatie zijn Engels**, niet Nederlands. De interne UI is Engels sinds de i18n-slag (PR #1) — nav "Projects/Catalog/Settings", `STATUS_LABEL` "Not approached", werklijst "No response (> 14 days)" | Consistent met het scherm waar de meldingen landen, met het Engelse merk-template en met de merken die in 4.B zelf uploaden. Geldt ook voor 1.2/1.3 |

**Fout van de sprintmaster, vastgelegd:** kaderpunt 4 van `docs/sprint1-1-briefing.md` schreef
"meldingen in het Nederlands" voor. Dat was fout: de sprintmaster had de Engelse nav en
`STATUS_LABEL` in dezelfde sessie zélf gelezen en trok de conclusie niet door. De bouwsessie
signaleerde de tegenspraak in plaats van de briefing blind te volgen — dat is het gedrag dat
de werkwijze beoogt. Briefing gecorrigeerd. **Les: een briefing die de codebase tegenspreekt
is een briefingfout, niet een bouwfout; blijf de briefing toetsen aan wat er staat.**

### Openstaand — géén besluit (bewust)

- **Wie wordt beheerder?** Aanname: Eduard, die vervolgens anderen toegang geeft. **Moet door
  Eduard zélf bevestigd worden** — Timo's aanname is geen toezegging. Harde voorwaarde vóór week 4.
- **Waar dient het vangnet voor in tender?** (uit 0.1b) Een regel is rood/open **omdat** de
  matcher het exacte product niet vond; in tender mag het vangnet **alleen datzelfde exacte
  product** suggereren. Het zoekt daar dus naar wat al bewezen afwezig is — **`suggested: 0` is
  in tender bijna tautologisch**. Niet helemaal: de AI kan een naamvariant redden die de
  token-matcher miste (juist op de 0-treffer-regels zoals Lp601/Lr701). Dit is ijzeren regel 4
  die correct wérkt, geen bug.
  **Besluit: nog géén sprintitem — eerst data.** Het kost ~€0,01/regel (~€1 voor een boek van
  100 regels, binnen de €10-cap), dus de urgentie is laag, en of het z'n geld waard is valt
  alleen te zeggen ná een paar echte armaturenboeken. Herijken zodra die er zijn; `parseFailed`
  en `suggested` in de `ai_vangnet_run`-payload leveren het bewijs vanzelf.

---

## Wat de evaluatieset blootlegde (16 jul 2026) — raakt de scope

Gevonden bij het bouwen van de evaluatieset uit **528 echte XIS-aanvragen** (210 van Jayden).
Geen van deze punten is een bug; het zijn aannames in het plan die de werkelijkheid niet halen.

- **De aantallen zitten nooit in het armaturenboek.** Bij Raadhuis de Pauw staan ze in de
  **mailtekst** ("Lr301 24x, Lr303 25x…", plus de eis "alle armaturen dienen Dali-2 compatibel");
  bij Dordrecht **met de hand in pen** in de kantlijn van een scan (bevestigd: het handgeschreven
  `124` staat als `124 x` in de offerte). Lumen Logic importeert alleen de PDF en krijgt dus wél
  de specs maar niet de vraag. **Feature A-07 ("aantal ontbreekt → stukprijs-modus") is daarmee
  geen randgeval maar de hoofdregel** — en de mail is een bron die nergens in het ontwerp bestaat.
- **Armatuurcodes hebben geen standaard.** Deerns gebruikt `Lp301`, WTB Buro gebruikt `Ad`, `C1`,
  `Tn1`. Een parser die één codepatroon aanneemt, mist een hele klasse aanvragen.
- **De meeste intake is géén armaturenboek.** Van 52 doorgezochte projectaanvragen bevatten er
  **4** een leesbaar gecodeerd boek. De rest is tekeningen (A1-plattegronden, ceiling power plans,
  lightplans), bestekken, of verlopen WeTransfer-links. Dat relativeert hoeveel van Brinks échte
  werk de PDF-import dekt — tekeningen lezen is besluit C2 ("wens voor later").
- **Brink offreert lang niet alles.** Bij Dordrecht zijn 8 van de 18 codes nooit geoffreerd
  (andere leverancier). "Staat niet in de offerte" ≠ "systeem miste het" — relevant voor elk
  scoreblad.

**Vervolg:** vier testcases liggen klaar in `~/Downloads/lumenlogic-testset/`, elk met de
grondwaarheid uit XIS. Timo werkt ze één voor één af. Gaat dat goed, dan kan de evaluatieset
intern in productie (besluit Timo 16 jul).

### Uitkomst van de meting (16 jul) — vier cases, twee regels code

Testcase 1 (Raadhuis), 2 (KvK) en 4 (TNO) zijn gemeten via het **exacte productiecodepad**,
zonder DB-schrijfactie. Alle drie stranden op dezelfde twee plekken. Geen enkele case haalde
een match.

| Case | Import | Match | Keuze | Struikelpunt |
|---|---|---|---|---|
| 1 Raadhuis | 31/31 | **0/31** | 0/4 | merkkolom + matcher-ranking |
| 2 KvK | **0/28** | n.v.t. | n.v.t. | code-regex (`L004`) |
| 4 TNO | 15/**20** | **0/15** | 0/12 | code-regex + merkkolom |
| 5 Dordrecht | *voorspeld 0/18* | | | code-regex (`Ad`,`C1`,`Tn1`) — **ook de OCR** |

**Wortel 1 — de `CODE`-regex kent één huisstijl** (`lib/pdf/armaturenboek.ts:14`):
`/^[A-Z][a-z]{1,2}\d{2,3}(?:-[a-z0-9])?$/`. Alleen Deerns' `Lp301` past. `L004` (KvK),
`Lr001B`/`Lp601a`/`Lr001_N` (TNO) en álle Dordrecht-lettercodes vallen erbuiten.
⚠️ **De OCR ontsnapt er niet aan**: `lib/ai/ocr.ts:48` importeert dezelfde `CODE` en toetst
eraan op regel 249 — bewust ("parser en vision nooit uiteenlopen"), maar daardoor erft de
vision-route de blinde vlek van de tekstroute.

**Wortel 2 — de merkkolom wordt geraden** (`lib/pdf/armaturenboek.ts:72`): "geen bekend merk
herkend: eerste woord als merk". `splitBrandType` herkent een merk alleen als *prefix*; op een
brede tabel staat het merk middenin. Gevolg: de ruimte-/functiekolom wordt het merk. Bij TNO
levert dat een estimate op die de binnendienst vraagt de merken **"Woonkamer", "Vergaderruimte",
"Belcel", "Pantry"** in te laden — zes vertrekken van een TNO-kantoorpand. Zelfverzekerd,
actiegericht en volledig verzonnen.

**Het pijnlijke:** de data ligt er wél. **XAL heeft 31.420 producten geladen**, Muuto 276,
&Tradition 539 — precies de merken die Jayden offreerde. Het systeem heeft ze nooit gezocht.

**Twee losse bevindingen:**
- ~~**De matcher kapt af op 8 kandidaten, alfabetisch gesorteerd.**~~ **INGETROKKEN 16 jul na
  hermeting.** `engine.ts:250` sorteert wél op relevantie (`matchCount → prefixBonus →
  similarity → naam`); naam is enkel de tiebreak. De sortering klapt alleen samen tot
  alfabetisch als `productText` geen tokens ≥2 tekens oplevert — en dat gebeurt hier níét
  (alle 31 regels hebben tokens, tot 631 tekens). **De top-8-afkap is in geen enkele testcase
  een bewezen oorzaak**: in de echte run gaan alle 31 regels blauw, dus `fetchCandidates` wordt
  nooit aangeroepen. Het getal "rang 105 van 8.495" kwam uit een contrafeitelijke test waarin
  `productText` met de hand op `"SASSO PRO 100"` was gezet — een meetfout, geen bevinding.
  De afkap blijft een reële eigenschap van de code, maar zit verstopt achter de merkfout.
  **Er is dus één oorzaak, niet twee.** Repareer de merkkolom en de matcher komt tot leven:
  alle vier de Raadhuis-regels gaan van blauw naar **geel/open mét kandidaten** — de mens
  krijgt ze op de reviewbank in plaats van dat de keten stilvalt. Of de top-8 dán knelt is een
  aparte meting ná de fix. *(Zowel testcase 1 als de sprintmaster hadden hier een verkeerde
  hypothese; beide zijn met een trouwe hermeting weerlegd.)*
- **Rood vs. blauw wordt op de verkeerde grond beslist.** `brandExists`
  (`lib/matching/engine.ts:176`) toetst of er een merk-*rij* bestaat, niet of dat merk producten
  heeft. `Focus` (0 producten, rij bestaat) → rood; `Vergaderruimte` (geen rij) → blauw. De
  regelset zegt "ligt het probleem bij ons of bij de match? Ontbrekend merk = BLAUW". Een merkrij
  met nul producten is ons datagat. De code-comment verdedigt een ander geval (verlopen
  prijslijst) — dat is legitiem; het echte gat is dat de code "nooit producten gehad" niet kan
  onderscheiden van "tijdelijk onzichtbaar".
- **Cosmetisch maar raakt het weekdoel:** de UI toont "Import failed — please try again" naast
  een geslaagde import (DB: één run, `bevestigd`, 15 regels).

**Weekdoel-stand:** upload → verstuurbare PDF werkt *technisch* (HTTP 200, PDF terugleesbaar,
`estimate_pdf_generated` gelogd). De letter is gehaald. De inhoud is €0,00 en 15 p.m.-regels.

**Fout van de sprintmaster, vastgelegd:** de TNO-opdracht zei "15 codes"; het zijn er 20. Dat
getal kwam uit de zeef van de sprintmaster, die **dezelfde blinde vlek had als de parser**. Een
tweede regex bleek de omgekeerde blinde vlek te hebben (vond `Lr001B`, miste `L004`). Conclusie:
**armatuurcodes zijn niet met een patroon te tellen** — dat is precies waarom wortel 1 een
herontwerp vraagt en geen ruimere regex. Gecorrigeerd: Raadhuis 31 · KvK 20 · TNO 20 · Dordrecht 18.

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

**0.1 — AI-vangnet live** (~2 u) — ✅ **AFGEROND 16 jul** (hoofddoel + 0.1b)
- ✅ *Given* `ANTHROPIC_API_KEY` in `.env.local` én als Vercel-env, *when* het test-armaturenboek in productie wordt geïmporteerd, *then* draait het vangnet over de restregels ~~verschijnen AI-suggesties in review~~, en is er géén `ai_vangnet_skipped_no_key`-event meer maar wél vangnet-events met kosten in `llm_usage`.
  **Bewijs** (onafhankelijk geverifieerd tegen de live DB, 16 jul): event `ai_vangnet_run` met `checked: 7, suggested: 0, phase: tender` op dossier `49c6340e-83d8-45c7-84d9-64fe1f48cb88` ("ZZ-TEST 0.1 vangnet 16-07"), deploy-SHA `966191f`, 08:56–08:58 UTC · 21 calls / **€0,0619** met `purpose='vangnet'` · nul `ai_vangnet_skipped_no_key` · statussen ongemoeid.
- ✅ *Given* het budget in de instellingen, *when* de teller de cap nadert (test met tijdelijk lage cap), *then* stopt het vangnet met een budgetstop-event.
  **Bewijs**: cap tijdelijk op €0,01 → `ai_vangnet_skipped_budget` (`budgetEur 0.01, spendEur 0.1022`), kosten €0. Cap staat permanent op **€10/maand** (`app_settings.llm_budget_eur = 10`).
- ✅ **0.1b — zichtbaar maken wát het model antwoordde** — **afgerond 16 jul** (`e28d46d` meting + parserfix, `9870226` live bewijs). Briefing: `docs/sprint0-1b-suggestiepad.md`.
  **Uitkomst: de parser at niets op — `suggested: 0` was eerlijk.** Alle 7 regels gaven `stop_reason=end_turn` en een nette slottekst eindigend op `{"suggesties":[]}`; de ongefixte regex parseert die vormen empirisch allemaal correct. Rij 2 van de briefingtabel dus.
  **Waarom het niets vond: ijzeren regel 4, correct werkend.** De tender-tak van `systemPrompt` zegt "zoek uitsluitend het GEVRAAGDE product; alternatieven niet toegestaan" — en het model schreef dat ook terug. Het vond nabije kandidaten en verwierp ze bewust (Kreon Holon 30,2W vs. gevraagd 40W · Axo Light NEST 7/10W vs. 9W · XAL UNICO Q4 15,7W vs. Q4 30W).
  **Wél gebouwd** (criterium 2 eiste het onverkort): string-bewuste, accolade-balancerende matcher i.p.v. de gulzige `[\s\S]*` (**de bug was latent, niet actief**) · kloppend commentaar · **de stille `catch` laat nu een spoor na**: event `ai_suggestion_parse_failed` + teller `parseFailed` in de `ai_vangnet_run`-payload (jsonb, geen migratie; payload bevat **nooit** de modeltekst — besluit Timo).
  **Daarmee is de uitleestabel een DB-query geworden:** `suggested: 0, parseFailed: 0` = model vond echt niets · `suggested: 0, parseFailed: >0` = wij konden het niet lezen. Dát onderscheid bestond niet, en het is precies waarom `discarded: 0` nooit bewees wat het leek.
  **Criterium 3 is afgesloten met onderbouwing, niet met een `ai_suggestions`-rij** — zoals de briefing voorschreef ("verzin geen suggestie"). De tabel is DB-breed leeg. Een rij afdwingen kan alleen door de fase te forceren, en dat verbood de briefing.
  **Live bewijs:** `ai_vangnet_run` 10:14:16 UTC met `{"phase":"tender","checked":7,"discarded":0,"suggested":0,"parseFailed":0}`. Het veld `parseFailed` bestaat alléén in de gefixte code; de twee oudere runs hebben het niet. Onafhankelijk geverifieerd. Kosten: meting €0,0654 + verificatie €0,0796; maandtotaal **€0,3091** van €10.
  *Historisch — de scope-herziening die tot dit item leidde:*
  Het vangnet gaf 0 suggesties. **De eerste aanname — "de catalogus voerde het gevraagde merk niet" — is weerlegd**: 5 van de 7 restregels kregen **8 treffers** terug (= `SEARCH_LIMIT`, dus er waren er ≥8) op merken die de catalogus wél voert (Axo Light 2×, XAL 3×, Kreon 1×, Flos 1×; alleen Lp601 en Lr701 kwamen op 0). Het model hád materiaal en stelde niets voor.
  **En dat "niets" is niet te vertrouwen:** `finalText` wordt geparsed en weggegooid (`lib/ai/vangnet.ts:679, 706, 747`) — niet gelogd, niet opgeslagen. `parseSuggestions` geeft `[]` in drie **ononderscheidbare** gevallen: regex vindt niets · `JSON.parse` gooit (stille `catch`) · de array is écht leeg. `discarded: 0` bewijst dus **niet** dat het model leeg teruggaf — een parse-mislukking geeft nul suggesties én nul discards.
  *Wél uitgesloten:* beurten-uitputting. De 21 `llm_usage`-rijen sluiten exact op 14 zoekacties + 1 slotcall per regel = 21; `MAX_TURNS_PER_LINE` (6) is nooit geraakt. Alle 7 regels producéérden een slottekst — we weten alleen niet wat erin stond.
  - *Given* een **tijdelijke** log van `finalText`, *when* een hermatch draait op `49c6340e` (al valide voer — geen nieuw project nodig), *then* is zichtbaar of het model suggesties gaf en de parser ze at, óf dat het echt niets vond.
  - *Given* die uitkomst, *then* volgt de fix: de regex `/\{[^{}]*"suggesties"[\s\S]*\}/` is **gulzig tot de laatste `}`** — proza met een accolade erachter laat `JSON.parse` stil omvallen. Fix + de stille `catch` hoort bij 0.1b (besluit Timo), met test.
  - Log gaat er ná de meting **weer uit** (besluit Timo: geen permanente opslag van modelantwoorden, geen migratie).
  - **0.1 wordt pas afgevinkt als één echte `ai_suggestions`-rij op `/projects/[id]/review` in productie staat** — óf als bewezen is dat "niets" hier het juiste antwoord was.
  - *Niet doen:* een `gegund`-project forceren om cross-merk-suggesties te ontsluiten. `phase` is afgeleid (`derivePhase`, `lib/repo/project-status.ts:68`), één schrijver, geen toggle; het zou de commerciële status wijzigen én de meting vertroebelen — cross-merk is niet het knelpunt.
- Briefing + geverifieerde stand: `docs/sprint0-1-ai-vangnet-live.md`; uitkomst in `HANDOVER.md` (entry 2026-07-16).
- ⬜ **Testproject `49c6340e` staat nog in productie** ("ZZ-TEST 0.1 vangnet 16-07") — bewijsspoor onder 0.1 én 0.1b, bewust laten staan (besluit Timo). ⚠️ **Kan níét met `scripts/cleanup-testdata.ts`**: dat scoopt op org "Van Dijk Elektro" en dit dossier heeft geen `organizationId` (zie item 2.5). Weghalen is handwerk en onomkeerbaar → **op de week 4-checklist vóór de overdracht**: geen ZZ-TEST-dossiers in productie.
- *Meegekomen in 0.1, los gecommit (al gepusht):* `step="0.01"` op het budgetveld (`4c3a849`) · budget 0 = echt plafond i.p.v. "geen cap" (`7071038`) · de permanente 301 `/dossiers` → `/projecten` wees naar een niet-bestaande route, nu `/projects` (`966191f`).

**0.2 — Repo synchroon** (~4,5 u) — ✅ **afgerond 15 jul** (PR #3). Zie `docs/sprint0-2-notitie-aan-parallelle-sessies.md`.

**0.3 — Externe aanvragen de deur uit** (~3 u) — ✅ **afgerond 16 jul**; tracking in `docs/sprint0-externe-aanvragen.md`.
- ~~(a) Resend-account + DNS-records~~ — *vervallen (besluit 6): geen mailverzending deze sprintperiode.*
- (b) ~~evaluatieset-uitvraag ligt bij de binnendienst — loopt bij Jayden~~ — **herzien 16 jul: Jayden redt het niet, Timo heeft het overgenomen en zelf gebouwd.** De evaluatieset bestaat en is beter dan de oorspronkelijke uitvraag: geen gevraagde spec-regels, maar **echte klantaanvragen uit XIS met de bijbehorende offerte als grondwaarheid**. Vier bruikbare paren in `~/Downloads/lumenlogic-testset/` (Raadhuis de Pauw · KvK Alkmaar · TNO AvB · Dordrecht), elk met een eigen `OPDRACHT.md`. Zie ook "Wat de evaluatieset blootlegde" hieronder.
- (c) XIS-attributenlijst ingediend bij Lynx, taak #107781 — Menno's team maakt de API-keys aan.
- (d) Supabase-rename afgerond; bevestigd dat Supabase niet meer gebruikt wordt (app draait op Neon) — geen impact.

**0.4 — Open vragen beantwoord & vastgelegd** (~2 u) — deel-C-besluiten hierboven vastgelegd. Testdata-check gedaan: Van Dijk weg (org, users, allowlist) en Flos op tier-1, geverifieerd via `bun run cleanup:testdata` (dry-run: "Niets te doen").
- Rest: §C wegschrijven in `docs/lumenlogic-projecten-volledig.md` (incl. het dwalende afsluitende codeblok opruimen) + de beheerder-vraag terug naar Eduard.

### Week 1 (20–24 jul) — de merkgegevens stromen binnen

**Klaar wanneer** (vault): één echt merk is van begin tot eind door de route gegaan.
**Harde voorwaarde:** migratie 0007 gecommit en op Neon — ✅ gehaald (0.2).

**1.1 — Format-validatiemodule (herbruikbare motor)** (~5 u) — ✅ **AFGEROND 16 jul**
Briefing: `docs/sprint1-1-briefing.md`; probleemstelling: `docs/sprint1-1-probleem.md`;
stand in `HANDOVER.md`. Commits `a068912` · `af16bef` · `505e798` · `bafe059` op `origin/main`.
- ✅ *Given* een geüpload .xlsx, *when* het niet ons template-format is (kolomkoppen/sheet ontbreken), *then* een duidelijke afwijzing "dit is niet ons format" met wat er mist — er wordt níéts opgeslagen.
- ✅ *Given* een correct format met inhoudelijke twijfels (lege must-velden, onbekende artikelcodes, dubbele rijen), *then* per rij dubbelcheck-waarschuwingen.
- ✅ Module is een losse lib-functie + tests, zodat week 4-uitloop B hem ongewijzigd hergebruikt.
  **Sterker dan gevraagd**: `lib/excel-validate.ts` levert *codes + parameters, geen proza*;
  `lib/excel-validate-messages.ts` draagt de taal. De validator heeft daarmee geen publiek en
  4.B krijgt geen tweede smaak.

**Onafhankelijk geverifieerd door de sprintmaster** (niet op het rapport geloofd):
`bunx tsc --noEmit` exit 0 · de 56 nieuwe tests geïsoleerd nagedraaid, **56/56 groen** ·
`bafe059` staat aantoonbaar op `origin/main` · `grep` op `excel-validate` buiten de module
zelf geeft **nul treffers** — er is geen aanroeper, dus de deploy kán bestaand gedrag niet
veranderd hebben · de HANDOVER-diff verwijdert **0 regels** (andermans secties ongemoeid).

**Twee kanttekeningen bij het rapport** (geen blokkade):
- "de 4 commits raken **nul** bestaande bestanden" is net te sterk: `HANDOVER.md` is een
  bestaand bestand en staat als `M` in de diff. Alleen aangevuld, geen regel weg — de
  strekking (geen gedragswijziging) klopt, de formulering niet.
- De 605 van de volledige suite is gemeten met het **ongecommitte werk van de
  leesroute-sessie in dezelfde working tree** (`lib/pdf/armaturenboek.ts`, `lib/repo/ocr.ts`,
  `db/test-db.ts` e.a.). Niet vals, wel geen schone meting. Daarom zijn de 56 apart gedraaid.
  ⚠️ **Twee sessies delen één working directory**: één `git add -A` sleept andermans WIP mee.
  1.1 ontliep dat door expliciete paden te gebruiken; dat is geluk noch garantie.

**Wat de bouwsessie beter deed dan de briefing** — mutatietest: de suite ging in één keer
groen, wat de sessie verdacht vond. Ze brak de module op drie load-bearing punten en vond dat
de datarij-regel **vacuüm** getest was (`eachRow({includeEmpty:false})` sloeg de 200 lege
invulrijen zelf al over). Twee tests toegevoegd die de regel wél raken. Ook signaleerde ze de
taalfout in de briefing i.p.v. hem blind te volgen (besluit W1).

**Open punten uit 1.1 → mee naar 1.2:** uploadgrootte begrenzen (geen format-oordeel, hoort
op het uploadpad) · leidende nullen gaan vóór ons verloren in Excel (instructie-kwestie) ·
een veld naar `must` promoveren is een breaking change voor merkbestanden onderweg (een
wijzigingsdetector-test pint de huidige vier vast) · **nog niet tegen een écht merk-Excel
getest** — één handmatige Google-Sheets-export-check hoort in 1.2.

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
- *(nieuw, uit 0.1b)* **Beurten-uitputting blijft stil.** Raakt `runLine` `MAX_TURNS_PER_LINE` zónder slottekst, dan is `finalText` leeg → `parseFailed: false` → opnieuw een onverklaarde nul. Zelfde blinde vlek als de stille `catch`, één laag hoger. (G4 bewijst dat dit bij `49c6340e` niet speelde.) (~0,25 u)
- *(nieuw, uit 0.1b)* **`scripts/cleanup-testdata.ts` raakt losse testdossiers niet.** Het scoopt op org "Van Dijk Elektro" (`ORG_NAME`, regel 27); dossier `49c6340e` heeft géén `organizationId` en valt er dus buiten. Óf het script verbreden, óf accepteren dat losse testdossiers handwerk zijn — maar de briefing van 0.1b ging er ten onrechte van uit dat dit script het opruimt. (~0,5 u)
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

**3.1 — Onboarding externen: PIN → wachtwoord** (~8 u) — *mechanisme gekozen 16 jul (besluit C10);
het oorspronkelijke Resend/e-mail-ontwerp is vervallen met besluit 6.*
- *Given* Brink in de instellingen, *when* Brink een gebruiker aanmaakt en aan een organisatie koppelt, *then* krijgt dat account een **tijdelijke PIN**.
- *Given* die PIN, *when* de gebruiker hem invult, *then* kiest hij direct een wachtwoord; dat wachtwoord zijn daarna zijn inloggegevens en hij zit in de juiste organisatie.
- *Given* een gebruiker die zijn wachtwoord vergeet, *when* hij zich bij Brink meldt, *then* geeft Brink een **nieuwe PIN** — zelfde pad als onboarding, géén apart resetmechanisme, geen mail nodig.
- Nog te bepalen bij het ontwerp (klein, geen blocker): hoe de PIN de gebruiker bereikt (out-of-band — telefonisch/persoonlijk) · PIN-lengte, geldigheidsduur, eenmalig gebruik, rate limiting · of intern (Timo/Eduard) ook overgaat of op magic link blijft.
- ⚠️ **Raakt Better Auth**: de app draait nu op magic link **zonder** wachtwoorden. Dit is een wissel naar wachtwoord-auth (andere plugin, hashing, sessieflow) — schat dat in vóór week 3 begint.

**3.2a — Externe toegang: route-allowlist + org-scoping** (~7 u)
- *Given* een extern account, *when* het de app gebruikt, *then* zijn alléén projecten (eigen organisatie) en catalogus bereikbaar; alle andere routes (/data, /admin, Merken, interne /analytics) worden **server-side** geweigerd (besluit 11), met tests per accounttype.
- *Given* de project-queries, *then* zijn lijst, detail, regels, review, estimate en importruns org-gescoped — een extern account kan geen enkel object van een andere org opvragen (directe-URL-test).
- *Given* de rechten, *then* admin ≠ gewone gebruiker (instellingen/uitnodigen alleen admin).

**3.2b — Prijsloze estimate voor externen** (~4 u)
- *Given* fase 0, *when* een extern account een estimate opent of de PDF downloadt, *then* bevatten scherm én PDF **géén prijzen/bedragen/totalen** — wel regels, aantallen, statussen en kleuren (eigen render-pad + sjabloonvariant, met screenshottest); intern blijft alles zichtbaar.

**3.3 — (alleen als XIS-keys binnen zijn) Lead-seintje** (optioneel)
- *Given* de Lynx-keys, *when* de installateur **de estimate bekijkt of downloadt** (trigger, besluit C1), *then* schiet er idempotent een lead in XIS.
- ⚠️ **Vóórwerk:** het "estimate bekeken/gedownload"-event bestaat nog niet en moet gebouwd worden vóór deze trigger kan werken. Geen keys → export-stub blijft, geen weekrisico; beginfase mag handmatig.

**Risico's & plan B:** ~~onboarding-mechanisme niet op tijd gekozen~~ → **opgelost 16 jul met besluit C10** (PIN → wachtwoord); het resterende risico is de omvang van de Better-Auth-wissel, niet de keuze · org-scoping raakt meer queries dan gedacht → de route-allowlist beperkt de blootgestelde oppervlakte al; scoping begint bij de projecten-keten · XIS-keys niet binnen (waarschijnlijk) → 3.3 vervalt zonder gevolgen.

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
