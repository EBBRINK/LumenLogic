# Reviewzwerm 2.5a — bevindingen

**Gemeten tegen:** `origin/main` = commit `0d3850a` ("G40: deploy 1 van 3.1 migreert voor de
push, er is geen migratiestap"), 31 juli 2026.
**Omvang:** ~40.000 regels productiecode (excl. tests) in `app/`, `lib/`, `db/`, `components/`;
137 testbestanden; 16 `"use server"`-bestanden met 68 exported server actions.
**Werkwijze:** zeven finder-agents langs gescheiden assen, daarna elf onafhankelijke
weerleg-agents die de opdracht kregen elke bevinding te **weerleggen**, niet te bevestigen.
Bij twijfel verviel de bevinding. Er is geen regel code gewijzigd; de repo is schoon.

> **Wat deze lijst is.** Een gerangschikte bevindingenlijst, geen werkplan. Wat er gerepareerd
> wordt bepaalt Timo. De rangschikking is impact × moeite, waarbij "impact" betekent: wat gaat er
> mis voor een gebruiker of een klant, niet hoe erg het klinkt.

---

## Leeswijzer bij de rangschikking

| Rang | Betekenis |
|---|---|
| **A** | Raakt een klantdocument of een cijfer waar geld aan hangt, en gebeurt bij normaal gebruik. |
| **B** | Echt defect, maar vraagt een minder gewone toestand — of raakt intern werk in plaats van de klant. |
| **C** | Klopt aantoonbaar, maar de schade is beperkt of komt pas na week 3. Hygiëne en houdbaarheid. |

Elke bevinding is door een tweede agent aangevallen. Waar die de ernst heeft bijgesteld, staat
dat er expliciet bij — dat is vaak nuttiger dan de bevinding zelf.

## De lijst in één oogopslag

| # | Bevinding | Moeite | Kern |
|---|---|---|---|
| **A1** | Gekozen product draagt afwijkingen van een ánder product | klein | verkeerde cijfers op het klantstuk |
| **A2** | Auto-accept omzeilt Gat B op onbevestigde bron | klein | match zonder mens, op onze eigen aanname |
| **A3** | Kiezen uit lijst 2 → groen, ook op nul getoetste velden | klein | "groen" betekent twee dingen |
| **A4** | Status `open` valt buiten totaal én p.m.-verantwoording | klein | onverklaarde "p.m." op de PDF |
| **A5** | Brutoprijs publiek zonder sessie; tier1 is fail-open | klein | ijzeren regel 1 |
| **A6** | Leesroute synchroon in de action, geen `maxDuration` | groot | import die half slaagt |
| **A7** | Dagprijs met verlopen geldigheid blijft eeuwig staan | midden | oude prijs op de offerte |
| **A8** | "Dagprijs wint" in 3 kopieën, 2 ongetest | klein | mutatie ontsnapt aan de suite |
| **A9** | Half mislukte import laat duplicaten toe (bewezen) | midden | verdubbelde aantallen |
| **B1** | Geen eigendomsmodel; `requireSession` is de enige poort | groot | latent tot week 3 |
| **B2** | Allowlist trekt lopende sessie niet in | klein | tot 7 dagen toegang na verwijderen |
| **B3** | Geen weg terug voor een verlopen prijslijst | midden | UI schrijft remedie voor die niet bestaat |
| **B4** | `/catalog` scant de catalogus voor een dropdown | klein | 262 ms onvoorwaardelijk |
| **B5** | Merkconditie niet-indexeerbaar | midden | 153 ms vs 0,8 ms |
| **B6** | `addSpecCsvAction` zonder bovengrens | klein | zelf-DoS, cap bij 2978 |
| **B7** | 5 schrijfacties zonder actor; `deleteSpecLine` zonder spoor | klein | audit-gat |
| **B8** | 5 handgebouwde primaries, test ziet ze niet | midden | valse zekerheid |
| **B9** | 26 formuliervelden op 32/36px tegen O9 in | midden | vastgelegde norm |
| **B10** | 9 plekken met afgeschafte shadcn-resten | klein | twee focusstijlen |
| **B11** | 141 screenshot-tests zonder assertie; 3 schermen nul dekking | midden | suite meldt dekking die er niet is |
| **B12** | Geen test bewijst dat de sessiepoort weigert | klein | guard weghalen blijft groen |
| **B13** | Staffel-prijslijstbinding ongedekt | klein | module is nu test-only |
| **B14** | `countsInTotal` in twee bronnen, tegengesteld | klein | val voor de volgende sessie |
| **C1–C8** | Lege staten · budgetdefault · enum-crash · negatieve prijs · uuid-guard · FK-indexen · accentkleur · templatemelding | klein | hygiëne en houdbaarheid |

**Als je er vandaag drie zou doen:** A1, A2 en A4 — alle drie klein, alle drie raken ze wat de klant
in handen krijgt. **Als je er één structureel zou doen:** B11, want zolang 141 tests niets bewijzen,
weet je van elke volgende reparatie niet of hij werkt.

---

# A — raakt geld of een klantdocument

## A1. Een handmatig gekozen product draagt de afwijkingen van een ánder product, groen afgedrukt

**Bewijs:** `lib/repo/review.ts:406-418` (`decideReview`) en `lib/repo/review.ts:463-471`
(`linkManualProduct`) zetten wél `status` en `matchedProductId`, maar raken `deviations` nooit aan.
Die kolom is door `runMatcher` gevuld met de afwijkingen van de **rank-1**-kandidaat
(`lib/repo/matching.ts:112`). `getEstimateData` leest de kolom rechtstreeks en herberekent niets
(`lib/repo/estimate.ts:258-259`).

De comment in de code — *"deviations blijven bewust staan: de afwijking is geaccepteerd, niet
verdwenen"* — klopt alléén voor het pad `accepteer` zónder `productId`. Zodra de mens een ánder
product kiest dan rank 1, is de intentie niet meer van toepassing en vergelijkt de code niets.
Ter contrast doet `chooseCandidate` het wél goed (`lib/repo/matching.ts:245,256`).

**De weerlegger kon dit niet onderuit halen en reproduceerde het tweemaal**, met probes buiten de
repo:

```
Twee gele XAL-kandidaten, mens kiest in de review de rank-2:
estimate-regel: productName "VELA ROUND 900", unitPrice 200.00, status groen,
                deviations [{watt requested 12, delivered 14}]   ← 14 W is de 600, niet de 900
```

En het zwaardere geval, dat de oorspronkelijke finder nog niet had:

```
Rode regel draagt de afwijking van een afgekeurde kandidaat (engine.ts:752).
Na handmatig linken van een correct 3000K-product:
estimate-regel: "COMPLEET ANDER ARMATUUR", status groen,
                deviations [{kelvin requested 3000, delivered 4000, verdict rood}]
```

**Faalscenario:** de calculator lost een rode regel netjes op door het juiste artikel te koppelen.
Op het klantstuk staat dat artikel groen, met daaronder een rode technische afwijking die van een
afgewezen product komt. `notableDeviations` filtert alleen `onbekend`/`exact` weg, dus het haalt
zowel het scherm (`components/dossier/quote-view.tsx:283`) als de PDF (`lib/pdf/estimate.ts:237`).

**Wat het riskeert:** verkeerde technische cijfers op een Engelstalig klantdocument, toegeschreven
aan het verkeerde artikel. Dit is het defect waar transparantieregel C-07 juist tegen bedoeld is.

**Moeite:** klein (<1u). **Verhelpen:** in beide functies de verdicts van de daadwerkelijk gekozen
kandidaat overnemen, zoals `chooseCandidate` al doet; bij een handmatig gelinkt product dat nooit
getoetst is, `deviations` legen in plaats van de oude te laten staan.

**Zekerheid:** hoog — gereproduceerd door de weerlegger. De bestaande test
(`lib/repo/review.test.ts:81`) dekt alleen het rank-1-geval, waar het toevallig klopt.

---

## A2. Het systeem accepteert automatisch een kandidaat die het zélf "data onvolledig" noemt

**Bewijs:** `lib/matching/engine.ts:698-704` laat de vlag `unconfirmed` (een kandidaat die op een
onbevestigde bron leunt, bijvoorbeeld de afgeleide optiekcode) alleen de `list` beïnvloeden — de
kandidaat zakt naar lijst 2. Maar `engine.ts:739-742` (`anyYellow`) en `engine.ts:755`
(`pickUnambiguousYellow`) lezen `scored` in plaats van `provable`, en `pickUnambiguousYellow`
(`engine.ts:141-158`) kent de vlag niet. `lib/repo/matching.ts:101,117` gebruikt
`outcome.unambiguousYellow` zonder naar `list` te kijken.

Gat B belooft letterlijk het tegenovergestelde: *"de kandidaat zakt naar lijst 2 … de mens kiest
met reden"* (`engine.ts:679-692`).

**De weerlegger probeerde vier ontsnappingsroutes en vond ze alle vier dicht**, en bewees het
end-to-end:

```
PROBE3  status geel · provable 0 · incomplete 1 (list "onvolledig")
        unambiguousYellow: SASSO 100 … | lijst: onvolledig
PROBE3B regel: status geel, reviewKind null, matched true
        kandidaten: [{list "onvolledig", chosen true, chosenBy "system:auto"}]
```

**Faalscenario:** een XAL-product waarvan de stralingshoek is afgeleid uit de optiekklasse
(WF ≈ 57°, `lib/enrichment/optic-code.ts`). De spec vraagt 40°; het verschil van 17° valt in de
gele marge. Gat B degradeert de kandidaat naar lijst 2, maar de auto-accept vuurt alsnog: de
matcher kiest het product zelf, zet `reviewKind = null`, en de regel telt geel mee in het
projecttotaal — zonder dat een mens hem ooit heeft gezien.

**Wat het riskeert:** een automatisch geaccepteerde match op grond van onze eigen aanname over
XAL's optiekklassen. De regel wordt afgedrukt als "automatisch geaccepteerde bijna-match".

**Moeite:** klein (<1u). **Verhelpen:** `pickUnambiguousYellow` de `unconfirmed`-vlag laten
meewegen, of hem over `provable` in plaats van `scored` laten lopen.

**Zekerheid:** hoog op het codepad, gereproduceerd. **Eerlijke nuance van de weerlegger over de
frequentie:** `pickUnambiguousYellow` vereist *precies één* schoon-gele kandidaat. Staan er
meerdere afgeleide WF-producten in de top-8, dan blokkeert de teller het toevallig. Dat is geen
poort maar een kansspel — zodra de anderen op kelvin of watt afvallen, gaat de auto-door door.
De drie bestaande Gat-B-tests (`engine.test.ts:807,835,858`) zetten allemaal een situatie op waarin
de afwijking gróén zou zijn; de B3-tests (`:477`–`:613`) zetten nooit `tier2Source`. Het gat zit
precies tussen die twee testblokken.

---

## A3. Kiezen uit lijst 2 maakt de regel groen, ook zonder één getoetst veld

**Bewijs:** `lib/repo/matching.ts:278-282`:

```ts
function statusFromDeviations(deviations: MatchDeviation[]): "groen" | "geel" | "rood" {
  if (deviations.some((d) => d.verdict === "rood")) return "rood";
  if (deviations.some((d) => d.verdict === "geel")) return "geel";
  return "groen";
}
```

Het verdict `onbekend` heeft geen tak. `components/dossier/match-candidates.tsx:174-197` rendert de
Choose-knop óók voor lijst 2 ("Possible — data incomplete").

**Gereproduceerd door de weerlegger, beide varianten:** een lijst-2-kandidaat met een
`onbekend`-verdict (`ip: IP44 → no data for IP`) levert **groen** met €200 in `totals.groen`; een
specloze Gat-A-regel met `deviations: []` levert **groen** met €150 in het totaal, op nul getoetste
velden.

**De weerlegger heeft de framing wel gecorrigeerd, en dat is belangrijk.** "Groen na een
menskeuze" is een vastgelegd besluit (HANDOVER 14 jul: *"élke bevestigende review-keuze maakt de
regel groen mét merkteken"*), en Gat A's eigen comment noemt "mens kiest met reden" als de bedoelde
uitgang. Dit is dus **niet** een heropening van de vacuous green die Gat A dichtzette — dat ging
over wat het *systeem* beweert. De regel verdwijnt ook niet uit beeld: `reviewKind='onvolledig'`
houdt hem in de wachtrij.

**Wat er na die correctie overeind blijft, en waarom het toch in rang A staat:**
1. "Veld onbekend" en "veld bewezen groen" leiden tot dezelfde status, terwijl
   `components/dossier/status.ts:49` groen definieert als *"all specs within the green margin"*.
2. Eén functie hoger staat de tegenovergestelde reflex, expliciet beargumenteerd:
   `lib/repo/review.ts:274` zet een menskeuze in lijst `onvolledig` met lége verdicts *"want
   'aantoonbaar' zou liegen (C-08)"*. Die twee kunnen niet allebei goed zijn.
3. Het groen valt **vóór** de bevestiging, en `decideReview('bevestigd')` is status-neutraal — dus
   niets herbeoordeelt het ooit. Ondertussen telt de regel al mee via `countsInTotal('groen')`, en
   er is geen poort: `hasOpenReviews` (`lib/repo/review.ts:495`) is geëxporteerd maar heeft **nul
   aanroepers** in de hele repo.

**Moeite:** klein (<1u). **Verhelpen:** `statusFromDeviations` een `onbekend`-tak geven die niet
groen oplevert, en de lege lijst apart behandelen. Dit is bovendien een besluit voor Timo: mag een
menskeuze op onvolledige data groen opleveren, of hoort daar een eigen stand bij?

---

## A4. Status `open` valt buiten het totaal én buiten de p.m.-verantwoording

**Bewijs:** `lib/repo/estimate.ts:196-204` telt `pm` uitsluitend over blauw, rood en paars. Maar
`lib/pdf/estimate.ts:266-268` zet élke niet-tellende status op "p.m." in de totaalkolom — dus ook
`open`. De voettekst (`lib/pdf/estimate.ts:387-389`) verklaart p.m. alleen voor *"blue, red and
purple"*.

**De weerlegger zocht vier ontsnappingen en vond ze alle dicht:**
- De sectie "Open items & actions (p.m.)" (`lib/pdf/estimate.ts:339`) itereert uitsluitend
  `blauwLines`, `roodLines`, `paarsLines`. Een `open`-regel komt er niet in voor. *Dit was de meest
  kansrijke ontsnapping.*
- De reconciliatieregel staat achter `pm.total > 0` (`lib/pdf/estimate.ts:327`,
  `components/dossier/quote-view.tsx:174`) — bij vier open regels is `pm.total === 0`, dus de hele
  sectie verdwijnt.
- Er is geen poort: de "Offertepoort was een val"-commit (`0962db1`) gaat over het kopblok, niet
  over regelstatussen. `getSpecLines` levert alle regels; de PDF filtert niets.
- Geen enkele test dekt het: `bun vitest run lib/pdf/estimate.test.ts lib/repo/estimate.test.ts`
  → 12 tests groen, geen enkele fixture gebruikt status `open`.

**`open` is bovendien de normaaltoestand, geen randgeval:** `lib/repo/matching.ts:328` en
`lib/matching/engine.ts:597,747` zetten regels daarop. Elk vers geïmporteerd dossier zit er vol mee.

**Faalscenario:** een dossier met vier open regels levert een PDF waarop die vier "p.m." tonen, de
legenda p.m. alleen voor drie andere kleuren verklaart, en de verantwoordingsregel volledig
ontbreekt. Het eindtotaal dekt zes van de tien regels en niets op het stuk zegt dat.

**Verzachtend:** de regel zelf staat wél op papier, mét het woord "Open" in de statuskolom — hij
verdwijnt niet. Het defect is de onverklaarde "p.m."-markering en de ontbrekende verantwoording.
`lib/repo/estimate.ts:11-13` belooft letterlijk het tegendeel: *"óók blauw/rood/paars/**open** —
want niets wordt stilzwijgend weggelaten"*.

**Moeite:** klein (<1u). **Verhelpen:** `open` opnemen in `pm` en in de legenda; één lijst van
niet-tellende statussen afleiden uit `countsInTotal` in plaats van drie handmatige filters.

---

## A5. De brutoprijs is publiek opvraagbaar zonder sessie — tier1 is fail-open

**Bewijs:** `app/products/[id]/page.tsx:29-30` is de enige inhoudspagina zonder `requireSession()`
(alle 38 `page.tsx`/`route.ts` gecontroleerd; alleen `app/page.tsx` en de auth-route missen hem
ook). Hij bouwt `ctx = { internal: Boolean(session), hasApprovedProject: false }`. Maar
`lib/repo/disclosure.ts:64-72` negeert `ctx` volledig voor tier1 en geeft `showPrice: true,
priceGated: false`. `db/schema.ts:202` zet `disclosureTier` standaard op `tier1`, dus élk merk is
tier1 tenzij handmatig omgezet. `components/product/product-card.tsx:138-148` rendert dan
`formatEur(price?.grossPrice)` met het label "list price".

**De weerlegger kreeg dit niet onderuit en versterkte het.** Beide gevraagde ontsnappingen falen:

*"Tier1 is een bewuste merkkeuze."* — `docs/lumenlogic-briefing.md:57` is expliciet: *"Tier 1:
volledige data + adviesprijs (**merk expliciet akkoord**)."* Een schema-default die voor élk merk
toestemming aanneemt die nooit gegeven is, is fail-open op een toestemmingsvlag.

*"Adviesprijs is niet de 'prijs' van regel 1."* — de briefing zet ze in één zin bij elkaar
(`:56`): *"geen publieke prijskaartjes; **adviesprijs** gegated/projectgebonden"*. J-05 heet
letterlijk de anti-webshop-invariant: *"geen winkelwagen/checkout/**publieke prijzen**"*.

**En het ontwerp weerspreekt de code rechtstreeks.** `docs/FUNCTIONEEL-ONTWERP.md:988-990` (§4.11)
tekent ónder tier1 een contextsplitsing: intern/installateur → alles inclusief adviesprijs;
*specifier zonder project → specs, adviesprijs alleen projectgebonden*. Beide takken sluiten een
anonieme kijker uit. `resolveDisclosure` implementeert die splitsing niet — een niet-gebouwde tak,
geen bedoeld gedrag.

**Dit zijn twee defecten, niet één:** (a) de fail-open schema-default, (b) de ontbrekende
contextcheck in de tier1-tak. Verzwarend: `visible_specs.disclosure_tier` is nullable
(`db/schema.ts:772`) en `lib/repo/disclosure.ts:124` doet `?? "tier1"`, dus ook een merkloos product
valt open.

**Faalscenario:** een uitgelogde bezoeker met een gedeelde product-URL (work-prep en de
substitutielijst linken naar `/products/<uuid>`) ziet de brutoprijs. Geen login, geen lead, geen
event. Verzachtend: `/catalog` zit wél achter `requireSession()`, dus uuid's zijn niet anoniem te
enumereren — je hebt minimaal één gedeelde deeplink nodig.

**Wat het riskeert:** ijzeren regel 1 in zijn kern. Merken leveren prijslijsten onder de aanname
dat die achter Brink's poort blijven.

**Moeite:** klein (<1u). **Verhelpen:** laat tier1 de kijkercontext respecteren zoals tier2 dat al
doet, en heroverweeg de schema-default — "merk expliciet akkoord" hoort geen default te zijn.

---

## A6. De AI-leesroute draait synchroon in de server action, en er is nergens een `maxDuration`

**Bewijs:** `app/projects/actions.ts:208-209` awaits `recordLeesrouteImport`. De batchlus
(`lib/repo/leesroute.ts:130-134`) is serieel over `LEESROUTE_BATCH_PAGES = 8`
(`lib/ai/leesroute.ts:54`). `grep -rn maxDuration app lib next.config.ts` → **nul treffers**; geen
`vercel.json`; `next.config.ts` zet alleen `serverActions.bodySizeLimit`. Geen `after()` en geen
streaming rond deze aanroep — de `after()` in dit bestand geldt alleen `triggerVangnet`.

**De weerlegger bevestigde dit en stelde het naar bóven bij.** De finder rekende met ~61 s per
batch; `CALL_TIMEOUT_MS` in `lib/ai/shared.ts:16` is **120.000 ms** en er is een tweede poging —
dus tot ~240 s per batch. Een boek van 40 pagina's is 5 batches. Dat is orden van grootte over elk
Vercel-plafond.

Het contrast is scherp omdat de codebase het elders wél goed doet: de OCR-route heeft één
`ocrPageAction` per pagina (`app/projects/actions.ts:340`), door de client aangestuurd en
hervatbaar. De leesroute is de enige die het niet doet.

**Faalscenario:** de functie wordt door het platform afgekapt terwijl `import_runs` en een deel van
de spec-regels al weggeschreven zijn. De gebruiker krijgt een fout bij een import die deels
geslaagd is — precies de bugklasse die deze sprint al vier keer is opgedoken.

**Moeite:** groot voor de echte oplossing, klein voor het vangnet. **Verhelpen:** trek de leesroute
op naar het OCR-patroon (één action per batch, hervatbaar — de run-rij en de snapshot-dedup bestaan
al). Zet als tussenstap een expliciete `maxDuration`, zodat het plafond een keuze is en geen
platformdefault.

**Niet vastgesteld:** welke functieduur-limiet nu feitelijk geldt. Dat hangt af van het Vercel-plan
en de Fluid-compute-stand en staat niet in de repo. De conclusie — het plafond is nu geen keuze —
staat los van het exacte getal.

---

## A7. Een dagprijs met verlopen geldigheid blijft eeuwig op de offerte staan

**Bewijs:** `lib/repo/dossiers.ts:269-293` schrijft `manualPriceValidUntil`. Een repo-brede grep op
dat veld geeft precies drie treffers: deze schrijfregel, de kolomdefinitie (`db/schema.ts:509`) en
een commentaarregel in `lib/format.ts:78`. **Geen enkele query filtert erop.** `setDayPrice` heeft
bovendien nul tests (`grep -rn "setDayPrice" --include="*.test.*"` geeft alleen drie
`setDayPriceAction={noopAction}`-props).

**Faalscenario:** een calculator zet in mei een dagprijs van €199 met geldigheid t/m 30 juni. In
september bevat de estimate — scherm, PDF én XIS-export — nog steeds €199.

**Wat het riskeert:** direct geld op klantstukken. Het is de spiegel van ijzeren regel 3 (verlopen
prijslijst = onzichtbaar), die voor de catalogus wél centraal wordt afgedwongen én getest
(`lib/repo/rules.test.ts:14-55`) en voor de dagprijs helemaal niet.

**Moeite:** midden (halve dag) — de leesregel moet in `getSpecLines`/`getEstimateData`, en de
PDF-tekst moet weten wat er dan getoond wordt. **Verhelpen:** laat het estimate-pad de dagprijs
negeren of als verlopen markeren zodra `manual_price_valid_until < CURRENT_DATE`.

---

## A8. "Dagprijs wint van catalogusprijs" is op drie plekken gekopieerd en op twee ongetest

**Bewijs:** `lib/repo/estimate.ts:258` doet `r.manualPrice ?? r.matchedPrice ?? null` met de comment
"I-04: dagprijs wint". Maar in élke fixture die dit pad raakt staat de dagprijs op een regel *zonder*
gematcht product: `lib/repo/estimate.test.ts:50` en `lib/pdf/estimate.test.ts:44` zetten allebei
`manualPrice: "500.00"` op een **paarse** regel met `matchedProductId: null`. De `??` krijgt dus
nooit twee gevulde waarden te kiezen.

**De weerlegger voerde de mutatie daadwerkelijk uit**, in een scratchpad-kopie:

```
Volgorde omgedraaid naar (matchedPrice ?? manualPrice) in estimate.ts:258
  → Tests 55 passed          ← niets merkt het
Dezelfde omkering in xis.ts:89
  → RED: expected 226 to be 199   ← want xis.test.ts:52 is de enige fixture met béide gevuld
```

**En hij vond een derde kopie die de finder miste:** `lib/repo/dossiers.ts:458` in `generateQuote`
draagt dezelfde regel, overleefde de omkering óók, en er bestaat geen `lib/repo/dossiers.test.ts`.

**Faalscenario:** een calculator voert een dagprijs van €199 in omdat de catalogusprijs van €226 niet
meer klopt. Draait de volgorde ooit om — door een refactor, een merge, of een AI-sessie die de regel
"opruimt" — dan gaat €226 naar het klantstuk en het projecttotaal, en geen enkele test merkt het.
Het bestand opent met "Nooit twee waarheden"; er zijn er drie.

**Moeite:** klein (<1u) — één fixture-regel: geef een gematchte gele regel óók een `manualPrice` en
assert het regeltotaal én het samentotaal daarop.

---

## A9. Een half mislukte import laat duplicaten toe — bewezen

**Bewijs:** `lib/repo/imports.ts:218-229` zet de run pas op `bevestigd` ná de inserts én ná de
matcher-lus:

```ts
const created = inputs.length ? await addSpecLines(db, run.dossierId, inputs) : [];
for (const line of created) { await runMatcher(db, line.id, actor); }
await db.update(importRuns).set({ status: "bevestigd", … })
```

`runMatcher` gooit bij `lib/repo/matching.ts:56` en heeft geen try/catch. Er is geen transactie, en
dat is een bewuste keuze: zes broncommentaren leggen vast dat `db.transaction()` op neon-http gooit
maar op PGlite werkt (`lib/repo/price-archive.ts:109`: *"groene tests, kapotte app"*) — dus een
transactie is hier geen beschikbaar vangnet.

**De weerlegger heeft dit uitgevoerd, niet beredeneerd:**

```
PROBE lines after crash: 1   run status: voorstel
PROBE lines after retry: 2   created: 1
```

De regel wordt tweemaal ingevoegd. De idempotentietest (`lib/repo/imports.test.ts:159-176`) dekt
alleen een eerste aanroep die slaagde, dus alleen de tak `run.status !== "voorstel"`.

**Faalscenario:** `runMatcher` crasht op regel 3 van 10 (dat dit reëel is staat in `engine.ts` zelf
vastgelegd: `:371-374` "invalid input syntax for type integer", `:423-426` `ORDER BY 0`). De tien
regels staan er, de run blijft op `voorstel`, er komt geen bevestigingsevent. De gebruiker klikt
nogmaals op Bevestigen → het dossier heeft twintig regels waar er tien hoorden.

**Wat het riskeert:** stille verdubbeling van aantallen in een armaturenboek — en aantallen zijn wat
de estimate vermenigvuldigt met de stukprijs. Dit koppelt bovendien direct aan A6: de leesroute is
juist het pad dat halverwege wordt afgekapt.

**Moeite:** midden (halve dag). **Verhelpen:** zet de run op `bevestigd` direct ná `addSpecLines` en
vóór de matcher-lus, en laat een matcher-fout een event worden in plaats van de hele actie te laten
klappen.

---

# B — echt defect, minder gewone toestand of intern

## B1. Er is geen eigendomsmodel; `requireSession()` is de enige poort

Dit is de synthese van acht losse IDOR-bevindingen. **De weerleggers hebben ze als losse
bevindingen grotendeels ontkracht en juist als één structurele bevinding versterkt.**

**Bewijs:** `lib/session.ts:10-14` is de complete autorisatielaag — `if (!session)
redirect("/login")`, verder niets. Van de 68 exported server actions in `app/` roepen er 67
`requireSession()` aan (eigen steekproef bevestigt: settings 4/4, organization 4/4, projects 25/25,
admin 3/3, brand 2/2), **0 doen een rolcheck en 0 een eigenaarscheck**. `hasRole`
(`lib/repo/orgs.ts:135`) heeft precies één treffer in de hele repo: de definitie zelf. Er is geen
`middleware.ts` en geen `app/admin/layout.tsx`.

Gevolg: elke repo-functie is ongescoped. `listDossiers` (`lib/repo/dossiers.ts:21-26`) en
`getDossier` (`:66-73`) filteren op niets; `/projects` toont elke ingelogde gebruiker alle dossiers
inclusief klantnaam.

**Waarom de losse claims sneuvelden.** De weerlegger op de quote-PDF-route stelde vast dat
"andermans dossier" op deze commit geen toestand ís: `app/projects/[id]/quote/page.tsx:103-111`
geeft dezelfde data aan dezelfde actor. De PDF-route lekt niets wat het scherm ernaast niet al
geeft. Ook het argument "de zusterroutes doen het wél" valt weg: die toetsen `run.dossierId !== id`
— een nested-consistentiecheck, geen tenancy. Van de vijftien actions "zonder containment" bleken
er vier gedekt door de repo-laag (`confirmImportRun`, `cancelImportRun`, `useAiSuggestion`,
`dismissSuggestion`), en de genoemde `proposalId` bestaat als action-parameter niet.

**Wat overeind blijft, en dat is het punt:** elf actions muteren een genest object zonder
containment-check terwijl alle nested *pagina's* die check wél doen
(`line/[lineId]/page.tsx:59`, `substitution/[proposalId]/page.tsx:29`, `import/[runId]/page.tsx:33`)
en twee OCR-actions in hetzelfde bestand ook (`app/projects/actions.ts:383,426`). De scherpste die
de finder miste, gevonden door de weerlegger: `editSpecLineAction` geeft de vervalsbare `dossierId`
door aan `triggerVangnet` — dáár heeft een mismatch wél een echt effect (AI-budget en suggesties
komen op het opgegeven dossier terecht).

**Ernst vandaag: verwaarloosbaar.** De e-mail-allowlist in `lib/auth.ts:22` is de enige echte
grens en hij houdt: er is geen open registratie, en er zijn drie interne Brink-accounts, nul
organisaties, nul memberships. **Ernst na week 3: kritiek** — het moment dat één extern account
bestaat, staan `deleteBrandAction`, `approveUploadAction` en `getBrandData` voor hem open.

**Belegd, maar let op de asymmetrie.** 3.2a heeft dit als acceptatiecriterium en
`docs/rol-schermen-kaart-2.0a.md:4-5` zegt het zonder omhaal: *"Deze sprint dwingt niets af:
iedereen ziet nog alles."* Twee dingen vallen daar buiten en zijn dus onbelegd: `saveBrandingAction`
en `createOrgAction` (G39 trok de grens bewust om alleen `addMemberAction` heen).

**⚠️ Eén ding dat aandacht verdient los van de code.** `addMemberAction`
(`app/settings/organization/actions.ts:45-58`) laat een ingelogde gebruiker zichzelf `org_admin`
maken van een willekeurige org — dat is besluit **G39**, op 30 juli door de sprintmaster nagemeten
en bevestigd. De fix is af: `lib/repo/authz.ts` (616 regels) plus 1.149 regels test, op lokale
branch `claude/sprint31-pin` (`9fae44d`). **Maar `git branch -r --contains 9fae44d` is leeg — die
commit staat op geen enkele remote.** De doc-commits op main (`35f36d6`, `a841f02`) zijn
docs-only en lezen als "afgehandeld", terwijl de code er niet is. Wie vandaag `0d3850a` deployt,
deployt het gat.

**Moeite:** groot — het is een ontwerp, geen patch. **Verhelpen:** het containment-patroon naar de
repo-laag trekken (schrijffuncties krijgen `dossierId` als verplicht tweede predicaat), zodat een
action het niet meer kan vergeten. Eén `requireRole()`-helper die uit de sessie afleidt, verplicht
als eerste regel in élke action — niet in de pagina.

---

## B2. Verwijderen uit de allowlist trekt een lopende sessie niet in

**Bewijs:** `isAllowed` wordt in de hele repo op precies één plek aangeroepen: `lib/auth.ts:21`, in
de `sendMagicLink`-callback. Dat is alleen bij het *aanvragen* van een link. `requireSession()`
toetst daarna nooit meer of het adres nog op de lijst staat. `app/settings/actions.ts:34-43`
verwijdert de rij en beëindigt geen sessies.

**De weerlegger zocht een tweede poort en vond er geen:** geen `middleware.ts`, geen
`databaseHooks`, geen `customSession`, geen `session: {}`-blok in `lib/auth.ts`, geen FK-cascade van
`session` naar `allowed_emails`. En hij bevestigde het sessiegedrag uit de geïnstalleerde bron
(better-auth 1.6.23): `expiresIn` 7 dagen, `updateAge` 24 uur, en de vernieuwing is echt rollend —
`dist/api/routes/session.mjs:205` zet `expiresAt` terug op volle 7 dagen. Wie de app wekelijks
opent, blijft onbeperkt binnen.

**Verzachting die de weerlegger terecht inbracht:** de UI belooft minder dan "toegang ingetrokken".
De bevestigingsdialoog zegt exact *"This address can no longer log in: a magic link request from it
gets no mail"* — en dat is precies wat er gebeurt. De misleidingsclaim is de zwakste schakel;
het mechanisme-gat blijft.

**Ernst vandaag nul** (één gebruiker; zelfverwijdering en het laatste adres zijn serverzijdig
geblokkeerd). **Na week 3 hoog:** zodra een extern account de deur uit moet, is "adres verwijderen"
het enige middel dat de UI biedt, en dat werkt tot zeven dagen niet.

**Moeite:** klein-midden. **Verhelpen:** `removeAllowedEmail` ook de `session`-rijen van dat adres
laten wissen. `getSession` raakt elke request de database (er is geen `cookieCache`), dus dat werkt
direct. Doen vóór het eerste externe account, niet erna.

---

## B3. Er is geen weg terug voor een verlopen prijslijst — de UI schrijft een remedie voor die niet bestaat

**Let op: dit is uitdrukkelijk géén schending van ijzeren regel 3.** De weerlegger heeft dat
onderdeel weerlegd: `visible_products` filtert `AND pl.valid_until >= CURRENT_DATE` (migraties
`0001:36`, `0003:36`, `0004:240`) en alle acht lees- en zoekpaden gaan door die view. Regel 3 wordt
volledig nagekomen. De storing zit in de *omgekeerde* richting: je kunt iets niet weer zichtbaar
maken.

Ook de premisse "price-archive is nergens aangesloten" bleek verouderd: `upsertPriceLines` zit wél
op een productiepad (`upload-actions.ts:181` → `applyTemplateProposal` →
`lib/repo/template-return.ts:646`). Alleen `replacePriceList` heeft geen aanroeper, en dat is
bewust — `price-archive.ts:99-107` legt uit waarom een template (een deelverzameling) daar nooit
door mag lopen, met een regressietest erop (`price-archive.test.ts:180`, "DE HAZARD-TEST").

**Wat er dan wél overblijft, en dat is nieuw en niet eerder gemeld:** de "extension" die de UI
letterlijk voorschrijft, bestaat nergens. `components/data/price-list-expiry-notice.tsx:28` zegt
tegen de gebruiker: *"the list expired on … What's needed now is an extension, not a new
submission."* Maar er is **geen enkele update van `valid_until`** in `lib/`, `app/` of
`components/` — de weerlegger liep elke schrijfactie op `priceLists` na. `/data/price-lists` heeft
alleen een `page.tsx`, geen actions. De nieuwe-lijst-fieldset verschijnt bovendien alleen als er
géén actieve lijst is (`template-proposal.tsx:610`), en een verlopen lijst telt als actief omdat
`actievePrijslijst` alleen op `replaced_at IS NULL` kijkt (`template-return.ts:135-141`).

`scripts/testmerk-1-4.ts:12-17` bevestigt dat dit bekend was: *"De briefing gaat ervan uit dat een
prijslijst laten verlopen een bestaand pad is. Dat is het niet"* — het script doet een kale UPDATE.

**Faalscenario:** een prijslijst verloopt. De producten van dat merk zijn overal onzichtbaar
(correct), de UI vertelt de gebruiker dat er een verlenging nodig is (correct), en er is geen enkele
knop, pagina of action die dat kan (het gat).

**Moeite:** midden (halve dag). **Verhelpen:** één ingang waar een prijslijstdatum verlengd kan
worden. Vandaag bestaat die alleen in een los script.

---

## B4. `/catalog` scant de hele catalogus voor een merken-dropdown, ook zonder zoekopdracht

**Bewijs:** `app/catalog/page.tsx:101-104` doet `selectDistinct(brandName).from(visibleProducts)` —
en staat vóór `if (searched)` op regel 122, dus onvoorwaardelijk.

**Beide agents hebben dit tegen de database gemeten** (read-only, `BEGIN READ ONLY`):
parallelle seq scan over producten + prices, 210k rijen door de hash join, **262 ms warm / 357 ms
koud** serverzijdig, resultaat 28–30 rijen. Niet cachebaar zoals het staat: `requireSession()`
(cookies) plus `searchParams` maken de route dynamisch, en er is repo-breed nul `unstable_cache` of
`cache()`. `/catalog` staat in `components/nav-items.ts:14` — hoofdnavigatie, geen zeldzame tak.

**Correctie van de weerlegger op de finder:** "waarom 30 merken van de 438" is geen bug maar ijzeren
regel 3 — `visible_products` joint op een geldige prijslijst, en maar 30 merken hebben er nu één.
30 is het juiste antwoord.

**Moeite:** klein (<1u). **Verhelpen:** de merkenlijst hoeft niet uit de prijs-join te komen en
verandert per import, niet per request — uit `brands` (438 rijen) halen met een `exists`-poort, of
er een korte cache omheen. *Bouwen hoort bij 2.5b.*

---

## B5. De merkconditie in de zoekopdracht is per constructie niet-indexeerbaar

**Bewijs:** `lib/repo/products.ts:112-114` doet
`regexp_replace(lower(brand_name), '[^a-z0-9]', '', 'g') like …`. De bestaande index is
`products_brand_name_trgm_idx ON products USING gin (brand_name gin_trgm_ops)` — die kan een
uitdrukking over de kolom niet bedienen. Zelfde patroon in `lib/matching/engine.ts:325`.

**Gemeten, en de weerlegger maakte de claim smaller én scherper:**
- merk **zonder** zoektekst (de dropdown op `/catalog`): parallel seq scan over 211k, **153 ms**.
  Dezelfde zoekopdracht met een gewone `ilike` gaat via de trgm-index in **0,8 ms** — factor ~190.
- merk **mét** een naamtoken: de planner redt zich via `products_name_trgm_idx` en past de regexp na
  als filter — **52 ms**, geen seq scan.

De claim geldt dus alleen voor de merk-alleen-tak — precies de tak die `/catalog` met zijn dropdown
het vaakst aanbiedt.

**Moeite:** midden. **Verhelpen:** de genormaliseerde merksleutel vastleggen in plaats van hem per
query te berekenen (expressie-index of een gegenereerde `brand_key`-kolom). De conditie in de code
blijft letterlijk hetzelfde; alleen de planner kan hem dan bedienen. *Bouwen hoort bij 2.5b.*

---

## B6. `addSpecCsvAction` heeft geen bovengrens en draait een matcher per regel

**Bewijs:** `app/projects/actions.ts:120-131` parseert een CSV zonder cap en doet daarna
`for (const r of rows) await runMatcher(db, r.id, actor)`. Geen cap in `parseSpecCsv`
(`lib/repo/dossiers.ts:242-261`) noch in `addSpecLines` (`:166`). De action is aangesloten
(`app/projects/[id]/page.tsx:143` → `components/dossier/add-spec-line-form.tsx:38-52`, vrije
textarea zonder `maxLength`). Het precedent bestaat: `app/data/brand-relations/actions.ts:60-65`
legt `BULK_MAX = 100` op met exact deze redenering.

**De weerlegger heeft de omvang gemeten en fors bijgesteld** — met een wegwerpscript op PGlite
(echte Postgres) buiten de repo:

```
OK   (2978 rijen, 65516 parameters)
FAIL (2979 rijen, 65538 parameters)
```

`addSpecLines` doet één INSERT met 22 kolommen per rij; Postgres' bind-parameterlimiet (65535) kapt
af boven ~2978 regels — en dan draait er géén enkele matcher. "Honderdduizenden regels" kan dus
niet. Het realistische worstcase is ≤2978 matcher-runs, waarbij de functietimeout de invocatie
halverwege afkapt → half-gematcht dossier.

**Wat de weerlegger vond en de bevinding juist versterkt:** het ontwerp wíl >10 regels via een
controlescherm (`app/projects/[id]/import/actions.ts:49-56`, `CSV_PROPOSAL_THRESHOLD = 10`), maar
`createCsvProposalAction` is **nergens aangesloten** — dode code. De "kleine plak"-aanname wordt
door niets afgedwongen.

**Ernst:** matig-laag (zelf-DoS door de enige gebruiker). **Moeite:** klein — twee regels.

---

## B7. Elf schrijfacties zonder event, en vijf zonder actor

**De oorspronkelijke claim is fors bijgesteld en dat is terecht.** De weerlegger stelde vast dat
ijzeren regel 5 ("elke zoekactie/match/offerte") wordt opgerekt: de eventcatalogus in
`docs/FUNCTIONEEL-ONTWERP.md:1027-1049` verklaart zichzelf sluitend, en géén van de genoemde acties
staat erin. Het contrastargument draait zelfs om — `membership_added` staat óók niet in de
catalogus, dus `addMembership` logt *méér* dan het ontwerp vraagt en vestigt geen norm.

**De scherpste deelclaim viel volledig.** De bewering dat `mv_brand_considerations` "overtelt" na
het verwijderen van een spec-regel veronderstelt dat de metriek een momentopname zou moeten zijn;
het ontwerp kiest uitdrukkelijk het tegendeel (`FUNCTIONEEL-ONTWERP.md:1052`: *"events worden nooit
gemuteerd of verwijderd"*). "500× overwogen" is per definitie hoe vaak een kandidaat aan een mens
is getoond.

**Wat overeind blijft is smaller maar echt:** `docs/FUNCTIONEEL-ONTWERP.md:1058` stelt voor V1
*"élke schrijfactie draagt de actor"*. `deleteSpecLine` (`lib/repo/dossiers.ts:263-265`),
`flagForReview` (`lib/repo/review.ts:484-493`), `removeMembership` (`lib/repo/orgs.ts:94`),
`removeAllowedEmail` en `setSampleVerdict` (`lib/repo/enrichment.ts:384-397`) accepteren geen
`actor`-parameter. Er is dus geen spoor van wie het deed.

`deleteSpecLine` is het scherpste geval: destructief (de rij is weg, niet gemarkeerd), geen event,
geen actor, en nul tests. De niet-destructieve buren in hetzelfde bestand loggen wél
(`setQuantity` op `:307-313`, `setDayPrice` op `:288-294`).

**Moeite:** klein per functie. **Verhelpen:** `logEvent` met de volledige regelinhoud vóór de
delete — hetzelfde patroon dat `lib/repo/enrichment.ts:658` al hanteert ("LOGGEN VÓÓR DELETEN, met
opzet"). Prioriteit bij `deleteSpecLine`.

---

## B8. Vijf handgebouwde primary-knoppen, en de bewakende test kan ze niet zien

**Bewijs:** `components/knophierarchie.test.tsx:64` matcht `/<Button\b/g` — met hoofdletter. Een
`<button>` in kleine letters telt niet mee. De `NIET_MEETELLEN`-lijst is geen ontsnapping; dat is
een verkleinende allowlist.

**De weerlegger corrigeerde de telling en maakte het bewijs sterker.** Van de zes genoemde plekken
zijn er **vier** navy primary — `brand-relation-form.tsx:83`, `brand-message-block.tsx:56`,
`custom-field-form.tsx:218`, `admin/brand-form.tsx:294`. Twee vallen af (`brand-delete-block.tsx:201`
is `bg-destructive`, een eigen variant; `custom-fields-table.tsx:226` is `bg-foreground`). Maar hij
vond er één die de finder miste: `app/admin/brands/page.tsx:65`. **Netto vijf.**

**Het scherpste tegenargument faalt, en maakt de zaak erger.** Op
`/data/brand-relations/[brandId]` staan **drie** navy vlakken: de Save-knop, de kopieerknop, én
`components/data/template-upload-card.tsx:98` — een echte `<Button>` zonder variant, dus default
navy en wél zichtbaar voor de test. De test telt er precies één en is groen (6/6). De
"verschillende secties"-verdediging houdt niet: DESIGN.md §6 somt de uitzonderingen uitputtend op
(dialoog · *herhaalde* beslis-kaart of tabelrij · filterchip) en een eenmalige sectiekaart is geen
van drieën.

**Wat het riskeert:** de regel die net is ingevoerd geldt feitelijk niet op vier schermen, en het
mechanisme dat hem bewaakt geeft valse zekerheid. De volgende sessie leest "groen" en denkt dat het
klaar is. Daarbovenop missen deze knoppen wat `button.tsx` sinds `4d6e5a8` wél doet:
`--primary-hover`, `disabled:cursor-not-allowed`, `active:bg-primary-active`.

**Moeite:** midden. **Verhelpen:** de vijf omzetten naar `<Button>`, en de regex óók op `<button`
laten matchen zodat het gat zich niet opnieuw opent.

---

## B9. Zesentwintig formuliervelden staan op 32/36px, tegen de norm van O9 in

**Dit is de bevinding die het hardst is aangevallen en het beste standhield** — inclusief mijn
eigen instructie aan de weerlegger dat O9 misschien alleen over knoppen ging. Dat bleek onjuist.

**Bewijs:** `components/ui/input.tsx:18` staat op `h-11` (44px). **`docs/DESIGN.md:343` (O9) noemt
`formuliervelden` letterlijk** in de 44px-lijst. De compacte uitzondering slaat op de inventaris in
dezelfde regel: 56× `size="sm"`, 2× `xs`, 4× `icon-*` — allemaal **Button**-maten. `HANDOVER.md`
bevestigt die lezing twee keer onafhankelijk (`:2661-2662` en `:2202-2204`: de compacte maat
"grandfathert de 56 bestaande plekken", en dat zijn knoppen; native velden zaten nooit in O9's
inventaris).

**De weerlegger telde hóger dan de finder:** 16 compacte `<select>` en 10 compacte `<input>` =
**26**, niet 19 (hidden/checkbox/radio/color/file/submit uitgesloten, klasse-constanten opgelost).
Voorbeelden buiten elke toolbar-verdediging: `components/data/brand-relation-form.tsx:29,43,52,62`
(een gewoon bewerkformulier) en `components/admin/brand-form.tsx:92,199,254,269`. De 7 `<textarea>`
staan zonder hoogteklasse en zijn niet in overtreding.

Geen stijlmening: een gemeten afwijking van een letterlijk vastgelegde norm.

**Moeite:** midden — de `<input>`-gevallen kunnen naar `Input`; voor `<select>`/`<textarea>` bestaat
nog geen bouwsteen, dus die vragen eerst een gedeelde veldklasse of een `Select`-component.

---

## B10. Negen plekken dragen shadcn-resten die `input.tsx` zelf afgeschaft noemt

**Bewijs:** `components/ui/input.tsx:12-14` zegt letterlijk dat de `dark:bg-input/30`-hacks
vervallen en dat de focus-ring `rgba(45,90,140,.1)` is, niet de `/50`-halo.

**De weerlegger verifieerde de tellingen als exact** — zeldzaam in deze review. Beide klassen
samen op precies vijf plekken (`catalog-search.tsx:35`, `settings/xis-block.tsx:39`,
`org/org-list.tsx:78`, `admin/upload-review-block.tsx:143`, `data/brand-visibility-block.tsx:61`);
precies vier met alleen de halo (`ui/badge.tsx:8`, `admin/brand-form.tsx:92,222`,
`data/brand-relations-table.tsx:311`).

**Sterker dan de finder stelde:** dit hangt niet aan een broncommentaar. `DESIGN.md` §6 "Invoer"
(regel 267) schrijft de ring `0 0 0 3px rgba(45,90,140,.1)` voor en §3 zet de dark
invoerachtergrond op `#2A3145`. `huisstijl.test.tsx` pint de tokenwaarden vast maar heeft geen guard
tegen deze utility-klassen, dus niets vangt het.

**Nuance ten gunste van de code:** `badge.tsx:8` en `brand-relations-table.tsx:311` zijn geen
formuliervelden, dus §6 "Invoer" raakt ze niet. De zeven veld-plekken zijn onbetwist.

**Moeite:** klein (<1u).

---

## B11. 141 screenshot-tests bewijzen niets, en drie schermen hebben nul dekking

**Bewijs:** het patroon in twaalf bestanden, hier `components/dossier/screens.test.tsx:125-131`:

```tsx
await renderServer(ui);
await expect.element(document.body).toBeInTheDocument();   // ← altijd waar
await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
```

`document.body` bestaat per definitie; de assertie zegt niets over de render.

**Het beste tegenargument bleek empirisch onwaar.** Ik gaf de weerlegger expliciet de opdracht uit te
zoeken of `renderServer` bij een renderfout zelf gooit — dan zou de test hem alsnog vangen. Hij
bouwde de probe: een servercomponent waarvan de body `throw new Error(...)` is, gerenderd door
`renderServer`, met alleen de body-assertie → **de test slaagt**. De fout wordt slechts
`console.error`'d. De oorzaak staat in `node_modules/vitest-plugin-rsc/dist/nextjs/testing-library.js`:
`onCaughtError` is een handler die alleen logt, `onUncaughtError` wordt nooit gezet, en
`createTestingLibraryClientRoot` roept `reactRoot.render(...)` aan **zonder `await` en zonder
`act()`** — `renderServer` keert dus terug vóórdat React heeft gecommit.

Twee mutaties in een scratchpad-kopie:

```
DossierList → return null:
  4 projectlijst-screenshot-tests GROEN; alleen de losse inhoudstest op screens.test.tsx:144 werd rood
WerkvoorbereiderView + ArmaturenboekView + AnalyticsView → return null:
  12/12 GROEN in run3-screens.test.tsx
```

**Telling:** van de 319 `(thema, device)`-tests hebben er **141** geen enkele assertie voorbij
`document.body`. (De finder zei 132; dat is exact de som van de twaalf bestanden die hij noemde —
zijn rekenwerk klopte, zijn bestandslijst was iets korter.)

**De verzachting is echt maar gedeeltelijk, en juist daar zit de scherpste vondst.** Dertien van de
vijftien bestanden hebben wél stevige inhoudelijke asserties elders (`review` 46, `regel-detail` 48,
`estimate` 58). Maar `components/dossier/run3-screens.test.tsx` bevat **precies één `expect` in het
hele bestand** — de tautologie op regel 100 — voor drie complete schermen, en
`WerkvoorbereiderView`, `ArmaturenboekView` en `AnalyticsView` komen in **geen enkel ander
testbestand** voor. Die drie schermen hebben nul dekking.

**Wat het riskeert:** `CLAUDE.md` maakt "screenshots — bekijk ze!" tot de poort onder deze tests, en
dat is een menselijke poort. De suite meldt dekking die er niet is, en het al bekende
blanco-PNG-probleem wordt hierdoor stil in plaats van rood.

**Moeite:** midden (halve dag) — per bestand één inhoudelijke ankerassertie vóór de screenshot.
`analytics-tiles`, `catalog`, `settings`, `admin`, `org` en `event-log-block` doen dat al; die zijn
het model. Begin bij `run3-screens.test.tsx`.

---

## B12. Geen enkele test bewijst dat de sessiepoort een niet-ingelogde beller weigert

**Bewijs:** `lib/session.ts:10-14` is de enige autorisatie in de app en wordt op ~90 plekken
aangeroepen. De testbestanden die de sessie aanraken mocken hem juist weg en geven **altijd** een
sessie terug: `app/projects/[id]/quote/quote-gate.test.tsx:43-47` en
`app/settings/settings-actions.test.ts:36-40` (`requireSession: async () => ({ user: { email: … } })`).

**De weerlegger corrigeerde de telling en redde de claim niet:** het zijn er **drie**, niet twee —
`app/login/login-gate.test.ts` mockt ook `@/lib/session`. Maar die mockt alleen `getSession` en zijn
uitgelogde test asserteert dat de loginpagina het formulier rendert: de omgekeerde poort. **Geen
enkele test drijft een null-sessie door `requireSession` en asserteert de redirect.**

**Faalscenario:** haal `await requireSession();` weg uit `app/projects/actions.ts` en de suite blijft
groen — de tests die die acties aanroepen hebben de poort per constructie vervangen door een
altijd-ja.

**Ter contrast:** de allowlist eronder (`lib/repo/settings.ts:44`) is wél fail-closed getest
(`lib/repo/settings.test.ts:30`), en de twee lock-out-vangrails in `removeEmailAction` ook. Het gat
zit precies één laag hoger.

**Moeite:** klein (<1u) — per bestaand action-testbestand één test waarin de mock `null` teruggeeft
en de action met `NEXT_REDIRECT` afbreekt zonder de database te raken, precies zoals
`login-gate.test.ts:36-47` het al doet.

---

## B13. De prijslijst-binding van de staffel is ongedekt

**Bewijs:** `lib/repo/staffel.ts:83-89` bindt de staffel aan dezelfde geldige prijslijst als de
basisprijs, met de comment "(regel 3)". In alle vier de tests komt `priceListId` uit dezelfde
`seedBrandProduct`-aanroep, dus de conditie is altijd vervuld.

**Mutatie uitgevoerd:** regel 85 verwijderd → alle staffel-tests groen. De "verlopen
prijslijst"-test keert al terug op `:79-81` en bereikt regel 85 nooit.

**Faalscenario:** een product met een verlopen prijslijst A (staffel 10+ → €250) en een actuele lijst
B (basis €400, geen staffel). Zonder die regel pakt de query de staffel uit de verlopen lijst en
offreert €250 in plaats van €400 — regel 3 gebroken op precies de plek waar de code claimt hem te
bewaken.

**Belangrijke relativering van de weerlegger:** `getPriceForQty`, `setPriceTier` en `listTiers`
hebben **geen productie-aanroepers** — de module is vandaag test-only. Dat verlaagt de urgentie
sterk, maar maakt de test-blindheid juist relevanter: als iemand de staffel aansluit, is de
bewaking er niet.

**Moeite:** klein (<1u) — een vijfde test met twee prijslijsten.

---

## B14. `countsInTotal` bestaat in twee bronnen met tegengestelde waarde

**Bewijs** (zelf geverifieerd): `lib/repo/estimate.ts:58` geeft `true` voor alleen groen en geel.
`components/dossier/status.ts:86` zet voor paars `countsInTotal: true`, met een comment die het
tegendeel zegt ("wél getoond op de estimate, maar als p.m. — niet opgeteld").

Alle drie de leesplekken (`quote-view.tsx:266`, `lib/pdf/estimate.ts:245`, `estimate.ts:65`) roepen
de **functie** aan; de `STATUS`-eigenschap heeft **nul lezers en nul tests**.

**Faalscenario — de val die klaarligt:** de eerstvolgende ontwikkelaar die het voor de hand liggende
doet en `STATUS[line.status].countsInTotal` leest in plaats van de functie te importeren, telt paars
mee. In de bestaande fixture is dat 2 × €500: het samentotaal springt van €5.528 naar €6.528 op een
klantstuk, voor regels die per definitie buiten het assortiment vallen.

Daarnaast ontsnapt de mutatie: voeg `|| status === "blauw"` toe aan `estimate.ts:58` en geen enkele
test wordt rood — in alle fixtures heeft de blauwe regel `unitPrice: null`.

**Moeite:** klein (<1u). **Verhelpen:** het veld uit `status.ts` verwijderen (niemand leest het), of
één test die `STATUS[s].countsInTotal === countsInTotal(s)` voor alle zes statussen afdwingt.

---

# C — klopt, maar beperkte schade of pas na week 3

## C1. Zeven lege staten gebruiken nog de kale grijze regel

`components/ui/empty-state.tsx:4-24` noemt zichzelf "de enige toegestane vorm" en benoemt "een kale
grijze regel" als de fout.

**De weerlegger heeft dit van twintig naar zeven teruggebracht** — de grootste correctie van de
review. Drie kandidaten zijn geen lege staat (`brand-dashboard.tsx:41` is een permanente inleiding,
`evaluation-panel.tsx:68` een KPI-label, `version-history.tsx:289` een beschrijving; dat component
gebruikt bij leeg juist wél `EmptyState`). De claim "plus het hele merkportaal" is aantoonbaar
onwaar: alle vier muted-regels in `components/merk/` zijn beschrijvende inleidingen, en
`brand-data-view.tsx:47` gebruikt `EmptyState` — het merkportaal is een voorbeeld van geslaagde
omzetting. En `HANDOVER.md:2779-2783` logt er al elf expliciet als "kandidaat voor een volgende
veegbeurt", dus die zijn bewust afgebakende scope.

**Netto nieuw: zeven** — `dossier-list.tsx:28`, `quote-view.tsx:133`, `import-proposal.tsx:106`,
`brands-list-block.tsx:48`, `template-proposal.tsx:589`, `brand-load-queue.tsx:40`,
`brand-relations-table.tsx:221`. Ter referentie: `EmptyState` is al op 21 plekken in 16 bestanden in
gebruik.

**Het O8-argument van de finder is verworpen:** O8 accepteert `#8E9BA8` blanco en kent geen
carve-out naar rol; `empty-state.tsx:31-32` roept O8 zelf aan voor zijn muted uitleg.

---

## C2. Het AI-maandplafond staat standaard uit

`lib/ai/vangnet.ts:542-547` geeft bij een ontbrekend `llm_budget_eur` meteen `{over: false}` terug —
geen budget betekent geen plafond. De sleutel wordt nergens geseed; `lib/repo/settings.test.ts:70`
pint de null-default.

**De weerlegger heeft de ernst fors verlaagd en dat is terecht.** OCR heeft áltijd een cap
(`OCR_MAX_EUR_PER_RUN = 1.0`, getoetst vóór en onafhankelijk van de maandsetting, mét
reservering-vóór-call). Het vangnet heeft harde grenzen in tijd in plaats van euro's
(`VANGNET_MAX_MS = 120_000`, `MAX_TURNS_PER_LINE = 6`, `MAX_TOKENS_PER_CALL = 700`, haiku-4.5), en
de gemeten praktijk is €0,0619 voor een volledige import van 20 regels — centen per run, geen open
kraan. De cap werkt zodra hij staat (bewezen: `bun vitest run lib/ai/vangnet.test.ts -t "budget"`
→ skip + event, nul calls). Productie staat permanent op €10/maand, en commit `7071038` maakte
budget `0` juist een hard plafond, met vastgelegd *"alleen `budget == null` betekent nog geen cap"*.

**Reëel gat: alleen de verse-deploy-default.** Fix is één seed-regel of een `?? DEFAULT_CAP`.

---

## C3. `flagReviewAction` geeft een 500 op een onbekende `kind`

`app/projects/actions.ts:557-568` cast `formData.get("kind")` met `as` en geeft het door aan een
pgEnum-kolom (`db/schema.ts:116,500`) → `invalid input value for enum review_kind` (22P02).

**De zusterclaim over `decideReviewAction` is weerlegd.** De bewering dat een onbekende `decision`
een regel "stil uit de wachtrij" laat verdwijnen klopt niet: de regel verschijnt zichtbaar in de
sectie **Done** mét de rauwe waarde (`components/dossier/review-queue.tsx:776-800`), elke beslissing
schrijft een `review_decided`-event met de letterlijke decision, en voor het genoemde rode
OCR-geval blijft `roodOpen` juist waar — die regel blijft dus gewoon tellen. Bovendien zijn
`gecontroleerd` en `bevestigd` per ontwerp status-neutraal, dus een onbekende waarde levert exact
dezelfde toestand als een legitieme knopdruk.

Wat overblijft is de enum-crash, en die is netjes: de UPDATE faalt atomair, `app/error.tsx` vangt
hem af, geen datacorruptie. **Cosmetisch/audit-hygiëne.** Twee `includes`-checks lossen het op —
hetzelfde patroon dat `setStatusAction` (`:698`) en `setXisPhaseAction` (`:714`) al gebruiken.

---

## C4. `setDayPrice` accepteert negatieve prijzen

`numOrNull` (`app/projects/actions.ts:58-62`) controleert alleen op `NaN`. De keten
`setDayPrice` → `numeric(12,2)` → `countedLineTotal` (`lib/repo/estimate.ts:66-67`) doet nergens een
tekencontrole. De grens staat alleen in de UI (`match-candidates.tsx:394-396`, `type=number min=0`).

**Bijgesteld door de weerlegger:** `setQuantityAction` (de tweede helft van de claim) is **dode
code** — geen component importeert hem, dus zijn action-id staat in geen enkele bundle. En "de
klant-PDF klopt niet" is overtrokken: `€ -5.000,00` staat zichtbaar op de regel zelf, op scherm én
PDF, achter een menselijke Generate-stap. Het kan bovendien niet per ongeluk (`min="0" required`
blokkeert de browser-submit).

**Kern die blijft:** een domeinregel (`price >= 0`) hoort in `setDayPrice`, niet in de UI. **Klein.**

---

## C5. `requestPriceAction` mist een uuid-guard en rate limiting

`app/products/[id]/actions.ts:9-21` is de enige action zonder `requireSession()`.

**Het meeste hiervan is weerlegd.** Het ontbreken van de sessiecheck is **ontwerp**, niet omissie:
`app/products/[id]/page.tsx:24-29` zegt het letterlijk, en het is J-03 uit
`docs/FUNCTIONEEL-ONTWERP.md:762`. Een `requireSession()` zou de feature slopen. De "500 bij een
ongeldig uuid" is ook weerlegd: `app/error.tsx` bestaat precies hiervoor — het commentaar daar
citeert letterlijk `"invalid input syntax for type uuid"` als de melding die niet in beeld mag komen
— plus `app/global-error.tsx` als tweede vangnet, beide screenshot-getest.

**Wat blijft:** de uuid-guard ontbreekt (cosmetisch: een onnodige foutpagina op een pad dat alleen
via een vervalst request bereikbaar is), en er is nergens rate limiting (nul treffers op
`rateLimit|throttle` in de hele repo). Een anonieme bezoeker kan `leads` en `events` volschrijven —
maar `/catalog` zit achter een sessie, dus uuid's zijn niet te enumereren; je hebt een gedeelde
deeplink nodig.

---

## C6. Ontbrekende indexen op foreign keys — houdbaarheid, geen prestatiebevinding

Ik heb dit zelf geverifieerd: geen enkele migratie maakt een index op `spec_lines`, en
`db/schema.ts:466` heeft geen index-blok en geen unieke constraint die er één zou opleveren. De
weerlegger bevestigde het in Postgres zelf: `pg_indexes` op `spec_lines` geeft uitsluitend
`spec_lines_pkey`. Hetzelfde geldt voor `quotes.dossier_id`, `quote_lines.quote_id`,
`import_runs.dossier_id`, `substitution_proposals.dossier_id`, `armaturenboek_versions.dossier_id`,
`enrichment_runs.brand_id` en `events.created_at`.

**Maar het is vandaag geen bevinding en dat moet erbij.** `spec_lines` heeft 204 rijen en de
`dossier_id`-query meet 2,1 ms mét seq scan; `events` heeft 1.481 rijen en het enige gebruik is een
top-N met LIMIT 15. Een index levert nu nul meetbare winst en de planner zou hem waarschijnlijk niet
kiezen. **Houdbaarheidsnotitie** voor als deze tabellen naar zes cijfers groeien — en dan is het de
goedkoopste verzekering in de lijst (één migratie).

---

## C7. `#6b7280` als default accentkleur van een organisatie

`components/org/org-list.tsx:172` gebruikt `defaultValue={… : "#6b7280"}` — Tailwind gray-500, staat
niet in DESIGN.md §3. Eén klik op Save legt die niet-kit-kleur vast en maakt de stand "not set yet"
onbereikbaar.

**Voetnoot, geen huisstijlrest:** `accentColor` wordt nergens als kleur gerenderd — de enige
consumenten zijn de opslag en een plek waar hij als hex-*tekst* wordt geëchood. Er is geen
CSS-variabele, geen `style`, geen vlak. Wel breekt het DESIGN.md's harde regel 2 ("niet stilzwijgend
een keuze maken"), maar zolang niets ermee kleurt is dit dataschoonheid.

---

## C8. De uitkomst van een goedgekeurd merktemplate wordt weggegooid

`app/data/brand-relations/[brandId]/upload-actions.ts:200-209` gooit de returnwaarde van
`applyTemplateProposal` weg (zes tellingen, waaronder `skippedStaleFields` en `alreadyProcessed`) en
redirect meteen; de doelpagina leest geen `searchParams`.

**Fors afgezwakt door de weerlegger.** "Hij hoort nooit dat er velden niet geland zijn" is onwaar:
er is een bewust ontworpen terugkoppelkanaal. `lib/repo/template-return.ts:669-688` logt
`template_apply_finished` mét alle tellingen, en `components/data/event-log-block.tsx` heeft die
sleutels **expliciet** in `PAYLOAD_LABEL` staan (`skippedStaleFields: "Fields skipped (stale)"`) —
een whitelist die "EXPLICIETE LIJST, GEEN VANGNET" heet, dus iemand heeft ze er met opzet in gezet.
Het doelscherm verandert bovendien zichtbaar: de upload verdwijnt uit "Waiting for your review", de
relatiestatus springt naar `verwerkt`, de scorecard loopt op.

De stale-race vereist dat een ánder schrijfpad tussen renderen en goedkeuren dezelfde productkolom
wijzigt. **UX-verbetering, geen bevinding** — de verfijning ontbreekt op het moment dat de gebruiker
kijkt, maar er gaat niets verloren en er staat niets onwaars op het scherm.

---

# Wat is weerlegd

Dit is minstens zo waardevol als de lijst hierboven. Elf weerleg-agents kregen de opdracht
bevindingen onderuit te halen; dit is wat sneuvelde.

## Volledig weerlegd — géén bevinding

**"Tier-2 coverage meet geen tier-2-verrijking."** De teller in `lib/repo/enrichment.ts:567-590`
kijkt niet naar `tier2_source`, en dat is correct. `docs/FUNCTIONEEL-ONTWERP.md` §3.13a definieert de
meter letterlijk als *"% producten met gevulde matchvelden — de brandstofmeter van de matcher"* en
labelt hem "Tier 2-dekking". "Tier 2-velden" zijn in dit project de technische matchvelden, niet
"door verrijking gevulde velden"; `tier2_source` is H-09, een herkomststempel — een andere
grootheid. Zou je erop filteren, dan wees de brandstofmeter 0% terwijl de matcher op volle tank
draait, en dán zou het scherm liegen. De herkomstmaat bestaat en staat op de juiste plek
(`app/data/enrichment/page.tsx` → "(N enriched)"). De onderregel kwalificeert de kop exact: *"X of Y
products with at least one technical field filled"*. Restpunt is hooguit een naamcollisie: "Tier 2"
is dubbelbezet met de disclosure-as.

**"Tender toont alternatieven doordat het substitutievoorstel geen fasecheck heeft."** De poort staat
centraal waar regel 4 hem hoort te hebben: `lib/repo/equivalence.ts:156` weigert alles buiten
`awarded`. In tender is de knop in drie lagen onbereikbaar — de work-prep-tab wordt niet gerenderd
(`dossier-tabs.tsx:34-40`), de pagina zelf weigert (`work-prep/page.tsx:33`), en `listSubstitutions`
wordt in **geen enkele** pagina of component aangeroepen, dus er is nergens een lijst of link naar
een bestaand voorstel. Een bewaard document is bovendien geen suggestie: `SubstitutiePage` draait
geen engine, hij leest een momentopname. Restrisico (bookmarked URL na een fase-terugklap) is
defense-in-depth, geen regelschending.

**"`/projects` doet 1+n telqueries."** 13 dossiers, in een `Promise.all`, en `getStatusCounts` meet
2,1 ms. Eén parallelle golf van dertien triviale queries.

**"De review-pagina doet 173 seriële queries."** De kernbewering is aantoonbaar onjuist: de
buitenlus is `await Promise.all(pending.map(...))` (`review/page.tsx:108`) en de binnenlus óók
(`:73`) — twee parallelle golven. En de schaal klopt niet: `candidatesFor` draait alleen bij
`reviewKind` `geel` of `variant`, en dat zijn er **zes** in de hele database. De 88 wachtende
OCR-regels raken dit pad nooit.

**"Work-prep doet per gematchte regel een alternatieven-zoektocht."** De lus staat achter
`if (dossier.phase !== "awarded")` (`work-prep/page.tsx:33`) en er is **geen enkel dossier op
`awarded`** (12 tender/concept, 1 tender/archief). Onbereikbare code. Ijzeren regel 4 is hier gratis
een prestatiepoort.

**"Het event-log mist een index op `created_at`."** De index ontbreekt echt, maar `events` heeft
1.481 rijen en het enige gebruik is een top-N met LIMIT 15. Sub-milliseconde. Ruis.

**"De quote-PDF-route lekt andermans offerte (IDOR)."** Er is op deze commit geen tenancy-model, dus
"andermans dossier" is geen toestand. `app/projects/[id]/quote/page.tsx` geeft dezelfde data aan
dezelfde actor; de route lekt niets wat het scherm ernaast niet al geeft. Het argument "de
zusterroutes doen de check wél" valt ook weg: die toetsen `run.dossierId !== id`, een
nested-consistentiecheck, geen eigendom. → opgegaan in **B1**.

**"`requestPriceAction` mist ten onrechte `requireSession()`."** Dat is ontwerp (J-03,
`FUNCTIONEEL-ONTWERP.md:762`); een sessiecheck zou de feature slopen. De bijbehorende 500-claim is
ook weerlegd: `app/error.tsx` bestaat precies hiervoor en citeert de uuid-foutmelding letterlijk.
→ restant in **C5**.

## Gedeeltelijk weerlegd — bevinding blijft, cijfers of ernst bijgesteld

| Claim | Wat sneuvelde |
|---|---|
| 15 actions zonder containment | 4 zijn gedekt door de repo-laag; `proposalId` als action-parameter bestaat niet. Netto 11, en de ernst zakt van "autorisatiegat" naar hygiëne zolang er geen tenancy is. |
| 20 lege staten niet omgezet | 3 zijn geen lege staat, het merkportaal-verwijt is onjuist (dat gebruikt `EmptyState` juist), 11 staan al gelogd in `HANDOVER.md`. **Netto 7.** |
| 6 handgebouwde primaries | 2 zijn geen primary (`bg-destructive`, `bg-foreground`); 1 gemist. **Netto 5** — maar het bewijsscherm draagt er 3, niet 2. |
| 19 compacte formuliervelden | Ondergeteld: het zijn er **26**. |
| "Merkbranding staat op offertes" | Feitelijk onjuist: `branding` wordt alleen op het instellingenscherm gelezen, nul treffers in `lib/pdf/`. |
| "`createDossierAction` vervuilt andermans analytics" | Onbereikbaar: `getAnalyticsTiles(db)` wordt zonder `orgId` aangeroepen, de org-tak is dode code, de FK blokkeert een verzonnen uuid, en er zijn 0 organisaties. |
| "`mv_brand_considerations` overtelt na een delete" | Berust op een metriekdefinitie die het ontwerp uitdrukkelijk verwerpt (`FUNCTIONEEL-ONTWERP.md:1052`, events zijn append-only). → **B7** is smaller: ontbrekende *actor*, niet ontbrekende events. |
| "Regel 3 wordt geschonden door de prijslijst-logica" | Regel 3 wordt volledig nagekomen; het echte gat is de ontbrekende *verlenging*. → **B3**. |
| "AI-budget is fail-open, vangnet ongelimiteerd" | OCR heeft altijd €1/run; het vangnet heeft tijd-, turn- en tokengrenzen; gemeten €0,06 per run; productie staat op €10/maand. → **C2**, alleen de verse-deploy-default. |
| "CSV-import kan honderdduizenden regels" | Gemeten parameterlimiet: faalt boven 2978 rijen, en dan draait er géén matcher. → **B6**. |
| "`decideReviewAction` laat een regel stil verdwijnen" | De regel staat zichtbaar in "Done" mét event; het rode OCR-geval blijft juist tellen. → **C3**, alleen de enum-crash. |
| "`setQuantityAction` accepteert negatieve aantallen" | Dode code — geen component importeert hem. → **C4**. |
| "Verificatierij vóór de allowlist-poort" | Geen lek: token niet in de respons, geen user-rij, geen log. Alleen dode `verification`-rijen. **Voetnoot.** |
| "`/admin/brands` mist een limit" | De uitvoer *is* 438 rijen; een limit lost niets op. De 131 ms zit in de join, niet in ontbrekende paginering. |
| Rules-test `Array.isArray` | De vacuïteit is echt, maar regel 4 is elders wél goed gedekt (`rules.test.ts:67`, `equivalence.test.ts:27-32`). Eén regel dood gewicht, geen dekkingsgat. |

---

# Suite-toestand

Twee onafhankelijke volledige runs kwamen op **hetzelfde getal**: **1307 tests — 1303 geslaagd, 1
overgeslagen, 3 gefaald**, in 132–141 s over 101 testbestanden.

**De baseline in `HANDOVER.md:2183` (1010/1/3) is verouderd** — er zijn sindsdien tests bijgekomen;
geen regressie.

**De flaky-set is breder dan gedocumenteerd.** Drie runs gaven drie verschillende sets rode
bestanden:

| Run | Rode bestanden |
|---|---|
| `HANDOVER`-baseline | `custom-fields`, `pdf-upload` |
| Finder | `custom-fields`, `analytics-tiles`, `lib/repo/ocr` |
| Weerlegger | `custom-fields`, `projectlijst-ux` |

Alleen `custom-fields` staat op de bekende lijst. `analytics-tiles`, `lib/repo/ocr` en
`projectlijst-ux` staan nergens als flaky gedocumenteerd. Alle betrokken bestanden zijn geïsoleerd
groen (63/63). Alle falen zijn screenshot- of `waitFor`-timeouts onder belasting, geen logica. De
werkelijke flaky-verzameling is dus minstens zes bestanden en wisselt per run — de drie namen in de
briefing dekken hem niet.

**Verder gezond:** nul `it.skip`, `test.skip`, `.todo` of `.only` in de hele repo. De ene
overgeslagen test is legitiem en voorwaardelijk (`lib/pdf/render.smoke.test.ts:22` slaat over als het
niet-in-git Deerns-boek ontbreekt). De repo-tests draaien tegen een echte database (PGlite met
dezelfde migraties), elke test krijgt een verse instantie, en er is geen gedeelde toestand tussen
tests; slechts 4 van de 144 testbestanden gebruiken `vi.mock`.

---

# Wat ik niet heb kunnen beoordelen

- **Welke functieduur-limiet Vercel nu hanteert.** Er staat nergens een `maxDuration` en er is geen
  `vercel.json`; de platformdefault verschilt per plan en per Fluid-compute-stand en is niet uit de
  repo af te leiden. **A6** hangt hierop — de conclusie ("het plafond is nu geen keuze") staat los
  van het exacte getal, maar de ernst niet.
- **De Vercel↔Neon-latentie.** Alle metingen zijn vanaf een laptop gedaan (~110–160 ms per query).
  De querytéllingen zijn hard; de wandkloktijden op productie niet. Eén `console.time` rond één
  `runMatcher` in de productielogs pint dit in vijf minuten vast.
- **Productie-datatoestand voor enkele bevindingen.** Hoeveel merken op tier2/tier3 staan (**A5**),
  hoeveel prijslijsten al verlopen zijn (**B3**), of er vandaag een kandidaat precies in de gele
  optiekcode-band valt (**A2**). De code-analyse staat los van die aantallen, de urgentie niet.
- **Of `requestPriceAction`s action-id werkelijk uit een ongeauthenticeerde chunk te halen is.** Dat
  vraagt een productiebuild plus een request tegen een draaiende instantie.
- **Runtime-gedrag van Postgres op `Infinity` in `numeric(12,2)`.** Niet uitgevoerd tegen Neon.
- **Toegankelijkheid in een echte browser.** Alle contrast- en focusuitspraken zijn broncode-analyse
  plus doorgerekende WCAG-waarden; er is geen browsermeting gedaan. Specifiek onbeoordeeld: of de
  focusring op de vijf handgebouwde knoppen zichtbaar is (ze hebben geen eigen `focus-visible:` en
  vallen terug op de UA-outline).
- **`lib/ai/vangnet.ts` en `lib/ai/leesroute.ts` integraal op rekenfouten.** Alleen op
  reason-doorgifte en budgetlogica bekeken.
- **~85 testbestanden zijn niet regel-voor-regel gelezen** — er is gericht gezocht op mocks, zwakke
  matchers, skips en de geld-/autorisatiepaden.
- **De typografie-inconsistentie.** Er staan zes verschillende h2-vormen naast elkaar, waarvan 18px
  en 20px niet in de DESIGN.md-tabel voorkomen. Zonder geschreven norm voor "h2 in de app" is dat
  een stijloordeel, geen bevinding — maar het is wel een besluit dat nog niemand genomen heeft.

---

# Verantwoording

**Werkwijze.** Zeven finder-agents langs gescheiden assen (IDOR · overige veiligheid · correctheid ·
ijzeren regels · prestaties · tests · huisstijl), daarna elf weerleg-agents die per bevinding de
opdracht kregen hem te wéérleggen, met de instructie dat bij twijfel de bevinding vervalt. De
weerleggers zagen elkaars werk niet en kregen de claims zonder de redenering erachter.

**Dat de weerlegging echt werk deed, blijkt uit de uitkomst:** acht claims sneuvelden volledig,
vijftien werden in aantal of ernst bijgesteld, en drie werden juist *verzwaard* (A6 van 61 s naar
240 s per batch; B9 van 19 naar 26 velden; B11 van 132 naar 141 tests plus drie ongedekte schermen).
Drie weerleggers bouwden probes buiten de repo om hun oordeel te staven — die van B11, A9 en A2
weerlegden zichzelf empirisch.

**Twee dingen die ruimer waren dan ik had bedoeld, en die je moet weten:**
1. De prestatie-agenten hebben `EXPLAIN ANALYZE` gedraaid tegen de **productiedatabase** uit
   `.env.local`, binnen `BEGIN READ ONLY`-transacties. Er is niets geschreven, en de metingen in dit
   rapport zijn er beter door — maar het was ruimer dan "alleen lezen in de repo".
2. Enkele weerleggers hebben mutatietests gedraaid op **kopieën in hun scratchpad**, buiten de repo.
   De repo zelf is geen enkele keer gewijzigd: `git status` is schoon.

**Geen secrets in dit document** — waar env-variabelen ter sprake komen, staan alleen hun namen.

**Niet als bevinding opgevoerd**, conform de opdracht: de besluiten O8–O13 en G21 uit
`docs/DESIGN.md`, de acht al gemelde punten in `HANDOVER.md`, de zeven openstaande TNO-bevindingen,
`getAllBrandCompleteness`, de `orgId`-FK-declaratie, de leesroute-stopreden, `no_match_reason`, en de
budget-platslag. **Eén bekend punt is wél bijgesteld:** `getAllBrandCompleteness` is op zijn enige
aanroeppad niet meer traag — `app/data/brand-relations/page.tsx:66-70` geeft sinds de UX-audit alleen
de merk-id's van de zichtbare pagina mee (≤25), wat gemeten 1.056 ms → 60 ms scheelt. De
ongefilterde tak bestaat nog maar heeft geen productie-aanroeper.
