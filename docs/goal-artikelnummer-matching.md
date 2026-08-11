# Goal: matchen op het gevraagde artikelnummer, en eisen die er echt staan

> Probleem met alle metingen: `docs/probleem-artikelnummer-matching.md` (11 aug 2026).
> **Gebouwd op 11 aug** — zie "Gebouwd" hieronder voor de uitkomst en voor wat er niet
> gehaald is.

## ✅ Gebouwd (11 aug)

Alle vijf tickets, in één run. Wat de meetlat opleverde:

| | uitkomst |
|---|---|
| Driverregel `21012 0298` | **groen** via de exacte codetreffer, watt 20→20 |
| Zelfde regel mét de IP50-eis erop | **groen** in plaats van rood (B7), afwijking wordt getoond |
| Codetreffer waarbij élk veld rood is | **open** — kandidaat blijft zichtbaar, mens beslist |
| LUNELLE-regel (`32812 9220 BRBB`) | tekstroute draait door, mét event **en** melding op het scherm |
| Regel met alléén een artikelnummer | matcht nu; strandde eerst op "te weinig gevraagd" |
| Spec-lek uit de buurregel | dicht: de driver houdt zijn eigen 20 W, geen 2700K/IP50 meer |
| Artikelnummers mét spatie | compleet in `req_article_code` én `fixture_code` |

**De echte oorzaak van het spec-lek, gemeten en anders dan gedacht.** Niet de parse-invoer
maar de rijsegmentering: `vindRijSegmenten` snijdt van de code tot het volgende anker, en
dat klopt alleen als de code de rij ÓPENT (armaturenboek). In een offerteaanvraag sluit de
code de rij af, dus het segment liep van het eigen artikelnummer door tot in de omschrijving
van de volgende rij. Het segment voor `21012` luidde letterlijk:

```
21012 0298 14\nTrizo21\nOmschrijving Artikelnummer Aantal\nWand opbouw Trizo21 BOULO W in
MATT Glass LED9W 2700K IP50 (voor betonnen wand)
```

Vandaar de IP50 van een ánder merk. De fix is een layout-toets per pagina in plaats van een
vaste regel: staat de code vooraan, dan blijft alles byte-identiek aan vandaag.

**Waarom niet "een segment stopt bij een newline"** — dat was de eerste, simpelste
gedachte, en hij is gemeten en verworpen: over de vier echte armaturenboek-runs verliezen
dan **108 van 108 segmenten ál hun specvelden**. Die PDF's breken één rij over veel
tekstregels. De layout-toets scheidt de twee soorten perfect: alle 6 armaturenboek-runs
100% code-vooraan, alle 3 offerteaanvraag-runs code-achteraan, geen twijfelgeval.

**Regressie-anker.** `scripts/eval-testset.ts` over raadhuis + kvk + tno + dordrecht,
voor en na: de eindtabel is **regel voor regel identiek** (raadhuis 31/31, merk 14/0/17,
open:11 blauw:10 geel:7 rood:2 paars:1; tno 15/20, 7/0/8). `bun run typecheck` schoon,
`bun vitest run` 1989 groen. Geen nieuwe lint-fouten.

### Eerlijk over wat er NIET gehaald is

- **De white-box RSC-test op de regel-detailpagina zelf is er niet gekomen.** Die pagina
  geeft server actions door aan client-componenten, en in het RSC-testharnas verliezen die
  onder `vi.mock` hun `"use server"`-markering: de render valt om met *"Functions cannot be
  passed directly to Client Components"*. Drie omwegen geprobeerd en gemeten (`next/link`
  stubben, `lucide-react` stubben, de acties vervangen door `lib/test-actions`) — geen ervan
  haalt het. In plaats daarvan is het nieuwe stuk UI als eigen pure component afgesneden
  (`components/dossier/requested-article-code.tsx`) en dáár getest, mét de vier opnamen
  (licht/donker × mobiel/desktop). Het besluit eronder — staat dit nummer in de zichtbare
  catalogus? — is apart getoetst in `lib/repo/article-code-exists.test.ts`, inclusief een
  test die vastlegt dat het scherm hetzelfde zegt als de matcher. **Het gat blijft dat
  niets de pagina als geheel pint.** Wie het harnas ooit vlot trekt: begin daar.
