# Plan 1.2 — retour-pad: upload → voorstel → goedkeuren

Fase 2 van de werkwijze: synthese van twee onafhankelijke plan-agents (fable), gewogen en
beslist door de bouwsessie op 16 jul 2026. Waar de agents het oneens waren staat de beslissing
mét reden. Fase 1: `docs/probleem-1-2-retourpad.md`. Briefing: `docs/sprint1-2-briefing.md`.

De agents waren het eens over de kern (gedeeltelijke bijwerking, `brand_uploads` als
staging, verse diff, statusflip als laatste). De verschillen zaten in details die er wél
toe doen; die zijn hieronder beslist.

## Besluit 1 — de prijslijst-hazard: gedeeltelijke bijwerking, regel-niveau

**Een template-upload is altijd een gedeeltelijke bijwerking. `replacePriceList` wordt op dit
pad nooit aangeroepen zolang er een actieve lijst is.** Onderbouwing uit template en validator,
niet uit voorkeur: het template zegt "Fill in one product per row" / "Fields that do not apply
may be left empty"; de validator maakt van een onbekende artikelcode een wáárschuwing en
accepteert elk aantal rijen; een lege prijscel is slechts `must_veld_leeg`. Een geldig bestand
kan dus 40 van 500 producten bevatten. Niets in de keten kan de claim "dit is de volledige
lijst" dragen — dus mag de code die claim niet maken.

"Brink kiest bij de upload (vervanging of bijwerking)" is overwogen en **verworpen**: de
vervangings-tak is precies de tak die 460 producten onzichtbaar maakt, vergt een tweede
toepas-pad plus consequentie-scherm, en bedient een scenario ("prijslijst 2027 komt binnen")
waarvoor `replacePriceList` al bestaat en dat een eigen ingang verdient. Scope zonder vraag.

Derde functie in `lib/repo/price-archive.ts` (bestaande twee ongewijzigd):

```ts
export async function upsertPriceLines(
  db: AppDb,
  brandId: string,
  lines: { productId: string; grossPrice: string }[],
  opts: {
    newList?: { name: string; validFrom: string; validUntil: string };
    actor?: string;
  },
): Promise<{ priceListId: string; inserted: number; updated: number; archivedLines: number }>
```

1. Actieve lijst zoeken (`replaced_at IS NULL`; `price_lists_brand_active_uniq` garandeert ≤1).
2. Geen actieve lijst → `opts.newList` verplicht, anders `Error`. Lijst inserten + bestaand
   `price_list_created`-event. Nooit een tweede actieve lijst.
3. Per regel: waarde gelijk → **no-op** (dit ís de idempotentie); waarde anders → **eerst** de
   oude regel naar `archive.prices_archive` (met `validFrom`/`validUntil` van de lijst, zelfde
   semantiek als `archivePriceList`), **daarna** upserten.
4. Upsert via `ON CONFLICT (product_id, price_list_id) DO UPDATE` — `prices_product_list_uniq`
   is exact de sleutel, werkt transactieloos.
5. Eén event `price_lines_upserted` met tellingen.

Alleen daadwerkelijk vervangen regels worden gearchiveerd. De 460 onaangeraakte producten
houden hun prijsregel en blijven zichtbaar. **Dit pad verwijdert nooit een prijsregel**, ook
niet aangevinkt: een lege prijscel bij gevulde DB-prijs is een conflict dat niet toepasbaar
is ("clearing a price is not supported here") — een gewiste prijs vuurt regel 3 af op dat
product.

**validFrom/validUntil**: actieve lijst → regels erven haar geldigheid, geen datums nodig; het
scherm toont "prices will be added to price list X (valid until Y)". Geen actieve lijst → het
goedkeur-formulier vraagt naam + valid from + valid until uit, verplicht. Geen verzonnen
`2026-12-31`-default: het `submitBrandUpload`-precedent weigert een prijslijst zonder einddatum
al, dus uitvragen, niet gokken. Geldigheid van een bestáánde lijst verlengen is buiten scope
(dat is het `replacePriceList`-scenario).

Dit is geen >1u-ontwerpvraag meer; het prijzenpad is wel als **laatste, afhakbare schijf**
gepland (zie bouwvolgorde) zodat het bij uitloop geschrapt kan worden zonder de rest te raken.

