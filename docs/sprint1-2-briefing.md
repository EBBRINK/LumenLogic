# Sprint 1.2 — Retour-pad: upload → voorstel → goedkeuren (briefing voor de bouwsessie)

> **Status: klaar om uit te voeren.** Opgesteld 16 jul 2026 door de sprintmaster-sessie van
> week 1 ("de merkgegevens stromen binnen", 20–24 jul), ná afronding van 1.1. Dit document is
> zelfvoorzienend: een verse chat moet er zonder verdere context mee kunnen werken.
> **Dit is het grootste en gevaarlijkste onderdeel van de week** — lees §"De hazard" vóór je
> plant. Bij twijfel: stoppen en melden, niet gokken.

## Context in vier zinnen

Lumen Logic (spec-/calculatie-/offertetool voor Brink Licht) stuurt merken een Excel-template
(`lib/excel-template.ts`) om hun productdata aan te leveren. Sinds 1.1 kan een ingevuld
bestand ook gevalideerd worden (`lib/excel-validate.ts`) — maar er is nog geen enkele manier
om het de app in te krijgen. 1.2 bouwt dat: **upload → voorstel → goedkeuren**, met als harde
eis (besluit 1, grill-sessie 15 jul) dat er **nooit iets stil wordt weggeschreven**. Hier
wordt ook eindelijk `lib/repo/price-archive.ts` aangesloten — dat bestaat, is getest, en
wordt vandaag nergens aangeroepen.

## Opdracht (~9 u)

### Acceptatiecriteria (uit `docs/lumenlogic-sprintplan-augustus.md`, onverkort)

- *Given* een merkrelatie-pagina, *when* Brink een ingevulde template uploadt die de
  validatie passeert, *then* toont een voorstel-scherm per veld: **nieuw gevuld / gewijzigd
  (oud→nieuw) / conflict** — niets staat dan al in de database.
- *Given* het voorstel-scherm, *when* Brink goedkeurt, *then* worden wijzigingen toegepast,
  events gelogd, en gaat de relatiestatus naar `data_ontvangen`/`verwerkt`; *when* afgewezen,
  *then* verandert er niets.
- Conflictregel (vooraf vastgelegd, **niet ter discussie**): **bestaand veld wint, tenzij
  expliciet aangevinkt.**
- Het aansluiten van `price-archive` hoort hier. Beoogde stroom:
  `docs/plan-datamodel-productspecs.md` §"Prijslijst-historie".

## ⚠️ De hazard — lees dit vóór je plant

**Een template-upload is waarschijnlijk géén volledige prijslijst, en `replacePriceList`
gaat daar wél van uit.**

`replacePriceList(db, brandId, …)` in `lib/repo/price-archive.ts` archiveert **álle**
prijsregels van het merk en maakt een nieuwe lijst. Dat is correct voor "de prijslijst 2027
komt binnen" — het scenario waarvoor het geschreven is. Maar als een merk een template
terugstuurt met 40 van zijn 500 producten, dan:

1. archiveert `replacePriceList` de prijzen van álle 500,
2. komen er 40 nieuwe prijsregels terug,
3. en verliezen **460 producten hun geldige prijs**.

En dan bijt ijzeren regel 3: `visible_products` koppelt zichtbaarheid aan een geldige prijs,
dus **460 producten verdwijnen stilzwijgend uit álle zoekresultaten en uit de matcher**. Een
upload bedoeld om data te verrijken maakt dan driekwart van de catalogus onzichtbaar. Niets
in de code houdt dat tegen; het is precies het soort schade dat "nooit stil wegschrijven"
moet voorkomen, maar de conflictregel dekt het niet — die gaat over vélden, niet over
weggevallen rijen.

**Wat 1.2 daarom moet beslissen en expliciet vastleggen** (dit is de kern van je plan-fase):

- Is een template-upload een **volledige lijstvervanging** of een **gedeeltelijke
  bijwerking**? Ons eigen template zegt "Fill in one product per row" en "Fields that do not
  apply may be left empty" — het nodigt niet uit tot volledigheid. Neig naar gedeeltelijk,
  maar onderbouw.
- Is het gedeeltelijk, dan is `replacePriceList` het **verkeerde** instrument en heb je een
  regel-niveau-pad nodig (per `(brand_id, supplier_article_code)` bijwerken; alleen de
  vervangen regels archiveren). `archivePriceList` archiveert óók per lijst, niet per regel —
  ga na of je een derde functie nodig hebt of dat de bestaande volstaan.
