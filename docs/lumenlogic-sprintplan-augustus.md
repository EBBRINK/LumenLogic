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
| W2 | **1.4 draait op een testmerk, niet op een echt merk** (Timo, 20 jul) | Het criterium eist "zichtbaar in de catalogus", en dat vereist een geldige prijs. Een prijs verzinnen op een echt merk is exact de fout van 20 jul. Op een testmerk is er geen waarheid om tegen te liegen. Prijs: het weekdoel is bewezen op een *geconstrueerd* merk — de echte-merk-verificatie blijft open |
| W3 | **Uitschakelen gebeurt door de prijslijst te laten verlopen, niet met `DELETE`** (20 jul) | Demonstreert ijzeren regel 3 live in plaats van hem te omzeilen, en laat het audit-spoor heel — waardoor bewijsbaar is dat *het verlopen* het product onzichtbaar maakte en niets anders |
| W4 | **Bouwsessies pushen nooit; alleen de sprintmaster pusht** (Timo, 20 jul) | Sluit het lek dat drie keer deze week toesloeg. Kleinste ingreep die écht werkt: branches + PR voegt meer ceremonie toe dan dit team nu draagt, en "poort schrappen" geeft het toezicht op dat 1.2 en 1.4 juist waardevol maakte. Sessies committen wél — de sprintmaster pusht met een expliciete SHA (`git push origin <sha>:main`), zodat er niets kan meeliften |

**Fout van de sprintmaster, vastgelegd:** kaderpunt 4 van `docs/sprint1-1-briefing.md` schreef
"meldingen in het Nederlands" voor. Dat was fout: de sprintmaster had de Engelse nav en
`STATUS_LABEL` in dezelfde sessie zélf gelezen en trok de conclusie niet door. De bouwsessie
signaleerde de tegenspraak in plaats van de briefing blind te volgen — dat is het gedrag dat
de werkwijze beoogt. Briefing gecorrigeerd. **Les: een briefing die de codebase tegenspreekt
is een briefingfout, niet een bouwfout; blijf de briefing toetsen aan wat er staat.**

**Drie fouten van de sprintmaster in briefing 1.4, vastgelegd (20 jul).** Alle drie gevonden
door de bouwsessie, geen ervan door de sprintmaster:
1. **De eventketen telt 9 acties, niet 4.** De briefing somde er vier op. Juist de twee die
   ontbraken — `price_list_created` en `price_lines_upserted` — zijn het énige spoor dát er een
   prijs geschreven is. Wie de briefing braaf volgt, slaat de check over die het item moet
   bewijzen. (Dat die twee vandaag voor het eerst afgingen, was daarmee bijna gemist.)
2. **De briefing ging ervan uit dat "een prijslijst laten verlopen" een bestaand pad is.** Dat
   is het niet. `archivePriceList` (`lib/repo/price-archive.ts:14`) zet `replaced_at` en
   `DELETE`t de prijsregels — dat omzeilt regel 3 in plaats van hem te demonstreren, en
   vernietigt precies het bewijs dat het verlopen het product onzichtbaar maakte.
3. **De voorgestelde merknaam `ZZ-TEST Lumen Logic` was onveilig.** `fetchCandidates` stap 3b
   is niet altijd merk-gescoped (`lib/matching/engine.ts:288`) en vergelijkt merken op
   **substring** (`:294`) — een spec-regel met merktekst "Lumen" raakt dit merk dus. De
   briefing benoemde de artikelcode als eerste bescherming en zag de merknaam zelf over het
   hoofd.

**Patroon, nu vier keer op rij: de zwakte was steeds een aanname die niet tegen de bron
getoetst was** (W1 taal · `measure` als schrijf-brug · navlabel "Brands" · deze drie). En vier
keer op rij ving de bouwsessie het, niet de sprintmaster. De werkwijze werkt — de briefing is
géén gezag, alleen een startpunt — maar de conclusie voor de sprintmaster is scherper:
**grep vóór je een afbeelding, een pad of een naam claimt; niet erna.**

### Nieuw gevonden in week 1 — de scorecard rapporteert te laag (16 jul)

Gevonden door de plan-agents van 1.2, geverifieerd door de sprintmaster tegen `db/schema.ts`
en `lib/field-catalog.ts`. **Geen bug in 1.1/1.2 — een losse eind uit 0007 dat nu bijt.**

- **45 velden** staan in `lib/field-catalog.ts` als `measure: NONE` ("nog niet meetbaar")
  terwijl `products.<key>` **wél bestaat** (o.a. `sdcm`, `ean_code`, `dim_protocol`, `ugr`,
  `efficacy`, `ik_rating`, `energy_label`, alle `url_*`, alle `cutting_size_*`).
- **2 velden wijzen naar de verkeerde kolom**: `name_en → col("name")` en
  `description_en → col("description")`, terwijl `products.name_en`/`description_en` bestaan.
- **Oorzaak**: migratie `0007_datamodel_productspecs` voegde het volledige schema toe
  (besluit B4), maar de aangekondigde opvolging in `field-catalog.ts` is nooit gedaan.
  `HANDOVER.md` (§Merkrelaties) zegt letterlijk: *"Daarna is per veld alleen `measure.column`
  invullen hier genoeg."* Blijven liggen sinds 15 jul.
- **Gevolg vandaag in productie**: `bucketScore` telt alleen bij `measure.kind !== "none"`,
  dus de compleetheids-scorecard **rapporteert te laag** — Brink ziet grijs "niet meetbaar"
  waar allang data kán staan. Precies het scherm dat 1.3 tot hoofdingang maakt, en de
  scorecard waarin 1.4 moet aantonen dat de 0007-kolommen "aantoonbaar meetellen".
- **Actie**: `measure` bijwerken is een klein, mechanisch item (45 regels invullen) mét een
  test die `measure.column` tegen `db/schema.ts` toetst, zodat het niet opnieuw stil verloopt.
  **Niet in 1.2** (ander item, raakt de scorecard). Kandidaat: **vóór 1.3**, want 1.3 zet dit
  scherm in de hoofdnavigatie en 1.4 leunt erop. ⏳ **Wacht op besluit Timo.**

**Fout van de sprintmaster, vastgelegd:** `docs/sprint1-2-briefing.md` wees `measure.column`
aan als "de brug van catalog-key naar DB-kolom". Blind gevolgd had 1.2 **45 door het merk
ingevulde velden stil weggegooid** en de Engelse naam in de verkeerde kolom gezet — exact het
stil-wegschrijven dat besluit 1 verbiedt en waar het hele item tegen bedoeld is. De
plan-agents (op Fable, conform de modelverdeling) vonden het en verifieerden het tegen het
schema vóór ze bouwden. **Les: de sprintmaster leest catalogi als documentatie in plaats van
ze tegen het schema te toetsen — dit is de tweede briefingfout op rij (na W1, de taal). Toets
elke claim over een afbeelding voortaan met een grep, niet met een blik.** Tweede vondst van
dezelfde agents, ook niet in de briefing: `approveUpload` (`lib/repo/admin.ts:118`) flipt
alleen de status en past niets toe — het `brand_uploads`-precedent klakkeloos overnemen levert
een goedkeurknop die stil niets doet.

### Opvolgtaken uit week 1 — vastgelegd, bewust niet gefixt (16 jul)

Drie punten uit de live-check van 1.2. Geen ervan blokkeert; alle drie zijn ze groter dan het
item waarin ze gevonden werden.

- **`field-catalog.measure` is verouderd t.o.v. 0007** — 45 velden `NONE` terwijl de kolom
  bestaat, 2 wijzen naar de verkeerde kolom. Gevolg: de scorecard **rapporteert vandaag te
  laag** in productie. Klein en mechanisch (45 regels + een test die `measure.column` tegen
  `db/schema.ts` toetst). Kandidaat **vóór 1.3** — 1.3 zet dat scherm in de hoofdnav en 1.4
  leunt erop. ⏳ Wacht op besluit Timo. *(Volledige beschrijving hierboven.)*
- **Geen herkomstspoor per veld op het retour-pad.** `products.tier2_source` bestaat (H-09,
  bv. `{kelvin: 'parsed-from-name', cri: 'llm'}`) maar het retour-pad vult hem niet. Na
  goedkeuren is niet meer te zien of `kelvin` van het merk kwam, uit een naam geparsed is, of
  door een fixture binnenliep. De **events** houden het spoor bij, de **catalogus** niet — en
  de catalogus is wat de matcher leest. Aangedragen door de 1.2-bouwsessie.
- **Onze template-instructie nodigt clear-conflicts uit.** Het Instructions-blad zegt *"Fields
  that do not apply to your products may simply be left empty"*, en de diff leest een lege cel
  in een aanwezige kolom als *wissen* → conflict/clear (default uit, dus veilig). Bij Flos is
  dat 1 van 66. Bij een merk met 500 producten en 40 kolommen die wij gevuld hebben en zij
  niet invullen: **20.000 clear-conflicts** — niets breekt, maar het voorstel-scherm wordt
  onleesbaar. Schaalt naar **4.B** (merkportaal-self-serve). Keuze later: instructie
  aanscherpen, óf clear alleen voorstellen bij een expliciete wis-markering.