## Besluit 2 — waar het voorstel leeft: `brand_uploads`, geen migratie

`kind: "template"` op de bestaande `brand_uploads` (`db/schema.ts:971`). `kind` is `text`, geen
enum → **nul migraties**, dus ook geen 0010/0011-botsing met de leesroute-sessie. Dat is het
sterkste argument. `import_runs` valt af: `dossier_id` is NOT NULL met FK naar
`project_dossiers` — een merkupload heeft geen dossier; nullable maken kost een migratie én
vervuilt een projectconcept.

"Niets staat dan al in de database" betekent **niets in de catalogus** (products/prices/
price_lists). Een staging-rij ín `brand_uploads` is juist vereist, anders overleeft het
voorstel geen page-load — exact het `import_runs`-precedent.

Payload = de validator-snapshot (`rijen`, `waarschuwingen`, `kolommen`, `onbekendeKolommen`,
`ontbrekendeOptioneleKolommen`, `artikelcodesGecontroleerd`) + `filename`/`fileSize`/`werkblad`,
met `v: 1`. **Rauwe xlsx-bytes worden niet bewaard**: de snapshot is verliesvrij voor alles wat
wij ermee doen, Brink heeft het bestand zelf nog, en bytes zouden base64-gerommel in jsonb of
een migratie voor bytea kosten.

**De diff wordt niet opgeslagen maar bij élke render én bij toepassen vers herberekend** uit
(payload.rijen × huidige products). Een opgeslagen diff toont verouderde "oud"-waarden en past
bij goedkeuren iets toe wat de gebruiker niet zag. Herberekening maakt het toepassen bovendien
vanzelf idempotent.

## Besluit 3 — de schrijf-mapping (hier zat een fout in de briefing)

De briefing noemt `measure.column` uit `lib/field-catalog.ts` "jouw brug van catalog-key naar
DB-kolom". **Dat is onjuist en gevaarlijk.** Geverifieerd in `db/schema.ts:252-308`: migratie
0007 legde kolommen aan voor vrijwel élk catalogusveld (`sdcm:279`, `name_en:254`,
`description_en:255`, `ean_code`, `family`, zaagmaten, url_*, …), terwijl `measure` die velden
nog als `kind: "none"` markeert. `measure` is een **scorecard-meet**-brug en is verouderd; hij
is incompleet én semantisch fout voor schrijven: `name_en` heeft `measure: col("name")`, dus
wie de briefing letterlijk volgt schrijft de Engelse merknaam over `products.name` heen.

Daarom: **1.2 bouwt een eigen, expliciete schrijf-mapping** (catalog-key → products-kolom) in
`lib/template-diff.ts`, met `name_en → nameEn` en `description_en → descriptionEn`. Bij het
*aanmaken* van een nieuw product vult `name_en` óók `products.name` (NOT NULL, en er is dan
geen bestaande naam om te beschermen). De categorie "not storable" blijft als vangnet bestaan
maar is vrijwel leeg. `list_price_excl_vat` loopt apart via het prijzenpad.

Het bijwerken van de verouderde `measure`-entries zelf raakt scorecard-gedrag en K4-screenshots
en gebeurt **bewust niet in 1.2** — losse opvolgtaak, melden in HANDOVER en aan de sprintmaster.

## Besluit 4 — wat "conflict" is

De acceptatiecriteria beloven drie categorieën, maar onder "bestaand wint tenzij aangevinkt"
gedraagt élke overschrijving van gevulde data zich als een conflict — dan is "gewijzigd" leeg.
**Dit is een inconsistentie in de briefing en wordt gemeld.** De oplossing legt het onderscheid
op *richting en destructiviteit*, niet op beleid; het beleid is voor beide gelijk.

