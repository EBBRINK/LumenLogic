# Sprint 1.4 — End-to-end met één merk, via een testmerk (briefing voor de bouwsessie)

> **Status: klaar om uit te voeren.** Opgesteld 20 jul 2026 door de sprintmaster-sessie van
> week 1, ná afronding van 1.1, 1.2 en 1.3. Zelfvoorzienend: een verse chat moet er zonder
> verdere context mee kunnen werken.
>
> **Dit is het weekdoel.** De vault zegt: *"Klaar wanneer: één echt merk is van begin tot eind
> door de route gegaan."* 1.1 t/m 1.3 waren de opbouw; dit is de proef.
>
> **Verwachte omvang: klein (~1–2 u).** Er wordt vrijwel niets gebouwd — dit is een
> verificatie-item. Bouw je meer dan een aanmaakscript: stop en meld het.

## Context in vijf zinnen

Lumen Logic (spec-/calculatie-/offertetool voor Brink Licht) kon merkdata alleen exporteren.
Week 1 bouwde de weg naar binnen: **1.1** valideert een ingevulde Excel, **1.2** doet upload →
voorstel → goedkeuren (niets stil wegschrijven), **1.3** maakte het merkenscherm eerlijk en
promoveerde het tot hoofdingang. Alle drie zijn af, gedeployed en live geverifieerd. Wat nog
niet bewezen is: dat data door de héle keten komt en **zichtbaar wordt in de catalogus** — de
Flos-check van 20 jul maakte een product zonder prijs, dus die helft ontbreekt. Dit item sluit
dat gat.

## Acceptatiecriteria (uit `docs/lumenlogic-sprintplan-augustus.md`, onverkort)

- *Given* één merk (via Eduard of **zelf-ingevuld**), *when* de hele loop draait (template
  kopiëren → ingevuld terug → upload → voorstel → goedkeuren), *then* is de nieuwe data
  zichtbaar in **scorecard én catalogus** (de 0007-kolommen tellen aantoonbaar mee) met
  volledig audit-spoor in events.

**"Zelf-ingevuld" is expliciet toegestaan** — het sprintplan voorziet het als plan B: *"geen
echt ingevulde template op tijd → 1.4 met zelf-ingevulde template, echte-merk-verificatie naar
week 2-buffer."* Besluit Timo (20 jul): we doen het met een **testmerk**. Dat is hier niet
alleen toegestaan maar **beter** — zie hieronder.

## Waarom een testmerk beter is dan een echt merk

Twee criteriumdelen kunnen op een echt merk niet eerlijk bewezen worden:

1. **"zichtbaar in de catalogus"** vereist een **geldige prijs** (ijzeren regel 3:
   `visible_products` koppelt zichtbaarheid aan een geldige prijslijst). Een prijs verzinnen
   op een echt merk is precies de fout die op 20 jul is gemaakt en vastgelegd — zie
   §"Wat er op 20 jul misging" hieronder. Op een testmerk mág een verzonnen prijs, want er is
   geen waarheid om tegen te liegen.
2. **"de 0007-kolommen tellen aantoonbaar mee"** kon vóór 1.3-A helemaal niet — die velden
   stonden op `measure: NONE` en telden niet in de scorecard. **1.3-A was dus een voorwaarde
   voor 1.4.** Nu meet de scorecard 70 velden in plaats van 25; een testmerk dat er veel van
   vult laat de scorecard aantoonbaar bewegen.

## ⚠️ Het enige echte risico, en hoe je het beheerst

**Een testmerk mét geldige prijzen is zichtbaar voor de matcher en kan dus in een echte
offerte opduiken.** Dat is het enige wat beheerst moet worden.

**De naamgeving is de eerste bescherming — en het gaat om de ARTIKELCODE, niet om de
merknaam.** De kandidatenzoektocht is merk-gescoped in stap 3b, **maar stap 3a niet**: een
exacte SKU-match zoekt merk-onafhankelijk over álle zichtbare producten
(`lib/matching/engine.ts:266`, `fetchCandidates`). Een botsing ontstaat dus via de code, niet
via de merknaam. Echte armatuurcodes uit de testset zien eruit als `Lp301`, `L004`, `Lr001B`,
`Ad`, `C1`, `Tn1`, `F1077009`. **Kies daarom artikelcodes die daar onmogelijk mee botsen**,
bv. `ZZTEST-LUMENLOGIC-14-001`. Merknaam idem onmiskenbaar (bv. `ZZ-TEST Lumen Logic`), maar
dat is de tweede lijn, niet de eerste.

