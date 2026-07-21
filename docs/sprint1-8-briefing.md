# Sprint 1.8 — velden toevoegen zonder de app te verlaten

*Zelfvoorzienende briefing. Je hoeft geen enkele eerdere sessie gelezen te hebben.*

⚠️ **Start pas als sprint 1.6 is afgerond en geverifieerd.** 1.6 herschikt de veldcatalogus en de
scorecard. Dit item bouwt daar bovenop en moet zich voegen naar hoe 1.6 het heeft achtergelaten —
niet ernaast. Timo: *"als 1.6 klaar is, dan bouwen we gewoon verder op 1.6. Dan kijken we hoe ze
het gebouwd hebben en dan bouwen we daar weer tegenaan."*

## Waarom dit er is

Stefan (nieuwe stagiair, start rond **21 augustus 2026**) baseert een groot deel van zijn
studiecasus op milieuberekeningen. Hij gaat velden willen toevoegen — nieuwe milieu-eisen,
nieuwe kentallen. **Timo's eis: Stefan hoeft het systeem daarvoor niet uit.**

Dat is een omkering van een eerder besluit (G16, "via de veldcatalogus met een recept in de
docs"). De reden voor de omkering is legitiem: een handleiding maakt Stefan afhankelijk van
iemand die code kan lezen, en dat was precies wat we wilden voorkomen.

## Wat een veld toevoegen vandaag betekent

Er zijn **66 velden** in `lib/field-catalog.ts`, verdeeld over categorieën. Elk veld is een regel
code met een label (NL + EN), een instructie voor het merk, een compleetheidsniveau
(`must`/`wanna`/`nice`) en een `measure` die naar een échte databasekolom wijst.

Zodra een veld daar staat, gebeurt de rest vanzelf. **Dat is de kracht die je moet behouden:**

| Gevolg | Waar |
|---|---|
| Het staat in het merk-Excel dat merken invullen | `lib/excel-template.ts` via `excelColumns()` |
| Het wordt gevalideerd bij upload | `lib/excel-validate.ts` |
| Het komt in het voorstel-scherm bij goedkeuring | `lib/template-diff.ts` |
| Het telt mee in de compleetheids-scorecard | `lib/repo/brand-relations.ts` |
| Merken zonder dat veld worden zichtbaar in de werklijst | de scorecard, en daarmee outreach |

**Dertien bestanden lezen de veldcatalogus** (`db/schema.ts` incluis). Dat is de omvang van dit
item — niet het formulier, maar het feit dat elk van die lezers een tweede soort veld moet gaan
begrijpen.

## De kern van het ontwerp

Een veld dat Stefan in de app aanmaakt, bestaat op dat moment nog niet als databasekolom. Twee
wegen, en één ervan is verboden:

**❌ De app past zijn eigen schema aan** (`ALTER TABLE` vanuit een knop). Doe dit niet. Dev en
productie zijn **één database**: een typefout is meteen een kolom in productie die je er niet
makkelijk uit krijgt, de Drizzle-migraties lopen uit de pas met de werkelijkheid, en er is geen
review-moment tussen "Stefan klikt" en "het schema verandert".

**✅ Losse velden in JSONB, met een definitietabel.** De definities (label, instructie, niveau,
categorie, sleutel) komen in een eigen tabel; de wáárden komen in een JSONB-kolom op `products`.
Geen schemawijziging bij het toevoegen van een veld. Dit patroon bestaat al in dit project —
`products.tier2_source` is jsonb (`db/schema.ts:291`), net als een handvol andere kolommen.

Er ontstaan daarmee **twee soorten velden**, en het plan moet expliciet maken hoe ze zich
verhouden:
- **Catalogusvelden** (de 66): getypt, met een eigen kolom, soms door de matcher gelezen.
- **Eigen velden** (van Stefan): ongetypt of licht getypt, in JSONB, **nooit door de matcher**.

## Harde grenzen

- **Een eigen veld raakt de matching nooit.** IJzeren regel: matching-logica staat strikt
  gescheiden, en geld beïnvloedt nooit de ranking. Een veld dat een gebruiker zelf verzint mag
  onder geen beding in `lib/matching/` terechtkomen — ook niet "per ongeluk" doordat een generieke
  loop alle velden meeneemt. **Toon in je rapport aan dat dit onmogelijk is**, niet dat het niet
  gebeurt.
- **Geen `ALTER TABLE` vanuit de applicatie.** Zie hierboven.
- **De 437 bronimport-merken en de 211.317 producten blijven ongemoeid.** Puur additief.
  Fingerprint vóór en ná; de query staat in `docs/sprint1-5-fase1-probleem.md`.
- **Verwijderen van een eigen veld moet net zo veilig zijn als bij merken (sprint 1.5):** eerst
  tellen hoeveel producten een waarde hebben, dat tonen, en niet stilzwijgend data weggooien.
- **Elke actie logt een event** (ijzeren regel 5): veld aangemaakt, gewijzigd, verwijderd.
- Vind je een bug in bestaande code: **meld hem met bewijs, repareer hem niet.**

## Vallen

**1. Labelbotsing in het Excel.** Het merk-Excel matcht kolommen op **labeltekst in rij 2**
(`lib/excel-template.ts:31`), niet op positie. Een eigen veld dat "EAN code" heet, maakt het
bestand dubbelzinnig en kan stil de verkeerde kolom vullen. Controleer op botsing bij het
aanmaken — en niet alleen op de exacte tekst.

**2. Het bestand groeit.** Er staan nu 66 kolommen in het template. Elk eigen veld komt erbij, bij
elk merk, voor altijd. Denk na over wat er gebeurt bij twintig extra velden — en of een eigen veld
standaard wél of niet in het merk-Excel hoort. **Dit is een ontwerpvraag voor de planfase, geen
detail.**

**3. `measure` is de brug naar de meting, en die is eerder stukgelopen.** De 66 velden dragen een
`measure` die naar een kolom wijst; in juli liep die vijf weken achter op het schema, waardoor de
scorecard te laag rapporteerde. Een tweede soort veld verdubbelt dat risico. **Ontwerp zo dat een
eigen veld niet kán bestaan zonder geldige meting.**

**4. Sprint 1.6 heeft de scorecard net verbouwd.** Daar geldt sinds 1.6: categorie 1 t/m 10 gaan
uitsluitend over velden die in het merk-Excel staan, de interne velden zitten in "11. Internal",
en de totalen zijn veldgewogen. **Lees eerst wat 1.6 heeft opgeleverd** en voeg je eigen velden
in dat model in; verzin geen tweede indeling.

## Het recept voor Stefan — deliverable, geen bijzaak

`docs/milieuvelden-toevoegen.md`. Nu pas te schrijven, want nu bestaat het scherm.

- Hoe hij via de app een veld toevoegt, met één echt voorbeeld dat werkt.
- **Wanneer een eigen veld niet volstaat** en er een echt catalogusveld nodig is — namelijk als
  de matcher het moet lezen. Dat is de grens die hij moet snappen.
- Wat `must` / `wanna` / `nice` betekenen voor de scorecard en dus voor de outreach.
- Waarom een veld dat nergens gevraagd wordt, altijd leeg blijft: als het niet in het merk-Excel
  komt, levert geen enkel merk het aan. **Dat is de valkuil die zijn onderzoeksdata waardeloos
  zou maken.**

Toets aan één criterium: *kan iemand die dit project niet kent er een werkend veld mee toevoegen?*
Doe dat niet op gevoel — **voeg zelf een veld toe door alleen je eigen document te volgen** en
beschrijf waar je struikelde.

## Definition of Done

1. Ik kan in de app een milieuveld toevoegen (label, instructie, niveau, categorie) zonder code.
2. Dat veld verschijnt in het eerstvolgende gedownloade merk-Excel — **laat het bestand zien**.
3. Een merk dat het veld niet heeft ingevuld, is als zodanig zichtbaar in de scorecard, in het
   model dat 1.6 heeft opgeleverd.
4. Een ingevulde waarde overleeft het volledige retour-pad: upload → voorstel → goedkeuren →
   zichtbaar. Meet dat end-to-end op een testmerk, zoals sprint 1.4 het deed.
5. **Aangetoond dat een eigen veld de matcher niet kan bereiken.**
6. Verwijderen toont eerst hoeveel producten een waarde hebben.
7. **De 437 merken en 211.317 producten zijn ongewijzigd** — fingerprint vóór en ná.
8. `docs/milieuvelden-toevoegen.md` bestaat, en jij hebt er zelf een veld mee toegevoegd.
9. White-box RSC-test met screenshots (light/dark × mobile/desktop). Bekijk de PNG's zelf.
10. `bunx tsc --noEmit` schoon en `bun vitest run` groen.

## Modelverdeling per fase

| Fase | Model | Wat |
|---|---|---|
| **1. Probleem** | het lichtere model | Lees wat 1.6 heeft achtergelaten en breng zelf in kaart welke van de dertien lezers een tweede soort veld moeten begrijpen. Verifieer de vallen zelf — er zijn nu vijf briefingfouten van de sprintmaster gevangen door bouwsessies; bij schema-vragen is de database de bron, niet `db/schema.ts`. Nog geen code |
| **2. Plan** | **het scherpste model, twee agents parallel** | De echte vragen: hoe eigen velden en catalogusvelden naast elkaar bestaan zonder de dertien lezers te verdubbelen · of een eigen veld standaard in het merk-Excel hoort · hoe je afdwingt dat de matcher er niet bij kan · hoe verwijderen veilig blijft. Laat de plannen botsen en kies per punt de sterkste, met argument |
| **3. Bouwen** | het lichtere model, twee agents | Agent 1: datamodel, definitietabel, JSONB-waarden, repo en de integratie met template/validatie/diff. Agent 2: het scherm, de scorecard-integratie en het recept. Ze delen het type van een velddefinitie: **leg dat vóór de start vast** |

## Wat expliciet buiten scope is

- **Een schrijfpad in het merkportaal.** Dat is 4.B. Stefan en Brink werken aan onze kant.
- **De afstand tot Brink Licht.** Dat is sprint 1.7 en staat los.
- **Rekenmodellen voor milieu-impact.** Dit item levert de velden; wat Stefan ermee uitrekent is
  zijn studiecasus, niet onze sprint.

## Stop vóór de push

Committen mag; pushen doet alleen de sprintmaster. `git add` met expliciete bestandsnamen, nooit
`-A` — er draaien parallelle sessies in dezelfde werkdirectory. Eerst `git fetch origin`,
redeneer tegen `origin/main`.
