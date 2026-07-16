# Probleem 1.2 — retour-pad: upload → voorstel → goedkeuren

Fase 1 van de werkwijze: het probleem in eigen woorden, ná eigen leeswerk in de codebase.
Nog geen ontwerp, nog geen code. Geschreven 16 jul 2026 door de bouwsessie.

## Wat er gevraagd wordt

Brink stuurt merken een Excel-template (`lib/excel-template.ts`). Sinds 1.1 kan een ingevuld
bestand gevalideerd worden (`lib/excel-validate.ts`), maar er is geen enkele weg om het de
app in te krijgen. 1.2 bouwt die weg, met één harde eis: **er wordt nooit iets stil
weggeschreven**. Upload → voorstel tonen → mens keurt goed → pas dán toepassen.

Drie schermen-toestanden op de merkrelatie-pagina (`app/data/brand-relations/[brandId]/`):

1. **Upload** — bestand kiezen, door de 1.1-validatie halen. Afgewezen = einde, met reden.
2. **Voorstel** — per product per veld: nieuw gevuld / gewijzigd (oud→nieuw) / conflict.
   Niets staat op dit moment in de catalogus.
3. **Goedkeuren of afwijzen** — goedkeuren past toe, logt events, zet de relatiestatus.
   Afwijzen verandert niets aan de catalogus (maar wordt zelf wél gelogd, regel 5).

Conflictregel ligt vast en staat niet ter discussie: **bestaand veld wint, tenzij expliciet
aangevinkt.**

## Wat ik in de code heb geverifieerd

| Aanname uit de briefing | Klopt? |
|---|---|
| `validateFilledTemplateXlsx(bytes, context)` → `FormatAfgewezen \| FormatGeldig` | Ja, `lib/excel-validate.ts:246`. Afgewezen heeft geen `rijen` — type-niveau. |
| `GelezenRij.velden`: aanwezigheid = kolom stond er, `""` = cel leeg | Ja, `lib/excel-validate.ts:122-132`. Dit is de kern van de diff. |
| `replacePriceList` archiveert álle prijzen van het merk | Ja, `lib/repo/price-archive.ts:69-96` → `archivePriceList` doet `delete from prices where price_list_id = …` voor de hele actieve lijst. |
| `price-archive` wordt nergens aangeroepen | Bevestigd — geen enkele import buiten de eigen test. |
| `visible_products` koppelt zichtbaarheid aan een geldige prijs | Ja, `db/schema.ts:654-657`: product ⨝ prices ⨝ price_lists WHERE valid_from ≤ now ≤ valid_until. |
| Relatiestatussen bestaan al, geen migratie | Ja, `brandRelationStatus` enum, `db/schema.ts:999`. |
| Laatste migratie is 0009 | Ja, `db/migrations/0009_ocr.sql`. Leesroute pakt vermoedelijk 0010/0011. |
| `db.transaction()` gooit op neon-http | Aangenomen op gezag van briefing + HANDOVER; niet zelf tegen productie getest (dat kán ook niet zonder deploy). |

Extra vondsten die de briefing niet noemt en die het ontwerp raken:

- **`prices` heeft `prices_product_list_uniq` op (product_id, price_list_id)** (`db/schema.ts:359`).
  Dat is precies de sleutel die een regel-niveau-upsert nodig heeft — `ON CONFLICT DO UPDATE`
  is hier mogelijk zonder transactie. Belangrijk voor het idempotentie-vraagstuk.
- **`price_lists_brand_active_uniq`** is een partiële unique op `brand_id WHERE replaced_at IS NULL`
  (`db/schema.ts:336`). Eén actieve lijst per merk is een DB-invariant, geen conventie. Een
  "voeg een tweede lijst toe voor de nieuwe prijzen"-ontwerp botst er hard op.
- **`submitBrandUpload` weigert een prijslijst zonder `valid_until`** (`lib/repo/brand-portal.ts`).
  Het precedent zegt dus al: geen prijslijst zonder einddatum, niet stilzwijgend accepteren.
  Onze UI moet die datum uitvragen, niet verzinnen.