| Categorie | Definitie | Checkbox | Default |
|---|---|---|---|
| *(unchanged)* | genormaliseerd gelijk aan DB (`"12,5"` ≡ `12.50`) | — alleen als telling | — |
| **New** | DB leeg/NULL, cel gevuld en verwerkbaar | ja | **aan** |
| **Changed** | DB gevuld, cel gevuld, anders, verwerkbaar → oud→nieuw | ja | **uit** |
| **Conflict** | (a) *wissen*: cel leeg (`velden.x === ""`) terwijl DB gevuld · (b) *onverwerkbaar*: celtekst past niet in het kolomtype · (c) *tegenstrijdig*: dubbele artikelcode in het bestand · (d) *niet opslagbaar*: geen schrijf-mapping · (e) *prijs wissen* | (a) ja; (b)–(e) **geen** | uit |

*Changed* = "merk levert een andere waarde"; *Conflict* = "merk wil wissen / wij kunnen er
niets mee / het bestand spreekt zichzelf tegen". De conflictregel geldt als gedragsregel voor
de héle klasse "DB was gevuld": nooit toepassen zonder vinkje.

Randgevallen, hard vastgelegd:
- `!("cri" in velden)` (kolom ontbrak) → **geen entry, geen categorie**. De engine itereert
  alleen over keys die in `velden` aanwezig zijn. Dit is de belangrijkste regel; twee expliciete
  tests.
- `velden.cri === ""` → DB leeg: unchanged, niets tonen. DB gevuld: **Conflict(a)**, vinkje
  schrijft NULL.
- **Onbekende artikelcode** → *New product*-voorstel, één checkbox op productniveau, **default
  uit** (tikfout-risico; 1.1 zegt "dubbelcheck") mét een "Select all new products"-knop, want
  een eerste levering van 400 rijen mag geen 400 kliks kosten. *(Agent A wilde default aan;
  default uit wint — een tikfout maakt stil een dubbelproduct, en dat is precies de stille
  schade die dit pad moet voorkomen. De select-all-knop neemt het UX-bezwaar weg.)*
  Ontbreekt `Product name (English)` → productniveau-conflict "cannot create without a name"
  (`products.name` is NOT NULL), geen checkbox. Match op getrimde code, **hoofdlettergevoelig**
  (consistent met `codeVoorLookup` en `products_brand_sac_uniq`).
- **New-velden krijgen een checkbox (default aan)**, geen automatische toepassing. *(Agent A
  wilde geen checkbox omdat er geen bestaand veld is dat kan winnen. Maar "nooit iets stil
  wegschrijven" is de hardste eis van deze sprint; een zichtbaar vinkje dat aan staat kost
  niets en maakt het scherm eerlijk.)*
- **Normalisatie** (validator levert bewust rauwe tekst): pure functie per kolomtype, afgeleid
  uit `getTableColumns(products)` — geen tweede handmatige typetabel die uit sync loopt. Trim;
  numeriek `","`→`"."` dan parse (integer-kolommen eisen geheel getal); boolean
  yes/no/ja/nee/true/false/1/0 case-insensitief; tekst exact na trim (case-wijziging ís een
  wijziging). Parse-fout → Conflict(b).

**Selectie-sleutel** (contract UI↔apply): `r{rij}.{fieldKey}` per veld, `np.r{rij}` per nieuw
product. Het Excel-rijnummer is stabiel over herberekeningen, uniek (duplicaten zijn Conflict(c)
en niet aanvinkbaar) en overleeft rare tekens in artikelcodes.

## Besluit 5 — atomair genoeg zonder transacties

Geen `db.transaction()`, nergens (neon-http gooit; PGlite niet — groene tests, kapotte app).
Principes: elke schrijfstap is een idempotente upsert op een natuurlijke sleutel; de statusflip
komt als laatste; de diff wordt bij toepassen herberekend zodat een herhaalde goedkeuring
convergeert; volgorde products → prices, zodat een crash ertussen een product-zonder-prijs
achterlaat — dat is via `visible_products` onzichtbaar, de **veilige** kant van regel 3.

`applyTemplateProposal(db, uploadId, selectie, priceListInput, actor)`:

1. Upload laden; `status !== "staging"` → `{ alreadyProcessed: true }` (dubbelklik-/tweede-tab-
   poort, zelfde guard als `confirmImportRun`).
