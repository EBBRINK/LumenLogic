# Probleem: "groen" zegt niet wat Brink denkt dat het zegt

> Aanleiding: **demosessie 12 aug 2026 met Brink Licht**, punt 3 uit het blok
> *Projects / matching*: *"Groen = klaar. Geen handmatige check op groene regels."*
>
> Bij het uitwerken bleek punt 3 geen UI-punt maar een **definitiekwestie**. Timo,
> 12 aug: *"Als we zeker weten dat het product wat zij vragen dít product is, dan is het
> groen. Voor de rest is het niet groen."* En: *"Bij een groene match zijn er niet
> verschillende kandidaten."*
>
> Gemeten in de code van deze worktree (commit `896e450`).

## Het probleem in één regel

Groen betekent vandaag "geen enkele gevraagde spec is tegengesproken" — een uitspraak over
**specs**, die over meerdere kandidaten tegelijk waar kan zijn — terwijl Brink het leest als
"dit is hét product" — een uitspraak over **identiteit**. Daarom vraagt een groene regel nog
steeds twee handelingen van een mens, en daarom voelt dat als onnodig.

## Meting 1 — groen is een spec-oordeel, geen identiteitsoordeel

`lib/matching/engine.ts:824-842`:

```ts
const anyGreen = provable.some((c) => worstVerdict(c.deviations) === "groen");
…
} else if (anyGreen) status = "groen";
```

`some` — één groene kandidaat in de lijst `aantoonbaar` maakt de hele regel groen. Hoeveel
kandidaten daarnaast óók groen zijn, telt niet mee. Bij de codetreffer (`viaSku`) staat er
letterlijk `status = provable.length > 0 ? "groen" : "open"` (regel 838): ook daar telt
alleen "minstens één".

Er is dus **geen enkele plek waar het aantal kandidaten de kleur beïnvloedt**. De
`limit` is standaard 8 (`engine.ts:602`), dus een groene regel kan tot acht kandidaten
dragen die allemaal even goed scoren — precies wat de klant in de demo zag.

## Meting 2 — een groene regel heeft geen gekozen product

`lib/repo/matching.ts:135-146` schrijft de matchuitkomst weg:

```ts
matchedProductId blijft leeg tot een keuze,
BEHALVE bij auto-door (B3): dan wordt de bijna-match direct gezet, zónder review.
```

`matchedProductId` wordt alleen gezet bij `auto` — en `auto` is
`outcome.unambiguousYellow`, wat per definitie **alleen bij status geel** bestaat
(`pickUnambiguousYellow`, `engine.ts:162`). Een **groene** regel krijgt dus géén product
toegewezen.

Gevolg, doorgemeten naar het klantdocument:

- `getSpecLines` (`lib/repo/dossiers.ts:150-166`) join't de productnaam en de prijs op
  `matchedProductId` → beide blijven leeg;
- de offerteregels-filter (`lib/repo/dossiers.ts:524-528`) eist status groen/geel **én** een
  geldige stuksprijs → een groene regel zonder keuze **valt uit de offerte**.

Een mens moet dus op het regeldetail "Choose" klikken vóór een groene regel meetelt. Dat is
handeling 1 van de twee.

Merk de scheefstand op: voor **geel** bestaat auto-door wél (B3, de ondubbelzinnige
bijna-match wordt automatisch vastgezet), voor **groen** niet. De zekerdere uitkomst vraagt
vandaag méér handwerk dan de minder zekere.

## Meting 3 — elke geïmporteerde regel draagt een leescheck, ook als hij groen is

`lib/repo/ocr.ts:286` zet bij het verwerken van een gelezen regel onvoorwaardelijk
`reviewKind: "ocr"`, ongeacht de matchuitkomst. `lib/repo/matching.ts:122-123` bewaart die
vlag bij elke hermatch (bewust: hij zegt iets over de bron, niet over deze match). Een regel
met `reviewKind ≠ null` en `reviewedAt = null` staat in de wachtrij
(`lib/repo/review.ts:68`) met een **Checked**-knop.