- ~~**De velden-naar-kolom-brug is dun.**~~ **GECORRIGEERD 16 jul na de plan-fase — deze
  alinea was fout.** Ik schreef eerst dat velden met `measure.kind === "none"` geen
  products-kolom hebben ("een merk vult `sdcm` in en wij hebben nergens om het te laten
  landen"). Onjuist: `products.sdcm` bestaat (`db/schema.ts:279`), net als `name_en` (254),
  `description_en` (255) en vrijwel elke andere catalogus-kolom — migratie 0007 heeft ze
  allemaal aangelegd ("schema nú, gefaseerd vullen"). Wat er wérkelijk aan de hand is:
  **`measure` in `lib/field-catalog.ts` is verouderd**, en `measure.column` is geen
  schrijf-brug maar een *scorecard-meet*-brug. De briefing noemt hem wél "jouw brug van
  catalog-key naar DB-kolom" — dat is een fout in de briefing. Erger nog: `name_en` heeft
  `measure: col("name")`, dus wie de briefing letterlijk volgt, schrijft de Engelse
  merknaam over `products.name` heen in plaats van in `products.name_en`. 1.2 bouwt daarom
  een eigen, expliciete schrijf-mapping. De categorie "ontvangen, niet opslagbaar" blijft
  als vangnet bestaan maar is vrijwel leeg.

## De hazard — mijn conclusie

`replacePriceList` is geschreven voor "de prijslijst 2027 komt binnen": één lijst vervangt de
vorige, integraal. Een template-upload is dat scenario niet. Ons eigen template zegt "Fill in
one product per row" en "Fields that do not apply may be left empty"; de validatie kent
`onbekende_artikelcode` als *waarschuwing* (niet als fout) en accepteert moeiteloos een
bestand met 40 rijen. Niets in de keten stelt volledigheid als eis — dus is een upload
**per definitie gedeeltelijk**, tot het tegendeel expliciet blijkt.

Draai je er `replacePriceList` op, dan gaat de hele actieve lijst naar het archief (alle 500
prijsregels weg), komen er 40 nieuwe terug, en verliezen 460 producten hun geldige prijs. Via
`visible_products` verdwijnen ze uit álle zoekresultaten en uit de matcher. IJzeren regel 3,
afgevuurd op de eigen catalogus. Stil, want niets in de code merkt het op.

Mijn conclusie voor de plan-fase: **`replacePriceList` is hier het verkeerde instrument.**
Het regel-niveau-pad (per `(brand_id, supplier_article_code)` bijwerken binnen de bestaande
actieve lijst) is wat het retour-pad nodig heeft, en `prices_product_list_uniq` maakt dat
zonder transactie haalbaar. Of dat een derde functie in `price-archive.ts` vergt, en wat er
dan precies gearchiveerd wordt bij een vervángen regel, is een ontwerpvraag voor fase 2 —
net als de vraag waar `validFrom`/`validUntil` vandaan komen als het merk nog geen actieve
lijst heeft. Ik leg de vraag "vervanging of bijwerking" voor als iets dat het ontwerp moet
beantwoorden, niet als iets dat de code mag gokken.

Groeit dit tot een eigen ontwerpvraag van meer dan een uur, dan is de instructie helder:
melden, en 1.2 het voorstel-pad zónder prijzen laten leveren. Data binnenkrijgen zonder de
catalogus te slopen is meer waard dan alles in één keer.

## De transactie-val

"Pas bij goedkeuren wordt alles toegepast" is precies de operatie die je atomair wil, en dat
kan hier niet: neon-http (productie) weigert interactieve transacties, PGlite (tests) slikt ze.
Groene tests, kapotte app. Het ontwerp moet dus **gedeeltelijk falen overleven**: een volgorde
die bij afbreken geen inconsistente catalogus achterlaat, idempotentie zodat opnieuw
goedkeuren geen schade doet, en een events-spoor waaruit blijkt hoe ver het kwam.

## Wat "conflict" is — de vraag, niet het antwoord

De briefing wijst hier terecht op een spanning. Drie uitkomsten zijn beloofd (nieuw gevuld /
gewijzigd / conflict), maar de conflictregel ("bestaand wint tenzij aangevinkt") suggereert dat
élke overschrijving van een gevuld veld een conflict ís — en dan is "gewijzigd" een lege
categorie. Óf "gewijzigd" en "conflict" verschillen ergens in (waarin?), óf de drie categorieën
zijn er twee met een nuance. Dit stuurt de UI direct: een vinkje per rij, of alleen bij
sommige. Fase 2 moet het vastleggen; ik leg het niet vooraf vast.

Randgevallen die in de definitie moeten passen:
- kolom ontbrak (`!("cri" in velden)`) → geen voorstel, geen categorie. Nooit verwarren met:
- kolom stond er, cel leeg (`velden.cri === ""`) → merk maakt het veld leeg. Is dat een
  wijziging naar leeg, of negeren we het? (Mijn neiging: voorstel om te wissen is legitiem,
  maar valt onder "bestaand wint tenzij aangevinkt".)
- onbekende artikelcode → nieuw product, of tikfout. 1.1 waarschuwt, oordeelt niet.
- veld zonder products-kolom (`measure.kind === "none"`) → nergens om te landen.