**Fout van de 1.2-bouwsessie, vastgelegd (door haarzelf erkend):** voor de live-check bouwde
ze een fixture met **verzonnen** specs (`kelvin 2700`, `cri 90`, "Brick red", prijs `899`) op
een **echt** Flos-product, en stond op het punt die goed te keuren — via precies het pad dat
"het merk heeft dit aangeleverd" betekent, op velden die de matcher sturen (kelvin matcht
exact, CRI is een minimumeis). **`New` staat default aan**, dus een klik op Approve had ze
zonder vinkje meegenomen: de conflictregel beschermt bestaande data, niet lege velden — en
daar landde de verzonnen data. De sessie beschermde tegelijk wél tegen het *herkenbare*
risico (geen testproduct in productie) — **het risico precies omgedraaid**: een artikel dat
`TEST-…-DELETE-ME` heet is opruimbaar, een foute kelvin op een echte Flos is onzichtbare
vervuiling. Gecorrigeerd: rij 4 draagt nu alleen de artikelcode + hun eigen prijs (→
unchanged, no-op), en het testartikel draagt de nieuwe data.
**Regel hieruit, geldt voortaan:** *testdata voor het retour-pad komt óf uit een merkbron, óf
staat op een herkenbaar testartikel — nooit plausibele specs op een echt product.* De code
deed niets fout; de aanname dat een fixture-waarde onschuldig is zodra hij door een echt pad
loopt, wél. Zie ook de eerdere sprintmaster-fouten (W1 taal, `measure`): **drie keer op rij
was de zwakte een aanname die niet tegen de bron getoetst was.**

### Opvolgtaken uit 1.4 — gemeld met bewijs, bewust niet gefixt (20 jul)

De 1.4-sessie had een expliciet fix-verbod: vindt ze een bug in 1.1/1.2/1.3, dan melden met
bewijs, niet repareren — een verificatie die onderweg repareert bewijst niets meer. Ze hield
zich eraan. Drie vondsten, alle drie door de sprintmaster tegen de live DB nagemeten:

- **`appliedFields` is structureel 0 bij alleen-nieuwe-producten.** In productie
  gereproduceerd: `template_apply_finished` meldt `{createdProducts: 3, appliedFields: 0}`
  terwijl er 38 velden geschreven zijn. De teller in `lib/repo/template-return.ts:518` telt
  alleen het update-pad (`:415-478`), niet het create-pad. Het event is daarmee **misleidend
  als audit-spoor**: wie op dit veld vertrouwt concludeert dat er niets is toegepast. IJzeren
  regel 5 wil dat het log klopt, dus dit is meer dan cosmetisch. Klein en mechanisch.
- **Nergens validatie dat `validFrom <= vandaag`.** Een prijslijst met een datum in de toekomst
  geeft de scorecard "prijs ✓" terwijl de catalogus leeg blijft — de twee schermen spreken
  elkaar dan tegen zonder dat iets een fout meldt. Reëel productgat, geen meetdetail; treft
  elk merk dat een nieuwe prijslijst vooruit inplant.
- **Geen event bij een gedropt veld op een nieuw product**, en `brand_template_downloaded`
  heeft `entity_id: null` (spoor niet terug te voeren op het merk).

**Vondst van de sprintmaster, ná de rapportage (niet door de sessie gemeld):** het verlopen
zet `valid_until` op `current_date - 7`, waardoor de prijslijst nu `valid_from = 2026-07-20`
met `valid_until = 2026-07-13` draagt — een venster dat achterstevoren staat. Voor regel 3
werkt dat correct (de view toetst `valid_until >= CURRENT_DATE`), en DB-breed is dit de énige
zo'n rij. Maar er is **geen CHECK-constraint** die `valid_until >= valid_from` afdwingt, in
migraties noch in Postgres — geverifieerd via `pg_constraint`. De uitschakelaar is dus geldig,
maar hij laat een logisch onmogelijke rij achter, en het schema staat dat overal toe. Kandidaat
voor een constraint; eerst besluit, want bestaande data kan hem schenden.

### Openstaand — géén besluit (bewust)

- ~~**Wie wordt beheerder?**~~ ✅ **Beslist 20 jul: Eduard wordt beheerder** en geeft anderen
  toegang. Was een aanname, nu bevestigd door Timo. Harde voorwaarde vóór week 4 is daarmee ingevuld.
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

**Vijf punten die na week 1 op Timo's tafel liggen** (geen ervan blokkeert week 2, alle vijf
worden duurder naarmate ze langer wachten):