**De uitschakelaar is ijzeren regel 3 zelf — geen `DELETE`.** Na afloop zet je de prijslijst
van het testmerk op verlopen (`valid_until` in het verleden). Gevolg: alle producten van dat
merk verdwijnen uit `visible_products` en daarmee uit álle zoekresultaten en de matcher.

Waarom dat beter is dan opruimen:
- **Onomkeerbaar verwijderen is nooit nodig** — zelfde afweging als bij testdossier
  `49c6340e` en `TEST-1.2-CHECK-DELETE-ME`, die allebei bewust zijn blijven staan.
- **Het audit-spoor blijft heel** (ijzeren regel 5): events, `brand_uploads`, de
  goedkeurbeslissing. Een log hoort te laten zien wat er echt gebeurd is.
- **Het demonstreert regel 3 live.** Je toont het mechanisme aan in plaats van eromheen te
  werken. Dat is zelf een verificatie waard: meet de zichtbaarheid vóór én ná het verlopen.

## Wat er op 20 jul misging — lees dit vóór je een fixture bouwt

Bij de live-check van 1.2 bouwde de bouwsessie een testbestand met **verzonnen specs**
(`kelvin 2700`, `cri 90`, "Brick red", prijs `899`) op een **echt** Flos-product, en stond op
het punt die goed te keuren — via precies het pad dat "het merk heeft dit aangeleverd"
betekent, op velden die de matcher sturen (kelvin matcht exact, CRI is een minimumeis).
`New` staat default aan, dus één klik op Approve had ze zonder vinkje meegenomen.

**De regel die daaruit volgt en hier geldt:** *testdata voor het retour-pad komt óf uit een
merkbron, óf staat op een herkenbaar testartikel — nooit plausibele specs op een echt product.*
Bij een testmerk is aan die regel per constructie voldaan: álles eraan is herkenbaar test.

**Raak in dit item géén bestaand merk aan.** Niet Flos, niet XAL, niets uit de catalogus.

## De keten die je doorloopt

| Stap | Waar | Let op |
|---|---|---|
| 1. Testmerk aanmaken | **script** — er is geen UI voor `insert(brands)` | Het enige wat je bouwt |
| 2. Template downloaden | `/data/brand-relations/template` | Ongewijzigd gebruiken — dit is wat een merk krijgt |
| 3. Template invullen | jouw fixture | Vul **veel 0007-velden** (sdcm, ugr, ean_code, url_*, dim_protocol…) — dat bewijst criterium "0007 telt mee" |
| 4. Uploaden | merkpagina van het testmerk | Het scherm vraagt zelf om prijslijst-datums |
| 5. Voorstel bekijken | voorstel-scherm | Alles is `new` (leeg merk) — vink aan wat je wilt |
| 6. Goedkeuren | idem | Nu pas wordt er geschreven |
| 7. **Meten** | scorecard + catalogus + events | Dit ís het item — zie hieronder |
| 8. **Uitschakelen** | prijslijst laten verlopen | Meet zichtbaarheid vóór én ná |

**Prijslijst-datums:** `upsertPriceLines` (`lib/repo/price-archive.ts:132`) maakt een lijst
alleen aan als de aanroeper `newList` meegeeft — het verzint bewust geen datums, want
`valid_until` drijft regel 3. Het uploadscherm vraagt ze uit. Kies een **korte geldigheid**
(bv. t/m eind deze week), zodat het testmerk ook zonder actie vanzelf onzichtbaar wordt.

## Wat je moet meten en rapporteren — dit is het eigenlijke deliverable

Beweren is niet genoeg; lever cijfers. Meet **read-only tegen de productie-DB** (dev = prod,
besluit B1) en rapporteer:

1. **Scorecard vóór en ná**, voor het testmerk: meetbare velden, grijs, en de must/wanna-ratio
   per bucket. Toon dat de 0007-velden meebewegen (dat is wat 1.3-A mogelijk maakte).
2. **Catalogus**: staat het product in `visible_products`? **Dat is de helft die de
   Flos-check niet bewees.** Toon het met een query én in de live catalogus-UI.
