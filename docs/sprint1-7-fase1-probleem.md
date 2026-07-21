# Sprint 1.7 · Fase 1 — de gemeten stand

*Alle getallen komen uit eigen read-only query's tegen de live database op 21 jul 2026.
Niets uit de briefing is overgenomen zonder toets.*

## De briefing klopt op het inhoudelijke punt

De drie "milieuvelden" bestaan, staan in het merk-Excel, en zijn zo goed als leeg.
Geteld over **211.317 producten** (exact het getal uit de briefing):

| Veld | Ingevuld | In `FIELD_CATALOG` |
|---|---|---|
| `energy_label` | **0** | ✅ bucket 8, `wanna`, `inExcel: true`, `measure: col(...)` — `lib/field-catalog.ts:200` |
| `warranty_months` | **23** | ✅ bucket 10, idem — `:226` |
| `country_of_origin` | **20** | ✅ bucket 10, idem — `:229` |
| `repairability` | **20** | ✅ bucket 10, idem — `:227` |

Alle vier zijn `extern` (dus in het template) én meetbaar. **G13 is dus terecht**: verplaatsen
of opnieuw aanvragen levert geen enkel ingevuld veld op. Het probleem is outreach.

**Afstand tot Brink Licht bestaat nergens.** `information_schema.columns` op `brands` geeft
16 kolommen; geen daarvan gaat over locatie of afstand. Het adres van Brink Licht staat
**nergens** in de code — `grep -ri "veldzigt\|3454 PW"` over de hele repo: 0 treffers. "Brink
Licht" als naam staat op 8 plekken (login, Excel-template, brand-message, estimate-PDF), maar
altijd zonder adres. DoD 5 is dus een verse constante, geen consolidatie.

## Correctie op de briefing: het zijn **436** bronimport-merken, niet 437

`brands` telt vandaag **438** rijen. Uitgesplitst naar aanmaakdag:

| Aanmaakdag | Rijen | Wat |
|---|---|---|
| 2026-07-02 | **436** | de bronimport |
| 2026-07-20 | 1 | `ZZTEST QA-14` (event `brand_created_for_test`, actor `script:1.4-testmerk`) |
| 2026-07-21 | 1 | `ZZTEST QA-15` (event `brand_created_for_test`, actor `sprintmaster:walkthrough`) |

De 437 uit sprint 1.5 telde `ZZTEST QA-14` mee als bronimport-merk: dat testmerk bestond al
sinds 20 jul, terwijl de 1.5-noot alleen QA-15 als uitzondering benoemde. De briefing van 1.7
noemt beide testmerken (goed) maar houdt het totaal op 437 (één te hoog).

Er is sindsdien géén bronimport-merk verdwenen. Het enige `brand_deleted`-event betreft
`ZZTEST Levensfase 15` (actor `dod-1-5`), een merk dat 3 seconden eerder in dezelfde sessie was
aangemaakt om DoD 3 van 1.5 te demonstreren. Aangemaakt én verwijderd, netto nul.

**Consequentie voor DoD 4 van 1.7: de fingerprint moet over 436 rijen gaan.**

## Nulmeting voor DoD 4

Fingerprint over id, naam, code, slug, land, tier, omschrijving, website en `updated_at`
van alle rijen, gesorteerd op id — dezelfde velden die 1.5 beschrijft:

```sql
select count(*)::int as rijen,
       md5(string_agg(
         concat_ws('|', id::text, name, coalesce(brand_code,''), slug,
           coalesce(country,''), disclosure_tier::text,
           coalesce(description_nl,''), coalesce(website,''),
           to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.USOF')),
         E'\n' order by id)) as md5
  from brands where name not like 'ZZTEST%';
```

```
rijen = 436   md5 = 9e7695bf4b10ed555b27b5325d736c46
```

Inclusief beide testmerken: `rijen = 438, md5 = 5d81d8b19701aa206965bc0d0136b731`.

⚠️ **Eerlijkheid over deze hash.** Hij reproduceert de 1.5-baseline
(`437 / f4deb1efbea17090df1ff94d4b667cff`) níét, en dat kán ook niet: het rijaantal verschilt.
De 1.5-sessie heeft de letterlijke SQL niet vastgelegd, alleen de velden. Deze query is een
reconstructie uit die beschrijving en is dus **niet** tegen de 1.5-hash te valideren. Voor DoD 4
maakt dat niets uit — daar telt of dezelfde query vóór en ná de migratie dezelfde uitkomst geeft.
Voor "is dit dezelfde hash als 1.5" moet je je er niets bij voorstellen. Vanaf nu ligt de
letterlijke SQL vast, hierboven.

## Vallen — zelf getoetst

**Val 1 — `brands.warranty` bestaat en is iets anders. BEVESTIGD.** `information_schema` geeft
`warranty text` op `brands`, naast `products.warranty_months integer`. Komt uit de bronimport.
Niet gebruiken, niet hernoemen.

**Val 2 — `brands.id` heeft geen default. BEVESTIGD.** `column_default = null`, `is_nullable = NO`.
Ter contrast: `disclosure_tier` heeft `'tier1'::disclosure_tier` en `lifecycle`
`'actief'::brand_lifecycle` — het patroon dat een additieve kolom moet volgen.

**Val 3 — type bewust kiezen.** Bevestigd relevant: er is nog geen enkele numerieke
"afstand"-achtige kolom in de codebase om je aan te spiegelen. De precedenten op `brands` zijn
`integer` (`payment_term_days`, `delivery_time_days`, beide nullable, geen default) en
`numeric(6,2)` (`standard_discount_pct`). Beide zijn nullable → "leeg blijft leeg" is het
bestaande huis-patroon, niet iets nieuws.

**Val 4 — additief, geen backfill.** De nulmeting hierboven is het meetinstrument.

**Val 5 — testmerken uitsluiten.** Er zijn er **twee**, niet één: `ZZTEST QA-14` en
`ZZTEST QA-15`. Filter op `name not like 'ZZTEST%'`, niet op één slug.

## Eventnamen die al in gebruik zijn (entity = 'brand')

`brand_relation_status_changed` (6) · `enrichment_started` (4) · `brand_template_downloaded` (3) ·
`enrichment_published` (3) · `brand_created_for_test` (2) · `brand_deleted` (1) ·
`brand_created` (1) · `brand_updated` (1) · `disclosure_changed` (1) ·
`brand_lifecycle_changed` (1).

`updateBrand()` logt vandaag `brand_updated` met `payload.changed` = de lijst gewijzigde
veldnamen. Een nieuw veld dat via dat pad loopt, logt dus automatisch mee zodra het in de
`changed`-lijst van `lib/repo/brands.ts:211` staat — die lijst is **hardgecodeerd** en is het
punt waar een nieuw veld stil kan wegvallen.

## Wat het merkportaal kan (getoetst)

`app/brand/data/page.tsx` bevat geen enkel `<form>`, geen server action-import en geen
schrijffunctie. De briefing klopt: er is geen invoerkanaal voor merkdata. 1.7 bouwt het niet.