- **De prompt-wijziging is niet end-to-end tegen het echte model gemeten.** De
  deterministische kant (toolschema, `parseLeverRegels`, `regelToSpecLine`, segmentering)
  is volledig getest met vastgelegde modeloutput, maar of het model de nieuwe
  `artikelnummer`-regel ook echt volgt op de fixture-PDF vraagt een betaalde AI-call. Die
  is niet gedaan.
- **Bestaande regels zijn niet gebackfilled.** De kolom is nullable; wat er nu staat,
  gedraagt zich als vandaag. De drie bestaande offerteaanvraag-runs dragen nog hun
  verminkte `fixture_code` — die moeten opnieuw ingelezen worden om te profiteren.

---

## Het plan zoals het er lag

## De opdracht in één zin

Geef het gevraagde artikelnummer een eigen veld dat de matcher als eerste en hardste signaal
gebruikt — met een eerlijke "niet gevonden" als de code nergens op slaat — en repareer tegelijk
de leesroute die eisen verzint die niet in de regel staan, want zonder dat tweede stuk vindt de
matcher het juiste product en keurt het alsnog af (gemeten: **rood**).

## Beslissingen

**B1 — Een eigen kolom, geen hergebruik van `fixture_code`.**
Nieuw: `spec_lines.req_article_code text` (nullable). `fixture_code` blijft wat de schemacommentaar
zegt: de **positiecode** uit een armaturenboek ("Lp301"), `notNull`. Dat de leesroute er vandaag
artikelnummers in propt is precies de verwarring die dit oplost. Twee betekenissen in één kolom is
hoe dit dossier is ontstaan.

**B2 — De kolomwaarde komt heel binnen.**
Het artikelnummer is de **hele cel** uit de kolom `Artikelnummer`, spaties incluis
(`32812 9220 BRBB`, `BLWIM 1122`). Niet het eerste token, en nooit een fragment uit de
omschrijving. Gemeten: 3 van 3 codes mét spatie gingen kapot, 16 van 16 zonder spatie waren goed.

**B3 — Code eerst, en hard.**
`specRequestFromLine` geeft `req_article_code` door als `sku`; daarmee gaat de bestaande
exacte-SKU-route ([engine.ts:419](lib/matching/engine.ts:419)) leven. `normalizeSku` strikt al
alles behalve `[a-z0-9]`, dus de spaties in de code én in `supplier_article_code` vallen aan beide
kanten weg — geen nieuwe normalisatie nodig. Een exacte hit **ís** de kandidatenset; er wordt niet
langs de tekstroute bijgemengd.

**B4 — Een exacte codehit wordt nooit weggegooid op een afwijking.**
Gemeten: mét code en met de huidige (verzonnen) IP50-eis wordt de regel **rood** — de engine vindt
het juiste artikel en verwerpt het. Dat is absurd: de klant heeft dit artikelnummer letterlijk
opgeschreven. Bij een exacte codehit worden afwijkingen **gerapporteerd** maar verwijderen ze de
kandidaat nooit. Zie B7 voor wat de status dan wordt.

**B5 — Een onvindbare code is geen fout; de tekstroute blijft gewoon draaien.**
*Besluit Timo (11 aug):* een code die niets oplevert betekent niet dat de regel fout is — dan
proberen we het zoals we het altijd probeerden. De bestaande tekstterugval blijft dus staan; er
komt géén harde rode stop.

*Besluit Timo (11 aug), erbovenop:* leg wél vast dát de gevraagde code niets opleverde — als event
(ijzeren regel 5) **en** zichtbaar op de regel. Aanleiding: gemeten levert `32812 9220 BRBB` acht
SPY 52 CLIP-varianten op terwijl de héle LUNELLE-familie in onze catalogus ontbreekt. De kandidaten
blijven staan, niets wordt geblokkeerd — maar niemand hoeft eruit af te leiden dat de import
compleet is.