3. **Events**: de volledige keten (`template_upload_staged` → `template_apply_started` →
   `product_created_from_template` → `template_apply_finished`), met tijdstippen.
4. **Ná het verlopen**: hetzelfde product **niet meer** in `visible_products` — regel 3 live
   aangetoond, zonder dat er iets verwijderd is.

## Harde grenzen

- **Altijd eerst `git fetch origin`; redeneer tegen `origin/main`.**
- ⚠️ **Er kan een parallelle leesroute-sessie draaien die deze working directory deelt.**
  Gebruik **nooit** `git add -A` of `git commit -a` — altijd expliciete paden.
- **Geen migratie.** Een merk aanmaken is een INSERT, geen schemawijziging.
- **Raak `lib/excel-validate.ts`, `lib/template-diff.ts`, `lib/repo/template-return.ts` en
  `lib/field-catalog.ts` niet aan.** Dit item verifieert ze; het herbouwt ze niet. Vind je een
  bug: **melden met bewijs**, niet ter plekke fixen — dat maakt de verificatie waardeloos.
- **`~/Downloads/lumenlogic-testset/` is echte klantdata: NOOIT in git.** Niet nodig hier.
- **HANDOVER.md: eigen sectie toevoegen**, andermans secties niet herschrijven.
- **IJzeren regels 1–5** uit `CLAUDE.md`. Hier concreet: regel 3 is niet alleen een grens maar
  je gereedschap (de uitschakelaar), en regel 5 is waarom je niets weggooit.

## Werkwijze (verplicht, in deze volgorde)

1. **Probleem/opdracht uitschrijven** in eigen woorden. Nog geen code.
2. **Plan met 2 agents** (onafhankelijk, dan synthese). Nooit direct bouwen.
3. **Uitvoeren** — script, dan de keten, dan meten.

### Modelverdeling per fase

- **Fase 1 — probleem uitschrijven:** jij zelf.
- **Fase 2 — plan met 2 agents:** `model: opus`. Er valt weinig te ontwerpen; de keuzes staan
  hierboven. Laat de agents vooral toetsen **wát er precies gemeten moet worden** om de
  criteria echt te dekken — dat is waar dit item op kan mislukken.
- **Fase 3 — uitvoeren:** jij zelf, geen agents. Het is een keten van handelingen, geen
  bouwwerk.
- **Verificatie:** jij zelf.

Wijk je af, meld het met reden.

### Definition of Done

- [ ] `bun vitest run` groen · `bunx tsc --noEmit` schoon. *(Er verandert weinig code —
      draai ze omdat de DoD het eist, niet omdat je iets brak.)*
- [ ] Het aanmaakscript gecommit (expliciete paden) en gepusht.
- [ ] **De keten daadwerkelijk doorlopen in de live app** — niet in tests.
- [ ] De vier metingen hierboven, met cijfers.
- [ ] Prijslijst verlopen gezet; zichtbaarheid vóór/ná gemeten.
- [ ] `HANDOVER.md` bijgewerkt (eigen sectie: wat, aannames, wat er in productie blijft staan).
- [ ] Events: dit item voegt geen gedrag toe, maar de keten **logt** wel — controleer dat het
      spoor compleet is (dat is criterium 3).

⚠️ **Over het akkoord vóór de productie-deploy:** de afspraak is "stop vóór de push en vraag
Timo". Weet daarbij dat dit op een gedeelde `main` **geen effectieve rem** is: `git push`
stuurt élke commit op de branch mee, dus een andere sessie kan jouw werk ongevraagd
deployen — dat is deze week twee keer gebeurd. Vraag het akkoord toch, en meld het als je
merkt dat je commits al live staan. Timo heeft dit als openstaand besluit.

## Rapportage terug aan de sprintmaster

Lever: het scriptpad · commit-SHA's · **de vier metingen met concrete cijfers** · wat er in
productie is blijven staan (merk, producten, prijslijst, events) en waarom · wat bewust níét
gedaan is. De sprintmaster verifieert alles zelf tegen de live DB vóór 1.4 — en daarmee het
weekdoel — wordt afgevinkt.

**Vind je een fout in deze briefing: meld het, volg hem niet blind.** Dat is bij 1.1
(taalkeuze), 1.2 (`measure` als schrijf-brug) en 1.3 (navlabel vs. glossary) gebeurd en het
was alle drie de keren terecht. De briefing is niet de bron van waarheid, de code is dat.