- Kan het allebei, dan is dat een **keuze van Brink bij de upload**, geen gok van de code —
  en dan moet het voorstel-scherm de consequentie tonen ("460 producten verliezen hun
  prijs"), niet pas de uitkomst.
- **Een prijslijst heeft `validFrom`/`validUntil`; het template niet.** Waar komen die
  vandaan? (Historisch: "bron heeft geen datum → `valid_until = 2026-12-31`", zie HANDOVER.)
  Brink moet ze invullen — dat is UI, en het hoort in je plan.

**Melden, niet oplossen als het groeit.** Blijkt dit een eigen ontwerpvraag van meer dan een
uur, stop dan en meld het: dan wordt het een eigen probleemdoc en levert 1.2 het voorstel-pad
zonder prijzen. Data binnenkrijgen zonder de catalogus te slopen is meer waard dan alles in
één keer.

## Wat er al bestaat — lees dit vóór je plant

| Wat | Waar | Relevantie |
|---|---|---|
| **Validatiemodule (1.1)** | `lib/excel-validate.ts` + `lib/excel-validate-messages.ts` | Jouw poort. Volledige API hieronder. **Ongewijzigd gebruiken** — 4.B hergebruikt hem ook. |
| Template-builder | `lib/excel-template.ts` | Wat we uitsturen. Werkblad "Product data", labels op rij 2, data vanaf rij 4. |
| Veldcatalogus | `lib/field-catalog.ts` | `excelColumns()`, `measure.column` = de products-kolom per veld. Jouw brug van catalog-key naar DB-kolom. |
| **Price-archive (nog niet aangesloten)** | `lib/repo/price-archive.ts` | `archivePriceList` + `replacePriceList`. Zie §"De hazard". |
| Beoogde prijsstroom | `docs/plan-datamodel-productspecs.md` §"Prijslijst-historie" | Match op `(brand_id, supplier_article_code)` → bijwerken, nooit dupliceren. |
| Merkrelatie-pagina | `app/data/brand-relations/[brandId]/page.tsx` | Waar de upload landt. Heeft al scorecard + relatieformulier + template-download. |
| Relatiestatussen | `components/data/brand-relations-table.tsx:20` | `niet_benaderd \| benaderd \| wacht_op_data \| data_ontvangen \| verwerkt \| afgewezen` — bestaan al, geen migratie nodig. |
| **Voorstel-scherm-precedent (PDF)** | `import_runs` + `app/projects/[id]/import/[runId]` | B-06: bewerkbare voorstel-tabel, niets stil weggeschreven. **Dit is hetzelfde probleem, één laag hoger.** Bestudeer het. |
| **Staging-precedent (PDL)** | `brand_uploads` (`db/schema.ts:971`), `lib/repo/brand-portal.ts`, `/admin/imports` | H-11: staging → goedkeuren/afwijzen. Bestaat al voor merk-uploads. |
| Uniciteit | index `products_brand_sac_uniq` op `(brand_id, supplier_article_code)` | Gewone unique op text → **hoofdlettergevoelig** in Postgres. 1.1 rekent daar op. |

### De 1.1-API die je consumeert

```ts
validateFilledTemplateXlsx(buffer, context: ValidatieContext): Promise<ValidatieResultaat>
// ValidatieResultaat = FormatAfgewezen | FormatGeldig  (discriminated union op `ok`)
```

Vier dingen die het ontwerp van 1.1 je oplegt — lees ze goed, ze zijn er met opzet:

1. **`FormatAfgewezen` heeft géén rijen.** Type-niveau-garantie: een afgewezen bestand kán
   niet half verwerkt worden, ook niet per ongeluk. Vecht daar niet tegen.
2. **`GelezenRij.velden` is `Record<catalogKey, string>` waarbij aanwezigheid betekenis
   draagt.** `"cri" in velden === false` = kolom ontbrak → **stel niets voor**.
   `velden.cri === ""` = kolom stond er, cel leeg → dat is een merk dat het veld leegmaakt.
   **Verwar die twee en je stelt voor om bestaande data te wissen.** Dit is de belangrijkste
   regel van je diff-logica.
3. **`ValidatieContext.knownArticleCodes`**: `undefined` = check overslaan · lege `Set` =
   merk heeft nog geen producten. Twee verschillende dingen. `artikelcodesGecontroleerd`
   op het resultaat zegt of de check liep.
4. **De module levert codes + parameters, geen proza.** `lib/excel-validate-messages.ts`
   (`afwijzingsTekst`, `waarschuwingsTekst`, `samenvattingsTekst`) draagt de taal. Wil je een
   nieuwe melding? Code erbij in de module, tekst erbij in de renderer — nooit een zin in de
   validator.

### Openstaande punten uit 1.1 die 1.2 erft

- **Uploadgrootte begrenzen** is bewust naar 1.2 geschoven (een cap is geen format-oordeel,
  maar het uploadpad heeft er wél een nodig). Zie ook `docs/probleem-413-pdf-upload.md`.
- **Leidende nullen gaan vóór ons verloren** — Excel maakt van artikelcode `007` een `7`
  vóór het bestand ons bereikt. Instructie-kwestie, geen codefix; wees je ervan bewust bij
  het matchen op `supplier_article_code`.
- **Nog nooit tegen een écht merk-Excel getest.** Eén handmatige check met een
  Google-Sheets-export hoort in 1.2 — dat is de meest waarschijnlijke bron van een
  format-verrassing.

## Ontwerpkaders (aanbevelingen sprintmaster — plan-agents mogen beargumenteerd afwijken)

1. **Waar leeft het voorstel tussen upload en goedkeuren?** "Niets staat dan al in de
   database" gaat over de **catalogus**, niet over een staging-tabel — anders overleeft het
   voorstel geen page-load. Er zijn twee precedenten (`import_runs` voor PDF, `brand_uploads`
   voor PDL). **Kies er één en motiveer.** Nieuw bouwen mag, maar dan met argument.
   ⚠️ Kost dit een migratie: zie §Harde grenzen — eerst fetchen.
2. **Diff op productniveau, per `(brand_id, supplier_article_code)`.** Drie uitkomsten per
   veld: *nieuw gevuld* (was leeg) · *gewijzigd* (oud→nieuw, beide gevuld) · *conflict*.
   Denk scherp na over wat "conflict" precies ís, en waarin het verschilt van "gewijzigd" —
   de conflictregel ("bestaand wint tenzij aangevinkt") suggereert dat élke overschrijving
   van gevulde data een conflict is. Leg je definitie vast; het onderscheid stuurt de UI.
   Een rij met een onbekende artikelcode = **nieuw product** (of een tikfout — vandaar dat
   1.1 er een waarschuwing van maakt, geen fout).
3. **Afwijzen = niets.** Geen halve toepassing, geen "we bewaren de rest even". Wel: het
   afwijzen zelf loggen (ijzeren regel 5).
4. **Meldingen Engels** (besluit W1, 16 jul): de interne UI is Engels sinds de i18n-slag —
   nav zegt "Projects / Catalog / Settings", `STATUS_LABEL` zegt "Not approached". Gebruik de
   renderer uit 1.1 en volg diezelfde lijn in je eigen UI-teksten.
5. **`data_ontvangen` vs. `verwerkt`.** Beide statussen bestaan al. Bepaal welke wanneer valt
   (bij upload? bij goedkeuren?) en leg het vast — het stuurt de outreach-werklijst van 1.3.
6. **Events.** 1.2 vóégt gedrag toe, dus ijzeren regel 5 geldt onverkort: upload, voorstel
   getoond, goedgekeurd, afgewezen, per-veld toegepast, prijslijst gearchiveerd. Volg de
   bestaande `logEvent`-vorm (`lib/repo/events.ts`); `price-archive` logt zelf al
   `price_list_archived`/`price_list_created`.

## ⛔ De transactie-val — kost je een productie-incident als je erin trapt

`db/client.ts` draait op `drizzle-orm/neon-http`, en **die driver ondersteunt géén
interactieve transacties**. De tests draaien op PGlite, die ze wél slikt. `AppDb` is
hetzelfde type voor allebei.

Gevolg: **`db.transaction()` geeft groene tests en gooit altijd in productie.** Dit staat
uitgeschreven in `HANDOVER.md` (§"Item A: rijkste-wint-dedup"), waar hetzelfde probleem al
een keer een geaccepteerd race-risico opleverde.

Dat raakt 1.2 harder dan eerdere onderdelen: "pas bij goedkeuren wordt alles toegepast" is
precies een operatie die je atomair wíl. Dat kan hier dus niet. **Ontwerp voor
gedeeltelijk falen**: volgorde die bij afbreken geen inconsistente catalogus achterlaat,
idempotentie, en een spoor in events waaruit blijkt hoe ver het kwam. Beschrijf dat expliciet
in je plan; ik toets erop.

## Harde grenzen (parallelle sessies — week 1 draait naast de AI-leesroute-sessie)

- **Altijd eerst `git fetch origin`; redeneer tegen `origin/main`, nooit lokale main.**
- ⚠️ **Twee sessies delen deze working directory.** De leesroute-sessie heeft ongecommit werk
  in de tree staan (o.a. `lib/pdf/armaturenboek.ts`, `lib/repo/ocr.ts`, `db/test-db.ts`).
  **Gebruik nooit `git add -A` of `git commit -a`** — altijd expliciete paden, anders commit
  je andermans halve werk mee. 1.1 ontliep dit door discipline, niet door geluk.
- **Migraties**: de leesroute-sessie maakt vermoedelijk 0010/0011 (tabel `brand_aliases`,
  kolom `tile` op `ocr_page_images`). Vóór `drizzle-kit generate`: **eerst fetchen en het
  volgende vrije nummer pakken**; bij twijfel melden. Hernummer nooit een bestaand
  migratiebestand — `db/migrate.ts` houdt per bestandsnaam bij wat gedraaid is en de SQL is
  **niet idempotent**. Dev = prod: één Neon-database (besluit B1).
- **Merk-aliassen en `brandKeyOf`-normalisatie zijn van de leesroute-sessie.** Week 1 bouwt
  géén tweede normalisatiemechanisme. Nieuwe *producten* aanmaken mag; naamvarianten van
  merken oplossen niet.
- **`~/Downloads/lumenlogic-testset/` is echte klantdata: NOOIT in git.**
- **HANDOVER.md: eigen sectie toevoegen**, andermans secties niet herschrijven.
- **IJzeren regels 1–5 uit `CLAUDE.md`**, hier concreet:
  - **Regel 2** — prijs komt de data in, maar nooit de ranking. Geen sortering, geen score.
  - **Regel 3** — verlopen prijslijst = product onzichtbaar, centraal via `visible_products`.
    Zie §"De hazard": dit is de regel die je per ongeluk kunt afvuren op de halve catalogus.
  - **Regel 5** — alles loggen.

## Werkwijze (verplicht, in deze volgorde)

1. **Probleem/opdracht uitschrijven** in eigen woorden. Nog geen code. Neem §"De hazard"
   erin op met je eigen conclusie.
2. **Plan met 2 agents** (onafhankelijk, dan synthese). Nooit direct bouwen.
3. **Bouwen** volgens het plan, kleine commits op main met **expliciete paden**, pushen.

### Modelverdeling per fase (aanhouden, tenzij de klus anders blijkt)

- **Fase 1 — probleem uitschrijven:** jij zelf. Afgebakend leeswerk.
- **Fase 2 — plan met 2 agents:** spawn beide met **`model: fable`**. Hier zit het oordeel:
  de prijslijst-hazard, waar het voorstel leeft, wat "conflict" betekent, en het ontwerp
  zonder transacties. Dit is het duurste denkwerk van de hele week.
- **Fase 3 — bouwen met 2 agents:** `model: opus`.
- **Verificatie:** jij zelf.

Wijk je af, meld het met reden.

### Definition of Done (onverkort uit het supplement)

- [ ] `bun vitest run` groen, **incl. RSC-screenshottests van het voorstel-scherm in licht én
      donker** (1.2 heeft wél schermen — dit geldt hier voluit).
- [ ] `bunx tsc --noEmit` schoon.
- [ ] Gecommit én gepusht naar GitHub.
- [ ] Gedeployed naar productie, migraties op Neon toegepast.
- [ ] **Handmatig geverifieerd in de live app** — het echte scherm, met een écht bestand.
      Doe hier de Google-Sheets-export-check uit §"Openstaande punten uit 1.1".
- [ ] `HANDOVER.md` bijgewerkt (eigen sectie: wat, aannames, open punten).
- [ ] Events gelogd (ijzeren regel 5).

**Stop vóór elke productie-deploy en vraag Timo's akkoord.** Push naar `main` ís een
productie-deploy (standaard Vercel-opzet, geen `vercel.json` — vastgesteld in 1.1).

## Rapportage terug aan de sprintmaster

Lever aan het eind: bestandspaden · testnamen/aantallen · commit-SHA's · de ontwerpkeuzes
(m.n. de hazard, waar het voorstel leeft, je definitie van "conflict", en hoe je zonder
transacties atomair genoeg bent) · wat bewust níét gedaan is. De sprintmaster verifieert
claims zelf (code lezen, tests draaien, DB read-only) vóór 1.2 wordt afgevinkt — schrijf dus
niets op dat niet te reproduceren is. Vind je een fout in deze briefing: **meld het, volg hem
niet blind.** Dat is bij 1.1 gebeurd (kaderpunt 4 sprak de codebase tegen) en het was terecht.