**B6 — Een gevraagde spec komt uit de eigen regel, of nergens vandaan.**
Gemeten: de driverregel kreeg `IP50` van een **Trizo21**-regel twee blokken lager en `2700K` van de
regel erboven. **Eerst isoleren welke van de drie parse-invoeren lekt**
(`regel.ruweTekst` / `type` / `segmentTekst`, [ocr.ts:767](lib/repo/ocr.ts:767)) — dat is een
meting, geen gok. Randvoorwaarde: die join bestaat om `probleem-ocr-toc-verdringt-specs.md` op te
lossen (specs staan vaak alléén in de langere ruwe tekst); die fix mag niet sneuvelen. Levert de
meting op dat je moet kiezen tussen beide, dan stopt de bouwer en legt het voor.

**B7 — Een exacte codehit is groen.**
*Besluit Timo (11 aug):* is het artikelnummer hetzelfde, dan altijd groen — zolang niet álle specs
compleet anders zijn. Een klein verschil mag.

Concreet als regel, en dit is de enige plek waar de bouwer hem mag invullen:

- exacte codehit → **groen**, ook met afwijkingen; die worden gewoon getoond;
- **uitzondering:** is élk beoordeeld veld rood — geen enkel veld groen of geel — dan niet groen
  maar open. Dat patroon betekent dat de code op iets heel anders slaat (verkeerd overgetypt, code
  van een ander merk), en dan hoort er een mens naar te kijken;
- velden zonder data blijven neutraal (besluit 4) en tellen niet mee in die telling.

Dit activeert de uitzondering die de engine zelf al aankondigt
([engine.ts:689](lib/matching/engine.ts:689)): *"een exacte 3a-SKU-hit mag als aantoonbaar gelden —
de SKU is zelf de meest specifieke eis"*, als uitzondering op Gat A (spec-loos → hooguit lijst 2).

⚠️ **Bouw ticket 04 in dezelfde run.** Op de gemeten regel is de uitkomst van B7 al goed vóór 04
(watt groen + IP rood + kelvin geen data → niet alles rood → groen), maar de getoonde afwijking is
dan wel onzin: "IP50 gevraagd" staat nergens in het document. Groen met een verzonnen afwijking
eronder is precies het soort halve waarheid dat een klantdocument in gaat.

## Wat er NIET in zit — en waarom

- **De `[LPS]`-naamgeving.** 36 producten heten `[LPS] …`, 12 `LED POWER SUPPLY …`, plus dubbele
  rijen (`21012 0515` en `21012 0575` delen een naam). Dat is een **importprobleem**, geen
  matchingprobleem, en het is nu de dominante oorzaak van de foute tekstmatch. Zodra code-eerst
  werkt is het voor deze regels niet meer bepalend — maar voor élke regel zónder artikelnummer
  blijft het onverkort staan. Eigen dossier.
- **De ontbrekende LUNELLE-familie.** Prefix `32811/32812/32813/32820` staat nergens in de
  catalogus terwijl Delta Light 18.667 producten heeft. Onvolledige prijslijst; los op bij de bron.
  B5 zorgt dat dit soort gaten voortaan zíchtbaar wordt in plaats van weggemoffeld.
- **De dedupe op `armatuurcode`** (`lib/repo/ocr.ts:468`) die bij verminkte codes stil een regel
  kan verliezen. Risico gesignaleerd, niet gemeten. Alleen aanpakken als 02 het aantoonbaar raakt.

## Testnaden — ⚠️ eerst bevestigen bij Timo

Zoals de Werkwijze in `CLAUDE.md` eist: white-box RSC-test met screenshots (light/dark ×
mobile/desktop) vóór het af heet. Voorgestelde naden, van goedkoop naar duur:

1. **Leesroute (puur, geen DB)** — `regelToSpecLine` is al geëxporteerd. Fixture-regels met een
   code mét spatie, plus een IP op een latere regel van een ánder merk. Assert: code heel,
   `req_ip = null` op de driverregel, `IP50` blijft op de Trizo21-regel.
