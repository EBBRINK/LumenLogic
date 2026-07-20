# Probleem 1.4 — wat er nog niet bewezen is (fase 1, eigen woorden)

> Geschreven vóór enige code, conform de verplichte werkwijze. Basis: `docs/sprint1-4-briefing.md`
> gelezen én de code zelf gecontroleerd (de briefing is niet de bron van waarheid).

## Wat het probleem NIET is

Er is geen bug en geen ontbrekende feature. 1.1, 1.2 en 1.3 zijn af, gedeployed en live
geverifieerd. Dit item bouwt vrijwel niets.

## Wat het probleem WEL is

**We hebben de keten nog nooit in één doorlopende beweging gezien, en de laatste schakel is
zelfs helemaal niet bewezen.**

De acceptatie eist dat nieuwe merkdata zichtbaar wordt in **scorecard én catalogus**. Van die
twee is alleen de scorecard-helft aannemelijk gemaakt. De catalogus-helft niet, en dat is geen
toeval maar een structureel gevolg van hoe de check op 20 jul verliep: die maakte een product
**zonder prijs**. En zonder geldige prijs kán een product per definitie niet in de catalogus
staan — `visible_products` is `product ⨝ prices ⨝ price_lists WHERE valid_from <= now <=
valid_until` (db/schema.ts:687). Ijzeren regel 3 is precies dat.

Dus: de Flos-check bewees de eerste 80% van de keten en stopte exact vóór de schakel die het
acceptatiecriterium onderscheidt van "er staat iets in een tabel".

## Waarom dat gat niet op een echt merk te dichten is

Om een product in `visible_products` te krijgen heb je een prijs nodig. Een prijs op een echt
merk moet waar zijn. Wij hebben geen echte, aangeleverde prijs van Flos of XAL — dus zou je er
één verzinnen. Dat is exact de fout van 20 jul: verzonnen specs (kelvin 2700, cri 90) op een
écht Flos-product, via het pad dat betekent "het merk heeft dit aangeleverd", op velden die de
matcher sturen. Eén klik op Approve had ze meegenomen.

Op een **testmerk** bestaat dat bezwaar niet: er is geen waarheid om tegen te liegen. Alles
eraan is per constructie herkenbaar test. Dat is niet "plan B als concessie" — het is voor
deze twee criteriumdelen de enige eerlijke methode.

Tweede criteriumdeel dat een testmerk nodig heeft: *"de 0007-kolommen tellen aantoonbaar
mee"*. Om te tónen dat ze meebewegen moet je ze van leeg naar gevuld zien gaan. Op een echt
merk met bestaande data zie je hooguit ruis; op een leeg testmerk zie je 0 → n.

## Het risico, in één zin

Een testmerk met een geldige prijs is een normaal product voor de matcher: `fetchCandidates`
stap 3a doet een **exacte SKU-match die niet merk-gescoped is** (lib/matching/engine.ts:266),
dus de merknaam beschermt niets — de **artikelcode** doet dat. Echte codes zijn kort en
gestructureerd (`Lp301`, `L004`, `Ad`, `C1`, `F1077009`); een code als
`ZZTEST-LUMENLOGIC-14-001` kan daar niet mee botsen.

## Waarom het opruimen géén DELETE is

Regel 3 is hier niet alleen een grens maar het gereedschap. De prijslijst op verlopen zetten
haalt het product uit `visible_products` en dus uit álle zoekresultaten en de matcher — zonder
één rij weg te gooien. Het audit-spoor blijft heel (regel 5), en het is zelf een meting: dit
is de enige manier om regel 3 lívé aan te tonen in plaats van hem te citeren.

Daarom moet de zichtbaarheid **vóór én ná** gemeten worden. Alleen "ná" bewijst niets (een
product dat er nooit stond is ook afwezig), alleen "vóór" bewijst regel 3 niet.

## Wat het deliverable is

**Cijfers, geen beweringen.** Vier metingen, read-only tegen de productie-DB (dev = prod):

1. Scorecard vóór/ná voor het testmerk — meetbare velden, grijs, must/wanna per bucket, met de
   0007-velden aantoonbaar in beweging.
2. Staat het product in `visible_products`? Query **én** live catalogus-UI. Dit is de helft die
   ontbrak.
3. Events: de hele keten met tijdstippen.
4. Ná het verlopen: hetzelfde product weg uit `visible_products`.

## Wat ik bij het lezen van de code al zag (aannames om te toetsen in fase 2)

- `brands.id` is `uuid("id").primaryKey()` **zonder** `defaultRandom()` (db/schema.ts:181) —
  het aanmaakscript moet de id zelf genereren. Anders dan `price_lists.id`, dat wél
  `defaultRandom()` heeft.
- Een merk aanmaken raakt mogelijk twee tabellen: `brands` én de merkrelatie-tabel (K2, 1-op-1
  met brands, db/schema.ts:1018). Te toetsen of het scherm zonder relatierij werkt.
- De prijslijst-fieldset op het goedkeurscherm verschijnt **alleen zonder actieve lijst**
  (upload-actions.ts:181-190). Een leeg testmerk heeft er geen → de fieldset verschijnt → daar
  vul ik naam + `validFrom` + `validUntil` in. Alle drie of geen.
- De prijs wordt gemeten via `EXISTS ... valid_until >= current_date`
  (brand-relations.ts:167-171), maar `visible_products` gebruikt óók `valid_from <= now`. Twee
  net iets andere definities van "geldig" — een `validFrom` in de toekomst zou de scorecard
  laten zeggen "prijs aanwezig" terwijl de catalogus leeg blijft. **`validFrom` moet vandaag of
  eerder zijn.** Dit is een valstrik die de meting stil kan laten mislukken.
- Het prijsveld heet `list_price_excl_vat` in de field-catalog (regel 93) en is `must`.

## Fase 2

Twee plan-agents, onafhankelijk, `model: opus`, met als kernvraag: **wát moet er precies
gemeten worden zodat de criteria echt gedekt zijn** — daar kan dit item op mislukken, niet op
de uitvoering.
