# Sprint 1.1 — Format-validatiemodule (briefing voor de bouwsessie)

> **Status: klaar om uit te voeren.** Opgesteld 16 jul 2026 door de sprintmaster-sessie
> van week 1 ("de merkgegevens stromen binnen", 20–24 jul). Dit document is zelfvoorzienend:
> een verse chat moet er zonder verdere context mee kunnen werken. Bij twijfel: stoppen en
> melden, niet gokken.

## Context in drie zinnen

Lumen Logic (spec-/calculatie-/offertetool voor Brink Licht) kan merkdata alleen exporteren:
merken krijgen een Excel-template (`lib/excel-template.ts`), maar een ingevulde template kan
nog niet terug de app in. Week 1 bouwt dat retour-pad in drie stappen: **1.1 valideert het
bestand** (dit item), 1.2 bouwt upload → voorstel → goedkeuren, 1.3 maakt Merkenbeheer de
hoofdingang. Besluit 1 (grill-sessie 15 jul) ligt vast: **nooit stil wegschrijven** — en 1.1
schrijft per constructie helemaal niets.

## Opdracht (~5 u)

Bouw een **losse, herbruikbare lib-module + tests** die een geüpload .xlsx-bestand toetst
tegen ons template-format. Geen UI, geen route, geen DB-schrijfactie — het aansluiten
gebeurt in 1.2. Week 4-uitloop B (merkportaal-self-serve-upload) moet deze module
**ongewijzigd** kunnen hergebruiken; dat is een hard ontwerpdoel, geen wens.

### Acceptatiecriteria (uit `docs/lumenlogic-sprintplan-augustus.md`, onverkort)

- *Given* een geüpload .xlsx, *when* het niet ons template-format is (kolomkoppen/sheet
  ontbreken), *then* een duidelijke afwijzing "dit is niet ons format" met **wat er mist** —
  er wordt níéts opgeslagen.
- *Given* een correct format met inhoudelijke twijfels (lege must-velden, onbekende
  artikelcodes, dubbele rijen), *then* **per rij** dubbelcheck-waarschuwingen.
- Module is een losse lib-functie + tests, zodat week 4-uitloop B hem ongewijzigd hergebruikt.

## Wat er al bestaat — lees dit vóór je plant

