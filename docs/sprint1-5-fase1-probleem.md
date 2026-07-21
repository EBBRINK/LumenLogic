# Sprint 1.5 · Fase 1 — het probleem, zelf gemeten

*Alle getallen hieronder komen uit een eigen query tegen de live database op 21 jul 2026.
Niets is overgenomen uit de briefing zonder toets.*

## Wat er nu niet kan

Een merk bestaat in Lumen Logic alleen als de bronimport het heeft aangeleverd. Er is geen
enkel pad — geen scherm, geen server action, geen repo-functie — waarmee een mens een merk
aanmaakt, hernoemt of weghaalt.

`app/admin/brands/page.tsx` (43 regels) leest `listBrandsWithTier` en rendert `BrandsTierBlock`.
Dat blok kan precies twee dingen: disclosure-tier zetten en per-veld-zichtbaarheid togglen. Er
staat geen formulier in, en `lib/repo/admin.ts` heeft geen enkele `insert`- of `delete`-functie
op `brands` — alleen `setBrandTier` (een UPDATE van één kolom) en de upload-functies.

Het gevolg is scheef: **405 van de 437 merken hebben nul producten.** Dat is geen rommel, dat
ís de outreach-werklijst — de merken die Brink nog om data moet vragen. De binnendienst werkt
dus dagelijks met een lijst waar hij niets aan kan toevoegen en niets uit kan halen.

En de status van een merk zit nu in de naamtekst. 18 merken dragen een annotatie in hun eigen
naam: `Tronconi (BESTAAT NIET MEER)`, `Luxit (Is failliet)`, `Murano Due = Leucos geworden`.
Daar kun je niet op filteren, en de matcher leest die haakjes mee als merknaam. Er is geen
kolom waarin "dit merk bestaat niet meer" een feit is in plaats van een tekstuele opmerking.

## Gemeten stand (eigen query, 21 jul 2026)

| Meting | Waarde |
|---|---|
| Merken | **437** |
| Merken met nul producten | **405** |
| Merken die producten dragen | **32**, samen **211.314** producten |
| Merken met een annotatie in de naam | **18** — alle 18 met nul producten |
| Dubbele `brand_code` (groepen) | **19** |
| Dubbele namen / dubbele slugs (groepen) | **2** / **2** |

`L062` hoort inderdaad bij vijf merken: `.`, Erea, Lumiance, Philips (lichtbronnen),
RZB Lighting. Bevestigd.

Nulmeting voor de DoD (fingerprint over id, naam, code, slug, land, tier, omschrijving,
website, updated_at van alle rijen, gesorteerd op id):

```
rijen = 437   md5 = f4deb1efbea17090df1ff94d4b667cff
```

## De vijf vallen — zelf getoetst

**Val 1 — geen unieke index. BEVESTIGD.** `pg_indexes` op `brands` geeft precies één index:
`brands_pkey` op `id`. Met 19 dubbele codes en 2 dubbele namen in productie zou elke
`UNIQUE`-index de migratie meteen laten falen. De dubbelcheck van G5 hoort in de applicatielaag.

**Val 2 — `brands.id` heeft geen default. BEVESTIGD.** `information_schema.columns` geeft
`column_default = null`, `is_nullable = NO` voor `brands.id`. Ter contrast: `disclosure_tier`
heeft wél een default (`'tier1'::disclosure_tier`). Bij een insert moet de uuid dus zelf mee.
Zelfde geldt voor `slug`: NOT NULL, geen default — die moeten we afleiden uit de naam.

**Val 3 — `slug` en `brand_code` bewust niet-uniek. BEVESTIGD** in het schemacommentaar
(`db/schema.ts:178-182`) én in de index-uitdraai hierboven. Ontwerp, geen bug.

**Val 4 — verwijderen wordt door FK's geblokkeerd. BEVESTIGD, maar de briefing noemt de
verkeerde tabellen.** De echte FK's naar `brands.id`, uit `information_schema`:

