# Sprint 1.3 — Merkenbeheer als hoofdingang (+ de `measure`-reparatie vooraf)

> **Status: klaar om uit te voeren.** Opgesteld 20 jul 2026 door de sprintmaster-sessie van
> week 1, ná afronding van 1.1 en 1.2. Zelfvoorzienend: een verse chat moet er zonder verdere
> context mee kunnen werken.
>
> **Twee delen, in deze volgorde. Deel A is een voorwaarde voor deel B** — 1.3 zet het
> merkenscherm in de hoofdnavigatie, en dat scherm vertelt vandaag iets onwaars. Eerst
> eerlijk maken, dan promoveren.
>
> **Verwachte omvang: klein.** Het sprintplan begroot 1.3 op ~4 u, maar het overzicht, de
> scorecard, de kruislink én de outreach-filter zijn al gebouwd (14 jul). Reken op ~2 u
> voor A + B samen. Blijkt het meer: melden, niet doorbouwen.

## Context in vier zinnen

Lumen Logic (spec-/calculatie-/offertetool voor Brink Licht) heeft sinds 1.1 en 1.2 een
werkend retour-pad: een merk levert een ingevulde Excel, Brink uploadt hem, ziet een voorstel
per veld en keurt goed. Het merkrelatie-scherm waar dat gebeurt (`/data/brand-relations`)
bestaat sinds 14 juli, mét compleetheids-scorecard en outreach-filter. Week 1 wil dat scherm
tot **hoofdingang** maken, zodat een collega bij Brink er zelfstandig mee kan werken terwijl
de bouw doorloopt. Maar de scorecard op dat scherm meet 45 velden niet die allang meetbaar
zijn — dus eerst deel A.

---

# Deel A — `field-catalog.measure` bijwerken naar het schema van 0007

## Het probleem, gemeten

`lib/field-catalog.ts` bepaalt per veld hoe de compleetheids-scorecard het meet
(`measure: col("kolom")` | `{kind:"price"}` | `NONE`). Migratie
`0007_datamodel_productspecs` voegde het volledige productschema toe (besluit B4: "volledig
schema nú, gefaseerd vullen"), maar de opvolging in `field-catalog.ts` is nooit gedaan.
`HANDOVER.md` (§Merkrelaties) kondigt hem letterlijk aan: *"Daarna is per veld alleen
`measure.column` invullen hier genoeg."* Blijven liggen sinds 15 juli.

Gemeten door de sprintmaster op 16 en 20 juli:

- **45 velden** hebben `measure: NONE` terwijl `products.<key>` **wél bestaat** — o.a.
  `ean_code`, `family`, `designer`, `etim_class`, alle `cutting_size_*`, `color_2`,
  `material_2`, `light_source_system`, `light_source_included`, `lamp_foot`, `lamp_category`,
  `sdcm`, `efficacy`, `ugr`, `lifetime_rating`, `system_lumen`, `module_lumen`,
  `light_distribution`, `dim_protocol`, `system_wattage`, `led_wattage`, `drive_current`,
  `forward_voltage`, `nominal_voltage`, `driver_type`, `power_factor`, `standby_power`,
  `protection_class`, `ik_rating`, `energy_label`, `emergency`, `ambient_temp`,
  `flammable_mount`, alle `url_*`, plus de interne `stock`, `stock_reserved`, `show_on_web`,
  `show_price_on_web`.
- **2 velden meten de verkeerde kolom**: `name_en → col("name")` en
  `description_en → col("description")`.

**Live bewijs (20 jul, productie):** de scorecard toont bij SDCM, Efficacy, UGR, alle `url_*`
en alle Cut-out-velden de tekst *"not measurable yet (field doesn't exist in the data model
yet)"* — terwijl die kolommen bestaan. Het scherm zegt iets onwaars tegen Brink.

## ⚠️ Dit is géén cosmetische fix — de scorecard gaat zichtbaar kelderen

Gemeten in de productiedatabase (20 jul, 211.311 producten):

| Kolom | Gevuld |
|---|---|
| `products.name` | 211.311 (100%) |
| `products.name_en` | **1** |
| `products.description` | 5.814 |
| `products.description_en` | **0** |
| `sdcm`, `ean_code`, `dim_protocol`, `ugr`, `url_datasheet`, … | **0** |

Gevolgen van de reparatie:

- **"Product name (English)" gaat van 100% naar ~0%.** Het is een **must**-veld, dus de
  must-score van bucket 1 keldert bij élk merk.
- De 45 velden gaan van *grijs, telt niet mee* naar *0%, telt wél mee* — en drukken daarmee
  de wanna/nice-ratio's van hun bucket omlaag.