| Wat | Waar | Relevantie |
|---|---|---|
| Template-builder | `lib/excel-template.ts` | Definieert exact wat "ons format" is (zie hieronder). `exceljs` is al dependency. |
| Veldcatalogus | `lib/field-catalog.ts` | Eén bron van waarheid: `excelColumns()` geeft de kolommen (📄-velden, bucket-volgorde); `niveau: "must"` markeert must-velden; 🔒-velden (`internalOnly`) staan per constructie nooit in het template. |
| Template-download | `app/data/brand-relations/template/route.ts` | De uitgaande kant; niet aanraken. |
| Staging-laag (PDL-pad) | `db/schema.ts:971` (`brand_uploads`), `lib/repo/brand-portal.ts`, `/admin/imports` | Bestaand staging→goedkeuren-pad voor JSON-rijen (H-11). **Niet van 1.1** — of het retour-pad hierop aansluit beslist 1.2. Niets hieraan wijzigen. |
| Tests-conventies | `lib/excel-template.test.ts`, `lib/field-catalog.test.ts` | Kijk hoe bestaande lib-tests zijn opgezet (o.a. de negatieve test die de template-buffer terug-parse't). |

### Het template-format (feiten uit `lib/excel-template.ts`, 16 jul)

- Werkblad **"Product data"**: rij 1 = samengevoegde bucketgroep-koppen, rij 2 =
  veldlabels (**`labelEn`**, Engels), rij 3 = instructies (`instructionEn`), **data vanaf
  rij 4** (200 lege invulrijen zijn cosmetisch). Tweede werkblad "Instructions" (tekst).
- Kolommen = `excelColumns()` in bucket-volgorde. De template-instructie aan merken zegt
  "keep the column order unchanged" — maar reken erop dat merken rommelen.
- Must-velden die in het Excel staan (niveau `must` én `inExcel`), stand 16 jul:
  **Supplier article code · Product name (English) · Category · Gross list price excl. VAT**.
  ⚠️ Oudere HANDOVER-notities noemen "must-totaal 3" — dat telde iets anders; **de code is
  leidend**, en je module hoort dit sowieso runtime uit `FIELD_CATALOG` af te leiden, nooit
  te hardcoden (het template is 16 jul nog gewijzigd: NL-velden eruit, commit `34e1e57`).

## Ontwerpkaders (aanbevelingen sprintmaster — plan-agents mogen beargumenteerd afwijken)

1. **Puur, geen DB.** De module leest een buffer + een context-parameter (bv. de bekende
   artikelcodes van het merk als `Set<string>`) en geeft een resultaat terug. Geen imports
   uit `db/` of `lib/repo/`. Dat maakt hem triviaal unit-testbaar én ongewijzigd
   herbruikbaar in 4.B. De aanroeper (1.2) haalt de context uit de DB.
2. **Twee uitkomstniveaus, strikt gescheiden.** (a) *Format-afwijzing* (sheet "Product data"
   ontbreekt / kolomkoppen kloppen niet): één duidelijke fout mét de lijst van wat er mist —
   verwerk dan géén rijen. (b) *Rij-waarschuwingen* bij correct format: per rij (met
   rijnummer) lege must-velden, artikelcodes die niet in de context voorkomen ("nieuw
   product?" is een dubbelcheck, geen fout), en dubbele rijen (zelfde supplier article code,
   binnen het bestand). Waarschuwingen blokkeren niets — 1.2 toont ze in het voorstel-scherm.
3. **Kolomherkenning op rij-2-labels (`labelEn`).** Beslis in het plan: strikte volgorde of
   naam-gebaseerd (kolommen herkennen ongeacht volgorde, onbekende kolommen negeren-met-
   melding). De acceptatiecriteria eisen alleen dat een fout format duidelijk afgewezen
   wordt; kies wat robuust is voor rommelende merken en leg de keuze vast.
4. **Meldingen in het Engels.** ⚠️ *Gecorrigeerd 16 jul — de eerste versie van deze briefing
   zei "Nederlands" en dat was fout van de sprintmaster.* De interne UI is Engels sinds de
   i18n-slag (PR #1): de nav zegt "Projects / Catalog / Settings", `STATUS_LABEL` in
   `components/data/brand-relations-table.tsx` zegt "Not approached", de werklijst zegt
   "No response (> 14 days)". Engels is dus consistent met het scherm waar de meldingen
   landen, met het Engelse template, én met de merken die in week 4-uitloop B zelf gaan
   uploaden.
5. **Plaats en naam**: naast de builder, bv. `lib/excel-validate.ts` (of vergelijkbaar) —
   zelfde laag als `lib/excel-template.ts`. Definitieve naam is aan het plan.
6. **Testdekking minimaal**: geldig bestand → 0 fouten · ontbrekend werkblad · ontbrekende/
   hernoemde kolomkop(pen) mét benoeming wat er mist · lege must-velden per rij · onbekende
   artikelcode · dubbele code binnen het bestand · leeg bestand (0 datarijen) · en de
   rondgang: de échte `buildMasterTemplateXlsx()`-buffer (ingevuld met testrijen) passeert
   de validatie — zo kunnen builder en validator nooit uiteenlopen.

## Harde grenzen (parallelle sessies — week 1 draait naast de AI-leesroute-sessie)

- **Altijd eerst `git fetch origin`; redeneer tegen `origin/main`, nooit lokale main.**
  Andere sessies shippen tijdens jouw werk.
- **Geen migratie.** 1.1 is lib-only. Lijkt er tóch een schema-wijziging nodig: stop en
  meld het aan Timo — de leesroute-sessie maakt vermoedelijk 0010/0011, nummers botsen snel.
- **Geen merk-normalisatie.** Merk-aliassen en `brandKeyOf` zijn van de leesroute-sessie
  (`docs/goal-import-ai-leesroute.md`). 1.1 bouwt géén tweede normalisatiemechanisme —
  de module doet niets met merknamen (het template heeft niet eens een merkkolom; het merk
  komt in 1.2 uit de pagina-context).
- **`~/Downloads/lumenlogic-testset/` is echte klantdata: NOOIT in git.** Voor 1.1 heb je
  hem ook niet nodig — bouw eigen fixtures met de template-builder.
- **HANDOVER.md: eigen sectie toevoegen**, andermans secties niet herschrijven.
- IJzeren regels 1–5 uit `CLAUDE.md` gelden onverkort. Voor 1.1 concreet: het prijsveld
  wordt alleen op *gevuld/leeg* getoetst, nooit op waarde gerankt of vergeleken (regel 2).

## Werkwijze (verplicht, in deze volgorde)

1. **Probleem/opdracht uitschrijven** in eigen woorden (kort document of sectie): wat is
   "ons format" exact, welke faalvormen bestaan er, wat is de module-API. Nog geen code.
2. **Plan met 2 agents** (onafhankelijk laten plannen, dan synthese): module-API,
   bestandsnamen, testlijst, edge-cases. Nooit direct bouwen.
3. **Bouwen** volgens het plan, kleine commits op main, pushen (= preview-deploy).

### Definition of Done (onverkort uit het supplement)

- [ ] `bun vitest run` groen. *(RSC-screenshottests licht/donker gelden voor gewijzigde
  schermen — 1.1 heeft geen scherm; raak je tóch UI aan, dan gelden ze.)*
- [ ] `bunx tsc --noEmit` schoon.
- [ ] Gecommit én gepusht naar GitHub.
- [ ] Gedeployed + handmatig live geverifieerd. *(Voor een lib zonder aanroepers is de
  zinvolle verificatie: de deploy slaagt en bestaande schermen — template-download,
  /data/brand-relations — werken nog.)* **Stop vóór elke productie-deploy en vraag Timo's
  akkoord.**
- [ ] `HANDOVER.md` bijgewerkt (eigen sectie: wat, aannames, open punten).
- [ ] Events: 1.1 voegt geen runtime-gedrag toe (pure functie, nog niet aangesloten) —
  **geen events nodig**; die komen in 1.2 op het upload-pad. Benoem dit expliciet in je
  HANDOVER-sectie zodat het geen vergeten checkbox lijkt.

## Rapportage terug aan de sprintmaster

Lever aan het eind een korte rapportage met: bestandspaden van module + tests ·
testnamen/aantallen · commit-SHA's · de gemaakte ontwerpkeuzes (m.n. kaderpunt 3) ·
wat bewust níét gedaan is. De sprintmaster verifieert claims zelf (code lezen, tests
draaien) vóór 1.1 wordt afgevinkt — schrijf dus niets op dat niet te reproduceren is.