2. Event `template_apply_started` — **vóór de eerste schrijf**; hier begint het spoor.
3. Diff vers herberekenen; selectie erop projecteren. **Stale-guard** *(overgenomen van agent
   A — de beste vondst die B miste)*: elke aangevinkte overschrijving draagt de destijds
   getoonde oude waarde (`prevSeen`) mee; wijkt de actuele DB-waarde daarvan af, dan wordt het
   veld **overgeslagen en gelogd** (`template_field_skipped_stale`). Nooit blind overschrijven
   wat de gebruiker niet zag.
4. **Nieuwe producten** (aangevinkt, gesorteerd op artikelcode):
   `INSERT … ON CONFLICT (brand_id, supplier_article_code) DO NOTHING`, daarna id ophalen (een
   eerdere halve run kan hem al hebben aangemaakt). Event `product_created_from_template`.
5. **Bestaande producten**: één `UPDATE products SET <alleen aangevinkte, verwerkbare velden>
   WHERE id = …` per product. Granulariteit van gedeeltelijk falen = één product; een
   half-bijgewerkte reeks is "sommige producten al klaar", geen inconsistente rij. Event
   `product_fields_applied` met `{ uploadId, fields: { kelvin: { old, new }, … } }` — dát is
   het per-veld-spoor van regel 5, zonder duizenden events.
6. **Prijzen**: `upsertPriceLines` (besluit 1).
7. **Relatiestatus** → `verwerkt` via bestaand `upsertBrandRelation` (logt zelf from/to).
8. `brand_uploads.status = "approved"` + `reviewed_by` — **de laatste stap**; pas nu verdwijnt
   het voorstel-scherm.
9. Event `template_apply_finished` met eindtellingen.

**Klapt het halverwege?** Foutmelding; bij herladen staat de upload nog op staging en verschijnt
het voorstel-scherm opnieuw — met minder voorstellen, want het toegepaste deel is nu
*unchanged*. Opnieuw goedkeuren maakt het af. In events staat `template_apply_started` zonder
`…finished`, plus de per-product-events tot het breekpunt: exact hoe ver het kwam. Geen enkele
tussentoestand is een inconsistente catalogus.

Bekend en geaccepteerd restrisico (zelfde klasse als HANDOVER §Item A): het micro-venster
binnen de apply tussen diff-lezen en updaten. De stale-guard dekt het lange venster (tonen →
toepassen). Melden in HANDOVER.

**Afwijzen**: `status = "rejected"` + `review_note` + event. Geen catalogus-write, geen
relatiestatus-wijziging.

## Besluit 6 — `data_ontvangen` vs. `verwerkt`

- **`data_ontvangen` bij een gelukte upload** (validatie gepasseerd, staging-rij aangemaakt):
  het feit "dit merk heeft geleverd" is dan waar, ook al is het voorstel nog niet beoordeeld.
  Voor de 1.3-outreach-werklijst is dat precies het signaal: *niet meer najagen om data, wel
  nog verwerken.* Levert een al verwerkt merk opnieuw, dan valt hij terug naar
  `data_ontvangen` — er ligt weer onverwerkt werk.
- **`verwerkt` bij goedkeuren** (stap 7).
- **Afwijzen laat de relatiestatus staan** (blijft `data_ontvangen`): er ís geleverd, het is
  alleen niet bruikbaar. `afgewezen` betekent "merk wil niet meewerken" en mag alleen een mens
  via het bestaande formulier zetten.
- Een format-afwijzing (geen staging-rij) wijzigt de status niet; wel een event.

## Besluit 7 — uploadgrootte-cap

`MAX_TEMPLATE_UPLOAD_BYTES = 3 * 1024 * 1024`, ruim onder de bestaande
`serverActions.bodySizeLimit: "4mb"` (`next.config.ts`) inclusief FormData-overhead. Een
gevulde template is honderden KB. Twee lagen: client (directe Engelse melding, geen request) en
server als éérste check in de action (gezaghebbend). **Geen client-side extractie zoals bij de
PDF** — het bestand is klein genoeg en de validator moet de rauwe bytes zien. De melding hoort
**niet** in `excel-validate-messages.ts`: een cap is geen format-oordeel; de tekst leeft bij de
upload-UI.

## Besluit 8 — events (regel 5)