- Netto: **de hele scorecard wordt veel leger.** Dat is verwacht en gewenst.

**Besluit Timo (20 jul): dit is de bedoeling.** Week 1 heet "de merkgegevens stromen binnen";
een scorecard die overal 0% toont **ís** de eerlijke nulstand, en precies wat de
outreach-werklijst moet aandrijven. Een scorecard die groen oplicht terwijl er niets binnen
is, stuurt Brink nergens heen. *(De tegenlezing — "productnamen zijn eigennamen, `name`
volstaat" — is overwogen en verworpen: ons Excel vraagt letterlijk "Product name (English)",
dus dát is wat we meten.)*

**Bouw dus niet stiekem een verzachting in.** Geen drempels, geen "tel alleen velden met
data", geen uitgezonderde buckets. Als de uitkomst je te streng lijkt: melden, niet
compenseren.

## Wat deel A moet opleveren

1. **`measure` kloppend maken** in `lib/field-catalog.ts`: elk veld waarvan de products-kolom
   bestaat krijgt `col("<kolom>")`; `name_en` en `description_en` gaan naar hun eigen kolom.
   Velden zonder kolom blijven `NONE`.
   ⚠️ **Let op de kolomnaam, niet de key.** Meestal gelijk, maar toets het per veld — dat is
   precies de aanname die drie keer eerder is misgegaan deze sprint.
2. **Een test die dit niet opnieuw stil kan laten verlopen.** Toets `measure.column` van élk
   veld tegen de werkelijke kolommen van `products` in `db/schema.ts`, en faal als een veld
   `NONE` heeft terwijl de gelijknamige kolom bestaat. Zo dwingt de volgende migratie zichzelf
   af. **Dit is het belangrijkste deel van A** — de fix zonder de test lost het vandaag op en
   is over twee migraties weer stuk.
3. **Bestaande scorecard-tests bijwerken** waar de verwachte percentages veranderen — met
   motivering in de commit dat de nieuwe uitkomst de juistere is.

**Niet doen in deel A:** velden toevoegen/verwijderen uit de catalogus · `internalOnly`/
`inExcel`-vlaggen wijzigen (dat verandert het merk-Excel én daarmee 1.1/1.2) · de
scorecard-UI herontwerpen · de gradient-drempels aanpassen.

---

# Deel B — Merkenbeheer in de hoofdnavigatie

## Acceptatiecriteria (uit `docs/lumenlogic-sprintplan-augustus.md`, onverkort)

- *Given* de hoofdnavigatie, *when* een Brink-gebruiker "Merken" kiest, *then* opent het
  merkrelatie-overzicht (status, prijslijst-indicator, mini-scorecard) met kruislink naar de
  disclosure-tiers (toestemmings-as ≠ compleetheids-as).
- *Given* het overzicht, *when* gefilterd op "moet nog een mail" (status + `lastContactAt`),
  *then* toont de lijst precies de merken zonder recent contact — de outreach-werklijst.

## Wat er al staat (geverifieerd door de sprintmaster, 16 jul)

**Beide criteria zijn inhoudelijk al gehaald op 14 juli.** Wat mist is uitsluitend de plek in
de navigatie.

| Criterium-onderdeel | Waar het al staat |
|---|---|
| Overzicht + status + prijslijst-indicator + mini-scorecard | `app/data/brand-relations/page.tsx`, `components/data/brand-relations-table.tsx` |
| Kruislink naar disclosure, mét de assen-scheiding | `app/data/brand-relations/page.tsx:61` ("Manage permission (disclosure) on …") |
| Outreach-werklijst | filterknop "No response (> {GEEN_REACTIE_DAGEN} days)", `brand-relations-table.tsx:154`, mét tests |
| Upload-sectie (uit 1.2) | `components/data/template-upload-card.tsx` op de merkdetailpagina |

**Doe dit dus niet opnieuw.** Deel B is een navigatie-ingreep, geen herbouw. Vind je dat een
onderdeel toch ontbreekt of niet klopt: **melden met bewijs**, niet stilzwijgend bijbouwen.

## De naamgeving — beslissing, met ruimte om te weerleggen

`components/site-nav.tsx` heeft nu: `Projects · Catalog · Data · Analytics · Settings ·
Brand · Admin`. Dat bestaande **"Brand"** is `/brand/*` — het **merkportaal**, de weergave
voor een merk-account (dashboard, eigen data, eigen prijslijsten). Merkenbeheer daarnaast
"Brands" noemen levert twee buren op die één letter schelen en iets totaal anders zijn.

