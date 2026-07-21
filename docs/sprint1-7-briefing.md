# Sprint 1.7 — milieudata: de afstand tot Brink Licht

*Zelfvoorzienende briefing. Je hoeft geen enkele eerdere sessie gelezen te hebben.*

## Wat de grill opleverde: veel minder dan gevraagd

Timo vroeg om een milieukopje met garantietermijn, energielabels en de afstand van de fabriek tot
Brink Licht. **Drie van de vier bestaan al** — en we vrágen er al om in het Excel-template dat
merken krijgen:

| Wens | Bestaat | Waar |
|---|---|---|
| Garantietermijn | ✅ `warranty_months`, per product | categorie 10, in het template |
| Energielabel | ✅ `energy_label` ("EU-energielabel, bv. 'D'"), per product | categorie 8, in het template |
| Land van herkomst | ✅ `country_of_origin`, per product | categorie 10, in het template |
| **Afstand tot Brink Licht** | ❌ | bestaat niet |

Timo's reactie hierop: *"als het aan de Excel staat, is het goed. Dan had ik het gewoon net over
het hoofd gezien."*

**Het echte probleem is niet dat de velden ontbreken — het is dat ze leeg zijn.** Gemeten over
**211.317 producten**: `energy_label` **0**, `warranty_months` **23**, `country_of_origin` **20**,
`repairability` **20**. We vragen ernaar en er komt niets terug. Dat is een outreach-probleem,
geen datamodelprobleem, en 1.7 lost het niet op.

## Wat je bouwt

**Eén nieuw gegeven op het merk: de afstand tot Brink Licht.** Meer niet — het recept voor Stefan
is uit dit item gehaald en verhuisd naar sprint 1.8 (zie verderop).

Brink Licht: **Veldzigt 30A, 3454 PW Utrecht**. Leg dat adres op één plek vast, niet verspreid —
als Brink verhuist moet elke afstand herrekenbaar zijn.

## De besluiten van Timo (21 jul, uit de grill)

| # | Besluit | Waarom |
|---|---|---|
| G13 | **Alleen de afstand is nieuw**; garantie, energielabel en herkomst blijven waar ze zijn | Ze staan al in het template. Verplaatsen levert geen enkel extra ingevuld veld op |
| G14 | **Sla de kilometers én de fabriekslocatie op**, niet alleen het getal | "1.250 km" is anders niet te controleren en niet te herhalen. Bij een merk met fabrieken in drie landen weet niemand later welke bedoeld was — en als Brink verhuist klopt alles stil niet meer |
| G15 | **Het merk mag alles aanleveren, maar het gaat eerst door een review** — wij keuren goed, dán is het live | Timo's woorden: *"het gaat dan eerst naar een kopje review voor ons, wij drukken op ja of nee en dan gaat het live"*. Dit is exact het bestaande retour-pad, geen nieuw mechanisme |
| G16 | **Uitbreiden gaat via de veldcatalogus, met een recept in de docs** | Eén regel in `lib/field-catalog.ts` en het veld verschijnt vanzelf in het merk-Excel, in de scorecard én in het retour-pad. Dat werkt al zo voor de 66 bestaande velden |

## De spanning die je moet kennen vóór je begint

**G15 werkt vandaag voor productdata, maar er is geen kanaal voor merkdata.**

- Het merk-Excel bestaat uit **productrijen**. "Waar staat jullie hoofdfabriek" is een feit over
  het *bedrijf*, niet over een armatuur — dat past niet in een productrij.
- Het **merkportaal kan niets opslaan**. Geverifieerd: `app/brand/data/page.tsx` is inzage —
  *"het merk ziet zijn eigen producten + specs, zonder prijs of ranking"*. Er is geen enkel
  schrijfpad. Dat bouwen is 4.B (merkportaal self-serve) en staat veel later.

**Gevolg voor 1.7: de fabriekslocatie wordt door Brink ingevuld**, op basis van wat het merk per
mail antwoordt. Dat is geen afwijking van G15 maar de erkenning dat het invoerkanaal er nog niet
is. **Bouw dat kanaal niet** — noteer het als opvolgtaak en laat het ontwerp bij 4.B.

**Let ook op het belangenconflict**, want dat bepaalt wat je waar neerzet: de kilometers zijn de
afstand tot **ons** adres. Zodra dat meeweegt in een duurzaamheidsvergelijking, heeft een merk er
belang bij laag te schatten. De **fabriekslocatie** is hun feit; de **afstand** is onze
berekening. Houd die twee gescheiden, ook als ze straks uit hetzelfde formulier komen.

## Waar het komt te staan

Het merkbeheerscherm uit sprint 1.5 (`/admin/brands`, met `new/` en `[brandId]/`-routes) is de
plek: daar worden merkvelden al bewerkt. Zet de milieugegevens onder een **eigen kopje**, niet
tussen naam en website — Timo vroeg expliciet om een apart kopje, en het is de plek waar Stefan
straks als eerste kijkt.

| Wat | Waar |
|---|---|
| Merkformulier | `components/admin/brand-form.tsx` |
| Server actions | `app/admin/brands/actions.ts` |
| Repo-laag | `lib/repo/brands.ts` |
| Schema | `db/schema.ts` (`brands`, rond regel 179) |