2. **Matcher (DB-naad)** — `lib/matching/engine.test.ts`: exacte codehit wint van tekst; codehit
   met één afwijking blijft groen (B4/B7); codehit waarbij élk beoordeeld veld rood is → open;
   onvindbare code → tekstroute draait gewoon door, mét vastlegging (B5).
3. **Repo-naad** — `specRequestFromLine` geeft de code door; `runMatcher` end-to-end op een
   geseede regel.
4. **RSC + screenshots** — nieuw `app/projects/[id]/line/[lineId]/line-detail.test.tsx` (die route
   heeft vandaag géén test). Drie toestanden: exacte codehit, codehit mét afwijking, code niet
   gevonden. Light/dark × mobile/desktop, PNG's naast de testfile — bekijk ze.
5. **Regressie-anker** — `scripts/eval-testset.ts` over raadhuis + kvk + tno: ongewijzigd of beter.
   Het armaturenboek-pad (positiecodes) mag niet verschuiven.

## Meetlat

Overgenomen uit het probleemdocument, hier als afvinklijst:

- [ ] Driverregel `21012 0298` → **groen**, met `watt 20→20` als enige beoordeelde afwijking.
- [ ] LUNELLE-regel: tekstroute draait door (kandidaten blijven), en de regel toont én logt dat de
      gevraagde code `32812 9220 BRBB` niets opleverde.
- [ ] Alle 19 fixtureregels: opgeslagen code **identiek** aan de kolom in
      `scripts/gen-test-offerteaanvraag.ts` (grondwaarheid staat in het script).
- [ ] Geen regel draagt nog een spec die niet in zijn eigen documentregel staat.
- [ ] `bun run typecheck` schoon, `bun vitest run` groen, eval-testset ongewijzigd of beter.

---

## 01 — Kolom voor het gevraagde artikelnummer

Datamodel. `spec_lines.req_article_code text` (nullable) + migratie via `bunx drizzle-kit generate`.
Meenemen in `lib/repo/dossiers.ts` (`set(...)`-lijst), `lib/repo/ocr.ts` (`SpecLineInput`),
`lib/repo/imports.ts` en `app/projects/actions.ts` — met schema-parse via `lib/validation.ts`,
nooit een kale `String(formData.get(…))`. Zie `docs/INVOERVALIDATIE.md`.

## 02 — De leesroute levert de code heel af

*Blocked by: 01.* De kolomwaarde `Artikelnummer` gaat ongeschonden naar `req_article_code`, ook
met spaties, en nooit uit de omschrijving geplukt.

*Besluit Timo (11 aug):* in een offerteaanvraag krijgt `fixture_code` **het hele artikelnummer** —
zoals vandaag, maar de complete cel in plaats van een fragment. In dit documenttype is dat ook echt
de identificatie van de regel, en de dedupe op `armatuurcode` (`lib/repo/ocr.ts:468`) gaat er beter
van werken in plaats van slechter. De kolom blijft `notNull`; in een armaturenboek blijft het de
positiecode. Naad 1.

## 03 — De matcher matcht eerst op code

*Blocked by: 01.* `specRequestFromLine` geeft de code door als `sku`; B4 (codehit overleeft een
afwijking), B7 (codehit is groen, tenzij álles rood) en B5 (onvindbare code → tekstroute blijft
draaien, mét vastlegging) erbij. Naden 2 en 3.

## 04 — Een spec komt alleen uit de eigen regel

*Onafhankelijk van 01–03, maar in dezelfde run bouwen: zonder deze ticket wordt de regel groen met
een afwijking die nergens in het document staat (B7).* Eerst meten welke parse-invoer lekt, dan pas
snijden, zonder `probleem-ocr-toc-verdringt-specs.md` terug te draaien. Naad 1.

## 05 — De regeldetailpagina toont het codeoordeel

*Blocked by: 03.* Drie toestanden zichtbaar en getest, inclusief screenshots. Naad 4.