Dat is handeling 2. Ze gaat over de **lezing** ("heeft de AI deze regel goed overgenomen?"),
niet over de match — en ze heeft een harde functie: `lib/ai/vangnet.ts:619-639` sluit een
regel met een open OCR-review uit van het AI-vangnet, omdat een verhallucineerd merk de
merkvergrendelde zoektool niet mag sturen. Het afronden van die review is bovendien wat het
vangnet triggert (`lib/repo/review.ts:481-483`).

## Wat het probleem dus is

| | wat Brink bedoelt | wat de code doet |
|---|---|---|
| groen | dit is hét product, één stuk | ≥1 kandidaat sprak geen spec tegen |
| aantal kandidaten | per definitie één | tot `limit` (8), niet meegewogen |
| gevolg | klaar, gaat de offerte in | geen product gezet, valt uit de offerte |
| menselijke klik | geen | "Choose" + bij import ook "Checked" |

De handelingen weghalen zónder de definitie aan te scherpen zou het omgekeerde van veilig
zijn: dan gaat een willekeurige van acht kandidaten ongezien het klantdocument in.

## Twee routes (besluit Timo, 12 aug: **B**)

- **A** — groen herdefiniëren zodra de LLM-matchmotor er is (punt 1): "het model wijst één
  product aan met hoge zekerheid". Wacht op meer ingeladen prijslijsten.
- **B** — *gekozen, nu bouwen:* groen aanscherpen zonder LLM. Groen uitsluitend bij een
  **exacte artikelnummertreffer** of bij **precies één aantoonbare kandidaat**; alles
  daarboven wordt geel (Brink beslist, mét de bestaande "welke van deze N"-kaart). Wat dan
  nog groen is, wordt automatisch vastgezet — geen klik meer.

B levert **minder** groen dan vandaag. Dat is de bedoeling: het groen dat overblijft
betekent wat Brink denkt dat het betekent.

## Randvoorwaarden

- **IJzeren regel 4** (default = veilig): een strengere groen-drempel is hier de veilige
  kant; twijfel gaat naar geel/mens, nooit stil de offerte in.
- **IJzeren regel 5**: het automatisch vastzetten wordt gelogd — zelfde patroon als
  `near_match_auto_accepted` (`lib/repo/matching.ts:161-167`), met `chosenBy: "system:auto"`.
- **C-07**: afwijkingen blijven zichtbaar, ook op een automatisch vastgezette groene regel.
- **B7** (`docs/goal-artikelnummer-matching.md`): een exacte codetreffer is groen, ook met
  een afwijking. Die blijft staan — maar de vraag "wat als één code twee producten raakt"
  is nieuw en moet expliciet worden beantwoord.
- **De leescheck blijft** (meting 3). Punt 3 gaat over de matchkeuze; de bron-review heeft
  een eigen functie en hangt aan het AI-vangnet. Losmaken is een apart besluit.
- **Regressie-anker**: `scripts/eval-testset.ts` over raadhuis + kvk + tno + dordrecht.
  Deze ingreep verschuift die uitkomsten met opzet — vastleggen vóór/ná, niet "ongewijzigd".

## Meetlat

- Een regel met **precies één** aantoonbare kandidaat waarvan elk beoordeeld veld groen is:
  status groen, `matchedProductId` gezet, `chosenBy = "system:auto"`, event gelogd, géén
  review-wachtrij op grond van de match.
- Een regel met **twee of meer** groene kandidaten: **geel**, in de wachtrij, met de
  "welke van deze N"-kaart.
- Een exacte artikelnummertreffer op één product: groen en vastgezet, ook met een afwijking.
- Een regel zonder kandidaten of met alleen onvolledige: gedraagt zich als vandaag.
- Vóór/ná-telling van de eval-testset per status, in het goal-document vastgelegd.
- `bun run typecheck` schoon, `bun vitest run` groen.

## Open punt voor het goal-document

Wat als één artikelnummer **twee** zichtbare producten raakt (`fetchCandidates` stap 3a
`limit`-t maar dedupliceert niet, en `article_code` is niet uniek — alleen
`brand_id + supplier_article_code` is dat)? Dan is er een codetreffer maar geen enkelvoudige
identiteit. Voorstel: dat is **geel**, niet groen — zelfde regel als twee groene kandidaten.