| Moment | entity / entityId | action |
|---|---|---|
| Gevalideerd + gestaged | `brand_upload` / uploadId | `template_upload_staged` |
| Format-afwijzing | `brand` / brandId | `template_upload_rejected_format` |
| Cap-afwijzing (server) | `brand` / brandId | `template_upload_too_large` |
| Toepassen gestart | `brand_upload` / uploadId | `template_apply_started` |
| Per nieuw product | `product` / productId | `product_created_from_template` |
| Per bijgewerkt product | `product` / productId | `product_fields_applied` |
| Veld overgeslagen (stale) | `product` / productId | `template_field_skipped_stale` |
| Prijsregels | `price_list` / listId | `price_lines_upserted` (+ bestaand `price_list_created`) |
| Toepassen klaar | `brand_upload` / uploadId | `template_apply_finished` |
| Afgewezen door mens | `brand_upload` / uploadId | `template_upload_rejected` |
| Relatiestatus | via `upsertBrandRelation` (logt zelf) | — |

"Voorstel getoond" wordt **bij de staging-action** gelogd, niet per render:
`app/data/brand-relations/actions.ts:53-55` legt expliciet vast dat we niet per page-render
loggen (ruis). Bewuste afwijking van de letterlijke briefing-lezing, met dit argument.

## Besluit 9 — het `/admin/imports`-gat (vondst van agent B, geverifieerd)

`lib/repo/admin.ts:114` lijst **álle** `status='staging'`-uploads, en `approveUpload:118` flipt
alleen de status — het past niets toe. Zonder maatregel krijgt een template-upload daar een
goedkeurknop die **stil niets doet**: precies het verboden gedrag. Oplossing: `kind='template'`
uitfilteren in `pendingUploads`, met commentaar dat die uploads hun eigen voorstel-scherm op de
merkrelatie-pagina hebben.

## Bestanden

**Nieuw:**

| Pad | Inhoud |
|---|---|
| `lib/template-diff.ts` | Schrijf-mapping key→products-kolom; normalisatie per kolomtype (uit `getTableColumns(products)`); `diffTemplateRows(...)`; types `ProductDiff`, `FieldProposal` (union `new/changed/conflict`), `TemplateReturnPayload`; selectie-sleutel-helpers + parser. **Het contract tussen de werkpakketten.** Importeert `db/schema` (metadata, géén `db/client` — geen connectie). |
| `lib/repo/template-return.ts` | `stageTemplateReturn`, `getTemplateReturn`, `applyTemplateProposal`, `rejectTemplateProposal`. |
| `components/data/template-upload-card.tsx` | Client: file-input + cap + `useActionState`; toont `afwijzingsTekst`/`samenvattingsTekst` uit de 1.1-renderer. |
| `components/data/template-proposal.tsx` | Voorstel-scherm: samenvattingsbanner, per product een groep met per-veld-rijen (badge + oud→nieuw + checkbox), "Select all new products", prijslijst-fieldset (alleen als er prijsvoorstellen zijn én geen actieve lijst), Approve/Reject. |
| `app/data/brand-relations/[brandId]/upload/[uploadId]/page.tsx` | RSC: upload laden, guard `brandId` + `kind === 'template'`, verse diff, renderen. Afgehandelde upload → nette tekst. |
| `app/data/brand-relations/[brandId]/upload-actions.ts` | `uploadTemplateAction`, `approveTemplateProposalAction`, `rejectTemplateProposalAction`. |

**Wijzigen:** `lib/repo/price-archive.ts` (+`upsertPriceLines`), `lib/repo/admin.ts` (filter),
`app/data/brand-relations/[brandId]/page.tsx` (upload-sectie + open uploads), `HANDOVER.md`.

**Niet aanraken:** `lib/excel-validate.ts`, `lib/excel-validate-messages.ts`,
`lib/excel-template.ts`, `lib/field-catalog.ts`. Geen migratie.

## Tests

1. `lib/template-diff.test.ts` (puur): kolom-ontbrak vs. cel-leeg (twee expliciete tests); alle
   categorieën; normalisatie ("12,5"≡12.50, "Yes"/"ja", "abc" in kelvin → Conflict(b));
   onbekende code → new product; ontbrekende naam blokkeert; dubbele code → Conflict(c);
   hoofdlettergevoelige match; `name_en` landt op `nameEn` (niet `name`).