| Tabel | delete_rule |
|---|---|
| `products` | NO ACTION |
| `price_lists` | NO ACTION ← **niet genoemd in de briefing** |
| `enrichment_runs` | NO ACTION |
| `leads` | NO ACTION |
| `brand_aliases` | CASCADE |
| `brand_relations` | CASCADE |
| `brand_field_visibility` | CASCADE |
| `brand_uploads` | CASCADE |

Twee correcties op de briefing:
- **`categories` heeft helemaal geen FK naar `brands`.** `db/schema.ts:241` is
  `products.brandId`, niet `categories`; `categories.parentId` is een self-ref naar
  `categories`. De regelnummers in de briefing zijn één tabel verschoven.
- **`organizations` heeft ook geen FK naar `brands`.** `db/schema.ts:907` is
  `brand_field_visibility.brandId`. Twee tabellen die de briefing niet noemde
  (`price_lists`, `brand_field_visibility`) doen wél mee.

**Val 5 — `descriptionNl`, geen `notes`. BEVESTIGD.** `brands` heeft `description_nl` en géén
`notes`; `suppliers` heeft `notes`. Drizzle laat een onbekende sleutel stil vallen, dus
`bunx tsc --noEmit` is de enige vangnet.

## Wat de briefing niet wist — en wat het plan verandert

**Elk van de 437 merken heeft precies één prijslijst.** `price_lists` telt 437 rijen over 437
distinct `brand_id`'s; de verdeling is exact 1 per merk. De import maakt per merk een
"Brutoprijslijst <naam>" aan, ook voor merken zonder één product (die lijsten hebben nul
prijsregels).

Gevolg, en dit is de belangrijkste vondst van fase 1:

> **Er is op dit moment geen enkel bestaand merk dat verwijderd kan worden.** Niet 32 van de
> 437, zoals de briefing aanneemt — alle 437. De blokkade komt bij 405 merken niet van
> producten maar van die lege prijslijst.

Dat raakt de DoD direct:
- **DoD 3** ("verwijderen van een merk zonder iets eraan werkt") is alleen te demonstreren op
  een merk dat we in dezelfde sessie via het nieuwe formulier aanmaken. Een vers merk heeft
  geen prijslijst en is dus wél vrij.
- **DoD 4** (blokkade tonen) is het normale geval, niet de uitzondering. De teller moet dus
  `price_lists` meetellen, anders zegt het scherm "niets in de weg" en faalt de delete alsnog
  op een constraint — precies het gedrag dat val 4 wil voorkomen.

Twee dingen om bij de blokkade te tonen die de briefing niet noemt:
- **`brand_relations` cascade't.** Een merk verwijderen wist stil zijn outreach-record — de
  status, contactpersoon en notities uit sprint 1.4. Er staan er nu 2. Dat hoort in de
  bevestiging te staan, niet stilzwijgend te gebeuren.
- **`products.brand_name`** is een losse tekstkolom zonder FK. Die blijft na een delete
  hangen. Niet relevant zolang delete op producten blokkeert, maar het is de reden dat de
  blokkade een blokkade moet blijven en geen cascade mag worden.

## Bestaande enums en events (context voor fase 2)

Er zijn twaalf `pgEnum`'s. `brand_relation_status`
(`niet_benaderd, benaderd, wacht_op_data, data_ontvangen, verwerkt, afgewezen`) is het naaste
familielid: 1-op-1 met `brands`, met een kolomdefault en géén backfill. Dat is het patroon dat
de levensfase moet volgen.

Reeds gelogde brand-acties in `events`: `brand_relation_status_changed` (4),
`brand_template_downloaded` (2), `brand_created_for_test` (1), `disclosure_changed` (1).
`setBrandTier` logt `brand_tier_changed` — die staat nog niet in de tabel maar wel in de code.
De vier nieuwe acties moeten dus namen krijgen die hier niet mee botsen.
