# Probleem: het gevraagde artikelnummer bereikt de matcher nooit

> Gemeten 11 aug 2026 via het **echte codepad**: de opgeslagen `spec_lines` van twee echte
> importruns, `evaluateSpecLine` zoals productie hem draait, en het `raw_markdown`-transcript van
> de run zelf. Geen nagebouwde query, geen handgetypte tekst.
>
> Het brondocument is onze eigen fixture: `scripts/gen-test-offerteaanvraag.ts` — een
> offerteaanvraag als PDF mét tekstlaag, 6 merken, 19 regels, met een kolom
> `omschrijving · artikelnummer · aantal`. De grondwaarheid staat dus letterlijk in het script.

## Het probleem in één regel

De klant schrijft het artikelnummer er in een eigen kolom bij, maar dat nummer komt verminkt in
de database en wordt daarna nooit aan de matcher doorgegeven — die zoekt uitsluitend op tekst, en
kiest op deze regel twee verkeerde drivers terwijl het exacte artikel gewoon in de catalogus staat.

## De regel waar het op stukliep

Documentregel (letterlijk uit de fixture):

```
Deltalight
Omschrijving                                                          Artikelnummer      Aantal
Plafond semi-recessed LUNELLE 52 Clip LED6W 2700K Bruin Brons 92730 BRBB   32812 9220 BRBB   14
LED POWER SUPPLY MULTI POWER 250-900 / 20W DIM8 fase-afsnij dimbaar        21012 0298        14
```

Het gevraagde artikel `21012 0298` **bestaat**, is zichtbaar en is de exacte treffer:
`[LPS] MULTI POWER 250-900 / 20W DIM8`, `max_wattage` 20,00, IP20, € 43,19 op de actieve lijst
"Delta light 2026". De matcher biedt hem niet aan. In plaats daarvan komen er twee IP68-drivers
van 17 W en 24 W als "mogelijk — data onvolledig".

## Meting 1 — de artikelnummerkolom wordt versnipperd

Wat er in `spec_lines.fixture_code` belandde, tegenover wat er in het document staat:

| document (`Artikelnummer`) | `fixture_code` geworden | |
|---|---|---|
| `1478003`, `N094DBR222HG`, `12890114`, `C1312/S` … | identiek | ✅ 16 van 19 |
| `21012 0298` | `21012` | ❌ afgekapt op de spatie |
| `32812 9220 BRBB` | `92730` | ❌ **uit de omschrijving geplukt**, niet uit de kolom |
| `BLWIM 1122` | `BLWIM` … en `1122` op de vólgende regel | ❌ de staart schuift door |

**Elk artikelnummer met een spatie erin gaat kapot; alle codes zonder spatie zijn goed.** Bij de
LUNELLE-regel is het erger dan afkappen: `92730` komt uit de staart van de omschrijving
("… Bruin Brons **92730** BRBB"), dus de kolomwaarde is niet afgekapt maar volledig gemist.

Bijkomend risico, niet gemeten: `verwerkGelezenRegels` dedupt op `armatuurcode`
(`lib/repo/ocr.ts:468`). Twee regels die tot hetzelfde fragment verminken, verliezen er stil één.

## Meting 2 — de code kan sowieso nergens heen

- `spec_lines` heeft **geen kolom** voor een gevraagd leveranciersartikelnummer. `fixture_code` is
  blijkens de schemacommentaar de **positiecode** uit een armaturenboek ("Lp301") en is
  `notNull` — in dit documenttype propt de leesroute er artikelnummers in. Eén kolom, twee
  betekenissen.
- [`specRequestFromLine`](lib/repo/matching.ts:28) zet `sku` **hard op `null`**. De engine heeft een
  exacte-SKU-route ([engine.ts:419](lib/matching/engine.ts:419)) die op zowel `article_code` als
  `supplier_article_code` zoekt, genormaliseerd via `normalizeSku` (alles behalve `[a-z0-9]` eruit,
  dus `"32812 9220 BRBB"` → `328129220brbb`) — precies wat hier nodig is. De engine noemt dit pad
  in zijn eigen commentaar een dood pad ([engine.ts:689](lib/matching/engine.ts:689)).

## Meting 3 — de leesroute verzint eisen die niet in de regel staan

Opgeslagen bij de driverregel: `req_kelvin = 2700`, `req_ip = IP50`. In de eigen tekst van die
regel staat geen van beide. Uit het transcript van de hele aanvraag (1.983 tekens):

- `IP50` komt **precies één keer** in het document voor, op een **Trizo21**-regel twee blokken
  lager: `Wand opbouw Trizo21 BOULO W in MATT Glass LED9W 2700K IP50 (voor betonnen wand)`.
- `2700K` staat op de LUNELLE-regel direct erboven, niet op de driverregel.