**Besluit sprintmaster (Timo mag overrulen):**
- Nieuw item **"Brands"** → `/data/brand-relations` (intern merkenbeheer — waar Brink werkt).
- Bestaand item hernoemen naar **"Brand portal"** → `/brand` (wat een mérk ziet).

Plaats "Brands" ná `Catalog` en vóór `Data`: het is een hoofdingang, geen sub-onderwerp van
Data. De bestaande route `/data/brand-relations` blijft ongewijzigd — geen redirect-werk, geen
kapotte links, en de kaart onder `/data` mag gewoon blijven staan.

De UI is Engels sinds de i18n-slag (besluit W1, 16 jul) — vandaar "Brands" en niet "Merken".

---

## Harde grenzen (parallelle sessies)

- **Altijd eerst `git fetch origin`; redeneer tegen `origin/main`, nooit lokale main.**
- ⚠️ **De leesroute-sessie deelt deze working directory** en heeft mogelijk ongecommit werk in
  de tree (`lib/pdf/*`, `lib/ai/ocr.ts`, `scripts/eval/*`, `db/test-db.ts`). **Gebruik nooit
  `git add -A` of `git commit -a`** — altijd expliciete paden.
- **Geen migratie verwacht.** Deel A raakt alleen TypeScript; deel B alleen de nav. Lijkt er
  schema nodig: stop en meld het (de leesroute is bij 0012).
- **`~/Downloads/lumenlogic-testset/` is echte klantdata: NOOIT in git.**
- **HANDOVER.md: eigen sectie toevoegen**, andermans secties niet herschrijven.
- **IJzeren regels 1–5** uit `CLAUDE.md`. Hier concreet: regel 2 — de scorecard meet bij
  `list_price_excl_vat` alléén *of er een prijs bestaat op een geldige lijst*
  (`measure: {kind:"price"}`), nooit het bedrag. Laat dat zo.

## Werkwijze (verplicht, in deze volgorde)

1. **Probleem/opdracht uitschrijven** in eigen woorden. Nog geen code.
2. **Plan met 2 agents** (onafhankelijk, dan synthese). Nooit direct bouwen.
3. **Bouwen** volgens het plan — **deel A eerst, dan deel B** — kleine commits met expliciete
   paden, pushen.

### Modelverdeling per fase

- **Fase 1 — probleem uitschrijven:** jij zelf.
- **Fase 2 — plan met 2 agents:** `model: opus`. Dit onderdeel is grotendeels mechanisch en
  de scherpe keuzes (B-lezing, naamgeving) zijn hierboven al gemaakt. **Uitzondering:** blijkt
  bij het uitschrijven dat de veld→kolom-afbeelding niet triviaal is, spawn dan één extra
  plan-agent met `model: fable` op precies dat punt.
- **Fase 3 — bouwen:** `model: opus`.
- **Verificatie:** jij zelf.

Wijk je af, meld het met reden.

### Definition of Done

- [ ] `bun vitest run` groen, **incl. RSC-screenshottests van het merkenscherm en de nav in
      licht én donker**. Bekijk de PNG's — dat is een projectregel uit `CLAUDE.md`.
- [ ] `bunx tsc --noEmit` schoon.
- [ ] Gecommit én gepusht (deel A en deel B in aparte commits — het zijn twee besluiten).
- [ ] Gedeployed; **handmatig geverifieerd in de live app**: klik "Brands" in de nav, zie het
      overzicht, en controleer dat de scorecard nu de eerlijke (lagere) percentages toont.
- [ ] `HANDOVER.md` bijgewerkt.
- [ ] Events: deel A voegt geen gedrag toe. Deel B is navigatie. **Waarschijnlijk geen nieuwe
      events** — benoem dat expliciet in je HANDOVER-sectie zodat het geen vergeten checkbox
      lijkt.

**Stop vóór elke productie-deploy en vraag Timo's akkoord.** Push naar `main` ís een
productie-deploy (vastgesteld in 1.1, bevestigd in `CLAUDE.md`).

## Rapportage terug aan de sprintmaster

Lever: bestandspaden · testnamen/aantallen · commit-SHA's · **de scorecard vóór en ná deel A
voor één merk** (bv. Flos — concrete percentages, zodat de instorting meetbaar is en niet
alleen beweerd) · wat bewust níét gedaan is. De sprintmaster verifieert claims zelf vóór 1.3
wordt afgevinkt.

**Vind je een fout in deze briefing: meld het, volg hem niet blind.** Dat is bij 1.1
(taalkeuze) en 1.2 (`measure` als schrijf-brug) gebeurd en het was beide keren terecht — de
briefing is niet de bron van waarheid, de code is dat.