## Vallen

**1. `brands.warranty` bestaat al en is iets anders.** Er staat een tekstkolom `warranty` op
`brands` (`db/schema.ts:206`) naast `products.warranty_months`. Gebruik die niet voor milieudata
en hernoem hem niet — hij komt uit de bronimport.

**2. `brands.id` heeft geen `defaultRandom()`.** Niet relevant als je alleen kolommen toevoegt,
wél zodra je een testrij maakt.

**3. Kies het type bewust.** Kilometers zijn een getal waarmee Stefan gaat rekenen; zet er geen
tekstveld neer waar "ca. 1200" in past. Een lege waarde moet "niet ingevuld" betekenen en geen 0
— 0 km zou "de fabriek staat in Utrecht" betekenen.

**4. De migratie mag geen bestaande rij aanraken.** Besluit G2 uit sprint 1.5 geldt onverkort:
de 437 merken uit de bronimport blijven exact zoals ze zijn. Puur additief, kolomdefault, geen
backfill. Meet het met een fingerprint vóór en ná — `docs/sprint1-5-fase1-probleem.md` bevat de
query.

**5. Sluit het testmerk uit bij tellingen.** `ZZTEST QA-15` is van de sprintmaster; de bronimport
telt 437 merken, inclusief testmerk 438.

## Het recept voor Stefan verhuist naar 1.8

De eerste versie van deze briefing liet 1.7 een handleiding schrijven waarmee Stefan zelf velden
kan toevoegen. **Dat is geschrapt** (Timo, 21 jul): hij wil dat Stefan het systeem niet uit hoeft,
dus er komt een scherm om velden toe te voegen — sprint 1.8.

Een recept dat uitlegt hoe je een regel code toevoegt, is dan binnen twee weken achterhaald.
Het recept hoort dus bij het scherm, en wordt in 1.8 geschreven. **Schrijf hier geen handleiding.**

## Definition of Done

1. Ik kan bij een merk op `/admin/brands` de fabriekslocatie en de afstand in kilometers
   invullen en bewerken, onder een eigen milieukopje.
2. Leeg blijft leeg: een merk zonder ingevulde afstand toont geen 0.
3. Elke wijziging logt een event (ijzeren regel 5), net als de andere merkacties uit 1.5.
4. **De 437 bronimport-merken zijn ongewijzigd** — fingerprint vóór en ná, identiek.
5. Het adres van Brink Licht staat op één plek in de code, niet hardgecodeerd op meerdere.
6. White-box RSC-test met screenshots (light/dark × mobile/desktop). Bekijk de PNG's zelf.
7. `bunx tsc --noEmit` schoon en `bun vitest run` groen.

## Modelverdeling per fase

| Fase | Model | Wat |
|---|---|---|
| **1. Probleem** | het lichtere model | Verifieer zelf tegen de live database dat de drie velden bestaan, in het template staan en leeg zijn. Neem mijn getallen niet over — er zijn nu vijf briefingfouten van de sprintmaster gevangen door bouwsessies. Nog geen code |
| **2. Plan** | **het scherpste model, twee agents parallel** | De interessante vragen: hoe je locatie + afstand modelleert zonder een half adresboek te bouwen, en waar het Brink-adres woont zodat het bij een verhuizing op één plek verandert. Laat ze botsen |
| **3. Bouwen** | het lichtere model, één agent | Twee kolommen, een formulierblok en een event. Klein en samenhangend; twee agents zouden elkaar in de weg zitten |

## Harde grenzen

- **Bouw geen schrijfpad in het merkportaal.** Dat is 4.B; zie de spanning hierboven.
- **Verplaats geen bestaande velden.** Garantie, energielabel en herkomst blijven waar ze staan
  (G13). Het verplaatsen van `energy_label` van categorie 8 naar 10 is verleidelijk en levert
  niets op — sprint 1.6 werkt bovendien op dat moment aan de categorie-indeling; jullie zouden
  elkaar raken.
- **Geen externe kaartdienst.** Geen geocoding, geen API-sleutel. De kilometers worden ingetypt.
- **Stop vóór de push.** Committen mag; pushen doet alleen de sprintmaster. `git add` met
  expliciete bestandsnamen, nooit `-A` — er draaien parallelle sessies in dezelfde werkdirectory.
  Eerst `git fetch origin`, redeneer tegen `origin/main`.
- Vind je een bug in bestaande code: **meld hem met bewijs, repareer hem niet.**

## Let op: sprint 1.6 loopt mogelijk tegelijk

1.6 herschikt de scorecard (categorie 1 t/m 10 gaan alleen over Excel-velden, de interne velden
verhuizen naar "11. Internal") en raakt `lib/field-catalog.ts`, `lib/repo/brand-relations.ts` en
`components/data/brand-scorecard.tsx`. **Blijf uit die drie bestanden.** Moet je er tóch in zijn,
meld het en overleg — twee sessies die tegelijk de veldcatalogus herschikken is precies hoe je
een conflict krijgt dat niemand kan ontwarren.