De parse-invoer is `[regel.ruweTekst, type, segmentTekst].join(" ")`
([ocr.ts:767](lib/repo/ocr.ts:767)). Wélke van die drie de vreemde tekst binnenhaalt is **nog niet
geïsoleerd** — dat is de eerste meting voor de bouwer, geen gok. Let op de tegenkracht: die join
bestaat met reden (`docs/probleem-ocr-toc-verdringt-specs.md`, besluit fase 2, item C — specs
staan vaak alléén in de langere ruwe tekst). Versmallen zonder meten haalt die fix onderuit.

## Meting 4 — wat de matcher hierdoor doet

Gedraaid met `evaluateSpecLine`, limit 8, op de opgeslagen regel:

| variant | uitkomst |
|---|---|
| zoals productie nu draait | **geel** — 2 kandidaten, allebei fout (17 W IP68, 24 W IP68) |
| mét code `21012 0298`, verder alles gelijk | **rood** — nul kandidaten |
| mét code, zonder de vreemde IP50 | **open** — juiste product als "mogelijk", watt 20→20 groen |
| mét code, zonder IP50 én zonder kelvin | **groen** — juiste product, aantoonbaar |

Lees rij 2 goed: **code-matchen alleen maakt deze regel rood, niet groen.** De engine vindt dan het
juiste artikel en verwerpt het vervolgens, want de driver is IP20 en de regel "eist" IP50. De
codefix en de leesroutefix zijn niet twee losse verbeteringen — je hebt ze allebei nodig.

## Meting 5 — waarom de tekstroute het juiste artikel niet vindt

De catalogus schrijft dezelfde productsoort op twee manieren. Onder Delta Light-prefix `21012`:
**36 producten heten `[LPS] …`, 12 heten `LED POWER SUPPLY …`**. De aanvraag zegt "LED POWER
SUPPLY". De positiegewogen tekstscore (`lib/matching/textscore.ts`, token 0 weegt 1,0) laat elk
product dat letterlijk zo begint winnen van `[LPS] MULTI POWER 250-900 / 20W DIM8`, dat de drie
zwaarste tokens mist.

Gemeten, zelfde regel: haal "LED POWER SUPPLY" uit de aanvraagtekst en het juiste artikel staat op
**plek 1**; laat het staan en het staat niet in de **top 20**. (Er staan ook dubbele rijen:
`21012 0515` en `21012 0575` heten allebei "LED POWER SUPPLY MULTI POWER DIM5".)

## Meting 6 — een code die nergens op slaat verstopt een gat

De tweede regel van hetzelfde blok vraagt `32812 9220 BRBB` = LUNELLE 52 CLIP. Dat artikel bestaat
bij Delta Light (geverifieerd op deltalight.com: de reeks `32812 92xx/93xx` in zes afwerkingen)
maar **de hele LUNELLE-familie ontbreekt in onze catalogus** — geen enkele rij met prefix `32811`,
`32812`, `32813` of `32820`, terwijl het merk 18.667 producten en 18.659 prijzen heeft. Dit is een
onvolledige prijslijst, geen matchingfout.

Gemeten met de SKU-route aan: de code vindt niets, de engine valt terug op tekst en biedt **acht
SPY 52 CLIP-varianten** aan als "mogelijk". Verkeerde familie, en het gat in de import wordt
onzichtbaar. Een terugval die een expliciete, onvindbare code overschrijft is erger dan geen
kandidaat.

## Randvoorwaarden

- **IJzeren regel 2**: geen prijs in enige sorteersleutel of poort.
- **IJzeren regel 3**: kandidaten uitsluitend uit `visible_products`.
- **IJzeren regel 4**: default = veilig. Een onvindbare code hoort naar een mens, niet naar een gok.
- **Besluit 4**: geen-data is neutraal — nooit stil uitsluiten.
- **"Groen is groen"**: de `list`-toekenning en `judgeCandidate` blijven ongemoeid tenzij een
  besluit dat expliciet opent.
- De spec-loze route moet **byte-identiek** blijven (`inv2`/`inv7b` draaien met `specs: {}`).
- De join in de parse-invoer bestaat om `probleem-ocr-toc-verdringt-specs.md` op te lossen; die
  fix mag niet sneuvelen.

## Meetlat

- De driverregel van de fixture wordt **groen** op `21012 0298`, met `watt 20→20` als enige
  beoordeelde afwijking.
- De LUNELLE-regel levert **geen** SPY-kandidaten meer, maar een expliciet "gevraagde code niet in
  de catalogus".
- Alle 19 fixtureregels: `fixture_code`/codeveld **identiek aan de kolom in
  `gen-test-offerteaanvraag.ts`** — dat is de grondwaarheid, hij staat in het script.
- Geen enkele regel draagt nog een spec die niet in zijn eigen documentregel voorkomt. Concreet:
  de driverregel heeft `req_ip = null` en `req_kelvin = null`; de Trizo21-BOULO-regel houdt zijn
  eigen `IP50` en `2700K`.
- **Regressie-anker:** `scripts/eval-testset.ts` over raadhuis + kvk + tno ongewijzigd of beter.
  Het armaturenboek-pad (positiecodes Lp301/Ls004) mag geen millimeter verschuiven.