2. **Rondgang-test**: template bouwen met `lib/excel-template.ts` → programmatisch vullen →
   validator → diff. Bewijst dat template/validator/diff niet uiteenlopen (1.1-discipline).
3. `lib/repo/price-archive.test.ts` (uitbreiden, PGlite): gewijzigde regel archiveert oud +
   update; gelijke regel no-op, geen archiefrij; geen lijst + `newList` → aangemaakt; geen
   lijst zonder `newList` → Error. **De hazard-test**: merk met 3 producten op een geldige
   lijst, upsert van 1 → `visible_products` telt nog steeds 3, geen `price_list_archived`-event.
4. `lib/repo/template-return.test.ts` (PGlite): stage → `data_ontvangen` + events; apply
   end-to-end; **idempotentie**: tweemaal toepassen → identieke eindtoestand, geen dubbele
   archiefrijen; stale-guard; reject → catalogus onveranderd, wel events; already-processed.
5. `components/data/template-proposal.test.tsx` (white-box RSC, patroon
   `components/data/brand-relations.test.tsx`): fixture met alle categorieën; **screenshots
   licht/donker × mobiel/desktop**; assert dat changed/clear een checkbox hebben met default
   uit en new default aan.
6. DoD-handmatig: Google-Sheets-export-check op live + `bunx tsc --noEmit`.

## Bouwvolgorde

**Stap 0 (sequentieel):** contract — `lib/template-diff.ts` met álle types + signatures.

**WP-A (motor):** diff-engine + tests → `upsertPriceLines` + tests → `lib/repo/template-return.ts`
+ tests → `admin.ts`-filter. Raakt geen UI.

**WP-B (schermen):** upload-card + proposal-component tegen fixtures + screenshottests → route +
actions → sectie op de merkrelatie-pagina. Raakt geen lib/repo behalve imports.

**Integratie:** actions aan echte repo knopen, rondgang-test, volle suite + tsc, screenshots
bekijken, HANDOVER. Prijzenpad is de laatste, afhakbare schijf.

Commits met **expliciete paden** (gedeelde working tree — nooit `git add -A`). **Stop vóór push
naar main**: dat is een productie-deploy en vereist Timo's akkoord.

## Bewust niet gedaan

- Geen `replacePriceList`-aanroep en geen vervangings-keuze in de UI (besluit 1).
- Geen verlenging van de geldigheid van een bestaande lijst.
- Geen reparatie van de verouderde `measure`-entries in `field-catalog.ts` (besluit 3).
- Geen merk-aliassen/`brandKeyOf`-normalisatie — leesroute-sessie.
- Geen opslag van rauwe xlsx-bytes.
- Geen `db.transaction()`, ook niet "voor tests".
- Geen wijziging aan de 1.1-validator of zijn messages.
- Geen bewerkbare velden in het voorstel-scherm (de import-flow laat bewerken toe; hier alleen
  aanvinken — merkdata bewerken vóór opslag roept eigen herkomst-vragen op: wiens data is het dan?).

## Fouten in de briefing (melden aan de sprintmaster)

1. **`measure.column` is niet de schrijf-brug** (besluit 3). Letterlijk volgen schrijft
   `name_en` over `products.name` heen. `field-catalog.measure` is verouderd t.o.v. migratie 0007.
2. **De drie categorieën zijn inconsistent met de conflictregel** (besluit 4): onder "bestaand
   wint tenzij aangevinkt" gedraagt elke overschrijving zich als conflict.
3. **Het verwachte event "prijslijst gearchiveerd" veronderstelt het vervangings-pad** dat de
   briefing zelf als hazard aanmerkt. Op het regel-niveau-pad vuurt `price_list_archived` hier
   per definitie nooit; het analoge spoor is `price_lines_upserted.archivedLines` + de
   archiefrijen.
4. **"Voorstel getoond" als event** botst met het anti-ruis-precedent in `actions.ts:53-55`
   (niet per render loggen). Opgelost door bij de staging-action te loggen.
5. **Het `/admin/imports`-gat** (besluit 9) — niet genoemd in de briefing, wel echt.