1. **De akkoord-poort werkt niet op een gedeelde `main`.** "Stop vóór de push" beschermt niets
   als `git push` élke commit meestuurt: een andere sessie deployt jouw ongepushte werk zodra
   zij pusht. Deze week **drie keer** gebeurd. Drie opties: sessies pushen nooit (sprintmaster
   pusht) · branches + PR · de poort schrappen en commit = deploy expliciet maken. **De huidige
   situatie is de enige die niet verdedigbaar is** — hij wékt de indruk van een poort die er
   niet is.

   **De derde keer was de akkoord-poort zélf (20 jul), en dat maakt het punt beslissend.**
   De sprintmaster toonde Timo `git log origin/main..HEAD` — exact twee commits, alleen docs
   plus één script — en kreeg akkoord op precies die twee. In het gat tussen dat akkoord en
   de push commit de parallelle sessie `e1af9df` op dezelfde lokale `main`. De push stuurde
   **drie** commits. Timo's akkoord dekte er twee.

   Dit is geen slordigheid die met beter opletten weggaat. De sprintmaster deed vlak vóór de
   push nog een `git fetch` — maar keek daarbij naar `origin/main` (was die verschoven?) en
   niet naar de eigen lokale `main`, die intussen door een ándere sessie was opgeschoven.
   **Wat je toont en wat je pusht zijn op een gedeelde branch twee verschillende dingen, en
   het venster ertussen is niet te sluiten door zorgvuldigheid.** Schade hier nul (`e1af9df`
   is 2 docs-bestanden, 198 regels erbij, 0 eraf, geen app-code), maar dat was geluk, geen
   ontwerp: dezelfde race met een schema-migratie of een matcher-wijziging erin was een
   ongevraagde productie-deploy van ongereviewd werk geweest.

   **⚠️ De mitigatie die hier eerst stond, was fout — en faalde binnen een dag.** Ik schreef op
   20 jul: "push een expliciete SHA, dan gaat er niets mee". Op 21 jul deed ik dat en stuurde
   `git push origin <sha>:main` **vier** commits in plaats van één. **Git stuurt altijd alle
   voorouders mee.** Een SHA-push sluit alleen commits ná die van jou uit, nooit die eronder —
   en juist die eronder zijn van de parallelle sessies. Daardoor gingen sprint 1.5 (inclusief
   migratie `0013_merk_levensfase.sql`) en het optiekcode-werk van de leesroute-sessie
   ongevraagd naar productie, midden in hun bouwfase.

   **Dat maakt dit de vierde keer, en de tweede keer op de poort zelf.** De eerste faalde op een
   race die niet te sluiten was; deze faalde op een mitigatie die technisch niet kón werken.
   Beide keren geloofde de sprintmaster dat de poort dicht was. **Een poort waarvan de bewaker
   ten onrechte denkt dat hij dicht is, is gevaarlijker dan een open poort.**

   **Wat wél werkt, zolang er geen structureel besluit is:**
   ```
   git fetch origin
   git checkout -b push-tmp origin/main
   git cherry-pick <goedgekeurde-sha>
   git push origin push-tmp:main
   ```
   Dat zet uitsluitend de goedgekeurde wijziging bovenop `origin/main`; werk van andere sessies
   blijft liggen tot het zelf wordt goedgekeurd. Alternatief: laat de goedkeuring uitdrukkelijk
   `git log origin/main..HEAD` in z'n geheel dekken — dus ook wat anderen eronder hebben gezet —
   en wacht als dat niet mag. **Besluit W4 (alleen de sprintmaster pusht) lost dit niet op**: de
   sprintmaster pushte hier zelf, en dat was precies het probleem.

   **✅ Opgelost 22 jul — `scripts/safe-push.sh` + een pre-push-hook.** De kale
   `git push origin main` wordt door de hook geweigerd (main = productie); pushen gaat
   uitsluitend via het script, dat exact de opgegeven commit(s) rebased op de actuele
   origin/main pusht via een wegwerp-worktree en de lokale main nooit aanraakt. Daarmee zijn
   alle drie de faalmodi van deze week dicht: geen meeliftende commits (script pusht alleen de
   SHA's die je noemt), geen SHA-push-illusie (het rebaset i.p.v. voorouders mee te sturen), en
   geen reset-die-werk-wist (de werkmap wordt niet aangeraakt). Getest: hook blokkeert een kale
   push, laat een non-main-branch en de bypass door; het script slaat een al-gepushte commit
   over en houdt de werkmap schoon. **De onderste laag — productie loskoppelen van de
   `main`-branch in het Vercel-dashboard — blijft een aanrader voor Timo, maar is met de hook
   niet meer strikt nodig.**
2. **Er is nog géén enkel echt merk benaderd** — 1 relatie-rij op 430 merken. Dit is het énige
   open punt in het weekdoel, en het heeft **doorlooptijd** (een merk moet antwoorden), dus het
   kan niet in een sprintitem worden weggewerkt. Hoe langer het wacht, hoe later week 2 kan
   verifiëren dat het pad ook met échte merkdata werkt.
3. ~~**"Intre"**~~ ✅ **Gesloten 20 jul** — noch Timo noch de sprintmaster weet wat het is en
   het staat niet in de brands-tabel. Geen actiepunt. De échte vraag eronder blijft wél staan:
   **wélk merk benaderen we als eerste?** De data wijst zelf een kandidaat aan.

   Gemeten over alle merken met 20–3.000 producten (20 jul): **`kelvin` is vrijwel leeg over de
   hele catalogus.** Artemide heeft 360 van 1.699, Aromas 9 van 1.987, en álle andere merken in
   de top-12 staan op **0**. Geldige prijzen zijn er wél overal. Dat is de kern van het
   probleem in één cijfer: de commerciële laag is compleet, de technische laag waar de matcher
   op draait is leeg — precies waarvoor het merk-retourpad bestaat.

   **Advies: CLS als eerste.** Nederlands (Rotterdam), professioneel/architecturaal — dus
   kelvin, UGR en IK-waarde bepalen daar écht de match, anders dan bij de decoratieve merken
   in dezelfde lijst (Marset, Estiluz, &Tradition, It's About RoMi). 1.016 producten met 1.010
   geldige prijzen en **0 kelvin**: het verschil vóór en ná is meteen zichtbaar. Nederlands
   scheelt bovendien doorlooptijd, en dat is bij dit punt de schaarse factor.
   Alternatief als CLS niet reageert: **TossB** (Belgisch, 2.934 producten, 2.928 prijzen, 0
   kelvin) of **Serien Lighting** (Duits, 1.955/1.925, 0 kelvin).

   Stand van de merkrelaties vandaag: **twee rijen** — Flos (`verwerkt`, uit de 1.2-check) en
   het testmerk. Op 430 merken.
4. **De hoofdbalk loopt over op 375px** (Settings, Brand portal, Admin buiten beeld) — sinds
   1.3 erger, want dat scherm is nu hoofdingang.
5. **`getAllBrandCompleteness` duurt 3–4,6 s warm** op datzelfde hoofdingang-scherm.

**Opruimen: het testmerk `ZZTEST QA-14` staat in productie** (3 producten, 2 prijsregels,
prijslijst verlopen → onzichtbaar in álle zoekresultaten). Bewust laten staan: het is het
bewijsmateriaal onder 1.4 en het is onzichtbaar, dus het vervuilt niets. Weghalen mag zodra
het weekdoel is afgetekend — `scripts/testmerk-1-4.ts` documenteert wat er staat.

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

### "Groen is groen" — afgedwongen 20 jul (commits `872597b` + `38ef337`)

Uit de live-check van het Raadhuis-boek: vier XAL-regels stonden op **groen** ("voldoet
aantoonbaar") terwijl ze montagerails (VITA WALL RAIL) en 2700K/14,5W-varianten als kandidaat
toonden waar 3000K/27W gevraagd was. Oorzaak: álle `req_*` waren `null` → geen eis → geen
afwijking → `worstVerdict([]) === "groen"`. Twee gekoppelde gaten, beide gedicht:

- **Gat A — vacuous green mét merk.** De eerdere fix (`c2121a3`) dekte alleen merkloze regels;
  mét merk maar zonder toetsbare spec glipte een regel er doorheen. Nu: zonder één getoetste
  eis is groen **onbereikbaar**, ook met bekend merk — kandidaten blijven zichtbaar als lijst 2
  ("mogelijk — data onvolledig"), status `open`, de mens kiest. Zelfde guard in `upgradeOcrLine`.
- **Gat B — de boek-specs landden niet op de regel.** Het lek zat in door het model **afgekapte
  `ruwe_tekst`**: de leesroute leverde "Lr301 … SASSO PRO 100 112x106mm" en stopte vóór de
  spec-sectie, ondanks de "full row text"-instructie. Fix (`lib/pdf/rijsegmenten.ts`): het échte
  rijsegment wordt deterministisch uit de **server-side paginatekst** gesneden (model-codes als
  ankers) en `parseProductName` leest daar de specs uit — geen verzin-risico, want de bron is
  onze eigen tekstlaag. Bestaande run gebackfilld (30+ regels, met events).

**Geverifieerd op dossier `ae0eead9` (sprintmaster, onafhankelijk):** 0 regels groen-zonder-eis;
eindstand blauw 27 · rood 10 · open 4 · paars 1 · **groen 0**. De vier XAL-regels dragen nu exact
de bron: 3000K · CRI 90 · IP20/IP44 · 27W/13,1W/19,7W · 39°/57°/180°. Lr301/Lr303 werden daardoor
eerlijk **rood** — kelvin-exact ontmaskert de 2700K-catalogusvarianten. Dat is de invariant die
werkt, geen regressie.

**Meetscript-delta:** KvK van groen 28–39 → **open 49**; Raadhuis 0× groen; alle vier cases vrij
van vacuous groen.

⚠️ **Gevolg voor de verwachting:** de app is nu *eerlijk*, maar daarmee ook *leeg* — er staat
niets meer op groen, dus een estimate blijft €0,00 tot een mens kiest. Dat is bedoeld gedrag.
Wat het wél oplevert wordt pas zichtbaar na **variant-ranking op specs**: Jayden's vier artikelen
zitten mét kloppende specs in de catalogus maar staan ook ná deze fix **niet in de top-50**,
omdat specs de kandidaten wél beoordelen maar de zoekquery niet filteren. Dat is het volgende,
eigen probleemdoc — bewust niet meegefixt.

**Bijvangst genoteerd:** `parseProductName` leest een BEGA-artikelnummer ("24786W") als wattage —
pre-existing parserlimiet, alleen zichtbaar op blauwe regels.

## Vastgestelde technische feiten (niet opnieuw ter discussie stellen)

- **Elke push naar `main` deployt automatisch naar productie** (geverifieerd 17 jul:
  deployment `dpl_DyGUi8…` aangemaakt 3 s ná de push van `53c6198`; alias
  `lumenlogic.vercel.app`; geen aparte preview→productie-stap). Gevolg: de vangrail
  "stop vóór elke productie-deploy en vraag akkoord" betekent in dit project **stop vóór
  de push**. CLAUDE.md is hierop gecorrigeerd (zei eerder onterecht "pushen =
  preview-deploy"). **Besluit Timo 17 jul: zo laten, herzien vóór week 3** (zodra externe gebruikers erbij
  komen wil je wél een slagboom). Tot dan geldt voor elke sessie: akkoord vragen vóór de
  púsh, niet vóór "de deploy".

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

**Klaar wanneer** ~~(vault): één echt merk is van begin tot eind door de route gegaan.~~
**Herzien 21 jul (besluit G18):** de route is end-to-end bewezen op een **testmerk**, met vier
metingen — scorecard vóór/ná, catalogus-zichtbaarheid inclusief negatieve controle binnen
hetzelfde merk, de volledige eventketen, en het verlopen van de prijslijst als uitschakelaar.
**Dat is gehaald in 1.4** (20 jul).

**Besluit G18 (Timo, 21 jul): geen enkel echt merk wordt nu benaderd.** Timo overlegt het eerst
met Eduard. We testen intern; merken komen erop **pas wanneer Stefan ermee bezig is**.

*Consequentie, expliciet vastgelegd zodat niemand er later van schrikt:* Stefan begint rond
**21 augustus** en de einddemo is **17 augustus**. **Het hele traject tot en met de demo draait
dus op testdata.** Concreet betekent dat: van 211.317 producten heeft er nul een energielabel,
23 een garantietermijn en 20 een land van herkomst — en dat blijft zo. Elk sprintitem dat op
échte merkdata leunt, leunt tot na de demo op `ZZTEST QA-14` en `QA-15`.

*Waar dat direct op drukt:* **2.1a (interne analytics, ~8 u)** is het grootste blok van de sprint
en put uit de eventlaag. Die telt vandaag enkele tientallen events, vrijwel allemaal van de twee
testmerken. **2.2 (merk-demo-pagina)** had al "demo-seed met duidelijk gemarkeerde synthetische
events" als plan B — dat plan B is met G18 het hoofdscenario geworden, voor beide items.
Dat is geen blokkade, maar het moet in de briefings van week 2 staan als uitgangspunt in plaats
van als terugvaloptie.
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

**1.2 — Retour-pad: upload → voorstel → goedkeuren** (~9 u) — 🟡 **GEBOUWD EN LIVE 16 jul;
één DoD-punt open: de handmatige live-verificatie.**
Briefing: `docs/sprint1-2-briefing.md` · probleem: `docs/probleem-1-2-retourpad.md` · plan:
`docs/plan-1-2-retourpad.md`. Commits `f60c766` (motor) · `f26395b` (schermen) · `5999794`
(verificatie-fix) — **alle drie op `origin/main`, dus gedeployed**.

**Onafhankelijk geverifieerd door de sprintmaster:** 64 tests groen over 4 bestanden
(`template-diff` 24 · `template-return` 14 · `price-archive` 8 · `template-proposal` 18,
incl. screenshots licht/donker) · `bunx tsc --noEmit` exit 0 · **nul `db.transaction()`**
(alleen commentaar dat de neon-http-val uitlegt) · **`replacePriceList` wordt op dit pad
nergens aangeroepen** — de hazard is aantoonbaar vermeden · **geen migratie** · **geen enkel
bestand van de leesroute-sessie meegecommit** ondanks een gedeelde working tree.

**Ontwerpkeuzes (uit het rapport, geverifieerd):**
- **De hazard is opgelost, niet omzeild.** Een template = *gedeeltelijke bijwerking*; een
  regel-niveau `upsertPriceLines` archiveert alleen daadwerkelijk vervangen regels. De
  hazard-test bewijst het: upsert van 1 van 3 producten laat de andere 2 zichtbaar.
- **Het voorstel leeft in `brand_uploads` met `kind: 'template'`** — `kind` is `text`, dus nul
  migraties en géén nummer-race met de leesroute. `import_runs` viel af op zijn NOT NULL FK
  naar `project_dossiers`. De diff wordt nooit opgeslagen maar vers herberekend.
- **"Conflict"** = wissen / onverwerkbaar / bestand spreekt zichzelf tegen; **"changed"** =
  merk levert een andere waarde. Conflictregel geldt voor beide.
- **Eigen `SCHRIJF_MAPPING`** i.p.v. `field-catalog.measure` — zie de vondst hieronder.
- **Gat gedicht dat de briefing niet noemde:** `/admin/imports` liste álle staging-uploads met
  een goedkeurknop die alleen de status flipt; die zou een template-upload stil niets laten
  doen én het echte voorstel-scherm permanent dichtzetten. Nu gefilterd.

**Wat de zelfverificatie van de bouwsessie ving** (een echte bug in het werk van haar eigen
agents): bij een nieuw product draagt het ene productvinkje de hele rij, maar de apply eiste
tóch een aparte prijssleutel die het scherm nooit meestuurt. Gevolg: product aangemaakt,
prijs stil weg, product buiten `visible_products` — **ijzeren regel 3, afgevuurd door een
vinkje dat "creates the product with everything below" belooft.** Beide bestaande prijstests
draaiden op een bestáánd product en zagen het niet. Dezelfde foute conditie zat óók in de
vroege prijslijst-poort. Op één plek gerepareerd; de regressietest faalt aantoonbaar zonder
de fix.

✅ **AFGEROND 20 jul — live geverifieerd op productie, door Timo zelf uitgevoerd.**
Merk **Flos** (3 producten), bestand `lumenlogic-1.2-live-check-v2.xlsx`.
Voorstel-scherm: `2 new · 0 changed · 1 conflict · 63 unchanged · 1 new product · 0 price lines`.
Timo vinkte alléén het nieuwe testartikel aan en liet het conflict uit.

**Onafhankelijk nagemeten in de live DB door de sprintmaster:**

| Wat | Uitkomst |
|---|---|
| `TEST-1.2-CHECK-DELETE-ME` | aangemaakt · `name_en` + `kelvin 3000` · **0 prijsregels** · **`visible_products` = false** |
| `F1077009` Bellhop Glass C2 | `category_path` intact · `kelvin` leeg · **onaangeraakt** |
| Events | alle vier gelogd: `template_upload_staged` (11:28) → `apply_started` → `product_created_from_template` → `apply_finished` (11:30) |

**Wat hiermee live bewezen is, niet alleen in tests:**
- **De Google-Sheets-rondgang overleeft de validator** — werkblad behouden, 66 kolommen
  herkend. De format-verrassing die de check moest vinden: Sheets maakt van `845.00` een
  `845`. De normalisatie canonicaliseert beide → **unchanged, 0 price lines**. Zonder die
  normalisatie had elke prijs na een Sheets-rondgang als *changed* gemeld — precies de ruis
  die het voorstel-scherm onbruikbaar maakt.
- **De conflictregel werkt op echte data.** Lege cel + gevulde DB → clear-voorstel, default
  uit, bestaande categorie behouden. Niet geënsceneerd: het viel vanzelf uit echte Flos-data.
- **De veilige kant van ijzeren regel 3**: een product zonder prijs is meteen onzichtbaar.

⬜ **Opruimen (open):** `TEST-1.2-CHECK-DELETE-ME` staat nog bij Flos in productie. Onzichtbaar
via `visible_products`, dus onschadelijk — **niet forceren als FK's het blokkeren** (zelfde
afweging als testdossier `49c6340e`). Op de week 4-checklist vóór de overdracht.

**Dit is nadrukkelijk nog géén 1.4.** Het bestand is door de sprintmaster-keten zelf gevuld,
niet door een merk, en het testartikel staat niet in de catalogus (geen prijs = onzichtbaar).
1.4 eist "de nieuwe data zichtbaar in **scorecard én catalogus**" met een écht merk. De
motor is bewezen; het merk-deel niet.

**Meegekomen bewijs voor de `measure`-opvolgtaak:** de scorecard toont bij SDCM, Efficacy,
UGR, alle `url_*` en alle `cut-out_*` de tekst *"not measurable yet (field doesn't exist in
the data model yet)"* — terwijl die kolommen sinds 0007 wél bestaan. **Het scherm zegt iets
onwaars tegen Brink, live in productie.** Zie de opvolgtaak hieronder.

**Restrisico (uit HANDOVER):** het micro-venster binnen de apply blijft open — gevolg van de
neon-http-beperking, bewust geaccepteerd, zelfde patroon als de eerdere race-risico's.

*Oorspronkelijke acceptatiecriteria:*
- *Given* een merkrelatie-pagina, *when* Brink een ingevulde template uploadt die de validatie passeert, *then* toont een voorstel-scherm per veld: **nieuw gevuld / gewijzigd (oud→nieuw) / conflict** — niets staat dan al in de database.
- *Given* het voorstel-scherm, *when* Brink goedkeurt, *then* worden wijzigingen toegepast, events gelogd, en gaat de relatiestatus naar `data_ontvangen`/`verwerkt`; *when* afgewezen, *then* verandert er niets.
- Conflictregel (vooraf vastgelegd): bestaand veld wint, tenzij expliciet aangevinkt.
- ⚠️ **Hier hoort het aansluiten van `price-archive`**: `archivePriceList`/`replacePriceList` in `lib/repo/price-archive.ts` bestaan en zijn getest, maar worden **nergens aangeroepen** — oude prijsregels worden nu niet gearchiveerd. Beoogde stroom: `docs/plan-datamodel-productspecs.md` §"Prijslijst-historie".

**1.3 — Merkenbeheer als hoofdingang** (~4 u) — ✅ **AFGEROND 20 jul, live geverifieerd.**
Briefing: `docs/sprint1-3-briefing.md`. Commits `3b5d53e` (deel A: measure) · `b93bccf`
(deel B: nav) · `486ddf3` (HANDOVER) · `9785889` (navlabel → glossary-term) — alle vier op
`origin/main` en gedeployed.

**Onafhankelijk geverifieerd door de sprintmaster:** het meetscript dat op 16 jul **45**
mismatches vond (`measure: NONE` terwijl `products.<key>` bestaat) geeft nu **"GEEN —
schoon"** · tests groen · navlabels kloppen in `components/nav-items.ts`.

**Deel A — de scorecard liegt niet meer.** Gemeten op Flos tegen de productie-DB:
meetbare velden **25 → 70**, grijs **47 → 2**, bucket-1 must **83,3% → 58,3%**
(`name_en` 4/4 → 1/4 — `products.name_en` heeft 1 gevulde rij van 211.311). Precies de
instorting die besloten was; geen verzachting ingebouwd.
**De kern is de converse-test**: de oude test toetste alleen "elke `measure.column` bestaat
als kolom" en bleef vijf weken groen terwijl 45 velden fout stonden — `name_en → col("name")`
glipte erdoor omdat `name` nu eenmaal een echte kolom is. De nieuwe toetst de andere kant:
bestaat `products.<key>`, dan móét het veld die kolom meten. De bouwsessie introduceerde beide
bugvormen opnieuw en de test noemde alle drie bij naam.

**Deel B** — "Brand relations" tussen Catalog en Data; bestaand "Brand" → "Brand portal".
Label volgt `docs/i18n-glossary-xis.md:144` (besluit Timo 20 jul; de briefing zei "Brands" —
de bouwsessie signaleerde het conflict i.p.v. het stil op te lossen).

**Vier afwijkingen van de briefing, alle gemeld i.p.v. stil opgelost:** geen extra fable-agent
(de veld→kolom-afbeelding bleek triviaal — alle 45 exact key↔kolomnaam) · deel A maakte de
gedocumenteerde lek-preventie-invariant in `lib/brand-message.ts` onwaar (er lekt niets;
`dekking()` leest alleen must+wanna en de vier interne velden zijn `nice` — claim vervangen
door de smallere wáre invariant, mét test) · **deel B was géén pure navigatie-ingreep**:
`nav-link.tsx` matchte per link op prefix, dus op `/data/brand-relations` lichtten Data én het
nieuwe item op; meegefixt met longest-prefix-wint · de DoD vroeg nav-screenshottests alsof
die bestonden — er was geen enkele test voor `SiteNav`/`NavLink`; nieuw gebouwd.

### Twee structurele vondsten uit 1.3 — beide vragen een besluit

**1. ⚠️ Het akkoord-vóór-productie werkt niet op een gedeelde `main`.** Tijdens 1.3 pushte de
leesroute-sessie twee keer en nam daarbij ongevraagd 1.3's commits mee naar productie
(`66fd418` droeg deel A, `8e3a5c9` deel B + HANDOVER). Beide stonden live vóórdat de
bouwsessie iets kon vragen. Dit is **geen fout van een sessie** maar een eigenschap van git:
`push` stuurt élke commit op de branch, niet alleen de jouwe. "Stop vóór de push" is dus alleen
een rem als er precies één pusher is. **Tweede keer deze week** (1.2 had hetzelfde).
*Beide keren zonder schade — de veiligheid kwam van tests + verificatie vóór de commit, niet
van de poort.* Drie opties: (a) sessies committen wel, pushen nooit; Timo pusht — simpel, maar
Timo wordt de flessenhals · (b) sessies op branches + PR — botst met "kleine commits op main"
uit `CLAUDE.md` · (c) de poort schrappen en expliciet maken dat **commit = deploy**, dus
verifiëren vóór de commit. **Het slechtste is de huidige stand: een poort waar iedereen op
vertrouwt en die niet werkt.** Weegt zwaarder vanaf week 3 (externe accounts) en week 4
(overdracht). ⏳ Besluit Timo.

**2. ⚠️ De hoofdbalk loopt over op 375px.** Na "Anal…" vallen Settings, Brand portal en Admin
buiten beeld. **Niet nieuw** — zeven items pasten al niet (~390px nodig tegen ~290px
beschikbaar) — maar 1.3 maakt het één item erger, en dat op het moment dat het merkenscherm
hoofdingang wordt. Bewust gemeld en niet stilzwijgend geredesigned: `overflow-x-auto`,
overloopmenu of drawer is een ontwerpbesluit. ⏳ Besluit Timo. *(Kandidaat voor week 2,
"bijschaven op uiterlijk en gebruiksgemak".)*

**Meegekomen risico, door de sprintmaster gemeten:** `getAllBrandCompleteness` doet na deel A
**69 aggregaties i.p.v. 24** over ~211k rijen zonder `WHERE`. Gemeten tegen de productie-DB:
**3,0 s en 4,6 s** warm (31 merken met producten). Traag voor een scherm dat nu hoofdingang is,
niet kapot. Kandidaat voor week 2-bufferuren; meten vóór optimaliseren.

*Oorspronkelijke acceptatiecriteria:*
- *Given* de hoofdnavigatie, *when* een Brink-gebruiker "Merken" kiest, *then* opent het merkrelatie-overzicht (status, prijslijst-indicator, mini-scorecard) met kruislink naar de disclosure-tiers (toestemmings-as ≠ compleetheids-as).
- *Given* het overzicht, *when* gefilterd op "moet nog een mail" (status + `lastContactAt`), *then* toont de lijst precies de merken zonder recent contact — de outreach-werklijst.

**1.4 — End-to-end verificatie** ✅ **AF (20 jul, commit `fde77f6`)** — via een testmerk, niet een echt merk
- *Given* één merk (via Eduard of zelf-ingevuld), *when* de hele loop draait (template kopiëren → ingevuld terug → upload → voorstel → goedkeuren), *then* is de nieuwe data zichtbaar in **scorecard én catalogus** (de 0007-kolommen tellen aantoonbaar mee) met volledig audit-spoor in events.

*Onafhankelijk geverifieerd door de sprintmaster tegen de live DB (20 jul, ná de rapportage):*
- **De 0007-kolommen tellen aantoonbaar mee.** De fixture had een vooraf vastgelegd ongelijk
  vulpatroon; gemeten kwam het exact uit: 3/3 (sdcm, ean, datasheet, dim_protocol) · 2/3 (ugr,
  efficacy, supplier_page) · 1/3 (ik_rating, install_manual) · 0/3 (photometry, declaration).
  Dat patroon kán niet ontstaan als de scorecard kolommen groepsgewijs leest. Sterker nog:
  DB-breed staat `sdcm` op 3 en `ugr` op 2 over **211.314 producten** — élke niet-nulwaarde in
  die kolommen komt van dit ene testmerk. Er is geen achtergrondruis om je in te vergissen.
- **Catalogus — de helft die de Flos-check niet bewees.** 0001 en 0002 stonden in
  `visible_products`, **0003 niet**: zelfde merk, zelfde moment, zelfde prijslijst, enige
  verschil is de prijs. De negatieve controle zit dus binnen het merk, niet ernaast.
- **Events.** De volledige keten 14:24:07 → 14:47:29. `price_list_created` en
  `price_lines_upserted` staan elk op n=1 met allereerste tijdstip vandaag — **het prijzenpad
  had in productie nog nóóit gedraaid.** Attributie klopt: 15+13+10 = 38 = de "38 new" uit het
  voorstelscherm.
- **Regel 3 live.** Ná het verlopen: zichtbaar 2 → 0, terwijl producten (3), prijsregels (2,
  zelfde bedragen, som 333,33), `valid_from`, `replaced_at` (NULL) en het archief (0) allemaal
  onveranderd bleven. Controlegroep 210.117 onaangeroerd. Elke alternatieve verklaring dan
  "de prijslijst verliep" is daarmee uitgesloten.
- Commit is puur additief (4 bestanden, 540 regels erbij, 0 eraf); de vier verificatiebestanden
  zijn sinds 1.3 (`3b5d53e`) niet aangeraakt. `tsc` schoon, 70 testfiles / 748 tests groen.

**Weekdoel "de merkgegevens stromen binnen" is daarmee gehaald** — met één eerlijke asterisk:
de keten is bewezen op een testmerk. Er is nog **geen enkel echt merk benaderd**. Die
verificatie staat in de week 2-buffer en heeft doorlooptijd nodig (zie Openstaand).

**Risico's & plan B:** voorstel-diff complexer dan gedacht → conflictregel ligt vast, slimmer merge-gedrag = ná augustus · geen echt ingevulde template op tijd → 1.4 met zelf-ingevulde template, echte-merk-verificatie naar week 2-buffer.

**1.5 — Merkbeheer in het systeem zelf** (~3 u) · briefing: `docs/sprint1-5-briefing.md`
- *Given* Admin · Brands, *when* een Brink-gebruiker een merk toevoegt of bewerkt, *then* staat
  dat merk in Brand relations en is elke schrijfactie gelogd — zonder dat een van de 437
  bestaande merkrijen verandert.

**Waarom dit item er is:** om in 1.4 een testmerk te maken moest een constante in een script
worden gewijzigd. Er is geen enkele manier om via de app een merk aan te maken — geverifieerd:
`app/admin/brands/page.tsx` toont alleen disclosure-tier en veldzichtbaarheid.

*Zes besluiten uit de grill-sessie met Timo (20 jul):* **G1** levensfase modelleren i.p.v. kale
CRUD (de status zit nu in de naamtekst) · **G2** de 437 bestaande merken blijven exact zoals ze
zijn, 1.5 bouwt alleen het vermógen · **G3** uitbreiden van Admin · Brands, geen nieuw portal ·
**G4** verwijderen blokkeert met uitleg en biedt de levensfase aan · **G5** dubbele naam/code
waarschuwt maar blokkeert niet (Flos, Flos Architectural en Flos SOFT Architectural delen L028
en zijn écht drie merken) · **G6** alleen identiteitsvelden, want korting en betaaltermijn komen
uit de bronimport.

*Gemeten stand:* 437 merken, waarvan **405 met nul producten** — dat is geen rommel maar de
outreach-werklijst. Slechts **18 merken** dragen een annotatie in de naam ("BESTAAT NIET MEER",
"Boom / BEGA"), alle 18 zonder producten. **19 dubbele merkcodes**; `L062` hoort bij 5 merken.

*Twee vallen die de briefing vastlegt:* een **unieke index kan niet** (19 dubbele codes staan in
productie en moeten blijven), dus de dubbelcheck hoort in de applicatielaag · **verwijderen is
voor 32 merken onmogelijk** omdat `products.brand_id` geen cascade heeft (`db/schema.ts:347`) —
de knop moet vóóraf tellen wat er hangt, niet de databasefout vertalen.

*Bewust buiten scope:* milieu-info per merk en merkpagina's (Timo wil ze, maar later) · de
opvolger-verwijzing voor de 5 "opgegaan in"-merken — die vraag is gesteld en niet gekozen, en
vraagt een self-reference-migratie met raakvlak met de matcher. **Opvolgtaak, niet bouwen.**

**1.5 — Merkbeheer in het systeem zelf** ✅ **AF (21 jul, commit `dc31cc1`)**

*Onafhankelijk geverifieerd door de sprintmaster tegen de live database:*
- **Migratie 0013 is puur additief** — `CREATE TYPE brand_lifecycle` + `ADD COLUMN ... DEFAULT
  'actief'`. Geen backfill, geen index, geen unique constraint. In PG11+ is dat metadata-only,
  dus geen table rewrite.
- **De 437 bestaande merken zijn ongewijzigd.** Gemeten: 438 rijen totaal, waarvan 437 zonder het
  testmerk `ZZTEST QA-15`; **alle 18 merken met een annotatie in de naam staan er nog woordelijk**
  ("Alt Lucialternative = Leucos geworden", "Bernd Beisse (NIET MEER GEBRUIKEN)", …). Er is dus
  niets opgeschoond — besluit G2 is gerespecteerd.
- **Levensfase staat op `actief` bij alle 438** — precies wat een kolomdefault zonder backfill
  hoort te geven.
- `bunx tsc --noEmit` schoon; **74 testfiles, 805 tests groen** (de test die de bouwsessie als
  flaky meldde, slaagde hier).

*Enum met drie waarden, niet twee:* `slapend` = een besluit van Brink ("niet meer gebruiken",
3 merken), `bestaat_niet_meer` = een uitspraak over de wereld (10 merken). Met twee waarden zou
Timo bij drie merken een onwaarheid vastleggen.

**Twee fouten in mijn briefing, gevonden door de bouwsessie en door mij bevestigd tegen
`pg_constraint`:**
1. **De foreign-key-lijst was fout.** Ik schreef dat `categories` en `organizations` naar
   `brands` verwijzen — **die verwijzen er helemaal niet naar.** En ik liet `price_lists` weg,
   dat wél blokkeert. De werkelijkheid: blokkeren = `products`, `price_lists`, `enrichment_runs`,
   `leads`; cascade = `brand_aliases`, `brand_field_visibility`, `brand_relations`,
   `brand_uploads`. Ik had regelnummers uit `db/schema.ts` geteld in plaats van het de database
   te vragen — precies de fout die ik anderen aanraad te vermijden.
2. **"405 merken zijn vrij verwijderbaar" was fout: het zijn er nul.** Gemeten: **elk merk heeft
   precies één prijslijst — 438 van 438**, ook merken zonder enig product. Die lege lijst is bij
   405 merken de énige blokkade. Dat verplaatst de blokkeer-melding van uitzondering naar
   normaalgeval, en het is de reden dat het scherm de prijslijst bij naam mét het aantal
   prijsregels noemt.

**Daarmee is dit de vijfde keer** dat een aanname in een sprintmaster-briefing door de bouwsessie
is gevangen in plaats van door de sprintmaster. Het patroon is elke keer hetzelfde: iets uit de
broncode *gelezen* in plaats van het bij de bron *opgevraagd*.

**⚠️ 1.5 stond al op productie vóórdat de sessie erom vroeg** — meegelift met de foute SHA-push
van de sprintmaster op 21 jul (zie het openstaande punt over de akkoord-poort). De sessie hield
zich correct aan "stop vóór de push"; de sprintmaster niet.

*Opvolgtaken uit 1.5, bewust niet gerepareerd:* N+1 in `app/admin/brands/page.tsx`
(`listBrandFieldOverrides` draait één query per merk over 437 merken — bestond al vóór 1.5) ·
`components/data/brand-message.test.tsx` is flaky onder volle suite-belasting · de
opvolger-verwijzing voor de 5 "opgegaan in"-merken.

**1.6 — De scorecard vertelt de waarheid over merkdata** ✅ **AF (21 jul, commit `8c0776e`)** · briefing: `docs/sprint1-6-briefing.md`
- *Given* een merk met een verlopen prijslijst, *when* je de scorecard bekijkt, *then* toont de
  prijsbalk wat het merk heeft aangeleverd — terwijl de catalogus onveranderd leeg blijft.

**Besluit G7 (Timo, 21 jul):** de compleetheidsmeting laat de voorwaarde
`pl.valid_until >= current_date` vallen (`lib/repo/brand-relations.ts:169`). Alle andere velden
meten `count(*) filter (where <kolom> is not null)` op de producttabel; alléén het prijsveld eist
een geldige lijst. Die asymmetrie is de bug.

**Waarom het ertoe doet:** dit scherm is de outreach-werklijst. Zakt de prijsbalk naar 0% zodra
een lijst verloopt, dan leest dat als "dit merk heeft ons nooit prijzen gegeven" en stuur je de
verkeerde mail — het merk hééft geleverd, je hebt een *verlenging* nodig. Compleetheid hoort te
meten wat is aangeleverd; zichtbaarheid meet wat de matcher mag zien. Nu beantwoordt één balk
beide vragen en daardoor geen van beide goed.

**Live waargenomen (21 jul).** Timo maakte bewust een prijslijst met een verkeerd jaartal
(1-8-2006 t/m 1-8-2007) op testmerk `ZZTEST QA-15`. Resultaat: `Gross list price — MUST — 0%`
terwijl artikelcode, naam, categorie en EAN op 100% stonden en de prijzen gewoon in `prices`
zaten. Niets in het scherm verklaarde het verschil.

**Waarom dit ijzeren regel 3 niet schendt:** regel 3 gaat over *zoekresultaten*. De scorecard is
een interne meting achter de login, toont geen bedragen en voedt de matcher niet. `visible_products`
blijft ongemoeid — dat is meteen de belangrijkste acceptatiecheck: compleetheid beweegt,
zichtbaarheid niet. IJzeren regel 2 blijft ook intact: de meting blijft een `EXISTS`, het bedrag
wordt nooit gelezen.

**Besluit G8 (Timo, 21 jul) — het verloop-signaal komt er wél, en overal.** Zodra de
datumvoorwaarde uit de meting is, moet het scherm zelf vertellen dat de lijst verlopen is, anders
toont het 67% zonder te verklaren waarom de catalogus leeg is. Geverifieerd: de **merkpagina
draagt vandaag geen enkel prijslijst-signaal** — de badge bestaat alleen in de merkenlijst en op
`/data/price-lists`. "Overal" = één gedeelde component op elk intern scherm waar het merk als rij
of pagina voorkomt, in het gewicht dat bij dat scherm past; niet vier keer dezelfde banner. De
tekst noemt de einddatum en zegt **verlenging** (het merk hééft geleverd), en toont nooit een
bedrag (regel 2). **De catalogus is de uitzondering:** daar verdwijnt het merk volledig uit
`visible_products`, dus er is geen rij om een waarschuwing aan te hangen — juist waar iemand het
effect merkt, kun je het niet uitleggen. Dat is een eigen ontwerpvraag die regel 3 raakt:
opvolgtaak, niet bouwen. Hierdoor groeit 1.6 van ~1 u naar ~2 u.

**Besluiten G9–G12 (Timo, 21 jul) — de scorecard zelf.** Timo vroeg om een percentage per
categorie en onderaan een percentage per MUST / WANNA / NICE. De grill maakte de opdracht
scherper: **categorie 1 t/m 10 gaan uitsluitend over wat we in het Excel-template hebben
gevraagd** (G9) — *"ik wil ook dat 1 tot en met 10 eigenlijk alleen maar gaat over de informatie
die we daadwerkelijk in het Excel-sheet hebben gevraagd"*. De zes interne velden verhuizen naar
een eigen **"11. Internal"** (G10, niet verbergen — Timo wil ze zien, alleen niet meegewogen),
de totalen gaan over 1 t/m 10 (G11), en de weging is **per veld** (G12).

*Gemeten:* 72 velden, waarvan **66 in het template** en 6 erbuiten — en dat zijn exact de zes
`internalOnly`-velden, alle zes in Commercial. `excelColumns()` geeft eveneens 66, dus die
functie kan de bron zijn en "wat we vragen" en "wat we scoren" kunnen niet uit elkaar lopen.

*Twee gevolgen:* na de verhuizing zijn **alle 66 velden meetbaar** — de twee grijze "not
measurable"-velden waren allebei intern, dus dat randgeval verdwijnt uit 1 t/m 10. En
**Commercial gaat van 7 naar 1 veld**, wat G12 noodzakelijk maakt: bij categoriegewogen totalen
zou één prijs invullen evenveel opleveren als elf lichtmetingen.

*Geen extra databasevraag nodig:* `bucketScore()` (`lib/field-catalog.ts:270`) berekent per
categorie al `must`/`wanna`/`nice` met een dekkingsratio, en de component krijgt dat binnen —
hij gebruikt het nu alleen om te bepalen of de balk donkergroen mag zijn. Dit is aggregatie en
weergave, geen rekenwerk erbij.

**1.6 draagt nu drie delen** (A: de meting, B: de verloop-waarschuwing, C: de scorecard) en
groeit naar ~4 u. Ze zitten alle drie op hetzelfde scherm en dezelfde component; los uitvoeren
zou drie keer over `brand-scorecard.tsx` betekenen met een bewegende basislijn. **Volgorde: C
vóór A vóór B** — C verandert welke velden meetellen, A verandert één cijfer, B verklaart het
gevolg.

**Val voor de bouwsessie:** het commentaar dat de oude meting beschrijft staat op **drie** plekken
(`lib/repo/brand-relations.ts:137` en `lib/field-catalog.ts:14` + `:34`). Een scorecard die niet
meer doet wat het commentaar belooft, is precies hoe `field-catalog.measure` vijf weken achterliep.

*Onafhankelijk geverifieerd door de sprintmaster:* **11 buckets, `templateBuckets()` geeft er 10
met samen 66 velden = `excelColumns()` = 66**, bucket 11 "Internal" draagt alle zes interne velden
en er lekt er geen enkele naar categorie 1–10. `visible_products` **210.119**, onveranderd.
`tsc` schoon, **76 testfiles / 868 tests groen**.

*De meting die de sprint samenvat:* ZZTEST QA-14 (verlopen lijst) en QA-15 (geldige lijst) tonen
nu een **identieke compleetheid** — beide prijs 2/3 — terwijl QA-14 **0** producten in de catalogus
heeft en QA-15 er **2**. Vóór 1.6 stond QA-14 op 0%. Compleetheid meet aanlevering, zichtbaarheid
meet geldigheid.

*Vondsten van de bouwsessie die de briefing niet had:*
- **Een vierde commentaarplek** (`lib/field-catalog.ts:91-92`) beweerde dat "prijs ✓ niet naast
  een verlopen lijst kan staan" — precies wat 1.6 mogelijk maakt. De briefing noemde er drie.
- **De prijslijst 2006–2007 uit de briefing bestond niet meer** (de sprintmaster had hem
  rechtgezet). Het vóór/ná-merk is QA-14, niet QA-15; QA-15 is het regressie- en narekenmerk.
- **`getAllBrandCompleteness` werd 3,5× sneller**: 4,2–4,6 s → **1,2–1,5 s** warm. Dat stond als
  risico in de briefing ("meet het even") en pakte de andere kant op uit.
- **Na de verhuizing houdt categorie 1–10 nog vier MUST-velden over**, waarvan de prijs er één is.
  Deel A verschuift het MUST-totaal daardoor tot 25 procentpunt — de reden dat de volgorde
  C → A → B klopte en dat beide apart gemeten zijn.

*Twee tests gingen om, niet één* (de DoD noemde er één): de prijs-EXISTS-test en de
bucket-telling 10 → 11. Beide omdat het contract veranderde; de verloren dekking is overgenomen
door een nieuwe test die assert dat `visible_products` de datum wél blijft handhaven.

*De sessie corrigeerde haar eigen agents twee keer:* agent 2 meldde de suite groen terwijl hij dat
niet was, en agent 2's screenshots lieten de scorecard vanaf categorie 3 blanco omdat
`page.screenshot()` alleen de 800px-viewport schildert. De sessie voegde captures op volle hoogte
toe en bekeek ze zelf — precies wat de DoD vraagt.

*Opvolgtaken:* de catalogus-uitzondering (verlopen merk = geen rij om een waarschuwing aan te
hangen) · **latent lek in `brand-message.ts`**: dat bucket 11 nooit in de merkmail belandt hangt
eraan dat de vier meetbare 🔒-velden toevallig allemaal op `nice` staan — krijgt
`purchase_price_excl_vat` ooit een kolom, dan verschijnt "Internal" in de mail náár het merk ·
`priceListIndicator(validUntil)` zonder `today` op de merkpagina · `max(valid_until)` als "de"
prijslijst in `listBrandRelations`.

**1.7 — Milieudata: de afstand tot Brink Licht** ✅ **AF (21 jul, commits `740cb97` t/m `7d68fdc`)**

*Onafhankelijk geverifieerd door de sprintmaster tegen de live database:*
- **436 merken aangemaakt op 2 juli** (de bronimport), plus `ZZTEST QA-14` (20 jul) en
  `ZZTEST QA-15` (21 jul). Geen van de 436 draagt een milieuveld — `factory_location` en
  `factory_distance_km` zijn daar **0 keer** gevuld.
- **Beide CHECK-constraints staan in de database**, niet alleen in de code:
  `factory_distance_km IS NULL OR > 0` en `km IS NULL OR factory_location IS NOT NULL`. Die
  tweede maakt besluit G14 een schemaregel in plaats van een afspraak — hij bindt daarmee ook
  een toekomstig 4.B-schrijfpad.
- **Het Brink-adres staat exact één keer in de code**: `lib/brink.ts:6`. DoD 5 gehaald.
- **Het event draagt from/to-waarden**, niet alleen veldnamen:
  `brand_environment_changed {from:{km:null,location:null} → to:{km:980,location:"Bovezzo, Italië"}}`.
  Dat is de juiste keuze voor precies dit veld — de briefing legt vast dat een merk er belang bij
  heeft laag te schatten, en "iemand wijzigde de afstand" zonder de oude waarde is geen audittrail.
- `tsc` schoon; 872 tests groen op de tweede run.

**Mijn zesde briefingfout, en de eerste die ik zélf had geverifieerd.** De briefing sprak van
**437 bronimport-merken**. Het zijn er **436**: de 437e was `ZZTEST QA-14`, mijn eigen testmerk uit
1.4. Erger dan een telfout — ik heb dat getal bij de verificatie van 1.5 nagemeten en afgetekend.
De *invariant* die 1.5 bewees blijft geldig (die 437 rijen zijn inderdaad niet gewijzigd); alleen
het **label** klopte niet. Gevolg voor later: wie 437 als basislijn gebruikt neemt een testmerk mee,
en zodra QA-14 ooit wordt opgeruimd breekt de fingerprint en lijkt dat op dataverlies.
**Vanaf nu is de basislijn 436, afgebakend op `created_at::date = '2026-07-02'`, niet op een
totaaltelling.**

**G16 is bewust niet gevolgd, en terecht.** De briefing wilde het veld registreren in
`lib/field-catalog.ts`. Dat is inhoudelijk verkeerd: die catalogus meet **productkolommen** en
beschrijft wat we in het **merk-Excel vrágen**. Dit is een merkveld dat Brink zelf invult. Beide
planners kwamen daar onafhankelijk op uit. G16 blijft gelden voor productvelden (sprint 1.8), niet
voor merkvelden.

*Twee botsingen die de sessie beslecht heeft:* geen derde kolom `factory_distance_basis` — een
verhuizing maakt álle afstanden tegelijk verdacht, dus een stempel per rij lost niets op wat het
event met actor en tijdstip niet al draagt · de milieuvelden ook op het **aanmaak**scherm, tonen
én schrijven, want een formulier dat een veld toont en de invoer stil weggooit is precies het
faalpatroon dat dit project al een keer gekost heeft.

*De sessie corrigeerde haar eigen bouwagent:* die meldde dat de screenshots correct renderden;
bij eigen inspectie stond de legend "Environment" even dicht op het eerste label als een label op
zijn eigen invoerveld, waardoor het als twee gestapelde labels las in plaats van als het eigen
kopje dat Timo vroeg. Zelf gerepareerd (`9e3882e`).

*Opvolgtaken:* `deleteBrand` kan `{ok:true}` melden zonder DELETE en zonder event bij een race ·
`updateBrand` laat een edit op een verwijderd merk als geslaagd ogen · de 1.5-fingerprint is niet
reproduceerbaar omdat die sessie alleen de veldnamen vastlegde en niet de SQL — de letterlijke
query ligt nu vast in `docs/sprint1-7-fase1-probleem.md`.

*Testdata in productie:* `ZZTEST QA-15` draagt nu `Bovezzo, Italië / 980 km`. Bewust, buiten de
fingerprint.

**Flake gepromoveerd tot opvolgtaak.** `components/data/brand-message.test.tsx` (de
clipboard-`waitFor`) is nu in **drie** opeenvolgende sessies onder volle suite-belasting
omgevallen: 1.5, 1.6 en 1.7. Geïsoleerd is hij 6/6 groen in 1,9 s; in de volle suite kost hij
**36 s met twee retries** vóór hij faalt. Dat is geen ruis meer maar een test die de suite duur en
onbetrouwbaar maakt — en die daardoor echte regressies kan maskeren. (1.7 schreef hem toe aan
`pdf-upload.test.tsx`; dat klopte niet, het is `brand-message.test.tsx`.)

 · briefing: `docs/sprint1-7-briefing.md`
- *Given* het merkbeheerscherm, *when* je bij een merk de fabriekslocatie en de afstand tot Brink
  Licht invult, *then* staat dat onder een eigen milieukopje, is het gelogd, en zijn de 437
  bronimport-merken ongewijzigd.

**De grill haalde de scope met driekwart terug.** Timo vroeg om garantietermijn, energielabels en
de afstand tot Brink. Gemeten: **drie van de vier bestaan al** en staan al in het merk-Excel —
`warranty_months` en `country_of_origin` in categorie 10, `energy_label` in categorie 8. Timo:
*"als het aan de Excel staat, is het goed. Dan had ik het gewoon net over het hoofd gezien."*

**Het echte probleem is dat ze leeg zijn**, niet dat ze ontbreken: over 211.317 producten heeft
`energy_label` er **0**, `warranty_months` **23**, `country_of_origin` **20**. Wij vragen ernaar
en er komt niets terug. Dat is een outreach-probleem — 1.7 lost het niet op, en dat is opnieuw een
argument voor de eerste echte merkbenadering.

*Besluiten:* **G13** alleen de afstand is nieuw · **G14** sla kilometers **én** fabriekslocatie op
(anders is het getal niet te controleren en klopt alles stil niet meer als Brink verhuist) ·
**G15** het merk mag aanleveren, maar via review — *"wij drukken op ja of nee en dan gaat het
live"*, wat exact het bestaande retour-pad is · **G16** uitbreiden via de veldcatalogus, met een
recept in `docs/milieuvelden-toevoegen.md` voor Stefan.

**Spanning die in de briefing staat:** G15 werkt vandaag voor productdata, maar er is **geen
kanaal voor merkdata**. Het merk-Excel bestaat uit productrijen, en het merkportaal kan niets
opslaan — geverifieerd: `app/brand/data/page.tsx` is puur inzage. Daarom vult Brink de
fabriekslocatie in op basis van wat het merk per mail antwoordt; het invoerkanaal is 4.B.
**Belangenconflict genoteerd:** de kilometers zijn de afstand tot óns adres, dus zodra dat
meeweegt in een duurzaamheidsvergelijking heeft een merk belang bij laag schatten. De locatie is
hun feit, de afstand onze berekening.

**Stefan** (nieuwe stagiair, start rond 21 aug 2026) baseert een groot deel van zijn studiecasus
op de milieuberekeningen. Het recept is daarom een deliverable met een eigen toets: de bouwsessie
voegt zélf een veld toe door alleen het eigen recept te volgen.

Brink Licht: **Veldzigt 30A, 3454 PW Utrecht** — op één plek in de code vastleggen.

**Het recept voor Stefan is uit 1.7 gehaald** en verhuisd naar 1.8, zie hieronder.

**1.8 — Velden toevoegen zonder de app te verlaten** ✅ **AF (21 jul, commit `ba90f8c`)** · briefing: `docs/sprint1-8-briefing.md`
- *Given* de app, *when* Stefan een milieuveld toevoegt zonder code, *then* staat het in het
  eerstvolgende merk-Excel, telt het mee in de scorecard, overleeft een waarde het hele retour-pad
  — en kan de matcher er niet bij.

**Besluit G17 (Timo, 21 jul) — draait G16 om.** G16 was: uitbreiden via de veldcatalogus met een
recept in de docs. Timo wil dat **Stefan het systeem niet uit hoeft**. De reden is legitiem: een
handleiding maakt hem afhankelijk van iemand die code kan lezen, en dat was precies wat we wilden
voorkomen. Gevolg: het recept schrijven we mét het scherm, niet ervoor — een handleiding over het
toevoegen van een regel code zou binnen twee weken achterhaald zijn.

**Volgorde vastgelegd (Timo):** *"we wachten tot 1.6 klaar is, dan kijken we hoe ze het gebouwd
hebben en dan bouwen we daar weer tegenaan."* 1.8 start dus pas ná 1.6 en voegt zich naar het
model dat 1.6 achterlaat.

*Waarom dit 6–8 u is en geen middag:* **dertien bestanden lezen de veldcatalogus**, `db/schema.ts`
incluis. Het werk zit niet in het formulier maar erin dat elk van die lezers een tweede soort veld
moet begrijpen. **Verboden weg:** de app zijn eigen schema laten aanpassen (`ALTER TABLE` vanuit
een knop) — dev en prod zijn één database, dus een typefout is meteen een kolom in productie en
de migraties lopen uit de pas. **Gekozen weg:** definities in een eigen tabel, waarden in JSONB;
dat patroon bestaat al (`products.tier2_source`).

*Harde eis:* een zelf toegevoegd veld mag de **matcher nooit** bereiken, en de bouwsessie moet
aantonen dát het onmogelijk is — niet dat het niet gebeurt.

*Onafhankelijk geverifieerd door de sprintmaster tegen de live database:* de tabel `custom_fields`
en de kolom `products.custom_values` bestaan (migratie 0015) · **geen van de 436 bronimport-merken
is aangeraakt** · precies **één** product draagt een testwaarde · `tsc` schoon en **80 testfiles /
951 tests groen** · het merk-template telde tijdens de demonstratie **67** kolommen en staat na
archivering weer op **66**.

*Correcties op mijn briefing, beide terecht:*
- **Het zijn 9 lezers van de veldcatalogus, niet 13.** Vijf importeren alleen types of een losse
  constante. De echte kern is drie afgeleide functies.
- **De gevaarlijkste lezer importeert de catalogus helemaal niet.** `lib/template-diff.ts` koppelt
  eraan via de conventie dat `SCHRIJF_MAPPING` op catalog-key gesleuteld is — zonder import, dus
  de compiler ziet die koppeling niet. Een eigen veld had daar stil als `not_storable` geëindigd:
  zichtbaar op het voorstelscherm, niet opslaanbaar. Precies waar DoD 4 stil zou falen.
- **Val 1 was erger dan ik schreef.** Een botsend label geeft geen "stil de verkeerde kolom
  vullen" maar `dubbele_kolomkop` — een **harde afwijzing van het hele bestand, voor alle merken
  tegelijk**.
- **Val 3 had een kant die ik niet zag.** `lib/repo/brand-relations.ts:172` interpoleert de
  kolomnaam met `sql.raw`. Zodra een gebruiker die naam bepaalt is dat een injectiepoort. Eén
  JSONB-kolom maakt de meting voor elk veld dezelfde uitdrukking met de sleutel als **parameter**.

*De scherpste ontwerpkeuze:* een `must` op een **eigen** veld wijst nooit een bestand af. De harde
afwijzing bestaat omdat catalogus-musts dragend zijn voor de verwerking zelf — zonder artikelcode
is er geen sleutel. Een veld dat Stefan vandaag aanmaakt kan dat per definitie nooit zijn. Zou het
tóch afwijzen, dan maakt **één klik elk merkbestand dat al onderweg is onbruikbaar** — bestanden
die geen enkel merk had kúnnen invullen.

*Sleutel is een uuid, geen leesbare slug:* een slug uit het label plus hernoemen betekent dat een
veld dat "Recycled content" heet voor altijd de sleutel `cf_energieverbruik` draagt. Dat is exact
het soort stille mismatch dat `field-catalog.measure` vijf weken heeft laten achterlopen.

**De suite is breder flaky dan gedacht.** Naast `brand-message.test.tsx` vallen ook
`components/admin/brand-admin.test.tsx` en de nieuwe `custom-fields.test.tsx` wisselend om onder
volle belasting, alle drie met "Matcher did not succeed in time", alle drie geïsoleerd groen.
`brand-admin` is door 1.8 niet aangeraakt. **Dit is een suite-conditie, geen bestandsprobleem** —
"er is één bekende flaky test" klopt niet meer. Kandidaat voor de week 2-bufferuren.

**Fout van de sprintmaster bij het pushen (21 jul).** Mijn pushcommando nam aan dat `0036ca4` nog
gepusht moest worden; die stond al op `origin`. De cherry-pick liep vast en de `git reset` daarna
haalde sprint 1.8 van de branch af. Werk stond nog op schijf, commit bestond nog, alles hersteld —
maar de les staat hier omdat het de derde pushfout van de week is: **controleer wat er al op
`origin` staat vóór een reset, in plaats van het aan te nemen.**

*Opgeruimd:* vijf `sprint1-8-wip-*`-stashes van een parallelle sessie, alle vijf nagelopen en
achterhaald door `HEAD`. Het testveld is gearchiveerd zodat het merk-template terug op 66 staat.

*Twee vallen die in de briefing staan:* het Excel matcht kolommen op **labeltekst**, dus een eigen
veld dat "EAN code" heet maakt het bestand dubbelzinnig · en `measure` is de brug die in juli al
eens vijf weken achterliep, waardoor de scorecard te laag rapporteerde — een tweede soort veld
verdubbelt dat risico.



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
- *(nieuw, uit de live-check 20 jul)* **`outcome.reason` wordt nergens per regel gepersisteerd** — de matcher bepaalt een reden (bv. "te weinig gevraagd om gelijkwaardigheid aan te tonen", fix `c2121a3`) maar alleen de blauw-inlaadwachtrij gebruikt hem; op de regel zelf is de reden later niet terug te lezen. Pre-existing gat, gevonden bij de vacuous-green-fix. (~1 u)
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
